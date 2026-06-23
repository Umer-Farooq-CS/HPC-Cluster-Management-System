import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useKeycloak } from '@react-keycloak/web'
import styles from './Navbar.module.css'

const NAV_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Master Provisioning', to: '/provision/master' },
  { label: 'Compute Nodes', to: '/provision/slave' },
]

export default function Navbar() {
  const { pathname } = useLocation()
  const { keycloak } = useKeycloak()
  const [isConnected, setIsConnected] = useState(false)

  // Ping backend every 5 seconds to check connection status
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const res = await fetch(`https://${window.location.hostname}/api/v1/slaves/arp`)
        if (res.status !== 502) setIsConnected(true)
        else setIsConnected(false)
      } catch (err) {
        setIsConnected(false)
      }
    }

    checkConnection()
    const interval = setInterval(checkConnection, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <nav className={styles.nav} aria-label="Primary navigation">
      <div className={styles.inner}>
        {/* Brand */}
        <Link to="/" className={styles.brand} aria-label="HPC Cluster Home">
          <span className={styles.brandIcon} aria-hidden="true">⬡</span>
          <span className={styles.brandText}>
            HPC <span className={styles.brandAccent}>Cluster</span>
          </span>
        </Link>

        {/* Nav links */}
        <ul className={styles.links} role="list">
          {NAV_LINKS.map(({ label, to }) => (
            <li key={to}>
              <Link
                to={to}
                className={`${styles.link} ${pathname === to ? styles.linkActive : ''}`}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Status pill & Auth */}
        <div className={styles.statusWrap}>
          {keycloak.authenticated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                User: <strong>{keycloak.tokenParsed?.preferred_username || 'Admin'}</strong>
              </span>
              <button 
                onClick={() => keycloak.logout()}
                style={{
                  background: 'transparent', border: '1px solid var(--border-light)', 
                  color: 'var(--text-muted)', padding: '4px 12px', borderRadius: '4px',
                  cursor: 'pointer', fontSize: '0.8rem'
                }}
              >
                Logout
              </button>
            </div>
          ) : (
            <>
              <span 
                className={styles.statusDot} 
                aria-hidden="true" 
                style={{ background: isConnected ? 'var(--accent-secondary)' : 'var(--accent-danger)' }}
              />
              <span className={styles.statusLabel} style={{ color: isConnected ? 'var(--text-primary)' : 'var(--accent-danger)' }}>
                {isConnected ? 'Backend Connected' : 'Backend Disconnected'}
              </span>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
