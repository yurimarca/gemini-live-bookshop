"""Deterministic metric: the response is valid JSON and every pick id is one of the request's candidates."""

import json


def _text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(_text(v) for v in value)
    if isinstance(value, dict):
        if "parts" in value:
            return "".join(p.get("text") or "" for p in value["parts"] if isinstance(p, dict))
        for key in ("text", "response", "content"):
            if key in value:
                return _text(value[key])
    return str(value)


def _json(value):
    text = _text(value).strip()
    if text.startswith("```"):
        text = text.strip("`").removeprefix("json").strip()
    try:
        return json.loads(text)
    except ValueError:
        return None


def evaluate(instance):
    request = _json(instance.get("prompt"))
    response = _json(instance.get("response"))
    if not isinstance(request, dict) or not isinstance(response, dict):
        return {"score": 0, "explanation": "request or response is not JSON"}
    candidates = {c["id"] for c in request.get("payload", {}).get("candidates", [])}
    picks = [p.get("id") for p in response.get("picks", []) if isinstance(p, dict)]
    if not picks:
        return {"score": 0, "explanation": "no picks"}
    invented = [p for p in picks if p not in candidates]
    if invented:
        return {"score": 0, "explanation": f"{len(invented)} of {len(picks)} picks are not candidates"}
    return {"score": 1, "explanation": f"{len(picks)} picks, all candidates"}
