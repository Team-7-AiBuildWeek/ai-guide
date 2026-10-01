"""Cost and cache reporting, shared by GET /admin/costs and `walk costs`."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.orm import Session


def _rows(session: Session, sql: str, **params) -> list[dict]:
    return [dict(r._mapping) for r in session.execute(text(sql), params)]


def cost_report(session: Session, days: int = 30, recent: int = 20) -> dict:
    since = datetime.now(UTC) - timedelta(days=days)
    by_day = _rows(session, """
        SELECT date(created_at) AS day, provider, model, tier, operation,
               count(*) AS calls, sum(cost_usd) AS cost_usd
        FROM cost_ledger WHERE created_at >= :since
        GROUP BY 1, 2, 3, 4, 5 ORDER BY 1 DESC, cost_usd DESC
    """, since=since)
    cache = _rows(session, """
        SELECT count(*) AS requests,
               coalesce(sum(segments_total), 0) AS segments_total,
               coalesce(sum(segments_hit), 0) AS segments_hit
        FROM tour_requests WHERE created_at >= :since
    """, since=since)[0]
    total = cache["segments_total"]
    cache["hit_ratio"] = round(cache["segments_hit"] / total, 4) if total else None
    # What each request's misses actually cost: spend charged to this request's budget for
    # the scripts and audio it missed. (A prewarm budget funds several tours, so the
    # budget alone is not enough to attribute spend.)
    requests = _rows(session, """
        SELECT r.id AS request_id, r.tour_id, r.created_at, r.segments_hit, r.segments_total,
               round(r.segments_hit::numeric / nullif(r.segments_total, 0), 4) AS hit_ratio,
               coalesce((
                   SELECT sum(cl.cost_usd) FROM cost_ledger cl
                   WHERE cl.budget_id = r.budget_id
                     AND (cl.script_id IN (SELECT ri.script_id FROM request_items ri
                                           WHERE ri.tour_request_id = r.id AND NOT ri.was_hit)
                          OR cl.segment_id IN (SELECT sg.id FROM segments sg JOIN request_items ri
                                               ON ri.script_id = sg.script_id
                                               WHERE ri.tour_request_id = r.id AND NOT ri.was_hit))
               ), 0) AS miss_cost_usd
        FROM tour_requests r WHERE r.created_at >= :since ORDER BY r.id DESC LIMIT :recent
    """, since=since, recent=recent)
    # What the content in each tour cost to make, whoever paid for it.
    tours = _rows(session, """
        SELECT t.id AS tour_id, t.theme, t.language, t.persona, t.depth_level, t.status, t.is_prewarmed,
               count(ts.position) AS stops,
               coalesce((SELECT sum(cl.cost_usd) FROM cost_ledger cl
                         WHERE cl.script_id IN (SELECT script_id FROM tour_stops WHERE tour_id = t.id)
                            OR cl.segment_id IN (SELECT segment_id FROM tour_stops WHERE tour_id = t.id)), 0)
                 AS content_cost_usd
        FROM tours t JOIN tour_stops ts ON ts.tour_id = t.id
        GROUP BY t.id ORDER BY t.id DESC LIMIT :recent
    """, recent=recent)
    budgets = _rows(session, """
        SELECT id, scope, label, cap_usd, reserved_usd, spent_usd, overrun_usd
        FROM budgets WHERE created_at >= :since OR overrun_usd > 0 ORDER BY id DESC LIMIT :recent
    """, since=since, recent=recent)
    total_spend = sum((r["cost_usd"] for r in by_day), Decimal(0))
    return {"days": days, "total_cost_usd": total_spend, "spend_by_day": by_day, "cache": cache,
            "recent_requests": requests, "tours": tours, "budgets": budgets}
