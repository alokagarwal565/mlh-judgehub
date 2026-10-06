import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useSocket } from '../../context/SocketContext';
import { useLoader } from '../../context/LoaderContext';
import { useActiveEvent } from '../../context/ActiveEventContext';

export default function EditRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const { info, error: toastError } = useToast();
  const socket = useSocket();
  const { showLoader, hideLoader } = useLoader();
  const { activeEvent } = useActiveEvent();

  const loadRequests = async () => {
    if (loading) showLoader('Loading edit requests...');
    try {
      const res = await api.get('/edit-requests/admin');
      setRequests(res.data);
    } catch (err) {
      toastError('Failed to load edit requests');
    } finally {
      setLoading(false);
      hideLoader();
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleNew = (req) => {
      setRequests(prev => [req, ...prev]);
      info(`New edit request from ${req.judge?.name}`, 'Incoming Request');
    };
    socket.on('edit-request:new', handleNew);
    return () => socket.off('edit-request:new', handleNew);
  }, [socket]);

  const handleAction = async (id, action) => {
    try {
      await api.post(`/edit-requests/${id}/${action}`);
      info(`Request ${action === 'approve' ? 'approved' : 'denied'}`, 'Done');
      loadRequests();
    } catch (err) {
      toastError(`Failed to ${action} request`);
    }
  };

  const getSetRange = (projects) => {
    if (!projects || projects.length === 0) return '';
    const nums = projects.map(p => p.project?.teamNumber).filter(n => n !== undefined && n !== null).sort((a, b) => a - b);
    if (nums.length === 0) return '';
    return `• ${nums[0]} - ${nums[nums.length - 1]}`;
  };

  // Filter and search
  const filteredRequests = requests.filter(req => {
    const searchLower = search.toLowerCase();
    const matchesSearch = search === '' || 
      req.judge?.name?.toLowerCase().includes(searchLower) ||
      req.judge?.email?.toLowerCase().includes(searchLower) ||
      req.set?.event?.name?.toLowerCase().includes(searchLower) ||
      req.reason?.toLowerCase().includes(searchLower);

    const matchesStatus = statusFilter === 'ALL' || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Count requests by status
  const statusCounts = {
    ALL: requests.length,
    PENDING: requests.filter(r => r.status === 'PENDING').length,
    APPROVED: requests.filter(r => r.status === 'APPROVED').length,
    DENIED: requests.filter(r => r.status === 'DENIED').length,
    USED: requests.filter(r => r.status === 'USED').length
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PENDING': return <span className="badge badge-warning">PENDING</span>;
      case 'APPROVED': return <span className="badge badge-success">APPROVED</span>;
      case 'DENIED': return <span className="badge badge-danger">DENIED</span>;
      case 'USED': return <span className="badge badge-info">USED</span>;
      default: return <span className="badge">{status}</span>;
    }
  };

  return (
    <div style={{maxWidth:1200, margin:'0 auto'}}>
      {!activeEvent && (
        <>
          <div className="page-header" style={{alignItems:'flex-end', marginBottom:32}}>
            <div>
              <h1 style={{fontSize:28, fontWeight:800, marginBottom:4}}>Judge Edit Requests</h1>
              <p className="text-muted" style={{fontSize:14}}>Review and manage judge requests for score updates</p>
            </div>
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
            <p style={{margin: 0, color: 'var(--text-secondary)'}}>Please mark an event as Active in the Events page to view edit requests.</p>
          </div>
        </>
      )}

      {!activeEvent ? null : (
        <>
          <div className="page-header" style={{alignItems:'flex-end', marginBottom:16,justifyContent:'space-between'}}>
            <div>
              <h1 style={{fontSize:28, fontWeight:800, marginBottom:4}}>Judge Edit Requests</h1>
              <p className="text-muted" style={{fontSize:14}}>Review and manage judge requests for score updates</p>
            </div>
            <div className="flex gap-2">
              <div style={{position:'relative', width:250}}>
                <span style={{position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', fontSize:14, pointerEvents:'none'}}>🔍</span>
                <input 
                  type="text" 
                  placeholder="Search judges, events, reasons..." 
                  className="form-input" 
                  style={{width:'100%', paddingLeft:32}}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <button className="btn btn-ghost" onClick={loadRequests} style={{borderRadius:10}}>
                <span>🔄</span> Refresh List
              </button>
            </div>
          </div>

          <div className="card" style={{padding:0, border:'1px solid var(--border-light)', overflow:'hidden'}}>
            {/* Status filter pills - Always visible */}
            <div style={{padding:'16px 24px', borderBottom:'1px solid var(--border-color)', display:'flex', gap:8, flexWrap:'wrap'}}>
              {[
                { key:'ALL',       label:'All' },
                { key:'PENDING',   label:'⏳ Pending' },
                { key:'APPROVED',  label:'✅ Approved' },
                { key:'DENIED',    label:'❌ Denied' },
                { key:'USED',      label:'✏️ Used' },
              ].map(f => (
                <button
                  key={f.key}
                  className={`btn btn-sm ${statusFilter === f.key ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setStatusFilter(f.key)}
                >
                  {f.label}
                  {f.key !== 'ALL' && (
                    <span style={{marginLeft:4, opacity:0.7, fontSize:10}}>
                      ({statusCounts[f.key]})
                    </span>
                  )}
                </button>
              ))}
              {search && (
                <span className="text-sm text-muted" style={{fontSize:11, marginLeft:'auto', alignSelf:'center'}}>
                  Showing {filteredRequests.length} of {requests.length} requests
                </span>
              )}
            </div>

            {loading ? (
              <div style={{padding:40}}>
                <div className="skeleton" style={{height: 40, width:'100%', marginBottom:12}} />
                <div className="skeleton" style={{height: 120, width:'100%'}} />
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="empty-state" style={{padding:'80px 20px'}}>
                <div className="empty-state-icon" style={{fontSize:64, marginBottom:20, opacity:0.5}}>📩</div>
                <h3 style={{fontSize:20, fontWeight:700, color:'var(--text-primary)'}}>{search || statusFilter !== 'ALL' ? 'No Matching Requests' : 'No Requests Found'}</h3>
                <p style={{fontSize:14, maxWidth:300, margin:'0 auto'}}>{search || statusFilter !== 'ALL' ? 'Try adjusting your search or filters.' : 'When judges request to edit a completed set, they will appear here for your review.'}</p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="table" style={{borderCollapse:'separate', borderSpacing:0}}>
                  <thead>
                    <tr style={{background:'rgba(255,255,255,0.02)'}}>
                      <th style={{padding:'16px 24px', borderBottom:'1px solid var(--border-color)'}}>Judge</th>
                      <th style={{padding:'16px 24px', borderBottom:'1px solid var(--border-color)'}}>Event & Set</th>
                      <th style={{padding:'16px 24px', borderBottom:'1px solid var(--border-color)'}}>Reason for Request</th>
                      <th style={{padding:'16px 24px', borderBottom:'1px solid var(--border-color)'}}>Submitted</th>
                      <th style={{padding:'16px 24px', borderBottom:'1px solid var(--border-color)'}}>Status</th>
                      <th style={{padding:'16px 24px', borderBottom:'1px solid var(--border-color)', textAlign:'right'}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequests.map(req => (
                      <tr key={req.id} style={{transition:'all 0.2s'}}>
                        <td style={{padding:'20px 24px'}}>
                          <div className="flex items-center gap-3">
                            <div style={{width:36, height:36, borderRadius:12, background:'var(--gradient-primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700}}>
                              {req.judge?.name?.[0].toUpperCase()}
                            </div>
                            <div>
                              <div style={{fontWeight:700, fontSize:14}}>{req.judge?.name}</div>
                              <div style={{fontSize:12, color:'var(--text-muted)'}}>{req.judge?.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{padding:'20px 24px'}}>
                          <div style={{fontSize:13, fontWeight:600}}>{req.set?.event?.name}</div>
                          <div className="badge badge-info" style={{marginTop:4, fontSize:10, borderRadius:6}}>
                            Set {req.set?.column} {getSetRange(req.set?.projects)}
                          </div>
                        </td>
                        <td style={{padding:'20px 24px', maxWidth:350}}>
                          <div style={{
                            fontSize:13, 
                            lineHeight:1.5, 
                            background:'rgba(255,255,255,0.02)', 
                            padding:'10px 14px', 
                            borderRadius:10, 
                            border:'1px solid var(--border-color)',
                            color:'var(--text-secondary)',
                            fontStyle:'italic'
                          }}>
                            "{req.reason}"
                          </div>
                        </td>
                        <td style={{padding:'20px 24px'}}>
                          <div style={{fontSize:12, fontWeight:500}}>{new Date(req.createdAt).toLocaleDateString()}</div>
                          <div style={{fontSize:11, color:'var(--text-muted)'}}>{new Date(req.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                        </td>
                        <td style={{padding:'20px 24px'}}>{getStatusBadge(req.status)}</td>
                        <td style={{padding:'20px 24px', textAlign:'right'}}>
                          {req.status === 'PENDING' ? (
                            <div className="flex gap-2 justify-end">
                              <button className="btn btn-success btn-sm" onClick={() => handleAction(req.id, 'approve')} style={{borderRadius:8, padding:'6px 12px'}}>
                                Approve
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleAction(req.id, 'deny')} style={{borderRadius:8, padding:'6px 12px'}}>
                                Deny
                              </button>
                            </div>
                          ) : (
                            <span style={{fontSize:12, color:'var(--text-muted)', fontWeight:500, paddingRight:8}}>Processed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
