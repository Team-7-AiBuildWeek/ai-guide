"""Our own stop ordering: nearest neighbour from the start, then 2-opt on the open path.
Deliberately not derived from any published itinerary."""

from app.providers.routing import haversine_m

Point = tuple[float, float]
DETOUR = 1.3  # straight line -> walking distance, for planning only


def path_length(points: list[Point]) -> float:
    return sum(haversine_m(a, b) for a, b in zip(points, points[1:])) * DETOUR


def order_stops(points: list[Point], start_index: int = 0) -> list[int]:
    """Indices of `points` in walking order, beginning at start_index."""
    if len(points) <= 2:
        return [start_index] + [i for i in range(len(points)) if i != start_index]
    remaining = set(range(len(points))) - {start_index}
    route = [start_index]
    while remaining:
        last = points[route[-1]]
        nearest = min(remaining, key=lambda i: haversine_m(last, points[i]))
        route.append(nearest)
        remaining.remove(nearest)
    improved = True
    while improved:
        improved = False
        for i in range(1, len(route) - 1):
            for j in range(i + 1, len(route)):
                candidate = route[:i] + route[i:j + 1][::-1] + route[j + 1:]
                if path_length([points[k] for k in candidate]) + 1e-6 < path_length([points[k] for k in route]):
                    route, improved = candidate, True
    return route
