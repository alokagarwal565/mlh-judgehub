import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useSocket } from '../../context/SocketContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import Pagination, { usePagination } from '../../components/Pagination';

export default function AdminProjects() {
  const { success, error: toastError } = useToast();
  const socket = useSocket();
  const [events, setEvents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [eventId, setEventId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const { activeEvent } = useActiveEvent();
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [deletingProject, setDeletingProject] = useState(null); // null | id
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [formData, setFormData] = useState({
    title: '', teamName: '', teamNumber: '', 
    roomNumber: '', leaderName: '', phone: '', email: '', password: '', status: 'SUBMITTED'
  });

  const fetchProjects = () => {
    if (eventId) api.get(`/events/${eventId}/projects`).then(r => setProjects(r.data));
  };

  useEffect(() => { 
    api.get('/events').then(r => { 
      setEvents(r.data); 
      // Default to active event if available, else first event
      if (activeEvent) {
        setEventId(activeEvent.id);
      } else if (r.data.length && !eventId) {
        setEventId(r.data[0].id);
      }
    }); 
  }, [activeEvent]);

  useEffect(() => { fetchProjects(); }, [eventId]);

  // Socket: Refresh projects when a flag is updated
  useEffect(() => {
    if (!socket || !eventId) return;
    
    const handler = (data) => {
      if (data.eventId === eventId) {
        fetchProjects();
      }
    };

    socket.on('flag:updated', handler);
    socket.on('flag:created', handler);
    return () => {
      socket.off('flag:updated', handler);
      socket.off('flag:created', handler);
    };
  }, [socket, eventId]);

  const [selectedDetails, setSelectedDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

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

  const filteredProjects = projects.filter(p => {
    if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      p.title.toLowerCase().includes(q) ||
      p.team?.name.toLowerCase().includes(q) ||
      p.teamNumber?.toLowerCase().includes(q) ||
      p.leaderName?.toLowerCase().includes(q) ||
      p.team?.phone?.toLowerCase().includes(q) ||
      p.roomNumber?.toLowerCase().includes(q)
    );
  });

  // Reset page on filter/search change
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const { paged: pagedProjects, totalPages, total } = usePagination(filteredProjects, page, perPage);

  const handleOpenModal = (proj = null) => {
    if (proj) {
      setEditingProject(proj);
      setFormData({
        title: proj.title,
        teamName: proj.team?.name || '',
        teamNumber: proj.teamNumber || '',
        roomNumber: proj.roomNumber || '',
        leaderName: proj.leaderName || '',
        phone: proj.team?.phone || '',
        email: proj.team?.email || '',
        password: '',
        status: proj.status
      });
    } else {
      setEditingProject(null);
      setFormData({
        title: '', teamName: '', teamNumber: '', 
        roomNumber: '', leaderName: '', phone: '', email: '', password: '', status: 'SUBMITTED'
      });
    }
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingProject) {
        await api.put(`/events/${eventId}/projects/${editingProject.id}`, formData);
      } else {
        await api.post(`/events/${eventId}/projects`, formData);
      }
      setShowModal(false);
      fetchProjects();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to save project');
    }
  };

  const confirmDelete = async () => {
    if (!deletingProject) return;
    try {
      await api.delete(`/events/${eventId}/projects/${deletingProject}`);
      success('Project and associated team data removed');
      setDeletingProject(null);
      fetchProjects();
    } catch (err) {
      toastError('Failed to delete project');
    }
  };

  const handleDelete = (id) => {
    setDeletingProject(id);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Projects</h1>
        <div className="flex gap-2">
          <div style={{position:'relative', width:250}}>
            <span style={{position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', fontSize:14, pointerEvents:'none'}}>🔍</span>
            <input 
              type="text" 
              placeholder="Search teams, projects, leaders..." 
              className="form-input" 
              style={{width:'100%', paddingLeft:32}}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={() => handleOpenModal()}>+ Add Project</button>
          <span className="badge badge-info">{filteredProjects.length} teams</span>
        </div>
      </div>

      {/* Status filter pills */}
      <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:16}}>
        {[
          { key:'ALL',              label:'All' },
          { key:'SUBMITTED',        label:'Submitted' },
          { key:'IN_JUDGING',       label:'Judging Started' },
          { key:'JUDGING_COMPLETE', label:'Judging Completed' },
          { key:'FLAGGED',          label:'🚩 Flagged' },
          { key:'SCORED',           label:'Scored' },
        ].map(f => (
          <button
            key={f.key}
            className={`btn btn-sm ${statusFilter === f.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setStatusFilter(f.key)}
          >
            {f.label}
            {f.key !== 'ALL' && (
              <span style={{marginLeft:4, opacity:0.7, fontSize:10}}>
                ({projects.filter(p => p.status === f.key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Room No.</th><th>Team No</th><th>Team</th><th>Leader</th><th>Phone</th><th>Project</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {pagedProjects.map(p => (
              <tr key={p.id} style={{cursor:'pointer'}} onClick={() => handleShowDetails(p.id)}>
                <td><strong>{p.roomNumber}</strong></td>
                <td>{p.teamNumber}</td>
                <td>{p.team?.name}</td>
                <td style={{fontSize:12}}>{p.leaderName || '—'}</td>
                <td className="text-muted" style={{fontSize:12}}>{p.team?.phone || '—'}</td>
                <td>{p.title} {p.status === 'FLAGGED' && <span style={{color:'#ff4444'}}>🚩</span>}</td>
                <td><span className={`badge ${
                  p.status === 'SCORED'            ? 'badge-success' :
                  p.status === 'FLAGGED'           ? 'badge-danger'  :
                  p.status === 'JUDGING_COMPLETE'  ? 'badge-info'    :
                  p.status === 'IN_JUDGING'        ? 'badge-warning' :
                  'badge-info'
                }`}>{{
                  SUBMITTED:        'Submitted',
                  UNDER_REVIEW:     'Under Review',
                  IN_JUDGING:       'Judging Started',
                  JUDGING_COMPLETE: 'Judging Completed',
                  FLAGGED:          'Flagged',
                  SCORED:           'Scored'
                }[p.status] || p.status}</span></td>
                <td onClick={e => e.stopPropagation()}>
                  <div className="flex gap-2">
                    <button className="btn btn-ghost btn-sm" style={{color:'var(--accent)'}} onClick={() => handleOpenModal(p)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" style={{color:'var(--danger)'}} onClick={() => handleDelete(p.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}

          </tbody>
        </table>
      </div>

      <Pagination
        page={page} totalPages={totalPages} total={total}
        perPage={perPage} onPageChange={setPage} onPerPageChange={setPerPage}
      />

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" style={{maxWidth:600}} onClick={e => e.stopPropagation()}>
            <h2>{editingProject ? 'Edit Project' : 'Add New Project/Team'}</h2>
            <form onSubmit={handleSave} className="grid grid-cols-2 gap-4 mt-4">
              <div className="col-span-2"><h3 style={{fontSize:14,color:'var(--accent)',borderBottom:'1px solid var(--border-color)',paddingBottom:4}}>Project Info</h3></div>
              <div className="form-group">
                <label className="form-label">Project Title</label>
                <input type="text" className="form-input" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Room No.</label>
                <input type="text" className="form-input" value={formData.roomNumber} onChange={e => setFormData({...formData, roomNumber: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-input" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="UNDER_REVIEW">Under Review</option>
                  <option value="IN_JUDGING">Judging Started</option>
                  <option value="JUDGING_COMPLETE">Judging Completed</option>
                  <option value="FLAGGED">Flagged</option>
                  <option value="SCORED">Scored</option>
                </select>
              </div>

              <div className="col-span-2 mt-2"><h3 style={{fontSize:14,color:'var(--accent)',borderBottom:'1px solid var(--border-color)',paddingBottom:4}}>Team User Info</h3></div>
              <div className="form-group">
                <label className="form-label">Team Name</label>
                <input type="text" className="form-input" value={formData.teamName} onChange={e => setFormData({...formData, teamName: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Team Number</label>
                <input type="text" className="form-input" value={formData.teamNumber} onChange={e => setFormData({...formData, teamNumber: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Email (Login)</label>
                <input type="email" className="form-input" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Leader Name</label>
                <input type="text" className="form-input" value={formData.leaderName} onChange={e => setFormData({...formData, leaderName: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input type="text" className="form-input" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} required />
              </div>
              
              {!editingProject && (
                <div className="form-group">
                  <label className="form-label">Password (Optional)</label>
                  <input type="text" className="form-input" placeholder="Random if empty" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                </div>
              )}

              <div className="col-span-2 flex gap-2 mt-4">
                <button type="submit" className="btn btn-primary flex-1">Save Project & Team</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
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
            {/* ... modal content ... */}
            <div className="grid gap-6">
              {selectedDetails.length === 0 ? (
                <div className="empty-state" style={{padding:'40px 20px'}}>
                  <div style={{fontSize:40, marginBottom:16}}>🔗</div>
                  <h3>No Assignments Yet</h3>
                  <p className="text-muted">This project has not been assigned to any judging sets yet. Generate sets in the Assignments tab to start the judging process.</p>
                </div>
              ) : (
                selectedDetails.sort((a, b) => (b.set.status === 'COMPLETED' ? 1 : 0) - (a.set.status === 'COMPLETED' ? 1 : 0)).reverse().map((ev, idx) => {
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
                            {(() => {
                               const getRange = (pts) => {
                                 if (!pts) return '';
                                 const sorted = [...pts].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                                 const m = sorted[0]?.project?.teamNumber?.match(/\d+/);
                                 if (!m) return '';
                                 const start = parseInt(m[0]);
                                 return `${start} - ${start + sorted.length - 1}`;
                               };
                               return ev.set.setNumber === 0 ? '🏆 Tie-breaker round' : `Set ${ev.set.column} • ${getRange(ev.set.projects)}`;
                            })()}
                          </div>
                        </div>
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
                          {feedback && (
                            <div style={{background:'rgba(255, 255, 255, 0.03)', padding:12, borderRadius:8, fontSize:13, border:'1px solid var(--border-color)', marginBottom:12}}>
                              <span style={{color:'var(--text-muted)', fontWeight:600, marginRight:6}}>COMMENT:</span>
                              {feedback.comment}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center py-4 text-sm text-muted" style={{fontStyle:'italic'}}>
                          {ev.set.judgeId ? 'Judge is currently evaluating this set.' : 'Judge has not started evaluating this set yet.'}
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

      {/* ── Delete Confirm Modal ──────────────────────────── */}
      {deletingProject && (
        <div className="modal-overlay" onClick={() => setDeletingProject(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 400, width: '100%'}}>
            <div style={{height: 3, background: 'linear-gradient(90deg, #ef4444, #dc2626)', borderRadius: 2, marginBottom: 16}}/>
            <div style={{textAlign: 'center', padding: '8px 0 20px'}}>
              <div style={{fontSize: 40, marginBottom: 12}}>⚠️</div>
              <h2 style={{margin: '0 0 8px', fontSize: 18, color: 'var(--text-primary)'}}>Delete Project?</h2>
              <p style={{margin: 0, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6}}>
                You're about to delete <strong style={{color: 'var(--text-primary)'}}>{projects.find(p => p.id === deletingProject)?.title}</strong>.
                <br/><br/>
                All associated <strong>judging progress</strong> and the <strong>team account</strong> (if unique to this event) will be permanently removed.
                <br/><br/>
                This action <strong>cannot be undone</strong>.
              </p>
            </div>
            <div style={{display: 'flex', gap: 8, paddingTop: 16, borderTop: '1px solid var(--border-color)'}}>
              <button className="btn btn-ghost" onClick={() => setDeletingProject(null)} style={{flex: 1}}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete} style={{flex: 1}}>
                🗑 Delete Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
