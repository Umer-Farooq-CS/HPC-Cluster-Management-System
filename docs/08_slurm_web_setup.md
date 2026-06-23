# Slurm Web Setup Guide
## OpenHPC 3.4 + Warewulf 4 + AlmaLinux 9 Minimal (aarch64/x86_64)

> **Environment**
> - **Master Node:** AlmaLinux 9 minimal, `192.168.10.2` (Admin), `192.168.20.1` (Provisioning), `192.168.30.1` (Data)
> - **Bastion Host (you):** Ubuntu laptop, `192.168.10.x`
> - **Compute Nodes:** PXE-booted thin clients on `192.168.20.0/24`
> - **Slurm Web Version:** 2.x (RackSlab)
> - **Access:** You open `http://192.168.10.2` in your browser on the laptop — no GUI on the master needed

---

## Overview

Slurm Web is a read-friendly dashboard for your Slurm cluster. It shows:
- Live job queue (pending, running, completed)
- Node states (idle, allocated, down, draining)
- Partition info and resource usage
- Per-job details and accounting history

It works by talking to **`slurmrestd`** (the Slurm REST API daemon) running on your master node, then serving a web UI you access from your browser.

```
[Your Laptop Browser]
        |
        | HTTP  192.168.10.2:80
        ▼
[Nginx on Master Node]
        |
        | proxy_pass  127.0.0.1:6011
        ▼
[Slurm Web (slurmweb)]
        |
        | Unix socket / HTTP  127.0.0.1:6817
        ▼
[slurmrestd  ←→  slurmctld]
```

---

## Step 1 — Prerequisites Check

SSH into your master node from your laptop:

```bash
ssh root@192.168.10.2
```

Verify Slurm is running:

```bash
systemctl is-active slurmctld
sinfo          # should show your partitions
squeue         # should show job queue (empty is fine)
```

Check your Slurm version (must be 22.05+):

```bash
sinfo --version
```

Make sure `slurmrestd` is installed:

```bash
which slurmrestd || echo "NOT FOUND"
```

If not found, install it (OpenHPC already includes it):

```bash
dnf install slurm-slurmrestd ohpc-slurm-server
```

---

## Step 2 — Configure JWT Authentication for slurmrestd

Slurm Web authenticates to `slurmrestd` using JWT tokens. You need to generate a signing key and tell Slurm to use it.

### 2a. Generate the JWT key

```bash
# Create the key directory if needed
mkdir -p /var/spool/slurm

# Generate a 256-bit random key
dd if=/dev/urandom of=/var/spool/slurm/jwt_hs256.key bs=32 count=1

# Secure it — only slurm user can read it
chown slurm:slurm /var/spool/slurm/jwt_hs256.key
chmod 0600 /var/spool/slurm/jwt_hs256.key
```

### 2b. Add JWT config to slurm.conf

```bash
# Find your slurm.conf (usually here on OpenHPC):
vi /etc/slurm/slurm.conf
```

Add these lines at the bottom (or update if they already exist):

```ini
# JWT Authentication for slurmrestd
AuthAltTypes=auth/jwt
AuthAltParameters=jwt_key=/var/spool/slurm/jwt_hs256.key
```

> **Important:** Do NOT remove the existing `AuthType=auth/munge` line. JWT is an *additional* auth method, not a replacement.

### 2c. Restart slurmctld to pick up JWT config

```bash
systemctl restart slurmctld
systemctl status slurmctld   # confirm it's active
```

---

## Step 3 — Set Up slurmrestd as a systemd Service

### 3a. Create the slurmrestd systemd unit

```bash
cat > /etc/systemd/system/slurmrestd.service << 'EOF'
[Unit]
Description=Slurm REST API Daemon
After=network.target slurmctld.service
Requires=slurmctld.service

[Service]
Type=simple
User=slurm
Group=slurm
ExecStart=/usr/sbin/slurmrestd -a rest_auth/jwt -s openapi/v0.0.38,openapi/dbv0.0.38 127.0.0.1:6820
Restart=on-failure
RestartSec=5s
Environment=SLURM_JWT=daemon

[Install]
WantedBy=multi-user.target
EOF
```

