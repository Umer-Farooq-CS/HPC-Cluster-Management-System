# Audit Report: Database & Architecture Flaws

This document identifies structural issues within the backend database design, data integrity mechanisms, and RESTful API architecture.

---

## 1. Lack of Database Migrations (Schema Evolution)

### The Problem
*   **Vulnerability Location:** [`backend/main.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/main.py#L18-L19)
*   **Detailed Analysis:**
    The application relies on SQLAlchemy's `Base.metadata.create_all` during the startup lifecycle to initialize database tables:
    ```python
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    ```
    This is an anti-pattern for production environments. `create_all` only creates tables if they do not exist; it **does not alter existing tables**. If a new column is added to a model in a future update (e.g., adding `last_login` to `User`), the application will crash when trying to query that column because the schema wasn't updated.

### The Best Fix
Integrate **Alembic** for database migrations. Remove the `create_all` startup script and instead run Alembic migration scripts (`alembic upgrade head`) via a startup bash script in the Docker container before starting Uvicorn.

---

## 2. Missing Foreign Keys & Orphaned User State

### The Problem
*   **Vulnerability Location:** 
    - [`backend/models/user.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/models/user.py#L11)
    - [`backend/api/routes/env_stacks.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/env_stacks.py#L329-L349) (`delete_stack`)
*   **Detailed Analysis:**
    The `User` model assigns environment profiles using a raw string:
    ```python
    env_profile = Column(String, nullable=True)
    ```
    There is no SQL `ForeignKey` constraint linking this to `EnvStack.name`. 
    If an administrator deletes an `EnvStack` via the API (`DELETE /api/v1/env-stacks/{id}`), the stack is removed, but any user who had that stack assigned still retains the string in their `env_profile` column. 
    On their next login, their `~/.bashrc` will attempt to `module load <deleted_stack>`, resulting in module load failures and a broken environment.

### The Best Fix
1. Define a strict Foreign Key relationship:
   ```python
   env_profile = Column(String, ForeignKey("env_stacks.name", ondelete="SET NULL"), nullable=True)
   ```
2. In the `delete_stack` route, implement application-level cleanup to re-inject the base `~/.bashrc` configuration for all users whose profile was just deleted, ensuring their OS-level state stays in sync with the database.

---

## 3. Redundant Database Schema Fields

### The Problem
*   **Vulnerability Location:** [`backend/models/slaves.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/models/slaves.py#L8-L10)
*   **Detailed Analysis:**
    The `ComputeNodeDB` model defines both `id` and `mac` as unique, indexed strings:
    ```python
    id = Column(String, primary_key=True, index=True) 
    mac = Column(String, unique=True, index=True, nullable=False)
    ```
    During deployment in `slaves.py`, the `id` field is populated directly with `node["mac"]`. Storing the MAC address twice per row wastes index space and complicates updates if a node's NIC is replaced.

### The Best Fix
Use the MAC address as the primary key directly or use an auto-incrementing Integer/UUID for the `id` while keeping the `mac` unique. Do not duplicate the exact same value across two columns.

---

## 4. RPC-Style Endpoints in a REST API

### The Problem
*   **Vulnerability Location:** [`backend/api/routes/env_stacks.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/env_stacks.py#L352)
*   **Detailed Analysis:**
    The API uses verbs inside the URL paths rather than RESTful resource state transfers:
    ```
    POST /api/v1/env-stacks/{stack_id}/assign/{username}
    DELETE /api/v1/env-stacks/assign/{username}
    ```
    This mixes two different resources (`env_stacks` and `users`) in a confusing path hierarchy.

### The Best Fix
Refactor to manipulate the relationship properly:
- Assigning a profile: `PUT /api/v1/users/{username}/env-profile` (with a JSON body containing the stack ID).
- Removing a profile: `DELETE /api/v1/users/{username}/env-profile`.
