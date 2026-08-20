import json
import logging

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.observability import REQUEST_ID_HEADER, JsonFormatter, request_id_var


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


def test_every_response_carries_a_request_id(client):
    response = client.get("/health")

    assert REQUEST_ID_HEADER in response.headers
    assert len(response.headers[REQUEST_ID_HEADER]) == 16


def test_an_incoming_request_id_is_kept(client):
    response = client.get("/health", headers={REQUEST_ID_HEADER: "trace-from-the-gateway"})

    assert response.headers[REQUEST_ID_HEADER] == "trace-from-the-gateway"


def test_an_absurdly_long_request_id_is_replaced(client):
    response = client.get("/health", headers={REQUEST_ID_HEADER: "x" * 200})

    assert response.headers[REQUEST_ID_HEADER] != "x" * 200
    assert len(response.headers[REQUEST_ID_HEADER]) == 16


def test_two_requests_get_different_ids(client):
    first = client.get("/health").headers[REQUEST_ID_HEADER]
    second = client.get("/health").headers[REQUEST_ID_HEADER]

    assert first != second


def test_errors_also_carry_the_request_id(client):
    response = client.get("/items")

    assert response.status_code == 401
    assert REQUEST_ID_HEADER in response.headers


def test_the_formatter_emits_one_json_object_per_line():
    record = logging.LogRecord(
        name="app.access",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="GET %s %s",
        args=("/items", 200),
        exc_info=None,
    )
    record.fields = {"method": "GET", "path": "/items", "status": 200, "duration_ms": 4.2}

    token = request_id_var.set("abc123")
    try:
        line = JsonFormatter().format(record)
    finally:
        request_id_var.reset(token)

    payload = json.loads(line)

    assert payload["level"] == "info"
    assert payload["logger"] == "app.access"
    assert payload["request_id"] == "abc123"
    assert payload["status"] == 200
    assert payload["duration_ms"] == 4.2
    assert payload["message"] == "GET /items 200"
    assert payload["timestamp"].endswith("Z")


def test_the_formatter_includes_the_traceback_when_there_is_one():
    try:
        raise ValueError("something went wrong")
    except ValueError:
        import sys

        record = logging.LogRecord(
            name="app",
            level=logging.ERROR,
            pathname=__file__,
            lineno=1,
            msg="boom",
            args=(),
            exc_info=sys.exc_info(),
        )

    payload = json.loads(JsonFormatter().format(record))

    assert "exception" in payload
    assert "ValueError" in payload["exception"]
