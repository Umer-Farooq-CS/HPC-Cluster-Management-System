# HPC Cluster Management System — Open OnDemand & SSO Integration

This document outlines the architecture, integration, and complex security mechanisms of Open OnDemand (OOD) serving as the user portal for the HPC cluster, including its integration with Keycloak for Single Sign-On (SSO).

---

## 1. Open OnDemand Architecture

Open OnDemand is a web portal that provides users with a graphical interface to interact with the HPC cluster without needing to use SSH or the command line.

### Core Components
1. **Apache HTTP Server**: The primary entry point (`httpd`). It handles the OIDC authentication flow and proxies requests.
2. **Dex (Identity Provider)**: Acts as a middleman between Apache (`mod_auth_openidc`) and the overarching IAM system (Keycloak or LDAP).
3. **Per-User Nginx (PUN)**: OOD's unique architectural feature. When a user logs in successfully, Apache spawns a dedicated, unprivileged Nginx process running *as that specific user*. This PUN serves the actual Ruby on Rails applications (like the Dashboard or Job Composer) and Node.js applications (like the Terminal).

---

## 2. Keycloak OIDC Integration

To provide an enterprise-grade experience, OOD is integrated with the containerized **Keycloak** instance running on the Bastion host.

### The Authentication Flow
1. A user attempts to access the OOD Dashboard (hosted on port 8008 of the Master Node).
2. Apache intercepts the request and redirects it to the Dex Identity Provider.
3. Dex acts as an OIDC client to the Keycloak server.
4. Keycloak authenticates the user (via standard login, AD/LDAP federation, or MFA) and issues a JWT token.
5. Dex validates the token, maps the Keycloak username to the equivalent Linux system user on the Master Node, and passes control back to Apache.
6. Apache triggers the `nginx_stage` script to launch the user's PUN.

---

## 3. Complex Security Fixes

Integrating OOD within this specific automated framework required several critical security and configuration patches.

### A. Automatic Home Directory Creation

When an OIDC user logs in for the first time, their Linux user account might not have a `/home/username` directory yet. Without a home directory, the PUN crashes.
- **The Fix:** A pre-hook script (`/etc/ood/config/create_user_home.sh`) is configured in `ood_portal.yml`. This script intercepts the login, checks if the home directory exists, and creates it with the correct `skel` and permissions before the PUN spawns.

### B. SELinux Policies & Passenger Crashes

By default, SELinux prevents the unprivileged PUN (`ood_pun_t`) from writing configuration files or managing Ruby Passenger sockets inside the newly created home directories (`config_home_t`). This results in `EEXIST` mapping errors and application crashes.
- **The Fix:** A custom SELinux module (`ood_custom.te`) was compiled and installed during the provisioning phase. This policy explicitly grants the `ood_pun_t` domain the rights to `manage_dir_perms` and `write` to `config_home_t` domains.

### C. CSRF Token Validation & Reverse Proxies

Because the Bastion host's Nginx proxies traffic to the Master Node's Apache server, the Ruby on Rails applications (like the Job Composer) would reject form submissions with `422 Unprocessable Entity (Invalid Authenticity Token)`. The application thought it was being hit with a Cross-Site Request Forgery attack because the host headers did not match.
- **The Fix:** 
  1. Configured custom proxy headers (`X-Forwarded-Proto`, `X-Forwarded-Port`, `X-Forwarded-Host`) inside the Apache virtual host directives (`ood_portal.yml`).
  2. Modified the Rails application configurations to trust the proxy headers, allowing secure session cookies to validate correctly.

---

## 4. OOD Administrator Cheatsheet

When things break in Open OnDemand, they usually break at the PUN level. Here are the commands to debug and reset user sessions.

### Applying Configuration Changes
If you edit `/etc/ood/config/ood_portal.yml`, you must recompile the Apache config:
```bash
sudo /opt/ood/ood-portal-generator/sbin/update_ood_portal
systemctl restart httpd
systemctl restart ondemand-dex
```

### Resetting User Sessions (PUNs)
If a user's dashboard is completely broken or frozen:
```bash
# Force restart a specific user's PUN
sudo /opt/ood/nginx_stage/sbin/nginx_stage pun -u <username> -a restart

# Clean up orphaned sessions system-wide
sudo /opt/ood/nginx_stage/sbin/nginx_stage nginx_clean
```

### Viewing Error Logs
PUN errors (Ruby exceptions, Node crashes) are stored per-user:
```bash
tail -f /var/log/ondemand-nginx/<USERNAME>/error.log
```
