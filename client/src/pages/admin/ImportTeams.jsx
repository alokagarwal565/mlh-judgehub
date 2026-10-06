import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import { useLoader } from '../../context/LoaderContext';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { UploadIcon, DownloadIcon, ClockIcon, CheckCircleIcon } from '../../components/ui/icons';

export default function AdminImportTeams() {
  const { error: toastError, success: toastSuccess } = useToast();
  const [csv, setCsv] = useState('team_name,team_number,room_number,team_leader,team_phone\n');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const { activeEvent } = useActiveEvent();
  const { showLoader, hideLoader } = useLoader();

  const handleImport = async () => {
    if (!activeEvent?.id) return;
    setLoading(true);
    showLoader('Importing teams batch...');
    try {
      const res = await api.post(`/events/${activeEvent.id}/projects/import`, { csvData: csv });
      setResult(res.data);
      toastSuccess(`Imported ${res.data.imported} teams successfully`);
    } catch (err) {
      toastError(err.response?.data?.error || 'Import failed');
    } finally {
      setLoading(false);
      hideLoader();
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
    const a = document.createElement('a');
    a.href = url;
    a.download = `team_credentials_${activeEvent.name.replace(/\s+/g, '_')}.csv`;
    a.click();
  };

  if (!activeEvent) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <PageHeader title="Batch Import Teams" subtitle="Provision participant teams and projects from CSV" />
        <Card>
          <EmptyState
            icon={ClockIcon}
            title="No Active Event Selected"
            description="Select or mark an event as Active in Events to import teams."
            actionLabel="Go to Events"
            onAction={() => window.location.href = '/admin/events'}
          />
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="Batch Import Teams"
        subtitle={`Provision participant teams and submission stubs for ${activeEvent.name}`}
      />

      <Card style={{ padding: 24 }}>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Select a <code>.csv</code> file or paste tabular data with columns: <strong>team_name, team_number, room_number, team_leader, team_phone</strong>. Each row creates a team account with auto-generated passwords.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8, color: 'var(--text-secondary)' }}>
            Choose CSV File
          </label>
          <input
            type="file"
            accept=".csv"
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-hairline)',
              color: 'var(--text-primary)',
              fontSize: 13
            }}
            onChange={handleFileSelect}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8, color: 'var(--text-secondary)' }}>
            CSV Data Preview / Direct Edit
          </label>
          <Textarea
            style={{ minHeight: 160, fontFamily: 'monospace', fontSize: 12 }}
            value={csv}
            onChange={e => setCsv(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="primary"
            icon={UploadIcon}
            onClick={handleImport}
            disabled={loading}
          >
            {loading ? 'Importing Teams...' : 'Execute Batch Import'}
          </Button>
        </div>
      </Card>

      {result && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-hairline)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                Successfully Imported {result.imported} Teams
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--warning)' }}>
                Download credentials now — passwords are cryptographically hashed and cannot be retrieved later.
              </p>
            </div>
            <Button
              variant="secondary"
              icon={DownloadIcon}
              onClick={downloadCreds}
            >
              Download Credentials (.CSV)
            </Button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-hairline)' }}>
                  <th style={{ padding: '12px 24px', fontWeight: 600, color: 'var(--text-secondary)' }}>Team</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Number</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Leader</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Phone</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Login Email</th>
                  <th style={{ padding: '12px 24px', fontWeight: 600, color: 'var(--text-secondary)' }}>Password</th>
                </tr>
              </thead>
              <tbody>
                {result.credentials.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-hairline)' }}>
                    <td style={{ padding: '14px 24px', fontWeight: 600 }}>{c.teamName}</td>
                    <td style={{ padding: '14px 20px', fontVariantNumeric: 'tabular-nums' }}>#{c.teamNumber}</td>
                    <td style={{ padding: '14px 20px' }}>{c.leaderName}</td>
                    <td style={{ padding: '14px 20px', color: 'var(--text-secondary)' }}>{c.phone}</td>
                    <td style={{ padding: '14px 20px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>{c.email}</td>
                    <td style={{ padding: '14px 24px', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{c.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
