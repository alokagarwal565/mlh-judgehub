import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useLoader } from '../../context/LoaderContext';

export default function AdminEvents() {
  const [events, setEvents] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', timePerProject: 180, setSize: 5 });
  const { success, error: toastError } = useToast();
  const { showLoader, hideLoader } = useLoader();

  useEffect(() => { api.get('/events').then(r => setEvents(r.data)); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    const res = await api.post('/events', form);
    setEvents([res.data, ...events]);
    setShowForm(false);
    setForm({ name: '', description: '', timePerProject: 180, setSize: 5 });
  };

  const handleInitialize = async (id) => {
    showLoader('Generating sets and assigning judges… This may take a moment.');
    try {
      const res = await api.post(`/events/${id}/initialize`);
      hideLoader();
      success(
        `${res.data.projectsCount} projects · ${res.data.judgesCount} judges assigned`,
        '🚀 Judging Started!'
      );
      api.get('/events').then(r => setEvents(r.data));
    } catch (err) {
      hideLoader();
      toastError(
        err.response?.data?.error || 'Make sure you have projects and judges imported.',
        'Initialization Failed'
      );
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Events</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>+ New Event</button>
      </div>

      {showForm && (
        <div className="card mb-4">
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label">Event Name</label>
              <input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" value={form.description} onChange={e=> setForm({...form, description: e.target.value})} />
            </div>
            <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
              <div className="form-group" style={{flex:1,minWidth:140}}>
                <label className="form-label">Time per Project (sec)</label>
                <input className="form-input" type="number" value={form.timePerProject} onChange={e => setForm({...form, timePerProject: +e.target.value})} />
              </div>
              <div className="form-group" style={{flex:1,minWidth:140}}>
                <label className="form-label">Set Size</label>
                <input className="form-input" type="number" value={form.setSize} onChange={e => setForm({...form, setSize: +e.target.value})} />
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary" type="submit">Create</button>
              <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {events.map(event => (
        <div key={event.id} className="card mb-4">
          <div className="card-header">
            <span className="card-title">{event.name}</span>
            <span className={`badge ${event.status === 'JUDGING' ? 'badge-warning' : event.status === 'COMPLETED' ? 'badge-success' : 'badge-info'}`}>{event.status}</span>
          </div>
          <p className="text-sm text-muted" style={{marginBottom:12}}>{event.description}</p>
          <div className="text-sm text-muted" style={{marginBottom:12}}>⏱ {event.timePerProject}s per project · 📦 Sets of {event.setSize}</div>
          <div className="flex gap-2 flex-wrap">
            {event.status === 'SETUP' && <button className="btn btn-primary btn-sm" onClick={() => handleInitialize(event.id)}>Start Judging</button>}
            {event.status === 'JUDGING' && <button className="btn btn-success btn-sm" onClick={() => updateStatus(event.id, 'COMPLETED')}>Complete</button>}
            {event.status === 'COMPLETED' && <button className="btn btn-ghost btn-sm" onClick={() => updateStatus(event.id, 'SETUP')}>Reset</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
