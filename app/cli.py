"""walk: operator commands.

  walk seed-demo                         offline Bratislava fixture
  walk seed-city vienna --name Vienna ...  real POIs + facts from Wikidata/Wikipedia
  walk tour --city bratislava ...        request a tour, as POST /tours would
  walk prewarm --city bratislava --budget-usd 5
  walk worker [--once]                   process the generation queue
  walk costs                             spend, hit ratio, cost per request/tour
"""

import json
import logging
import os
import time
from decimal import Decimal
from typing import Annotated

import typer
from sqlalchemy import select

from app.budget import BudgetExceeded
from app.config import get_settings
from app.db import session_factory, session_scope
from app.models import City
from app.reports import cost_report

cli = typer.Typer(no_args_is_help=True, add_completion=False)


def _providers():
    from app.providers import build_providers

    return build_providers(get_settings())


def _city(session, slug: str) -> City:
    city = session.scalars(select(City).where(City.slug == slug)).first()
    if city is None:
        raise typer.BadParameter(f"no city '{slug}'. Seed it first.")
    return city


def _worker(providers=None):
    from app.pipeline.worker import Worker
    from app.storage import get_storage

    return Worker(session_factory(), providers or _providers(), get_storage(), get_settings())


@cli.command("storage-init")
def storage_init() -> None:
    """Create the audio bucket if it does not exist (MinIO; R2 buckets are made in the dashboard)."""
    from app.storage import get_storage

    get_storage().ensure_bucket()
    typer.echo("bucket ready")


@cli.command("seed-demo")
def seed_demo() -> None:
    """Seed the offline Bratislava fixture (8 POIs, hand-checked facts, lexicon)."""
    from app.ingest.demo import seed_demo as seed

    with session_scope() as session:
        city = seed(session)
        typer.echo(f"seeded {city.name} (city id {city.id})")


@cli.command("seed-city")
def seed_city(
    slug: str,
    name: Annotated[str, typer.Option(help="Display name")],
    country: Annotated[str, typer.Option(help="ISO 3166-1 alpha-2")],
    local_language: Annotated[str, typer.Option(help="Wikipedia edition, e.g. de, sk")],
    bbox: Annotated[str, typer.Option(help="min_lat,min_lng,max_lat,max_lng")],
    limit: int = 60,
    min_sitelinks: int = 5,
) -> None:
    """Fetch POIs and grounding facts from Wikidata/Wikipedia. Re-running refreshes facts;
    POIs whose sources changed become stale and are picked up by prewarm."""
    from sqlalchemy.dialects.postgresql import insert

    from app.ingest.wikimedia import Wikimedia
    from app.ingest.wikimedia import seed_city as seed

    contact = os.environ.get("WIKIMEDIA_CONTACT", "")
    min_lat, min_lng, max_lat, max_lng = map(float, bbox.split(","))
    with session_scope() as session:
        session.execute(insert(City).values(
            slug=slug, name=name, country_code=country.upper(), local_language=local_language,
            min_lat=min_lat, min_lng=min_lng, max_lat=max_lat, max_lng=max_lng,
            centroid_lat=(min_lat + max_lat) / 2, centroid_lng=(min_lng + max_lng) / 2, status="active",
        ).on_conflict_do_nothing(index_elements=["slug"]))
        city = _city(session, slug)
        stats = seed(session, Wikimedia(contact), city, limit=limit, min_sitelinks=min_sitelinks, log=typer.echo)
    typer.echo(json.dumps(stats))


@cli.command()
def tour(
    city: Annotated[str, typer.Option(help="City slug")],
    theme: str = "highlights",
    language: str = "en",
    persona: str = "storyteller",
    depth: str = "full",
    minutes: int = 60,
) -> None:
    """Request a tour exactly as POST /tours does, and print the cache outcome."""
    from app.tours.resolve import TourParams, resolve_tour

    settings = get_settings()
    with session_scope() as session:
        params = TourParams(city_id=_city(session, city).id, theme=theme, language=language, persona=persona,
                            depth_level=depth, duration_min=minutes)
        try:
            r = resolve_tour(session, params, _providers(), settings)
        except BudgetExceeded as exc:
            typer.echo(f"refused: {exc}", err=True)
            raise typer.Exit(1) from exc
        typer.echo(f"tour {r.tour.id}: {r.tour.status}, {r.request.segments_hit}/{r.request.segments_total} "
                   f"segments from cache ({r.hit_ratio:.0%}), ${r.reserved_usd} reserved for the misses"
                   + (" [existing tour]" if r.reused_tour else ""))


