from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from stats import run_analysis


class PermanentAnalysisError(Exception):
    """An analysis job cannot succeed by retrying the same input."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def make_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def to_python(value: Any) -> Any:
    if value is None:
        return None
    converter = getattr(value, "to_py", None)
    if callable(converter):
        return converter()
    return value


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def audit_hash(event: dict[str, Any], previous_hash: str | None) -> str:
    payload = {
        "previousHash": previous_hash,
        "event": event,
    }
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


async def first_row(db: Any, sql: str, *bindings: Any) -> dict[str, Any] | None:
    statement = db.prepare(sql)
    if bindings:
        statement = statement.bind(*bindings)
    row = await statement.first()
    converted = to_python(row)
    if converted is None:
        return None
    if not isinstance(converted, dict):
        try:
            converted = dict(converted)
        except Exception as exc:
            raise RuntimeError("D1 returned an unexpected row shape.") from exc
    return converted


async def run_statement(db: Any, sql: str, *bindings: Any) -> None:
    statement = db.prepare(sql)
    if bindings:
        statement = statement.bind(*bindings)
    await statement.run()


async def mark_state(
    db: Any,
    job_id: str,
    state: str,
    *,
    started_at: str | None = None,
    completed_at: str | None = None,
) -> None:
    await run_statement(
        db,
        """UPDATE analysis_jobs
           SET state = ?,
               started_at = COALESCE(?, started_at),
               completed_at = COALESCE(?, completed_at)
           WHERE id = ?""",
        state,
        started_at,
        completed_at,
        job_id,
    )


async def append_audit_event(
    db: Any,
    *,
    project_id: str,
    user_id: str,
    action: str,
    object_type: str,
    object_id: str,
    after: Any | None = None,
    reason: str | None = None,
) -> None:
    head = await first_row(
        db,
        """SELECT hash
           FROM audit_events
           WHERE project_id = ?
           ORDER BY timestamp DESC, rowid DESC
           LIMIT 1""",
        project_id,
    )
    previous_hash = str(head["hash"]) if head and head.get("hash") else None
    event = {
        "id": make_id("evt"),
        "projectId": project_id,
        "userId": user_id,
        "action": action,
        "objectType": object_type,
        "objectId": object_id,
        "timestamp": utc_now(),
    }
    if after is not None:
        event["after"] = after
    if reason is not None:
        event["reason"] = reason

    digest = audit_hash(event, previous_hash)

    await run_statement(
        db,
        """INSERT INTO audit_events
           (id, project_id, user_id, action, object_type, object_id,
            before_json, after_json, reason, software_version, model_id,
            timestamp, previous_hash, hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        event["id"],
        project_id,
        user_id,
        action,
        object_type,
        object_id,
        None,
        canonical_json(after) if after is not None else None,
        reason,
        "methodome-stats/python-worker-0.1.0",
        None,
        event["timestamp"],
        previous_hash,
        digest,
    )


