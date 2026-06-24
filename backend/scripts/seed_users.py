import sys
import os
import asyncio

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.database import AsyncSessionLocal, engine, Base
from models.user import User
from core.security import get_password_hash
from sqlalchemy.future import select

async def seed():
    # Ensure tables exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    async with AsyncSessionLocal() as session:
        # Seed super admin
        result = await session.execute(select(User).where(User.username == "umer"))
        if not result.scalars().first():
            super_admin = User(
                username="umer",
                hashed_password=get_password_hash("farooq"),
                role="super_admin"
            )
            session.add(super_admin)
            print("Seeded super_admin 'umer'")

        # Seed admin
        result = await session.execute(select(User).where(User.username == "admin"))
        if not result.scalars().first():
            admin = User(
                username="admin",
                hashed_password=get_password_hash("admin"),
                role="admin"
            )
            session.add(admin)
            print("Seeded admin 'admin'")

        await session.commit()
        print("Seeding complete.")

if __name__ == "__main__":
    asyncio.run(seed())
