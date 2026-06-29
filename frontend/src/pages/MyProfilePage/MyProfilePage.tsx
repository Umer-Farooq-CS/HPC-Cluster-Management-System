import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from './MyProfilePage.module.css';

interface EnvStack {
  id: number;
  name: string;
  display_name: string;
  description: string;
  category: string;
  modules: string[];
}

interface ProfileData {
  username: string;
  env_profile: string | null;
  available_stacks: EnvStack[];
}

const CATEGORY_COLORS: Record<string, string> = {
  Developer: 'hsl(168, 80%, 42%)',
  Scientific: 'hsl(258, 80%, 65%)',
  MPI: 'hsl(38, 92%, 58%)',
  Custom: 'hsl(330, 75%, 60%)',
};

const CATEGORY_ICONS: Record<string, string> = {
  Developer: '⚙',
  Scientific: '🔬',
  MPI: '⚡',
  Custom: '✦',
};

export default function MyProfilePage() {
  const { token, username } = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [selectedStack, setSelectedStack] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Lmod Collections
  const [collections, setCollections] = useState<string>('');
  const [collectionName, setCollectionName] = useState('');
  const [restoreTarget, setRestoreTarget] = useState('');
  const [collectionLoading, setCollectionLoading] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/env-stacks/me`, { headers });
      if (res.ok) {
        const data: ProfileData = await res.json();
        setProfile(data);
        setSelectedStack(data.env_profile || 'none');
      }
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, token]);

  const fetchCollections = useCallback(async () => {
    const res = await fetch(`${apiUrl}/env-stacks/me/collections`, { headers });
    if (res.ok) {
      const data = await res.json();
      setCollections(data.collections || '');
    }
  }, [apiUrl, token]);

  useEffect(() => {
    fetchProfile();
    fetchCollections();
  }, [fetchProfile, fetchCollections]);

  const handleApplyProfile = async () => {
    if (!selectedStack) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`${apiUrl}/env-stacks/me/select`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ stack_name: selectedStack === 'none' ? '' : selectedStack }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ msg: data.message, type: 'success' });
        fetchProfile();
      } else {
        setFeedback({ msg: data.detail || 'Failed to apply profile.', type: 'error' });
      }
    } catch (err: any) {
      setFeedback({ msg: err.message, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCollection = async () => {
    if (!collectionName.trim()) return;
    setCollectionLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`${apiUrl}/env-stacks/me/save-collection`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ collection_name: collectionName }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ msg: data.message, type: 'success' });
        setCollectionName('');
        fetchCollections();
      } else {
        setFeedback({ msg: data.detail, type: 'error' });
      }
    } finally {
      setCollectionLoading(false);
    }
  };

  const handleRestoreCollection = async () => {
    if (!restoreTarget.trim()) return;
    setCollectionLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`${apiUrl}/env-stacks/me/restore-collection`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ collection_name: restoreTarget }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ msg: data.message, type: 'success' });
      } else {
        setFeedback({ msg: data.detail, type: 'error' });
      }
    } finally {
      setCollectionLoading(false);
    }
  };

  const currentStack = profile?.available_stacks.find(s => s.name === profile?.env_profile);
  const currentColor = currentStack ? (CATEGORY_COLORS[currentStack.category] || CATEGORY_COLORS.Custom) : undefined;

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingShimmer}>
          <div className={styles.shimmerBlock} />
          <div className={styles.shimmerBlock} style={{ height: '120px' }} />
          <div className={styles.shimmerBlock} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div className={styles.userBadge}>
          <div className={styles.avatarRing}>
            <span className={styles.avatarChar}>{username?.[0]?.toUpperCase() || '?'}</span>
          </div>
          <div>
            <h1 className={styles.title}>My Environment Profile</h1>
            <p className={styles.subtitle}>Logged in as <strong>{username}</strong></p>
          </div>
        </div>

        {/* Current Profile Pill */}
        <div className={styles.currentProfilePill} style={{ borderColor: currentColor, boxShadow: currentColor ? `0 0 18px ${currentColor}33` : undefined }}>
          <span className={styles.pillDot} style={{ background: currentColor || 'var(--text-muted)' }} />
          <span>
            {currentStack ? (
              <><strong style={{ color: currentColor }}>{currentStack.display_name}</strong> <span className={styles.pillSub}>active</span></>
            ) : (
              <span className={styles.pillSub}>Base Spack Environment (no profile)</span>
            )}
          </span>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`${styles.feedbackBar} ${feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError}`}>
          <span>{feedback.type === 'success' ? '✓' : '✕'}</span>
          <span>{feedback.msg}</span>
          <button onClick={() => setFeedback(null)} className={styles.feedbackClose}>✕</button>
        </div>
      )}

      <div className={styles.twoCol}>
        {/* === Left Column: Profile Selector === */}
        <div className={styles.leftCol}>
          <section className={`${styles.card} glass-panel`}>
            <h2 className={styles.cardTitle}>
              <span className={styles.cardTitleIcon}>◈</span>
              Choose Your Environment Stack
            </h2>
            <p className={styles.cardDesc}>
              Select a pre-built stack to load automatically every time you log in.
              Your <code className={styles.code}>~/.bashrc</code> will be updated automatically.
            </p>

            {/* None option */}
            <div
              className={`${styles.stackOption} ${selectedStack === 'none' ? styles.stackOptionSelected : ''}`}
              onClick={() => setSelectedStack('none')}
              id="stack-option-none"
            >
              <div className={styles.stackOptionIcon} style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>∅</div>
              <div className={styles.stackOptionBody}>
                <div className={styles.stackOptionName}>Base Spack (no profile)</div>
                <div className={styles.stackOptionDesc}>Only the base module path is set. You manually run <code className={styles.code}>module load</code> as needed.</div>
              </div>
              {selectedStack === 'none' && <span className={styles.checkmark}>✓</span>}
            </div>

            {profile?.available_stacks.map(stack => {
              const color = CATEGORY_COLORS[stack.category] || CATEGORY_COLORS.Custom;
              const icon = CATEGORY_ICONS[stack.category] || '✦';
              const isSelected = selectedStack === stack.name;
              return (
                <div
                  key={stack.id}
                  className={`${styles.stackOption} ${isSelected ? styles.stackOptionSelected : ''}`}
                  style={{ '--option-color': color } as any}
                  onClick={() => setSelectedStack(stack.name)}
                  id={`stack-option-${stack.name}`}
                >
                  <div className={styles.stackOptionIcon} style={{ background: `${color}22`, color }}>{icon}</div>
                  <div className={styles.stackOptionBody}>
                    <div className={styles.stackOptionName}>
                      {stack.display_name}
                      <span className={styles.stackCat} style={{ background: `${color}22`, color }}>{stack.category}</span>
                    </div>
                    <div className={styles.stackOptionDesc}>{stack.description}</div>
                    <div className={styles.moduleChips}>
                      {stack.modules.map(m => <span key={m} className={styles.chip}>{m}</span>)}
                    </div>
                  </div>
                  {isSelected && <span className={styles.checkmark} style={{ color }}>✓</span>}
                </div>
              );
            })}

            <button
              className={styles.applyBtn}
              onClick={handleApplyProfile}
              disabled={isSaving || selectedStack === null}
              id="apply-profile-btn"
            >
              {isSaving ? (
                <><span className={styles.spinner} />Applying...</>
              ) : (
                <><span>⚡</span> Apply Profile</>
              )}
            </button>
          </section>

          {/* Bashrc Preview */}
          {selectedStack && selectedStack !== 'none' && (
            <section className={`${styles.card} glass-panel`}>
              <h2 className={styles.cardTitle}><span className={styles.cardTitleIcon}>{'</>'}</span> ~/.bashrc Preview</h2>
              <p className={styles.cardDesc}>This block will be written to your <code className={styles.code}>~/.bashrc</code> upon applying.</p>
              <pre className={styles.bashrcPreview}>
{`# --- HPC PROFILE MANAGED BLOCK START ---
module purge
module load ${selectedStack}
# --- HPC PROFILE MANAGED BLOCK END ---`}
              </pre>
            </section>
          )}
        </div>

        {/* === Right Column: Module Explorer + Collections === */}
        <div className={styles.rightCol}>
          {/* Module Explorer for selected stack */}
          <section className={`${styles.card} glass-panel`}>
            <h2 className={styles.cardTitle}><span className={styles.cardTitleIcon}>⬡</span> Module Explorer</h2>
            {selectedStack && selectedStack !== 'none' ? (() => {
              const stack = profile?.available_stacks.find(s => s.name === selectedStack);
              if (!stack) return <p className={styles.emptyMsg}>Stack not found.</p>;
              const color = CATEGORY_COLORS[stack.category] || CATEGORY_COLORS.Custom;
              return (
                <div>
                  <div className={styles.explorerHeader}>
                    <span style={{ color, fontWeight: 600 }}>{CATEGORY_ICONS[stack.category]} {stack.display_name}</span>
                    <span className={styles.moduleCount}>{stack.modules.length} modules</span>
                  </div>
                  <div className={styles.moduleList}>
                    {stack.modules.map((m, i) => (
                      <div key={m} className={styles.moduleEntry} style={{ animationDelay: `${i * 40}ms` }}>
                        <span className={styles.moduleIdx}>{String(i + 1).padStart(2, '0')}</span>
                        <span className={styles.moduleName}>{m}</span>
                        <span className={styles.moduleArrow}>→</span>
                      </div>
                    ))}
                  </div>
                  <div className={styles.luaGeneratedSection}>
                    <label className={styles.luaLabel}>Generated Lua Metamodule</label>
                    <pre className={styles.luaMini}>
{`load("${stack.modules.join('")\nload("')}")`}
                    </pre>
                  </div>
                </div>
              );
            })() : (
              <p className={styles.emptyMsg}>Select a stack on the left to inspect its modules.</p>
            )}
          </section>

          {/* Lmod Collections */}
          <section className={`${styles.card} glass-panel`}>
            <h2 className={styles.cardTitle}><span className={styles.cardTitleIcon}>💾</span> Lmod Collections</h2>
            <p className={styles.cardDesc}>
              Save your current loaded modules as a named collection using <code className={styles.code}>module save</code>, then restore it at any time.
            </p>

            {/* Save collection */}
            <div className={styles.collectionRow}>
              <input
                className={styles.collectionInput}
                value={collectionName}
                onChange={e => setCollectionName(e.target.value.replace(/\s+/g, '_'))}
                placeholder="collection-name"
                id="save-collection-name"
              />
              <button
                className={styles.collectionBtn}
                onClick={handleSaveCollection}
                disabled={collectionLoading || !collectionName.trim()}
                id="save-collection-btn"
              >
                Save Collection
              </button>
            </div>

            {/* Saved collections list */}
            <div className={styles.collectionOutputBox}>
              <label className={styles.collectionLabel}>Saved Collections (module savelist)</label>
              <pre className={styles.collectionOutput}>{collections || 'No collections saved yet.'}</pre>
            </div>

            {/* Restore */}
            <div className={styles.restoreRow}>
              <label className={styles.collectionLabel}>Set as default login environment</label>
              <div className={styles.collectionRow}>
                <input
                  className={styles.collectionInput}
                  value={restoreTarget}
                  onChange={e => setRestoreTarget(e.target.value)}
                  placeholder="collection-name to restore"
                  id="restore-collection-name"
                />
                <button
                  className={`${styles.collectionBtn} ${styles.collectionBtnGreen}`}
                  onClick={handleRestoreCollection}
                  disabled={collectionLoading || !restoreTarget.trim()}
                  id="restore-collection-btn"
                >
                  Set as Default
                </button>
              </div>
            </div>

            {/* Quick reference */}
            <div className={styles.quickRef}>
              <label className={styles.luaLabel}>Quick Terminal Reference</label>
              <pre className={styles.quickRefPre}>{`# Save current modules as a named collection
module save my_project_env

# See all your saved collections
module savelist

# Restore a collection
module restore my_project_env

# Auto-load on login — save as 'default'
module save default`}</pre>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
