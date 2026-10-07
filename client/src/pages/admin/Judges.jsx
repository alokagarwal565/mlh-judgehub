import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { downloadBlobFile } from '../../services/download';
import { useToast } from '../../context/ToastContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { SearchField, Input, Select } from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import {
  Scale,
  Plus,
  Upload,
  Search,
  Eye,
  Edit3,
  Trash2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Download
} from '../../components/ui/icons';

export default function AdminJudges() {
  const { success, error: toastError } = useToast();
  const { activeEvent } = useActiveEvent();
  const navigate = useNavigate();

  const [judges, setJudges] = useState([]);
  const [eventId, setEventId] = useState('');
  const [search, setSearch] = useState('');
  const [activityFilter, setActivityFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCsv, setImportCsv] = useState('judge_name,judge_email,judge_phone\n');
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [editingJudge, setEditingJudge] = useState(null);
  const [deletingJudge, setDeletingJudge] = useState(null);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', password: '' });

  const fetchJudges = () => {
    if (eventId) {
      api.get(`/events/${eventId}/judges`).then((r) => setJudges(r.data)).catch(() => {});
    }
  };

  useEffect(() => {
    if (activeEvent) {
      setEventId(activeEvent.id);
    } else {
      api.get('/events').then((r) => {
        if (r.data.length > 0) setEventId(r.data[0].id);
      });
    }
  }, [activeEvent]);

  useEffect(() => {
    fetchJudges();
  }, [eventId]);

  const filteredJudges = judges.filter((j) => {
    if (activityFilter === 'ACTIVE' && j.inProgressSets === 0) return false;
    if (activityFilter === 'IDLE' && (j.inProgressSets > 0 || j.completedSets > 0)) return false;
    if (activityFilter === 'DONE' && j.inProgressSets > 0) return false;

    const q = search.toLowerCase();
    if (!q) return true;
    return (
      j.name.toLowerCase().includes(q) ||
      j.email.toLowerCase().includes(q) ||
      (j.phone && j.phone.toLowerCase().includes(q))
    );
  });

  const handleOpenModal = (judge = null) => {
    if (judge) {
      setEditingJudge(judge);
      setFormData({ name: judge.name, email: judge.email, phone: judge.phone || '', password: '' });
    } else {
      setEditingJudge(null);
      setFormData({ name: '', email: '', phone: '', password: '' });
    }
    setShowModal(true);
  };

  const handleSaveJudge = async (e) => {
    e.preventDefault();
    try {
      if (editingJudge) {
        await api.put(`/events/${eventId}/judges/${editingJudge.id}`, formData);
        success('Judge profile updated');
      } else {
        await api.post(`/events/${eventId}/judges`, formData);
        success('Judge registered successfully');
      }
      setShowModal(false);
      fetchJudges();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to save judge');
    }
  };

  const handleDeleteJudge = async (id) => {
    try {
      await api.delete(`/events/${eventId}/judges/${id}`);
      success('Judge removed');
      setDeletingJudge(null);
      fetchJudges();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to remove judge');
    }
  };

  const handleImportSubmit = async () => {
    setImporting(true);
    try {
      const res = await api.post(`/events/${eventId}/judges/import`, { csvData: importCsv });
      setImportResult(res.data);
      success(`Imported ${res.data.count || 0} judges successfully`);
      fetchJudges();
    } catch (err) {
      toastError(err.response?.data?.error || 'Judge import failed');
    } finally {
      setImporting(false);
    }
  };

  const fmtTime = (s) => {
    if (!s) return '—';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const handleExportCsv = async () => {
    try {
      const response = await api.get(`/events/${eventId}/export/judges`, { responseType: 'blob' });
      const safeName = (activeEvent?.name || 'event').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      downloadBlobFile(response.data, `judges-master-${safeName}.csv`);
      success('Judges master CSV exported successfully');
    } catch (err) {
      toastError('Failed to export judges master CSV');
    }
  };

  return (
    <div>
      <PageHeader
        title="Judges Directory"
        subtitle={`Evaluation staff & workload management for ${activeEvent?.name || 'event'}`}
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button
              variant="secondary"
              size="md"
              icon={Download}
              onClick={handleExportCsv}
              title="Export all judges as master CSV"
            >
              Export CSV
            </Button>
            <Button
              variant="secondary"
              size="md"
              icon={Upload}
              onClick={() => { setImportResult(null); setShowImportModal(true); }}
            >
              Import CSV
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={Plus}
              onClick={() => handleOpenModal()}
            >
              Add Judge
            </Button>
          </div>
        }
      />

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <SearchField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, phone..."
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>Filter:</span>
          <Select
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value)}
            size="sm"
            width={180}
            options={[
              { value: 'ALL', label: `All Judges (${judges.length})` },
              { value: 'ACTIVE', label: 'Currently Judging' },
              { value: 'DONE', label: 'Completed' },
              { value: 'IDLE', label: 'Not Started' }
            ]}
          />
        </div>
      </div>

      {/* Judges Table */}
      <div className="apple-table-container">
        <div className="apple-table-scroll">
          <table className="apple-table">
            <thead>
              <tr>
                <th>Judge Name</th>
                <th>Contact</th>
                <th>Workload Status</th>
                <th style={{ textAlign: 'center' }}>Completed Sets</th>
                <th style={{ textAlign: 'right' }}>Time Spent</th>
                <th style={{ width: 150, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredJudges.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '40px 0' }}>
                    <EmptyState
                      icon={Scale}
                      title="No Judges Found"
                      description={search ? "No judge matches your query." : "No judges registered for this event yet."}
                    />
                  </td>
                </tr>
              ) : (
                filteredJudges.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{j.name}</div>
                      <div style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                        {j.role || 'JUDGE'}
                      </div>
                    </td>
                    <td>
                      <div style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)' }}>{j.email}</div>
                      {j.phone && (
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>{j.phone}</div>
                      )}
                    </td>
                    <td>
                      {j.inProgressSets > 0 ? (
                        <Badge variant="warning" dot pulse>Evaluating Set</Badge>
                      ) : j.completedSets > 0 ? (
                        <Badge variant="success" icon={CheckCircle2}>Available</Badge>
                      ) : (
                        <Badge variant="default">Idle</Badge>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="tabular-nums apple-badge apple-badge-default apple-badge-sm">
                        {j.completedSets || 0} sets
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                        {fmtTime(j.totalTimeSeconds)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <button
                          type="button"
                          className="apple-btn-icon-only apple-btn-secondary apple-btn-sm"
                          onClick={() => navigate(`/admin/view-judge/${j.id}`)}
                          title="Simulate / View as Judge"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          type="button"
                          className="apple-btn-icon-only apple-btn-ghost apple-btn-sm"
                          onClick={() => handleOpenModal(j)}
                          title="Edit Profile"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          className="apple-btn-icon-only apple-btn-ghost apple-btn-sm"
                          onClick={() => setDeletingJudge(j)}
                          title="Remove Judge"
                          style={{ color: 'var(--accent-danger)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Judge Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingJudge ? 'Edit Judge Profile' : 'Add New Judge'}
        subtitle="Manage credentials and assignment capacity"
        maxWidth="500px"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSaveJudge}>Save Judge</Button>
          </>
        }
      >
        <form onSubmit={handleSaveJudge}>
          <Input
            label="Full Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Dr. Sarah Chen"
            required
            autoFocus
          />
          <Input
            label="Email Address"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="judge@example.com"
            required
          />
          <Input
            label="Phone Number"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="+1 555-0100"
          />
          {!editingJudge && (
            <Input
              label="Temporary Password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••"
              required
            />
          )}
        </form>
      </Modal>

      {/* CSV Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Import Judges via CSV"
        subtitle="Batch register evaluators and credentials"
        maxWidth="580px"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowImportModal(false)}>Cancel</Button>
            <Button variant="primary" icon={Upload} loading={importing} onClick={handleImportSubmit}>
              Import Judges
            </Button>
          </>
        }
      >
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 8 }}>
            Paste comma-separated data: <code>judge_name,judge_email,judge_phone</code>
          </div>
          <textarea
            value={importCsv}
            onChange={(e) => setImportCsv(e.target.value)}
            rows={7}
            className="apple-input"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
          />
        </div>

        {importResult && (
          <div style={{ padding: '12px 14px', background: 'var(--accent-success-tint)', border: '1px solid var(--accent-success)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 'var(--font-size-xs)' }}>
            <strong>Success:</strong> {importResult.count} judges imported successfully.
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingJudge}
        onClose={() => setDeletingJudge(null)}
        title="Remove Judge?"
        subtitle="This action unassigns the judge from any pending evaluation sets."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingJudge(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => handleDeleteJudge(deletingJudge.id)}>Remove</Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Are you sure you want to remove <strong>{deletingJudge?.name}</strong>?
        </p>
      </Modal>
    </div>
  );
}
