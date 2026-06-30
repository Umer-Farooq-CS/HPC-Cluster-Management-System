# HPC Cluster Management System — Security, Authentication & Performance Audit

This directory contains a comprehensive audit of the HPC Cluster Management System, analyzing security vulnerabilities, authentication gaps, performance bottlenecks, architecture flaws, deployment risks, and container security. 

Due to the size and depth of the findings, the audit has been broken down into targeted documents addressing specific aspects of the system.

## Audit Document Index

### 1. [DONE] [Security & CIA Compliance (01_security_cia_compliance.md)](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/audit_report/01_security_cia_compliance.md)
*   **Confidentiality**: Hardcoded secrets, weak credentials in version control, and lack of host key verification (MitM risks).
*   **Integrity**: Critical Remote Command Injection (RCE) vectors via unsanitized shell inputs on system endpoints.
*   **Availability**: SSH process leaks, hanging timeouts, lack of locking/synchronization for system state modifications, and Denial of Service (DoS) risks.

### 2. [DONE] [Authentication & Authorization (02_authentication_authorization.md)](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/audit_report/02_authentication_authorization.md)
*   **SSO Bypass**: Complete exclusion of the Keycloak IAM server from the frontend/backend applications despite its container deployment.
*   **JWT Issues**: Dangerously long token expiration window (24 hours) without revocation lists.
*   **Auth Mismatches**: Conflict between Open OnDemand Keycloak authentication and FastAPI `htpasswd` backend provisioning.

### 3. [Performance & Concurrency (03_performance_concurrency.md)](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/audit_report/03_performance_concurrency.md)
*   **Execution Bottlenecks**: Sequential SSH command execution instead of batch/parallel pipeline setups.
*   **Websocket Overload**: Running heavy OS tasks (image compilation, Dracut, Warewulf overlays) inside ephemeral WebSocket sessions without background queue workers.
*   **Redundant Overheads**: Excessive rebuild commands leading to compute cycles wasted on system packages.

### 4. [Code Quality & Robustness (04_code_quality_robustness.md)](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/audit_report/04_code_quality_robustness.md)
*   **Brittle Scraping**: Risk of dashboard crashes due to direct regex matching of CLI outputs (`squeue`, `df`, `free`).
*   **Root Vulnerability**: Running all Master Node actions under the root user instead of a restricted service account.
*   **System Hardcoding**: OS and architecture versions baked into configurations, hindering cross-platform upgrades.
*   **Transaction Integrity**: Separation between OS and Database state commits causing orphaned data on failure.

### 5. [Database & Architecture Flaws (05_database_and_architecture.md)](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/audit_report/05_database_and_architecture.md)
*   **Schema Evolution**: Reliance on `create_all` instead of Alembic migrations, blocking future database updates.
*   **Orphaned Data**: Missing foreign keys allowing deleted environments to break user profiles.
*   **Redundant Fields**: Duplicated MAC addresses serving as primary keys and unique columns simultaneously.
*   **RPC Anti-Patterns**: Mixing verbs into API paths rather than utilizing true REST semantics.

### 6. [Deployment & Operational Risks (06_deployment_and_operations.md)](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/audit_report/06_deployment_and_operations.md)
*   **Brittle Discovery**: Reliance on volatile ARP caches for physical node discovery, risking detection failure and gateway overwrites.
*   **Fragile Configurations**: Line-by-line `sed` editing of configuration files instead of robust Jinja2 templating.
*   **Connection Severance**: Risk of the backend disconnecting itself while applying network changes to the Master Node.
*   **Silent Failures**: Masked exceptions and `print` logging obscuring tracebacks in production.

### 7. [Frontend Architecture & System Resilience (07_frontend_and_resilience.md)](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/audit_report/07_frontend_and_resilience.md)
*   **Build-Time Envs**: Injecting domain URLs into the frontend build prevents runtime IP address updates without recompiling the Docker image.
*   **Validation Defense**: Weak Pydantic types allowing garbage data to reach execution blocks.
*   **Database Pooling Limits**: Default SQLAlchemy pool settings creating bottlenecks during SSH storms.
*   **Process Orphans**: Disconnecting WebSockets leaving Master Node bash scripts dangling in memory.

### 8. [DevOps & Container Security (08_devops_and_security.md)](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/audit_report/08_devops_and_security.md)
*   **Root Containers**: FastAPI and Nginx running as root, risking host compromise upon container escape.
*   **Token XSS Risk**: Storing administrative JWTs in `localStorage` rather than `HttpOnly` cookies.
*   **Missing Security Headers**: Nginx proxy omitting critical headers (HSTS, CSP, X-Frame-Options).
*   **Exposed Databases**: PostgreSQL and Redis bound to host ports, making them reachable via the external network.

---

## Executive Summary of Critical Vulnerabilities

| Category | Severity | Issue | Target File(s) | Fix Summary |
| :--- | :--- | :--- | :--- | :--- |
| **Security** | `CRITICAL` | Shell Command Injection / RCE | `routes/users.py`, `routes/images.py`, `routes/ansible.py`, `routes/slaves.py` | Implement strict parameter validation and escape shell inputs, or move away from raw shell strings to python APIs/subprocess parameters. |
| **Security** | `HIGH` | SSH Host Key Verification Disabled | `core/ssh_executor.py` | Configure `known_hosts` file and enforce key verification. |
| **Security** | `HIGH` | Keycloak SSO Bypassed | `LoginPage.tsx`, `AuthContext.tsx`, `core/security.py` | Integrate backend and frontend with Keycloak JWT validation and client redirects. |
| **Security** | `HIGH` | Client-Side JWT Storage (XSS) | `AuthContext.tsx`, `LoginPage.tsx` | Move from `localStorage` to `HttpOnly` cookies. |
| **Architecture**| `HIGH` | Fragile Configuration Editing | `routes/slaves.py`, `routes/master.py` | Transition from `sed` / `echo` to Python-based Jinja2 rendering and SFTP uploads. |
| **Operations** | `HIGH` | Missing DB Migrations | `main.py` | Integrate Alembic for database migrations to prevent schema update crashes. |
| **Availability** | `MEDIUM` | Broken SSH Timeout / Process Leaks | `core/ssh_executor.py` | Restructure wait timeout to wrap the readline iterator instead of process exit. |
| **Performance** | `HIGH` | Long Tasks in Ephemeral WebSockets | `routes/images.py`, `routes/slaves.py` | Implement an asynchronous worker queue (Celery/Redis) with task status tracking. |
