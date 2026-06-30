import asyncssh
import asyncio
from typing import AsyncGenerator
from core.config import settings

# How long (seconds) to wait for the SSH handshake to complete
SSH_CONNECT_TIMEOUT = 10

# How long (seconds) a command can produce NO output before we treat it as hung
# This is a per-line idle timeout, not a total command timeout.
SSH_IDLE_TIMEOUT = 600

class SSHExecutor:
    def __init__(self, host: str, username: str, password: str = None, key_path: str = None):
        self.host = host
        self.username = username
        self.password = password
        self.key_path = key_path

    async def run_command_stream(self, command: str) -> AsyncGenerator[str, None]:
        """
        Executes a command over SSH and yields its stdout/stderr line-by-line.
        Includes a connection timeout and an idle-output timeout to surface hangs.
        """
        connect_kwargs = {
            "host": self.host,
            "username": self.username,
            "connect_timeout": SSH_CONNECT_TIMEOUT,
        }
        if not settings.SSH_STRICT_HOST_KEY_CHECKING:
            connect_kwargs["known_hosts"] = None

        if self.password:
            connect_kwargs["password"] = self.password
        if self.key_path:
            connect_kwargs["client_keys"] = [self.key_path]

        try:
            async with asyncssh.connect(**connect_kwargs) as conn:
                async with conn.create_process(command) as process:
                    while True:
                        try:
                            line = await asyncio.wait_for(process.stdout.readline(), timeout=SSH_IDLE_TIMEOUT)
                            if not line:
                                break
                            
                            # process.stdout.readline() returns a string (or bytes depending on config). 
                            # Since it's a string stream by default in asyncssh:
                            stripped = line.strip()
                            if stripped:
                                yield stripped
                        except asyncio.TimeoutError:
                            yield f"[WARNING] Command output timed out after {SSH_IDLE_TIMEOUT}s."
                            process.terminate()
                            break
                    
                    try:
                        await process.wait()
                    except Exception as e:
                        yield f"[WARNING] Error waiting for process to close: {str(e)}"

                    if process.returncode and process.returncode != 0:
                        yield f"[ERROR] Command exited with code {process.returncode}"

        except asyncio.TimeoutError:
            yield f"[SSH ERROR] Connection to {self.host} timed out after {SSH_CONNECT_TIMEOUT}s. Is the master node reachable?"
        except asyncssh.DisconnectError as e:
            yield f"[SSH ERROR] Disconnected: {str(e)}"
        except asyncssh.PermissionDenied:
            yield f"[SSH ERROR] Permission denied — check your credentials in backend/.env (MASTER_USER / MASTER_PASS)"
        except asyncssh.HostKeyNotVerifiable:
            yield f"[SSH ERROR] Host key mismatch for {self.host}"
        except asyncssh.Error as e:
            yield f"[SSH ERROR] {str(e)}"
        except Exception as e:
            yield f"[SYSTEM ERROR] {type(e).__name__}: {str(e)}"
