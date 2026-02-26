import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useActiveEvent } from '../../context/ActiveEventContext';
import { useToast } from '../../context/ToastContext';
import { useLoader } from '../../context/LoaderContext';

export default function AdminTracks() {
  const [events, setEvents] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [eventId, setEventId] = useState('');
  const [editingTrack, setEditingTrack] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', color: '#3B82F6' });
  const [deletingTrack, setDeletingTrack] = useState(null);
  const { activeEvent } = useActiveEvent();
  const { success, error: toastError } = useToast();
  const { showLoader, hideLoader } = useLoader();

  useEffect(() => { 
    showLoader('Loading events...');
    api.get('/events').then(r => { 
      setEvents(r.data); 
      if (activeEvent) {
        setEventId(activeEvent.id);
      }
    }).finally(() => hideLoader()); 
  }, [activeEvent]);

  useEffect(() => { 
    if (eventId) {
      showLoader('Loading tracks...');
      api.get(`/events/${eventId}/tracks`)
        .then(r => setTracks(r.data))
        .catch(() => toastError('Failed to load tracks'))
        .finally(() => hideLoader());
    }
  }, [eventId]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      if (editingTrack) {
        const res = await api.put(`/events/${eventId}/tracks/${editingTrack.id}`, form);
        setTracks(tracks.map(t => t.id === editingTrack.id ? res.data : t));
        success('Track updated successfully');
      } else {
        const res = await api.post(`/events/${eventId}/tracks`, form);
        setTracks([...tracks, res.data]);
        success('Track created successfully');
      }
      setForm({ name: '', description: '', color: '#3B82F6' });
      setEditingTrack(null);
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to save track');
    }
  };

  const handleEdit = (track) => {
    setEditingTrack(track);
    setForm({
      name: track.name,
      description: track.description || '',
      color: track.color
    });
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/events/${eventId}/tracks/${id}`);
      setTracks(tracks.filter(t => t.id !== id));
      setDeletingTrack(null);
      success('Track deleted successfully');
    } catch (err) {
      toastError('Failed to delete track');
    }
  };

  const handleCancel = () => {
    setEditingTrack(null);
    setForm({ name: '', description: '', color: '#3B82F6' });
  };

  return (
    <div style={{maxWidth: 1200, margin: '0 auto'}}>
      <div className="page-header"><h1 style={{fontSize: 32, fontWeight: 800}}>Tracks & Categories</h1></div>
      
      {!activeEvent && (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          background: 'var(--bg-card)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          marginBottom: '20px'
        }}>
          <h2 style={{margin: '0 0 12px 0', color: 'var(--warning)'}}>⚠️ No Active Event</h2>
          <p style={{margin: 0, color: 'var(--text-secondary)'}}>Please mark an event as Active to manage tracks.</p>
        </div>
      )}

      {!activeEvent ? null : (
        <>
      <div className="card mb-8" style={{
        border: '1px solid var(--accent)', 
        background: 'rgba(var(--accent-rgb), 0.03)',
        padding: 32,
        marginBottom: 48
      }}>
        <h2 style={{fontSize: 18, fontWeight: 700, marginBottom: 32}}>
          {editingTrack ? `Edit "${editingTrack.name}"` : 'Create New Track'}
        </h2>
        <form onSubmit={handleCreate}>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 32, marginBottom: 28}}>
            <div className="form-group">
              <label className="form-label" style={{marginBottom: 10}}>Track Name *</label>
              <input 
                className="form-input" 
                value={form.name} 
                onChange={e => setForm({...form, name: e.target.value})} 
                placeholder="e.g. Best AI Hack" 
                required 
              />
            </div>
            <div className="form-group">
              <label className="form-label" style={{marginBottom: 10}}>Description</label>
              <input 
                className="form-input" 
                value={form.description} 
                onChange={e => setForm({...form, description: e.target.value})} 
                placeholder="Track criteria and details"
              />
            </div>
            <div className="form-group">
              <label className="form-label" style={{marginBottom: 10}}>Brand Color</label>
              <div style={{display: 'flex', gap: 14, alignItems: 'center'}}>
                <input 
                  type="color" 
                  value={form.color} 
                  onChange={e => setForm({...form, color: e.target.value})} 
                  style={{width: 50, height: 40, border: 'none', borderRadius: 6, cursor: 'pointer'}} 
                />
                <span style={{fontSize: 12, color: 'var(--text-muted)', fontWeight: 500}}>{form.color}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button className="btn btn-primary" type="submit" style={{padding: '12px 28px', fontSize: 14}}>
              {editingTrack ? '✏️ Update Track' : '+ Create Track'}
            </button>
            {editingTrack && (
              <button className="btn btn-ghost" type="button" onClick={handleCancel} style={{padding: '12px 28px', fontSize: 14}}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {tracks.length === 0 && (
        <div className="empty-state" style={{padding: '80px 20px'}}>
          <div style={{fontSize: 48, marginBottom: 16}}>🏆</div>
          <h3>No Tracks Yet</h3>
          <p>Create tracks to categorize nomination awards at this event.</p>
        </div>
      )}

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24}}>
        {tracks.map(track => (
          <div key={track.id} className="card" style={{
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            transition: 'all 0.2s ease',
            border: '1px solid var(--border-light)'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = track.color}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-light)'}
          >
            <div style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16}}>
              <div style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: track.color,
                flexShrink: 0,
                boxShadow: `0 0 12px ${track.color}40`
              }} />
              <h3 style={{fontSize: 16, fontWeight: 700, margin: 0, flex: 1}}>{track.name}</h3>
            </div>
            {track.description && (
              <p style={{fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px 0', lineHeight: 1.5}}>
                {track.description}
              </p>
            )}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              padding: '10px 12px',
              borderRadius: 6,
              fontSize: 12,
              color: 'var(--text-muted)',
              marginBottom: 16,
              marginTop: 'auto'
            }}>
              <span style={{fontWeight: 600}}>{track._count?.nominations || 0}</span> nomination{track._count?.nominations !== 1 ? 's' : ''}
            </div>
            <div style={{display: 'flex', gap: 8}}>
              <button 
                className="btn btn-primary btn-sm" 
                onClick={() => handleEdit(track)}
                style={{flex: 1, fontSize: 12}}
              >
                ✏️ Edit
              </button>
              <button 
                className="btn btn-ghost btn-sm" 
                onClick={() => setDeletingTrack(track.id)}
                style={{color: 'var(--danger)', fontSize: 12}}
                title="Delete Track"
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {deletingTrack && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{maxWidth: 400, padding: 32}}>
            <h3 style={{fontSize: 18, fontWeight: 700, marginBottom: 16}}>Delete Track?</h3>
            <p style={{color: 'var(--text-muted)', marginBottom: 24}}>
              This action cannot be undone. The track will be permanently removed.
            </p>
            <div style={{display: 'flex', gap: 12}}>
              <button 
                className="btn btn-danger" 
                onClick={() => handleDelete(deletingTrack)}
                style={{flex: 1}}
              >
                Delete
              </button>
              <button 
                className="btn btn-ghost" 
                onClick={() => setDeletingTrack(null)}
                style={{flex: 1}}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
