import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { useLoader } from '../../context/LoaderContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Input, SearchField } from '../../components/ui/Input';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { 
  PlusIcon, EditIcon, TrashIcon, KeyIcon, RefreshIcon, 
  UserIcon, LockIcon, ShieldIcon, CheckCircleIcon, XCircleIcon 
} from '../../components/ui/icons';

const ROLE_TABS = ['JUDGE', 'ADMIN'];
const emptyForm = { name: '', email: '', phone: '', role: 'JUDGE', password: '' };

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState('JUDGE');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | 'edit' | 'password' | 'reset' | 'delete'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [pwForm, setPwForm] = useState({ password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { showLoader, hideLoader } = useLoader();
  const { success: toastSuccess, error: toastError } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    if (users.length === 0) showLoader('Loading directory accounts...');
    try {
      const { data } = await api.get('/admin/users');
      setUsers(data);
    } catch (err) {
      toastError('Failed to load users');
    } finally {
      setLoading(false);
      hideLoader();
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = users.filter(u => {
    const matchesRole = u.role === tab;
    const searchLower = search.toLowerCase();
    const matchesSearch = search === '' ||
      u.name.toLowerCase().includes(searchLower) ||
      u.email.toLowerCase().includes(searchLower) ||
      (u.phone && u.phone.toLowerCase().includes(searchLower));
    return matchesRole && matchesSearch;
  });

  const openAdd = () => {
    setForm({ ...emptyForm, role: tab });
    setError('');
    setModal('add');
  };

  const openEdit = (u) => {
    setSelected(u);
    setForm({ name: u.name, email: u.email, phone: u.phone || '', role: u.role, password: '' });
    setError('');
    setModal('edit');
  };

  const openPassword = (u) => {
    setSelected(u);
    setPwForm({ password: '' });
    setError('');
    setModal('password');
  };

  const openReset = (u) => {
    setSelected(u);
    setError('');
    setModal('reset');
  };

  const openDelete = (u) => {
    setSelected(u);
    setError('');
    setModal('delete');
  };

  const closeModal = () => {
    setModal(null);
    setSelected(null);
    setError('');
  };

  const handleAdd = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/admin/users', form);
      toastSuccess(`Created account for ${form.name}`);
      await load();
      closeModal();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.put(`/admin/users/${selected.id}`, form);
      toastSuccess(`Updated profile for ${form.name}`);
      await load();
      closeModal();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handlePassword = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.put(`/admin/users/${selected.id}/password`, pwForm);
      toastSuccess(`Password updated for ${selected.name}`);
      await load();
      closeModal();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    setSaving(true);
    setError('');
    try {
      await api.post(`/admin/users/${selected.id}/reset-password`);
      toastSuccess(`Password reset to default for ${selected.name}`);
      await load();
      closeModal();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to reset password');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setError('');
    try {
      await api.delete(`/admin/users/${selected.id}`);
      toastSuccess(`Account ${selected.name} removed`);
      await load();
      closeModal();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to delete user');
    } finally {
      setSaving(false);
    }
  };

  const judgeCount = users.filter(u => u.role === 'JUDGE').length;
  const adminCount = users.filter(u => u.role === 'ADMIN').length;

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="Identity & Access Control"
        subtitle="Manage organizer administrators, evaluators, credentials, and permissions"
        actions={
          <Button variant="primary" icon={PlusIcon} onClick={openAdd}>
            Add User
          </Button>
        }
      />

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {/* Controls Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-hairline)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16
        }}>
          <div style={{ width: 280 }}>
            <SearchField
              placeholder="Search name, email, phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <SegmentedControl
            options={[
              { value: 'JUDGE', label: 'Judges', badge: judgeCount },
              { value: 'ADMIN', label: 'Administrators', badge: adminCount }
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={UserIcon}
            title={search ? `No ${tab.toLowerCase()}s match "${search}"` : `No ${tab.toLowerCase()}s registered`}
            description={search ? 'Try adjusting your search criteria.' : `Add your first ${tab.toLowerCase()} user to grant system access.`}
            actionLabel={!search ? `Add ${tab === 'JUDGE' ? 'Judge' : 'Admin'}` : undefined}
            onAction={!search ? openAdd : undefined}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-hairline)' }}>
                  <th style={{ padding: '12px 24px', fontWeight: 600, color: 'var(--text-secondary)' }}>User</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Contact Email</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Phone</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Security</th>
                  <th style={{ padding: '12px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom: '1px solid var(--border-hairline)',
                      transition: 'background var(--transition-fast)'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          background: u.role === 'ADMIN' ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                          border: `1px solid ${u.role === 'ADMIN' ? 'var(--accent)' : 'var(--border-hairline)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 700,
                          color: u.role === 'ADMIN' ? 'var(--accent)' : 'var(--text-primary)'
                        }}>
                          {u.name ? u.name.slice(0, 2).toUpperCase() : 'US'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{u.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <Badge variant={u.role === 'ADMIN' ? 'accent' : 'neutral'}>
                              {u.role}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>
                      {u.email}
                    </td>

                    <td style={{ padding: '16px 20px', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                      {u.phone || '—'}
                    </td>

                    <td style={{ padding: '16px 20px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-elevated)',
                        padding: '4px 8px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-hairline)'
                      }}>
                        <LockIcon size={12} />
                        <span>Bcrypt Hash</span>
                      </span>
                    </td>

                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <IconButton
                          icon={EditIcon}
                          label="Edit Profile"
                          onClick={() => openEdit(u)}
                        />
                        {u.role !== 'JUDGE' ? (
                          <IconButton
                            icon={KeyIcon}
                            label="Change Password"
                            onClick={() => openPassword(u)}
                          />
                        ) : (
                          <IconButton
                            icon={RefreshIcon}
                            label="Reset Password"
                            onClick={() => openReset(u)}
                          />
                        )}
                        <IconButton
                          icon={TrashIcon}
                          label="Delete User"
                          variant="danger"
                          onClick={() => openDelete(u)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add User Modal */}
      <Modal
        isOpen={modal === 'add'}
        onClose={closeModal}
        title={`Add New ${form.role === 'JUDGE' ? 'Judge' : 'Administrator'}`}
        subtitle="Provision credentials for system evaluation or event operations"
      >
        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ marginBottom: 4 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8, color: 'var(--text-secondary)' }}>
              Account Role
            </label>
            <SegmentedControl
              options={[
                { value: 'JUDGE', label: 'Judge / Evaluator' },
                { value: 'ADMIN', label: 'Administrator' }
              ]}
              value={form.role}
              onChange={val => setForm(f => ({ ...f, role: val }))}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input
              label="Full Name"
              required
              placeholder="e.g. Alex Morgan"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
            <Input
              label="Phone Number"
              placeholder="+1-555-0100"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            />
          </div>

          <Input
            label="Email Address"
            type="email"
            required
            placeholder="alex@domain.com"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          />

          <Input
            label="Initial Password"
            type="text"
            required
            placeholder="Set an initial password"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            caption="Must be at least 4 characters"
          />

          {error && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--danger-subtle)',
              border: '1px solid rgba(255, 69, 58, 0.25)',
              color: 'var(--danger)',
              fontSize: 13
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
            <Button variant="ghost" type="button" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Creating...' : `Create ${form.role === 'JUDGE' ? 'Judge' : 'Admin'}`}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={modal === 'edit' && !!selected}
        onClose={closeModal}
        title="Edit Account"
        subtitle={`Updating profile for ${selected?.name}`}
      >
        <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input
              label="Full Name"
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
            <Input
              label="Phone Number"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            />
          </div>

          <Input
            label="Email Address"
            type="email"
            required
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          />

          {error && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--danger-subtle)',
              border: '1px solid rgba(255, 69, 58, 0.25)',
              color: 'var(--danger)',
              fontSize: 13
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
            <Button variant="ghost" type="button" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        isOpen={modal === 'password' && !!selected}
        onClose={closeModal}
        title="Update Password"
        subtitle={`Set new administrator credentials for ${selected?.name}`}
      >
        <form onSubmit={handlePassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input
            label="New Password"
            type="text"
            required
            placeholder="Min 4 characters"
            value={pwForm.password}
            onChange={e => setPwForm({ password: e.target.value })}
          />

          {error && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--danger-subtle)',
              border: '1px solid rgba(255, 69, 58, 0.25)',
              color: 'var(--danger)',
              fontSize: 13
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
            <Button variant="ghost" type="button" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={modal === 'reset' && !!selected}
        onClose={closeModal}
        title="Reset Judge Password?"
        subtitle="Confirm default credentials restoration"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Reset password for <strong style={{ color: 'var(--text-primary)' }}>{selected?.name}</strong> to standard initial credentials:
          </p>
          <div style={{
            background: 'var(--bg-elevated)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-hairline)',
            fontFamily: 'monospace',
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--accent)',
            textAlign: 'center'
          }}>
            judge123
          </div>

          {error && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--danger-subtle)',
              color: 'var(--danger)',
              fontSize: 13
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button variant="ghost" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" onClick={handleResetPassword} disabled={saving}>
              {saving ? 'Resetting...' : 'Confirm Reset'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete User Modal */}
      <Modal
        isOpen={modal === 'delete' && !!selected}
        onClose={closeModal}
        title="Delete User Account?"
        subtitle="This action permanently revokes login access."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>{selected?.name}</strong> ({selected?.email})? All active sessions and role assignments will be removed.
          </p>

          {error && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--danger-subtle)',
              color: 'var(--danger)',
              fontSize: 13
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button variant="ghost" onClick={closeModal}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={saving}>
              {saving ? 'Deleting...' : 'Delete Account'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

