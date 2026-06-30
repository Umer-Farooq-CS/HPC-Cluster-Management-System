import { useState } from 'react';
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
      name: "master-01",
      type: "Control Plane",
      state: "Active",
      details: {
        os: "AlmaLinux 9.4",
        kernel: "5.14.0-362.13.1.el9_3.x86_64",
        ip: "192.168.10.2",
        cpus: 16,
        gpus: "None",
        ram: "64 GB",
        storage: "2 TB SSD",
        activeJobs: 0
      }
    },
    {
      id: "compute-01",
      name: "compute-01",
      type: "Worker",
      state: "Active",
      details: {
        os: "AlmaLinux 9.4 (Stateless)",
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
      name: "compute-02",
      type: "Worker",
      state: "Active",
      details: {
        os: "AlmaLinux 9.4 (Stateless)",
        kernel: "5.14.0-362.13.1.el9_3.x86_64",
        ip: "192.168.10.12",
        cpus: 32,
        gpus: "2x NVIDIA A100",
        ram: "512 GB",
        storage: "10 TB NVMe",
        activeJobs: 1
      }
    }
  ],
  storage: [
    { mount: "/home", source: "master-01:/home", type: "NFS" },
    { mount: "/opt/ohpc/pub", source: "master-01:/opt/ohpc/pub", type: "NFS" }
  ],
  network: [
    { interface: "eth0", purpose: "Management Network" },
    { interface: "ib0", purpose: "Infiniband Fabric" }
  ]
};

