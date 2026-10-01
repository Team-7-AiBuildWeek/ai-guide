"""The endpoints the web app relies on."""

import time

import pytest
from fastapi.testclient import TestClient

from app.api.main import app
from app.providers.routing import haversine_m
from app.storage import LocalStorage
from app.tours.select import start_radius_m


@pytest.fixture
def client(sessions, providers, storage, settings):
    app.state.settings, app.state.sessions = settings, sessions
    app.state.providers, app.state.storage = providers, storage
    with TestClient(app) as c:
        yield c
    for name in ("settings", "sessions", "providers", "storage"):
        delattr(app.state, name)


MAIN_SQUARE = (48.1434, 17.1086)
FAR_EAST = (48.1436, 17.1162)  # by the Blue Church


def test_meta_lists_what_the_backend_can_narrate(client):
    meta = client.get("/meta").json()
    assert meta["languages"] == ["de", "en", "sk"]
    assert "highlights" in meta["themes"] and "full" in meta["depths"]


def test_partial_bundle_while_generating_then_complete(client, city, worker):
    tour = client.post("/tours", json={"city_id": city.id, "duration_min": 30}).json()
    assert client.get(tour["bundle_url"]).status_code == 409
    partial = client.get(tour["bundle_url"], params={"partial": True}).json()
    assert partial["status"] == "pending"
    assert all(s["audio"] is None and s["transcript"] is None for s in partial["stops"])
    worker.drain()
    done = client.get(tour["bundle_url"], params={"partial": True}).json()
    assert done["status"] == "ready" and all(s["audio"] and s["transcript"] for s in done["stops"])


def test_segment_can_be_re_signed_by_id(client, city, worker):
    tour = client.post("/tours", json={"city_id": city.id, "duration_min": 20}).json()
    worker.drain()
    stop = client.get(tour["bundle_url"]).json()["stops"][0]
    again = client.get(f"/segments/{stop['audio']['id']}").json()
    assert again["url"] and again["duration_ms"] == stop["audio"]["duration_ms"]
    assert again["transcript"] == stop["transcript"]
    assert client.get("/segments/nope").status_code == 404


def test_tour_starts_near_the_walker(client, city):
    near_square = client.post("/tours", json={"city_id": city.id, "duration_min": 30,
                                              "start_lat": FAR_EAST[0], "start_lng": FAR_EAST[1]}).json()
    stops = client.get(f"/tours/{near_square['tour_id']}").json()["stops"]
    first = (stops[0]["lat"], stops[0]["lng"])
    others = [(s["lat"], s["lng"]) for s in stops]
    assert haversine_m(FAR_EAST, first) == min(haversine_m(FAR_EAST, p) for p in others)
    rounded = (round(FAR_EAST[0], 3), round(FAR_EAST[1], 3))  # starts are rounded to ~100 m
    assert all(haversine_m(rounded, p) <= start_radius_m(30, 1.2) for p in others)


def test_nearby_walkers_share_a_tour_and_distant_ones_do_not(client, city):
    a = client.post("/tours", json={"city_id": city.id, "start_lat": 48.14341, "start_lng": 17.10862}).json()
    b = client.post("/tours", json={"city_id": city.id, "start_lat": 48.14338, "start_lng": 17.10858}).json()
    c = client.post("/tours", json={"city_id": city.id, "start_lat": FAR_EAST[0], "start_lng": FAR_EAST[1]}).json()
    assert a["tour_id"] == b["tour_id"] != c["tour_id"]


def test_half_a_start_point_is_rejected(client, city):
    assert client.post("/tours", json={"city_id": city.id, "start_lat": 48.14}).status_code == 422


def test_local_files_are_served_only_with_a_valid_signature(tmp_path, client, city, worker, sessions, providers, settings):
    local = LocalStorage(root=str(tmp_path), base_url="http://testserver", secret="s", ttl=60)
    app.state.storage = local
    worker.storage = local
    tour = client.post("/tours", json={"city_id": city.id, "duration_min": 20}).json()
    worker.drain()
    url = client.get(tour["bundle_url"]).json()["stops"][0]["audio"]["url"]
    ok = client.get(url.removeprefix("http://testserver"))
    assert ok.status_code == 200 and ok.headers["content-type"] == "audio/mpeg" and len(ok.content) > 1000
    tampered = url.replace("sig=", "sig=0")
    assert client.get(tampered.removeprefix("http://testserver")).status_code == 403
    key = url.split("/files/")[1].split("?")[0]
    expired = int(time.time()) - 1
    assert client.get(f"/files/{key}", params={"expires": expired, "sig": local._signature(key, expired)}).status_code == 403
    sig = local._signature("../../etc/passwd", 2**31)
    assert client.get("/files/../../etc/passwd", params={"expires": 2**31, "sig": sig}).status_code in (403, 404)