@cli.command()
def prewarm(
    city: Annotated[str, typer.Option(help="City slug")],
    budget_usd: Annotated[str, typer.Option(help="Hard cap for this run, in USD, e.g. 5.00")],
    top_n: int = 25,
    tours: Annotated[bool, typer.Option(help="Also build one ready-made tour per theme")] = True,
    dry_run: bool = False,
    run: Annotated[bool, typer.Option(help="Process the queue afterwards (fake providers finish at once)")] = False,
) -> None:
    """Generate the highest-value missing segments for a city without exceeding the cap."""
    from app.prewarm import prewarm as plan

    try:
        cap = Decimal(budget_usd)
    except ArithmeticError as exc:
        raise typer.BadParameter("budget must be a number, e.g. 5.00") from exc
    providers = _providers()
    with session_scope() as session:
        report = plan(session, get_settings(), providers, city_id=_city(session, city).id,
                      budget_usd=cap, top_n=top_n, with_tours=tours, dry_run=dry_run)
    for line in report.tours:
        typer.echo(f"tour  {line}")
    for c in report.queued:
        typer.echo(f"queue poi {c.poi_id:>4} {c.language} {c.persona:<11} {c.depth_level:<5} "
                   f"${c.cost:<9} value {c.value:.2f} ({c.reason})")
    typer.echo(f"{'planned' if dry_run else 'reserved'} ${report.reserved_usd} of ${report.cap_usd} cap; "
               f"{len(report.queued)} segments queued, {len(report.skipped_over_budget)} left for a bigger budget")
    if run and not dry_run:
        _worker(providers).drain()
        typer.echo("queue processed; see `walk costs`")


@cli.command()
def worker(once: bool = False, interval: float = 30.0) -> None:
    """Process the queue. Batches are polled every `interval` seconds until done."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    w = _worker()
    while True:
        stats = w.run_once()
        if any(stats.values()):
            logging.info("worker: %s", stats)
        if once:
            return
        time.sleep(interval)


@cli.command()
def costs(days: int = 30, as_json: Annotated[bool, typer.Option("--json")] = False) -> None:
    """Spend by day/model, cache-hit ratio, and what misses cost per request and tour."""
    with session_scope() as session:
        report = cost_report(session, days=days)
    if as_json:
        typer.echo(json.dumps(report, default=str, indent=2))
        return
    typer.echo(f"Total spend, last {days} days: ${report['total_cost_usd']}")
    for r in report["spend_by_day"]:
        typer.echo(f"  {r['day']}  {r['provider']:<17} {r['model']:<22} {r['tier']:<8} {r['operation']:<10} "
                   f"{r['calls']:>4} calls  ${r['cost_usd']}")
    c = report["cache"]
    typer.echo(f"Cache: {c['segments_hit']}/{c['segments_total']} segments served from cache "
               f"across {c['requests']} requests (hit ratio {c['hit_ratio']})")
    typer.echo("Recent requests:")
    for r in report["recent_requests"]:
        typer.echo(f"  request {r['request_id']:>4} -> tour {r['tour_id']}: {r['segments_hit']}/{r['segments_total']} hits, "
                   f"misses cost ${r['miss_cost_usd']}")
    typer.echo("Tours (content cost, whoever paid):")
    for t in report["tours"]:
        typer.echo(f"  tour {t['tour_id']:>4} {t['theme']:<12} {t['language']} {t['persona']:<11} {t['depth_level']:<5} "
                   f"{t['status']:<7} {t['stops']} stops  ${t['content_cost_usd']}"
                   + ("  [pre-made]" if t["is_prewarmed"] else ""))


def main() -> None:
    cli()


if __name__ == "__main__":
    main()
