# Open OnDemand "Home Directory Not Found" Fix

## Summary of the Issues

During the deployment of Open OnDemand (OOD) on the Master Node, users encountered two primary errors when attempting to access the dashboard under SELinux Enforcing mode:

1. **"Home Directory Not Found"**
   When the user accessed the OOD dashboard, the Per-User Nginx (PUN) process failed to initialize because it could not find or access the user's home directory.

2. **"Web application could not be started" (Passenger Spawn Error)**
   After fixing the home directory access, Phusion Passenger failed to start the Rails application, throwing the error `File exists @ dir_s_mkdir - /home/admin/.config (Errno::EEXIST)`.

## Root Causes

1. **SELinux Booleans:** OOD requires specific SELinux booleans to be enabled to allow the confined PUN process (`ood_pun_t`) to manage user home directories. Without `ondemand_manage_user_home_dir` enabled, SELinux blocked the PUN from confirming the home directory's existence.
2. **Dynamic Home Directory Creation:** By default, OOD does not automatically create home directories for users logging in via web authentication (like Basic Auth or Keycloak OIDC) unless explicitly configured via a root pre-hook.
3. **SELinux File Contexts on `~/.config`:** Standard SELinux policy automatically labels `~/.config` directories as `config_home_t`. However, the default `ondemand-selinux` policy does not grant the `ood_pun_t` domain permission to read, write, or search `config_home_t` directories. This caused the Rails application to receive an `EEXIST` error when attempting to verify or create the `.config/ondemand` directory.
4. **Hook Script Execution Context:** The custom hook script created to auto-generate home directories was labeled as `etc_t`, which the `ood_pun_t` process is not allowed to execute.

## How We Fixed It

We updated the Ansible playbook (`ood_install.yml`) to apply permanent, automated fixes:

1. **Enabled Required SELinux Booleans:**
   We ensured the following booleans are permanently enabled:
   - `ondemand_manage_user_home_dir`
   - `ondemand_use_slurm`
   - `httpd_enable_homedirs`
   - `httpd_read_user_content`
   
2. **Created an Automated Pre-Hook Script:**
   We deployed `/etc/ood/config/create_user_home.sh` and configured it in `ood_portal.yml` (`pun_pre_hook_root_cmd`). This script automatically creates the home directory and copies standard skeleton files (`/etc/skel/`) for any user logging into the dashboard for the first time.

3. **Fixed Hook Script Execution Permissions:**
   We explicitly labeled the hook script with the SELinux context `ood_pun_exec_t` during deployment so that it can be safely executed by the confined PUN process.

4. **Compiled a Custom SELinux Policy Module (`ood_custom`):**
   We wrote, compiled, and deployed a custom SELinux policy (`ood_custom.te`) that explicitly grants the `ood_pun_t` domain permission to manage `config_home_t` directories and files. This fully resolves the Passenger spawn error for all users.

5. **Enabled `pam_mkhomedir` (Fallback):**
   We enabled `pam_mkhomedir` in `/etc/pam.d/sshd` to ensure home directories are also automatically created if users log in via SSH before accessing the web interface.

---

## Steps for Adding a New User

Thanks to the automated pre-hook script and PAM configurations, adding a new user is now completely streamlined. 

To add a new user to the cluster, you only need to create their system account and set up their web authentication (e.g., adding them to the `htpasswd` file or Keycloak). **You do not need to manually create their home directory.**

### Example: Adding a User "developer1"

**1. Create the system user:**
```bash
useradd -M developer1
passwd developer1
```
*(Note: The `-M` flag skips manual home directory creation since the OOD hook will handle it automatically, although omitting it and letting `useradd` create the directory is fine too.)*

**2. Add the user to OOD Basic Auth (if using htpasswd):**
```bash
htpasswd /etc/ood/config/htpasswd developer1
```

**3. The user logs in:**
- As soon as "developer1" accesses the Open OnDemand dashboard via the web interface, the pre-hook script will automatically:
  1. Create `/home/developer1`
  2. Copy skeleton files into the directory.
  3. Apply `0700` permissions.
  4. Restore the correct SELinux context (`user_home_dir_t`).
- The custom SELinux policy will automatically handle the `.config` directory context without causing spawn errors.

The user will be smoothly logged into their fully functional OOD dashboard.
