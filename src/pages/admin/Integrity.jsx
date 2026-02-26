import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import { useLoader } from '../../context/LoaderContext';

export default function AdminIntegrity() {
  const { error: toastError } = useToast();
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [flags, setFlags] = useState([]);
  const [integrityResults, setIntegrityResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const { activeEvent } = useActiveEvent();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const { showLoader, hideLoader } = useLoader();

  useEffect(() => { 
    showLoader('Loading events...');
    api.get('/events').then(r => { 
      setEvents(r.data); 
      if (activeEvent) {
        setEventId(activeEvent.id);
      } else if (r.data.length && !eventId) {
        setEventId(r.data[0].id);
      }
    }).finally(() => hideLoader()); 
  }, [activeEvent]);
  useEffect(() => { 
    if (eventId) {
      showLoader('Loading flags...');
      api.get(`/events/${eventId}/flags`)
        .then(r => setFlags(r.data))
        .catch(() => {})
        .finally(() => hideLoader());
    }
  }, [eventId]);

  const runChecks = async () => {
    setLoading(true);
    try {
      const res = await api.post(`/events/${eventId}/integrity-check`);
      setIntegrityResults(res.data);
      api.get(`/events/${eventId}/flags`).then(r => setFlags(r.data));
    } catch (err) { toastError('Integrity check failed'); }
    finally { setLoading(false); }
  };

  const updateFlag = async (flagId, status) => {
    await api.put(`/events/${eventId}/flags/${flagId}`, { status });
    setFlags(flags.map(f => f.id === flagId ? {...f, status} : f));
  };

  // Filter and search
  const filteredFlags = flags.filter(f => {
    const searchLower = search.toLowerCase();
    const matchesSearch = search === '' || 
      f.project?.title?.toLowerCase().includes(searchLower) ||
      f.project?.team?.name?.toLowerCase().includes(searchLower) ||
      f.project?.teamNumber?.toString().includes(search) ||
      f.project?.roomNumber?.toString().includes(search) ||
      f.project?.roomNumber?.toLowerCase().includes(searchLower) ||
      f.reason?.toLowerCase().includes(searchLower) ||
      f.creator?.name?.toLowerCase().includes(searchLower);

    const matchesStatus = statusFilter === 'ALL' || f.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Count flags by status and severity
  const statusCounts = {
    ALL: flags.length,
    OPEN: flags.filter(f => f.status === 'OPEN').length,
    REVIEWED: flags.filter(f => f.status === 'REVIEWED').length,
    DISMISSED: flags.filter(f => f.status === 'DISMISSED').length
  };

  return (
    <div>
      <div className="page-header">
        <h1>Integrity Checks</h1>
        <div className="flex gap-2">
          <div style={{position:'relative', width:250}}>
            <span style={{position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', fontSize:14, pointerEvents:'none'}}>🔍</span>
            <input 
              type="text" 
              placeholder="Search projects, teams, reasons..." 
              className="form-input" 
              style={{width:'100%', paddingLeft:32}}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={runChecks} disabled={loading}>{loading ? 'Running...' : '🛡️ Run Checks'}</button>
        </div>
      </div>

      {integrityResults && (
        <div className="card mb-4" style={{borderLeft:'3px solid var(--warning)'}}>
          <div className="card-title">Scan Results: {integrityResults.total} issue(s) found</div>
          <div style={{marginTop:12}}>
            {integrityResults.flags.map((f, i) => (
              <div key={i} style={{padding:'8px 0',borderBottom:'1px solid var(--border-color)',fontSize:13}}>
                <span className={`badge ${f.severity === 'HIGH' ? 'badge-danger' : f.severity === 'MEDIUM' ? 'badge-warning' : 'badge-info'}`} style={{marginRight:8}}>{f.severity}</span>
                <strong>{f.type}</strong>: {f.details}
              </div>
            ))}
            {integrityResults.total === 0 && <p className="text-sm text-muted">✅ No anomalies detected</p>}
          </div>
        </div>
      )}

      <div className="card">
        <div style={{marginBottom:16}}>
          <div className="card-title" style={{marginBottom:12}}>Flags ({filteredFlags.length})</div>
          
          {/* Status filter pills */}
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            {[
              { key:'ALL',       label:'All' },
              { key:'OPEN',      label:'🔴 Open' },
              { key:'REVIEWED',  label:'🟢 Reviewed' },
              { key:'DISMISSED', label:'⚪ Dismissed' },
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
          </div>
        </div>

        {filteredFlags.length === 0 ? (
          <p className="text-sm text-muted">{search || statusFilter !== 'ALL' ? 'No flags match your filters' : 'No flags yet'}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Project</th><th>Team</th><th>Team No</th><th>Room</th><th>Flagged By</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredFlags.map(f => (
                  <tr key={f.id}>
                    <td>{(f.status === 'OPEN' || f.status === 'REVIEWED') ? '🚩 ' : ''}{f.project?.title}</td>
                    <td style={{fontWeight:600}}>{f.project?.team?.name || '—'}</td>
                    <td>{f.project?.teamNumber || '—'}</td>
                    <td>{f.project?.roomNumber || '—'}</td>
                    <td>{f.creator?.name} <span className="text-sm text-muted">({f.creator?.role})</span></td>
                    <td style={{fontSize:12,maxWidth:300}}>{f.reason}</td>
                    <td><span className={`badge ${f.status === 'OPEN' ? 'badge-warning' : f.status === 'REVIEWED' ? 'badge-success' : 'badge-info'}`}>{f.status}</span></td>
                    <td>
                      <div className="flex gap-2" style={{alignItems: 'center', flexWrap: 'wrap'}}>
                        {f.status === 'OPEN' && (
                          <>
                            <button className="btn btn-success btn-sm" onClick={() => updateFlag(f.id, 'REVIEWED')} title="Mark as Reviewed">✓ Review</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => updateFlag(f.id, 'DISMISSED')} title="Dismiss flag">✕ Dismiss</button>
                          </>
                        )}
                        {f.status === 'REVIEWED' && (
                          <>
                            <button className="btn btn-info btn-sm" onClick={() => updateFlag(f.id, 'OPEN')} title="Reopen flag">⟲ Reopen</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => updateFlag(f.id, 'DISMISSED')} title="Dismiss flag">✕ Dismiss</button>
                          </>
                        )}
                        {f.status === 'DISMISSED' && (
                          <>
                            <button className="btn btn-warning btn-sm" onClick={() => updateFlag(f.id, 'OPEN')} title="Reopen flag">⟲ Reopen</button>
                            <button className="btn btn-info btn-sm" onClick={() => updateFlag(f.id, 'REVIEWED')} title="Mark as Reviewed">✓ Review</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
