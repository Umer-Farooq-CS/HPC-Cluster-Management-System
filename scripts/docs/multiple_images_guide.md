# Managing Multiple Images in Warewulf 4

One of the most powerful features of Warewulf 4 is that it uses standard OCI (Docker/Podman) containers for its compute node images. Because your nodes are "stateless", you can have as many different OS images as you want, and switch a node's entire operating system just by changing a single setting and rebooting it.

This is extremely useful if you have:
*   **Standard Compute Nodes:** Running your default `almalinux-9` image.
*   **GPU Nodes:** Needing a specialized image with NVIDIA drivers pre-installed.
*   **Specialized Projects:** Some users might need Ubuntu instead of AlmaLinux for specific software.

Here is exactly how you can manage multiple images and assign them to specific nodes.

---

## Step 1: Create or Import a New Image

You can either import a brand new base OS container from the internet, or you can "clone" your existing golden image if you just want to make a few changes to it.

### Option A: Clone an existing image (Recommended)
If you already have a perfectly working `almalinux-9` image (with Slurm, Munge, Chrony, etc. already configured) and you just want to create a slightly modified version (e.g., to add specialized software):

```bash
# Clone the existing image into a new one called 'alma9-special'
wwctl image copy almalinux-9 alma9-special

# Now you can enter the new image and install whatever you need
wwctl image exec alma9-special /bin/bash
# (Inside the container shell)
# dnf install some-special-package
# exit

# Build the new image
wwctl image build alma9-special
```

### Option B: Import a completely different OS
If you want a node to run a completely different operating system (like Ubuntu):

```bash
# Import Ubuntu 22.04 from the Warewulf repository
wwctl image import docker://ghcr.io/warewulf/warewulf-ubuntu:22.04 ubuntu-22.04

# Enter the container to install slurm/munge/etc for Ubuntu
wwctl image exec ubuntu-22.04 /bin/bash
# (Inside the container shell)
# apt update && apt install slurm-client munge
# exit

# Build the new image
wwctl image build ubuntu-22.04
```

---

## Step 2: Assign the Image to a Node

Once you have multiple images built, you can easily tell Warewulf which node should boot which image.

### Check Available Images
To see all the images you have built and are ready to use:
```bash
wwctl image list
```

### Check Current Node Assignments
To see what image your nodes are currently assigned to use:
```bash
wwctl node list -a
# Look at the "CONTAINER" column
```

### Change a Single Node's Image
If you want `pc3` to use your new `alma9-special` image, run this command:
```bash
wwctl node set pc3 --image=alma9-special
```

### Change a Group of Nodes (via Profiles)
Instead of setting it per-node, you can assign an image to a "Profile", and any node using that profile gets the image.

For example, if you have a `gpu-nodes` profile:
```bash
# Create a new profile called gpu-nodes
wwctl profile add gpu-nodes

# Tell the profile to use the gpu image
wwctl profile set gpu-nodes --image=alma9-gpu

# Assign pc3 to use the gpu-nodes profile
wwctl node set pc3 --profiles=gpu-nodes
```

---

## Step 3: Reboot the Node

Because the nodes run entirely in RAM, simply assigning the image in Warewulf doesn't immediately change the running node.

You must reboot the node so that it performs a PXE boot and downloads the new image you assigned to it:

```bash
# Reboot pc3
ssh pc3 reboot
```

When `pc3` turns back on, it will download and boot into `alma9-special`, while `pc2` continues running `almalinux-9`.

---

## Summary of Commands

| Action | Command |
| :--- | :--- |
| **List all images** | `wwctl image list` |
| **Clone an image** | `wwctl image copy <old-name> <new-name>` |
| **Edit an image** | `wwctl image exec <image-name> /bin/bash` |
| **Build an image** | `wwctl image build <image-name>` |
| **Assign image to a node** | `wwctl node set <node-name> --image=<image-name>` |
| **See node assignments** | `wwctl node list -a` |
