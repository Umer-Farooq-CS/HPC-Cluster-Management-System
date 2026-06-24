import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from core.ssh_executor import SSHExecutor
from core.config import settings

router = APIRouter()

# --- Pydantic Models for State ---
class ComputeNode(BaseModel):
    id: str
    hostname: str
    mac: str
    ip: str
    assignedImage: str
    isEditing: Optional[bool] = None

class ImageConfig(BaseModel):
    name: str
    source: str = ""
    fastestMirror: bool = True
    maxDownloads: int = 10
    dnfTimeout: int = 5
    minRate: int = 10000
    excludePkgs: str = "linux-firmware*"
    installEpel: bool = True
    enableCrb: bool = True
    installOhpc: bool = True
    packages: str = "ohpc-base-compute, ohpc-slurm-client, chrony, lmod-ohpc, nhc-ohpc"
    enabledServices: str = "munge, slurmd, chronyd"
    ntpServer: str = "192.168.20.1"
    makeStep: str = "1 -1"
    forceSync: bool = True
    memlockUnlimited: bool = True
    pamSlurmRestrict: bool = True
    syslogTarget: str = "192.168.10.2"
    syslogPort: int = 514
    buildOverlays: bool = True
    forceDracut: bool = True

class ClusterGroup(BaseModel):
    name: str
    members: str

class SlaveDeploymentPayload(BaseModel):
    nodes: List[ComputeNode]
    images: Dict[str, Any]
    groups: Optional[List[ClusterGroup]] = None
    overwrite: Optional[bool] = False

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete
from core.database import get_db
from models.slaves import ComputeNodeDB, ClusterGroupDB
from core.security import get_current_user, SECRET_KEY, ALGORITHM
import jwt
@router.get("/arp")
async def get_arp_table(user: dict = Depends(get_current_user)):
    """
    Executes a network scan/ARP lookup on the Master Node to discover connected physical devices.
    Returns a list of MAC and IP addresses.
    """
    executor = SSHExecutor(host=settings.MASTER_IP, username=settings.MASTER_USER, password=settings.MASTER_PASS)
    
    import re
    discovered = []
    # Run a general neighbor show across all interfaces
    cmd = "ip neighbor show"
    
    try:
        # We will collect the output
        mac_pattern = re.compile(r'([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})')
        seen_macs = set()
        raw_output = []
        
        async for line in executor.run_command_stream(cmd):
            raw_output.append(line)
            if "ERROR" in line or "FAILED" in line:
                continue
            
            # Find all MAC addresses in the line
            matches = mac_pattern.findall(line)
            for mac in matches:
                mac_upper = mac.upper()
                if mac_upper not in seen_macs:
                    seen_macs.add(mac_upper)
                    # Return empty IP so the user can assign their own static IP
                    discovered.append({"ip": "", "mac": mac_upper})
                    
        return {"status": "success", "devices": discovered, "rawOutput": raw_output}
    except Exception as e:
        return {"status": "error", "message": str(e), "devices": [], "rawOutput": [str(e)]}

@router.get("/registered")
async def get_registered_nodes(user: dict = Depends(get_current_user)):
    """
    Fetches the list of already registered nodes from Warewulf.
    """
    executor = SSHExecutor(host=settings.MASTER_IP, username=settings.MASTER_USER, password=settings.MASTER_PASS)
    cmd = "wwctl node list -a --json"
    
    try:
        raw_output = []
        async for line in executor.run_command_stream(cmd):
            raw_output.append(line)
            
        json_str = "\n".join(raw_output)
        # Warewulf might output non-JSON lines (like warnings), so find start of JSON
        start_idx = json_str.find("{")
        if start_idx != -1:
            json_str = json_str[start_idx:]
        
        if not json_str.strip() or start_idx == -1:
            return {"status": "success", "nodes": []}
            
        data = json.loads(json_str)
        nodes = []
        for hostname, info in data.items():
            mac = ""
            ip = ""
            image = info.get("image name", "almalinux-9")
            net_devices = info.get("network devices", {})
            if "default" in net_devices:
                mac = net_devices["default"].get("hwaddr", "")
                ip = net_devices["default"].get("ipaddr", "")
            
            nodes.append({
                "id": mac or hostname,
                "hostname": hostname,
                "mac": mac.upper(),
                "ip": ip,
                "assignedImage": image,
                "isRegistered": True,
                "originalMac": mac.upper()
            })
            
        return {"status": "success", "nodes": nodes}
    except Exception as e:
        return {"status": "error", "message": str(e), "nodes": []}

