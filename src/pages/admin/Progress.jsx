import { useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import { useActiveEvent } from '../../context/ActiveEventContext';
import { useLoader } from '../../context/LoaderContext';

export default function AdminProgress() {
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [progress, setProgress] = useState(null);
  const [judges, setJudges] = useState([]);
  const [search, setSearch] = useState('');
  const [activityFilter, setActivityFilter] = useState('ALL');
  const socket = useSocket();
  const { activeEvent } = useActiveEvent();
  const { showLoader, hideLoader } = useLoader();

  useEffect(() => { 
    showLoader('Loading events...');
    api.get('/events').then(r => { 
      setEvents(r.data); 
      // Only set eventId if activeEvent exists
      if (activeEvent) {
        setEventId(activeEvent.id);
      }
    }).finally(() => hideLoader()); 
  }, [activeEvent]);

  useEffect(() => {
    if (!eventId) return;
    showLoader('Loading progress data...');
    Promise.all([
      api.get(`/events/${eventId}/assignments/progress`),
      api.get(`/events/${eventId}/judges`).catch(() => ({ data: [] }))
    ]).then(([progressRes, judgesRes]) => {
      setProgress(progressRes.data);
      setJudges(judgesRes.data);
    }).finally(() => hideLoader());
  }, [eventId]);

  useEffect(() => {
    if (!socket) return;
    const handler = (data) => { if (data.eventId === eventId) setProgress(prev => ({...prev, ...data})); };
    socket.on('judging:progress', handler);
    return () => socket.off('judging:progress', handler);
  }, [socket, eventId]);

  const pct = progress ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100) : 0;
  const fmtTime = (s) => {
    if (!s) return '—';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${sec}s`;
  };

  return (
    <div>
      <div className="page-header"><h1>Progress</h1></div>

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
          <p style={{margin: 0, color: 'var(--text-secondary)'}}>Please mark an event as Active to view judging progress.</p>
        </div>
      )}

      {!activeEvent ? null : (
        <>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-value">{progress?.total || 0}</div><div className="stat-label">Total Sets</div></div>
        <div className="stat-card"><div className="stat-value" style={{color:'var(--text-muted)'}}>{progress?.unassigned || 0}</div><div className="stat-label">Unassigned</div></div>
        <div className="stat-card"><div className="stat-value" style={{color:'var(--warning)'}}>{progress?.inProgress || 0}</div><div className="stat-label">In Progress</div></div>
        <div className="stat-card"><div className="stat-value" style={{color:'var(--success)'}}>{progress?.completed || 0}</div><div className="stat-label">Completed</div></div>
      </div>

      <div className="card mb-4">
        <div className="card-header"><span className="card-title">Overall Progress</span><span style={{fontSize:20,fontWeight:700}}>{pct}%</span></div>
        <div style={{height:12,background:'var(--bg-input)',borderRadius:6,overflow:'hidden'}}>
          <div style={{height:'100%',width:`${pct}%`,background:'var(--gradient-primary)',borderRadius:6,transition:'width 0.5s ease'}} />
        </div>
      </div>

      <div className="card">
        {/* Card header with search + filters */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8}}>
          <span className="card-title">Judge Activity</span>
          <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
            <div style={{position:'relative'}}>
              <span style={{position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', fontSize:13, pointerEvents:'none'}}>🔍</span>
              <input
                className="form-input"
                style={{paddingLeft:28, width:180, height:32, fontSize:13}}
                placeholder="Search judge..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {['ALL','ACTIVE','IDLE','DONE'].map(f => (
              <button
                key={f}
                className={`btn btn-sm ${activityFilter === f ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActivityFilter(f)}
              >
                {f === 'ALL' ? 'All' : f === 'ACTIVE' ? '⚡ Active' : f === 'IDLE' ? '⏸️ Idle' : '✅ Done'}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Judge</th><th>Total</th><th>Completed</th><th>Progress</th><th>Status</th><th>Total Time</th></tr></thead>
            <tbody>
              {judges
                .filter(j => {
                  if (activityFilter === 'ACTIVE' && j.inProgressSets === 0) return false;
                  if (activityFilter === 'IDLE' && (j.inProgressSets > 0 || j.completedSets > 0)) return false;
                  if (activityFilter === 'DONE' && !(j.completedSets === j.totalSets && j.totalSets > 0 && j.inProgressSets === 0)) return false;
                  if (search && !j.name.toLowerCase().includes(search.toLowerCase())) return false;
                  return true;
                })
                .map(j => {
                const jpct = j.totalSets > 0 ? Math.round((j.completedSets / j.totalSets) * 100) : 0;
                return (
                  <tr key={j.id}>
                    <td>
                      <a 
                        href={`/admin/view-judge/${j.id}`} 
                        key={j.id} 
                        style={{color:'var(--accent)',textDecoration:'none',fontWeight:700}}
                        onClick={(e) => { e.preventDefault(); window.location.href = `/admin/view-judge/${j.id}`; }}
                      >
                        {j.name}
                      </a>
                    </td>
                    <td>{j.totalSets}</td>
                    <td>{j.completedSets}</td>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{flex:1,height:6,background:'var(--bg-input)',borderRadius:3,overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${jpct}%`,background:'var(--gradient-primary)',borderRadius:3}} />
                        </div>
                        <span style={{fontSize:12,color:'var(--text-muted)',minWidth:36}}>{jpct}%</span>
                      </div>
                    </td>
                    <td>
                      {j.inProgressSets > 0
                        ? <span className="badge badge-warning">⚡ Active</span>
                        : j.completedSets === j.totalSets && j.totalSets > 0
                        ? <span className="badge badge-success">✅ Done</span>
                        : <span className="badge badge-info">⏸️ Idle</span>}
                    </td>
                    <td style={{fontSize:12, color:'var(--text-muted)'}}>{fmtTime(j.totalTimeSeconds)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
