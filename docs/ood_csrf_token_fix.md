# Open OnDemand CSRF Authenticity Token Fix

This document describes the diagnosis, root causes, and surgical fixes implemented to resolve the persistent `422 Unprocessable Entity (Invalid Authenticity Token)` CSRF errors within the Open OnDemand (OOD) Job Composer (`myjobs`) dashboard.

---

## 1. Problem Description

When users attempted to use the Job Composer (`myjobs` Rails application) to create or clone jobs (e.g., via the "From Default Template" button), the action failed with:

```text
ActionController::InvalidAuthenticityToken (Can't verify CSRF token authenticity.)
POST /pun/sys/myjobs/create_default -> status=422
```

---

## 2. Root Cause Analysis

We performed a deep-dive header analysis by injecting custom logging middleware into the Rails production stack. The issue was composed of three main architectural bottlenecks:

### A. Untrusted Proxy Headers (RemoteIp & Origin Check)
Rails 7.2 executes strict CSRF origin verification by comparing the HTTP `Origin` header against `request.base_url`. 
1. If Open OnDemand is run on a non-standard port (e.g., `8008`), Apache's reverse proxy must pass this host and port information downstream.
2. Even if Apache sends `X-Forwarded-Host: 192.168.10.2:8008` and `X-Forwarded-Port: 8008`, Rails' `RemoteIp` middleware discards these headers unless the proxy's IP address (or loopback socket) is explicitly defined in Rails' **trusted proxies** configuration.

### B. The Silent Culprit: Secure Session Cookies over Plain HTTP
Once the proxy headers and origin checks were aligned, the CSRF check still failed. Our debug middleware logged:
```ruby
Origin: http://192.168.10.2:8008
Base URL: http://192.168.10.2:8008
Cookies: {}  # <--- Missing entirely
```
By default, the Rails application configures its session cookie store in `config/initializers/session_store.rb` with:
```ruby
secure: Rails.env.production?
```
Because the application runs in `production` mode, the session cookie is marked as `Secure: true`. However, the deployment is accessed over plain HTTP (`http://192.168.10.2:8008`). Modern browsers **refuse to send secure cookies over unencrypted HTTP connections**, causing the session cookie—and thus the stored CSRF verification token—to be dropped on every POST request.

### C. Missing Slurm Accounting Registration
After resolving the authenticity token error, jobs got stuck in the `Queued (Pending)` state with the reason:
```text
(user env retrieval failed requeued held)
```
This was caused by:
1. The `admin` user missing from the Slurm accounting database.
2. The `admin` user account and environment missing on the stateless Warewulf compute nodes (`pc2`, `pc3`).

---

## 3. Implemented Fixes

The following configuration and environment modifications were executed to restore full functionality:

### Step 1: Configure Apache Virtual Host Headers
We modified the Open OnDemand portal generator configuration `/etc/ood/config/ood_portal.yml` to include the required proxy headers:

```yaml
custom_vhost_directives:
  - "RequestHeader set X-Forwarded-Proto 'http'"
  - "RequestHeader set X-Forwarded-Port '8008'"
  - "RequestHeader set X-Forwarded-Host '192.168.10.2:8008'"
```
The portal configuration was then regenerated, and Apache was restarted:
```bash
/opt/ood/ood-portal-generator/sbin/update_ood_portal -f
systemctl restart httpd
```

### Step 2: Inject Trusted Proxies into Rails Configuration
We patched `/var/www/ood/apps/sys/myjobs/config/environments/production.rb` to tell Rails to trust the local network proxies and UNIX sockets:

```ruby
  # Configure Action Dispatch to trust reverse proxy subnets
  config.action_dispatch.trusted_proxies = [
    IPAddr.new('127.0.0.1'),
    IPAddr.new('::1'),
    IPAddr.new('192.168.10.0/24'),
    IPAddr.new('192.168.20.0/24')
  ]
```

### Step 3: Disable Secure Cookies for Plain HTTP Sessions
We patched `/var/www/ood/apps/sys/myjobs/config/initializers/session_store.rb` to allow the session cookie to be transmitted over the unencrypted dashboard port:

```ruby
# Replaced 'secure: Rails.env.production?' with 'secure: false'
Rails.application.config.session_store :cookie_store, key: '_job_constructor_session', secure: false, same_site: :strict
```

### Step 4: Register Slurm User and Synchronize Compute Nodes
To enable job execution for the web portal user:
1. Created the Slurm account and user association:
   ```bash
   sacctmgr -i add account name=admin description='Admin Account' Organization='Admin'
   sacctmgr -i add user name=admin account=admin
   ```
2. Synced the user database to the compute nodes:
   - Configured `admin` (UID/GID 1001) on `pc2`.
   - Ran `wwctl overlay build` on the master node to permanently propagate the user database updates via Warewulf's system image overlays.
