from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from api.routes import slaves
from api.routes import images
from api.routes import ansible
from core.config import settings

from contextlib import asynccontextmanager
from core.database import engine, Base
import models.slaves  # Import models to register them with Base

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize Database Tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Cleanup on shutdown
    await engine.dispose()

app = FastAPI(
    title=settings.API_TITLE,
    description="API for dynamically provisioning OpenHPC nodes via Warewulf and Slurm",
    version=settings.API_VERSION,
    lifespan=lifespan
)


# Allow React Frontend to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.FRONTEND_URLS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    body = await request.body()
    print(f"\n[VALIDATION ERROR] on {request.url}")
    print(f"  Errors: {exc.errors()}")
    print(f"  Body: {body.decode()[:2000]}")
    return JSONResponse(status_code=422, content={"detail": exc.errors()})

from api.routes import auth
from api.routes import users
from api.routes import master
from core.security import get_current_user
from fastapi import Depends

# Include Routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(master.router, prefix="/api/v1/master", tags=["master"])
app.include_router(slaves.router, prefix="/api/v1/slaves", tags=["slaves"])
app.include_router(images.router, prefix="/api/v1/images", tags=["images"])
app.include_router(ansible.router, prefix="/api/v1/ansible", tags=["ansible"])

@app.get("/")
def read_root():
    return {"status": "ok", "message": "HPC Management API is running"}
