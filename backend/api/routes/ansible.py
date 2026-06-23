import os
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List
from core.ssh_executor import SSHExecutor
from core.config import settings

router = APIRouter()

# The directory on the Master Node where playbooks are stored
REMOTE_ANSIBLE_DIR = "/opt/hpc-cluster-system/scripts/ansible"

@router.get("/playbooks", response_model=List[str])
async def list_playbooks():
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
async def run_playbook(websocket: WebSocket, playbook_name: str):
    """Run an Ansible playbook and stream the output back to the client."""
    await websocket.accept()
    
    executor = SSHExecutor(
        host=settings.MASTER_IP,
        username=settings.MASTER_USER,
        password=settings.MASTER_PASS
    )
    
    # Command runs ansible-playbook on the remote node inside the scripts/ansible directory
    # so that inventory files are resolved correctly.
    command = f"cd {REMOTE_ANSIBLE_DIR} && ansible-playbook -i inventory.ini {playbook_name}"
    
    try:
        await websocket.send_text(f"\033[1;34m[*] Executing Playbook: {playbook_name} on {settings.MASTER_IP}...\033[0m\n")
        
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
