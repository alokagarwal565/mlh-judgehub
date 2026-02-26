import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { useLoader } from '../../context/LoaderContext';

const ROLE_TABS = ['JUDGE', 'ADMIN'];

const emptyForm = { name: '', email: '', phone: '', role: 'JUDGE', password: '' };

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState('JUDGE');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | 'edit' | 'password' | 'delete'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [pwForm, setPwForm] = useState({ password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState({});
  const { showLoader, hideLoader } = useLoader();

  const load = useCallback(async () => {
    setLoading(true);
    if (users.length === 0) showLoader('Loading users...');
    try { const { data } = await api.get('/admin/users'); setUsers(data); }
    finally { setLoading(false); hideLoader(); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter(u => {
    const matchesRole = u.role === tab;
    const searchLower = search.toLowerCase();
    const matchesSearch = search === '' ||
      u.name.toLowerCase().includes(searchLower) ||
      u.email.toLowerCase().includes(searchLower) ||
      (u.phone && u.phone.toLowerCase().includes(searchLower));
    return matchesRole && matchesSearch;
  });

  const openAdd = () => { setForm({ ...emptyForm, role: tab }); setError(''); setModal('add'); };
  const openEdit = (u) => { setSelected(u); setForm({ name: u.name, email: u.email, phone: u.phone || '', role: u.role, password: '' }); setError(''); setModal('edit'); };
  const openPassword = (u) => { setSelected(u); setPwForm({ password: '' }); setError(''); setModal('password'); };
  const openReset = (u) => { setSelected(u); setError(''); setModal('reset'); };
  const openDelete = (u) => { setSelected(u); setError(''); setModal('delete'); };
  const closeModal = () => { setModal(null); setSelected(null); setError(''); };

  const handleAdd = async () => {
    setSaving(true); setError('');
    try {
      await api.post('/admin/users', form);
      await load(); closeModal();
    } catch (e) { setError(e.response?.data?.error || 'Error'); }
    finally { setSaving(false); }
  };

  const handleEdit = async () => {
    setSaving(true); setError('');
    try {
      await api.put(`/admin/users/${selected.id}`, form);
      await load(); closeModal();
    } catch (e) { setError(e.response?.data?.error || 'Error'); }
    finally { setSaving(false); }
  };

  const handlePassword = async () => {
    setSaving(true); setError('');
    try {
      await api.put(`/admin/users/${selected.id}/password`, pwForm);
      await load(); closeModal();
    } catch (e) { setError(e.response?.data?.error || 'Error'); }
    finally { setSaving(false); }
  };

  const handleResetPassword = async () => {
    setSaving(true); setError('');
    try {
      await api.post(`/admin/users/${selected.id}/reset-password`);
      await load(); closeModal();
    } catch (e) { setError(e.response?.data?.error || 'Error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true); setError('');
    try {
      await api.delete(`/admin/users/${selected.id}`);
      await load(); closeModal();
    } catch (e) { setError(e.response?.data?.error || 'Error'); }
    finally { setSaving(false); }
  };

  const toggleReveal = (id) => setRevealed(r => ({ ...r, [id]: !r[id] }));

  return (
    <div>
      <div className="page-header" style={{justifyContent:'space-between',alignItems:'flex-start'}}>
        <h1>User Management</h1>
        <div style={{display:'flex',gap:12,alignItems:'center'}}>
          <div style={{position:'relative', width:250}}>
            <span style={{position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', fontSize:14, pointerEvents:'none'}}>🔍</span>
            <input className="form-input" type="text" placeholder="Search name, email, phone..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{width:'100%',margin:0, paddingLeft:32}} />
          </div>
          <button className="btn btn-primary" onClick={openAdd}>+ Add User</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {ROLE_TABS.map(role => (
          <button key={role} onClick={() => setTab(role)}
            className={`btn ${tab === role ? 'btn-primary' : 'btn-ghost'}`}>
            {role === 'JUDGE' ? '👥 Judges' : '🔑 Admins'}
            <span style={{ marginLeft: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 9999, padding: '0 8px', fontSize: 11 }}>
              {users.filter(u => u.role === role).length}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Password</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                  {search ? `No ${tab.toLowerCase()}s match "${search}"` : `No ${tab.toLowerCase()}s yet`}
                </td></tr>
              )}
              {filtered.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td className="text-muted">{u.email}</td>
                  <td className="text-muted" style={{ fontSize: 12 }}>{u.phone || '—'}</td>
                  <td>
                    {u.role === 'JUDGE' ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: 11, fontStyle: 'italic' }}>Protected</span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, letterSpacing: revealed[u.id] ? 0 : 2 }}>
                          {u.passwordPlain
                            ? (revealed[u.id] ? u.passwordPlain : '••••••••')
                            : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>not stored</span>}
                        </span>
                        {u.passwordPlain && (
                          <button onClick={() => toggleReveal(u.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)', padding: 0 }}
                            title={revealed[u.id] ? 'Hide' : 'Show'}>
                            {revealed[u.id] ? '🙈' : '👁'}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>✏️ Edit</button>
                      {u.role !== 'JUDGE' ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => openPassword(u)}>🔑 Pwd</button>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => openReset(u)} title="Reset to judge123">🔄 Reset</button>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => openDelete(u)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add Modal ─────────────────────────────────────── */}
      {modal === 'add' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth:480,width:'100%'}}>
            {/* Header */}
            <div style={{marginBottom:20}}>
              <div style={{height:3,background:'var(--gradient-primary)',borderRadius:2,marginBottom:16}}/>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{width:40,height:40,borderRadius:10,background:'var(--gradient-primary)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>
                  {form.role === 'JUDGE' ? '👥' : '🔑'}
                </div>
                <div>
                  <h2 style={{margin:0,fontSize:18}}>Add {form.role === 'JUDGE' ? 'Judge' : 'Admin'}</h2>
                  <p style={{margin:0,fontSize:12,color:'var(--text-muted)'}}>Fill in the details below</p>
                </div>
              </div>
            </div>

            {/* Role toggle */}
            <div style={{display:'flex',background:'var(--bg-input)',borderRadius:10,padding:4,marginBottom:20,gap:4}}>
              {ROLE_TABS.map(r => (
                <button key={r} onClick={() => setForm(f => ({ ...f, role: r }))}
                  style={{flex:1,padding:'8px 0',borderRadius:7,border:'none',cursor:'pointer',fontWeight:600,fontSize:13,
                    transition:'all 0.2s',
                    background: form.role === r ? 'var(--accent)' : 'transparent',
                    color: form.role === r ? '#fff' : 'var(--text-muted)'}}>
                  {r === 'JUDGE' ? '👥 Judge' : '🔑 Admin'}
                </button>
              ))}
            </div>

            {/* Fields — name + phone in a row */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Full Name <span style={{color:'var(--accent)'}}>*</span></label>
                <input className="form-input" type="text" placeholder="e.g. Dr. Sarah Chen"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Phone <span style={{color:'var(--text-muted)',fontWeight:400}}>(optional)</span></label>
                <input className="form-input" type="text" placeholder="+1-555-0101"
                  value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Email <span style={{color:'var(--accent)'}}>*</span></label>
              <input className="form-input" type="text" placeholder="email@example.com"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>

            <div className="form-group">
              <label className="form-label">Password <span style={{color:'var(--accent)'}}>*</span></label>
              <input className="form-input" type="text" placeholder="Set a password (will be visible to admins)"
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>

            {error && <div className="alert alert-error" style={{marginBottom:12}}>{error}</div>}

            <div style={{display:'flex',gap:8,marginTop:20,paddingTop:16,borderTop:'1px solid var(--border-color)'}}>
              <button className="btn btn-ghost" onClick={closeModal} style={{flex:'0 0 auto'}}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving} style={{flex:1}}>
                {saving ? 'Adding...' : `✓ Add ${form.role === 'JUDGE' ? 'Judge' : 'Admin'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ─────────────────────────────────────── */}
      {modal === 'edit' && selected && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth:460,width:'100%'}}>
            <div style={{height:3,background:'var(--gradient-primary)',borderRadius:2,marginBottom:16}}/>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
              <div style={{width:40,height:40,borderRadius:'50%',background:'var(--gradient-primary)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:16,color:'#fff'}}>
                {selected.name[0].toUpperCase()}
              </div>
              <div>
                <h2 style={{margin:0,fontSize:18}}>Edit Profile</h2>
                <p style={{margin:0,fontSize:12,color:'var(--text-muted)'}}>{selected.role} · {selected.email}</p>
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Full Name <span style={{color:'var(--accent)'}}>*</span></label>
                <input className="form-input" type="text" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Phone</label>
                <input className="form-input" type="text" placeholder="Optional" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Email <span style={{color:'var(--accent)'}}>*</span></label>
              <input className="form-input" type="text" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>

            {error && <div className="alert alert-error" style={{marginBottom:12}}>{error}</div>}
            <div style={{display:'flex',gap:8,marginTop:20,paddingTop:16,borderTop:'1px solid var(--border-color)'}}>
              <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEdit} disabled={saving} style={{flex:1}}>
                {saving ? 'Saving...' : '✓ Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Change Password Modal ─────────────────────────── */}
      {modal === 'password' && selected && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth:420,width:'100%'}}>
            <div style={{height:3,background:'linear-gradient(90deg,#f59e0b,#ef4444)',borderRadius:2,marginBottom:16}}/>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
              <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(245,158,11,0.15)',border:'1px solid rgba(245,158,11,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>
                🔑
              </div>
              <div>
                <h2 style={{margin:0,fontSize:18}}>Change Password</h2>
                <p style={{margin:0,fontSize:12,color:'var(--text-muted)'}}>{selected.name} · {selected.email}</p>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">New Password <span style={{color:'var(--accent)'}}>*</span></label>
              <input className="form-input" type="text" placeholder="Min 4 characters — stored in plain text for admin view"
                value={pwForm.password} onChange={e => setPwForm({ password: e.target.value })} />
            </div>

            {error && <div className="alert alert-error" style={{marginBottom:12}}>{error}</div>}
            <div style={{display:'flex',gap:8,marginTop:20,paddingTop:16,borderTop:'1px solid var(--border-color)'}}>
              <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handlePassword} disabled={saving} style={{flex:1}}>
                {saving ? 'Updating...' : '🔑 Update Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Password Modal ────────────────────────── */}
      {modal === 'reset' && selected && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth:400,width:'100%'}}>
            <div style={{height:3,background:'linear-gradient(90deg,#3b82f6,#8b5cf6)',borderRadius:2,marginBottom:16}}/>
            <div style={{textAlign:'center',padding:'8px 0 20px'}}>
              <div style={{fontSize:40,marginBottom:12}}>🔄</div>
              <h2 style={{margin:'0 0 8px',fontSize:18}}>Reset Password?</h2>
              <p style={{margin:0,color:'var(--text-muted)',fontSize:13,lineHeight:1.6}}>
                Reset password for <strong style={{color:'var(--text-primary)'}}>{selected.name}</strong> to the default:
                <br/><code style={{background:'var(--bg-input)',padding:'2px 6px',borderRadius:4,fontSize:14,color:'var(--accent)',fontWeight:700,display:'inline-block',marginTop:8}}>judge123</code>
              </p>
            </div>
            {error && <div className="alert alert-error" style={{marginBottom:12}}>{error}</div>}
            <div style={{display:'flex',gap:8,paddingTop:16,borderTop:'1px solid var(--border-color)'}}>
              <button className="btn btn-ghost" onClick={closeModal} style={{flex:1}}>Cancel</button>
              <button className="btn btn-primary" onClick={handleResetPassword} disabled={saving} style={{flex:1}}>
                {saving ? 'Resetting...' : '🔄 Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────── */}
      {modal === 'delete' && selected && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth:400,width:'100%'}}>
            <div style={{height:3,background:'linear-gradient(90deg,#ef4444,#dc2626)',borderRadius:2,marginBottom:16}}/>
            <div style={{textAlign:'center',padding:'8px 0 20px'}}>
              <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
              <h2 style={{margin:'0 0 8px',fontSize:18}}>Delete User?</h2>
              <p style={{margin:0,color:'var(--text-muted)',fontSize:13,lineHeight:1.6}}>
                You're about to delete <strong style={{color:'var(--text-primary)'}}>{selected.name}</strong>
                <br/><span style={{fontSize:12}}>{selected.email}</span>
                <br/><br/>This action <strong>cannot be undone</strong>.
              </p>
            </div>
            {error && <div className="alert alert-error" style={{marginBottom:12}}>{error}</div>}
            <div style={{display:'flex',gap:8,paddingTop:16,borderTop:'1px solid var(--border-color)'}}>
              <button className="btn btn-ghost" onClick={closeModal} style={{flex:1}}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={saving} style={{flex:1}}>
                {saving ? 'Deleting...' : '🗑 Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

