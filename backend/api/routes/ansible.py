import os
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from typing import List
from core.ssh_executor import SSHExecutor
from core.config import settings
from core.locks import deployment_lock
import shlex
from core.security import get_current_user, verify_ws_token

router = APIRouter()

# The directory on the Master Node where playbooks are stored
REMOTE_ANSIBLE_DIR = "/opt/hpc-cluster-system/scripts/ansible"

@router.get("/playbooks", response_model=List[str])
async def list_playbooks(user: dict = Depends(get_current_user)):
    """List all available Ansible playbooks (.yml files) on the Master Node."""
    executor = SSHExecutor(
        host=settings.MASTER_IP,
        username=settings.MASTER_USER,
        password=settings.MASTER_PASS
    )
    
    # Run a simple ls command
    command = f"ls -1 {REMOTE_ANSIBLE_DIR}/*.yml"
    playbooks = []
    
    try:
        async for line in executor.run_command_stream(command):
            if line.endswith(".yml") and not "[ERROR]" in line and not "[SSH ERROR]" in line:
                # Extract just the filename
                filename = os.path.basename(line.strip())
                playbooks.append(filename)
                
        return playbooks
    except Exception as e:
        print(f"Error fetching playbooks: {e}")
        return []

# ─── Run Playbook ──────────────────────────────────────────────────────────────
from pydantic import BaseModel
class PlaybookPayload(BaseModel):
    playbook_name: str

from core.tasks import run_playbook_task

@router.post("/run")
async def run_playbook(payload: PlaybookPayload, user: dict = Depends(get_current_user)):
    """
    Triggers the Celery task to run an Ansible playbook.
    """
    if deployment_lock.locked():
        return {"status": "error", "message": "A deployment or build is already in progress. Please wait."}
        
    task = run_playbook_task.delay({"playbook_name": payload.playbook_name})
    return {"status": "success", "task_id": task.id}
