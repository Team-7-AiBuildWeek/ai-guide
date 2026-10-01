"""Seeding a city from Wikidata (CC0) and Wikipedia (CC BY-SA 4.0).

Wikidata is the POI list as well as a fact source: a place with no Wikidata item and no
Wikipedia article has nothing for us to narrate, so starting there avoids matching
thousands of Overture places we would discard anyway.

Popularity = 12-month median of monthly Wikipedia pageviews (English + the city's local
edition, which is what visitors and locals actually read) plus a smaller sitelink term.
Sitelinks alone overrate obscure items that happen to be translated widely.
"""

import math
import statistics
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from urllib.parse import quote

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.ingest.store import upsert_fact
from app.models import City, Poi
from app.pipeline.content import refresh_facts_hash

SPARQL = "https://query.wikidata.org/sparql"
MAX_ARTICLE_CHARS = 8000

# Instance-of labels that are areas or infrastructure, not places to stand in front of.
EXCLUDE = ("city", "capital", "district", "borough", "municipality", "neighbourhood", "neighborhood",
           "cadastral", "settlement", "river", "island", "railway", "station", "stop", "road", "highway",
           "region", "quarter", "urban area", "park", "constituency", "country", "company", "school",
           "university", "embassy", "hotel", "hospital", "office", "business", "organization",
           "destroyed", "academy", "faculty", "ministry")

TAG_RULES = {
    "church": ("church", "cathedral", "basilica", "chapel", "synagogue", "monastery"),
    "castle": ("castle", "fortress", "fortification", "city gate", "gate"),
    "palace": ("palace", "mansion", "villa"),
    "museum": ("museum",),
    "gallery": ("gallery",),
    "monument": ("monument", "memorial", "statue", "sculpture", "fountain", "column"),
    "theatre": ("theatre", "theater", "opera"),
    "bridge": ("bridge",),
    "building": ("building", "house", "tower", "hall", "rathaus"),
    "square": ("square", "plaza"),
    "market": ("market",),
}
DERIVED = {
    "architecture": {"church", "castle", "palace", "bridge", "building"},
    "history": {"castle", "church", "monument", "museum", "palace", "square"},
    "art": {"museum", "gallery", "theatre", "monument"},
}


@dataclass
class Place:
    qid: str
    name: str
    local_name: str | None
    lat: float
    lng: float
    sitelinks: int
    instances: set[str] = field(default_factory=set)
    en_title: str | None = None
    local_title: str | None = None
    description: str | None = None


class Wikimedia:
    def __init__(self, contact: str, client: httpx.Client | None = None):
        if not contact:
            raise ValueError("Wikimedia requires a contact in the User-Agent; set WIKIMEDIA_CONTACT")
        self.http = client or httpx.Client(timeout=60, headers={"User-Agent": f"walk-backend/0.1 ({contact})"})

    def _get(self, url: str, **params) -> dict:
        for attempt in range(4):
            response = self.http.get(url, params=params)
            if response.status_code in (429, 503):
                time.sleep(2 ** attempt)
                continue
            response.raise_for_status()
            return response.json()
        response.raise_for_status()
        return {}

    def places_in_bbox(self, city: City, min_sitelinks: int, limit: int) -> list[Place]:
        lang = city.local_language
        query = f"""
        SELECT ?item ?itemLabel ?localLabel ?coord ?sitelinks ?instanceLabel ?enTitle ?localTitle ?desc WHERE {{
          SERVICE wikibase:box {{
            ?item wdt:P625 ?coord .
            bd:serviceParam wikibase:cornerSouthWest "Point({city.min_lng} {city.min_lat})"^^geo:wktLiteral .
            bd:serviceParam wikibase:cornerNorthEast "Point({city.max_lng} {city.max_lat})"^^geo:wktLiteral .
          }}
          ?item wikibase:sitelinks ?sitelinks .
          FILTER(?sitelinks >= {min_sitelinks})
          OPTIONAL {{ ?item wdt:P31 ?instance . }}
          OPTIONAL {{ ?item rdfs:label ?localLabel . FILTER(LANG(?localLabel) = "{lang}") }}
          OPTIONAL {{ ?item schema:description ?desc . FILTER(LANG(?desc) = "en") }}
          OPTIONAL {{ ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?enTitle . }}
          OPTIONAL {{ ?lo schema:about ?item ; schema:isPartOf <https://{lang}.wikipedia.org/> ; schema:name ?localTitle . }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en,{lang}". }}
        }}
        ORDER BY DESC(?sitelinks) LIMIT {limit * 8}
        """
        rows = self._get(SPARQL, query=query, format="json")["results"]["bindings"]
        places: dict[str, Place] = {}
        for row in rows:
            qid = row["item"]["value"].rsplit("/", 1)[-1]
            lng, lat = map(float, row["coord"]["value"].removeprefix("Point(").rstrip(")").split())
            place = places.setdefault(qid, Place(
                qid=qid, name=row["itemLabel"]["value"], local_name=row.get("localLabel", {}).get("value"),
                lat=lat, lng=lng, sitelinks=int(row["sitelinks"]["value"]),
                en_title=row.get("enTitle", {}).get("value"), local_title=row.get("localTitle", {}).get("value"),
                description=row.get("desc", {}).get("value")))
            if "instanceLabel" in row:
                place.instances.add(row["instanceLabel"]["value"].lower())
        # Keep only things a walker can stand in front of: a recognised place type, an
        # article to ground the narration, and nothing that is really an area or an event.
        keep = [p for p in places.values()
                if (p.en_title or p.local_title) and p.name != p.qid and tags_for(p.instances)
                and not any(word in inst for inst in p.instances for word in EXCLUDE)]
        return keep[:limit]

    def article(self, lang: str, title: str) -> tuple[str, str] | None:
        """(plain text, revision id) of a Wikipedia article, truncated."""
        data = self._get(f"https://{lang}.wikipedia.org/w/api.php", action="query", prop="extracts|revisions",
                         explaintext=1, exsectionformat="plain", rvprop="ids", titles=title,
                         redirects=1, format="json", formatversion=2)
        pages = data.get("query", {}).get("pages", [])
        if not pages or "missing" in pages[0]:
            return None
        text = (pages[0].get("extract") or "").strip()
        for cut in ("\nSee also\n", "\nReferences\n", "\nExternal links\n", "\nLiteratúra\n", "\nReferencie\n"):
            text = text.split(cut)[0]
        revision = str(pages[0].get("revisions", [{}])[0].get("revid", ""))
        return (text[:MAX_ARTICLE_CHARS], revision) if text else None

    def median_monthly_views(self, lang: str, title: str) -> float:
        end = datetime.now(UTC).replace(day=1)
        start = end.replace(year=end.year - 1)
        url = ("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
               f"{lang}.wikipedia/all-access/user/{quote(title.replace(' ', '_'), safe='')}/monthly/"
               f"{start:%Y%m%d}00/{end:%Y%m%d}00")
        try:
            items = self._get(url).get("items", [])
        except httpx.HTTPStatusError:
            return 0.0
        return statistics.median(i["views"] for i in items) if items else 0.0


