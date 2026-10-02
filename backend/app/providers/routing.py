"""Walking legs between two stops. Legs are cached per (from, to, provider, language),
so like segments they are fetched once and shared by every tour that walks them."""

import math
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx


@dataclass(frozen=True)
class Leg:
    distance_m: int
    duration_s: int
    polyline: str
    instructions: list[dict[str, Any]] = field(default_factory=list)


class RoutingProvider(Protocol):
    name: str

    def walk(self, start: tuple[float, float], end: tuple[float, float], language: str) -> Leg: ...


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lng1, lat2, lng2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(h))


def encode_polyline(points: list[tuple[float, float]], precision: int = 5) -> str:
    factor, out, prev = 10 ** precision, [], (0, 0)
    for lat, lng in points:
        cur = (round(lat * factor), round(lng * factor))
        for delta in (cur[0] - prev[0], cur[1] - prev[1]):
            value = ~(delta << 1) if delta < 0 else delta << 1
            while value >= 0x20:
                out.append(chr((0x20 | (value & 0x1F)) + 63))
                value >>= 5
            out.append(chr(value + 63))
        prev = cur
    return "".join(out)


def decode_polyline(encoded: str, precision: int = 5) -> list[tuple[float, float]]:
    factor, points, index, lat, lng = 10 ** precision, [], 0, 0, 0
    while index < len(encoded):
        deltas = []
        for _ in range(2):
            shift = result = 0
            while True:
                byte = ord(encoded[index]) - 63
                index += 1
                result |= (byte & 0x1F) << shift
                shift += 5
                if byte < 0x20:
                    break
            deltas.append(~(result >> 1) if result & 1 else result >> 1)
        lat, lng = lat + deltas[0], lng + deltas[1]
        points.append((lat / factor, lng / factor))
    return points


class OpenRouteServiceProvider:
    """OpenRouteService foot-walking. Free tier; no ledger row because no spend."""

    name = "ors"
    url = "https://api.openrouteservice.org/v2/directions/foot-walking"
    languages = {"en", "de", "cs", "es", "fr", "it", "nl", "pl", "pt", "ru", "sk"}  # sk falls back below if rejected

    def __init__(self, api_key: str, client: httpx.Client | None = None):
        self.api_key = api_key
        self.http = client or httpx.Client(timeout=20)

    def walk(self, start: tuple[float, float], end: tuple[float, float], language: str) -> Leg:
        body = {
            "coordinates": [[start[1], start[0]], [end[1], end[0]]],
            "instructions": True,
            "language": language if language in self.languages else "en",
        }
        response = self.http.post(self.url, json=body, headers={"Authorization": self.api_key})
        if response.status_code == 400 and body["language"] != "en":
            body["language"] = "en"
            response = self.http.post(self.url, json=body, headers={"Authorization": self.api_key})
        response.raise_for_status()
        route = response.json()["routes"][0]
        steps = [
            {"text": s["instruction"], "distance_m": round(s["distance"]), "duration_s": round(s["duration"]),
             "street": s.get("name") or None}
            for segment in route.get("segments", []) for s in segment.get("steps", [])
        ]
        return Leg(distance_m=round(route["summary"].get("distance", 0)),
                   duration_s=round(route["summary"].get("duration", 0)),
                   polyline=route["geometry"], instructions=steps)


class FakeRoutingProvider:
    """Straight line with a detour factor. Good enough for tests and offline demos."""

    name = "fake-routing"

    def __init__(self, speed_m_s: float = 1.2):
        self.speed = speed_m_s
        self.calls = 0

    def walk(self, start: tuple[float, float], end: tuple[float, float], language: str) -> Leg:
        self.calls += 1
        distance = round(haversine_m(start, end) * 1.3)
        return Leg(distance_m=distance, duration_s=round(distance / self.speed),
                   polyline=encode_polyline([start, end]),
                   instructions=[{"text": "Walk to the next stop", "distance_m": distance,
                                  "duration_s": round(distance / self.speed), "street": None}])


class StraightLineRoutingProvider(FakeRoutingProvider):
    """The same estimate, for production use without a routing key. Good enough for
    planning how many stops fit; the web app draws real walking directions itself."""

    name = "straight-line"
