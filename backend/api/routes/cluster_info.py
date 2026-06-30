"""
cluster_info.py — Live cluster statistics via SSH
Runs real HPC commands (sinfo, squeue, uptime, df, free) on the master node
and returns structured JSON for the frontend dashboard.
"""

import asyncio
import re
from fastapi import APIRouter, Depends
from core.ssh_executor import SSHExecutor
from core.config import settings
from core.security import get_current_user

router = APIRouter()


async def _run_cmd(executor: SSHExecutor, cmd: str) -> str:
    """Run a command via SSH and return all stdout as a single string."""
    lines = []
    async for line in executor.run_command_stream(cmd):
        lines.append(line)
    return "\n".join(lines)


def _parse_sinfo(raw: str) -> list:
    """
    Parse `sinfo --noheader -o "%n %t %c %m %e %O %G %D"` output.
    Fields: NodeList State CPUs Memory FreeMem CPULoad Gres Nodes
    """
    nodes = []
    for line in raw.strip().splitlines():
        if not line or line.startswith("[") or "ERROR" in line or "SSH" in line:
            continue
        parts = line.split()
        if len(parts) < 8:
            continue
        nodelist, state, cpus, mem_mb, free_mem_mb, load, gres, node_count = (
            parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], parts[6], parts[7]
        )

        # Convert MB to human-readable
        def mb_to_human(mb_str):
            try:
                mb = int(mb_str)
                if mb >= 1024:
                    return f"{mb // 1024} GB"
                return f"{mb} MB"
            except ValueError:
                return mb_str

        nodes.append({
            "nodelist": nodelist,
            "state": state.upper(),
            "cpus": cpus,
            "memory": mb_to_human(mem_mb),
            "free_memory": mb_to_human(free_mem_mb),
            "cpu_load": load,
            "gres": gres if gres != "(null)" else "None",
            "node_count": node_count,
        })
    return nodes


def _parse_squeue(raw: str) -> list:
    """
    Parse `squeue --noheader -o "%i %j %u %t %M %D %C %R"` output.
    Fields: JobID Name User State Time Nodes CPUs Reason
    """
    jobs = []
    for line in raw.strip().splitlines():
        if not line or "ERROR" in line or "SSH" in line:
            continue
        parts = line.split(None, 7)  # split on whitespace, max 8 parts
        if len(parts) < 7:
            continue
        jobs.append({
            "job_id": parts[0],
            "name": parts[1],
            "user": parts[2],
            "state": parts[3],
            "time": parts[4],
            "nodes": parts[5],
            "cpus": parts[6],
            "reason": parts[7] if len(parts) > 7 else "",
        })
    return jobs


def _parse_uptime(raw: str) -> dict:
    """Parse Linux `uptime` output."""
    # Example: " 09:12:01 up 45 days,  3:22,  2 users,  load average: 0.01, 0.05, 0.01"
    result = {"raw": raw.strip(), "uptime": "N/A", "users": "N/A", "load_avg": "N/A"}
    m = re.search(r"up\s+(.*?),\s+\d+ user", raw)
    if m:
        result["uptime"] = m.group(1).strip()
    m_users = re.search(r"(\d+)\s+user", raw)
    if m_users:
        result["users"] = m_users.group(1)
    m_load = re.search(r"load average:\s+(.+)", raw)
    if m_load:
        result["load_avg"] = m_load.group(1).strip()
    return result


def _parse_df(raw: str) -> list:
    """Parse `df -h` output (skip header)."""
    mounts = []
    lines = raw.strip().splitlines()
    for line in lines[1:]:  # skip header
        if not line or "ERROR" in line or "SSH" in line:
            continue
        parts = line.split()
        if len(parts) < 6:
            continue
        mounts.append({
            "filesystem": parts[0],
            "size": parts[1],
            "used": parts[2],
            "avail": parts[3],
            "use_pct": parts[4],
            "mount": parts[5],
        })
    return mounts


def _parse_free(raw: str) -> dict:
    """Parse `free -h` output."""
    result = {}
    for line in raw.strip().splitlines():
        if line.startswith("Mem:"):
            parts = line.split()
            result["total"] = parts[1]
            result["used"] = parts[2]
            result["free"] = parts[3]
            result["available"] = parts[6] if len(parts) > 6 else "N/A"
        elif line.startswith("Swap:"):
            parts = line.split()
            result["swap_total"] = parts[1]
            result["swap_used"] = parts[2]
    return result


def _parse_slurm_info(raw: str) -> dict:
    """Parse `sinfo --summarize` to get cluster totals."""
    result = {"total_nodes": 0, "idle": 0, "alloc": 0, "down": 0, "total_cpus": 0, "alloc_cpus": 0}
    # scontrol show partition gives richer data but sinfo -a --summarize is simpler
    for line in raw.strip().splitlines():
        if not line or line.startswith("PARTITION") or "ERROR" in line or "SSH" in line:
            continue
        # PARTITION AVAIL TIMELIMIT NODES(A/I/O/T) NODELIST
        parts = line.split()
        if len(parts) >= 4:
            node_counts = parts[3]  # format: A/I/O/T
            try:
                a, i, o, t = node_counts.split("/")
                result["total_nodes"] += int(t)
                result["alloc"] += int(a)
                result["idle"] += int(i)
                result["down"] += int(o)
            except Exception:
                pass
    return result


