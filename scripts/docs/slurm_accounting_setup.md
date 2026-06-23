# Slurm Accounting & Database Setup Guide

**Reference:** [Official Slurm Accounting Docs](https://slurm.schedmd.com/accounting.html)

---

## What is Slurm Accounting?

Right now your cluster can run jobs, but it has no memory. If you ask "how much CPU time did the `physics` project use last month?", "who submitted the most jobs?", or "which job caused that node to crash?", Slurm cannot answer. Accounting fixes this.

Slurm Accounting is a persistent, queryable record of **every single job** ever run on your cluster. It stores:
- Who submitted the job (user, account, group)
- Which nodes ran it and for how long
- How much CPU, RAM, and GPU was consumed
- Whether it succeeded or failed and why
- The exact start and end time

### What does enabling it allow you to do?

| Capability | Tool | Example |
|---|---|---|
| View history of past jobs | `sacct` | "Show me all jobs from last week" |
| Monitor a running job's resource usage | `sstat` | "How much RAM is job #42 using right now?" |
| Generate usage reports by user/account | `sreport` | "Top 10 CPU consumers this month" |
| Enforce per-user/per-project CPU limits | `sacctmgr` | "The `physics` account can use max 100 CPU-hours/day" |
| Charge-back / billing departments | `sreport` | Monthly billing report per research group |
| Create project accounts & hierarchies | `sacctmgr` | Organize users under departments |

---

## Architecture: How it Works

Without accounting enabled, jobs just run and disappear. With it, the architecture looks like this:

```
[compute nodes] → [slurmctld on master] → [slurmdbd daemon] → [MariaDB database]
     jobs run          records events         receives & writes      stores permanently
```

The key component is **SlurmDBD** (Slurm Database Daemon). It is a dedicated, secure middleware daemon that sits between `slurmctld` and the database. You never expose the database password to users — only `slurmdbd` knows it.

---

## Step-by-Step Setup (On Master Node: 192.168.10.2)

> [!IMPORTANT]
> All commands below are run on the **Master Node** as root. SSH into it first:
> `sshpass -p hpc ssh root@192.168.10.2`

---

### Step 1: Install MariaDB and SlurmDBD

```bash
# Install MariaDB (the database server)
dnf -y install mariadb-server mariadb

# Install the Slurm Database Daemon
dnf -y install slurm-slurmdbd

# Start and enable MariaDB so it survives reboots
systemctl enable --now mariadb

# Secure the MariaDB installation (set a root password when prompted)
mysql_secure_installation
```

---

### Step 2: Create the Slurm Database and User

Log into MariaDB and run these SQL commands:

```bash
mysql -u root -p
```

Then inside the MariaDB shell:

```sql
-- Create the database where all job records will be stored
-- The database name 'slurm_acct_db' is fine to keep as-is.
CREATE DATABASE slurm_acct_db;

-- Create a dedicated 'slurm' user for the database.
-- ⚠️  CHANGE 'SlUrmDBpassword123!' to a strong password of your choice.
-- ⚠️  Write it down — you will need this EXACT password again in Step 4.
CREATE USER 'slurm'@'localhost' IDENTIFIED BY 'SlUrmDBpassword123!';

-- Grant the slurm user full access to the accounting database
GRANT ALL ON slurm_acct_db.* TO 'slurm'@'localhost';

-- Also grant access by the machine hostname (required by MariaDB)
-- ⚠️  'master' is your Master Node's hostname. If you changed it, update this.
GRANT ALL ON slurm_acct_db.* TO 'slurm'@'master';

-- Apply the changes
FLUSH PRIVILEGES;

-- Verify InnoDB engine is available (required by Slurm)
SHOW ENGINES;
-- Look for: InnoDB | DEFAULT | ...

EXIT;
```

---

### Step 3: Tune MariaDB for Slurm

Edit `/etc/my.cnf.d/mariadb-server.cnf` and add these settings under `[mysqld]`:

```ini
[mysqld]
# Minimum recommended settings for Slurm accounting
innodb_buffer_pool_size=512M
innodb_log_file_size=128M
innodb_lock_wait_timeout=900
max_allowed_packet=16M
innodb_default_row_format=DYNAMIC
```

Restart MariaDB:
```bash
systemctl restart mariadb
```

---

### Step 4: Configure SlurmDBD

Create the SlurmDBD configuration file. This file is **secret** — it contains the database password and must only be readable by the `slurm` user:

```bash
cat > /etc/slurm/slurmdbd.conf << 'EOF'
# SlurmDBD Configuration for HPC Cluster
AuthType=auth/munge

# DbdHost: The hostname of the machine running slurmdbd.
# Since slurmdbd runs on the Master Node itself, 'localhost' is correct.
DbdHost=localhost

# DbdPort: The port slurmdbd listens on. 6819 is the default, do not change.
DbdPort=6819

LogFile=/var/log/slurm/slurmdbd.log
PidFile=/var/run/slurmdbd.pid
SlurmUser=slurm

# ── Database Connection ──────────────────────────────────────────────
# StorageType: Always use mysql (covers both MySQL and MariaDB). Do not change.
StorageType=accounting_storage/mysql

# StorageHost: Where MariaDB is running. Since it's on the Master Node, keep as localhost.
StorageHost=localhost

# StoragePort: Default MariaDB port. Do not change unless you configured MariaDB differently.
StoragePort=3306

# StorageLoc: The database name created in Step 2. Keep as-is.
StorageLoc=slurm_acct_db

# StorageUser: The MariaDB username created in Step 2. Keep as 'slurm'.
StorageUser=slurm

# StoragePass: ⚠️  THIS IS THE DATABASE PASSWORD you set in Step 2.
# It is NOT your SSH password, NOT your Linux root password.
# It is the password you used in: CREATE USER 'slurm'@'localhost' IDENTIFIED BY '...'
# ⚠️  Replace 'SlUrmDBpassword123!' with whatever password you chose in Step 2.
StoragePass=SlUrmDBpassword123!

# ── Data Retention ───────────────────────────────────────────────────
# These settings auto-delete old records to keep the database from growing forever.
# Adjust the time periods to suit your needs.
PurgeJobsAfter=12months
PurgeStepsAfter=3months
PurgeSuspendAfter=1month
EOF

# Lock down permissions — VERY important for security.
# This file contains a database password and must NOT be world-readable.
chown slurm:slurm /etc/slurm/slurmdbd.conf
chmod 600 /etc/slurm/slurmdbd.conf
```

---

### Step 5: Update `slurm.conf` to Enable Accounting

Add these lines to `/etc/slurm/slurm.conf`:

```bash
cat >> /etc/slurm/slurm.conf << 'EOF'

# ── Slurm Accounting Configuration ──────────────────────────────────
# ⚠️  ClusterName: Give your cluster a short, memorable name (no spaces).
# This name will appear in all accounting reports.
ClusterName=hpc-cluster

# These two lines tell slurmctld to send job records to slurmdbd.
# Keep them exactly as-is — slurmdbd is on the same machine (localhost).
AccountingStorageType=accounting_storage/slurmdbd
AccountingStorageHost=localhost
AccountingStoragePort=6819

# What resources to track per job. Remove 'energy' if your hardware
# doesn't support IPMI power readings. Remove 'gres/gpu' if no GPUs.
AccountingStorageTRES=cpu,mem,energy,gres/gpu

# Gather resource stats from running jobs every 30 seconds using /proc.
# Increase this number (e.g. 60) on busy clusters to reduce overhead.
JobAcctGatherType=jobacct_gather/linux
JobAcctGatherFrequency=30

# ⚠️  'associations' = users must be in the DB to submit jobs.
# ⚠️  'limits'       = CPU/memory limits you set in sacctmgr will be enforced.
# If you remove 'associations', anyone can submit jobs even if not registered.
AccountingStorageEnforce=associations,limits

# Log basic job completion info to a flat file as well (a simple backup log).
JobCompType=jobcomp/filetxt
JobCompLoc=/var/log/slurm/job_completions.log
EOF
```

---

### Step 6: Start SlurmDBD and Restart slurmctld

```bash
# Enable and start SlurmDBD
systemctl enable --now slurmdbd

# Give it a moment to connect to MariaDB
sleep 5

# Check it is running
systemctl status slurmdbd

# Restart slurmctld to pick up the new accounting configuration
systemctl restart slurmctld

# Verify slurmctld connected to slurmdbd successfully
grep -i "slurmdbd" /var/log/slurm/slurmctld.log | tail -5
```

---

### Step 7: Register Your Cluster in the Database

The database needs to know your cluster exists:

```bash
# ⚠️  Replace 'hpc-cluster' with the same ClusterName you set in Step 5.
sacctmgr add cluster hpc-cluster

# Verify it was added — you should see your cluster listed
sacctmgr list cluster
```

---

### Step 8: Create Accounts and Add Users

Accounting is organized in a hierarchy: **Cluster → Account → User**

```bash
# ── These are EXAMPLES. Change account names, descriptions, and
# ── organization to match your actual project structure. ────────────

# Create a top-level account (e.g. your lab or department name)
# ⚠️  Change 'research', 'Research Group', and 'University' to your own values.
sacctmgr add account research \
  Description="Research Group" \
  Organization="University"

# Add sub-accounts for projects or teams (optional hierarchy)
# ⚠️  Change 'physics,chemistry' to your project names.
# ⚠️  'Parent=research' means they sit under the account created above.
sacctmgr add account physics,chemistry \
  Parent=research \
  Description="Physics and Chemistry departments" \
  Organization="University"

# Add a Linux user to an account so they can submit jobs.
# ⚠️  'testuser' must be an existing Linux username on the Master Node.
# ⚠️  'DefaultAccount' is the account charged by default when they submit a job.
sacctmgr add user testuser \
  DefaultAccount=research \
  Account=physics

# View all associations to confirm everything looks correct
sacctmgr list associations
```

---

### Step 9: Verify Everything Works

Submit a quick test job and then query it:

```bash
# Submit a test job
srun -N 1 /bin/hostname

# Check the accounting record (may take ~30 seconds to appear)
sacct --starttime=today --format=JobID,JobName,User,Account,State,CPUTime,MaxRSS

# View a cluster usage summary for this month
sreport cluster utilization start=`date -d "$(date +%Y-%m-01)" +%Y-%m-%d`

# List all registered users
sacctmgr list users
```

---

## Daily Admin Reference

### Key Commands

```bash
# See all completed/running jobs today
sacct --starttime=today -o JobID,User,Account,State,Elapsed,CPUTime

# See resource usage of a currently running job (replace JOBID)
sstat --job=JOBID -o JobID,MaxRSS,MaxVMSize,CPUTime

# Monthly CPU usage report per user
sreport user top start=2026-06-01 end=2026-06-30

# Set a CPU-hour limit on an account (e.g. max 1000 CPU-hours/month)
sacctmgr modify account physics set GrpTRESMins=cpu=60000

# Show all accounts and their limits
sacctmgr list associations format=Cluster,Account,User,GrpTRESMins
```

### Adding a New User to Accounting

Whenever you create a new Linux user who will submit jobs, you must also add them to Slurm accounting:

```bash
# Add the new user
useradd -m newuser

# Register them in accounting
sacctmgr add user newuser DefaultAccount=research Account=physics
```

> [!TIP]
> If `AccountingStorageEnforce=associations` is set in `slurm.conf`, users NOT registered in the accounting database will be **blocked from submitting jobs**. Make sure to add every user via `sacctmgr` before they try to use the cluster.

> [!NOTE]
> Job accounting records appear in `sacct` with a short delay (~30 seconds) after the job starts or finishes. This is normal — `slurmdbd` batches writes to the database for performance.
