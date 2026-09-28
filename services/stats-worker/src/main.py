from __future__ import annotations

import json
from urllib.parse import urlparse

from workers import Response, WorkerEntrypoint

from stats import harmonise_append, profile_csv, run_analysis


def json_response(payload, status=200):
    return Response(
        json.dumps(payload, allow_nan=False),
        status=status,
        headers={"content-type": "application/json; charset=utf-8"},
    )


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        path = urlparse(request.url).path

        if request.method == "GET" and path == "/health":
            return json_response(
                {
                    "service": "methodome-stats",
                    "status": "ok",
                    "engine": "python",
                }
            )

        if request.method != "POST":
            return json_response(
                {"detail": f"Method {request.method} is not allowed."},
                status=405,
            )

        try:
            payload = await request.json()

            if path == "/profile":
                csv_text = payload.get("csv")
                if not isinstance(csv_text, str):
                    raise ValueError("csv is required.")
                return json_response(profile_csv(csv_text))

            if path == "/harmonise/append":
                return json_response(harmonise_append(payload))

            if path == "/run":
                return json_response(run_analysis(payload))

            return json_response(
                {"detail": "Route was not found."},
                status=404,
            )
        except ValueError as exc:
            return json_response(
                {"detail": str(exc)},
                status=400,
            )
        except Exception as exc:
            print(f"Statistics request failed: {exc}")
            return json_response(
                {"detail": "Statistical execution failed."},
                status=500,
            )
