import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

export default function TeamDashboard() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [project, setProject] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', demoLink: '', videoUrl: '' });

  useEffect(() => {
    api.get('/events').then(r => {
      setEvents(r.data);
      if (r.data.length) {
        api.get(`/events/${r.data[0].id}/projects`).then(pr => {
          const mine = pr.data.find(p => p.team?.id === user?.id);
          if (mine) {
            setProject(mine);
            setForm({ title: mine.title, description: mine.description || '', demoLink: mine.demoLink || '', videoUrl: mine.videoUrl || '' });
          }
        });
      }
    });
  }, [user]);

  const handleSave = async () => {
    if (!project) return;
    const ev = events[0];
    const res = await api.put(`/events/${ev.id}/projects/${project.id}`, form);
    setProject(res.data);
    setEditing(false);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Welcome, {user?.name}!</h1>
        <span className="badge badge-info">{project?.teamNumber}</span>
      </div>

      {!project ? (
        <div className="empty-state"><div className="empty-state-icon">📁</div><h3>No Project Yet</h3><p>Your admin will create a project for your team.</p></div>
      ) : (
        <div className="card">
          <div className="card-header">
            <span className="card-title">{editing ? 'Edit Project' : project.title}</span>
            {!editing && <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>✏️ Edit</button>}
          </div>

          {editing ? (
            <div>
              <div className="form-group">
                <label className="form-label">Project Title</label>
                <input className="form-input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-textarea" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Demo Link</label>
                <input className="form-input" value={form.demoLink} onChange={e => setForm({...form, demoLink: e.target.value})} placeholder="https://..." />
              </div>
              <div className="form-group">
                <label className="form-label">Video URL</label>
                <input className="form-input" value={form.videoUrl} onChange={e => setForm({...form, videoUrl: e.target.value})} placeholder="https://..." />
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary" onClick={handleSave}>Save</button>
                <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-muted" style={{marginBottom:16}}>{project.description || 'No description yet.'}</p>
              <div className="stats-grid" style={{gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))'}}>
                <div className="stat-card">
                  <div style={{fontSize:20}}>📍</div>
                  <div className="stat-label">Room No.</div>
                  <div style={{fontWeight:600}}>{project.roomNumber || '—'}</div>
                </div>
                <div className="stat-card">
                  <div style={{fontSize:20}}>📊</div>
                  <div className="stat-label">Status</div>
                  <div><span className={`badge ${project.status === 'SCORED' ? 'badge-success' : project.status === 'FLAGGED' ? 'badge-danger' : 'badge-info'}`}>{project.status}</span></div>
                </div>
              </div>
              {project.demoLink && <p style={{marginTop:8}}><a href={project.demoLink} target="_blank" style={{color:'var(--accent)'}}>🔗 Demo Link</a></p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
