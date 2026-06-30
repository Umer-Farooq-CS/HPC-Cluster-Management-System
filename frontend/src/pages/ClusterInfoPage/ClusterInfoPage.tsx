import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from './ClusterInfoPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────
interface NodeInfo {
  name: string;
  state: string;
  cpus: string;
  cpus_alloc: string;
  cpu_load: string;
  memory: string;
  free_memory: string;
  gres: string;
  arch: string;
  sockets: string;
  cores_per_socket: string;
  threads_per_core: string;
  reason?: string | null;
  active_jobs: string;
}

interface JobInfo {
  job_id: string;
  name: string;
  user: string;
  state: string;
  time: string;
  nodes: string;
  cpus: string;
  reason: string;
}

interface DiskInfo {
  filesystem: string;
  size: string;
  used: string;
  avail: string;
  use_pct: string;
  mount: string;
}

interface ClusterData {
  master: {
    hostname: string;
    kernel: string;
    os: string;
    ip: string;
    uptime: {
      raw: string;
      uptime: string;
      users: string;
      load_avg: string;
    };
    memory: {
      total?: string;
      used?: string;
      free?: string;
      available?: string;
      swap_total?: string;
      swap_used?: string;
    };
  };
  nodes: NodeInfo[];
  jobs: JobInfo[];
  summary: {
    total_nodes: number;
    idle: number;
    alloc: number;
    down: number;
  };
  disks: DiskInfo[];
}

// ─── Auto-refresh interval (industry standard: 30s for HPC dashboards) ────────
const REFRESH_INTERVAL_MS = 30_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function StateChip({ state }: { state: string }) {
  const s = state.toUpperCase();
  let cls = styles.stateChip;
  if (s.includes('IDLE') || s === 'ACTIVE' || s === 'RUNNING') cls = `${styles.stateChip} ${styles.stateIdle}`;
  else if (s.includes('ALLOC') || s.includes('MIX')) cls = `${styles.stateChip} ${styles.stateAlloc}`;
  else if (s.includes('DOWN') || s.includes('DRAIN') || s.includes('FAIL')) cls = `${styles.stateChip} ${styles.stateDown}`;
  return <span className={cls}>{state}</span>;
}

