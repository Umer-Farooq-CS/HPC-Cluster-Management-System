import asyncio
import redis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from core.security import verify_ws_token

router = APIRouter()
redis_client = redis.Redis(host="redis", port=6379, db=0, decode_responses=True)

@router.websocket("/{task_id}")
async def stream_task_logs(websocket: WebSocket, task_id: str, token: str = Query(None)):
    """
    Streams task logs from Redis to the client.
    Replays the entire history first, then waits for new lines.
    """
    await websocket.accept()
    
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
        
    redis_key = f"task_logs:{task_id}"
    last_idx = 0
    
    try:
        while True:
            length = redis_client.llen(redis_key)
            if length > last_idx:
                lines = redis_client.lrange(redis_key, last_idx, length - 1)
                for line in lines:
                    await websocket.send_text(line)
                    if line == "__EOF__":
                        await websocket.close(code=1000)
                        return
                last_idx = length
            
            await asyncio.sleep(0.5)
            
    except WebSocketDisconnect:
        pass
