import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import styles from './Navbar.module.css'

export default function Navbar() {
  const { pathname } = useLocation()
  const { token, role, username, logout, isAuthenticated } = useAuth()
  const [isConnected, setIsConnected] = useState(false)

  // Ping backend every 5 seconds to check connection status
  useEffect(() => {
    const checkConnection = async () => {
      if (!token) return;
      try {
        const res = await fetch(`https://${window.location.hostname}/api/v1/slaves/arp`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
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

  const isAdmin = role === 'admin' || role === 'super_admin';

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
          <li>
            <Link to="/" className={`${styles.link} ${pathname === '/' ? styles.linkActive : ''}`}>Home</Link>
          </li>
          {isAdmin && (
            <>
              <li>
                <Link to="/provision/master" className={`${styles.link} ${pathname === '/provision/master' ? styles.linkActive : ''}`}>Master Provisioning</Link>
              </li>
              <li>
                <Link to="/provision/slave" className={`${styles.link} ${pathname === '/provision/slave' ? styles.linkActive : ''}`}>Compute Nodes</Link>
              </li>
              <li>
                <Link to="/users" className={`${styles.link} ${pathname === '/users' ? styles.linkActive : ''}`}>User Management</Link>
              </li>
            </>
          )}
        </ul>

        {/* Status pill & Auth */}
        <div className={styles.statusWrap}>
          {isAuthenticated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                User: <strong>{username}</strong> <span style={{opacity: 0.7, fontSize: '0.75rem'}}>({role?.replace('_', ' ')})</span>
              </span>
              <button 
                onClick={logout}
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