> **Note on the port:** We use `127.0.0.1:6820` (localhost only). Slurm Web talks to it internally — it is never exposed directly to the network.

### 3b. Enable and start slurmrestd

```bash
systemctl daemon-reload
systemctl enable --now slurmrestd
systemctl status slurmrestd
```

### 3c. Test it works

```bash
# Should return JSON with Slurm cluster info
curl -s http://127.0.0.1:6820/slurm/v0.0.38/ping | python3 -m json.tool
```

Expected output:
```json
{
    "meta": { ... },
    "pings": [{ "hostname": "master", "mode": "primary", "status": 0 }]
}
```

---

## Step 4 — Install Slurm Web

Slurm Web is packaged by [RackSlab](https://github.com/rackslab/Slurm-web). Install from their repository.

### 4a. Add the RackSlab repository

```bash
# For AlmaLinux 9 / RHEL 9:
curl -sLo /etc/yum.repos.d/rackslab.repo \
  https://packages.rackslab.io/rackslab/el9/main/x86_64/rackslab.repo
```

> **aarch64 users:** Replace `x86_64` with `aarch64` in the URL above.

### 4b. Install the package

```bash
dnf install slurm-web
```

This installs:
- `slurmweb` — the main web application (Python, runs on port 6011)
- Default config at `/etc/slurm-web/`

---

## Step 5 — Configure Slurm Web

### 5a. Edit the main config file

```bash
vi /etc/slurm-web/agent.ini
```

The key settings to verify/set:

```ini
[service]
# Slurm Web listens on this address (localhost only, Nginx will proxy it)
host = 127.0.0.1
port = 6011

[slurmrestd]
# Where slurmrestd is listening (must match Step 3)
host = 127.0.0.1
port = 6820

[authentication]
# JWT signing key — must match the one in slurm.conf
jwt_key = /var/spool/slurm/jwt_hs256.key

[racksdb]
# Disable RacksDB (physical rack database) — optional, can enable later
enabled = false
```

### 5b. Fix permissions so Slurm Web can read the JWT key

```bash
# Add the slurmweb user to the slurm group
usermod -aG slurm slurmweb

# Or set ACL on the key file:
setfacl -m u:slurmweb:r /var/spool/slurm/jwt_hs256.key
```

### 5c. Enable and start Slurm Web

```bash
systemctl enable --now slurmweb
systemctl status slurmweb
```

Check it's listening:

```bash
ss -tlnp | grep 6011
# Should show: 127.0.0.1:6011
```

---

## Step 6 — Install and Configure Nginx as Reverse Proxy

Nginx sits in front of Slurm Web and forwards traffic from the network-accessible IP to the localhost-only Slurm Web process.

### 6a. Install Nginx

```bash
dnf install nginx
systemctl enable nginx
```

### 6b. Create the Slurm Web virtual host config

```bash
cat > /etc/nginx/conf.d/slurm-web.conf << 'EOF'
server {
    listen 80;
    server_name 192.168.10.2;   # Admin network IP — change if needed

    # Optional: redirect to a subpath
    location / {
        proxy_pass         http://127.0.0.1:6011;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Required for Slurm Web WebSocket support (live updates)
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
EOF
```

### 6c. Test and start Nginx

```bash
nginx -t          # must say "syntax is ok"
systemctl start nginx
systemctl status nginx
```

### 6d. Open firewall for HTTP

```bash
firewall-cmd --permanent --add-service=http
firewall-cmd --reload

# Verify
firewall-cmd --list-services | grep http
```

---

## Step 7 — SELinux Adjustments

AlmaLinux 9 has SELinux enforcing by default. Nginx needs permission to proxy to localhost ports.

```bash
# Allow Nginx to make network connections
setsebool -P httpd_can_network_connect 1

# Verify
getsebool httpd_can_network_connect
# Should output: httpd_can_network_connect --> on
```

If you see Nginx 502 errors later, check SELinux:

```bash
ausearch -c nginx --raw | audit2allow -M nginx-slurm
semodule -i nginx-slurm.pp
```

---

## Step 8 — Verify the Full Stack

Run this checklist on the master node:

```bash
echo "=== slurmctld ===" && systemctl is-active slurmctld
echo "=== slurmrestd ===" && systemctl is-active slurmrestd
echo "=== slurmweb ===" && systemctl is-active slurmweb
echo "=== nginx ===" && systemctl is-active nginx

echo ""
echo "=== slurmrestd API test ==="
curl -s http://127.0.0.1:6820/slurm/v0.0.38/ping | python3 -m json.tool

echo ""
echo "=== slurmweb local test ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:6011
```

All four services should show `active`. The REST ping should return JSON. The slurmweb curl should return `HTTP 200`.

---

## Step 9 — Access from Your Laptop

Open your browser on the Ubuntu laptop and go to:

```
http://192.168.10.2
```

You should see the Slurm Web dashboard with:
- **Jobs** — current queue and history
- **Nodes** — live state of your compute nodes (idle/allocated/down)
- **Partitions** — partition definitions and resource allocation

---

## Troubleshooting

### slurmrestd fails to start

```bash
journalctl -u slurmrestd -n 50 --no-pager
```

Common cause: `slurmctld` isn't running or JWT key permissions are wrong.

```bash
ls -la /var/spool/slurm/jwt_hs256.key
# Must be: -rw------- slurm slurm
```

### slurmweb shows "connection refused" or blank page

```bash
journalctl -u slurmweb -n 50 --no-pager
```

Check that `slurmrestd` is reachable from Slurm Web:

```bash
curl -s http://127.0.0.1:6820/slurm/v0.0.38/ping
```

### Nginx returns 502 Bad Gateway

1. Check Slurm Web is running: `systemctl status slurmweb`
2. Check SELinux: `setsebool -P httpd_can_network_connect 1`
3. Check Nginx error log: `tail -50 /var/log/nginx/error.log`

### Nodes show as "unknown" or "down" in dashboard

This is normal if compute nodes haven't PXE-booted yet. Once you provision them via Warewulf and they register with Slurm, they'll appear correctly.

### JWT token errors

Make sure the key in `slurm.conf` and `agent.ini` both point to the same file:

```bash
grep jwt /etc/slurm/slurm.conf
grep jwt /etc/slurm-web/agent.ini
```

---

## Service Start Order Reference

After a reboot, services must come up in this order:

```
munge  →  mariadb  →  slurmdbd  →  slurmctld  →  slurmrestd  →  slurmweb  →  nginx
```

All of these should be enabled via systemctl already. To verify:

```bash
systemctl is-enabled munge mariadb slurmdbd slurmctld slurmrestd slurmweb nginx
```

All should output `enabled`.

---

## Optional: HTTPS with Self-Signed Certificate

If you want `https://192.168.10.2` instead of plain HTTP (no domain name needed):

```bash
# Generate self-signed cert
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/master.key \
  -out /etc/nginx/ssl/master.crt \
  -subj "/CN=192.168.10.2/O=HPC Cluster/C=US"
mkdir -p /etc/nginx/ssl
```

Then update `/etc/nginx/conf.d/slurm-web.conf`:

```nginx
server {
    listen 443 ssl;
    server_name 192.168.10.2;

    ssl_certificate     /etc/nginx/ssl/master.crt;
    ssl_certificate_key /etc/nginx/ssl/master.key;
    ssl_protocols       TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:6011;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name 192.168.10.2;
    return 301 https://$host$request_uri;
}
```

```bash
firewall-cmd --permanent --add-service=https
firewall-cmd --reload
nginx -t && systemctl restart nginx
```

Access at: `https://192.168.10.2` (browser will warn about self-signed cert — click proceed).
