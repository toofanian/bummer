import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from routers import auth, library, metadata, playback

load_dotenv()

class _SuppressPolling(logging.Filter):
    _noisy = {'/playback/state', '/health'}
    def filter(self, record):
        msg = record.getMessage()
        return not any(path in msg for path in self._noisy)

logging.getLogger('uvicorn.access').addFilter(_SuppressPolling())

app = FastAPI(title="better-spotify-interface")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(library.router)
app.include_router(metadata.router)
app.include_router(playback.router)


@app.get("/health")
def health():
    return {"status": "ok"}
