import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import { useLoader } from '../../context/LoaderContext';

export default function AdminAssignments() {
  const { error: toastError, success } = useToast();
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  // Manual assign panel
  const [showAssignPanel, setShowAssignPanel] = useState(false);
  const [idleJudges, setIdleJudges] = useState([]);
  const [selectedJudge, setSelectedJudge] = useState(null);
  const [selectedSet, setSelectedSet] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const navigate = useNavigate();
  const { activeEvent } = useActiveEvent();
  const { showLoader, hideLoader } = useLoader();

  const filterSet = (set) => {
    const q = search.toLowerCase().trim();
    if (statusFilter !== 'ALL' && set.status !== statusFilter) return false;
    if (!q) return true;
    if (set.judge?.name?.toLowerCase().includes(q)) return true;
    if (getSetRange(set.projects).includes(q)) return true;
    return set.projects.some(sp => {
      const name = (sp.project.team?.name || sp.project.title || '').toLowerCase();
      const num = (sp.project.teamNumber || '').toLowerCase();
      return name.includes(q) || num.includes(q);
    });
  };

  useEffect(() => { 
    showLoader('Loading events...');
    api.get('/events').then(r => { 
      setEvents(r.data); 
      if (activeEvent) {
        setEventId(activeEvent.id);

      }
    }).finally(() => hideLoader()); 
  }, [activeEvent]);

  const currentEvent = events.find(e => e.id === eventId);
  const isJudging = currentEvent?.status === 'JUDGING';
  useEffect(() => { if (eventId) loadSets(); }, [eventId]);

  const loadSets = () => { 
    showLoader('Loading assignments...');
    api.get(`/events/${eventId}/assignments`)
      .then(r => setSets(r.data))
      .finally(() => hideLoader());
  };

  const loadIdleJudges = () => {
    if (!eventId) return;
    api.get(`/events/${eventId}/assignments/idle-judges`).then(r => setIdleJudges(r.data));
  };

  const handleManualAssign = async () => {
    if (!selectedJudge || !selectedSet) return;
    setAssigning(true);
    try {
      await api.post(`/events/${eventId}/assignments/manual-assign`, {
        setId: selectedSet.id,
        judgeId: selectedJudge.id
      });
      success(`Set ${getSetRange(selectedSet.projects)} assigned to ${selectedJudge.name}`);
      setSelectedJudge(null);
      setSelectedSet(null);
      loadSets();
      loadIdleJudges();
    } catch (err) {
      toastError(err.response?.data?.error || 'Assignment failed');
    } finally {
      setAssigning(false);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      await api.post(`/events/${eventId}/assignments`);
      loadSets();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to generate assignments');
    } finally {
      setLoading(false);
    }
  };

  const handleEditSet = async (set) => {
    // If completed, reopen first
    if (set.status === 'COMPLETED') {
      try {
        await api.post(`/events/${eventId}/sets/${set.id}/reopen`);
      } catch (err) {
        toastError(err.response?.data?.error || 'Failed to reopen');
        return;
      }
    }
    navigate(`/admin/sets/${set.id}`);
  };

  const columns = [1, 2, 3];

  const getSetRange = (projects) => {
    if (!projects || projects.length === 0) return '';
    const sorted = [...projects].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const firstMatch = sorted[0]?.project?.teamNumber?.match(/\d+/);
    if (!firstMatch) return '';
    const start = parseInt(firstMatch[0]);
    const end = start + sorted.length - 1;
    return `${start} - ${end}`;
  };

  const fmtTime = (s) => {
    if (!s) return null;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${sec}s`;
  };

  return (
    <div>
      {!activeEvent && (
        <>
          <div className="page-header">
            <h1>Assignments</h1>
          </div>
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            background: 'var(--bg-card)',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            marginBottom: '20px'
          }}>
            <h2 style={{margin: '0 0 12px 0', color: 'var(--warning)'}}>⚠️ No Active Event</h2>
            <p style={{margin: 0, color: 'var(--text-secondary)'}}>Please mark an event as Active to manage assignments.</p>
          </div>
        </>
      )}

      {!activeEvent ? null : (
        <>
        <div className="page-header" style={{justifyContent:'space-between',alignItems:'flex-start'}}>
          <h1>Assignments</h1>
          <div className="flex gap-2 items-center">
            {events.length > 1 && (
              <select className="form-input" style={{width:'auto'}} value={eventId} onChange={e => setEventId(e.target.value)}>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            )}
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              {isJudging && (
                <span style={{fontSize:12, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:4}}>
                  🔒 Judging in progress
                </span>
              )}
              <button
                className="btn btn-primary"
                onClick={handleGenerate}
                disabled={loading || isJudging}
                title={isJudging ? 'Cannot regenerate sets while judging is in progress' : ''}
                style={isJudging ? {opacity:0.45, cursor:'not-allowed', filter:'grayscale(0.4)'} : {}}
              >
                {loading ? 'Generating...' : '⚡ Generate Sets'}
              </button>
            </div>
            {/* Manual assign button - only while judging */}
            {isJudging && sets.length > 0 && (
              <button
                className={`btn ${showAssignPanel ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => {
                  setShowAssignPanel(v => !v);
                  if (!showAssignPanel) loadIdleJudges();
                }}
                style={{position:'relative'}}
              >
                👥 Manual Assign
                {idleJudges.filter(j => j.isIdle).length > 0 && (
                  <span style={{position:'absolute', top:-6, right:-6, background:'var(--danger)', color:'#fff', borderRadius:'50%', width:18, height:18, fontSize:10, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700}}>
                    {idleJudges.filter(j => j.isIdle).length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

      {/* ── Manual Assign Panel ─────────────────────────────── */}
      {showAssignPanel && (
        <div className="card" style={{marginBottom:20, padding:0, overflow:'hidden', border:'1px solid var(--accent)', boxShadow:'0 4px 24px rgba(0,0,0,0.2)'}}>
          {/* Panel header */}
          <div style={{padding:'12px 16px', background:'rgba(var(--accent-rgb),0.08)', borderBottom:'1px solid var(--border-light)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <div>
              <strong style={{fontSize:14}}>👥 Manual Assignment</strong>
              <span className="text-sm text-muted" style={{marginLeft:8}}>Select a judge → select a set → click Assign</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowAssignPanel(false); setSelectedJudge(null); setSelectedSet(null); }}>✕ Close</button>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'240px 1fr', minHeight:200}}>

            {/* Left: Judge list */}
            <div style={{borderRight:'1px solid var(--border-light)', padding:12, overflowY:'auto', maxHeight:400}}>
              <div className="text-sm text-muted" style={{marginBottom:8, fontWeight:600, textTransform:'uppercase', fontSize:11, letterSpacing:'0.05em'}}>Judges</div>
              {idleJudges.map(j => (
                <div
                  key={j.id}
                  onClick={() => { setSelectedJudge(j); setSelectedSet(null); }}
                  style={{
                    padding:'8px 10px', borderRadius:8, marginBottom:6, cursor:'pointer',
                    background: selectedJudge?.id === j.id ? 'rgba(var(--accent-rgb),0.15)' : 'var(--bg-secondary)',
                    border: `1px solid ${selectedJudge?.id === j.id ? 'var(--accent)' : 'transparent'}`,
                    opacity: j.isIdle ? 1 : 0.5,
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{display:'flex', alignItems:'center', gap:8, position:'relative'}} className="judge-hover-trigger">
                    <span style={{width:8, height:8, borderRadius:'50%', background: j.isIdle ? 'var(--success)' : 'var(--warning)', flexShrink:0}} />
                    <span style={{fontSize:13, fontWeight:600, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{j.name}</span>
                    <div className="judge-tooltip">
                      <div style={{fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 4, paddingBottom: 2, fontSize: 10, textTransform: 'uppercase', color: 'var(--accent)'}}>
                        Judge Info
                      </div>
                      <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:2}}>
                        <span>📞</span> {j.phone || 'No phone'}
                      </div>
                      <div style={{display:'flex', alignItems:'center', gap:6}}>
                        <span>📍</span> {j.recentLocation ? `Last: ${j.recentLocation}` : 'No history'}
                      </div>
                    </div>
                  </div>
                  <div style={{fontSize:11, color:'var(--text-muted)', marginLeft:16}}>
                    {j.isIdle ? 'Idle' : 'Busy'} · {j.completedSets} done of {j.totalSets}
                  </div>
                </div>
              ))}
            </div>

            {/* Right: Unassigned sets for selected judge */}
            <div style={{padding:12, overflowY:'auto', maxHeight:400}}>
              {!selectedJudge ? (
                <div style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13}}>← Select a judge</div>
              ) : (
                <>
                  <div className="text-sm text-muted" style={{marginBottom:8, fontWeight:600, textTransform:'uppercase', fontSize:11, letterSpacing:'0.05em'}}>Unassigned Sets</div>
                  {(() => {
                    const evalSet = new Set(selectedJudge.evaluatedProjectIds);
                    const unassigned = sets.filter(s => s.status === 'UNASSIGNED');
                    if (unassigned.length === 0) return <div style={{color:'var(--text-muted)', fontSize:13}}>No unassigned sets remaining</div>;
                    return (
                      <div style={{display:'flex', flexDirection:'column', gap:8}}>
                        {unassigned.map(set => {
                          const hasOverlap = set.projects.some(sp => evalSet.has(sp.projectId));
                          const isSelected = selectedSet?.id === set.id;
                          return (
                            <div
                              key={set.id}
                              onClick={() => !hasOverlap && setSelectedSet(isSelected ? null : set)}
                              style={{
                                padding:'8px 12px', borderRadius:8, cursor: hasOverlap ? 'not-allowed' : 'pointer',
                                background: isSelected ? 'rgba(var(--accent-rgb),0.15)' : 'var(--bg-secondary)',
                                border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-light)'}`,
                                opacity: hasOverlap ? 0.4 : 1,
                                transition: 'all 0.15s'
                              }}
                            >
                              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                                <span style={{fontWeight:600, fontSize:13}}>Col {set.column} · {getSetRange(set.projects)}</span>
                                {hasOverlap && <span style={{fontSize:10, color:'var(--danger)', fontWeight:600}}>⚠ Overlap</span>}
                              </div>
                              <div style={{fontSize:11, color:'var(--text-muted)', marginTop:2}}>
                                {set.projects.map(sp => sp.project?.team?.name || sp.project?.title).join(', ')}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>

          {/* Assign action bar */}
          <div style={{padding:'10px 16px', borderTop:'1px solid var(--border-light)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--bg-secondary)'}}>
            <span style={{fontSize:13, color:'var(--text-muted)'}}>
              {selectedJudge && selectedSet
                ? `Assigning Col ${selectedSet.column} · ${getSetRange(selectedSet.projects)} → ${selectedJudge.name}`
                : 'Select a judge and a set to assign'}
            </span>
            <button
              className="btn btn-success"
              disabled={!selectedJudge || !selectedSet || assigning}
              onClick={handleManualAssign}
            >
              {assigning ? 'Assigning…' : '✓ Assign'}
            </button>
          </div>
        </div>
      )}

      {/* Search + filter bar */}
      {sets.length > 0 && (
        <div style={{display:'flex', gap:10, alignItems:'center', marginBottom:16, flexWrap:'wrap'}}>
          <div style={{position:'relative', flex:'1', minWidth:200, maxWidth:360}}>
            <span style={{position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', fontSize:14, pointerEvents:'none'}}>🔍</span>
            <input
              className="form-input"
              style={{paddingLeft:32, width:'100%'}}
              placeholder="Search judge, team, room, range…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:14}}>✕</button>
            )}
          </div>
          {['ALL','IN_PROGRESS','COMPLETED','UNASSIGNED'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding:'5px 12px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer', border:'1px solid',
                background: statusFilter === s ? 'var(--accent)' : 'transparent',
                color: statusFilter === s ? '#fff' : 'var(--text-secondary)',
                borderColor: statusFilter === s ? 'var(--accent)' : 'var(--border-light)',
                transition: 'all 0.15s'
              }}
            >
              {s === 'ALL' ? 'All' : s === 'IN_PROGRESS' ? '⏳ In Progress' : s === 'COMPLETED' ? '✓ Completed' : '○ Unassigned'}
            </button>
          ))}
        </div>
      )}

      {sets.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">🔗</div><h3>No Sets Yet</h3><p>Import teams/judges first, then generate sets</p></div>
      ) : (
        <>
          {/* ── Tie Breaker Section ─────────────────────────── */}
          {sets.some(s => s.setNumber === 0) && (
            <div className="card" style={{marginBottom: 24, border: '1px solid var(--warning)', background: 'rgba(var(--warning-rgb), 0.05)'}}>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
                <h3 style={{fontSize: 16, display:'flex', alignItems:'center', gap:8}}>
                  🏆 Tie Breaker sets (Set #0)
                </h3>
                <span className="badge badge-warning">Action Required</span>
              </div>
              <div style={{display:'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12}}>
                {sets.filter(s => s.setNumber === 0).map(set => (
                  <div key={set.id} className="card" style={{padding: 12, background: 'var(--bg-secondary)', borderLeft: `4px solid ${set.status === 'COMPLETED' ? 'var(--success)' : set.status === 'IN_PROGRESS' ? 'var(--warning)' : 'var(--danger)'}`}}>
                    <div className="flex justify-between items-start mb-2">
                      <div style={{fontWeight: 700, fontSize: 13}}>
                        Tie Breaker @ Pos {set.baseRank || '?'}
                      </div>
                      <span className={`badge ${set.status === 'COMPLETED' ? 'badge-success' : set.status === 'IN_PROGRESS' ? 'badge-warning' : 'badge-danger'}`} style={{fontSize: 9}}>
                        {set.status === 'UNASSIGNED' ? 'PENDING' : set.status}
                      </span>
                    </div>
                    {set.judge ? (
                      <div className="text-xs text-muted mb-2">👨‍⚖️ {set.judge.name}</div>
                    ) : (
                      <div className="text-xs text-danger mb-2">⚠️ No judge assigned</div>
                    )}
                    <div className="text-xs text-muted" style={{lineHeight: 1.4}}>
                      {set.projects.map(sp => sp.project.team?.name || sp.project.title).join(' · ')}
                    </div>
                    {set.status !== 'COMPLETED' && (
                      <button className="btn btn-ghost btn-sm btn-block mt-2" onClick={() => {
                        setSelectedSet(set);
                        loadIdleJudges();
                        setShowAssignPanel(true);
                      }}>
                        Assign Judge
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16, alignItems:'start'}}>
          {columns.map(col => {
            const colSets = sets.filter(s => s.column === col).sort((a, b) => a.setNumber - b.setNumber);
            const filteredSets = colSets.filter(filterSet);
            const completed = filteredSets.filter(s => s.status === 'COMPLETED').length;
            const inProgress = filteredSets.filter(s => s.status === 'IN_PROGRESS').length;
            return (
              <div key={col}>
                {/* Column header */}
                <div style={{
                  background:'var(--bg-secondary)',
                  border:'1px solid var(--border-light)',
                  borderRadius:'var(--radius-md)',
                  padding:'10px 14px',
                  marginBottom:10,
                  display:'flex',
                  alignItems:'center',
                  justifyContent:'space-between'
                }}>
                  <span style={{fontWeight:700, fontSize:14}}>
                    {col === 1 ? '🟢' : col === 2 ? '🔵' : '🟣'} Set {col}
                  </span>
                  <div style={{display:'flex', gap:6, fontSize:12}}>
                    <span style={{color:'var(--text-muted)'}}>
                      {search || statusFilter !== 'ALL' ? `${filteredSets.length}/${colSets.length}` : `${colSets.length}`} blocks
                    </span>
                    {completed > 0 && <span style={{color:'var(--success)', fontWeight:600}}>✓ {completed}</span>}
                    {inProgress > 0 && <span style={{color:'var(--warning)', fontWeight:600}}>⏳ {inProgress}</span>}
                  </div>
                </div>

                {/* Set cards stacked vertically */}
                <div style={{display:'flex', flexDirection:'column', gap:10}}>
                  {filteredSets.length === 0 ? (
                    <div style={{padding:'20px 14px', textAlign:'center', color:'var(--text-muted)', fontSize:13, background:'var(--bg-secondary)', borderRadius:'var(--radius-md)', border:'1px dashed var(--border-light)'}}>
                      No matches
                    </div>
                  ) : filteredSets.map(set => (
                    <div key={set.id} className="card" style={{
                      padding:14,
                      borderLeft:`3px solid ${set.status === 'COMPLETED' ? 'var(--success)' : set.status === 'IN_PROGRESS' ? 'var(--warning)' : 'var(--border-color)'}`
                    }}>
                      <div className="flex items-center justify-between" style={{marginBottom:6}}>
                        <span style={{fontSize:13, fontWeight:600}}>
                          {getSetRange(set.projects)}
                        </span>
                        <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2}}>
                          <span className={`badge ${set.status === 'COMPLETED' ? 'badge-success' : set.status === 'IN_PROGRESS' ? 'badge-warning' : 'badge-info'}`}
                            style={{fontSize:10}}>
                            {set.status}
                          </span>
                          {fmtTime(set.scores?.reduce((s, sc) => s + (sc.timeSpentSeconds || 0), 0)) && (
                            <span style={{fontSize:10, color:'var(--text-muted)'}}
                              title="Total judging time for this set">
                              ⏱ {fmtTime(set.scores.reduce((s, sc) => s + (sc.timeSpentSeconds || 0), 0))}
                            </span>
                          )}
                        </div>
                      </div>
                      {set.judge && (
                        <div 
                          className="text-sm text-muted judge-hover-trigger" 
                          style={{
                            marginBottom: 6, 
                            cursor: 'help', 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: 4,
                            position: 'relative'
                          }}
                        >
                          👨‍⚖️ {set.judge.name}
                          <div className="judge-tooltip">
                            <div style={{fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 4, paddingBottom: 2, fontSize: 10, textTransform: 'uppercase', color: 'var(--accent)'}}>
                              Judge Info
                            </div>
                            <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:2}}>
                              <span>📞</span> {set.judge.phone || 'No phone'}
                            </div>
                            <div style={{display:'flex', alignItems:'center', gap:6}}>
                              <span>📍</span> {set.recentLocation || 'No location'}
                            </div>
                          </div>
                        </div>
                      )}
                      <div style={{fontSize:11, color:'var(--text-muted)', lineHeight:1.6}}>
                        {set.projects.map(sp => {
                          const name = sp.project.team?.name || sp.project.title;
                          const num = sp.project.teamNumber;
                          return num ? `${name} (${num})` : name;
                        }).join(' · ')}
                      </div>
                      {(set.status === 'COMPLETED' || set.status === 'IN_PROGRESS') && set.judgeId && (
                        <button className="btn btn-ghost btn-sm mt-2" onClick={() => navigate(`/admin/view-judge/${set.judgeId}/score/${set.id}`)}>
                          👁 View
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </>
    )}
      </>
    )}
  </div>
);
}
