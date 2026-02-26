import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import { useLoader } from '../../context/LoaderContext';

export default function AdminJudges() {
  const { success, error: toastError } = useToast();
  const [events, setEvents] = useState([]);
  const [judges, setJudges] = useState([]);
  const [eventId, setEventId] = useState('');
  const [search, setSearch] = useState('');
  const [activityFilter, setActivityFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editingJudge, setEditingJudge] = useState(null);
  const [deletingJudge, setDeletingJudge] = useState(null); // null | id
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', password: '' });
  const { activeEvent } = useActiveEvent();
  const { showLoader, hideLoader } = useLoader();

  const fetchJudges = () => {
    if (eventId) {
      showLoader('Loading judges...');
      api.get(`/events/${eventId}/judges`)
        .then(r => setJudges(r.data))
        .catch(() => {})
        .finally(() => hideLoader());
    }
  };

  useEffect(() => { 
    showLoader('Loading events...');
    api.get('/events').then(r => { 
      setEvents(r.data); 
      if (activeEvent) {
        setEventId(activeEvent.id);
      } else if (r.data.length && !eventId) {
        setEventId(r.data[0].id);
      }
    }).finally(() => hideLoader()); 
  }, [activeEvent]);

  useEffect(() => { fetchJudges(); }, [eventId]);

  const filteredJudges = judges.filter(j => {
    if (activityFilter === 'ACTIVE' && j.inProgressSets === 0) return false;
    if (activityFilter === 'IDLE'   && (j.inProgressSets > 0 || j.completedSets > 0)) return false;
    if (activityFilter === 'DONE'   && j.inProgressSets > 0) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      j.name.toLowerCase().includes(q) ||
      j.email.toLowerCase().includes(q) ||
      (j.phone && j.phone.toLowerCase().includes(q))
    );
  });

  const handleOpenModal = (judge = null) => {
    if (judge) {
      setEditingJudge(judge);
      setFormData({ name: judge.name, email: judge.email, phone: judge.phone || '', password: '' });
    } else {
      setEditingJudge(null);
      setFormData({ name: '', email: '', phone: '', password: '' });
    }
    setShowModal(true);
  };

  const fmtTime = (s) => {
    if (!s) return '—';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${sec}s`;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingJudge) {
        await api.put(`/events/${eventId}/judges/${editingJudge.id}`, formData);
      } else {
        await api.post(`/events/${eventId}/judges`, formData);
      }
      setShowModal(false);
      fetchJudges();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to save judge');
    }
  };

  const confirmDelete = async () => {
    if (!deletingJudge) return;
    try {
      await api.delete(`/events/${eventId}/judges/${deletingJudge}`);
      success('Judge and associated data removed');
      setDeletingJudge(null);
      fetchJudges();
    } catch (err) {
      toastError('Failed to delete judge');
    }
  };

  const handleDelete = (id) => {
    setDeletingJudge(id);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Judges</h1>
        <div className="flex gap-2">
          <div style={{position:'relative', width:250}}>
            <span style={{position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', fontSize:14, pointerEvents:'none'}}>🔍</span>
            <input 
              type="text" 
              placeholder="Search name, email, phone..." 
              className="form-input" 
              style={{width:'100%', paddingLeft:32}}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={() => handleOpenModal()}>+ Add Judge</button>
          <span className="badge badge-info">{filteredJudges.length} judges</span>
        </div>
      </div>

      {/* Activity filter pills */}
      <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:16}}>
        {[
          { key:'ALL',    label:'All' },
          { key:'ACTIVE', label:'⚡ Active' },
          { key:'IDLE',   label:'⏸️ Idle' },
          { key:'DONE',   label:'✅ Done' },
        ].map(f => {
          const count = f.key === 'ALL' ? judges.length
            : f.key === 'ACTIVE' ? judges.filter(j => j.inProgressSets > 0).length
            : f.key === 'IDLE'   ? judges.filter(j => j.inProgressSets === 0 && j.completedSets === 0).length
            : judges.filter(j => j.inProgressSets === 0 && j.completedSets > 0).length;
          return (
            <button
              key={f.key}
              className={`btn btn-sm ${activityFilter === f.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActivityFilter(f.key)}
            >
              {f.label} <span style={{marginLeft:4, opacity:0.7, fontSize:10}}>({count})</span>
            </button>
          );
        })}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Sets</th><th>Completed</th><th>Status</th><th>Total Time</th><th>Actions</th></tr></thead>
          <tbody>
            {filteredJudges.map(j => (
              <tr key={j.id}>
                <td>
                  <a 
                    href={`/admin/view-judge/${j.id}`}
                    style={{color:'var(--accent)', textDecoration:'none', fontWeight:700}}
                    onClick={(e) => { e.preventDefault(); window.location.href = `/admin/view-judge/${j.id}`; }}
                  >
                    {j.name}
                  </a>
                </td>
                <td className="text-muted" style={{fontSize:12}}>{j.email}</td>
                <td className="text-muted" style={{fontSize:12}}>{j.phone || '—'}</td>
                <td>{j.totalSets}</td>
                <td>{j.completedSets}</td>
                <td>
                  {j.inProgressSets > 0
                    ? <span className="badge badge-warning">⚡ Active</span>
                    : j.completedSets > 0 && j.inProgressSets === 0
                    ? <span className="badge badge-success">✅ Done</span>
                    : <span className="badge badge-info">⏸️ Idle</span>}
                </td>
                <td style={{fontSize:12, color:'var(--text-muted)'}}>{fmtTime(j.totalTimeSeconds)}</td>
                <td>
                  <div className="flex gap-2">
                    <button className="btn btn-ghost btn-sm" style={{color:'var(--accent)'}} onClick={() => handleOpenModal(j)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" style={{color:'var(--danger)'}} onClick={() => handleDelete(j.id)}>Delete</button>
                    <button className="btn btn-ghost btn-sm" style={{color:'var(--accent)', opacity: 0.7}} onClick={() => window.location.href = `/admin/view-judge/${j.id}`}>View</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" style={{maxWidth:400}} onClick={e => e.stopPropagation()}>
            <h2>{editingJudge ? 'Edit Judge' : 'Add New Judge'}</h2>
            <form onSubmit={handleSave} className="grid gap-4 mt-4">
              <div className="form-group">
                <label className="form-label">Name</label>
                <input type="text" className="form-input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-input" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input type="text" className="form-input" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} required />
              </div>
              {!editingJudge && (
                <div className="form-group">
                  <label className="form-label">Initial Password (Optional)</label>
                  <input type="text" className="form-input" placeholder="Random if empty" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                </div>
              )}
              <div className="flex gap-2 mt-2">
                <button type="submit" className="btn btn-primary flex-1">Save Judge</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────── */}
      {deletingJudge && (
        <div className="modal-overlay" onClick={() => setDeletingJudge(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 400, width: '100%'}}>
            <div style={{height: 3, background: 'linear-gradient(90deg, #ef4444, #dc2626)', borderRadius: 2, marginBottom: 16}}/>
            <div style={{textAlign: 'center', padding: '8px 0 20px'}}>
              <div style={{fontSize: 40, marginBottom: 12}}>⚠️</div>
              <h2 style={{margin: '0 0 8px', fontSize: 18, color: 'var(--text-primary)'}}>Delete Judge?</h2>
              <p style={{margin: 0, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6}}>
                You're about to delete <strong style={{color: 'var(--text-primary)'}}>{judges.find(j => j.id === deletingJudge)?.name}</strong>.
                <br/><br/>
                All associated <strong>assignments</strong>, <strong>scores</strong>, and <strong>feedback</strong> in this event will be permanently removed.
                <br/><br/>
                This action <strong>cannot be undone</strong>.
              </p>
            </div>
            <div style={{display: 'flex', gap: 8, paddingTop: 16, borderTop: '1px solid var(--border-color)'}}>
              <button className="btn btn-ghost" onClick={() => setDeletingJudge(null)} style={{flex: 1}}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete} style={{flex: 1}}>
                🗑 Delete Judge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
