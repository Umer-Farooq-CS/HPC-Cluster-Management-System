import React, { useState } from 'react';
import styles from './ClusterInfoPage.module.css';

// --- Mock Data ---
const mockClusterData = {
  general: {
    state: "Operational",
    uptime: "45 Days, 12 Hours",
    totalNodes: 8,
    totalCpus: 256,
    totalGpus: 16,
    totalRam: "4 TB",
    totalStorage: "100 TB NVMe",
  },
  nodes: [
    {
      id: "master-01",
      name: "Master Node (master-01)",
      type: "Control Plane",
      state: "Active",
      details: {
        os: "AlmaLinux 9.4",
        kernel: "5.14.0-362.13.1.el9_3.x86_64",
        ip: "192.168.10.2",
        cpus: 16,
        ram: "64 GB",
        storage: "2 TB SSD",
      }
    },
    {
      id: "compute-01",
      name: "Compute Node (compute-01)",
      type: "Worker",
      state: "Active",
      details: {
        os: "AlmaLinux 9.4 (Stateless Image)",
        kernel: "5.14.0-362.13.1.el9_3.x86_64",
        ip: "192.168.10.11",
        cpus: 32,
        gpus: "2x NVIDIA A100",
        ram: "512 GB",
        storage: "10 TB NVMe",
        activeJobs: 4
      }
    },
    {
      id: "compute-02",
      name: "Compute Node (compute-02)",
      type: "Worker",
      state: "Active",
      details: {
        os: "AlmaLinux 9.4 (Stateless Image)",
        kernel: "5.14.0-362.13.1.el9_3.x86_64",
        ip: "192.168.10.12",
        cpus: 32,
        gpus: "2x NVIDIA A100",
        ram: "512 GB",
        storage: "10 TB NVMe",
        activeJobs: 1
      }
    }
  ]
};

// --- Components ---

const TreeNode = ({ label, value, children }: { label: string, value?: string | number, children?: React.ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = Boolean(children);

  return (
    <div className={styles.treeNode}>
      <div 
        className={`${styles.treeNodeHeader} ${hasChildren ? styles.treeNodeClickable : ''}`}
        onClick={() => hasChildren && setIsOpen(!isOpen)}
      >
        {hasChildren && (
          <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}>
            ▶
          </span>
        )}
        {!hasChildren && <span className={styles.bullet}>•</span>}
        <span className={styles.treeNodeLabel}>{label}</span>
        {value !== undefined && <span className={styles.treeNodeValue}>{value}</span>}
      </div>
      
      {hasChildren && isOpen && (
        <div className={styles.treeNodeChildren}>
          {children}
        </div>
      )}
    </div>
  );
};

export default function ClusterInfoPage() {
  const { general, nodes } = mockClusterData;

  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        <h1 className={styles.title}>Cluster Information</h1>
        <p className={styles.subtitle}>Deep dive into the live state and specifications of the HPC cluster.</p>
      </header>

      {/* High-level Summary Dashboard */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.cardIcon}>⚡</div>
          <div className={styles.cardInfo}>
            <h3>State</h3>
            <p className={styles.stateOperational}>{general.state}</p>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.cardIcon}>🖥️</div>
          <div className={styles.cardInfo}>
            <h3>Total Nodes</h3>
            <p>{general.totalNodes}</p>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.cardIcon}>🧠</div>
          <div className={styles.cardInfo}>
            <h3>CPUs / GPUs</h3>
            <p>{general.totalCpus} / {general.totalGpus}</p>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.cardIcon}>💾</div>
          <div className={styles.cardInfo}>
            <h3>RAM / Storage</h3>
            <p>{general.totalRam} / {general.totalStorage}</p>
          </div>
        </div>
      </div>

      {/* Hierarchical Tree View */}
      <div className={styles.treeContainer}>
        <h2 className={styles.sectionTitle}>Infrastructure Tree</h2>
        
        <div className={styles.treeRoot}>
          <TreeNode label="HPC Cluster" value={general.state}>
            
            <TreeNode label="General Info">
              <TreeNode label="Uptime" value={general.uptime} />
              <TreeNode label="Total Nodes" value={general.totalNodes} />
              <TreeNode label="Total Cores" value={general.totalCpus} />
              <TreeNode label="Total Memory" value={general.totalRam} />
            </TreeNode>

            <TreeNode label="Nodes">
              {nodes.map(node => (
                <TreeNode key={node.id} label={node.name} value={node.state}>
                  <TreeNode label="Type" value={node.type} />
                  <TreeNode label="Operating System" value={node.details.os} />
                  <TreeNode label="Kernel" value={node.details.kernel} />
                  <TreeNode label="IP Address" value={node.details.ip} />
                  
                  <TreeNode label="Hardware Specs">
                    <TreeNode label="CPUs" value={node.details.cpus} />
                    {node.details.gpus && <TreeNode label="GPUs" value={node.details.gpus} />}
                    <TreeNode label="RAM" value={node.details.ram} />
                    <TreeNode label="Storage" value={node.details.storage} />
                  </TreeNode>

                  {node.details.activeJobs !== undefined && (
                    <TreeNode label="Workload">
                      <TreeNode label="Active Jobs" value={node.details.activeJobs} />
                    </TreeNode>
                  )}
                </TreeNode>
              ))}
            </TreeNode>

            <TreeNode label="Networking">
              <TreeNode label="Interface" value="eth0 (Management)" />
              <TreeNode label="Interface" value="ib0 (Infiniband)" />
            </TreeNode>

            <TreeNode label="Storage Mounts">
              <TreeNode label="/home" value="NFS (master-01:/home)" />
              <TreeNode label="/opt/ohpc/pub" value="NFS (master-01:/opt/ohpc/pub)" />
            </TreeNode>

          </TreeNode>
        </div>
      </div>
    </div>
  );
}
