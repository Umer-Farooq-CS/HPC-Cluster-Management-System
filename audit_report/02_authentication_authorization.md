# Audit Report: Authentication & Authorization Issues

This document reviews the access control, token management, and Identity and Access Management (IAM) configurations of the HPC Cluster Management System.

---

## 1. Keycloak SSO Integration Bypass

### The Problem
*   **Vulnerability Location:** 
    - [`frontend/src/keycloak.ts`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/frontend/src/keycloak.ts) (Unused)
    - [`frontend/src/pages/LoginPage/LoginPage.tsx`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/frontend/src/pages/LoginPage/LoginPage.tsx#L25-L41) (Local API fallback)
    - [`backend/core/security.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/core/security.py#L31-L49) (Local SQLite/Postgres JWT decoding)
*   **Detailed Analysis:**
    The project infrastructure includes a Keycloak server (`hpc-keycloak` container in `docker-compose.yml`) proxied via Nginx. However, the application code completely bypasses it. 
    1. The frontend imports `Keycloak` from `keycloak-js` in `keycloak.ts`, but this instance is never used.
    2. Instead, `LoginPage.tsx` performs a direct HTTP POST login request to the FastAPI endpoint `/api/v1/auth/login`.
    3. The backend validates credentials against a local PostgreSQL `users` table and issues a custom JWT signed with a local, hardcoded HMAC secret key.
    4. Keycloak is bypassed entirely, which negates the benefits of centralized SSO, Multi-Factor Authentication (MFA), and LDAP/Active Directory user federation.

### The Best Fix
1. **Frontend Integration:** Rewrite `main.tsx` and `AuthContext.tsx` to initialize Keycloak using the `keycloak-js` adapter on application startup. Protect the React application by redirecting unauthenticated users to the Keycloak login page.
2. **Backend JWT Validation:** Modify `backend/core/security.py` to fetch Keycloak's public keys (JWKS endpoint) and validate the incoming Bearer token signature against Keycloak rather than using a local HMAC key:
   ```python
   # Replace local decode logic with PyJWT decoding using public keys from Keycloak
   # Fetch JWKS from: http://keycloak:8080/realms/hpc/protocol/openid-connect/certs
   ```
3. **Align User Database:** Rely on Keycloak as the single source of truth. Remove the local `users` table and read user roles directly from the Keycloak JWT token claims (e.g. `realm_access.roles`).

---

## 2. Authentication Protocol Mismatch (Keycloak vs. htpasswd)

### The Problem
*   **Vulnerability Location:** [`backend/api/routes/users.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/users.py#L63)
*   **Detailed Analysis:**
    During the provision of a new user, the backend executes the following command:
    ```python
    f"htpasswd -B -b /etc/ood/config/htpasswd {user_in.username} '{user_in.password}'"
    ```
    This indicates that Open OnDemand (OOD) is configured to use Basic Auth via Apache's `htpasswd` file. However, the documentation in `05_Open_OnDemand_and_SSO.md` explicitly details an OIDC integration with Keycloak (using Dex as the identity provider).
    - If OOD is using Keycloak SSO via Dex, it will not consult `/etc/ood/config/htpasswd`. The user creation endpoint is generating redundant, dead configuration files.
    - If OOD is using the `htpasswd` file for login, it is *not* integrated with Keycloak SSO. This is an architectural mismatch.

### The Best Fix
- Decide on the single authentication standard for Open OnDemand.
- If Keycloak SSO is the standard, remove the `htpasswd` creation code. Instead, trigger a Keycloak API call (using `python-keycloak`) to provision the user inside Keycloak when an admin registers them, or rely on Keycloak's integration with a directory service (LDAP/AD).
- Ensure that the username generated on the Master Node matches the Keycloak username claim mapped via Dex.

---

## 3. Excessive JWT Lifespan & Lack of Revocation

### The Problem
*   **Vulnerability Location:** [`backend/core/security.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/core/security.py#L15)
*   **Detailed Analysis:**
    - The access tokens are configured to expire in 24 hours (`ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24`).
    - The dashboard gives administrators root access on the cluster (including deleting VMFS images, running arbitrary playbooks, and writing Slurm parameters). A 24-hour token validity window with no revocation mechanism is insecure.
    - If an administrator's browser is compromised or a token is leaked, an attacker has a 24-hour window to execute commands on the HPC master node.

### The Best Fix
1. **Reduce Expiration:** Lower the access token lifespan to 15–30 minutes:
   ```python
   ACCESS_TOKEN_EXPIRE_MINUTES = 15
   ```
2. **Implement Refresh Tokens:** Use short-lived Access Tokens paired with longer-lived Refresh Tokens.
3. **Token Blocklist:** Use the existing Redis service (defined in `docker-compose.yml` but unused for auth) to implement a token blocklist. This allows logging out and immediate token revocation:
   ```python
   # On logout, store the token in Redis with a TTL equal to the remaining token lifespan
   await redis.setex(f"token_blocklist:{token}", remaining_time, "true")
   ```

---

## 4. Insecure Bcrypt Work Factor
*   **Vulnerability Location:** [`backend/core/security.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/core/security.py#L20-L22)
*   **Problem:**
    `bcrypt.gensalt()` is called without specifying the work factor (rounds). By default, the library chooses a sensible fallback, but as CPU speeds increase, it is best practice to explicitly lock this to a minimum of 12 rounds to resist offline GPU brute-force attacks on database dumps.
*   **Best Fix:**
    Explicitly define the work factor in the security script:
    ```python
    def get_password_hash(password: str):
        salt = bcrypt.gensalt(rounds=12)
        return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    ```
