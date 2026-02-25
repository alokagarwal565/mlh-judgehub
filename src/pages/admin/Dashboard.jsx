import { useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';

export default function AdminDashboard() {
  const [events, setEvents] = useState([]);
  const [progress, setProgress] = useState(null);
  const socket = useSocket();

  useEffect(() => {
    api.get('/events').then(r => setEvents(r.data));
  }, []);

  useEffect(() => {
    if (events.length > 0) {
      api.get(`/events/${events[0].id}/assignments/progress`).then(r => setProgress(r.data)).catch(() => {});
    }
  }, [events]);

  useEffect(() => {
    if (!socket) return;
    socket.on('judging:progress', (data) => setProgress(prev => ({ ...prev, ...data })));
    socket.on('set:completed', () => {
      if (events.length > 0) api.get(`/events/${events[0].id}/assignments/progress`).then(r => setProgress(r.data));
    });
    return () => { socket.off('judging:progress'); socket.off('set:completed'); };
  }, [socket, events]);

  const activeEvent = events[0];
  const pct = progress ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100) : 0;

  return (
    <div>
      <div className="page-header"><h1>Dashboard</h1></div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{events.length}</div>
          <div className="stat-label">Events</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{progress?.total || 0}</div>
          <div className="stat-label">Total Sets</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:'var(--success)'}}>{progress?.completed || 0}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:'var(--warning)'}}>{progress?.inProgress || 0}</div>
          <div className="stat-label">In Progress</div>
        </div>
      </div>

      {activeEvent && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Active Event: {activeEvent.name}</span>
            <span className={`badge ${activeEvent.status === 'JUDGING' ? 'badge-warning' : activeEvent.status === 'COMPLETED' ? 'badge-success' : 'badge-info'}`}>{activeEvent.status}</span>
          </div>
          <div style={{marginTop:16}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:6,fontSize:13,color:'var(--text-secondary)'}}>
              <span>Judging Progress</span>
              <span>{pct}%</span>
            </div>
            <div style={{height:8,background:'var(--bg-input)',borderRadius:4,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${pct}%`,background:'var(--gradient-primary)',borderRadius:4,transition:'width 0.5s ease'}} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
