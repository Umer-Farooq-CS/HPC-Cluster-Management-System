import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from './EnvStacksPage.module.css';

interface EnvStack {
  id: number;
  name: string;
  display_name: string;
  description: string;
  category: string;
  modules: string[];
  created_at: string;
}

interface UserWithProfile {
  id: number;
  username: string;
  role: string;
  env_profile: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  Developer: 'var(--accent-secondary)',
  Scientific: 'hsl(258, 80%, 65%)',
  MPI: 'var(--accent-warning)',
  Custom: 'hsl(330, 75%, 60%)',
};

const DEFAULT_MODULES = [
  'gcc/11.5.0-xwcconl',
  'cmake/4.3.2',
  'hwloc/2.13.0',
  'python/3.14.5-lddvwjv',
  'perl/5.42.0-dadruwd',
  'sqlite/3.53.1-mfudwzt',
  'jq/1.8.1-jnxci33',
  'htop/3.4.1-wpph7cx',
  'zlib/1.3.2-ycpxie7',
  'zstd/1.5.7-okdgpph',
  'tar/1.35-yjcpajg'
];

export default function EnvStacksPage() {
  const { token } = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

  const [stacks, setStacks] = useState<EnvStack[]>([]);
  const [users, setUsers] = useState<UserWithProfile[]>([]);
  const [selectedStack, setSelectedStack] = useState<EnvStack | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingStack, setEditingStack] = useState<EnvStack | null>(null);
  const [formName, setFormName] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('Custom');
  const [formModules, setFormModules] = useState<string[]>(['']);

  const [assigningUser, setAssigningUser] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchStacks = useCallback(async () => {
    const res = await fetch(`${apiUrl}/env-stacks/`, { headers });
    if (res.ok) setStacks(await res.json());
  }, [apiUrl, token]);

  const fetchUsers = useCallback(async () => {
    const res = await fetch(`${apiUrl}/users/`, { headers });
    if (res.ok) setUsers(await res.json());
  }, [apiUrl, token]);

  useEffect(() => {
    fetchStacks();
    fetchUsers();
  }, [fetchStacks, fetchUsers]);

  const openCreateModal = () => {
    setEditingStack(null);
    setFormName(''); setFormDisplayName(''); setFormDescription('');
    setFormCategory('Custom'); setFormModules(['']);
    setShowModal(true);
  };

  const openEditModal = (stack: EnvStack) => {
    setEditingStack(stack);
    setFormName(stack.name);
    setFormDisplayName(stack.display_name);
    setFormDescription(stack.description || '');
    setFormCategory(stack.category);
    setFormModules(stack.modules.length ? stack.modules : ['']);
    setShowModal(true);
  };

  const handleSubmitStack = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback('');
    const cleanModules = formModules.filter(m => m.trim() !== '');
    const body = JSON.stringify({
      name: formName,
      display_name: formDisplayName,
      description: formDescription,
      category: formCategory,
      modules: cleanModules,
    });

    try {
      let res;
      if (editingStack) {
        res = await fetch(`${apiUrl}/env-stacks/${editingStack.id}`, { method: 'PUT', headers, body });
      } else {
        res = await fetch(`${apiUrl}/env-stacks/`, { method: 'POST', headers, body });
      }
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed');
      }
      setFeedback(editingStack ? 'Stack updated successfully!' : 'Stack created successfully!');
      setShowModal(false);
      fetchStacks();
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteStack = async (stack: EnvStack) => {
    if (!confirm(`Delete stack "${stack.display_name}"? This cannot be undone.`)) return;
    const res = await fetch(`${apiUrl}/env-stacks/${stack.id}`, { method: 'DELETE', headers });
    if (res.ok) {
      setFeedback('Stack deleted.');
      if (selectedStack?.id === stack.id) setSelectedStack(null);
      fetchStacks();
    }
  };

  const handleAssign = async (username: string, stackId: number | null) => {
    setAssigningUser(username);
    try {
      if (stackId === null) {
        await fetch(`${apiUrl}/env-stacks/assign/${username}`, { method: 'DELETE', headers });
      } else {
        await fetch(`${apiUrl}/env-stacks/${stackId}/assign/${username}`, { method: 'POST', headers });
      }
      fetchUsers();
    } finally {
      setAssigningUser(null);
    }
  };

  const luaPreview = `-- ${formDisplayName || 'My Stack'}\nhelp([[${formDescription || 'Custom stack.'}]])\n\n${formModules.filter(m => m.trim()).map(m => `load("${m}")`).join('\n')}`;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Environment Profiles</h1>
          <p className={styles.subtitle}>Manage Lmod metamodule stacks and assign them to users</p>
        </div>
        <button className={styles.btnPrimary} onClick={openCreateModal} id="create-stack-btn">
          <span>＋</span> New Stack
        </button>
      </div>

      {feedback && (
        <div className={styles.feedback} onClick={() => setFeedback('')}>{feedback} ✕</div>
      )}

      <div className={styles.mainGrid}>
        {/* === Left: Stack Library === */}
        <section className={styles.stackLibrary}>
          <h2 className={styles.sectionTitle}>Stack Library</h2>
          <div className={styles.stackGrid}>
            {stacks.map(stack => {
              const color = CATEGORY_COLORS[stack.category] || CATEGORY_COLORS.Custom;
              const isSelected = selectedStack?.id === stack.id;
              return (
                <div
                  key={stack.id}
                  className={`${styles.stackCard} ${isSelected ? styles.stackCardSelected : ''}`}
                  style={{ '--card-accent': color } as any}
                  onClick={() => setSelectedStack(isSelected ? null : stack)}
                  id={`stack-card-${stack.id}`}
                >
                  <div className={styles.stackCardTop}>
                    <span className={styles.categoryBadge} style={{ background: `${color}22`, color, borderColor: `${color}44` }}>
                      {stack.category}
                    </span>
                    <div className={styles.stackActions}>
                      <button
                        className={styles.iconBtn}
                        onClick={e => { e.stopPropagation(); openEditModal(stack); }}
                        title="Edit"
                        id={`edit-stack-${stack.id}`}
                      >✎</button>
                      <button
                        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                        onClick={e => { e.stopPropagation(); handleDeleteStack(stack); }}
                        title="Delete"
                        id={`delete-stack-${stack.id}`}
                      >✕</button>
                    </div>
                  </div>
                  <h3 className={styles.stackName}>{stack.display_name}</h3>
                  <p className={styles.stackDesc}>{stack.description}</p>
                  <div className={styles.modulePills}>
                    {stack.modules.slice(0, 4).map(m => (
                      <span key={m} className={styles.modulePill}>{m}</span>
                    ))}
                    {stack.modules.length > 4 && (
                      <span className={styles.modulePill} style={{ opacity: 0.6 }}>+{stack.modules.length - 4} more</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected stack detail */}
          {selectedStack && (
            <div className={`${styles.stackDetail} glass-panel`}>
              <h3>📦 {selectedStack.display_name}</h3>
              <p className={styles.stackDetailDesc}>{selectedStack.description}</p>
              <div className={styles.luaBlock}>
                <span className={styles.luaLabel}>Generated Lua Metamodule</span>
                <pre className={styles.luaPre}>
{`-- /export/apps/custom_modules/${selectedStack.name}.lua
help([[${selectedStack.description}]])
whatis("Category: ${selectedStack.category}")

${selectedStack.modules.map(m => `load("${m}")`).join('\n')}`}
                </pre>
              </div>
            </div>
          )}
        </section>

        {/* === Right: User Assignment === */}
        <section className={styles.userPanel}>
          <h2 className={styles.sectionTitle}>User Profile Assignment</h2>
          <div className={`${styles.userTable} glass-panel`}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Assigned Profile</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const assignedStack = stacks.find(s => s.name === u.env_profile);
                  const accentColor = assignedStack ? (CATEGORY_COLORS[assignedStack.category] || CATEGORY_COLORS.Custom) : undefined;
                  return (
                    <tr key={u.id}>
                      <td>
                        <span className={styles.userName}>⬡ {u.username}</span>
                      </td>
                      <td>
                        <span className={`${styles.roleBadge} ${styles[`role_${u.role}`]}`}>
                          {u.role.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        {u.env_profile ? (
                          <span className={styles.profileBadge} style={{ borderColor: accentColor, color: accentColor }}>
                            {assignedStack?.display_name || u.env_profile}
                          </span>
                        ) : (
                          <span className={styles.noProfile}>Base Spack</span>
                        )}
                      </td>
                      <td>
                        <select
                          className={styles.assignSelect}
                          value={u.env_profile || ''}
                          onChange={e => handleAssign(u.username, e.target.value ? stacks.find(s => s.name === e.target.value)?.id ?? null : null)}
                          disabled={assigningUser === u.username}
                          id={`assign-select-${u.id}`}
                        >
                          <option value="">Base Spack (no profile)</option>
                          {stacks.map(s => (
                            <option key={s.id} value={s.name}>{s.display_name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* === Create / Edit Modal === */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{editingStack ? 'Edit Stack' : 'Create New Stack'}</h2>
              <button className={styles.modalClose} onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalGrid}>
                {/* Left: Form */}
                <form onSubmit={handleSubmitStack} className={styles.form}>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label>Identifier (slug)</label>
                      <input
                        className={styles.input}
                        value={formName}
                        onChange={e => setFormName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                        placeholder="e.g. base-developer"
                        required
                        disabled={!!editingStack}
                        id="modal-stack-name"
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Category</label>
                      <select className={styles.select} value={formCategory} onChange={e => setFormCategory(e.target.value)} id="modal-stack-category">
                        <option>Developer</option>
                        <option>Scientific</option>
                        <option>MPI</option>
                        <option>Custom</option>
                      </select>
                    </div>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Display Name</label>
                    <input className={styles.input} value={formDisplayName} onChange={e => setFormDisplayName(e.target.value)} placeholder="e.g. Base Developer Toolchain" required id="modal-display-name" />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Description</label>
                    <textarea className={styles.textarea} value={formDescription} onChange={e => setFormDescription(e.target.value)} rows={2} placeholder="What does this stack provide?" id="modal-description" />
                  </div>

                  <div className={styles.formGroup}>
                    <label>Modules <span className={styles.hint}>(one per row)</span></label>
                    {formModules.map((mod, idx) => (
                      <div key={idx} className={styles.moduleRow}>
                        <input
                          className={styles.input}
                          list="known-modules"
                          value={mod}
                          onChange={e => {
                            const updated = [...formModules];
                            updated[idx] = e.target.value;
                            setFormModules(updated);
                          }}
                          placeholder="e.g. gcc/11.2.0"
                          id={`module-input-${idx}`}
                        />
                        <datalist id="known-modules">
                          {DEFAULT_MODULES.map(m => <option key={m} value={m} />)}
                        </datalist>
                        <button
                          type="button"
                          className={styles.removeModuleBtn}
                          onClick={() => setFormModules(formModules.filter((_, i) => i !== idx))}
                          disabled={formModules.length === 1}
                        >✕</button>
                      </div>
                    ))}
                    <button type="button" className={styles.addModuleBtn} onClick={() => setFormModules([...formModules, ''])} id="add-module-btn">
                      + Add Module
                    </button>
                  </div>

                  <button type="submit" className={styles.btnPrimary} disabled={isSubmitting} id="submit-stack-btn">
                    {isSubmitting ? 'Saving...' : (editingStack ? 'Save Changes' : 'Create Stack')}
                  </button>
                </form>

                {/* Right: Lua Preview */}
                <div className={styles.previewPane}>
                  <label className={styles.luaLabel}>Live Lua Preview</label>
                  <pre className={styles.luaPreview}>{luaPreview}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