function JobStateChip({ state }: { state: string }) {
  const s = state.toUpperCase();
  let cls = styles.stateChip;
  if (s === 'R' || s === 'RUNNING') cls = `${styles.stateChip} ${styles.stateAlloc}`;
  else if (s === 'PD' || s === 'PENDING') cls = `${styles.stateChip} ${styles.statePending}`;
  else if (s === 'CG' || s === 'COMPLETING') cls = `${styles.stateChip} ${styles.stateIdle}`;
  else cls = `${styles.stateChip} ${styles.stateDown}`;
  const labels: Record<string, string> = { R: 'Running', PD: 'Pending', CG: 'Completing', F: 'Failed', CA: 'Cancelled' };
  return <span className={cls}>{labels[state] || state}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ClusterInfoPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState<ClusterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_MS / 1000);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL || `https://${window.location.hostname}/api/v1`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/cluster-info/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
      setCountdown(REFRESH_INTERVAL_MS / 1000);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch cluster data');
    } finally {
      setLoading(false);
    }
  }, [token, apiUrl]);

  // Initial load + interval
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Countdown ticker
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? REFRESH_INTERVAL_MS / 1000 : prev - 1));
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [lastRefresh]);

  const selectedNode = activeTab.startsWith('node-')
    ? data?.nodes.find(n => n.name === activeTab.replace('node-', ''))
    : null;

  // ─── Render helpers ──────────────────────────────────────────────────────
  const renderOverview = () => (
    <div className={styles.detailPanel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Cluster Overview</h2>
      </div>

      {/* Summary cards */}
      <div className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryValue}>{data?.summary.total_nodes ?? '—'}</span>
          <span className={styles.summaryLabel}>Total Nodes</span>
        </div>
        <div className={`${styles.summaryCard} ${styles.summaryIdle}`}>
          <span className={styles.summaryValue}>{data?.summary.idle ?? '—'}</span>
          <span className={styles.summaryLabel}>Idle</span>
        </div>
        <div className={`${styles.summaryCard} ${styles.summaryAlloc}`}>
          <span className={styles.summaryValue}>{data?.summary.alloc ?? '—'}</span>
          <span className={styles.summaryLabel}>Allocated</span>
        </div>
        <div className={`${styles.summaryCard} ${styles.summaryDown}`}>
          <span className={styles.summaryValue}>{data?.summary.down ?? '—'}</span>
          <span className={styles.summaryLabel}>Down / Drain</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryValue}>{data?.jobs.length ?? '—'}</span>
          <span className={styles.summaryLabel}>Active Jobs</span>
        </div>
      </div>

      {/* Master node info */}
      <div className={styles.sectionGroup}>
        <h3 className={styles.sectionHeading}>Master Node — {data?.master.hostname}</h3>
        <div className={styles.gridContainer}>
          <div className={styles.dataCard}>
            <span className={styles.dataLabel}>IP Address</span>
            <span className={styles.dataValue}>{data?.master.ip}</span>
          </div>
          <div className={styles.dataCard}>
            <span className={styles.dataLabel}>Operating System</span>
            <span className={styles.dataValue}>{data?.master.os || '—'}</span>
          </div>
          <div className={styles.dataCard}>
            <span className={styles.dataLabel}>Kernel</span>
            <span className={styles.dataValue}>{data?.master.kernel || '—'}</span>
          </div>
          <div className={styles.dataCard}>
            <span className={styles.dataLabel}>Uptime</span>
            <span className={styles.dataValue}>{data?.master.uptime.uptime || '—'}</span>
          </div>
          <div className={styles.dataCard}>
            <span className={styles.dataLabel}>Load Average</span>
            <span className={styles.dataValue}>{data?.master.uptime.load_avg || '—'}</span>
          </div>
          <div className={styles.dataCard}>
            <span className={styles.dataLabel}>Active Users</span>
            <span className={styles.dataValue}>{data?.master.uptime.users || '—'}</span>
          </div>
          <div className={styles.dataCard}>
            <span className={styles.dataLabel}>RAM Total / Used</span>
            <span className={styles.dataValue}>
              {data?.master.memory.total || '—'} / {data?.master.memory.used || '—'}
            </span>
          </div>
          <div className={styles.dataCard}>
            <span className={styles.dataLabel}>RAM Available</span>
            <span className={styles.dataValue}>{data?.master.memory.available || '—'}</span>
          </div>
        </div>
      </div>

      {/* sinfo node table */}
      <div className={styles.sectionGroup}>
        <h3 className={styles.sectionHeading}>Node States (sinfo)</h3>
        <div className={styles.tableWrapper}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Node</th>
                <th>State</th>
                <th>CPUs (Total / Alloc)</th>
                <th>CPU Load</th>
                <th>Memory</th>
                <th>Free Memory</th>
                <th>GPUs</th>
                <th>Active Jobs</th>
              </tr>
            </thead>
            <tbody>
              {data?.nodes.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No nodes reported by Slurm</td></tr>
              )}
              {data?.nodes.map(node => (
                <tr
                  key={node.name}
                  className={styles.clickableRow}
                  onClick={() => setActiveTab(`node-${node.name}`)}
                >
                  <td style={{ fontWeight: 600 }}>{node.name}</td>
                  <td><StateChip state={node.state} /></td>
                  <td>{node.cpus} / {node.cpus_alloc}</td>
                  <td>{node.cpu_load}</td>
                  <td>{node.memory}</td>
                  <td>{node.free_memory}</td>
                  <td>{node.gres}</td>
                  <td>{node.active_jobs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderJobs = () => (
    <div className={styles.detailPanel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Job Queue (squeue)</h2>
        <span className={styles.badge}>{data?.jobs.length ?? 0} jobs</span>
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Name</th>
              <th>User</th>
              <th>State</th>
              <th>Time</th>
              <th>Nodes</th>
              <th>CPUs</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {(!data?.jobs || data.jobs.length === 0) && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No jobs currently in the queue</td></tr>
            )}
            {data?.jobs.map(job => (
              <tr key={job.job_id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{job.job_id}</td>
                <td>{job.name}</td>
                <td>{job.user}</td>
                <td><JobStateChip state={job.state} /></td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{job.time}</td>
                <td>{job.nodes}</td>
                <td>{job.cpus}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{job.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderStorage = () => (
    <div className={styles.detailPanel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Storage (df -h)</h2>
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>Filesystem</th>
              <th>Size</th>
              <th>Used</th>
              <th>Available</th>
              <th>Use%</th>
              <th>Mount Point</th>
            </tr>
          </thead>
          <tbody>
            {(!data?.disks || data.disks.length === 0) && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No disk data available</td></tr>
            )}
            {data?.disks.map((disk, i) => {
              const pct = parseInt(disk.use_pct);
              const isHighUsage = pct >= 85;
              return (
                <tr key={i}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{disk.filesystem}</td>
                  <td>{disk.size}</td>
                  <td style={{ color: isHighUsage ? 'var(--accent-danger)' : undefined }}>{disk.used}</td>
                  <td>{disk.avail}</td>
                  <td>
                    <span style={{ color: isHighUsage ? 'var(--accent-danger)' : pct >= 70 ? 'var(--accent-warning)' : 'var(--accent-secondary)', fontWeight: 600 }}>
                      {disk.use_pct}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{disk.mount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderNode = (node: NodeInfo) => (
    <div className={styles.detailPanel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{node.name}</h2>
        <StateChip state={node.state} />
        {node.reason && <span className={styles.reasonChip}>⚠ {node.reason}</span>}
      </div>

      <div className={styles.sectionGroup}>
        <h3 className={styles.sectionHeading}>CPU</h3>
        <div className={styles.gridContainer}>
          <div className={styles.dataCard}><span className={styles.dataLabel}>Total CPUs</span><span className={styles.dataValue}>{node.cpus}</span></div>
          <div className={styles.dataCard}><span className={styles.dataLabel}>Allocated CPUs</span><span className={styles.dataValue}>{node.cpus_alloc}</span></div>
          <div className={styles.dataCard}><span className={styles.dataLabel}>CPU Load</span><span className={styles.dataValue}>{node.cpu_load}</span></div>
          <div className={styles.dataCard}><span className={styles.dataLabel}>Sockets</span><span className={styles.dataValue}>{node.sockets}</span></div>
          <div className={styles.dataCard}><span className={styles.dataLabel}>Cores / Socket</span><span className={styles.dataValue}>{node.cores_per_socket}</span></div>
          <div className={styles.dataCard}><span className={styles.dataLabel}>Threads / Core</span><span className={styles.dataValue}>{node.threads_per_core}</span></div>
        </div>
      </div>

      <div className={styles.sectionGroup}>
        <h3 className={styles.sectionHeading}>Memory & Storage</h3>
        <div className={styles.gridContainer}>
          <div className={styles.dataCard}><span className={styles.dataLabel}>Total Memory</span><span className={styles.dataValue}>{node.memory}</span></div>
          <div className={styles.dataCard}><span className={styles.dataLabel}>Free Memory</span><span className={styles.dataValue}>{node.free_memory}</span></div>
          <div className={styles.dataCard}><span className={styles.dataLabel}>GPUs (GRES)</span><span className={styles.dataValue}>{node.gres}</span></div>
        </div>
      </div>

      <div className={styles.sectionGroup}>
        <h3 className={styles.sectionHeading}>System</h3>
        <div className={styles.gridContainer}>
          <div className={styles.dataCard}><span className={styles.dataLabel}>Architecture</span><span className={styles.dataValue}>{node.arch}</span></div>
          <div className={styles.dataCard}><span className={styles.dataLabel}>Active Jobs</span><span className={styles.dataValue}>{node.active_jobs}</span></div>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    if (loading && !data) {
      return (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p>Fetching live cluster data…</p>
        </div>
      );
    }
    if (error && !data) {
      return (
        <div className={styles.errorState}>
          <span className={styles.errorIcon}>⚠</span>
          <p>{error}</p>
          <button className={styles.retryBtn} onClick={fetchData}>Retry</button>
        </div>
      );
    }
    if (activeTab === 'overview') return renderOverview();
    if (activeTab === 'jobs') return renderJobs();
    if (activeTab === 'storage') return renderStorage();
    if (activeTab.startsWith('node-') && selectedNode) return renderNode(selectedNode);
    return renderOverview();
  };

  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.title}>Cluster Information</h1>
            <p className={styles.subtitle}>Live infrastructure state — refreshes every 30 seconds</p>
          </div>
          <div className={styles.refreshControls}>
            {loading && <span className={styles.loadingPill}>⟳ Refreshing…</span>}
            {!loading && lastRefresh && (
              <span className={styles.lastRefresh}>
                Updated {lastRefresh.toLocaleTimeString()} · next in {countdown}s
              </span>
            )}
            <button className={styles.refreshBtn} onClick={fetchData} disabled={loading}>
              ⟳ Refresh Now
            </button>
          </div>
        </div>
      </header>

      <div className={styles.guiContainer}>
        {/* Sidebar */}
        <div className={styles.sidebar}>
          <div className={styles.navGroup}>
            <h3 className={styles.navGroupTitle}>Overview</h3>
            <button className={`${styles.navItem} ${activeTab === 'overview' ? styles.navItemActive : ''}`} onClick={() => setActiveTab('overview')}>
              Cluster Overview
            </button>
            <button className={`${styles.navItem} ${activeTab === 'jobs' ? styles.navItemActive : ''}`} onClick={() => setActiveTab('jobs')}>
              Job Queue
              {data && data.jobs.length > 0 && <span className={styles.navBadge}>{data.jobs.length}</span>}
            </button>
            <button className={`${styles.navItem} ${activeTab === 'storage' ? styles.navItemActive : ''}`} onClick={() => setActiveTab('storage')}>
              Storage (df)
            </button>
          </div>

          {data && data.nodes.length > 0 && (
            <div className={styles.navGroup}>
              <h3 className={styles.navGroupTitle}>Compute Nodes</h3>
              {data.nodes.map(node => (
                <button
                  key={node.name}
                  className={`${styles.navItem} ${activeTab === `node-${node.name}` ? styles.navItemActive : ''}`}
                  onClick={() => setActiveTab(`node-${node.name}`)}
                >
                  <span className={`${styles.navDot} ${node.state.includes('IDLE') ? styles.navDotIdle : node.state.includes('ALLOC') || node.state.includes('MIX') ? styles.navDotAlloc : styles.navDotDown}`} />
                  {node.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className={styles.contentArea}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
