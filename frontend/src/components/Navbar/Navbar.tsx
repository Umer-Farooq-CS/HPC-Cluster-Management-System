import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import styles from './Navbar.module.css'

export default function Navbar() {
  const { pathname } = useLocation()
  const { token, role, username, logout, isAuthenticated } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [isConnected, setIsConnected] = useState(false)
  const [isAdminDropdownOpen, setIsAdminDropdownOpen] = useState(false)

  // Ping backend every 5 seconds to check connection status
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const url = token
          ? `https://${window.location.hostname}/api/v1/slaves/arp`
          : `https://${window.location.hostname}/api/v1/env-stacks/`;
        const headers: Record<string, string> = token
          ? { 'Authorization': `Bearer ${token}` }
          : {};
        const res = await fetch(url, { headers });
        if (res.status !== 502 && res.status !== 504) setIsConnected(true);
        else setIsConnected(false);
      } catch (err) {
        setIsConnected(false);
      }
    }

    checkConnection()
    const interval = setInterval(checkConnection, 5000)
    return () => clearInterval(interval)
  }, [token])

  const isAdmin = role === 'admin' || role === 'super_admin';

  // Close dropdown when route changes
  const handleDropdownLinkClick = () => {
    setIsAdminDropdownOpen(false);
  };

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
              <li 
                className={styles.dropdownWrap}
              >
                <button 
                  className={`${styles.link} ${styles.dropdownTrigger} ${isAdminDropdownOpen ? styles.dropdownTriggerActive : ''}`}
                  onClick={() => setIsAdminDropdownOpen(prev => !prev)}
                  aria-expanded={isAdminDropdownOpen}
                >
                  Administration <span className={`${styles.dropdownChevron} ${isAdminDropdownOpen ? styles.dropdownChevronOpen : ''}`}>▼</span>
                </button>
                {isAdminDropdownOpen && (
                  <ul className={styles.dropdownMenu}>
                    <li>
                      <Link to="/provision/master" onClick={handleDropdownLinkClick} className={`${styles.dropdownItem} ${pathname === '/provision/master' ? styles.dropdownItemActive : ''}`}>Master Provisioning</Link>
                    </li>
                    <li>
                      <Link to="/provision/slave" onClick={handleDropdownLinkClick} className={`${styles.dropdownItem} ${pathname === '/provision/slave' ? styles.dropdownItemActive : ''}`}>Compute Nodes</Link>
                    </li>
                    <li>
                      <Link to="/users" onClick={handleDropdownLinkClick} className={`${styles.dropdownItem} ${pathname === '/users' ? styles.dropdownItemActive : ''}`}>User Management</Link>
                    </li>
                    <li>
                      <Link to="/env-stacks" onClick={handleDropdownLinkClick} className={`${styles.dropdownItem} ${pathname === '/env-stacks' ? styles.dropdownItemActive : ''}`}>Env Profiles</Link>
                    </li>
                  </ul>
                )}
              </li>
              <li>
                <Link to="/cluster-info" className={`${styles.link} ${pathname === '/cluster-info' ? styles.linkActive : ''}`}>Cluster Info</Link>
              </li>
            </>
          )}
          <li>
            <Link to="/my-profile" className={`${styles.link} ${pathname === '/my-profile' ? styles.linkActive : ''}`}>My Profile</Link>
          </li>
        </ul>

        {/* Status pill & Auth */}
        <div className={styles.rightSection}>
          {isAuthenticated ? (
            <div className={styles.userSection}>
              <div className={styles.userInfo}>
                <span className={styles.userDot} />
                <span className={styles.userName}>{username}</span>
                <span className={styles.userRole}>{role?.replace('_', ' ')}</span>
              </div>
              <button 
                onClick={logout}
                className={styles.logoutBtn}
                aria-label="Log out"
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

          {/* Theme Toggle */}
          <div className={styles.themeToggleWrap}>
            <span className={styles.themeIcon}>{theme === 'light' ? '◑' : '○'}</span>
            <label className="toggle-switch" aria-label="Toggle Theme">
              <input type="checkbox" checked={theme === 'dark'} onChange={toggleTheme} />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>
    </nav>
  )
}
