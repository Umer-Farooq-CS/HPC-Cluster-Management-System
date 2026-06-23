"""
Utility functions for local and remote command execution.
"""
import subprocess
import sys
import shlex

def run_local(cmd, description):
    """
    Executes a shell command locally on the Bastion Host.
    """
    print(f"\n[*] {description}")
    try:
        subprocess.run(cmd, shell=True, check=True)
    except subprocess.CalledProcessError as e:
        print(f"[-] FAILED: {description}")
        print(f"    Error Details: {e}")
        sys.exit(1)

def run_remote(cmd, description, ip, password):
    """
    Executes a shell command remotely via SSH (using sshpass).
    """
    print(f"\n[Remote -> {ip}] {description}")
    # -o StrictHostKeyChecking=no prevents the script from hanging on the SSH fingerprint prompt
    # -o ConnectTimeout ensures it fails fast if the host is down
    # -q -tt forces a pseudo-terminal so progress bars (like dnf downloads) are shown in real-time
    safe_cmd = shlex.quote(cmd)
    ssh_cmd = f"sshpass -p {password} ssh -q -tt -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@{ip} {safe_cmd}"
    try:
        subprocess.run(ssh_cmd, shell=True, check=True)
    except subprocess.CalledProcessError as e:
        print(f"[-] FAILED: {description}")
        print(f"    Command that failed: {ssh_cmd}")
        print(f"    Error Details: {e}")
        sys.exit(1)