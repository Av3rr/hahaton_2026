from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from db import Base, engine, get_db
from models import User
from routes_auth import router as auth_router
from routes_schedule import router as schedule_router
from routes_periods import router as periods_router
from routes_admin import router as admin_router
from routes_export import router as export_router
from routes_templates import router as templates_router
from auth import get_current_active_user


def create_app() -> FastAPI:
    app = FastAPI(
        title="T2 Schedule API",
        description="Authentication, roles, and scheduling API for T2 website",
        version="1.0.0",
    )

    # Create tables if they do not exist yet (for simple setups)
    Base.metadata.create_all(bind=engine)

    # CORS – adjust origins for your frontend domain in production
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", tags=["system"])
    async def health_check():
        return {"status": "ok"}

    static_dir = Path(__file__).parent / "static"
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.get("/", include_in_schema=False)
    async def serve_ui():
        return FileResponse(static_dir / "index.html")

    #@app.get("/me", tags=["auth"])
    #async def read_me(current_user: User = Depends(get_current_active_user)):
    #    return current_user

    # Routers
    app.include_router(auth_router)
    app.include_router(schedule_router)
    app.include_router(periods_router)
    app.include_router(admin_router)
    app.include_router(export_router)
    app.include_router(templates_router)

    return app


app = create_app()

