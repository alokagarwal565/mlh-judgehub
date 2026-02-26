import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import { useLoader } from '../../context/LoaderContext';

export default function AdminSetDetail() {
  const { setId } = useParams();
  const navigate = useNavigate();
  const { error: toastError } = useToast();
  const { activeEvent } = useActiveEvent();
  const { showLoader, hideLoader } = useLoader();

  // Compute the linear range label for a set
  const getSetRange = (projects) => {
    if (!projects || projects.length === 0) return '';
    const sorted = [...projects].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const m = sorted[0]?.project?.teamNumber?.match(/\d+/);
    if (!m) return '';
    const start = parseInt(m[0]);
    return `${start} – ${start + sorted.length - 1}`;
  };
  const [eventId, setEventId] = useState('');
  const [set, setSet] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [scores, setScores] = useState({});
  const [feedback, setFeedback] = useState({});
  const [nominations, setNominations] = useState({});
  const [rankings, setRankings] = useState([null, null, null]);
  const [phase, setPhase] = useState('scoring');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    showLoader('Loading set details...');
    api.get('/events').then(r => {
      const ev = activeEvent || r.data[0];
      if (ev) {
        setEventId(ev.id);
        api.get(`/events/${ev.id}/sets/${setId}`).then(r => {
          setSet(r.data);
          const existingScores = {};
          const existingFeedback = {};
          const existingNoms = {};
          for (const s of r.data.scores || []) {
            existingScores[s.projectId] = {
              completion: s.completion, originality: s.originality,
              learning: s.learning, design: s.design, technology: s.technology
            };
          }
          for (const f of r.data.feedback || []) {
            existingFeedback[f.projectId] = f.comment;
          }
          for (const n of r.data.nominations || []) {
            if (!existingNoms[n.projectId]) existingNoms[n.projectId] = [];
            existingNoms[n.projectId].push(n.trackId);
          }
          setScores(existingScores);
          setFeedback(existingFeedback);
          setNominations(existingNoms);

          if (r.data.stackRankVotes?.length >= 3) {
            const sortedVotes = [...r.data.stackRankVotes].sort((a, b) => a.rank - b.rank);
            setRankings(sortedVotes.map(v => v.projectId));
          hideLoader();
          }
        });
        api.get(`/events/${ev.id}/tracks`).then(r => setTracks(r.data));
      }
    });
  }, [setId]);

  const projects = set?.projects?.map(sp => sp.project) || [];
  const currentProject = projects[currentIdx];

  const getScore = (projectId) => scores[projectId] || { completion: 5, originality: 5, learning: 5, design: 5, technology: 5 };

  const updateScore = (projectId, field, value) => {
    setScores(prev => ({
      ...prev,
      [projectId]: { ...getScore(projectId), [field]: parseInt(value) }
    }));
  };

  const submitScore = async (projectId) => {
    const s = getScore(projectId);
    await api.post(`/events/${eventId}/sets/${setId}/scores`, { projectId, ...s });
    if (feedback[projectId]) {
      await api.post(`/events/${eventId}/sets/${setId}/feedback`, { projectId, comment: feedback[projectId] });
    }
    const noms = nominations[projectId];
    if (noms && noms.length > 0) {
      await api.post(`/events/${eventId}/sets/${setId}/nominate`, { projectId, trackIds: noms });
    }
  };

  const handleNext = async () => {
    if (!currentProject) return;
    setSaving(true);
    await submitScore(currentProject.id);
    setSaving(false);
    if (currentIdx < projects.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      setPhase('ranking');
    }
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
      const existingIdx = newR.indexOf(projectId);
      if (existingIdx !== -1) newR[existingIdx] = null;
      newR[rank] = projectId;
      return newR;
    });
  };

  const submitRankings = async () => {
    if (rankings.includes(null)) {
      toastError('Please rank all top positions before saving.');
      return;
    }
    setSaving(true);
    const data = rankings.map((projectId, i) => ({ projectId, rank: i + 1 }));
    await api.post(`/events/${eventId}/sets/${setId}/rank`, { rankings: data });
    // Re-complete the set
    await api.post(`/events/${eventId}/sets/${setId}/complete`);
    setSaving(false);
    setPhase('done');
    setTimeout(() => navigate('/admin/assignments'), 1500);
  };

  if (!set) return <div className="text-center mt-4"><div className="skeleton" style={{width:200,height:100,margin:'40px auto'}}/></div>;

  if (phase === 'done') {
    return (
      <div style={{textAlign:'center',padding:'60px 20px'}}>
        <div style={{fontSize:64,marginBottom:16}}>✅</div>
        <h2>Set Saved!</h2>
        <p className="text-muted">Redirecting to assignments...</p>
      </div>
    );
  }

  const s = currentProject ? getScore(currentProject.id) : {};

  return (
    <div>
      <div className="page-header">
        <h1>Set {set.column} • {getSetRange(set.projects)}</h1>
        <span className="badge badge-info">Judge: {set.judge?.name || 'Unassigned'}</span>
      </div>

      {phase === 'ranking' ? (
        <div>
          <h3 style={{marginBottom:16}}>Rank Your Top 3</h3>
          {(() => {
            const getTotalScore = (projectId) => {
              const sc = scores[projectId];
              if (!sc) return null;
              return (sc.completion||0)+(sc.originality||0)+(sc.learning||0)+(sc.design||0)+(sc.technology||0);
            };
            const sortedProjects = [...projects].sort((a, b) => (getTotalScore(b.id)??-1) - (getTotalScore(a.id)??-1));
            return [0, 1, 2].map(rank => (
              <div key={rank} style={{marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--text-secondary)',marginBottom:8}}>
                  {['🥇 1st Place (3 pts)', '🥈 2nd Place (2 pts)', '🥉 3rd Place (1 pt)'][rank]}
                </div>
                <div style={{display:'grid',gap:8}}>
                  {sortedProjects.map(p => {
                    const total = getTotalScore(p.id);
                    const scoreColor = total === null ? 'var(--text-muted)' : total >= 40 ? 'var(--success)' : total >= 25 ? 'var(--warning)' : 'var(--danger)';
                    return (
                      <div
                        key={p.id}
                        className={`rank-card ${rankings[rank] === p.id ? `rank-${rank+1}` : ''}`}
                        onClick={() => setRanking(rank, p.id)}
                        style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}
                      >
                        <div style={{display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0}}>
                          <div className="rank-badge">{rankings[rank] === p.id ? rank + 1 : '·'}</div>
                          <div style={{minWidth:0}}>
                            <strong style={{fontSize:14, display:'block', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p.title}</strong>
                            <div className="text-sm text-muted">{p.team?.name}</div>
                          </div>
                        </div>
                        <div style={{flexShrink:0, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2}}>
                          {total !== null ? (
                            <span style={{fontWeight:800, fontSize:16, color:scoreColor, lineHeight:1}}>{total}<span style={{fontSize:11, fontWeight:500, color:'var(--text-muted)'}}>/ 50</span></span>
                          ) : <span style={{fontSize:11, color:'var(--text-muted)'}}>—</span>}
                          {total !== null && (
                            <div style={{width:48, height:4, borderRadius:2, background:'var(--bg-input)', overflow:'hidden'}}>
                              <div style={{width:`${(total/50)*100}%`, height:'100%', background:scoreColor, borderRadius:2}} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
          <button className="btn btn-success btn-lg btn-block mt-4" onClick={submitRankings} disabled={rankings.includes(null) || saving}>
            {saving ? 'Saving...' : '✓ Save Rankings & Complete Set'}
          </button>
        </div>
      ) : (
        <div>
          {/* Progress */}
          <div style={{display:'flex',gap:4,marginBottom:20}}>
            {projects.map((p, i) => (
              <div key={i} style={{flex:1,height:4,borderRadius:2,background: i < currentIdx ? 'var(--success)' : i === currentIdx ? 'var(--accent)' : 'var(--bg-input)'}} />
            ))}
          </div>

          <div className="text-sm text-muted mb-4">Project {currentIdx + 1} of {projects.length}</div>

          {/* Project info */}
          <div className="card mb-4">
            <h2 style={{fontSize:18,marginBottom:4}}>{currentProject?.title}</h2>
            <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
              <span className="badge badge-info" style={{fontSize:11}}>Team: {currentProject?.team?.teamNumber}</span>
              <span className="badge" style={{fontSize:11,background:'var(--bg-input)',color:'var(--text-primary)'}}>👥 {currentProject?.team?.name}</span>
              <span className="badge" style={{fontSize:11,background:'var(--bg-input)',color:'var(--text-primary)'}}>📍 {currentProject?.team?.roomNumber}</span>
            </div>
          </div>

          {/* Score sliders */}
          <div className="card mb-4">
            <div className="card-title" style={{marginBottom:16}}>Scores (0-10)</div>
            <div className="score-slider-group">
              {['completion', 'originality', 'learning', 'design', 'technology'].map(field => (
                <div key={field} className="score-row">
                  <span className="score-label" style={{textTransform:'capitalize'}}>{field}</span>
                  <input type="range" className="score-slider" min="0" max="10" value={s[field] ?? 5} onChange={e => updateScore(currentProject.id, field, e.target.value)} />
                  <span className="score-value">{s[field] ?? 5}</span>
                </div>
              ))}
            </div>
            <div style={{textAlign:'right',marginTop:12,fontSize:18,fontWeight:700,color:'var(--accent)'}}>
              Total: {(s.completion || 0) + (s.originality || 0) + (s.learning || 0) + (s.design || 0) + (s.technology || 0)}/50
            </div>
          </div>

          {/* Track nominations */}
          {tracks.length > 0 && (
            <div className="card mb-4">
              <div className="card-title" style={{marginBottom:12}}>Track Nominations</div>
              <div className="flex gap-2 flex-wrap">
                {tracks.map(t => (
                  <span
                    key={t.id}
                    className={`track-badge ${(nominations[currentProject?.id] || []).includes(t.id) ? 'selected' : ''}`}
                    style={{background: `${t.color}20`, color: t.color}}
                    onClick={() => toggleNomination(currentProject.id, t.id)}
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Feedback */}
          <div className="card mb-4">
            <div className="card-title" style={{marginBottom:8}}>Feedback</div>
            <textarea
              className="form-textarea"
              placeholder="Admin notes..."
              value={feedback[currentProject?.id] || ''}
              onChange={e => setFeedback(prev => ({...prev, [currentProject.id]: e.target.value}))}
              style={{minHeight:60}}
            />
          </div>

          <button className="btn btn-primary btn-lg btn-block" onClick={handleNext} disabled={saving}>
            {saving ? 'Saving...' : currentIdx < projects.length - 1 ? 'Next Project →' : 'Finish → Rankings'}
          </button>
        </div>
      )}
    </div>
  );
}
