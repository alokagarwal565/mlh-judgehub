import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import { useLoader } from '../../context/LoaderContext';

export default function AdminImportTeams() {
  const { error: toastError } = useToast();
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [csv, setCsv] = useState('team_name,team_number,room_number,team_leader,team_phone\n');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const { activeEvent } = useActiveEvent();
  const { showLoader, hideLoader } = useLoader();

  useEffect(() => { 
    showLoader('Loading events...');
    api.get('/events').then(r => { 
      setEvents(r.data); 
      if (activeEvent) {
        setEventId(activeEvent.id);
      }
    }).finally(() => hideLoader()); 
  }, [activeEvent]);

  const handleImport = async () => {
    setLoading(true);
    try {
      const res = await api.post(`/events/${eventId}/projects/import`, { csvData: csv });
      setResult(res.data);
    } catch (err) {
      toastError(err.response?.data?.error || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsv(ev.target.result);
    reader.readAsText(file);
  };

  const downloadCreds = () => {
    if (!result) return;
    const header = 'Team Name,Team Number,Leader,Phone,Email,Password\n';
    const rows = result.credentials.map(c => `"${c.teamName}","${c.teamNumber}","${c.leaderName}","${c.phone}","${c.email}","${c.password}"`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'team_credentials.csv'; a.click();
  };

  return (
    <div>
      <div className="page-header"><h1>Import Teams</h1></div>

      {!activeEvent && (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          background: 'var(--bg-card)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          marginBottom: '20px'
        }}>
          <h2 style={{margin: '0 0 12px 0', color: 'var(--warning)'}}>⚠️ No Active Event</h2>
          <p style={{margin: 0, color: 'var(--text-secondary)'}}>Please mark an event as Active in the Events page to proceed.</p>
        </div>
      )}

      {!activeEvent ? null : (
        <>
          <div className="card mb-4">
            <p className="text-sm text-muted mb-4">Select a CSV file or paste data with columns: <strong>team_name, team_number, room_number, team_leader, team_phone</strong>. Each row creates a team account + project stub with auto-generated login credentials.</p>
            <div className="form-group">
              <label className="form-label">Upload CSV File</label>
              <input type="file" accept=".csv" className="form-input" onChange={handleFileSelect} />
            </div>
            <div className="form-group">
              <label className="form-label">CSV Data Preview / Edit</label>
              <textarea className="form-textarea" style={{minHeight:160,fontFamily:'monospace',fontSize:13}} value={csv} onChange={e => setCsv(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={handleImport} disabled={loading}>{loading ? 'Importing...' : 'Import Teams'}</button>
          </div>

          {result && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">✅ Imported {result.imported} teams</span>
                <button className="btn btn-success btn-sm" onClick={downloadCreds}>📥 Download Credentials</button>
              </div>
              <div style={{background:'var(--warning-bg)',padding:10,borderRadius:'var(--radius-sm)',marginBottom:12,fontSize:12,color:'var(--warning)'}}>⚠️ Download credentials NOW — passwords cannot be retrieved later.</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Team</th><th>Number</th><th>Leader</th><th>Phone</th><th>Email</th><th>Password</th></tr></thead>
                  <tbody>
                    {result.credentials.map((c, i) => (
                      <tr key={i}>
                        <td>{c.teamName}</td>
                        <td>{c.teamNumber}</td>
                        <td>{c.leaderName}</td>
                        <td>{c.phone}</td>
                        <td style={{fontFamily:'monospace',fontSize:12}}>{c.email}</td>
                        <td style={{fontFamily:'monospace',fontSize:12}}>{c.password}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
