# Audit Report: DevOps, Container Security & Client-Side Risks

This document focuses on the security configurations of the Docker infrastructure, Nginx reverse proxy headers, and frontend vulnerability vectors.

---

## 1. Container Privilege Escalation (Root User Execution)

### The Problem
*   **Vulnerability Location:** 
    - [`backend/Dockerfile`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/Dockerfile#L27)
    - [`frontend/Dockerfile`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/frontend/Dockerfile#L29)
*   **Detailed Analysis:**
    Neither the frontend nor the backend Dockerfiles specify a `USER` directive. By default, this means the FastAPI application and the Nginx web server inside the containers run as the `root` user.
    - If a vulnerability in the FastAPI application (such as the Remote Code Execution flaw highlighted in Document 01) is exploited to attack the container itself rather than the SSH Master Node, the attacker will immediately gain root access inside the Docker container.
    - Combined with the lack of security profiles (like AppArmor or SELinux context in `docker-compose.yml`), a container escape could compromise the host machine.

### The Best Fix
1. **Backend:** Create a non-root user in the Dockerfile and switch to it before running Uvicorn:
   ```dockerfile
   RUN adduser --disabled-password --gecos '' appuser
   USER appuser
   CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
   ```
2. **Frontend:** Use the unprivileged `nginxinc/nginx-unprivileged:alpine` base image instead of the standard `nginx:alpine` image, which runs the Nginx worker processes as a non-root user by default.

---

## 2. Insecure Client-Side Token Storage (XSS Risk)

### The Problem
*   **Vulnerability Location:** [`frontend/src/context/AuthContext.tsx`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/frontend/src/context/AuthContext.tsx#L19-L26)
*   **Detailed Analysis:**
    When a user logs in, the FastAPI backend returns a 24-hour JWT token. The React application stores this token in the browser's `localStorage`:
    ```javascript
    localStorage.setItem('token', newToken);
    ```
    `localStorage` is accessible via JavaScript. If the application suffers from a Cross-Site Scripting (XSS) vulnerability (e.g., rendering unescaped output from `squeue` or a malicious Slurm node `Reason` field), an attacker can easily execute a script to read `localStorage.getItem('token')` and exfiltrate the administrative session token.

### The Best Fix
1. Modify the `/api/v1/auth/login` endpoint to return the JWT inside an `HttpOnly`, `Secure`, `SameSite=Strict` cookie instead of in the JSON body.
2. The frontend will no longer need to handle or store the token explicitly, and the browser will automatically attach the cookie to all `/api/` requests. This completely mitigates token theft via XSS.

---

## 3. Missing Nginx Security Headers

### The Problem
*   **Vulnerability Location:** [`nginx/nginx.conf`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/nginx/nginx.conf#L25-L34)
*   **Detailed Analysis:**
    The main Nginx configuration sets up SSL/TLS using valid ciphers, but it omits critical HTTP security headers. 
    This leaves the application vulnerable to:
    - **Clickjacking:** Missing `X-Frame-Options`.
    - **MIME-Sniffing:** Missing `X-Content-Type-Options`.
    - **Protocol Downgrade:** Missing `Strict-Transport-Security` (HSTS), meaning the browser isn't forced to remember that the site should only be accessed via HTTPS.

### The Best Fix
Add the following headers to the `server` block listening on port 443 in `nginx.conf`:
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Content-Security-Policy "default-src 'self' wss: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;
```

---

## 4. Exposed Internal Services

### The Problem
*   **Vulnerability Location:** [`docker-compose.yml`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/docker-compose.yml#L11-L23)
*   **Detailed Analysis:**
    Both the PostgreSQL database and the Redis cache have their ports mapped to the host machine:
    ```yaml
    postgres:
      ports:
        - "5432:5432"
    redis:
      ports:
        - "6379:6379"
    ```
    If the Bastion host (where this compose file runs) does not have a strict firewall configured (e.g., `firewalld` is accidentally disabled during testing), the database and cache are exposed to the entire campus network. Internal services should only be accessible within the `hpc-network` Docker bridge.

### The Best Fix
Remove the `ports:` binding for `postgres`, `redis`, and `backend` (if Nginx proxies the backend) in the `docker-compose.yml`. They will still be able to communicate with each other over the internal Docker network using their container names.
