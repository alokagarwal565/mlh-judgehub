import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';

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
];

const judgeLinks = [
  { to: '/judge', label: 'My Sets', icon: '📋', end: true },
];

const teamLinks = [
  { to: '/team', label: 'Dashboard', icon: '🏠', end: true },
];

export default function Sidebar({ role }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const links = role === 'ADMIN' ? adminLinks : role === 'JUDGE' ? judgeLinks : teamLinks;

  const handleLogout = () => { logout(); navigate('/login'); };

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
          </div>
          <button className="btn btn-ghost btn-sm btn-block mt-2" onClick={handleLogout}>Logout</button>
        </div>
      </aside>
    </>
  );
}
