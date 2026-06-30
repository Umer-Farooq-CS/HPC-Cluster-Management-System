import asyncio

# Global lock to prevent concurrent deployments or image builds
deployment_lock = asyncio.Lock()
