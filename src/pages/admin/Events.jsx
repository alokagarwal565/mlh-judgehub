import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useLoader } from '../../context/LoaderContext';
import { useActiveEvent } from '../../context/ActiveEventContext';

export default function AdminEvents() {
  const [events, setEvents] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [deletingEvent, setDeletingEvent] = useState(null); // null | eventId
  const [form, setForm] = useState({ name: '', description: '', timePerProject: 180, setSize: 5 });
  const [creatingSample, setCreatingSample] = useState(false);
  const { success, error: toastError, info } = useToast();
  const { showLoader, hideLoader } = useLoader();
  const { refreshActiveEvent } = useActiveEvent();

  useEffect(() => { loadEvents(); }, []);

  const loadEvents = () => api.get('/events').then(r => setEvents(r.data));

  const handleActivate = async (id) => {
    try {
      await api.post(`/events/${id}/activate`);
      success('Event set as globally active');
      loadEvents();
      refreshActiveEvent();
    } catch (err) {
      toastError('Failed to activate event');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      if (editingEvent) {
        await api.put(`/events/${editingEvent.id}`, form);
        success('Event updated successfully');
      } else {
        await api.post('/events', form);
        success('Event created successfully');
      }
      setShowForm(false);
      setEditingEvent(null);
      setForm({ name: '', description: '', timePerProject: 180, setSize: 5 });
      loadEvents();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to save event');
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/events/${id}`, { status });
      success(`Event status updated to ${status}`);
      loadEvents();
    } catch (err) {
      toastError('Failed to update status');
    }
  };

  const openDeleteModal = (id) => {
    setDeletingEvent(id);
  };

  const confirmDelete = async () => {
    const id = deletingEvent;
    if (!id) return;
    try {
      await api.delete(`/events/${id}`);
      success('Event and associated users deleted');
      setDeletingEvent(null);
      loadEvents();
    } catch (err) {
      toastError('Failed to delete event');
    }
  };

  const handleDelete = async (id) => {
    // This function is still used by the UI but now opens the modal
    openDeleteModal(id);
  };

  const handleEdit = (event) => {
    setEditingEvent(event);
    setForm({
      name: event.name,
      description: event.description || '',
      timePerProject: event.timePerProject,
      setSize: event.setSize
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCreateSample = async () => {
    setCreatingSample(true);
    showLoader('Generating sample event with judges, tracks, and projects...');
    try {
      await api.post('/events/sample');
      success('Sample event created successfully');
      loadEvents();
    } catch (err) {
      toastError('Failed to create sample event');
    } finally {
      setCreatingSample(false);
      hideLoader();
    }
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
      loadEvents();
    } catch (err) {
      hideLoader();
      toastError(
        err.response?.data?.error || 'Make sure you have projects and judges imported.',
        'Initialization Failed'
      );
    }
  };

    const hasSample = events.some(e => e.name === 'AceHack 5.0');

    return (
      <div style={{maxWidth: 1000, margin: '0 auto'}}>
        <div className="page-header" style={{alignItems: 'flex-end', marginBottom: 32}}>
          <div>
            <h1 style={{fontSize: 32, fontWeight: 800, marginBottom: 4}}>Judging Events</h1>
            <p className="text-muted" style={{fontSize: 14}}>Manage your hackathon judging windows and settings</p>
          </div>
          <div style={{display:'flex', gap:10}}>
            <button 
              className="btn btn-ghost" 
              onClick={handleCreateSample} 
              disabled={creatingSample || hasSample}
              style={{
                borderRadius: 12,
                opacity: hasSample ? 0.5 : 1,
                cursor: hasSample ? 'not-allowed' : 'pointer'
              }}
              title={hasSample ? "A sample event already exists. Delete it to create a new one." : ""}
            >
              {creatingSample ? '✨ Generating...' : hasSample ? '✨ Sample Created' : '✨ Create Sample Event'}
            </button>
          <button 
            className={`btn ${showForm ? 'btn-ghost' : 'btn-primary'}`} 
            onClick={() => {
              if (showForm) {
                setEditingEvent(null);
                setForm({ name: '', description: '', timePerProject: 180, setSize: 5 });
              }
              setShowForm(!showForm);
            }}
            style={{borderRadius: 12}}
          >
            {showForm ? '✕ Close' : '+ New Event'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card mb-8" style={{
          border: '1px solid var(--accent)', 
          background: 'rgba(var(--accent-rgb), 0.03)',
          padding: 32
        }}>
          <h2 style={{fontSize: 18, fontWeight: 700, marginBottom: 24}}>
            {editingEvent ? 'Edit Event Details' : 'Configure New Event'}
          </h2>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label">Event Name</label>
              <input 
                className="form-input" 
                value={form.name} 
                onChange={e => setForm({...form, name: e.target.value})} 
                placeholder="e.g. MLH Hackathon Fall 2024"
                required 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea 
                className="form-textarea" 
                value={form.description} 
                onChange={e=> setForm({...form, description: e.target.value})} 
                placeholder="Briefly describe the event scope..."
                style={{minHeight: 80}}
              />
            </div>
            <div style={{display:'flex', gap:20, flexWrap:'wrap', marginBottom: 24}}>
              <div className="form-group" style={{flex:1, minWidth:200}}>
                <label className="form-label">Time per Project (sec)</label>
                <div style={{position: 'relative'}}>
                  <input className="form-input" type="number" value={form.timePerProject} onChange={e => setForm({...form, timePerProject: +e.target.value})} />
                  <span style={{position: 'absolute', right: 12, top: 12, fontSize: 12, color: 'var(--text-muted)'}}>seconds</span>
                </div>
                <p style={{fontSize: 11, color: 'var(--text-muted)', marginTop: 4}}>Duration for each judge-project interaction</p>
              </div>
              <div className="form-group" style={{flex:1, minWidth:200}}>
                <label className="form-label">Set Size</label>
                <input className="form-input" type="number" value={form.setSize} onChange={e => setForm({...form, setSize: +e.target.value})} />
                <p style={{fontSize: 11, color: 'var(--text-muted)', marginTop: 4}}>Number of projects assigned per judge set</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button className="btn btn-primary" type="submit" style={{padding: '12px 24px'}}>
                {editingEvent ? 'Save Changes' : 'Create Event'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => { setShowForm(false); setEditingEvent(null); }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{display: 'grid', gap: 24}}>
        {events.length === 0 && !showForm && (
          <div className="empty-state" style={{padding: '80px 20px'}}>
            <div style={{fontSize: 48, marginBottom: 16}}>📅</div>
            <h3>No Events Found</h3>
            <p>Ready to start? Create your first event to begin judging.</p>
          </div>
        )}
        {events.map(event => (
          <div key={event.id} className="card" style={{
            position: 'relative',
            padding: 0,
            overflow: 'hidden',
            border: event.status === 'JUDGING' ? '1px solid var(--warning)' : '1px solid var(--border-light)'
          }}>
            {event.status === 'JUDGING' && (
              <div style={{
                position: 'absolute', 
                top: 0, left: 0, right: 0, height: 4, 
                background: 'var(--gradient-warning)'
              }} />
            )}
            <div style={{padding: 24}}>
              <div className="card-header" style={{alignItems: 'flex-start', marginBottom: 12}}>
                <div style={{flex: 1}}>
                  <div style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4}}>
                    <h3 style={{fontSize: 20, fontWeight: 700, margin: 0}}>{event.name}</h3>
                    <div className="flex gap-2">
                      <span className={`badge ${event.status === 'JUDGING' ? 'badge-warning' : event.status === 'COMPLETED' ? 'badge-success' : 'badge-info'}`} style={{fontSize: 10, padding: '4px 8px'}}>
                        {event.status}
                      </span>
                      {event.isActive && (
                        <span className="badge badge-primary" style={{fontSize: 10, padding: '4px 8px', background: 'var(--gradient-primary)', border:'none'}}>
                          🌟 Active Event
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted" style={{margin: 0, maxWidth: 600}}>{event.description || 'No description provided.'}</p>
                </div>
                <div className="flex gap-2">
                  {!event.isActive && (
                    <button className="btn btn-primary btn-sm" onClick={() => handleActivate(event.id)} style={{fontSize:10, borderRadius:8}}>
                      Set Active
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(event)} title="Edit Event Details">✏️</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openDeleteModal(event.id)} style={{color: 'var(--danger)'}} title="Delete Event">🗑️</button>
                </div>
              </div>

              <div style={{
                display: 'flex', 
                gap: 24, 
                padding: '16px 20px', 
                background: 'rgba(255,255,255,0.02)', 
                borderRadius: 12,
                marginBottom: 24,
                border: '1px solid var(--border-color)'
              }}>
                <div style={{flex: 1}}>
                  <div style={{fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4}}>Configuration</div>
                  <div style={{fontSize: 13, fontWeight: 600}}>
                    ⏱ {event.timePerProject}s interaction · 📦 Sets of {event.setSize}
                  </div>
                </div>
                <div style={{flex: 1, borderLeft: '1px solid var(--border-color)', paddingLeft: 24}}>
                  <div style={{fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4}}>Created</div>
                  <div style={{fontSize: 13, fontWeight: 600}}>
                    {new Date(event.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 flex-wrap">
                {event.status === 'SETUP' && (
                  <button className="btn btn-primary" onClick={() => handleInitialize(event.id)} style={{boxShadow: '0 4px 12px rgba(var(--primary-rgb), 0.3)'}}>
                    🚀 Start Judging Mode
                  </button>
                )}
                {event.status === 'JUDGING' && (
                  <>
                    <button className="btn btn-success" onClick={() => updateStatus(event.id, 'COMPLETED')}>
                      🏁 Mark as Completed
                    </button>
                    <button className="btn btn-ghost" onClick={() => updateStatus(event.id, 'SETUP')}>
                      ↩ Revert to Setup
                    </button>
                  </>
                )}
                {event.status === 'COMPLETED' && (
                  <button className="btn btn-ghost" onClick={() => updateStatus(event.id, 'JUDGING')}>
                    🔓 Reopen for Judging
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* ── Delete Confirm Modal ──────────────────────────── */}
      {deletingEvent && (
        <div className="modal-overlay" onClick={() => setDeletingEvent(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 400, width: '100%'}}>
            <div style={{height: 3, background: 'linear-gradient(90deg, #ef4444, #dc2626)', borderRadius: 2, marginBottom: 16}}/>
            <div style={{textAlign: 'center', padding: '8px 0 20px'}}>
              <div style={{fontSize: 40, marginBottom: 12}}>⚠️</div>
              <h2 style={{margin: '0 0 8px', fontSize: 18, color: 'var(--text-primary)'}}>Delete Event?</h2>
              <p style={{margin: 0, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6}}>
                You're about to delete <strong style={{color: 'var(--text-primary)'}}>{events.find(e => e.id === deletingEvent)?.name}</strong>.
                <br/><br/>
                All associated <strong>projects</strong>, <strong>judge sets</strong>, <strong>teams</strong>, and <strong>specific judges</strong> will be permanently removed.
                <br/><br/>
                This action <strong>cannot be undone</strong>.
              </p>
            </div>
            <div style={{display: 'flex', gap: 8, paddingTop: 16, borderTop: '1px solid var(--border-color)'}}>
              <button className="btn btn-ghost" onClick={() => setDeletingEvent(null)} style={{flex: 1}}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete} style={{flex: 1}}>
                🗑 Delete Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
