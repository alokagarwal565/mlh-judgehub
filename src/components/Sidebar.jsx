import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useActiveEvent } from '../context/ActiveEventContext';
import { useState } from 'react';
import api from '../services/api';

const adminLinks = [
  { to: '/admin', label: 'Dashboard', icon: '📊', end: true },
  { to: '/admin/events', label: 'Events', icon: '🎪' },
  { to: '/admin/tracks', label: 'Tracks', icon: '🏷️' },
  { section: 'Teams & Judges' },
  { to: '/admin/import-teams', label: 'Import Teams', icon: '📥' },
  { to: '/admin/import-judges', label: 'Import Judges', icon: '👨‍⚖️' },
  { to: '/admin/projects', label: 'Projects', icon: '📁' },
  { to: '/admin/judges', label: 'Judges', icon: '👥' },
  { section: 'Judging' },
  { to: '/admin/assignments', label: 'Assignments', icon: '🔗' },
  { to: '/admin/progress', label: 'Progress', icon: '📈' },
  { to: '/admin/integrity', label: 'Integrity', icon: '🛡️' },
  { to: '/admin/results', label: 'Results', icon: '🏆' },
  { to: '/admin/edit-requests', label: 'Edit Requests', icon: '📩' },
  { section: 'System' },
  { to: '/admin/users', label: 'Users', icon: '👤' },
];

const judgeLinks = [
  { to: '/judge', label: 'My Sets', icon: '📋', end: true },
];

const teamLinks = [
  { to: '/team', label: 'Dashboard', icon: '🏠', end: true },
];

export default function Sidebar({ role }) {
  const { user, logout } = useAuth();
  const { activeEvent } = useActiveEvent();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const links = role === 'ADMIN' ? adminLinks : role === 'JUDGE' ? judgeLinks : teamLinks;

  const handleLogout = () => { logout(); navigate('/login'); };

  const openPwModal = () => {
    setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPwError(''); setPwSuccess(false); setShowPwModal(true);
  };

  const handleChangePassword = async () => {
    setPwError('');
    if (!pwForm.currentPassword || !pwForm.newPassword) return setPwError('All fields are required');
    if (pwForm.newPassword !== pwForm.confirmPassword) return setPwError('New passwords do not match');
    if (pwForm.newPassword.length < 4) return setPwError('Password must be at least 4 characters');
    setPwSaving(true);
    try {
      await api.put('/auth/change-password', { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      setPwSuccess(true);
      setTimeout(() => setShowPwModal(false), 1500);
    } catch (e) {
      setPwError(e.response?.data?.error || 'Failed to change password');
    } finally { setPwSaving(false); }
  };

  return (
    <>
      <div className="mobile-header">
        <button className="hamburger" onClick={() => setOpen(true)}>☰</button>
        <span style={{fontWeight:700,fontSize:14,background:'var(--gradient-primary)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>MLH Judge</span>
        <div style={{width:32}}/>
      </div>
      <div className={`sidebar-overlay ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <button className="sidebar-close" onClick={() => setOpen(false)}>✕</button>
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">⚡</div>
          <h2>MLH Judge</h2>
        </div>
        {role === 'ADMIN' && activeEvent && (
          <div style={{
            padding: '8px 16px',
            margin: '0 12px 16px',
            background: 'rgba(var(--accent-rgb), 0.1)',
            borderRadius: 12,
            border: '1px solid rgba(var(--accent-rgb), 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}>
            <span style={{fontSize: 16}}>🌟</span>
            <div style={{overflow: 'hidden'}}>
              <div style={{fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em'}}>Active Event</div>
              <div style={{fontSize: 13, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                {activeEvent.name}
              </div>
            </div>
          </div>
        )}
        <nav className="sidebar-nav">
          {links.map((item, i) =>
            item.section ? (
              <div key={i} className="sidebar-section">{item.section}</div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => isActive ? 'active' : ''}
                onClick={() => setOpen(false)}
              >
                <span>{item.icon}</span> {item.label}
              </NavLink>
            )
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{user?.name?.[0]?.toUpperCase() || '?'}</div>
            <div className="sidebar-user-info">
              <div className="name">{user?.name}</div>
              <div className="role">{user?.role}</div>
            </div>
            <button onClick={openPwModal} title="Change Password"
              style={{marginLeft:'auto',background:'none',border:'none',cursor:'pointer',fontSize:16,color:'var(--text-muted)',padding:4,borderRadius:6,transition:'color 0.2s'}}
              onMouseEnter={e=>e.target.style.color='var(--accent)'}
              onMouseLeave={e=>e.target.style.color='var(--text-muted)'}>
              🔑
            </button>
          </div>
          <button className="btn btn-ghost btn-sm btn-block mt-2" onClick={handleLogout}>Logout</button>
        </div>
      </aside>

      {/* ── Change Password Modal ─────────────────────── */}
      {showPwModal && (
        <div className="modal-overlay" onClick={() => setShowPwModal(false)} style={{zIndex:9999}}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth:400,width:'100%'}}>
            <div style={{height:3,background:'linear-gradient(90deg,#f59e0b,#ef4444)',borderRadius:2,marginBottom:16}}/>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
              <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(245,158,11,0.15)',border:'1px solid rgba(245,158,11,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>
                🔑
              </div>
              <div>
                <h2 style={{margin:0,fontSize:18}}>Change Password</h2>
                <p style={{margin:0,fontSize:12,color:'var(--text-muted)'}}>{user?.name} · {user?.email || user?.role}</p>
              </div>
            </div>

            {pwSuccess ? (
              <div style={{textAlign:'center',padding:'16px 0'}}>
                <div style={{fontSize:36,marginBottom:8}}>✅</div>
                <p style={{color:'var(--success)',fontWeight:600}}>Password updated successfully!</p>
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label className="form-label">Current Password <span style={{color:'var(--accent)'}}>*</span></label>
                  <input className="form-input" type="password" placeholder="Your current password"
                    value={pwForm.currentPassword} onChange={e => setPwForm(f => ({...f, currentPassword: e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">New Password <span style={{color:'var(--accent)'}}>*</span></label>
                  <input className="form-input" type="password" placeholder="Min 4 characters"
                    value={pwForm.newPassword} onChange={e => setPwForm(f => ({...f, newPassword: e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm New Password <span style={{color:'var(--accent)'}}>*</span></label>
                  <input className="form-input" type="password" placeholder="Repeat new password"
                    value={pwForm.confirmPassword} onChange={e => setPwForm(f => ({...f, confirmPassword: e.target.value}))} />
                </div>
                {pwError && <div className="alert alert-error" style={{marginBottom:12}}>{pwError}</div>}
                <div style={{display:'flex',gap:8,marginTop:20,paddingTop:16,borderTop:'1px solid var(--border-color)'}}>
                  <button className="btn btn-ghost" onClick={() => setShowPwModal(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleChangePassword} disabled={pwSaving} style={{flex:1}}>
                    {pwSaving ? 'Updating...' : '🔑 Update Password'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

