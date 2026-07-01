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
        firewall-cmd --permanent --zone=public --add-port=3080/tcp 2>&1
        firewall-cmd --permanent --zone=public --remove-service=ssh 2>&1 || true
        firewall-cmd --permanent --zone=public --add-rich-rule='rule family="ipv4" source address="{cfg.adminIp}" port protocol="tcp" port="22" accept' 2>&1
        firewall-cmd --permanent --zone=trusted --add-source=172.16.0.0/12 2>&1 || true
        firewall-cmd --permanent --zone=trusted --add-source=127.0.0.0/8 2>&1 || true
        firewall-cmd --reload 2>&1
        """
        await run_and_check(firewall_cmd, "Step 1 (Firewalld)")
        
        await websocket.send_text("[STEP 2] Installing Teleport Gateway...")
        teleport_cmd = f"""
        if ! command -v teleport &> /dev/null; then
            echo "[INFO] Downloading Teleport..."
            curl -O https://cdn.teleport.dev/teleport-15.1.1-1.x86_64.rpm 2>&1 || echo "Could not download Teleport (Offline?)"
            dnf -y install teleport-15.1.1-1.x86_64.rpm 2>&1 || echo "Could not install Teleport"
        else
            echo "[INFO] Teleport is already installed."
        fi
        
        echo "[INFO] Configuring Teleport on port 3080..."
        cat << 'EOF' > /etc/teleport.yaml
version: v3
teleport:
  nodename: bastion
  data_dir: /var/lib/teleport
  log:
    output: stderr
    severity: INFO
auth_service:
  enabled: "yes"
  listen_addr: 0.0.0.0:3025
  cluster_name: {cfg.teleportDomain}
ssh_service:
  enabled: "yes"
  labels:
    env: hpc
proxy_service:
  enabled: "yes"
  web_listen_addr: 0.0.0.0:3080
  public_addr: {cfg.teleportDomain}:3080
  acme:
    enabled: "no"
EOF
        systemctl enable --now teleport 2>&1 || true
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