def _parse_scontrol_nodes(raw: str) -> list:
    """
    Parse `scontrol show nodes` to get per-node details.
    Falls back to empty list on parse failure.
    """
    nodes = []
    current = {}
    
    for line in raw.strip().splitlines():
        if line.strip().startswith("NodeName="):
            if current:
                nodes.append(current)
            current = {}
        
        # Split multiple key=value pairs on same line
        for kv in re.findall(r'(\w+)=(\S+)', line):
            key, val = kv
            current[key] = val
    
    if current:
        nodes.append(current)
    
    result = []
    for n in nodes:
        name = n.get("NodeName", "unknown")
        state = n.get("State", "UNKNOWN")
        cpus = n.get("CPUTot", "?")
        cpus_load = n.get("CPULoad", "N/A")
        mem = n.get("RealMemory", "?")
        free_mem = n.get("FreeMem", "?")
        alloc_cpus = n.get("CPUAlloc", "0")
        gres = n.get("Gres", "None")
        os_info = n.get("OS", "N/A")
        arch = n.get("Arch", "N/A")
        threads = n.get("ThreadsPerCore", "?")
        sockets = n.get("Sockets", "?")
        cores = n.get("CoresPerSocket", "?")
        reason = n.get("Reason", "")
        active_jobs = n.get("NumJobs", "0")

        def mb_to_human(mb_str):
            try:
                mb = int(mb_str)
                return f"{mb // 1024} GB" if mb >= 1024 else f"{mb} MB"
            except ValueError:
                return mb_str

        result.append({
            "name": name,
            "state": state.upper(),
            "cpus": cpus,
            "cpus_alloc": alloc_cpus,
            "cpu_load": cpus_load,
            "memory": mb_to_human(mem),
            "free_memory": mb_to_human(free_mem),
            "gres": gres if gres != "(null)" else "None",
            "arch": arch,
            "sockets": sockets,
            "cores_per_socket": cores,
            "threads_per_core": threads,
            "reason": reason if reason not in ("none", "None", "") else None,
            "active_jobs": active_jobs,
        })
    return result


@router.get("/overview")
async def get_cluster_overview(user: dict = Depends(get_current_user)):
    """
    Returns a full cluster overview:
    - Slurm node states (scontrol show nodes)
    - Job queue (squeue)
    - Slurm partition summary (sinfo --summarize)
    - Master node uptime
    - Master node memory (free -h)
    - Master node disk (df -h)
    """
    executor = SSHExecutor(
        host=settings.MASTER_IP,
        username=settings.MASTER_USER,
        password=settings.MASTER_PASS,
    )

    # Run all commands concurrently
    results = await asyncio.gather(
        _run_cmd(executor, "scontrol show nodes 2>&1"),
        _run_cmd(executor, "squeue --noheader -o '%i %j %u %t %M %D %C %R' 2>&1"),
        _run_cmd(executor, "sinfo --summarize --noheader 2>&1"),
        _run_cmd(executor, "uptime 2>&1"),
        _run_cmd(executor, "free -h 2>&1"),
        _run_cmd(executor, "df -h --output=source,size,used,avail,pcent,target 2>&1"),
        _run_cmd(executor, "hostname && uname -r && cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"' 2>&1"),
        _run_cmd(executor, "sinfo --noheader -o '%n %t %c %m %e %O %G %D' 2>&1"),
        return_exceptions=True,
    )

    raw_nodes, raw_squeue, raw_summary, raw_uptime, raw_free, raw_df, raw_host, raw_sinfo = results

    # Parse each result (gracefully handle errors)
    def safe(fn, raw, fallback):
        try:
            if isinstance(raw, Exception):
                return fallback
            return fn(raw)
        except Exception:
            return fallback

    nodes = safe(_parse_scontrol_nodes, raw_nodes, [])
    jobs = safe(_parse_squeue, raw_squeue, [])
    summary = safe(_parse_slurm_info, raw_summary, {})
    uptime_info = safe(_parse_uptime, raw_uptime, {"raw": str(raw_uptime)})
    memory = safe(_parse_free, raw_free, {})
    disks = safe(_parse_df, raw_df, [])

    # Parse master node hostname/kernel/os
    master_info = {"hostname": "master", "kernel": "N/A", "os": "N/A"}
    if not isinstance(raw_host, Exception):
        host_lines = [l.strip() for l in raw_host.strip().splitlines() if l.strip()]
        if len(host_lines) >= 1:
            master_info["hostname"] = host_lines[0]
        if len(host_lines) >= 2:
            master_info["kernel"] = host_lines[1]
        if len(host_lines) >= 3:
            master_info["os"] = host_lines[2]

    return {
        "status": "success",
        "master": {
            **master_info,
            "ip": settings.MASTER_IP,
            "uptime": uptime_info,
            "memory": memory,
        },
        "nodes": nodes,
        "jobs": jobs,
        "summary": summary,
        "disks": disks,
    }


@router.get("/jobs")
async def get_jobs(user: dict = Depends(get_current_user)):
    """Return live Slurm job queue."""
    executor = SSHExecutor(
        host=settings.MASTER_IP,
        username=settings.MASTER_USER,
        password=settings.MASTER_PASS,
    )
    raw = await _run_cmd(executor, "squeue --noheader -o '%i %j %u %t %M %D %C %R' 2>&1")
    return {"status": "success", "jobs": _parse_squeue(raw)}
