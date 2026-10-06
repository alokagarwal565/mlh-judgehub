import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useSocket } from '../../context/SocketContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import Pagination, { usePagination } from '../../components/Pagination';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { SearchField, Input, Select } from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import {
  FolderGit2,
  Plus,
  Upload,
  Download,
  Search,
  Trash2,
  Edit3,
  Eye,
  ExternalLink,
  CheckCircle2,
  AlertTriangle
} from '../../components/ui/icons';

export default function AdminProjects() {
  const { success, error: toastError } = useToast();
  const socket = useSocket();
  const { activeEvent } = useActiveEvent();

  const [projects, setProjects] = useState([]);
  const [eventId, setEventId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCsv, setImportCsv] = useState('team_name,team_number,room_number,team_leader,team_phone\n');
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [deletingProject, setDeletingProject] = useState(null);
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const [formData, setFormData] = useState({
    title: '',
    teamName: '',
    teamNumber: '',
    roomNumber: '',
    leaderName: '',
    phone: '',
    email: '',
    password: '',
    status: 'SUBMITTED'
  });

  const fetchProjects = () => {
    if (eventId) {
      api.get(`/events/${eventId}/projects`).then((r) => setProjects(r.data)).catch(() => {});
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
    fetchProjects();
  }, [eventId]);

  useEffect(() => {
    if (!socket || !eventId) return;
    const handler = (data) => {
      if (data.eventId === eventId) fetchProjects();
    };
    socket.on('flag:updated', handler);
    socket.on('flag:created', handler);
    socket.on('score:submitted', handler);
    return () => {
      socket.off('flag:updated', handler);
      socket.off('flag:created', handler);
      socket.off('score:submitted', handler);
    };
  }, [socket, eventId]);

  const filtered = projects.filter((p) => {
    const matchSearch =
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.team?.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.teamNumber?.toString().includes(search) ||
      p.roomNumber?.toString().includes(search) ||
      p.leaderName?.toLowerCase().includes(search.toLowerCase());

    const matchStatus = statusFilter === 'ALL' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const { paged, totalPages, total } = usePagination(filtered, page, perPage);

  const openCreateModal = () => {
    setEditingProject(null);
    setFormData({
      title: '',
      teamName: '',
      teamNumber: '',
      roomNumber: '',
      leaderName: '',
      phone: '',
      email: '',
      password: '',
      status: 'SUBMITTED'
    });
    setShowModal(true);
  };

  const openEditModal = (p) => {
    setEditingProject(p);
    setFormData({
      title: p.title,
      teamName: p.team?.name || '',
      teamNumber: p.teamNumber || '',
      roomNumber: p.roomNumber || '',
      leaderName: p.leaderName || '',
      phone: p.team?.phone || '',
      email: p.team?.email || '',
      password: '',
      status: p.status
    });
    setShowModal(true);
  };

  const handleSaveProject = async (e) => {
    e.preventDefault();
    try {
      if (editingProject) {
        await api.put(`/events/${eventId}/projects/${editingProject.id}`, formData);
        success('Project updated successfully');
      } else {
        await api.post(`/events/${eventId}/projects`, formData);
        success('Project created successfully');
      }
      setShowModal(false);
      fetchProjects();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to save project');
    }
  };

  const handleDeleteProject = async (id) => {
    try {
      await api.delete(`/events/${eventId}/projects/${id}`);
      success('Project deleted');
      setDeletingProject(null);
      fetchProjects();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to delete project');
    }
  };

  const handleImportSubmit = async () => {
    setImporting(true);
    try {
      const res = await api.post(`/events/${eventId}/projects/import`, { csvData: importCsv });
      setImportResult(res.data);
      success(`Imported ${res.data.count || 0} teams successfully`);
      fetchProjects();
    } catch (err) {
      toastError(err.response?.data?.error || 'CSV import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleShowDetails = async (projectId) => {
    try {
      const res = await api.get(`/events/${eventId}/projects/${projectId}/details`);
      setSelectedDetails(res.data);
    } catch (err) {
      toastError('Failed to fetch project details');
    }
  };

  const getStatusBadge = (status) => {
    if (status === 'FLAGGED') return <Badge variant="danger" dot>Flagged</Badge>;
    if (status === 'SCORED') return <Badge variant="success">Scored</Badge>;
    if (status === 'UNDER_REVIEW') return <Badge variant="warning" dot pulse>In Judging</Badge>;
    return <Badge variant="default">Submitted</Badge>;
  };

  return (
    <div>
      <PageHeader
        title="Projects & Teams"
        subtitle={`Directory of all ${projects.length} submissions for ${activeEvent?.name || 'event'}`}
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
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
              onClick={openCreateModal}
            >
              New Project
            </Button>
          </div>
        }
      />

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <SearchField
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search projects, teams, room numbers..."
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>Filter Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="apple-select"
            style={{ width: 'auto', minHeight: 34, fontSize: 'var(--font-size-xs)', padding: '6px 28px 6px 12px' }}
          >
            <option value="ALL">All Statuses ({projects.length})</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="UNDER_REVIEW">In Judging</option>
            <option value="SCORED">Scored</option>
            <option value="FLAGGED">Flagged</option>
          </select>
        </div>
      </div>

      {/* Projects Data Table */}
      <div className="apple-table-container">
        <div className="apple-table-scroll">
          <table className="apple-table">
            <thead>
              <tr>
                <th style={{ width: 80 }}># Team</th>
                <th>Project Title</th>
                <th>Team & Leader</th>
                <th>Location</th>
                <th>Status</th>
                <th style={{ width: 140, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '40px 0' }}>
                    <EmptyState
                      icon={FolderGit2}
                      title="No Projects Found"
                      description={search ? "No project matches your search query." : "No projects have been added or imported yet."}
                    />
                  </td>
                </tr>
              ) : (
                paged.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {p.teamNumber ? `#${p.teamNumber}` : '—'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.title}</div>
                      {p.demoLink && (
                        <a
                          href={p.demoLink}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2 }}
                        >
                          <ExternalLink size={10} /> Demo Link
                        </a>
                      )}
                    </td>
                    <td>
                      <div style={{ color: 'var(--text-primary)' }}>{p.team?.name || '—'}</div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                        {p.leaderName || p.team?.email || '—'}
                      </div>
                    </td>
                    <td>
                      {p.roomNumber ? (
                        <span className="apple-badge apple-badge-default apple-badge-sm">
                          Room {p.roomNumber}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)' }}>—</span>
                      )}
                    </td>
                    <td>{getStatusBadge(p.status)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <button
                          type="button"
                          className="apple-btn-icon-only apple-btn-ghost apple-btn-sm"
                          onClick={() => handleShowDetails(p.id)}
                          title="View Details"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          type="button"
                          className="apple-btn-icon-only apple-btn-ghost apple-btn-sm"
                          onClick={() => openEditModal(p)}
                          title="Edit Project"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          className="apple-btn-icon-only apple-btn-ghost apple-btn-sm"
                          onClick={() => setDeletingProject(p)}
                          title="Delete Project"
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

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={setPerPage}
        />
      </div>

      {/* Create / Edit Project Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingProject ? 'Edit Project' : 'Register New Project'}
        subtitle="Manage team details, room location, and credentials"
        maxWidth="560px"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSaveProject}>Save Project</Button>
          </>
        }
      >
        <form onSubmit={handleSaveProject}>
          <Input
            label="Project Title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="e.g. AI-Powered Assistant"
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Input
              label="Team Name"
              value={formData.teamName}
              onChange={(e) => setFormData({ ...formData, teamName: e.target.value })}
              placeholder="e.g. CodeWizards"
              required
            />
            <Input
              label="Team Number"
              value={formData.teamNumber}
              onChange={(e) => setFormData({ ...formData, teamNumber: e.target.value })}
              placeholder="e.g. 101"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Input
              label="Assigned Room / Table"
              value={formData.roomNumber}
              onChange={(e) => setFormData({ ...formData, roomNumber: e.target.value })}
              placeholder="e.g. Room 204"
            />
            <Input
              label="Team Leader"
              value={formData.leaderName}
              onChange={(e) => setFormData({ ...formData, leaderName: e.target.value })}
              placeholder="Full Name"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Input
              label="Team Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="team@example.com"
              required
            />
            <Input
              label="Contact Phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+1 555-0100"
            />
          </div>

          {!editingProject && (
            <Input
              label="Initial Password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Min 6 characters"
              required
            />
          )}
        </form>
      </Modal>

      {/* CSV Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Import Teams via CSV"
        subtitle="Batch register projects, tables, and team credentials"
        maxWidth="600px"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowImportModal(false)}>Cancel</Button>
            <Button variant="primary" icon={Upload} loading={importing} onClick={handleImportSubmit}>
              Run Import
            </Button>
          </>
        }
      >
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 10 }}>
            Paste comma-separated data with headers: <code>team_name,team_number,room_number,team_leader,team_phone</code>
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
            <strong>Success:</strong> {importResult.count} teams processed successfully.
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingProject}
        onClose={() => setDeletingProject(null)}
        title="Delete Project?"
        subtitle="This action permanently deletes the submission and any associated judge scores."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingProject(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => handleDeleteProject(deletingProject.id)}>Delete</Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Are you sure you want to remove <strong>{deletingProject?.title}</strong>? This cannot be undone.
        </p>
      </Modal>

      {/* Project Drill-down Modal */}
      <Modal
        isOpen={!!selectedDetails}
        onClose={() => setSelectedDetails(null)}
        title={selectedDetails?.title || 'Project Details'}
        subtitle={`Team: ${selectedDetails?.team?.name || 'Unknown'}`}
        footer={<Button variant="secondary" onClick={() => setSelectedDetails(null)}>Close</Button>}
      >
        {selectedDetails && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 'var(--font-size-2xs)', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>Assigned Sets</span>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {selectedDetails.judgeSetProjects?.map((jsp) => (
                  <span key={jsp.setId} className="apple-badge apple-badge-primary apple-badge-sm">
                    Set #{jsp.set?.setNumber}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <span style={{ fontSize: 'var(--font-size-2xs)', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>Scores Submitted</span>
              <div style={{ marginTop: 6 }}>
                {selectedDetails.scores?.length === 0 ? (
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>No scores recorded yet.</p>
                ) : (
                  selectedDetails.scores?.map((s, i) => (
                    <div key={i} style={{ padding: '8px 12px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)', marginBottom: 6, fontSize: 'var(--font-size-xs)' }}>
                      <strong>{s.judge?.name}:</strong> {s.completion + s.originality + s.learning + s.design + s.technology} / 50 points
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
