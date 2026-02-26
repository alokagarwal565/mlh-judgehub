import { useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import { useActiveEvent } from '../../context/ActiveEventContext';
import { useLoader } from '../../context/LoaderContext';

export default function AdminDashboard() {
  const [events, setEvents] = useState([]);
  const [progress, setProgress] = useState(null);
  const socket = useSocket();
  const { activeEvent } = useActiveEvent();
  const { showLoader, hideLoader } = useLoader();

  useEffect(() => {
    showLoader('Loading dashboard...');
    api.get('/events')
      .then(r => setEvents(r.data))
      .finally(() => hideLoader());
  }, []);

  useEffect(() => {
    // Priority: 1. Active Event, 2. First event in list
    const targetEvent = activeEvent || events[0];
    if (targetEvent) {
      api.get(`/events/${targetEvent.id}/assignments/progress`).then(r => setProgress(r.data)).catch(() => {});
    }
  }, [events, activeEvent]);

  useEffect(() => {
    if (!socket) return;
    const targetEvent = activeEvent || events[0];

    const handleProgress = (data) => {
      // data.eventId check ensures we only update if it's the right event
      if (targetEvent && data.eventId === targetEvent.id) {
        setProgress(prev => ({ ...prev, ...data }));
      }
    };

    const handleCompleted = (data) => {
      // data.eventId might be null for older events, fallback to current target
      if (targetEvent && (!data.eventId || data.eventId === targetEvent.id)) {
        api.get(`/events/${targetEvent.id}/assignments/progress`).then(r => setProgress(r.data));
      }
    };

    socket.on('judging:progress', handleProgress);
    socket.on('set:completed', handleCompleted);

    return () => {
      socket.off('judging:progress', handleProgress);
      socket.off('set:completed', handleCompleted);
    };
  }, [socket, events, activeEvent]);

  const displayEvent = activeEvent || events[0];
  const pct = progress ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100) : 0;

  // Show warning if no active event
  if (!activeEvent) {
    return (
      <div>
        <div className="page-header"><h1>Dashboard</h1></div>
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          background: 'var(--bg-card)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)'
        }}>
          <h2 style={{margin: '0 0 12px 0', color: 'var(--warning)'}}>⚠️ No Active Event</h2>
          <p style={{margin: 0, color: 'var(--text-secondary)'}}>Please mark an event as Active to view dashboard data.</p>
          <p style={{margin: '12px 0 0 0', fontSize: '13px', color: 'var(--text-muted)'}}>Go to Events tab to activate an event.</p>
        </div>
      </div>
    );
  }

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

      {displayEvent && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Active Event: {displayEvent.name}</span>
            <span className={`badge ${displayEvent.status === 'JUDGING' ? 'badge-warning' : displayEvent.status === 'COMPLETED' ? 'badge-success' : 'badge-info'}`}>{displayEvent.status}</span>
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
