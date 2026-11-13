from conftest import auth, make_settings
from fastapi.testclient import TestClient

from main import create_app


def test_catalog_has_etag_and_revalidates(client):
    first = client.get("/api/catalog")
    assert first.status_code == 200 and first.json()["count"] == 30
    assert first.headers["etag"] == '"ol-fixture-r1"'
    assert "stock" not in first.json()["books"][0]
    assert client.get("/api/catalog", headers={"If-None-Match": first.headers["etag"]}).status_code == 304


def test_book_detail(client):
    body = client.get("/api/books/OL27482W").json()
    assert body["title"] == "The Hobbit" and body["price_is_fictional"] is True and "currency" not in body
    assert client.get("/api/books/OL1W").status_code == 404
    assert client.get("/api/books/not-an-id").status_code == 422


def test_cart_needs_a_token(client):
    assert client.get("/api/cart").status_code == 401
    assert client.get("/api/cart", headers={"Authorization": "Bearer nonsense"}).status_code == 401


def test_cart_roundtrip_is_idempotent(client):
    body = {"olid": "OL27482W", "quantity": 2, "op_id": "op-12345678"}
    first = client.post("/api/cart/items", json=body, headers=auth()).json()
    again = client.post("/api/cart/items", json=body, headers=auth()).json()
    assert first == again and first["items"][0]["quantity"] == 2
    assert first["total_cents"] == 2 * first["items"][0]["price_cents"] and first["hold_expires_at"]
    assert client.get("/api/cart", headers=auth("someone-else")).json()["items"] == []
    removed = client.delete("/api/cart/items/OL27482W?op_id=op-87654321", headers=auth()).json()
    assert removed["items"] == [] and removed["hold_expires_at"] is None


def test_cart_rejects_bad_input(client):
    assert client.post("/api/cart/items", json={"olid": "OL1W", "op_id": "op-12345678"}, headers=auth()).status_code == 404
    assert client.post("/api/cart/items", json={"olid": "OL27482W", "quantity": 99, "op_id": "op-12345678"},
                       headers=auth()).status_code == 422
    assert client.post("/api/cart/items", json={"olid": "OL27482W", "op_id": "x"}, headers=auth()).status_code == 422


def test_tasks_endpoint_is_closed_without_oidc(client):
    resp = client.post("/internal/tasks/cart-expiry", json={"uid": "dev-tester1", "expires_at": 1.0})
    assert resp.status_code == 403
    resp = client.post("/internal/tasks/cart-expiry", json={"uid": "dev-tester1", "expires_at": 1.0},
                       headers={"Authorization": "Bearer forged"})
    assert resp.status_code == 403


def test_cors_only_allows_configured_origins(client):
    ok = client.options("/api/cart", headers={"Origin": "http://localhost:5173",
                                              "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    bad = client.options("/api/cart", headers={"Origin": "https://evil.example",
                                               "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers


def test_unsafe_settings_are_refused_on_cloud_run(monkeypatch):
    import pytest

    monkeypatch.setenv("K_SERVICE", "bookshop-gateway")
    with pytest.raises(ValueError, match="unsafe settings"):
        make_settings()
    ok = make_settings(auth_mode="firebase", state_backend="firestore", catalog_source="cloud",
                       allowed_origins="https://example.web.app")
    assert ok.on_cloud_run


def test_healthz(client):
    assert client.get("/healthz").json() == {"status": "ok", "dataset_version": "ol-fixture-r1"}
    assert TestClient(create_app(make_settings())).get("/docs").status_code == 404
