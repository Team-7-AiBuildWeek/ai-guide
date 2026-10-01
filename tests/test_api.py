import pytest
from fastapi.testclient import TestClient

from app.api.main import app


@pytest.fixture
def client(sessions, providers, storage, settings):
    app.state.settings, app.state.sessions = settings, sessions
    app.state.providers, app.state.storage = providers, storage
    with TestClient(app) as c:
        yield c
    for name in ("settings", "sessions", "providers", "storage"):
        delattr(app.state, name)


def test_cities(client, city):
    (only,) = client.get("/cities").json()
    assert only["slug"] == "bratislava" and len(only["bbox"]) == 4


def test_custom_tour_flow_and_offline_bundle(client, city, worker):
    first = client.post("/tours", json={"city_id": city.id, "duration_min": 45})
    assert first.status_code == 202
    body = first.json()
    assert body["status"] == "pending" and body["cache"]["hit_ratio"] == 0
    assert client.get(body["bundle_url"]).status_code == 409

    worker.drain()
    assert client.get(f"/tours/{body['tour_id']}").json()["status"] == "ready"
    bundle = client.get(body["bundle_url"]).json()
    stops = bundle["stops"]
    assert [s["position"] for s in stops] == list(range(len(stops)))
    for stop in stops:
        assert {"lat", "lng", "trigger_radius_m", "transcript", "sources", "walk_to_next"} <= stop.keys()
        assert stop["audio"]["url"].startswith("https://storage.test/audio/")
        assert stop["audio"]["duration_ms"] > 0 and stop["transcript"]
        assert stop["sources"] and stop["sources"][0]["url"].startswith("demo://")
    assert all(s["walk_to_next"]["polyline"] for s in stops[:-1]) and stops[-1]["walk_to_next"] is None
    assert bundle["tour"]["route"]["type"] == "LineString"

    again = client.post("/tours", json={"city_id": city.id, "duration_min": 45})
    assert again.status_code == 200 and again.json()["cache"]["hit_ratio"] == 1


def test_no_secret_reaches_the_client(client, city, worker, settings):
    tour = client.post("/tours", json={"city_id": city.id, "duration_min": 20}).json()
    worker.drain()
    raw = client.get(tour["bundle_url"]).text
    for secret in filter(None, (settings.gemini_api_key, settings.s3_secret_access_key, settings.admin_token)):
        assert secret not in raw


def test_premade_tours_are_the_fast_path(client, city, sessions, providers, settings, worker):
    from decimal import Decimal
    from app.prewarm import prewarm
    with sessions.begin() as session:
        prewarm(session, settings, providers, city_id=city.id, budget_usd=Decimal("3"), top_n=0)
    worker.drain()
    premade = client.get(f"/cities/{city.id}/tours").json()
    assert {t["theme"] for t in premade} >= {"highlights", "history"}
    assert all(t["stops"] > 0 and t["total_duration_ms"] > 0 for t in premade)


def test_validation_and_unknown_city(client, city):
    assert client.post("/tours", json={"city_id": city.id, "persona": "pirate"}).status_code == 422
    assert client.post("/tours", json={"city_id": 999}).status_code == 404


def test_budget_refusal_is_a_429_and_writes_nothing(client, city, sessions, settings):
    from datetime import UTC, datetime
    from sqlalchemy import text
    with sessions.begin() as session:
        session.execute(text("INSERT INTO budgets (scope, label, day, cap_usd, spent_usd) VALUES "
                             "('daily', 'today', :d, :c, :c)"), {"d": datetime.now(UTC).date(), "c": settings.daily_budget_usd})
    response = client.post("/tours", json={"city_id": city.id, "duration_min": 30})
    assert response.status_code == 429
    with sessions() as session:
        assert session.scalar(text("SELECT count(*) FROM tours")) == 0


def test_admin_costs_needs_the_token(client, city, worker):
    client.post("/tours", json={"city_id": city.id, "duration_min": 20})
    worker.drain()
    assert client.get("/admin/costs").status_code == 403
    report = client.get("/admin/costs", headers={"X-Admin-Token": "test-admin"}).json()
    assert report["cache"]["requests"] == 1
    assert float(report["total_cost_usd"]) > 0
    assert {r["operation"] for r in report["spend_by_day"]} == {"draft", "check", "tts"}
