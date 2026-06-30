import os
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from typing import List
from core.ssh_executor import SSHExecutor
from core.config import settings
from core.locks import deployment_lock
import shlex
from core.security import get_current_user, SECRET_KEY, ALGORITHM
import jwt

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

@router.websocket("/run/{playbook_name}")
async def run_playbook(websocket: WebSocket, playbook_name: str, token: str = Query(None)):
    """Run an Ansible playbook and stream the output back to the client."""
    await websocket.accept()
    
    if not token:
        await websocket.send_text("\n\033[1;31m[ERROR] Unauthorized: Missing token\033[0m\n")
        await websocket.close(code=1008)
        return

    try:
        jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception as e:
        await websocket.send_text(f"\n\033[1;31m[ERROR] Unauthorized: {str(e)}\033[0m\n")
        await websocket.close(code=1008)
        return
    
    executor = SSHExecutor(
        host=settings.MASTER_IP,
        username=settings.MASTER_USER,
        password=settings.MASTER_PASS
    )
    
    # Command runs ansible-playbook on the remote node inside the scripts/ansible directory
    # so that inventory files are resolved correctly.
    safe_playbook_name = shlex.quote(playbook_name)
    command = f"cd {REMOTE_ANSIBLE_DIR} && ansible-playbook -i inventory.ini {safe_playbook_name}"
    
    try:
        await websocket.send_text(f"\033[1;34m[*] Executing Playbook: {playbook_name} on {settings.MASTER_IP}...\033[0m\n")
        
        async with deployment_lock:
            async for line in executor.run_command_stream(command):
                # Send each line of stdout/stderr to the frontend
                await websocket.send_text(line + "\n")
            
        await websocket.send_text(f"\n\033[1;32m[+] Execution completed for {playbook_name}\033[0m\n")
    except WebSocketDisconnect:
        print("Client disconnected from playbook stream.")
    except Exception as e:
        await websocket.send_text(f"\n\033[1;31m[ERROR] {str(e)}\033[0m\n")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
