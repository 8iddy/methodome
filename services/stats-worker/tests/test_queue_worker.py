from queue_worker import audit_hash, canonical_json, make_id, to_python


def test_canonical_json_sorts_nested_keys():
    left = {"b": 2, "a": {"d": 4, "c": 3}}
    right = {"a": {"c": 3, "d": 4}, "b": 2}
    assert canonical_json(left) == canonical_json(right)


def test_audit_hash_is_deterministic_and_chained():
    event = {
        "id": "evt_1",
        "projectId": "proj_1",
        "userId": "user_1",
        "action": "analysis_completed",
        "objectType": "analysis_job",
        "objectId": "job_1",
        "timestamp": "2026-09-28T12:00:00Z",
    }
    first = audit_hash(event, None)
    second = audit_hash(event, None)
    chained = audit_hash({**event, "id": "evt_2"}, first)

    assert first == second
    assert len(first) == 64
    assert chained != first


def test_queue_ids_are_prefixed_and_unique():
    first = make_id("result")
    second = make_id("result")
    assert first.startswith("result_")
    assert second.startswith("result_")
    assert first != second


def test_to_python_keeps_native_values():
    value = {"jobId": "job_1", "projectId": "proj_1"}
    assert to_python(value) is value