def tags_for(instances: set[str]) -> list[str]:
    tags = {tag for tag, words in TAG_RULES.items() if any(w in inst for inst in instances for w in words)}
    tags |= {derived for derived, sources in DERIVED.items() if tags & sources}
    return sorted(tags)


def popularity(views: float, sitelinks: int) -> float:
    return round(math.log10(1 + views) * 0.8 + math.log10(1 + sitelinks) * 0.2, 4)


def seed_city(session: Session, wiki: Wikimedia, city: City, *, limit: int = 60, min_sitelinks: int = 5,
              log=print) -> dict[str, int]:
    stats = {"places": 0, "facts_changed": 0, "stale_pois": 0}
    for place in wiki.places_in_bbox(city, min_sitelinks, limit):
        session.execute(insert(Poi).values(
            city_id=city.id, name=place.name, local_name=place.local_name, lat=place.lat, lng=place.lng,
            wikidata_qid=place.qid, category=next(iter(sorted(place.instances)), None),
            tags=tags_for(place.instances),
            trigger_radius_m=80 if {"castle", "palace"} & set(tags_for(place.instances)) else 40,
        ).on_conflict_do_nothing(index_elements=["wikidata_qid"]))
        poi = session.scalars(select(Poi).where(Poi.wikidata_qid == place.qid)).one()
        old_hash = poi.facts_hash

        changed = upsert_fact(
            session, poi.id, source_type="wikidata", source_url=f"https://www.wikidata.org/wiki/{place.qid}",
            license="CC0-1.0", language="en",
            content="\n".join(filter(None, [
                f"Name: {place.name}", place.local_name and f"Local name: {place.local_name}",
                place.description and f"Description: {place.description}",
                place.instances and f"Instance of: {', '.join(sorted(place.instances))}",
            ])))
        views = 0.0
        for lang, title in (("en", place.en_title), (city.local_language, place.local_title)):
            if not title:
                continue
            article = wiki.article(lang, title)
            if article:
                changed |= upsert_fact(
                    session, poi.id, source_type="wikipedia",
                    source_url=f"https://{lang}.wikipedia.org/wiki/{quote(title.replace(' ', '_'))}",
                    license="CC-BY-SA-4.0", language=lang, content=article[0], source_revision=article[1])
            views += wiki.median_monthly_views(lang, title)
        poi.popularity_score = popularity(views, place.sitelinks)
        new_hash = refresh_facts_hash(session, poi)
        stats["places"] += 1
        stats["facts_changed"] += changed
        stats["stale_pois"] += bool(old_hash and old_hash != new_hash)
        log(f"  {place.name} ({place.qid}): popularity {poi.popularity_score}, tags {poi.tags}"
            + (" [facts changed]" if old_hash and old_hash != new_hash else ""))
        session.flush()
    return stats
