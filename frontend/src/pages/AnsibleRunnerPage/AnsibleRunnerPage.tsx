import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from './AnsibleRunnerPage.module.css';

// ANSI regex to strip color codes or we can just render them out/ignore for simplicity
// For a production app, use an ansi-to-html library. Here we just print the raw text.
const stripAnsi = (text: string) => text.replace(/\x1B\[[0-9;]*m/g, '');

const AnsibleRunnerPage: React.FC = () => {
  const { token } = useAuth();
  const [playbooks, setPlaybooks] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activePlaybook, setActivePlaybook] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Auto-scroll terminal to bottom when logs change
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Fetch available playbooks on mount
  useEffect(() => {
    const fetchPlaybooks = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/ansible/playbooks`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setPlaybooks(data);
        } else {
          console.error("Failed to fetch playbooks");
        }
      } catch (err) {
        console.error("Error fetching playbooks:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchPlaybooks();
  }, []);

  const runPlaybook = (playbook: string) => {
    if (isRunning) return; // Prevent concurrent runs
    
    setLogs([]);
    setActivePlaybook(playbook);
    setIsRunning(true);

    const wsUrl = `${import.meta.env.VITE_WS_URL}/ansible/run/${encodeURIComponent(playbook)}?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      setLogs((prev) => [...prev, stripAnsi(event.data)]);
    };

    ws.onclose = () => {
      setIsRunning(false);
      wsRef.current = null;
    };

    ws.onerror = (error) => {
      console.error("WebSocket Error: ", error);
      setLogs((prev) => [...prev, "[ERROR] WebSocket connection failed. Check backend connectivity."]);
      setIsRunning(false);
    };
  };

  const stopPlaybook = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
  };

  const clearTerminal = () => {
    setLogs([]);
    setActivePlaybook(null);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Ansible Automation Runner</h1>
        <p className={styles.subtitle}>Execute infrastructure playbooks dynamically directly from the GUI.</p>
      </header>

      {loading ? (
        <div className={styles.loader}>Fetching available playbooks...</div>
      ) : (
        <>
          {playbooks.length === 0 ? (
            <div className={styles.emptyState}>
              No Ansible playbooks found in /scripts/ansible.
            </div>
          ) : (
            <div className={styles.grid}>
              {playbooks.map((pb) => (
                <div key={pb} className={styles.card}>
                  <div className={styles.cardIcon}>⚙️</div>
                  <h3 className={styles.cardTitle}>{pb}</h3>
                  <button 
                    className={styles.runBtn} 
                    onClick={() => runPlaybook(pb)}
                    disabled={isRunning && activePlaybook !== pb}
                  >
                    {isRunning && activePlaybook === pb ? 'Running...' : 'Run Playbook'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Terminal Window */}
          {(activePlaybook || logs.length > 0) && (
            <div className={styles.terminalContainer}>
              <div className={styles.terminalHeader}>
                <div className={styles.terminalControls}>
                  <div className={`${styles.control} ${styles.close}`} onClick={stopPlaybook} title="Stop Playbook"></div>
                  <div className={`${styles.control} ${styles.min}`}></div>
                  <div className={`${styles.control} ${styles.max}`}></div>
                </div>
                <div className={styles.terminalTitle}>
                  {activePlaybook ? `bash - ansible-playbook ${activePlaybook}` : 'Terminal'}
                </div>
                <button className={styles.clearBtn} onClick={clearTerminal}>Clear</button>
              </div>
              <div className={styles.terminalBody}>
                {logs.length === 0 && isRunning ? (
                  <p>Connecting to Master Node and initializing Ansible...</p>
                ) : (
                  logs.map((log, index) => (
                    <p key={index}>{log}</p>
                  ))
                )}
                <div ref={terminalEndRef} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AnsibleRunnerPage;
