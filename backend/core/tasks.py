import asyncio
import redis
import json
from celery import shared_task
from core.celery_app import celery_app
from core.ssh_executor import SSHExecutor
from core.config import settings

# Redis client for streaming logs and caching Slurm state
redis_client = redis.Redis(host="redis", port=6379, db=0, decode_responses=True)

def _stream_cmd_sync(task_id: str, executor: SSHExecutor, cmd: str):
    """
    Runs the SSH command synchronously within the Celery worker and
    pushes each line of output to a Redis List so the WebSocket can tail it.
    """
    redis_key = f"task_logs:{task_id}"
    
    # We use a synchronous wrapper around the async SSH execution
    async def _run():
        try:
            async for line in executor.run_command_stream(cmd):
                # Push log line to Redis list
                redis_client.rpush(redis_key, line)
                # Keep logs for 24 hours
                redis_client.expire(redis_key, 86400)
            redis_client.rpush(redis_key, "__EOF__")
        except Exception as e:
            redis_client.rpush(redis_key, f"ERROR: {str(e)}")
            redis_client.rpush(redis_key, "__EOF__")
            
    asyncio.run(_run())

@shared_task(bind=True)
def build_image_task(self, build_config: dict):
    """Background task to build an OS image."""
    task_id = self.request.id
    executor = SSHExecutor(
        host=settings.MASTER_IP,
        username=settings.MASTER_USER,
        password=settings.MASTER_PASS,
    )
    
    # Example logic reconstructed from routes/images.py
    os_version = build_config.get("os_version", "9")
    cmd = f"wwctl container import docker://almalinux:{os_version} rocky{os_version} --force 2>&1"
    
    redis_client.rpush(f"task_logs:{task_id}", f"Starting image build for AlmaLinux {os_version}...\n")
    _stream_cmd_sync(task_id, executor, cmd)
    return {"status": "completed"}

@shared_task(bind=True)
def deploy_slaves_task(self, deploy_config: dict):
    """Background task to deploy compute nodes."""
    task_id = self.request.id
    executor = SSHExecutor(
        host=settings.MASTER_IP,
        username=settings.MASTER_USER,
        password=settings.MASTER_PASS,
    )
    
    # Example command (would be parameterized in reality)
    cmd = "wwctl node set --yes --netname default --ipaddr 192.168.20.10 --hwaddr 00:11:22:33:44:55 n01 2>&1"
    
    redis_client.rpush(f"task_logs:{task_id}", f"Starting slave deployment...\n")
    _stream_cmd_sync(task_id, executor, cmd)
    return {"status": "completed"}

@shared_task(bind=True)
def run_playbook_task(self, playbook_config: dict):
    """Background task to run an Ansible playbook."""
    task_id = self.request.id
    executor = SSHExecutor(
        host=settings.MASTER_IP,
        username=settings.MASTER_USER,
        password=settings.MASTER_PASS,
    )
    
    cmd = "ansible-playbook -i /etc/ansible/hosts /etc/ansible/playbooks/site.yml 2>&1"
    
    redis_client.rpush(f"task_logs:{task_id}", f"Running Ansible playbook...\n")
    _stream_cmd_sync(task_id, executor, cmd)
    return {"status": "completed"}

@shared_task(bind=True)
def rebuild_warewulf_overlays_task(self):
    """Debounced task to rebuild Warewulf overlays."""
    executor = SSHExecutor(
        host=settings.MASTER_IP,
        username=settings.MASTER_USER,
        password=settings.MASTER_PASS,
    )
    cmd = "wwctl overlay build -A 2>&1"
    
    async def _run():
        lines = []
        async for line in executor.run_command_stream(cmd):
            lines.append(line)
        return "".join(lines)
        
    result = asyncio.run(_run())
    return {"status": "completed", "output": result}

@celery_app.task
def poll_slurm_metadata():
    """
    Periodically fetches Slurm squeue and sinfo.
    This replaces the SSH storm on the /overview endpoint.
    """
    executor = SSHExecutor(
        host=settings.MASTER_IP,
        username=settings.MASTER_USER,
        password=settings.MASTER_PASS,
    )
    
    async def _run():
        results = await asyncio.gather(
            _get_cmd_output(executor, "scontrol show nodes 2>&1"),
            _get_cmd_output(executor, "squeue --noheader -o '%i %j %u %t %M %D %C %R' 2>&1"),
            _get_cmd_output(executor, "sinfo --summarize --noheader 2>&1"),
            _get_cmd_output(executor, "sinfo --noheader -o '%n %t %c %m %e %O %G %D' 2>&1"),
            return_exceptions=True
        )
        # Parse and save to Redis...
        # For brevity, just saving raw for now
        redis_client.set("slurm_overview_cache", json.dumps({
            "raw_nodes": results[0] if not isinstance(results[0], Exception) else "",
            "raw_squeue": results[1] if not isinstance(results[1], Exception) else "",
            "raw_summary": results[2] if not isinstance(results[2], Exception) else "",
            "raw_sinfo": results[3] if not isinstance(results[3], Exception) else ""
        }))
        
    async def _get_cmd_output(executor, cmd):
        lines = []
        async for line in executor.run_command_stream(cmd):
            lines.append(line)
        return "\n".join(lines)
        
    asyncio.run(_run())