async def process_analysis_message(body: Any, env: Any) -> None:
    message = to_python(body)
    if not isinstance(message, dict):
        raise PermanentAnalysisError("Queue message must be a JSON object.")

    job_id = message.get("jobId")
    project_id = message.get("projectId")
    if not isinstance(job_id, str) or not isinstance(project_id, str):
        raise PermanentAnalysisError("Queue message requires jobId and projectId.")

    job_row = await first_row(
        env.DB,
        """SELECT job_specification_json, state
           FROM analysis_jobs
           WHERE id = ? AND project_id = ?
           LIMIT 1""",
        job_id,
        project_id,
    )
    if not job_row:
        raise PermanentAnalysisError(f"Analysis job {job_id} was not found.")

    existing_result = await first_row(
        env.DB,
        "SELECT id FROM analysis_results WHERE analysis_job_id = ? LIMIT 1",
        job_id,
    )
    if existing_result:
        await mark_state(env.DB, job_id, "complete", completed_at=utc_now())
        return

    try:
        job = json.loads(str(job_row["job_specification_json"]))
    except Exception as exc:
        raise PermanentAnalysisError("Stored analysis job is invalid JSON.") from exc

    if not isinstance(job, dict):
        raise PermanentAnalysisError("Stored analysis job is invalid.")

    dataset_version_id = job.get("datasetVersionId")
    method_id = job.get("methodId")
    requested_by = job.get("requestedBy")
    registry_version = job.get("registryVersion")
    created_at = job.get("createdAt")

    required_strings = {
        "datasetVersionId": dataset_version_id,
        "methodId": method_id,
        "requestedBy": requested_by,
        "registryVersion": registry_version,
        "createdAt": created_at,
    }
    for name, value in required_strings.items():
        if not isinstance(value, str) or not value:
            raise PermanentAnalysisError(f"Stored analysis job is missing {name}.")

    started_at = utc_now()
    await mark_state(env.DB, job_id, "preparing_data", started_at=started_at)

    dataset = await first_row(
        env.DB,
        """SELECT object_key, checksum_sha256
           FROM dataset_versions
           WHERE id = ? AND project_id = ?
           LIMIT 1""",
        dataset_version_id,
        project_id,
    )
    if not dataset:
        raise PermanentAnalysisError("Dataset version was not found.")

    object_key = dataset.get("object_key")
    checksum = dataset.get("checksum_sha256")
    if not isinstance(object_key, str) or not object_key:
        raise PermanentAnalysisError("Dataset version has no storage object key.")

    stored = await env.FILES.get(object_key)
    if stored is None:
        raise PermanentAnalysisError("Dataset object was not found in R2.")

    csv_text = await stored.text()

    await mark_state(env.DB, job_id, "checking_requirements")
    await mark_state(env.DB, job_id, "running_model")

    try:
        result = run_analysis(
            {
                "methodId": method_id,
                "csv": csv_text,
                **({"outcome": job["outcome"]} if job.get("outcome") else {}),
                "predictors": list(job.get("predictors") or []),
                "covariates": list(job.get("covariates") or []),
            }
        )
    except ValueError as exc:
        raise PermanentAnalysisError(str(exc)) from exc

    await mark_state(env.DB, job_id, "running_diagnostics")

    result_with_job = {
        **result,
        "jobId": job_id,
    }
    executed_at = utc_now()
    provenance = {
        "analysisJobId": job_id,
        "projectId": project_id,
        "datasetVersionId": dataset_version_id,
        "datasetChecksumSha256": str(checksum or ""),
        "registryVersion": registry_version,
        "methodId": method_id,
        "filters": list(job.get("filters") or []),
        "requestedBy": requested_by,
        "createdAt": created_at,
        "executedAt": executed_at,
        "software": result_with_job["software"],
    }

    await mark_state(env.DB, job_id, "preparing_results")

    await run_statement(
        env.DB,
        """INSERT INTO analysis_results
           (id, analysis_job_id, result_json, provenance_json, result_object_key, created_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(analysis_job_id) DO NOTHING""",
        make_id("result"),
        job_id,
        canonical_json(result_with_job),
        canonical_json(provenance),
        None,
        executed_at,
    )

    await append_audit_event(
        env.DB,
        project_id=project_id,
        user_id=requested_by,
        action="analysis_completed",
        object_type="analysis_job",
        object_id=job_id,
        after={
            "methodId": method_id,
            "datasetVersionId": dataset_version_id,
            "datasetChecksumSha256": str(checksum or ""),
            "n": result_with_job["n"],
        },
    )

    await mark_state(env.DB, job_id, "complete", completed_at=utc_now())


async def mark_failed(body: Any, env: Any, reason: str) -> None:
    message = to_python(body)
    if not isinstance(message, dict):
        return
    job_id = message.get("jobId")
    project_id = message.get("projectId")
    if not isinstance(job_id, str) or not isinstance(project_id, str):
        return

    job_row = await first_row(
        env.DB,
        """SELECT job_specification_json
           FROM analysis_jobs
           WHERE id = ? AND project_id = ?
           LIMIT 1""",
        job_id,
        project_id,
    )
    if not job_row:
        return

    await mark_state(env.DB, job_id, "failed", completed_at=utc_now())

    try:
        job = json.loads(str(job_row["job_specification_json"]))
    except Exception:
        return

    requested_by = job.get("requestedBy")
    if isinstance(requested_by, str) and requested_by:
        await append_audit_event(
            env.DB,
            project_id=project_id,
            user_id=requested_by,
            action="analysis_failed",
            object_type="analysis_job",
            object_id=job_id,
            reason=reason[:2000],
            after={"state": "failed"},
        )
