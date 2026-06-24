from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from core.database import get_db
from models.user import User
from core.security import get_admin_user, get_password_hash
from core.config import settings
from core.ssh_executor import SSHExecutor
import asyncio

router = APIRouter()

class UserCreate(BaseModel):
    username: str
    password: str
    role: str # super_admin, admin, normal_user

class UserResponse(BaseModel):
    id: int
    username: str
    role: str

async def execute_ssh_commands(commands: list):
    executor = SSHExecutor(
        host=settings.MASTER_IP,
        username=settings.MASTER_USER,
        password=settings.MASTER_PASS
    )
    results = []
    for cmd in commands:
        output = []
        async for line in executor.run_command_stream(cmd):
            output.append(line)
        results.append("\\n".join(output))
    return results

@router.post("/", response_model=UserResponse)
async def create_user(user_in: UserCreate, db: AsyncSession = Depends(get_admin_user)):
    # 1. Ensure user does not already exist in DB
    result = await db.execute(select(User).where(User.username == user_in.username))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Username already registered")
        
    # 2. Add user to Linux OS and Slurm
    # Determine slurm admin level
    slurm_admin_level = "Admin" if user_in.role in ["super_admin", "admin"] else "None"
    
    commands = [
        f"useradd -m -s /bin/bash {user_in.username} || echo 'User might exist'",
        f"echo '{user_in.password}' | passwd --stdin {user_in.username}",
        f"htpasswd -B -b /etc/ood/config/htpasswd {user_in.username} '{user_in.password}'",
        f"sacctmgr -i add account default || echo 'Account exists'",
        f"sacctmgr -i add user {user_in.username} account=default adminlevel={slurm_admin_level} || echo 'Slurm User exists'"
    ]
    
    if user_in.role == "super_admin":
        commands.append(f"usermod -aG wheel {user_in.username}")
        
    try:
        await execute_ssh_commands(commands)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to provision user on OS: {str(e)}")

    # 3. Add user to local DB
    db_user = User(
        username=user_in.username,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    
    return db_user

@router.get("/", response_model=list[UserResponse])
async def list_users(db: AsyncSession = Depends(get_admin_user)):
    result = await db.execute(select(User))
    users = result.scalars().all()
    return users
