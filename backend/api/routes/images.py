import re
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from pydantic import BaseModel
from typing import Optional

from core.ssh_executor import SSHExecutor
from core.config import settings
from core.security import get_current_user, verify_ws_token
from core.locks import deployment_lock
import shlex

router = APIRouter()

def _make_executor() -> SSHExecutor:
    return SSHExecutor(
        host=settings.MASTER_IP,
        username=settings.MASTER_USER,
        password=settings.MASTER_PASS,
    )

# ─── Models ────────────────────────────────────────────────────────────────────

class ImageBuildPayload(BaseModel):
    name: str
    source: str
    fastestMirror: bool = True
    maxDownloads: int = 10
    dnfTimeout: int = 300
    minRate: int = 1000
    excludePkgs: str = "linux-firmware*"
    installEpel: bool = True
    enableCrb: bool = True
    installOhpc: bool = True
    packages: str = "ohpc-base-compute, ohpc-slurm-client, chrony, lmod-ohpc, nhc-ohpc, ncurses"
    enabledServices: str = "munge, slurmd, chronyd"
    ntpServer: str = "192.168.20.1"
    makeStep: str = "1 -1"
    forceSync: bool = True
    memlockUnlimited: bool = True
    pamSlurmRestrict: bool = True
    syslogTarget: str = "192.168.10.2"
    syslogPort: int = 514
    forceDracut: bool = True

# ─── List Images ───────────────────────────────────────────────────────────────

@router.get("/")
async def list_images(user: dict = Depends(get_current_user)):
    """
    Runs `wwctl image list` on the Master Node and returns structured image data.
    """
    executor = _make_executor()
    images = []
    raw_lines = []

    try:
        async for line in executor.run_command_stream("wwctl image list"):
            raw_lines.append(line)

        # Parse the output:
        # IMAGE NAME
        # ----------
        # alma9-dev
        # almalinux-9
        past_separator = False
        for line in raw_lines:
            line = line.strip()
            if not line or "ERROR" in line or "FAILED" in line:
                continue
            if line.startswith("---"):
                past_separator = True
                continue
            if not past_separator:
                continue  # skip header lines
            # Each remaining line is an image name
            images.append({
                "name": line,
                "nodes": "—",
                "built": "unknown",
                "size": "—",
            })

        return {"status": "success", "images": images, "rawOutput": raw_lines}

    except Exception as e:
        return {"status": "error", "message": str(e), "images": [], "rawOutput": [str(e)]}


# ─── Delete Image ──────────────────────────────────────────────────────────────

@router.delete("/{image_name}")
async def delete_image(image_name: str, user: dict = Depends(get_current_user)):
    """
    Deletes a Warewulf image from the Master Node.
    """
    safe_image_name = shlex.quote(image_name)
    executor = _make_executor()
    output = []
    try:
        async with deployment_lock:
            async for line in executor.run_command_stream(
                f"wwctl image delete {safe_image_name} --yes 2>&1"
            ):
                output.append(line)
        return {"status": "success", "output": output}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─── Build Image ───────────────────────────────────────────────────────────────
from core.tasks import build_image_task

@router.post("/build")
async def build_image(payload: ImageBuildPayload, user: dict = Depends(get_current_user)):
    """
    Triggers the Celery task to build an OS image.
    Returns a task_id that the frontend can use to tail logs.
    """
    if deployment_lock.locked():
        return {"status": "error", "message": "A deployment or build is already in progress. Please wait."}
        
    task = build_image_task.delay(payload.dict())
    
    return {"status": "success", "task_id": task.id}
