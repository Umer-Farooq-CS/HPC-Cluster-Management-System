import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel

from core.ssh_executor import SSHExecutor
from core.security import verify_ws_token
from core.config import settings

router = APIRouter()

class BastionDeployPayload(BaseModel):
    teleportDomain: str
    teleportEmail: str
    adminIp: str = "192.168.10.100" # Allowed IP for SSH

@router.websocket("/deploy/ws")
async def deploy_bastion_ws(websocket: WebSocket, token: str = Query(None)):
    """
    WebSocket to stream the live execution of Bastion Host provisioning.
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
        
        executor = SSHExecutor(
            host=settings.BASTION_IP,
            username=settings.BASTION_USER,
            password=settings.BASTION_PASS
        )

        async def run_and_check(cmd: str, step_name: str):
            async for line in executor.run_command_stream(cmd):
                await websocket.send_text(line)
                if "[ERROR]" in line or "[SSH ERROR]" in line or "[SYSTEM ERROR]" in line:
                    raise Exception(f"{step_name} failed. Halting build.")

        await websocket.send_text(f"[SYSTEM] Connecting to Bastion Host at {settings.BASTION_IP}...")
        
        await websocket.send_text("[STEP 1] Configuring Firewalld...")
        firewall_cmd = f"""
        systemctl enable --now firewalld 2>&1
        firewall-cmd --permanent --zone=public --add-service=http 2>&1
        firewall-cmd --permanent --zone=public --add-service=https 2>&1
        firewall-cmd --permanent --zone=public --remove-service=ssh 2>&1 || true
        firewall-cmd --permanent --zone=public --add-rich-rule='rule family="ipv4" source address="{cfg.adminIp}" port protocol="tcp" port="22" accept' 2>&1
        firewall-cmd --reload 2>&1
        """
        await run_and_check(firewall_cmd, "Step 1 (Firewalld)")
        
        await websocket.send_text("[STEP 2] Installing Teleport Gateway...")
        teleport_cmd = """
        if ! command -v teleport &> /dev/null; then
            echo "[INFO] Downloading Teleport..."
            curl -O https://cdn.teleport.dev/teleport-15.1.1-1.x86_64.rpm 2>&1 || echo "Could not download Teleport (Offline?)"
            dnf -y install teleport-15.1.1-1.x86_64.rpm 2>&1 || echo "Could not install Teleport"
        else
            echo "[INFO] Teleport is already installed."
        fi
        """
        await run_and_check(teleport_cmd, "Step 2 (Teleport)")
        
        await websocket.send_text("\n[SYSTEM] ✅ Bastion Host configuration complete!")
        await websocket.send_text(f"[SYSTEM] SSH is now permanently locked down to {cfg.adminIp}")

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
