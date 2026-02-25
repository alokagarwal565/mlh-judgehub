import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';

export default function AdminResults() {
  const { success, error: toastError } = useToast();
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [trackWinners, setTrackWinners] = useState([]);
  const [tab, setTab] = useState('leaderboard');
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const socket = useSocket();

  useEffect(() => { api.get('/events').then(r => { setEvents(r.data); if (r.data.length) setEventId(r.data[0].id); }); }, []);

  const fetchData = useCallback(async () => {
    if (!eventId) return;
    setRefreshing(true);
    try {
      const [lbRes, twRes] = await Promise.all([
        api.get(`/events/${eventId}/results`),
        api.get(`/events/${eventId}/results/tracks`)
      ]);
      setLeaderboard(lbRes.data);
      setTrackWinners(twRes.data);
    } catch (err) {
      console.error('Fetch failed', err);
    } finally {
      setRefreshing(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // WS: Refresh when a set is completed anywhere
  useEffect(() => {
    if (!socket || !eventId) return;
    
    const handler = (data) => {
      if (data.eventId === eventId) {
        console.log('Set completed event received, refreshing leaderboard...');
        fetchData();
      }
    };

    socket.on('set:completed', handler);
    return () => socket.off('set:completed', handler);
  }, [socket, eventId, fetchData]);

  const handleShowDetails = async (projectId) => {
    setLoadingDetails(true);
    try {
      const res = await api.get(`/events/${eventId}/projects/${projectId}/details`);
      setSelectedDetails(res.data);
    } catch (err) {
      toastError('Failed to load project details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleExport = async () => {
    const res = await api.get(`/events/${eventId}/results/export`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a'); a.href = url; a.download = 'leaderboard.csv'; a.click();
  };

  const handleRejudge = async () => {
    try {
      const res = await api.post(`/events/${eventId}/results/rejudge`);
      success(
        `${res.data.tiedGroups} tied groups · ${res.data.rejudgeAssignments.length} assignments created`,
        '🔁 Rejudge Created'
      );
    } catch (err) { toastError(err.response?.data?.error || 'Failed', 'Rejudge Failed'); }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Results</h1>
        <div className="flex gap-2">
          <button className={`btn btn-ghost btn-sm ${refreshing ? 'loading' : ''}`} onClick={fetchData} disabled={refreshing}>
            {refreshing ? '⌛ Refreshing...' : '🔄 Refresh'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleExport}>📥 Export CSV</button>
          <button className="btn btn-primary btn-sm" onClick={handleRejudge}>🔄 Rejudge Ties</button>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button className={`btn ${tab === 'leaderboard' ? 'btn-primary' : 'btn-ghost'} btn-sm`} onClick={() => setTab('leaderboard')}>🏆 Leaderboard</button>
        <button className={`btn ${tab === 'tracks' ? 'btn-primary' : 'btn-ghost'} btn-sm`} onClick={() => setTab('tracks')}>🏷️ Tracks</button>
      </div>

      {tab === 'leaderboard' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Rank</th><th>Team</th><th>Team No</th><th>Project</th><th>Stack Pts</th><th>Total Marks</th><th>Evals</th><th>Tied</th></tr></thead>
            <tbody>
              {leaderboard.map((e, i) => (
                <tr 
                  key={e.projectId} 
                  style={{cursor:'pointer', ...(i < 3 ? {background: ['rgba(255,215,0,0.08)','rgba(192,192,192,0.06)','rgba(205,127,50,0.06)'][i]} : {})}}
                  onClick={() => handleShowDetails(e.projectId)}
                >
                  <td><strong style={i < 3 ? {fontSize:18} : {}}>{i < 3 ? ['🥇','🥈','🥉'][i] : e.rank}</strong></td>
                  <td>
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <strong>{e.teamName}</strong>
                      <div style={{display:'flex', gap:4}}>
                        {trackWinners.filter(t => t.winner?.projectId === e.projectId).map(t => (
                          <span 
                            key={t.trackId} 
                            style={{
                              fontSize:9, 
                              padding:'1px 6px', 
                              borderRadius:4, 
                              background:`${t.trackColor}15`, 
                              color:t.trackColor, 
                              border:`1px solid ${t.trackColor}40`,
                              fontWeight:600,
                              whiteSpace:'nowrap'
                            }}
                          >
                            ⭐ {t.trackName}
                          </span>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td>{e.teamNumber}</td>
                  <td>{e.projectTitle} {e.projectStatus === 'FLAGGED' && <span className="badge" style={{background:'#ff4444',color:'#fff',fontSize:9,padding:'1px 6px'}}>🚩 FLAGGED</span>}</td>
                  <td style={{fontWeight:700}}>{e.stackPoints}</td>
                  <td>{e.totalMarks}</td>
                  <td>{e.timesEvaluated}</td>
                  <td>{e.isTied ? <span className="badge badge-warning">Tied</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'tracks' && (
        <div className="grid-2">
          {trackWinners.map(t => (
            <div key={t.trackId} className="card" style={{borderTop:`3px solid ${t.trackColor}`}}>
              <div className="card-header">
                <span className="card-title">{t.trackName}</span>
                <span className="text-sm text-muted">{t.totalNominations} nom.</span>
              </div>
              {t.winner ? (
                <div style={{cursor:'pointer'}} onClick={() => handleShowDetails(t.winner.projectId)}>
                  <div style={{fontWeight:700}}>{t.winner.teamName}</div>
                  <div style={{display:'flex',gap:6,marginTop:4,marginBottom:8,flexWrap:'wrap'}}>
                    <span className="badge badge-info" style={{fontSize:10}}>Team: {t.winner.teamNumber}</span>
                    <span className="badge" style={{fontSize:10,background:'var(--bg-input)',color:'var(--text-primary)'}}>📍 Room No. {t.winner.roomNumber}</span>
                    <span className="badge badge-success" style={{fontSize:10}}>Pts: {t.winner.stackPoints}</span>
                    <span className="badge badge-warning" style={{fontSize:10}}>Marks: {t.winner.totalMarks}</span>
                  </div>
                  <div className="text-sm text-muted">{t.winner.projectTitle} · {t.winner.count} nominations</div>
                </div>
              ) : (
                <div className="text-sm text-muted">No nominations yet</div>
              )}
              {t.allNominees.length > 1 && (
                <div style={{marginTop:12,borderTop:'1px solid var(--border-color)',paddingTop:8}}>
                  {t.allNominees.slice(1, 4).map((n, i) => (
                    <div 
                      key={n.projectId} 
                      className="text-sm text-muted" 
                      style={{padding:'4px 0',borderBottom:i<2?'1px solid var(--bg-input)':'none', cursor:'pointer'}}
                      onClick={() => handleShowDetails(n.projectId)}
                    >
                      <div className="flex justify-between items-center">
                        <span>{i + 2}. {n.teamName}</span>
                        <div className="flex gap-1">
                          <span className="badge" style={{fontSize:9,background:'rgba(var(--success-rgb), 0.1)',color:'var(--success)'}}>{n.stackPoints} pts</span>
                          <span className="badge" style={{fontSize:9,background:'var(--bg-input)'}}>#{n.teamNumber}</span>
                        </div>
                      </div>
                      <div style={{fontSize:9,display:'flex',gap:4,marginTop:2}}>
                        <span>📍 Room No. {n.roomNumber}</span>
                        <span>·</span>
                        <span style={{color:'var(--warning)'}}>{n.totalMarks} marks</span>
                        <span>·</span>
                        <span>{n.count} noms</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Project Detail Modal */}
      {selectedDetails && (
        <div className="modal-overlay" onClick={() => setSelectedDetails(null)}>
          <div className="modal-content" style={{maxWidth:700}} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2>Project Evaluation Details</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDetails(null)}>✕</button>
            </div>
            <div className="flex gap-4 mb-6">
              <span className="badge badge-info">Coverage: {selectedDetails.filter(ev => ev.set.status === 'COMPLETED').length} / {selectedDetails.length} evaluations</span>
            </div>
            <div className="grid gap-6">
              {selectedDetails.length === 0 ? (
                <div className="empty-state" style={{padding:'40px 20px'}}>
                  <div style={{fontSize:40, marginBottom:16}}>🏆</div>
                  <h3>No Evaluations Yet</h3>
                  <p className="text-muted">This project has not been evaluated yet. Once judges start scoring, their detailed feedback and marks will appear here.</p>
                </div>
              ) : (
                selectedDetails.sort((a, b) => (b.set.status === 'COMPLETED' ? 1 : 0) - (a.set.status === 'COMPLETED' ? 1 : 0)).reverse().map((ev, idx) => {
                  const getRange = (pts) => {
                     if (!pts) return '';
                     const sorted = [...pts].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                     const m = sorted[0]?.project?.teamNumber?.match(/\d+/);
                     if (!m) return '';
                     const start = parseInt(m[0]);
                     return `${start} - ${start + sorted.length - 1}`;
                  };
                  const isComplete = ev.set.status === 'COMPLETED';
                  const score = ev.set.scores[0] || {};
                  const feedback = ev.set.feedback[0];
                  const rank = ev.set.stackRankVotes[0];
                  return (
                    <div key={idx} className="card" style={{
                      borderLeft: `4px solid ${!isComplete ? 'var(--text-muted)' : rank ? 'var(--success)' : 'var(--accent)'}`,
                      opacity: isComplete ? 1 : 0.6,
                      background: isComplete ? 'var(--bg-card)' : 'transparent',
                      borderStyle: isComplete ? 'solid' : 'dashed'
                    }}>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          {isComplete ? (
                            <strong style={{fontSize:16}}>Judge: {ev.set.judge?.name || 'Anonymous'}</strong>
                          ) : ev.set.judgeId ? (
                            <strong style={{fontSize:16, color:'var(--warning)'}}>In Progress: {ev.set.judge?.name || 'Judge'}</strong>
                          ) : (
                            <strong style={{fontSize:16, color:'var(--text-muted)'}}>Slot: Awaiting Assignment</strong>
                          )}
                          <div className="text-sm text-muted">
                            {ev.set.setNumber === 0 ? '🏆 Tie-breaker round' : `Set ${ev.set.column} • ${getRange(ev.set.projects)}`}
                          </div>
                        </div>
                        {isComplete ? (
                          ev.set.setNumber === 0 ? (
                            <span className="badge badge-warning" style={{fontSize:12}}>Tie-breaker Rank: {rank?.rank || '—'}</span>
                          ) : rank ? (
                            <span className="badge badge-success" style={{fontSize:12}}>Ranked Top 3: {rank.rank === 1 ? '🥇' : rank.rank === 2 ? '🥈' : '🥉'} ({rank.points} pts)</span>
                          ) : (
                            <span className="badge badge-ghost" style={{fontSize:11, background:'var(--bg-input)'}}>Unranked</span>
                          )
                        ) : ev.set.judgeId ? (
                          <span className="badge badge-warning" style={{fontSize:11}}>Evaluating...</span>
                        ) : (
                          <span className="badge" style={{fontSize:11, background:'var(--bg-input)', color:'var(--text-muted)'}}>Pending</span>
                        )}
                      </div>
                      
                      {isComplete ? (
                        <>
                          <div style={{display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:8, marginBottom:16}}>
                            {['completion', 'originality', 'learning', 'design', 'technology'].map(f => (
                              <div key={f} style={{background:'var(--bg-input)', padding:8, borderRadius:8, textAlign:'center', border:'1px solid var(--border-color)'}}>
                                <div style={{fontSize:8, textTransform:'uppercase', color:'var(--text-muted)', marginBottom:4, whiteSpace:'nowrap'}}>{f}</div>
                                <div style={{fontWeight:800, fontSize:16, color:'var(--accent)'}}>{score[f] ?? '—'}</div>
                              </div>
                            ))}
                            <div style={{background: ev.set.setNumber === 0 ? 'var(--bg-input)' : 'var(--accent)', padding:8, borderRadius:8, textAlign:'center', border: ev.set.setNumber === 0 ? '1px solid var(--border-color)' : '1px solid var(--accent-glow)'}}>
                              <div style={{fontSize:8, textTransform:'uppercase', color: ev.set.setNumber === 0 ? 'var(--text-muted)' : 'rgba(255,255,255,0.7)', marginBottom:4, whiteSpace:'nowrap'}}>
                                {ev.set.setNumber === 0 ? 'MARKS' : 'TOTAL'}
                              </div>
                              <div style={{fontWeight:800, fontSize:16, color: ev.set.setNumber === 0 ? 'var(--text-primary)' : 'white'}}>{score.total ?? '—'}</div>
                            </div>
                          </div>
  
                          {ev.set.setNumber === 0 && (
                            <div className="text-sm text-muted mb-4" style={{fontStyle:'italic', marginTop:-8}}>
                              ⚠️ These marks are for judging context and do not contribute to the leaderboard total.
                            </div>
                          )}
  
                          {feedback && (
                            <div style={{background:'rgba(255, 255, 255, 0.03)', padding:12, borderRadius:8, fontSize:13, border:'1px solid var(--border-color)', marginBottom:12}}>
                              <span style={{color:'var(--text-muted)', fontWeight:600, marginRight:6}}>COMMENT:</span>
                              {feedback.comment}
                            </div>
                          )}
  
                          {ev.set.nominations.length > 0 && (
                            <div className="flex gap-2 flex-wrap">
                              {ev.set.nominations.map(n => (
                                <span key={n.id} style={{fontSize:10, padding:'3px 10px', borderRadius:20, background:`${n.track.color}15`, color:n.track.color, border:`1px solid ${n.track.color}30`, fontWeight:600}}>
                                  🏷️ {n.track.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center py-4 text-sm text-muted" style={{fontStyle:'italic'}}>
                          Judge has not started evaluating this set yet.
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
