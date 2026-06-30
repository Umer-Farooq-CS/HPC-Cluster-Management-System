import os
from celery import Celery

# Ensure we have a broker URL (using Redis container from docker-compose)
redis_url = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")

celery_app = Celery(
    "hpc_tasks",
    broker=redis_url,
    backend=redis_url,
    include=["core.tasks"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "poll_slurm_metadata_every_10s": {
            "task": "core.tasks.poll_slurm_metadata",
            "schedule": 10.0,
        },
    }
)
