import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useActiveEvent } from '../context/ActiveEventContext';
import api from '../services/api';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { Input } from './ui/Input';
import {
  LayoutDashboard,
  Calendar,
  Tags,
  FolderGit2,
  Scale,
  Network,
  Activity,
  FileText,
  ShieldAlert,
  Trophy,
  UserCog,
  Layers,
  Menu,
  X,
  Sparkles,
  LogOut,
  KeyRound,
  CheckCircle2
} from './ui/icons';

const adminNavGroups = [
  {
    title: 'Overview',
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    ]
  },
  {
    title: 'Event & Setup',
    items: [
      { to: '/admin/events', label: 'Events', icon: Calendar },
      { to: '/admin/tracks', label: 'Tracks', icon: Tags },
    ]
  },
  {
    title: 'Directory',
    items: [
      { to: '/admin/projects', label: 'Projects & Teams', icon: FolderGit2 },
      { to: '/admin/judges', label: 'Judges', icon: Scale },
    ]
  },
  {
    title: 'Judging Floor',
    items: [
      { to: '/admin/assignments', label: 'Assignments', icon: Network },
      { to: '/admin/progress', label: 'Live Progress', icon: Activity },
      { to: '/admin/edit-requests', label: 'Edit Requests', icon: FileText },
    ]
  },
  {
    title: 'Integrity & Results',
    items: [
      { to: '/admin/integrity', label: 'Integrity & Flags', icon: ShieldAlert },
      { to: '/admin/results', label: 'Leaderboard', icon: Trophy },
    ]
  },
  {
    title: 'System',
    items: [
      { to: '/admin/users', label: 'Access Control', icon: UserCog },
    ]
  }
];

const judgeNavGroups = [
  {
    title: 'Judging',
    items: [
      { to: '/judge', label: 'My Assigned Sets', icon: Layers, end: true },
    ]
  }
];

const teamNavGroups = [
  {
    title: 'Portal',
    items: [
      { to: '/team', label: 'Project Dashboard', icon: FolderGit2, end: true },
    ]
  }
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

  const navGroups = role === 'ADMIN' ? adminNavGroups : role === 'JUDGE' ? judgeNavGroups : teamNavGroups;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const openPwModal = () => {
    setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPwError('');
    setPwSuccess(false);
    setShowPwModal(true);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (!pwForm.currentPassword || !pwForm.newPassword) return setPwError('All fields are required');
    if (pwForm.newPassword !== pwForm.confirmPassword) return setPwError('New passwords do not match');
    if (pwForm.newPassword.length < 4) return setPwError('Password must be at least 4 characters');

    setPwSaving(true);
    try {
      await api.put('/auth/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword
      });
      setPwSuccess(true);
      setTimeout(() => setShowPwModal(false), 1400);
    } catch (e) {
      setPwError(e.response?.data?.error || 'Failed to change password');
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <>
      {/* Mobile top bar */}
      <div className="mobile-header">
        <button
          type="button"
          className="hamburger"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
          MLH JudgeHub
        </span>
        <div style={{ width: 32 }} />
      </div>

      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${open ? 'open' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Main Sidebar */}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <button
          type="button"
          className="sidebar-close"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>

        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="sidebar-brand-title">MLH JudgeHub</div>
            <div className="sidebar-brand-tag">Evaluation Suite</div>
          </div>
        </div>

        {/* Active Event Indicator */}
        {role === 'ADMIN' && activeEvent && (
          <div className="sidebar-event-card">
            <span className="sidebar-event-dot" />
            <div style={{ overflow: 'hidden' }}>
              <div className="sidebar-event-label">Active Event</div>
              <div className="sidebar-event-name" title={activeEvent.name}>
                {activeEvent.name}
              </div>
            </div>
          </div>
        )}

        {/* Grouped Navigation Links */}
        <nav className="sidebar-nav">
          {navGroups.map((group, gIdx) => (
            <div key={gIdx} className="sidebar-group">
              <div className="sidebar-section-title">{group.title}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
                    onClick={() => setOpen(false)}
                  >
                    <span className="sidebar-item-icon">
                      <Icon size={16} />
                    </span>
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User profile & actions footer */}
        <div className="sidebar-footer">
          <div className="sidebar-user-info">
            <span className="sidebar-user-name" title={user?.name}>
              {user?.name}
            </span>
            <span className="sidebar-user-role">{user?.role}</span>
          </div>

          <div className="sidebar-footer-actions">
            <button
              type="button"
              className="apple-btn-icon-only apple-btn-ghost apple-btn-sm"
              onClick={openPwModal}
              title="Change Password"
              aria-label="Change Password"
            >
              <KeyRound size={15} />
            </button>
            <button
              type="button"
              className="apple-btn-icon-only apple-btn-ghost apple-btn-sm"
              onClick={handleLogout}
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Change Password Modal */}
      <Modal
        isOpen={showPwModal}
        onClose={() => setShowPwModal(false)}
        title="Change Password"
        subtitle="Update your account credentials"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowPwModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={pwSaving} onClick={handleChangePassword}>
              Update Password
            </Button>
          </>
        }
      >
        {pwSuccess ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <CheckCircle2 size={36} style={{ color: 'var(--accent-success)', marginBottom: 12 }} />
            <h4 style={{ color: 'var(--text-primary)', marginBottom: 4 }}>Password Updated</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Your credentials have been securely saved.</p>
          </div>
        ) : (
          <form onSubmit={handleChangePassword}>
            {pwError && (
              <div style={{
                background: 'var(--accent-danger-tint)',
                color: 'var(--accent-danger)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 16,
                fontSize: 13
              }}>
                {pwError}
              </div>
            )}
            <Input
              label="Current Password"
              type="password"
              placeholder="••••••••"
              value={pwForm.currentPassword}
              onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
              required
            />
            <Input
              label="New Password"
              type="password"
              placeholder="••••••••"
              value={pwForm.newPassword}
              onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
              required
            />
            <Input
              label="Confirm New Password"
              type="password"
              placeholder="••••••••"
              value={pwForm.confirmPassword}
              onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
              required
            />
          </form>
        )}
      </Modal>
    </>
  );
}