export default function ClusterInfoPage() {
  const { general, nodes, storage, network } = mockClusterData;
  const [activeTab, setActiveTab] = useState('general');

  const renderContent = () => {
    if (activeTab === 'general') {
      return (
        <div className={styles.detailPanel}>
          <h2 className={styles.panelTitle}>General Overview</h2>
          <div className={styles.gridContainer}>
            <div className={styles.dataCard}>
              <span className={styles.dataLabel}>Cluster State</span>
              <span className={styles.dataValueHighlight}>{general.state}</span>
            </div>
            <div className={styles.dataCard}>
              <span className={styles.dataLabel}>Uptime</span>
              <span className={styles.dataValue}>{general.uptime}</span>
            </div>
            <div className={styles.dataCard}>
              <span className={styles.dataLabel}>Total Nodes</span>
              <span className={styles.dataValue}>{general.totalNodes}</span>
            </div>
            <div className={styles.dataCard}>
              <span className={styles.dataLabel}>Total Cores</span>
              <span className={styles.dataValue}>{general.totalCpus}</span>
            </div>
            <div className={styles.dataCard}>
              <span className={styles.dataLabel}>Total GPUs</span>
              <span className={styles.dataValue}>{general.totalGpus}</span>
            </div>
            <div className={styles.dataCard}>
              <span className={styles.dataLabel}>Total Memory</span>
              <span className={styles.dataValue}>{general.totalRam}</span>
            </div>
          </div>
          
          <div className={styles.sectionGroup} style={{ marginTop: 'var(--space-2xl)' }}>
            <h3 className={styles.sectionHeading}>Nodes Overview (sinfo)</h3>
            <div className={styles.tableWrapper}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Node</th>
                    <th>Type</th>
                    <th>State</th>
                    <th>Cores</th>
                    <th>Memory</th>
                    <th>Active Jobs</th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.map(node => (
                    <tr key={node.id}>
                      <td style={{ fontWeight: 600 }}>{node.name}</td>
                      <td>{node.type}</td>
                      <td>
                        <span className={node.state === 'Active' ? styles.badgeSuccess : styles.badge}>
                          {node.state}
                        </span>
                      </td>
                      <td>{node.details.cpus}</td>
                      <td>{node.details.ram}</td>
                      <td>{node.details.activeJobs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    if (activeTab.startsWith('node-')) {
      const nodeId = activeTab.replace('node-', '');
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return null;

      return (
        <div className={styles.detailPanel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>{node.name}</h2>
            <span className={styles.badge}>{node.type}</span>
            <span className={styles.badgeSuccess}>{node.state}</span>
          </div>
          
          <div className={styles.sectionGroup}>
            <h3 className={styles.sectionHeading}>System Specs</h3>
            <div className={styles.gridContainer}>
              <div className={styles.dataCard}>
                <span className={styles.dataLabel}>Operating System</span>
                <span className={styles.dataValue}>{node.details.os}</span>
              </div>
              <div className={styles.dataCard}>
                <span className={styles.dataLabel}>Kernel</span>
                <span className={styles.dataValue}>{node.details.kernel}</span>
              </div>
              <div className={styles.dataCard}>
                <span className={styles.dataLabel}>IP Address</span>
                <span className={styles.dataValue}>{node.details.ip}</span>
              </div>
            </div>
          </div>

          <div className={styles.sectionGroup}>
            <h3 className={styles.sectionHeading}>Hardware</h3>
            <div className={styles.gridContainer}>
              <div className={styles.dataCard}>
                <span className={styles.dataLabel}>CPUs</span>
                <span className={styles.dataValue}>{node.details.cpus} Cores</span>
              </div>
              <div className={styles.dataCard}>
                <span className={styles.dataLabel}>RAM</span>
                <span className={styles.dataValue}>{node.details.ram}</span>
              </div>
              <div className={styles.dataCard}>
                <span className={styles.dataLabel}>Storage</span>
                <span className={styles.dataValue}>{node.details.storage}</span>
              </div>
              <div className={styles.dataCard}>
                <span className={styles.dataLabel}>GPUs</span>
                <span className={styles.dataValue}>{node.details.gpus}</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'storage') {
      return (
        <div className={styles.detailPanel}>
          <h2 className={styles.panelTitle}>Storage Mounts</h2>
          <div className={styles.tableWrapper}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Mount Point</th>
                  <th>Source</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {storage.map((st, idx) => (
                  <tr key={idx}>
                    <td>{st.mount}</td>
                    <td>{st.source}</td>
                    <td>{st.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (activeTab === 'network') {
      return (
        <div className={styles.detailPanel}>
          <h2 className={styles.panelTitle}>Networking</h2>
          <div className={styles.tableWrapper}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Interface</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                {network.map((net, idx) => (
                  <tr key={idx}>
                    <td>{net.interface}</td>
                    <td>{net.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        <h1 className={styles.title}>Cluster Information</h1>
        <p className={styles.subtitle}>Detailed infrastructure specifications and live state</p>
      </header>

      <div className={styles.guiContainer}>
        {/* Sidebar Navigation */}
        <div className={styles.sidebar}>
          <div className={styles.navGroup}>
            <h3 className={styles.navGroupTitle}>Overview</h3>
            <button 
              className={`${styles.navItem} ${activeTab === 'general' ? styles.navItemActive : ''}`}
              onClick={() => setActiveTab('general')}
            >
              General Info
            </button>
          </div>

          <div className={styles.navGroup}>
            <h3 className={styles.navGroupTitle}>Infrastructure</h3>
            <button 
              className={`${styles.navItem} ${activeTab === 'storage' ? styles.navItemActive : ''}`}
              onClick={() => setActiveTab('storage')}
            >
              Storage Mounts
            </button>
            <button 
              className={`${styles.navItem} ${activeTab === 'network' ? styles.navItemActive : ''}`}
              onClick={() => setActiveTab('network')}
            >
              Networking
            </button>
          </div>

          <div className={styles.navGroup}>
            <h3 className={styles.navGroupTitle}>Nodes</h3>
            {nodes.map(node => (
              <button 
                key={node.id}
                className={`${styles.navItem} ${activeTab === `node-${node.id}` ? styles.navItemActive : ''}`}
                onClick={() => setActiveTab(`node-${node.id}`)}
              >
                {node.name}
              </button>
            ))}
          </div>
        </div>

        {/* Detail Content Area */}
        <div className={styles.contentArea}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
