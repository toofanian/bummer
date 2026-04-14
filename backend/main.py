from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from routers import auth, library, metadata

load_dotenv()

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


@app.get("/health")
def health():
    return {"status": "ok"}
