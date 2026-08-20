import logging

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.observability import (
    REQUEST_ID_HEADER,
    RequestContextMiddleware,
    configure_logging,
    request_id_var,
)
from app.routers import auth, items

settings = get_settings()
configure_logging(settings.log_level)

logger = logging.getLogger("app")

app = FastAPI(
    title=settings.app_name,
    version="1.2.0",
    summary="Inventory backend for the React Native client in this repo",
)

app.add_middleware(RequestContextMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[REQUEST_ID_HEADER],
)

app.include_router(auth.router)
app.include_router(items.router)


@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "internal server error", "request_id": request_id_var.get()},
        headers={REQUEST_ID_HEADER: request_id_var.get()},
    )


@app.get("/health", tags=["meta"])
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        logger.error("health check could not reach the database")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "database unreachable") from exc
    return {"status": "ok", "database": "ok"}