@router.websocket("/deploy/ws")
async def deploy_slaves_ws(websocket: WebSocket, db: AsyncSession = Depends(get_db)):
    """
    Accepts deployment config as the first WebSocket message (JSON),
    then executes the pipeline and streams output back to the client.
    """
    await websocket.accept()

    try:
        # Receive the deployment config as the first message
        data = await asyncio.wait_for(websocket.receive_json(), timeout=10.0)
        
        # Token Validation
        token = data.get("token")
        try:
            jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        except Exception as e:
            await websocket.send_text(f"[ERROR] Unauthorized: {str(e)}")
            await websocket.close(code=1008)
            return

        nodes_data = data.get("nodes", [])
        groups_data = data.get("groups", [])
        
        if not nodes_data:
            await websocket.send_text("[ERROR] No nodes received in deployment payload.")
            await websocket.close()
            return

        # ---------------------------------------------------------
        # DB Persistence: Clear old state and insert new
        # ---------------------------------------------------------
        await db.execute(delete(ComputeNodeDB))
        await db.execute(delete(ClusterGroupDB))
        
        for n in nodes_data:
            db_node = ComputeNodeDB(
                id=n["mac"],
                hostname=n["hostname"],
                mac=n["mac"],
                ip=n["ip"],
                assignedImage=n.get("assignedImage"),
                sockets=n.get("sockets", 1),
                coresPerSocket=n.get("coresPerSocket", 4),
                threadsPerCore=n.get("threadsPerCore", 1)
            )
            db.add(db_node)
            
        for g in groups_data:
            db_group = ClusterGroupDB(
                name=g["name"],
                members=g.get("members", ""),
                autoSync=g.get("autoSync", False)
            )
            db.add(db_group)
            
        await db.commit()
        await websocket.send_text("[SYSTEM] Cluster configuration persisted to database successfully.")
        # ---------------------------------------------------------

        executor = SSHExecutor(
            host=settings.MASTER_IP,
            username=settings.MASTER_USER,
            password=settings.MASTER_PASS,
        )

        node_names = [n["hostname"] for n in nodes_data]
        nodes_csv = ",".join(node_names)

        await websocket.send_text("[SYSTEM] Connection established. Starting Phase 4 Deployment...")
        await websocket.send_text(f"[SYSTEM] Target Nodes: {', '.join(node_names)}")

        async def run_and_check(cmd: str, step_name: str):
            async for line in executor.run_command_stream(cmd):
                await websocket.send_text(line)
                if "[ERROR]" in line or "[SSH ERROR]" in line or "[SYSTEM ERROR]" in line:
                    raise Exception(f"{step_name} failed. Halting deployment.")

        overwrite_flag = data.get("overwrite", False)

        # Step 1: Install tools
        await websocket.send_text("[STEP 1] Installing required packages (clustershell, genders)...")
        await run_and_check("dnf -y install clustershell genders-ohpc 2>&1", "Step 1")

        # Step 2: Register nodes in Warewulf
        await websocket.send_text("[STEP 2] Registering nodes in Warewulf...")
        for node in nodes_data:
            hostname = node["hostname"]
            mac = node["mac"]
            ip = node["ip"]
            image = node.get("assignedImage", "almalinux-9")
            await websocket.send_text(f"  -> Registering {hostname} ({mac}) with image {image}")
            if overwrite_flag:
                cmd_add = f"wwctl node delete {hostname} --yes 2>/dev/null; wwctl node add {hostname} --image {image} --profile nodes --netname default --ipaddr={ip} --hwaddr={mac} 2>&1"
            else:
                cmd_add = f"wwctl node add {hostname} --image {image} --profile nodes --netname default --ipaddr={ip} --hwaddr={mac} 2>&1"
            await run_and_check(cmd_add, f"Node registration ({hostname})")

        # Step 3: Rebuild Overlays
        await websocket.send_text("[STEP 3] Rebuilding Warewulf DHCP and Node Overlays...")
        await run_and_check("wwctl overlay build && wwctl configure --all 2>&1", "Step 3")

        # Step 4: Slurm Configuration
        await websocket.send_text("[STEP 4] Updating Slurm Configuration with Compute Node Names...")

        # Group nodes by their hardware topology so we can write one NodeName line per topology group
        from collections import defaultdict
        topo_groups: dict = defaultdict(list)
        for node in nodes_data:
            sockets = node.get("sockets", 1)
            cores   = node.get("coresPerSocket", 4)
            threads = node.get("threadsPerCore", 1)
            key = (sockets, cores, threads)
            topo_groups[key].append(node["hostname"])

        # Build NodeName= lines
        node_name_lines = []
        for (sockets, cores, threads), hostnames in topo_groups.items():
            csv = ",".join(hostnames)
            node_name_lines.append(
                f"NodeName={csv} Sockets={sockets} CoresPerSocket={cores} ThreadsPerCore={threads} State=UNKNOWN"
            )

        # Delete all existing NodeName/PartitionName lines, then append fresh ones
        partition_nodes = nodes_csv
        slurm_cmd_parts = [
            "sed -i '/^NodeName=/d' /etc/slurm/slurm.conf",
            "sed -i '/^PartitionName=/d' /etc/slurm/slurm.conf",
        ]
        for nl in node_name_lines:
            escaped = nl.replace("/", "\\/").replace("'", "'\\''")
            slurm_cmd_parts.append(f"echo '{nl}' >> /etc/slurm/slurm.conf")
        slurm_cmd_parts.append(
            f"echo 'PartitionName=normal Nodes={partition_nodes} Default=YES MaxTime=24:00:00 State=UP' >> /etc/slurm/slurm.conf"
        )
        slurm_cmd_parts.append("systemctl restart slurmctld 2>&1")
        await run_and_check(" && ".join(slurm_cmd_parts), "Step 4")

        # Step 5: ClusterShell Groups
        await websocket.send_text("[STEP 5] Configuring ClusterShell Groups & Genders Database...")
        
        # Write to clustershell local.cfg
        cshell_lines = [f"echo '{g['name']}: {g['members']}' >> /etc/clustershell/groups.d/local.cfg" for g in groups_data]
        if not cshell_lines:
            cshell_lines = [
                f"echo 'adm: master' >> /etc/clustershell/groups.d/local.cfg",
                f"echo 'compute: {nodes_csv}' >> /etc/clustershell/groups.d/local.cfg",
                f"echo 'all: @adm,@compute' >> /etc/clustershell/groups.d/local.cfg"
            ]
        
        cmd_c_shell = f"rm -f /etc/clustershell/groups.d/local.cfg && " + " && ".join(cshell_lines) + " 2>&1"
        await run_and_check(cmd_c_shell, "Step 5 (ClusterShell)")

        # Write to genders
        genders_lines = [f"echo -e '{g['members']}\\t{g['name']}' >> /etc/genders" for g in groups_data if not g['members'].startswith('@')]
        
        # Expand out CSV members into individual rows for genders file
        expanded_genders = []
        for g in groups_data:
            if not g['members'].startswith('@'):
                for member in g['members'].split(','):
                    m = member.strip()
                    if m:
                        expanded_genders.append(f"echo -e '{m}\\t{g['name']}' >> /etc/genders")
        
        if not expanded_genders:
            expanded_genders = ["echo -e 'master\\tsms' >> /etc/genders"]
            for node in node_names:
                expanded_genders.append(f"echo -e '{node}\\tcompute' >> /etc/genders")

        cmd_genders = f"rm -f /etc/genders && " + " && ".join(expanded_genders) + " 2>&1"
        await run_and_check(cmd_genders, "Step 5 (Genders)")

        await websocket.send_text("\n[SYSTEM] Deployment completed successfully!")
        await websocket.send_text("============================================================")
        await websocket.send_text(">>> ACTION REQUIRED: Power on all Compute Nodes MANUALLY.")
        await websocket.send_text(">>> They will PXE boot over the provisioning network.")
        await websocket.send_text("============================================================")

    except asyncio.TimeoutError:
        try:
            await websocket.send_text("[ERROR] Timed out waiting for deployment config from client.")
        except:
            pass
    except WebSocketDisconnect:
        print("Client disconnected during deployment")
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
