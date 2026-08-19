import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def register_and_login(client, email="tech@example.com", password="supersecret1"):
    client.post("/auth/register", json={"email": email, "password": password})
    response = client.post("/auth/token", data={"username": email, "password": password})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_register_rejects_duplicate_email(client):
    payload = {"email": "dup@example.com", "password": "supersecret1"}
    assert client.post("/auth/register", json=payload).status_code == 201
    assert client.post("/auth/register", json=payload).status_code == 409


def test_register_rejects_short_password(client):
    response = client.post("/auth/register", json={"email": "a@b.com", "password": "short"})
    assert response.status_code == 422


def test_login_with_wrong_password_fails(client):
    client.post("/auth/register", json={"email": "x@example.com", "password": "supersecret1"})
    response = client.post("/auth/token", data={"username": "x@example.com", "password": "nope"})
    assert response.status_code == 401


def test_items_require_a_token(client):
    assert client.get("/items").status_code == 401


def test_item_lifecycle(client):
    headers = register_and_login(client)

    created = client.post(
        "/items",
        json={"sku": "RTR-001", "name": "Cisco 2911 router", "location": "rack A", "quantity": 2},
        headers=headers,
    )
    assert created.status_code == 201
    item_id = created.json()["id"]

    listed = client.get("/items", headers=headers).json()
    assert listed["total"] == 1
    assert listed["items"][0]["sku"] == "RTR-001"

    patched = client.patch(f"/items/{item_id}", json={"quantity": 5}, headers=headers)
    assert patched.status_code == 200
    assert patched.json()["quantity"] == 5
    assert patched.json()["name"] == "Cisco 2911 router"

    assert client.delete(f"/items/{item_id}", headers=headers).status_code == 204
    assert client.get(f"/items/{item_id}", headers=headers).status_code == 404


def test_duplicate_sku_for_same_owner_conflicts(client):
    headers = register_and_login(client)
    body = {"sku": "SW-01", "name": "Access switch", "quantity": 1}

    assert client.post("/items", json=body, headers=headers).status_code == 201
    assert client.post("/items", json=body, headers=headers).status_code == 409


def test_users_cannot_see_or_touch_each_other_items(client):
    alice = register_and_login(client, "alice@example.com")
    bob = register_and_login(client, "bob@example.com")

    created = client.post(
        "/items", json={"sku": "AP-9", "name": "Access point"}, headers=alice
    )
    item_id = created.json()["id"]

    assert client.get("/items", headers=bob).json()["total"] == 0
    assert client.get(f"/items/{item_id}", headers=bob).status_code == 404
    assert client.patch(f"/items/{item_id}", json={"quantity": 9}, headers=bob).status_code == 404
    assert client.delete(f"/items/{item_id}", headers=bob).status_code == 404


def test_same_sku_allowed_for_different_owners(client):
    alice = register_and_login(client, "alice2@example.com")
    bob = register_and_login(client, "bob2@example.com")
    body = {"sku": "SHARED-1", "name": "Patch panel"}

    assert client.post("/items", json=body, headers=alice).status_code == 201
    assert client.post("/items", json=body, headers=bob).status_code == 201


def test_search_and_pagination(client):
    headers = register_and_login(client)
    for i in range(7):
        client.post(
            "/items",
            json={"sku": f"CBL-{i}", "name": "Patch cable", "location": "store room"},
            headers=headers,
        )
    client.post("/items", json={"sku": "SRV-1", "name": "Dell R620"}, headers=headers)

    page = client.get("/items", params={"limit": 3}, headers=headers).json()
    assert page["total"] == 8
    assert len(page["items"]) == 3

    found = client.get("/items", params={"q": "cable"}, headers=headers).json()
    assert found["total"] == 7

    by_location = client.get("/items", params={"q": "store"}, headers=headers).json()
    assert by_location["total"] == 7


def test_empty_patch_is_rejected(client):
    headers = register_and_login(client)
    created = client.post("/items", json={"sku": "X-1", "name": "Thing"}, headers=headers)
    item_id = created.json()["id"]

    assert client.patch(f"/items/{item_id}", json={}, headers=headers).status_code == 400


def test_negative_quantity_is_rejected(client):
    headers = register_and_login(client)
    response = client.post(
        "/items", json={"sku": "NEG-1", "name": "Thing", "quantity": -3}, headers=headers
    )
    assert response.status_code == 422
