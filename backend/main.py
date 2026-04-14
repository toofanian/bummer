import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from routers import auth, digest, home, library, metadata, playback

load_dotenv()


class _SuppressPolling(logging.Filter):
    _noisy = {"/playback/state", "/health"}

    def filter(self, record):
        msg = record.getMessage()
        return not any(path in msg for path in self._noisy)


logging.getLogger("uvicorn.access").addFilter(_SuppressPolling())

limiter = Limiter(key_func=get_remote_address)

_is_prod = os.getenv("ENVIRONMENT") == "production"
app = FastAPI(
    title="better-spotify-interface",
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

origins = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(auth.router)
app.include_router(home.router)
app.include_router(library.router)
app.include_router(metadata.router)
app.include_router(playback.router)
app.include_router(digest.router)


@app.get("/health")
def health():
    return {"status": "ok"}
