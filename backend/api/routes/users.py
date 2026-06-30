from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from core.database import get_db
from models.user import User
from core.security import get_admin_user, TokenUser, get_keycloak_admin
from keycloak.exceptions import KeycloakError
from core.config import settings
from core.ssh_executor import SSHExecutor
import asyncio
import shlex

router = APIRouter()

class UserCreate(BaseModel):
    username: str
    password: str
    role: str # super_admin, admin, normal_user

class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    env_profile: str | None = None

    class Config:
        from_attributes = True


async def execute_ssh_single_command(cmd: str):
    executor = SSHExecutor(
        host=settings.MASTER_IP,
        username=settings.MASTER_USER,
        password=settings.MASTER_PASS
    )
    output = []
    async for line in executor.run_command_stream(cmd):
        output.append(line)
    return "\n".join(output)

@router.post("/", response_model=UserResponse)
async def create_user(user_in: UserCreate, current_user: TokenUser = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    import time
    from core.tasks import redis_client, rebuild_warewulf_overlays_task

    # 1. Ensure user does not already exist in DB
    result = await db.execute(select(User).where(User.username == user_in.username))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Username already registered locally")

    # 1.5 Create user in Keycloak
    kc_admin = get_keycloak_admin()
    try:
        new_kc_user_id = kc_admin.create_user({
            "email": f"{user_in.username}@hpc.local",
            "username": user_in.username,
            "enabled": True,
            "firstName": user_in.username,
            "lastName": "HPC User"
        })
        kc_admin.set_user_password(user_id=new_kc_user_id, password=user_in.password, temporary=False)
        
        # Assign role
        role_repr = kc_admin.get_realm_role(role_name=user_in.role)
        kc_admin.assign_realm_roles(user_id=new_kc_user_id, roles=[role_repr])
    except KeycloakError as e:
        error_msg = getattr(e, 'error_message', str(e))
        if hasattr(e, 'response_body'):
            error_msg = e.response_body.decode('utf-8') if isinstance(e.response_body, bytes) else str(e.response_body)
        raise HTTPException(status_code=400, detail=f"Keycloak user creation failed: {error_msg}")
        
    # 2. Add user to Linux OS and Slurm
    # Determine slurm admin level
    slurm_admin_level = "Admin" if user_in.role in ["super_admin", "admin"] else "None"
    
    safe_username = shlex.quote(user_in.username)
    safe_password = shlex.quote(user_in.password)
    
    commands = [
        f"useradd -m -s /bin/bash {safe_username} || echo 'User might exist'",
        f"echo '# Spack Lmod Environment' >> /home/{safe_username}/.bashrc",
        f"echo 'if [ -d /export/apps/spack ]; then' >> /home/{safe_username}/.bashrc",
        f"echo '    module use /export/apps/spack/share/spack/lmod/linux-almalinux9-x86_64/Core' >> /home/{safe_username}/.bashrc",
        f"echo 'fi' >> /home/{safe_username}/.bashrc",
        f"chown {safe_username}:{safe_username} /home/{safe_username}/.bashrc",
        f"echo {safe_password} | passwd --stdin {safe_username}",
        f"sacctmgr -i add account default || echo 'Account exists'",
        f"sacctmgr -i add user {safe_username} account=default adminlevel={slurm_admin_level} || echo 'Slurm User exists'"
    ]
    
    if user_in.role == "super_admin":
        commands.append(f"usermod -aG wheel {safe_username}")
        
    # Combine commands with && to execute them in a single SSH shell session
    combined_cmd = " && ".join([f"( {cmd} )" for cmd in commands])
        
    try:
        await execute_ssh_single_command(combined_cmd)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to provision user on OS: {str(e)}")

    # Trigger debounced Warewulf overlay rebuild
    try:
        now = time.time()
        redis_client.set("last_overlay_rebuild_request", now)
        rebuild_warewulf_overlays_task.apply_async(args=[now], countdown=10)
    except Exception as e:
        # Don't fail user creation if Celery/Redis connection drops
        print(f"Warning: Failed to enqueue debounced overlay build: {e}")

    # 3. Add user to local DB (Password no longer used for web auth, set dummy to preserve schema)
    db_user = User(
        username=user_in.username,
        hashed_password="managed_by_keycloak",
        role=user_in.role
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    
    return db_user

@router.get("/", response_model=list[UserResponse])
async def list_users(current_user: TokenUser = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User))
    users = result.scalars().all()
    return users
