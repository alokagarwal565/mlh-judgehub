import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';

export default function AdminIntegrity() {
  const { error: toastError } = useToast();
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [flags, setFlags] = useState([]);
  const [integrityResults, setIntegrityResults] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get('/events').then(r => { setEvents(r.data); if (r.data.length) setEventId(r.data[0].id); }); }, []);
  useEffect(() => { if (eventId) api.get(`/events/${eventId}/flags`).then(r => setFlags(r.data)).catch(() => {}); }, [eventId]);

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

  return (
    <div>
      <div className="page-header">
        <h1>Integrity Checks</h1>
        <button className="btn btn-primary" onClick={runChecks} disabled={loading}>{loading ? 'Running...' : '🛡️ Run Checks'}</button>
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
        <div className="card-title" style={{marginBottom:16}}>Flags ({flags.length})</div>
        {flags.length === 0 ? (
          <p className="text-sm text-muted">No flags yet</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Project</th><th>Flagged By</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {flags.map(f => (
                  <tr key={f.id}>
                    <td>🚩 {f.project?.title} <span className="text-sm text-muted">(Room No. {f.project?.roomNumber})</span></td>
                    <td>{f.creator?.name} <span className="text-sm text-muted">({f.creator?.role})</span></td>
                    <td style={{fontSize:12,maxWidth:300}}>{f.reason}</td>
                    <td><span className={`badge ${f.status === 'OPEN' ? 'badge-warning' : f.status === 'REVIEWED' ? 'badge-success' : 'badge-info'}`}>{f.status}</span></td>
                    <td>
                      <div className="flex gap-2">
                        {f.status === 'OPEN' && <>
                          <button className="btn btn-success btn-sm" onClick={() => updateFlag(f.id, 'REVIEWED')}>✓</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => updateFlag(f.id, 'DISMISSED')}>✕</button>
                        </>}
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
