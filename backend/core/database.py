from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
import os

# During local dev/testing before Docker is fully up, we can fallback to sqlite
# But the goal is postgres. Let's use the env var or default to postgres docker URL
DB_USER = os.getenv("DB_USER", "hpc_admin")
DB_PASSWORD = os.getenv("DB_PASSWORD", "hpc_password")
DB_NAME = os.getenv("DB_NAME", "hpc_cluster")
DB_HOST = os.getenv("DB_HOST", "postgres") # Defaults to the docker container name

DATABASE_URL = os.getenv("DATABASE_URL", f"postgresql+asyncpg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:5432/{DB_NAME}")

# If using sqlite for testing, async driver is aiosqlite
if DATABASE_URL.startswith("sqlite"):
    engine = create_async_engine(DATABASE_URL, echo=False)
else:
    engine = create_async_engine(DATABASE_URL, echo=False)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
