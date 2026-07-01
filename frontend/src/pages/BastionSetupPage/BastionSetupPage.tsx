import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import styles from '../MasterSetupPage/MasterSetupPage.module.css'

export default function BastionSetupPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const [teleportDomain, setTeleportDomain] = useState('hpc.local')
  const [teleportEmail, setTeleportEmail] = useState('admin@hpc.local')
  const [adminIp, setAdminIp] = useState('192.168.10.100')
  
  const [isRunning, setIsRunning] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const terminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs])

  const formatLogLine = (line: string) => {
    if (line.includes('[SYSTEM]')) return <span className={styles.logSystem}>{line}</span>;
    if (line.includes('[STEP')) return <span className={styles.logHeader}>{line}</span>;
    if (line.includes('[INFO]')) return <span className={styles.logBullet}>{line}</span>;
    if (line.includes('[ERROR]') || line.includes('failed')) return <span className={styles.logError}>{line}</span>;
    return line;
  }

  const handleLaunch = () => {
    setIsRunning(true)
    setIsFinished(false)
    setLogs(['[SYSTEM] Opening WebSocket to Bastion deployment engine...'])

    const ws = new WebSocket(`wss://${window.location.hostname}/api/v1/bastion/deploy/ws?token=${token}`)

    ws.onopen = () => {
      setLogs(prev => [...prev, '[SYSTEM] Connected — sending provisioning configurations...'])
      ws.send(JSON.stringify({ teleportDomain, teleportEmail, adminIp }))
    }

    ws.onerror = () => {
      setLogs(prev => [...prev, '[SYSTEM ERROR] WebSocket connection failed. Please ensure the backend is running.'])
      setIsRunning(false)
    }

    ws.onmessage = (event) => {
      const message = event.data
      setLogs(prev => [...prev, message])
    }

    ws.onclose = () => {
      setIsRunning(false)
      setIsFinished(true)
    }
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Bastion Host Setup</h1>
        <p className={styles.subtitle}>
          Automate the installation of Teleport and secure the firewall on this server with a single click.
        </p>
      </header>

      <div className={styles.grid}>
        <main>
          <div className={styles.formSection}>
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Configuration</h2>
              <p className={styles.cardDesc}>Set up the external entry point for your entire cluster infrastructure.</p>
              
              <div className={styles.formGrid}>
                <div className={`${styles.formGroup} ${styles.full}`}>
                  <label className={styles.label}>Teleport Domain Name</label>
                  <input 
                    type="text" 
                    className={styles.input} 
                    value={teleportDomain} 
                    onChange={(e) => setTeleportDomain(e.target.value)} 
                    placeholder="e.g. hpc.local"
                  />
                </div>

                <div className={`${styles.formGroup} ${styles.full}`}>
                  <label className={styles.label}>Admin Email for Let's Encrypt</label>
                  <input 
                    type="email" 
                    className={styles.input} 
                    value={teleportEmail} 
                    onChange={(e) => setTeleportEmail(e.target.value)} 
                    placeholder="admin@hpc.local"
                  />
                </div>
                
                <div className={`${styles.formGroup} ${styles.full}`}>
                  <label className={styles.label}>Admin Laptop IP (For SSH Access)</label>
                  <input 
                    type="text" 
                    className={styles.input} 
                    value={adminIp} 
                    onChange={(e) => setAdminIp(e.target.value)} 
                    placeholder="192.168.10.x"
                  />
                </div>
              </div>
            </div>

            <div className={styles.card} style={{ marginTop: '2rem' }}>
              <h2 className={styles.cardTitle}>Execution Logs</h2>
              <div className={styles.terminal} ref={terminalRef}>
                {logs.length === 0 ? (
                  <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>Waiting to start...</span>
                ) : (
                  logs.map((line, idx) => (
                    <div key={idx} className={styles.terminalLine}>{formatLogLine(line)}</div>
                  ))
                )}
                {isRunning && <div className={styles.blinkingCursor}>_</div>}
              </div>
            </div>
          </div>
        </main>

        <aside className={styles.pipelinePanel}>
          <h3 className={styles.cardTitle}>Deployment Pipeline</h3>
          
          <div className={styles.stepList}>
            <div className={`${styles.stepItem} ${logs.length > 0 ? styles.completed : styles.active}`}>
              <div className={styles.stepIcon}>1</div>
              <div className={styles.stepContent}>
                <div className={styles.stepLabel}>Configure Firewalld</div>
              </div>
            </div>
            <div className={`${styles.stepItem} ${logs.some(l => l.includes('Teleport Gateway')) ? styles.completed : ''}`}>
              <div className={styles.stepIcon}>2</div>
              <div className={styles.stepContent}>
                <div className={styles.stepLabel}>Install Teleport</div>
              </div>
            </div>
            <div className={`${styles.stepItem} ${isFinished ? styles.completed : ''}`}>
              <div className={styles.stepIcon}>3</div>
              <div className={styles.stepContent}>
                <div className={styles.stepLabel}>Nginx Reverse Proxy</div>
              </div>
            </div>
          </div>

          <div className={styles.footer} style={{ flexDirection: 'column', gap: '1rem', borderTop: 'none', paddingTop: '1rem' }}>
            {!isRunning && !isFinished && (
              <button 
                className={`${styles.btn} ${styles.btnPrimary}`} 
                style={{ width: '100%' }}
                onClick={handleLaunch}
              >
                🚀 Initialize Bastion
              </button>
            )}
            {isRunning && (
              <button 
                className={`${styles.btn} ${styles.btnPrimary}`} 
                style={{ width: '100%' }}
                disabled
              >
                Deploying...
              </button>
            )}
             {isFinished && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                <button 
                  className={`${styles.btn} ${styles.btnPrimary}`} 
                  style={{ width: '100%', background: '#10b981', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)' }}
                  onClick={() => navigate('/provision/master')}
                >
                  Proceed to Master Node ➔
                </button>
                <button 
                  className={`${styles.btn} ${styles.btnSecondary}`} 
                  style={{ width: '100%' }}
                  onClick={() => setIsFinished(false)}
                >
                  Reset Form
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
