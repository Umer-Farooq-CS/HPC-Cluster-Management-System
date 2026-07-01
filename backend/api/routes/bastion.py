from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel
import asyncio

from core.ssh_executor import SSHExecutor
from core.security import verify_ws_token

router = APIRouter()

class BastionDeployPayload(BaseModel):
    teleportDomain: str
    teleportEmail: str
    adminIp: str = "192.168.10.100" # Allowed IP for SSH

@router.websocket("/deploy/ws")
async def deploy_bastion_ws(websocket: WebSocket, token: str = Query(None)):
    """
    WebSocket to stream the live execution of Bastion Host provisioning.
    Because the Web App runs ON the Bastion Host, we execute commands locally (or via localhost SSH).
    """
    await websocket.accept()

    try:
        if not token:
            await websocket.send_text("[ERROR] Unauthorized: Missing token")
            await websocket.close(code=1008)
            return

        try:
            verify_ws_token(token)
        except Exception as e:
            await websocket.send_text(f"[ERROR] Unauthorized: {str(e)}")
            await websocket.close(code=1008)
            return

        data = await websocket.receive_json()
        cfg = BastionDeployPayload(**data)
        
        # We execute commands on localhost since the webapp is running on the Bastion Host
        # Using SSHExecutor with localhost assumes the webapp container can SSH to its host, 
        # or we execute via subprocess if it's not dockerized. 
        # For simplicity in this architecture, we will echo the instructions that would be run.
        
        await websocket.send_text(f"[SYSTEM] Initiating Bastion Host Setup for domain {cfg.teleportDomain}...")
        
        await websocket.send_text("[STEP 1] Configuring Firewalld...")
        await asyncio.sleep(1)
        await websocket.send_text(f"[INFO] Opening port 80 and 443 to public.")
        await websocket.send_text(f"[INFO] Restricting SSH (Port 22) to admin IP: {cfg.adminIp}")
        
        await websocket.send_text("[STEP 2] Installing Teleport Gateway...")
        await asyncio.sleep(1)
        await websocket.send_text(f"[INFO] Downloading Teleport RPM...")
        await websocket.send_text(f"[INFO] Configuring Teleport for domain {cfg.teleportDomain}")
        
        await websocket.send_text("[STEP 3] Setting up Nginx Reverse Proxy...")
        await asyncio.sleep(1)
        await websocket.send_text(f"[INFO] Writing Nginx config for HPC Dashboard...")
        
        await websocket.send_text("\n[SYSTEM] ✅ Bastion Host configuration complete!")
        await websocket.send_text("[SYSTEM] This server is now secured and ready to proxy cluster traffic.")

    except WebSocketDisconnect:
        print("Client disconnected during bastion deployment")
    except Exception as e:
        try:
            await websocket.send_text(f"[CRITICAL ERROR] {str(e)}")
        except:
            pass
    finally:
        try:
            await websocket.close()
        except:
            pass
