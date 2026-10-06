import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { useLoader } from '../../context/LoaderContext';

export default function JudgeDashboard({ isAdminView }) {
  const { viewAsJudgeId } = useParams();
  const { info, error: toastError } = useToast();
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [selectedSet, setSelectedSet] = useState(null);
  const [requestReason, setRequestReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const socket = useSocket();
  const { showLoader, hideLoader } = useLoader();

  useEffect(() => {
      showLoader('Loading events...');
    api.get('/events').then(r => {
      setEvents(r.data);
      const active = r.data.find(e => e.status === 'JUDGING') || r.data[0];
      if (active) setEventId(active.id);
    }).finally(() => hideLoader());
  }, []);

  const loadSets = useCallback(() => {
    if (eventId) {
        showLoader('Loading your sets...');
      const url = isAdminView 
        ? `/events/${eventId}/assignments/judge/${viewAsJudgeId}`
        : `/events/${eventId}/assignments/my-sets`;
      api.get(url).then(r => setSets(r.data)).finally(() => hideLoader());
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
    socket.on('edit-request:statusChanged', handleUpdate);
    return () => {
      socket.off('event:statusChanged', handleUpdate);
      socket.off('assignment:new');
      socket.off('edit-request:statusChanged', handleUpdate);
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

  const handleRequestEdit = async (e) => {
    e.preventDefault();
    if (!requestReason.trim()) return;
    setIsSubmitting(true);
    try {
      await api.post('/edit-requests/request', { setId: selectedSet.id, reason: requestReason });
      setEditModal(false);
      setRequestReason('');
      info('Request submitted to administrators', 'Success');
      loadSets();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to submit request');
    } finally {
      setIsSubmitting(false);
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
                {(() => {
                  const latestRequest = set.editRequests?.[0];
                  const hasApprovedRequest = latestRequest?.status === 'APPROVED';
                  const hasPendingRequest = latestRequest?.status === 'PENDING';
                  const hasDeniedRequest = latestRequest?.status === 'DENIED';
                  
                  // Only allow editing if admin approved the request
                  if (hasApprovedRequest) {
                    return (
                      <button
                        className="btn btn-ghost btn-sm mt-4"
                        title="Reopen this set to edit scores"
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
                        ✏️ Edit Scores
                      </button>
                    );
                  }

                  return (
                    <div className="flex flex-col gap-2">
                       <div className="flex gap-2">
                        <button
                          className="btn btn-ghost btn-sm mt-4"
                          title={isAdminView ? 'Viewing evaluated scores' : 'Viewing of scores is allowed in read-only mode'}
                          onClick={() => {
                            if (isAdminView) {
                              navigate(`/admin/view-judge/${viewAsJudgeId}/score/${set.id}`);
                            } else {
                              navigate(`/judge/view/${set.id}`);
                            }
                          }}
                        >
                          👀 View Scores
                        </button>
                        {!isAdminView && !hasPendingRequest && !hasDeniedRequest && (
                          <button
                            className="btn btn-primary btn-sm mt-4"
                            style={{fontSize:11}}
                            onClick={() => { setSelectedSet(set); setEditModal(true); }}
                          >
                            📩 Request Edit
                          </button>
                        )}
                        {hasPendingRequest && (
                          <button className="btn btn-ghost btn-sm mt-4" disabled style={{opacity:0.6}}>
                            ⏳ Request Pending...
                          </button>
                        )}
                      </div>
                      
                      {!isAdminView && !hasApprovedRequest && !hasPendingRequest && !hasDeniedRequest && (
                        <div className="text-sm text-muted" style={{marginTop:8,fontSize:11,display:'flex',alignItems:'center',gap:6}}>
                          <span style={{opacity:0.6}}>🔒</span> Request admin approval to edit scores
                        </div>
                      )}

                      {hasDeniedRequest && (
                        <div className="text-sm" style={{
                          marginTop:12,
                          fontSize:11,
                          color:'var(--danger)',
                          background:'var(--danger-bg)',
                          padding:'8px 12px',
                          borderRadius:8,
                          border:'1px solid rgba(239, 68, 68, 0.2)',
                          display:'flex',
                          flexDirection:'column',
                          gap:4
                        }}>
                          <div style={{fontWeight:700, display:'flex', alignItems:'center', gap:6}}>
                            <span>❌</span> Request Denied
                          </div>
                          <div style={{opacity:0.9}}>Reason: {latestRequest.reason || 'No reason provided'}</div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {editModal && (
        <div className="modal-overlay" style={{backdropFilter:'blur(8px)'}}>
          <div className="modal-content" style={{maxWidth:440, padding:0, overflow:'hidden', border:'1px solid var(--border-light)', boxShadow:'var(--shadow-lg)'}}>
            <div style={{background:'var(--gradient-primary)', padding:'24px 30px', color:'#fff'}}>
              <h2 style={{margin:0, fontSize:20, display:'flex', alignItems:'center', gap:12}}>
                <span>📩</span> Request Edit Access
              </h2>
              <p style={{margin:'8px 0 0', fontSize:13, opacity:0.9, fontWeight:400}}>For Set <strong>{selectedSet?.column}</strong> · Team Range {getSetRange(selectedSet?.projects)}</p>
            </div>
            
            <form onSubmit={handleRequestEdit} style={{padding:'30px'}}>
              <label className="form-label" style={{marginBottom:10, fontSize:13, display:'block'}}>Reason for Edit Request <span style={{color:'var(--danger)'}}>*</span></label>
              <textarea
                className="form-textarea mb-6"
                placeholder="Ex: Need to correct a scoring mistake for the technical implementation criteria..."
                value={requestReason}
                onChange={e => setRequestReason(e.target.value)}
                required
                autoFocus
                style={{
                  minHeight:120,
                  fontSize:14,
                  lineHeight:1.6,
                  background:'rgba(255,255,255,0.03)',
                  border:'1px solid var(--border-color)',
                  borderRadius:12,
                  padding:14,
                  width:'100%',
                  color:'var(--text-primary)',
                  transition:'all 0.2s',
                  display:'block'
                }}
              />
              
              <div className="flex items-center gap-3 justify-end" style={{marginTop:24}}>
                <button 
                  type="button" 
                  className="btn btn-ghost" 
                  onClick={() => setEditModal(false)} 
                  disabled={isSubmitting}
                  style={{padding:'10px 20px', borderRadius:10}}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={isSubmitting || !requestReason.trim()}
                  style={{padding:'10px 28px', borderRadius:10, minWidth:140}}
                >
                  {isSubmitting ? 'Submitting...' : 'Send Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
