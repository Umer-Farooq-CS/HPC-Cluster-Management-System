# Ansible Cluster Health Validation

This directory contains the necessary files to automatically validate the health of your OpenHPC cluster using Ansible. 

## Architecture
You requested to trigger the checks from your **Bastion Host**, but to execute the Ansible playbook directly on the **Master Node**. 

To achieve this, we use a wrapper script (`run_ansible.sh`).
When you run this script on your laptop/Bastion Host, it:
1. Copies the `ansible/` folder over SSH to the Master Node (`192.168.10.2`).
2. Installs Ansible on the Master Node automatically (if it isn't already installed).
3. Executes the playbook directly on the Master Node.

Because Ansible is running locally on the Master Node, it has instant, passwordless access to your compute nodes (`pc2`, `pc3`) via the private `192.168.20.0` network, bypassing any complicated SSH proxy configurations.

## Files
* `run_ansible.sh` - The executable script you run from the Bastion Host.
* `ansible/inventory.ini` - Contains the mapping of your Master and Compute nodes.
* `ansible/cluster_health.yml` - The actual Ansible Playbook containing the tests.

## How to use
When you are ready to test the cluster, simply open your terminal in this directory on your Bastion Host and run:

```bash
./run_ansible.sh
```

## What does it test?
The playbook is divided into two phases:
1. **Master Node Check:** Verifies `warewulfd`, `slurmctld`, and `munge` are running perfectly. It also runs an `sinfo` command to ensure the Slurm controller is healthy.
2. **Compute Node Check:** Logs into `pc2` and `pc3` to verify `slurmd` and `munge` are running, checks that the memory limits (`ulimit -l`) are correctly configured for MPI, and finally submits a real test job to the Slurm queue using `srun`.
