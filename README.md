# Inventory: React Native client + FastAPI backend

[![ci](https://github.com/Alex-2rios/mobile-crud-fastapi/actions/workflows/ci.yml/badge.svg)](https://github.com/Alex-2rios/mobile-crud-fastapi/actions/workflows/ci.yml)

A small inventory system in one repository. The API is FastAPI with SQLAlchemy and JWT auth, the
client is a React Native app built with Expo. They are kept together because they change
together, and a version of the app that does not match its API is not much use to anyone.

## Layout

```
backend/    FastAPI app, SQLAlchemy models, pytest suite, Dockerfile
mobile/     Expo app: login, item list with search, create and edit forms
docker-compose.yml   API plus PostgreSQL for a realistic run
```

## The API

Every item belongs to the user who created it. That ownership check happens on the way in, not
in the query results, which is why deleting someone else's item returns 404 rather than 403. If
it is not yours, as far as the API is concerned it does not exist.

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | 409 if the email is taken, password minimum 8 characters |
| POST | `/auth/token` | OAuth2 password flow, returns a bearer token |
| GET | `/auth/me` | who the token belongs to |
| GET | `/items` | `q` searches sku, name and location, plus `limit` and `offset` |
| POST | `/items` | 409 if you already have that sku |
| GET | `/items/{id}` | |
| PATCH | `/items/{id}` | partial update, 400 if the body is empty |
| DELETE | `/items/{id}` | 204 |

`(owner_id, sku)` is unique, so two different users can both have a `SW-01` and neither one
blocks the other. Interactive docs are at `/docs` once it is running.

## Running the backend

SQLite, no containers, good enough for development:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0
```

Or the closer to production version, API plus PostgreSQL:

```bash
docker compose up -d --build
```

`--host 0.0.0.0` matters. A phone on the same WiFi cannot reach a server bound to localhost, and
that is the first thing that goes wrong when you point the app at your laptop.

## Schema changes

The schema is managed by Alembic, not by `create_all`. The container entrypoint runs
`alembic upgrade head` before starting uvicorn, so a deploy that includes a migration applies it
and a deploy that does not is a no-op.

```bash
alembic upgrade head
alembic downgrade base
alembic revision --autogenerate -m "add supplier to items"
```

`GET /health` checks the database rather than just returning 200, and answers 503 when it cannot
reach it. A health endpoint that reports healthy while the database is gone is worse than not
having one, because it is what your load balancer believes.

## Logs you can actually search

Every log line is one JSON object, and every request carries an id:

```json
{"timestamp": "2026-08-20T04:25:49.253Z", "level": "info", "logger": "app.access",
 "message": "GET /items 401", "request_id": "interview-demo-1", "method": "GET",
 "path": "/items", "status": 401, "duration_ms": 1.19, "client": "172.29.0.1"}
```

The id comes from the `X-Request-ID` header if the caller sent one, otherwise the middleware
generates it. Either way it goes back out on the response and appears on every line logged during
that request, including the traceback if something throws. When the mobile app reports a failure,
the id from its response finds the exact request in the logs.

Unhandled exceptions return the request id in the body too, so a user can read it off the screen
rather than describing what they were doing.

## Running it hardened

The container runs as an unprivileged user with a read only root filesystem, every Linux
capability dropped and `no-new-privileges` set:

```bash
$ docker compose exec api id
uid=10001(apiuser) gid=999(apiuser) groups=999(apiuser)
```

None of that is exotic and all of it is default off. The application does not need to write
anywhere except `/tmp`, so there is no reason to let it.

## Running the app

```bash
cd mobile
npm install
cp .env.example .env
npm start
```

Put your machine's LAN address in `.env` (`EXPO_PUBLIC_API_URL=http://192.168.1.42:8000`), then
scan the QR code with Expo Go. The token lives in `expo-secure-store`, so it is in the Keychain
or the Android keystore rather than in plain `AsyncStorage`, and the app restores your session on
launch by calling `/auth/me` with it.

## Tests

```bash
cd backend
pytest
```

Twenty four tests against a throwaway in memory SQLite database. The ones worth reading are
`test_users_cannot_see_or_touch_each_other_items` and `test_same_sku_allowed_for_different_owners`,
because those cover the two ways multi tenant CRUD usually goes wrong: leaking other people's
rows, and treating a per user constraint as if it were global.

There is also a test that applies the migrations to an empty database and then asks Alembic to
compare the result against the models, asserting the difference is empty. That catches the
classic mistake of changing a model and forgetting the migration, which otherwise only shows up
when you deploy.

## What I learned

- Returning 404 instead of 403 for an item that belongs to someone else is a deliberate choice.
  A 403 confirms the record exists, which is information the caller has not earned.
- FastAPI dependencies made auth almost invisible. `user: User = Depends(get_current_user)` in a
  signature is the whole thing, and it doubles as documentation because it shows up in the
  OpenAPI schema.
- `psycopg2-binary` has no wheel for recent Python versions and tries to compile from source,
  which fails without the PostgreSQL headers. Moving to `psycopg[binary]` and the
  `postgresql+psycopg://` URL fixed it, and the SQLAlchemy code did not change at all.
- Storing a JWT in `AsyncStorage` was my first attempt. `expo-secure-store` is barely more work
  and puts the token somewhere other apps cannot read it.
- A 401 anywhere in the app has to sign the user out, not show an error toast. Expired tokens are
  normal, and an app that keeps retrying with a dead token just looks broken.
- The mobile client needed no changes when the backend moved from SQLite to PostgreSQL, which is
  a good sign that the boundary between them is in the right place.
- `create_all` is fine until the schema changes once. Alembic's `compare_metadata` in a test is
  what makes migrations trustworthy: the models and the migration cannot drift apart without CI
  saying so.
- `render_as_batch=True` in the Alembic environment, because SQLite cannot alter a column in
  place and rebuilds the table instead. Without it the migrations work on PostgreSQL and fail on
  the database I develop against.
- A request id is worth more than a timestamp when something goes wrong. Correlating logs by
  time works until two people hit the same endpoint in the same second.
- `contextvars` is what makes the request id available to every log line without threading it
  through every function signature. It is the async equivalent of thread local storage and it is
  in the standard library.

## Working on this

```bash
make help
```

The usual ones: `make install, make test, make migrate, make up, make mobile`.

Every push runs the CI workflow described above. A second workflow, `security.yml`, runs weekly
and on every push: it scans the history for committed secrets with gitleaks, audits the Python
dependencies with pip-audit, and scans the API image with Trivy.

Dependabot opens pull requests for the GitHub Actions and the dependencies once a week.

Line endings are pinned to LF through `.gitattributes`, because half of this was written on
Windows and shell scripts with carriage returns fail on Linux in a way that is genuinely
confusing the first time.

## Next

Offline queueing on the client so edits made without signal sync when it comes back, and refresh
tokens so a session does not simply end after an hour.
