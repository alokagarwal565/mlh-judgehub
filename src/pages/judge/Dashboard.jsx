import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';

export default function JudgeDashboard({ isAdminView }) {
  const { viewAsJudgeId } = useParams();
  const { info, error: toastError } = useToast();
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const socket = useSocket();

  useEffect(() => {
    api.get('/events').then(r => {
      setEvents(r.data);
      const active = r.data.find(e => e.status === 'JUDGING') || r.data[0];
      if (active) setEventId(active.id);
    });
  }, []);

  const loadSets = useCallback(() => {
    if (eventId) {
      const url = isAdminView 
        ? `/events/${eventId}/assignments/judge/${viewAsJudgeId}`
        : `/events/${eventId}/assignments/my-sets`;
      api.get(url).then(r => setSets(r.data));
    }
  }, [eventId, isAdminView, viewAsJudgeId]);

  useEffect(() => { loadSets(); }, [loadSets]);

  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => loadSets();
    socket.on('event:statusChanged', handleUpdate);
    socket.on('assignment:new', (data) => {
      // Refresh if it's for this judge (or if we're in admin view)
      loadSets();
    });
    return () => {
      socket.off('event:statusChanged', handleUpdate);
      socket.off('assignment:new');
    };
  }, [socket, loadSets]);

  const requestNext = async () => {
    setLoading(true);
    try {
      const res = await api.post(`/events/${eventId}/assignments/next`);
      if (res.data.set) {
        loadSets();
      } else {
        info('No more available sets!', 'Queue Empty');
      }
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to request a set');
    } finally {
      setLoading(false);
    }
  };

  const inProgress = sets.filter(s => s.status === 'IN_PROGRESS');
  const completed = sets.filter(s => s.status === 'COMPLETED');

  const getSetRange = (projects) => {
    if (!projects || projects.length === 0) return '';
    const sorted = [...projects].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const firstMatch = sorted[0]?.project?.teamNumber?.match(/\d+/);
    if (!firstMatch) return '';
    const start = parseInt(firstMatch[0]);
    return `${start} - ${start + sorted.length - 1}`;
  };

  return (
    <div>
      {isAdminView && (
        <div className="card mb-4" style={{background:'rgba(var(--accent-rgb), 0.1)', border:'1px solid var(--accent)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div>
            <strong style={{color:'var(--accent)'}}>👀 VIEW ONLY MODE</strong>
            <div className="text-sm text-muted">You are viewing this dashboard exactly as the judge sees it. Actions are disabled.</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/progress')}>✕ Close View</button>
        </div>
      )}
      <div className="page-header">
        <h1>{isAdminView ? 'Judge View Mode' : 'My Judging Queue'}</h1>
        {!isAdminView && (() => {
          const hasActiveSet = sets.some(s => s.status === 'IN_PROGRESS');
          return (
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              {hasActiveSet && (
                <span style={{fontSize:12, color:'var(--text-muted)'}}>⏳ Finish your current set first</span>
              )}
              <button
                className="btn btn-primary"
                onClick={requestNext}
                disabled={loading || hasActiveSet}
                title={hasActiveSet ? 'Complete your current set before requesting the next one' : ''}
                style={hasActiveSet ? {opacity:0.45, cursor:'not-allowed', filter:'grayscale(0.4)'} : {}}
              >
                {loading ? 'Loading...' : '⚡ Request Next Set'}
              </button>
            </div>
          );
        })()}
      </div>

      <div className="stats-grid" style={{gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))'}}>
        <div className="stat-card">
          <div className="stat-value" style={{color:'var(--warning)'}}>{inProgress.length}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:'var(--success)'}}>{completed.length}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{sets.length}</div>
          <div className="stat-label">Total Sets</div>
        </div>
      </div>

      {inProgress.length > 0 && (
        <div className="mb-4">
          <h3 style={{marginBottom:12,fontSize:14,color:'var(--warning)'}}>⏳ In Progress</h3>
          {inProgress.map(set => (
            <div key={set.id} className="card mb-4" style={{borderLeft:'3px solid var(--warning)',cursor:'pointer'}} onClick={() => navigate(isAdminView ? `/admin/view-judge/${viewAsJudgeId}/score/${set.id}` : `/judge/score/${set.id}`)}>
              <div className="flex items-center justify-between" style={{marginBottom:12}}>
                <div>
                  <span style={{fontWeight:700}}>
                    {set.setNumber === 0 ? '🏆 Tie-breaker' : `Set ${set.column} • ${getSetRange(set.projects)}`}
                  </span>
                </div>
                <span className="badge badge-warning">IN PROGRESS</span>
              </div>
              <div style={{display:'grid',gap:8}}>
                {set.projects.map(sp => {
                  const scored = set.scores?.some(s => s.projectId === sp.project?.id);
                  return (
                    <div key={sp.project?.id} className="flex items-center justify-between" style={{padding:'8px 12px',background:'var(--bg-input)',borderRadius:'var(--radius-sm)'}}>
                      <div>
                        <div className="flex items-center gap-2">
                          <strong style={{fontSize:13}}>{sp.project?.title}</strong>
                          {sp.project?.status === 'FLAGGED' && <span className="badge" style={{background:'#ff4444',color:'#fff',fontSize:9,padding:'1px 6px'}}>🚩</span>}
                        </div>
                        <div style={{display:'flex',gap:6,marginTop:4,flexWrap:'wrap'}}>
                          <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:'var(--accent)',color:'#fff'}}>{sp.project?.teamNumber}</span>
                          <span style={{fontSize:10,color:'var(--text-muted)'}}>👥 {sp.project?.team?.name}</span>
                          <span style={{fontSize:10,color:'var(--text-muted)'}}>📍 {sp.project?.roomNumber}</span>
                          <span style={{fontSize:10,color:'var(--text-muted)'}}>👤 {sp.project?.leaderName}</span>
                          <span style={{fontSize:10,color:'var(--text-muted)'}}>📞 {sp.project?.team?.phone}</span>
                        </div>
                      </div>
                      {scored ? <span className="badge badge-success">Scored</span> : <span className="badge badge-info">Pending</span>}
                    </div>
                  );
                })}
              </div>
              <button className="btn btn-primary btn-block mt-4" onClick={(e) => { e.stopPropagation(); navigate(isAdminView ? `/admin/view-judge/${viewAsJudgeId}/score/${set.id}` : `/judge/score/${set.id}`); }}>
                {isAdminView ? 'View Scoring Flow →' : 'Score This Set →'}
              </button>
            </div>
          ))}
        </div>
      )}

      {inProgress.length === 0 && sets.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h3>No Sets Assigned</h3>
          <p>Click "Request Next Set" to get your first assignment</p>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <h3 style={{marginBottom:12,fontSize:14,color:'var(--success)'}}>✅ Completed ({completed.length})</h3>
          {completed.map(set => {
            const canEdit = inProgress.length === 0;
            return (
              <div key={set.id} className="card mb-4" style={{borderLeft:'3px solid var(--success)'}}>
                <div className="flex items-center justify-between">
                  <span><strong>{set.setNumber === 0 ? '🏆 Tie-breaker' : `Set ${set.column} • ${getSetRange(set.projects)}`}</strong></span>
                  <span className="badge badge-success">COMPLETED</span>
                </div>
                <div className="text-sm text-muted mt-2">
                  {set.projects.map(sp => (
                    <span key={sp.project.id}>
                      {sp.project.title}{sp.project.status === 'FLAGGED' ? ' 🚩' : ''}
                      {sp !== set.projects[set.projects.length - 1] ? ' · ' : ''}
                    </span>
                  ))}
                </div>
                <button
                  className="btn btn-ghost btn-sm mt-4"
                  disabled={!isAdminView && !canEdit}
                  title={isAdminView ? 'Viewing evaluated scores' : canEdit ? 'Reopen this set to edit scores' : 'Complete your active set first'}
                  onClick={async () => {
                    if (isAdminView) {
                      navigate(`/admin/view-judge/${viewAsJudgeId}/score/${set.id}`);
                      return;
                    }
                    try {
                      await api.post(`/events/${eventId}/sets/${set.id}/reopen`);
                      loadSets();
                      navigate(`/judge/score/${set.id}`);
                    } catch (err) {
                      toastError(err.response?.data?.error || 'Failed to reopen');
                    }
                  }}
                >
                  {isAdminView ? '👀 View Scores' : '✏️ Edit Scores'}
                </button>
                {!canEdit && <div className="text-sm text-muted" style={{marginTop:4,fontSize:11}}>Complete your active set to unlock editing</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
