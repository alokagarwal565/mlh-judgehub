import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useLoader } from '../../context/LoaderContext';
import { useAuth } from '../../context/AuthContext';

export default function JudgeScoreSet({ isAdminView, isReadOnly }) {
  const readonly = isAdminView || isReadOnly;
  const { setId, viewAsJudgeId } = useParams();
  const navigate = useNavigate();
  const { error: toastError } = useToast();
    const { showLoader, hideLoader } = useLoader();
  const { user } = useAuth();
  const [set, setSet] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [scores, setScores] = useState({});
  const [feedback, setFeedback] = useState({});
  const [nominations, setNominations] = useState({});
  const [rankings, setRankings] = useState([]); // Dynamic based on projects count
  const [phase, setPhase] = useState('scoring'); // scoring | ranking | done
  const [timer, setTimer] = useState(0);
  const timerRef = useRef(null);
  const [flagModal, setFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [flagSuccess, setFlagSuccess] = useState(false);
  const [flaggedIds, setFlaggedIds] = useState(new Set());
  const [isEditing, setIsEditing] = useState(false);
  const [projectFlags, setProjectFlags] = useState({}); // projectId -> [flag1, flag2, ...]
  const [flagEditMode, setFlagEditMode] = useState(false);
  const [deleteFlagId, setDeleteFlagId] = useState(null);

  useEffect(() => {
    showLoader('Loading scoring set...');
    api.get(`/events`).then(r => {
      const ev = r.data.find(e => e.status === 'JUDGING') || r.data[0];
      if (ev) {
        api.get(`/events/${ev.id}/sets/${setId}`).then(r => {
          setSet(r.data);
          // Pre-populate existing scores
          const existingScores = {};
          const existingFeedback = {};
          const existingNoms = {};
          for (const s of r.data.scores || []) {
            existingScores[s.projectId] = {
              completion: s.completion, originality: s.originality,
              learning: s.learning, design: s.design, technology: s.technology
            };
          }
          setScores(existingScores);

          // Pre-populate feedback
          for (const f of r.data.feedback || []) {
            existingFeedback[f.projectId] = f.comment;
          }
          setFeedback(existingFeedback);

          // Pre-populate nominations
          for (const n of r.data.nominations || []) {
            if (!existingNoms[n.projectId]) existingNoms[n.projectId] = [];
            existingNoms[n.projectId].push(n.trackId);
          }
          setNominations(existingNoms);

          // Pre-populate rankings
          const numProjects = r.data.projects.length;
          const isTieBreaker = r.data.setNumber === 0;
          const reqRanks = isTieBreaker ? numProjects : Math.min(3, numProjects);
          const initialRankings = Array(reqRanks).fill(null);
          
          if (r.data.stackRankVotes?.length > 0) {
            const sortedVotes = [...r.data.stackRankVotes].sort((a, b) => a.rank - b.rank);
            sortedVotes.slice(0, reqRanks).forEach((v, i) => {
              initialRankings[i] = v.projectId;
            });
          }
          setRankings(initialRankings);

          // Detect edit mode: if all projects already have scores, this is a reopened set
          const allScored = r.data.projects.every(sp => 
            r.data.scores?.some(s => s.projectId === sp.project.id)
          );
          if (allScored && r.data.scores?.length > 0) {
            setIsEditing(true);
          }
        });

        // Fetch flags for this event
        api.get(`/events/${ev.id}/flags`).then(r => {
          const flagsByProject = {};
          for (const flag of r.data) {
            if (!flagsByProject[flag.projectId]) {
              flagsByProject[flag.projectId] = [];
            }
            flagsByProject[flag.projectId].push(flag);
          }
          setProjectFlags(flagsByProject);
        }).catch(() => {
          // If flags endpoint fails, just continue
        });

        api.get(`/events/${ev.id}/tracks`).then(r => setTracks(r.data));
        hideLoader();
      } else {
        hideLoader();
      }
    }).catch(() => hideLoader());
  }, [setId]);

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [currentIdx]);

  useEffect(() => { setTimer(0); }, [currentIdx]);

  const projects = set?.projects?.map(sp => sp.project) || [];
  const currentProject = projects[currentIdx];
  const eventId = set?.eventId;

  const getScore = (projectId) => scores[projectId] || { completion: 0, originality: 0, learning: 0, design: 0, technology: 0 };

  const updateScore = (projectId, field, value) => {
    setScores(prev => ({
      ...prev,
      [projectId]: { ...getScore(projectId), [field]: parseInt(value) }
    }));
  };

  const timerValueRef = useRef(0);

  // Keep ref in sync with timer state so submitScore always sees latest value
  useEffect(() => { timerValueRef.current = timer; }, [timer]);

  const submitScore = async (projectId) => {
    if (readonly) return;
    const s = getScore(projectId);
    const timeSpentSeconds = timerValueRef.current;
    await api.post(`/events/${eventId}/sets/${setId}/scores`, { projectId, ...s, timeSpentSeconds });

    // Submit feedback if any
    if (feedback[projectId]) {
      await api.post(`/events/${eventId}/sets/${setId}/feedback`, { projectId, comment: feedback[projectId] });
    }

    // Submit nominations (always sync even if empty)
    if (!readonly) {
      const noms = nominations[projectId] || [];
      await api.post(`/events/${eventId}/sets/${setId}/nominate`, { projectId, trackIds: noms });
    }
  };

  const handleNext = async () => {
    if (!currentProject) return;
    await submitScore(currentProject.id);
    if (currentIdx < projects.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      setPhase('ranking');
    }
  };

  const handlePrev = async () => {
    if (currentIdx > 0) {
      await submitScore(currentProject.id);
      setCurrentIdx(currentIdx - 1);
    }
  };

  const submitAllAndComplete = async () => {
    // Save all scores first
    for (const p of projects) {
      await submitScore(p.id);
    }
    // Submit existing rankings
    if (!rankings.includes(null) && !readonly) {
      const data = rankings.map((projectId, i) => ({ projectId, rank: i + 1 }));
      await api.post(`/events/${eventId}/sets/${setId}/rank`, { rankings: data });
    }
    if (!readonly) await api.post(`/events/${eventId}/sets/${setId}/complete`);
    showLoader('Redirecting to dashboard...');
    setPhase('done');
    setTimeout(() => navigate(isAdminView ? `/admin/progress` : '/judge'), 1500);
  };

  const toggleNomination = (projectId, trackId) => {
    setNominations(prev => {
      const current = prev[projectId] || [];
      const has = current.includes(trackId);
      return { ...prev, [projectId]: has ? current.filter(t => t !== trackId) : [...current, trackId] };
    });
  };

  const setRanking = (rank, projectId) => {
    setRankings(prev => {
      const newR = [...prev];
      // Remove if already ranked elsewhere
      const existingIdx = newR.indexOf(projectId);
      if (existingIdx !== -1) newR[existingIdx] = null;
      newR[rank] = projectId;
      return newR;
    });
  };

  const submitRankings = async () => {
    if (rankings.includes(null)) {
      toastError('You must rank all top positions before completing this set.');
      return;
    }
    const data = rankings.map((projectId, i) => ({ projectId, rank: i + 1 }));
    if (!readonly) {
      await api.post(`/events/${eventId}/sets/${setId}/rank`, { rankings: data });
      await api.post(`/events/${eventId}/sets/${setId}/complete`);
    }
    showLoader('Redirecting to dashboard...');
    setPhase('done');
    setTimeout(() => navigate(isAdminView ? `/admin/view-judge/${viewAsJudgeId}` : '/judge'), 1500);
  };

  const formatTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
  const timerClass = timer > 180 ? 'timer danger' : timer > 120 ? 'timer warning' : 'timer';

  const getSetRange = (projects) => {
    if (!projects || projects.length === 0) return '';
    const sorted = [...projects].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const firstMatch = sorted[0]?.project?.teamNumber?.match(/\d+/);
    if (!firstMatch) return '';
    const start = parseInt(firstMatch[0]);
    return `${start} - ${start + sorted.length - 1}`;
  };

  if (!set) return <div className="text-center mt-4"><div className="skeleton" style={{width:200,height:100,margin:'40px auto'}}/></div>;

  if (phase === 'done') {
    return null;
  }

  if (phase === 'ranking') {
    const getTotalScore = (projectId) => {
      const s = scores[projectId];
      if (!s) return null;
      return (s.completion || 0) + (s.originality || 0) + (s.learning || 0) + (s.design || 0) + (s.technology || 0);
    };

    // Sort projects by total score descending for display
    const sortedProjects = [...projects].sort((a, b) => {
      const sa = getTotalScore(a.id) ?? -1;
      const sb = getTotalScore(b.id) ?? -1;
      return sb - sa;
    });

    return (
      <div>
        <div className="page-header">
          <h1>{set.setNumber === 0 
            ? `🏆 Tie-breaker: Positions ${set.baseRank || '?'}-${(set.baseRank || 0) + projects.length - 1}` 
            : 'Rank Your Top 3'}</h1>
        </div>
        <p className="text-sm text-muted mb-4">
          {set.setNumber === 0
            ? 'Arrange ALL teams in your preferred order. Your selection will determine the absolute final rank for these tied positions. These marks do not count towards the teams total score.'
            : 'Select your 1st, 2nd, and 3rd place from this set. This is required to complete.'}
        </p>

        {readonly && (
          <div style={{
            background:'rgba(255,255,255,0.05)', 
            padding:'10px 14px', 
            borderRadius:10, 
            fontSize:12, 
            marginBottom:18, 
            border:'1px dashed var(--border-color)', 
            color:'var(--text-muted)',
            display:'flex',
            alignItems:'center',
            gap:10
          }}>
            <span style={{fontSize:16}}>📍</span>
            <span>{isAdminView ? 'VIEWING ONLY: You cannot re-order projects.' : 'READ ONLY: Results are already submitted.'}</span>
          </div>
        )}

        {rankings.map((_, rank) => (
          <div key={rank} style={{marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:600,color:'var(--text-secondary)',marginBottom:8}}>
              {set.setNumber === 0 
                ? `Rank Slot #${rank + 1} (Position ${ (set.baseRank || 0) + rank })`
                : rank === 0 ? '🥇 1st Place (3 pts)' : rank === 1 ? '🥈 2nd Place (2 pts)' : '🥉 3rd Place (1 pt)'
              }
            </div>
            <div style={{display:'grid',gap:8}}>
              {sortedProjects.map(p => {
                const total = getTotalScore(p.id);
                const scoreColor = total === null ? 'var(--text-muted)' : total >= 40 ? 'var(--success)' : total >= 25 ? 'var(--warning)' : 'var(--danger)';
                return (
                  <div
                    key={p.id}
                    className={`rank-card ${rankings[rank] === p.id ? `rank-${rank+1}` : ''}`}
                    onClick={() => !readonly && setRanking(rank, p.id)}
                    style={{...readonly ? {cursor:'default'} : {}, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}
                  >
                    <div style={{display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0}}>
                      <div className="rank-badge">{rankings[rank] === p.id ? rank + 1 : '·'}</div>
                      <div style={{minWidth:0}}>
                        <strong style={{fontSize:14, display:'block', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p.title}</strong>
                        <div className="text-sm text-muted">{p.team?.name}</div>
                      </div>
                    </div>
                    {/* Total score badge */}
                    <div style={{
                      flexShrink:0,
                      display:'flex', flexDirection:'column', alignItems:'flex-end',
                      gap:2
                    }}>
                      {total !== null ? (
                        <span style={{
                          fontWeight:800, fontSize:16, color: scoreColor, lineHeight:1
                        }}>{total}<span style={{fontSize:11, fontWeight:500, color:'var(--text-muted)'}}>/ 50</span></span>
                      ) : (
                        <span style={{fontSize:11, color:'var(--text-muted)'}}>—</span>
                      )}
                      {total !== null && (
                        <div style={{width:48, height:4, borderRadius:2, background:'var(--bg-input)', overflow:'hidden'}}>
                          <div style={{width:`${(total/50)*100}%`, height:'100%', background:scoreColor, borderRadius:2, transition:'width 0.3s'}} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex gap-3 mt-4">
          {!readonly && (
            <button className="btn btn-ghost btn-lg" style={{flex:1}} onClick={() => { setCurrentIdx(projects.length - 1); setPhase('scoring'); }}>
              ← Back to Scoring
            </button>
          )}
          <button className="btn btn-success btn-lg" style={{flex:2}} onClick={() => readonly ? navigate(-1) : submitRankings()} disabled={!readonly && (rankings.includes(null) || rankings.length === 0)}>
            {readonly ? '← Back to Queue' : '✓ Submit Rankings & Complete Set'}
          </button>
        </div>
      </div>
    );
  }

  // Scoring phase
  const s = getScore(currentProject?.id);

  return (
    <div>
      {readonly && (
        <div className="card mb-4" style={{
          background: isAdminView ? 'rgba(var(--accent-rgb), 0.1)' : 'rgba(255,255,255,0.03)', 
          border: `1px solid ${isAdminView ? 'var(--accent)' : 'var(--border-color)'}`, 
          display:'flex', 
          alignItems:'center', 
          justifyContent:'space-between',
          padding: '12px 16px'
        }}>
          <div>
            <strong style={{color: isAdminView ? 'var(--accent)' : 'var(--text-primary)'}}>
              {isAdminView ? '👀 VIEW ONLY MODE' : '📖 READ ONLY VIEW'}
            </strong>
            <div className="text-sm text-muted">
              {isAdminView ? `Viewing Judge: ${set?.judge?.name}. Actions are disabled.` : 'Click teams to see scores, or jump to rankings to see your final order.'}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>✕ Close</button>
        </div>
      )}
      <div className="flex items-center justify-between" style={{marginBottom:16}}>
        <div>
          <span className="text-sm text-muted">{set.setNumber === 0 ? '🏆 Tie-breaker Round' : `Set ${set.column} • ${getSetRange(set.projects)}`}</span>
          <div style={{fontSize:12,color:'var(--text-muted)'}}>Project {currentIdx + 1} of {projects.length}</div>
        </div>
        <div className={timerClass}>{formatTime(timer)}</div>
      </div>

      {/* Edit mode banner */}
      {isEditing && phase === 'scoring' && !readonly && (
        <div className="card mb-4" style={{borderLeft:'3px solid var(--accent)',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
          <div>
            <strong>✏️ Edit Mode</strong>
            <div className="text-sm text-muted">Click any project below to edit scores, or jump to rankings.</div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={() => setPhase('ranking')}>
              🏆 Edit Rankings
            </button>
            <button className="btn btn-success" onClick={submitAllAndComplete} disabled={rankings.includes(null)}>
              ✓ Save & Complete
            </button>
          </div>
        </div>
      )}

      {/* Project jump nav for edit mode or readonly view */}
      {(isEditing || readonly) && phase === 'scoring' && (
        <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap'}}>
          {projects.map((p, i) => (
            <button
              key={p.id}
              className={`btn btn-sm ${i === currentIdx ? 'btn-primary' : 'btn-ghost'}`}
              style={{fontSize:11,padding:'4px 10px'}}
              onClick={() => setCurrentIdx(i)}
            >
              {p.title}
            </button>
          ))}
        </div>
      )}

      {/* Progress bar */}
      <div style={{display:'flex',gap:4,marginBottom:20}}>
        {projects.map((p, i) => (
          <div key={i} style={{flex:1,height:4,borderRadius:2,background: i < currentIdx ? 'var(--success)' : i === currentIdx ? 'var(--accent)' : 'var(--bg-input)'}} />
        ))}
      </div>

      {/* Project info */}
      <div className="card mb-4">
        <div className="flex items-center gap-2">
          <h2 style={{fontSize:18,marginBottom:4}}>{currentProject?.title}</h2>
          {(currentProject?.status === 'FLAGGED' || flaggedIds.has(currentProject?.id)) && <span className="badge" style={{background:'#ff4444',color:'#fff',fontSize:10}}>🚩 FLAGGED</span>}
        </div>
        <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
          <span className="badge badge-info" style={{fontSize:11}}>Team No: {currentProject?.teamNumber}</span>
          <span className="badge" style={{fontSize:11,background:'var(--bg-input)',color:'var(--text-primary)'}}>👥 {currentProject?.team?.name}</span>
          <span className="badge" style={{fontSize:11,background:'var(--bg-input)',color:'var(--text-primary)'}}>📍 {currentProject?.roomNumber}</span>
          <span className="badge" style={{fontSize:11,background:'var(--bg-input)',color:'var(--text-primary)'}}>👤 Leader: {currentProject?.leaderName}</span>
          <span className="badge" style={{fontSize:11,background:'var(--bg-input)',color:'var(--text-primary)'}}>📞 {currentProject?.team?.phone}</span>
          {set.setNumber === 0 && <span className="badge badge-warning" style={{fontSize:11}}>🏆 TIE-BREAKER ROUND</span>}
        </div>
        {currentProject?.demoLink && <a href={currentProject.demoLink} target="_blank" className="text-sm" style={{color:'var(--accent)',marginTop:8,display:'inline-block'}}>🔗 Demo</a>}
      </div>

      {/* Score sliders */}
      <div className="card mb-4">
        <div className="card-title" style={{marginBottom:16}}>Scores (0-10)</div>
        <div className="score-slider-group">
          {['completion', 'originality', 'learning', 'design', 'technology'].map(field => (
            <div key={field} className="score-row">
              <span className="score-label" style={{textTransform:'capitalize'}}>{field}</span>
              <input type="range" className="score-slider" min="0" max="10" value={s[field]} onChange={e => updateScore(currentProject.id, field, e.target.value)} disabled={readonly} />
              <span className="score-value">{s[field]}</span>
            </div>
          ))}
        </div>
        <div style={{textAlign:'right',marginTop:12,fontSize:18,fontWeight:700,color:'var(--accent)'}}>
          Total: {s.completion + s.originality + s.learning + s.design + s.technology}/50
        </div>
      </div>

      {/* Track nominations */}
      {tracks.length > 0 && (
        <div className="card mb-4">
          <div className="card-title" style={{marginBottom:12}}>Track Nominations (optional)</div>
          <div className="flex gap-2 flex-wrap">
            {tracks.map(t => (
              <span
                key={t.id}
                className={`track-badge ${(nominations[currentProject?.id] || []).includes(t.id) ? 'selected' : ''}`}
                style={{background: `${t.color}20`, color: t.color, cursor: readonly ? 'default' : 'pointer'}}
                onClick={() => !readonly && toggleNomination(currentProject.id, t.id)}
              >
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Feedback */}
      <div className="card mb-4">
        <div className="card-title" style={{marginBottom:8}}>Feedback (optional)</div>
        <textarea
          className="form-textarea"
          placeholder={isAdminView ? "No feedback provided." : "Brief comment for the team..."}
          value={feedback[currentProject?.id] || ''}
          onChange={e => !readonly && setFeedback(prev => ({...prev, [currentProject.id]: e.target.value}))}
          style={{minHeight:60}}
          readOnly={readonly}
        />
      </div>

      {/* Flag */}
      {!readonly && (
        <div style={{marginBottom:16}}>
          {(() => {
            const allFlags = projectFlags[currentProject?.id] || [];
            const myFlag = allFlags.find(f => f.flaggedBy === user?.id);
            const otherFlags = allFlags.filter(f => f.flaggedBy !== user?.id);

            return (
              <>
                {/* My Flag Section */}
                {myFlag ? (
                  (() => {
                    const isOpenOrReviewed = myFlag.status === 'OPEN' || myFlag.status === 'REVIEWED';
                    const isDismissed = myFlag.status === 'DISMISSED';
                    const statusColor = myFlag.status === 'OPEN' ? 'var(--accent)' : myFlag.status === 'REVIEWED' ? 'var(--warning)' : 'var(--success)';
                    const statusEmoji = myFlag.status === 'OPEN' ? '🚩' : myFlag.status === 'REVIEWED' ? '⚠️' : '✅';

                    return (
                      <div style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${statusColor}`,
                        borderRadius: 10,
                        padding: 16,
                        marginBottom: 16
                      }}>
                        <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:12}}>
                          <span style={{fontSize:20}}>{statusEmoji}</span>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:600}}>
                              {myFlag.status === 'OPEN' ? '🚩 My Flag (Open)' : myFlag.status === 'REVIEWED' ? '⚠️ My Flag (Reviewed by Admin)' : '✅ My Flag (Resolved)'}
                            </div>
                            <div className="text-sm text-muted" style={{fontSize:11}}>
                              {myFlag.status === 'OPEN'
                                ? 'Awaiting admin review. You can edit or delete this flag.'
                                : myFlag.status === 'REVIEWED'
                                ? 'Admin has reviewed and confirmed this flag is valid.'
                                : 'This flag has been dismissed. You can raise a new flag if needed.'}
                            </div>
                          </div>
                        </div>

                        {isOpenOrReviewed && (
                          <>
                            <div className="form-group" style={{marginBottom:12}}>
                              <label className="form-label text-sm" style={{marginBottom:4}}>Reason</label>
                              {flagEditMode ? (
                                <>
                                  <textarea
                                    className="form-textarea"
                                    placeholder="Edit the reason..."
                                    value={flagReason}
                                    onChange={e => setFlagReason(e.target.value)}
                                    style={{minHeight:60}}
                                  />
                                  <div className="flex gap-2" style={{marginTop:8}}>
                                    <button className="btn btn-ghost btn-sm" onClick={() => {
                                      setFlagEditMode(false);
                                      setFlagReason('');
                                    }}>Cancel</button>
                                    <button className="btn btn-primary btn-sm" disabled={!flagReason.trim()} onClick={async () => {
                                      try {
                                        await api.put(`/events/${eventId}/flags/${myFlag.id}/edit-reason`, { reason: flagReason });
                                        setProjectFlags(prev => ({
                                          ...prev,
                                          [currentProject.id]: prev[currentProject.id].map(f => 
                                            f.id === myFlag.id ? { ...f, reason: flagReason } : f
                                          )
                                        }));
                                        setFlagEditMode(false);
                                        setFlagReason('');
                                      } catch (err) {
                                        toastError('Failed to update flag: ' + (err.response?.data?.error || err.message));
                                      }
                                    }}>Save Changes</button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="text-sm" style={{background:'rgba(255,255,255,0.05)', padding:10, borderRadius:8, marginBottom:8}}>
                                    {myFlag.reason}
                                  </div>
                                  {myFlag.status === 'OPEN' && (
                                    <div className="flex gap-2">
                                      <button className="btn btn-ghost btn-sm" onClick={() => {
                                        setFlagReason(myFlag.reason);
                                        setFlagEditMode(true);
                                      }}>✏️ Edit</button>
                                      <button className="btn btn-ghost btn-sm" onClick={() => setDeleteFlagId(myFlag.id)}>🗑️ Delete</button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                            {myFlag.adminNotes && (
                              <div className="form-group" style={{marginBottom:12}}>
                                <label className="form-label text-sm" style={{marginBottom:4}}>Admin Notes</label>
                                <div className="text-sm" style={{background:'rgba(255,200,100,0.1)', border:'1px solid rgba(255,200,100,0.3)', padding:10, borderRadius:8, color:'var(--warning)'}}>
                                  {myFlag.adminNotes}
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {isDismissed && (
                          <>
                            <div className="form-group" style={{marginBottom:16}}>
                              <label className="form-label text-sm" style={{marginBottom:4}}>Previous Reason</label>
                              <div className="text-sm" style={{background:'rgba(255,255,255,0.05)', padding:10, borderRadius:8, color:'var(--text-muted)', fontStyle:'italic'}}>
                                {myFlag.reason}
                              </div>
                              {myFlag.adminNotes && (
                                <>
                                  <label className="form-label text-sm" style={{marginTop:12, marginBottom:4}}>Admin Notes</label>
                                  <div className="text-sm" style={{background:'rgba(255,255,255,0.05)', padding:10, borderRadius:8, color:'var(--text-muted)', fontStyle:'italic'}}>
                                    {myFlag.adminNotes}
                                  </div>
                                </>
                              )}
                            </div>
                            <button 
                              className="btn btn-primary btn-sm"
                              onClick={() => {
                                setFlagReason('');
                                setFlagSuccess(false);
                                setFlagEditMode(false);
                                setFlagModal(true);
                              }}
                            >
                              🚩 Raise New Flag
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => { setFlagReason(''); setFlagSuccess(false); setFlagModal(true); }}>🚩 Flag Project</button>
                )}

                {/* Other Judges' Flags Section */}
                {otherFlags.length > 0 && (
                  <div style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    padding: 16,
                    marginTop: 12
                  }}>
                    <div style={{fontWeight:600, marginBottom:12, fontSize:13}}>
                      👥 Flags from Other Judges ({otherFlags.length})
                    </div>
                    {otherFlags.map((flag, idx) => {
                      const statusColor = flag.status === 'OPEN' ? 'var(--accent)' : flag.status === 'REVIEWED' ? 'var(--warning)' : 'var(--success)';
                      const statusEmoji = flag.status === 'OPEN' ? '🚩' : flag.status === 'REVIEWED' ? '⚠️' : '✅';
                      return (
                        <div key={flag.id} style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: `1px solid ${statusColor}`,
                          borderRadius: 8,
                          padding: 12,
                          marginBottom: idx < otherFlags.length - 1 ? 12 : 0
                        }}>
                          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:8}}>
                            <span style={{fontSize:16}}>{statusEmoji}</span>
                            <div>
                              <div style={{fontWeight:600, fontSize:12}}>
                                {flag.creator?.name || 'Unknown Judge'} <span className="text-sm text-muted">({flag.creator?.role || 'JUDGE'})</span>
                              </div>
                              <div className="text-sm text-muted" style={{fontSize:10}}>
                                Status: {flag.status}
                              </div>
                            </div>
                          </div>
                          <div className="text-sm" style={{background:'rgba(255,255,255,0.05)', padding:8, borderRadius:6, fontSize:12}}>
                            {flag.reason}
                          </div>
                          {flag.adminNotes && (
                            <div className="text-sm" style={{background:'rgba(255,200,100,0.1)', border:'1px solid rgba(255,200,100,0.3)', padding:8, borderRadius:6, color:'var(--warning)', marginTop:8, fontSize:11}}>
                              <strong>Admin Notes:</strong> {flag.adminNotes}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Flag Modal */}
      {flagModal && (
        <div style={{position:'fixed',inset:0,zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)'}} onClick={() => setFlagModal(false)} />
          <div style={{position:'relative',background:'var(--bg-card)',border:'1px solid var(--border-color)',borderRadius:'var(--radius-lg)',padding:24,width:'100%',maxWidth:420,boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}}>
            {flagSuccess ? (
              <div style={{textAlign:'center',padding:'20px 0'}}>
                <div style={{fontSize:48,marginBottom:12}}>🚩</div>
                <h3 style={{marginBottom:8}}>Project Flagged</h3>
                <p className="text-sm text-muted">The admin has been notified.</p>
              </div>
            ) : (
              <>
                <h3 style={{marginBottom:4}}>🚩 Flag Project</h3>
                <p className="text-sm text-muted" style={{marginBottom:16}}>Describe why this project should be reviewed by admins.</p>
                <textarea
                  className="form-textarea"
                  placeholder="e.g. Suspected plagiarism, team absent, demo not working..."
                  value={flagReason}
                  onChange={e => setFlagReason(e.target.value)}
                  style={{minHeight:100}}
                  autoFocus
                />
                <div className="flex gap-2" style={{marginTop:16,justifyContent:'flex-end'}}>
                  <button className="btn btn-ghost" onClick={() => setFlagModal(false)}>Cancel</button>
                  <button className="btn btn-primary" disabled={!flagReason.trim()} onClick={async () => {
                    try {
                      const res = await api.post(`/events/${eventId}/flags`, { projectId: currentProject.id, reason: flagReason });
                      setFlaggedIds(prev => new Set([...prev, currentProject.id]));
                      setProjectFlags(prev => {
                        const existing = prev[currentProject.id] || [];
                        // Upsert: replace if exists, otherwise append
                        const myFlagIdx = existing.findIndex(f => f.flaggedBy === user?.id);
                        if (myFlagIdx >= 0) {
                          existing[myFlagIdx] = res.data;
                          return { ...prev, [currentProject.id]: [...existing] };
                        } else {
                          return { ...prev, [currentProject.id]: [...existing, res.data] };
                        }
                      });
                      setFlagSuccess(true);
                      setTimeout(() => setFlagModal(false), 1500);
                    } catch (err) {
                      toastError('Failed to submit flag: ' + (err.response?.data?.error || err.message));
                    }
                  }}>Submit Flag</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete Flag Confirmation Modal */}
      {deleteFlagId && (() => {
        const flagToDelete = (projectFlags[currentProject?.id] || []).find(f => f.id === deleteFlagId);
        return (
          <div className="modal-overlay" onClick={() => setDeleteFlagId(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 400, width: '100%'}}>
              <div style={{height: 3, background: 'linear-gradient(90deg, #ef4444, #dc2626)', borderRadius: 2, marginBottom: 16}}/>
              <div style={{textAlign: 'center', padding: '8px 0 20px'}}>
                <div style={{fontSize: 40, marginBottom: 12}}>⚠️</div>
                <h2 style={{margin: '0 0 8px', fontSize: 18, color: 'var(--text-primary)'}}>Delete Flag?</h2>
                <p style={{margin: 0, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6}}>
                  Are you sure you want to delete this flag?
                  <br/><br/>
                  <strong style={{color: 'var(--text-primary)'}}>{currentProject?.title}</strong>
                  <br/><br/>
                  This action <strong>cannot be undone</strong>.
                </p>
              </div>
              <div style={{display: 'flex', gap: 8, paddingTop: 16, borderTop: '1px solid var(--border-color)'}}>
                <button className="btn btn-ghost" onClick={() => setDeleteFlagId(null)} style={{flex: 1}}>Cancel</button>
                <button className="btn btn-danger" onClick={async () => {
                  try {
                    await api.delete(`/events/${eventId}/flags/${deleteFlagId}`);
                    setProjectFlags(prev => ({
                      ...prev,
                      [currentProject.id]: prev[currentProject.id].filter(f => f.id !== deleteFlagId)
                    }));
                    setFlaggedIds(prev => {
                      const newSet = new Set(prev);
                      const otherFlags = (projectFlags[currentProject.id] || []).filter(f => f.id !== deleteFlagId && f.flaggedBy !== user?.id);
                      // Only remove from flaggedIds if no other active flags remain
                      if (!otherFlags.some(f => f.status === 'OPEN' || f.status === 'REVIEWED')) {
                        newSet.delete(currentProject.id);
                      }
                      return newSet;
                    });
                    setDeleteFlagId(null);
                  } catch (err) {
                    toastError('Failed to delete flag: ' + (err.response?.data?.error || err.message));
                  }
                }} style={{flex: 1}}>
                  🗑 Delete Flag
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="flex gap-3 mt-4">
        {currentIdx > 0 && (
          <button className="btn btn-ghost btn-lg flex-1" onClick={handlePrev}>
            ← Previous
          </button>
        )}
        <button className="btn btn-primary btn-lg" style={{ flex: 2 }} onClick={handleNext}>
          {currentIdx < projects.length - 1 ? 'Next Project →' : readonly ? 'View Ranking →' : 'Finish Scoring → Rank'}
        </button>
      </div>
    </div>
  );
}
