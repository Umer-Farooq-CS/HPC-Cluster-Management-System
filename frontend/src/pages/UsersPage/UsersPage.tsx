import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from './UsersPage.module.css';

interface User {
  id: number;
  username: string;
  role: string;
  env_profile: string | null;
}

export default function UsersPage() {
  const { token, role: currentUserRole } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('normal_user');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${apiUrl}/users/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (err) {
      console.error("Failed to fetch users", err);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${apiUrl}/users/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username, password, role }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to create user');
      }

      setUsername('');
      setPassword('');
      setRole('normal_user');
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>User Management</h1>
      </div>

      <div className={`${styles.card} glass-panel`}>
        <h2>Create New User</h2>
        {error && <div className={styles.error}>{error}</div>}
        
        <form onSubmit={handleCreateUser} className={styles.formGrid}>
          <div className={styles.inputGroup}>
            <label>Username</label>
            <input 
              type="text" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              className={styles.input}
              required 
            />
          </div>
          <div className={styles.inputGroup}>
            <label>Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className={styles.input}
              required 
            />
          </div>
          <div className={styles.inputGroup}>
            <label>Role</label>
            <select 
              value={role} 
              onChange={e => setRole(e.target.value)} 
              className={styles.select}
            >
              <option value="normal_user">Normal User (No Admin)</option>
              <option value="admin">Admin (No Sudo)</option>
              {currentUserRole === 'super_admin' && (
                <option value="super_admin">Super Admin (Full Sudo)</option>
              )}
            </select>
          </div>
          <button type="submit" className={styles.submitBtn} disabled={isLoading}>
            {isLoading ? 'Creating System User...' : 'Create User'}
          </button>
        </form>
      </div>

      <div className={`${styles.card} glass-panel`}>
        <h2>System Users</h2>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>System Role</th>
                <th>Env Profile</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.username}</td>
                  <td>
                    <span className={`${styles.badge} ${styles[u.role]}`}>
                      {u.role.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>
                    {u.env_profile ? (
                      <span className={styles.badge} style={{ background: 'hsl(168,80%,42%,0.15)', color: 'hsl(168,80%,42%)', border: '1px solid hsl(168,80%,42%,0.3)' }}>
                        {u.env_profile}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Base Spack</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
