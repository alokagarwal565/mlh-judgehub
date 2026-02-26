import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useActiveEvent } from '../../context/ActiveEventContext';

export default function AdminTracks() {
  const [events, setEvents] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [eventId, setEventId] = useState('');
  const [form, setForm] = useState({ name: '', description: '', color: '#3B82F6' });
  const { activeEvent } = useActiveEvent();

  useEffect(() => { 
    api.get('/events').then(r => { 
      setEvents(r.data); 
      if (activeEvent) {
        setEventId(activeEvent.id);
      } else if (r.data.length && !eventId) {
        setEventId(r.data[0].id);
      }
    }); 
  }, [activeEvent]);

  useEffect(() => { if (eventId) api.get(`/events/${eventId}/tracks`).then(r => setTracks(r.data)); }, [eventId]);

  const handleCreate = async (e) => {
    e.preventDefault();
    const res = await api.post(`/events/${eventId}/tracks`, form);
    setTracks([...tracks, res.data]);
    setForm({ name: '', description: '', color: '#3B82F6' });
  };

  const handleDelete = async (id) => {
    await api.delete(`/events/${eventId}/tracks/${id}`);
    setTracks(tracks.filter(t => t.id !== id));
  };

  return (
    <div>
      <div className="page-header"><h1>Tracks</h1></div>
      <div className="card mb-4">
        <form onSubmit={handleCreate}>
          <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'flex-end'}}>
            <div className="form-group" style={{flex:2,minWidth:180}}>
              <label className="form-label">Track Name</label>
              <input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Best AI Hack" required />
            </div>
            <div className="form-group" style={{flex:2,minWidth:180}}>
              <label className="form-label">Description</label>
              <input className="form-input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
            </div>
            <div className="form-group" style={{width:60}}>
              <label className="form-label">Color</label>
              <input type="color" value={form.color} onChange={e => setForm({...form, color: e.target.value})} style={{width:40,height:36,border:'none',background:'none',cursor:'pointer'}} />
            </div>
            <button className="btn btn-primary" type="submit">Add</button>
          </div>
        </form>
      </div>
      <div className="grid-2">
        {tracks.map(track => (
          <div key={track.id} className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <div style={{width:12,height:12,borderRadius:'50%',background:track.color}} />
                <span className="card-title">{track.name}</span>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(track.id)}>✕</button>
            </div>
            <p className="text-sm text-muted">{track.description}</p>
            <div className="text-sm mt-2">{track._count?.nominations || 0} nominations</div>
          </div>
        ))}
      </div>
    </div>
  );
}
