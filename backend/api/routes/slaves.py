import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from core.ssh_executor import SSHExecutor
from core.config import settings
from core.locks import deployment_lock
import shlex

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
from core.security import get_current_user, verify_ws_token
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

# ─── Deploy Slaves ─────────────────────────────────────────────────────────────
from core.tasks import deploy_slaves_task

@router.post("/deploy")
async def deploy_slaves(payload: SlaveDeploymentPayload, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Persists configuration and triggers the Celery task to deploy compute nodes.
    Returns a task_id that the frontend can use to tail logs.
    """
    if deployment_lock.locked():
        return {"status": "error", "message": "A deployment or build is already in progress. Please wait."}

    # DB Persistence: Clear old state and insert new
    await db.execute(delete(ComputeNodeDB))
    await db.execute(delete(ClusterGroupDB))
    
    for n in payload.nodes:
        db_node = ComputeNodeDB(
            id=n.mac,
            hostname=n.hostname,
            mac=n.mac,
            ip=n.ip,
            assignedImage=n.assignedImage,
            sockets=getattr(n, "sockets", 1),
            coresPerSocket=getattr(n, "coresPerSocket", 4),
            threadsPerCore=getattr(n, "threadsPerCore", 1)
        )
        db.add(db_node)
        
    if payload.groups:
        for g in payload.groups:
            db_group = ClusterGroupDB(
                name=g.name,
                members=g.members,
                autoSync=getattr(g, "autoSync", False)
            )
            db.add(db_group)
        
    await db.commit()
    
    # Trigger Celery task
    task = deploy_slaves_task.delay(payload.dict())
    
    return {"status": "success", "task_id": task.id}
