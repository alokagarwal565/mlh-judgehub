import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { downloadBlobFile } from '../../services/download';
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
  AlertTriangle,
  Award,
  Phone
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

  const absentCount = projects.filter((p) => p.flags?.some((f) => f.reason?.includes('[ABSENT]'))).length;

  const filtered = projects.filter((p) => {
    const matchSearch =
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.team?.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.teamNumber?.toString().includes(search) ||
      p.roomNumber?.toString().includes(search) ||
      p.leaderName?.toLowerCase().includes(search.toLowerCase());

    let matchStatus = true;
    if (statusFilter === 'ABSENT') {
      matchStatus = p.flags?.some((f) => f.reason?.includes('[ABSENT]'));
    } else if (statusFilter !== 'ALL') {
      matchStatus = p.status === statusFilter;
    }
    return matchSearch && matchStatus;
  });

  const handleFinalizeAbsent = async (project) => {
    if (!window.confirm(`Mark ${project.title} as absent for 2nd attempt? This applies a default floor score of 0 so judging rounds are not blocked.`)) {
      return;
    }
    try {
      await api.post(`/events/${eventId}/projects/${project.id}/absence`, {
        isFinalAbsent: true,
        notes: 'Final 2nd attempt absence recorded by admin.'
      });
      success(`Marked ${project.title} as absent (Floor score 0 applied)`);
      fetchProjects();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to finalize absence');
    }
  };

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
      const res = await api.get(`/events/${eventId}/projects/${projectId}`);
      setSelectedDetails(res.data);
    } catch (err) {
      toastError('Failed to fetch project details');
    }
  };

  const handleExportCsv = async () => {
    try {
      const response = await api.get(`/events/${eventId}/export/projects`, { responseType: 'blob' });
      const safeName = (activeEvent?.name || 'event').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      downloadBlobFile(response.data, `projects-master-${safeName}.csv`);
      success('Projects master CSV exported successfully');
    } catch (err) {
      toastError('Failed to export projects master CSV');
    }
  };

  const getStatusBadge = (status, project) => {
    if (project?.flags?.some((f) => f.reason?.includes('[ABSENT]'))) {
      return <Badge variant="warning" dot pulse>Absent at Table</Badge>;
    }
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
              icon={Download}
              onClick={handleExportCsv}
              title="Export all projects as master CSV"
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
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>Filter:</span>
          <Select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            size="sm"
            width={180}
            options={[
              { value: 'ALL', label: `All Statuses (${projects.length})` },
              { value: 'ABSENT', label: `⚠️ Absent at Table (${absentCount})`, color: '#ff9f0a' },
              { value: 'SUBMITTED', label: 'Submitted' },
              { value: 'UNDER_REVIEW', label: 'In Judging' },
              { value: 'SCORED', label: 'Scored' },
              { value: 'FLAGGED', label: 'Flagged', color: '#ff453a' }
            ]}
          />
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
                <th style={{ width: 160, textAlign: 'right' }}>Actions</th>
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
                paged.map((p) => {
                  const isAbsent = p.flags?.some((f) => f.reason?.includes('[ABSENT]'));

                  return (
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
                        <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{p.team?.name || '—'}</div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                          <span>{p.leaderName || p.team?.email || '—'}</span>
                          {p.team?.phone && (
                            <a
                              href={`tel:${p.team.phone}`}
                              style={{
                                color: 'var(--accent)',
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontWeight: 500
                              }}
                              title="Call team lead to confirm table location"
                            >
                              <Phone size={11} /> {p.team.phone}
                            </a>
                          )}
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
                      <td>{getStatusBadge(p.status, p)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {isAbsent && (
                            <button
                              type="button"
                              className="apple-btn apple-btn-secondary apple-btn-xs"
                              onClick={() => handleFinalizeAbsent(p)}
                              style={{ color: 'var(--accent-warning)', borderColor: 'rgba(234, 179, 8, 0.3)', padding: '2px 6px', fontSize: 10, height: 24 }}
                              title="Assign default floor score 0 if team is absent on 2nd attempt"
                            >
                              Floor 0
                            </button>
                          )}
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
                            title="Edit Project / Update Table Location"
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
                );
              })
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
        subtitle={`Team ${selectedDetails?.team?.name || 'Unknown'} ${selectedDetails?.roomNumber ? `· ${selectedDetails.roomNumber.toLowerCase().startsWith('room') ? selectedDetails.roomNumber : `Room ${selectedDetails.roomNumber}`}` : ''} ${selectedDetails?.teamNumber ? `· #${selectedDetails.teamNumber}` : ''}`}
        maxWidth="640px"
        footer={<Button variant="secondary" onClick={() => setSelectedDetails(null)}>Close</Button>}
      >
        {selectedDetails && (
          <div>
            {/* Flags Warning Banner */}
            {selectedDetails.flags && selectedDetails.flags.length > 0 && (
              <div style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255, 69, 58, 0.12)',
                border: '1px solid rgba(255, 69, 58, 0.3)',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10
              }}>
                <span style={{ color: 'var(--accent-danger)', fontWeight: 700, fontSize: 13 }}>⚠️ FLAGGED</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.4 }}>
                  {selectedDetails.flags[0].reason}
                </span>
              </div>
            )}

            {/* Description */}
            {selectedDetails.description && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                  Project Description
                </div>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>
                  {selectedDetails.description}
                </p>
              </div>
            )}

            {/* Links & Team Contact Strip */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 20 }}>
              {selectedDetails.demoLink && (
                <a
                  href={selectedDetails.demoLink}
                  target="_blank"
                  rel="noreferrer"
                  className="apple-btn apple-btn-secondary apple-btn-sm"
                  style={{ textDecoration: 'none' }}
                >
                  <ExternalLink size={14} /> Demo Link
                </a>
              )}
              {selectedDetails.videoUrl && (
                <a
                  href={selectedDetails.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="apple-btn apple-btn-secondary apple-btn-sm"
                  style={{ textDecoration: 'none' }}
                >
                  <ExternalLink size={14} /> Video URL
                </a>
              )}
              {selectedDetails.leaderName && (
                <span className="apple-badge apple-badge-default apple-badge-sm">
                  Leader: {selectedDetails.leaderName}
                </span>
              )}
              {selectedDetails.team?.phone && (
                <span className="apple-badge apple-badge-default apple-badge-sm">
                  Phone: {selectedDetails.team.phone}
                </span>
              )}
            </div>

            {/* Assigned Judging Sets */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                Assigned Judging Sets ({selectedDetails.judgeSetProjects?.length || 0})
              </div>
              {(!selectedDetails.judgeSetProjects || selectedDetails.judgeSetProjects.length === 0) ? (
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>No judge sets assigned yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedDetails.judgeSetProjects.map((jsp) => {
                    const set = jsp.set;
                    if (!set) return null;
                    const isComplete = set.status === 'COMPLETED';
                    const isInProgress = set.status === 'IN_PROGRESS';
                    const judgeName = set.judge?.name;
                    const nomination = set.nominations?.[0];
                    const rankVote = set.stackRankVotes?.[0];

                    return (
                      <div
                        key={jsp.setId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: 'var(--bg-surface-elevated)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: 12
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            {set.setNumber === 0 ? '🏆 Tie-breaker' : `Set #${set.setNumber}`}
                          </span>
                          {set.column && (
                            <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                              Col {set.column}
                            </span>
                          )}
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {judgeName ? `· ${judgeName}` : '· Awaiting Judge'}
                          </span>
                          {nomination?.track && (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: 'var(--radius-pill)',
                                background: `${nomination.track.color}18`,
                                border: `1px solid ${nomination.track.color}35`,
                                color: nomination.track.color,
                                fontSize: 10,
                                fontWeight: 700
                              }}
                            >
                              🏷️ {nomination.track.name}
                            </span>
                          )}
                          {rankVote && (
                            <span style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 700 }}>
                              {rankVote.rank === 1 ? '🥇 1st' : rankVote.rank === 2 ? '🥈 2nd' : '🥉 3rd'} ({rankVote.points} pts)
                            </span>
                          )}
                        </div>

                        <Badge
                          variant={isComplete ? 'success' : isInProgress ? 'warning' : 'default'}
                          size="sm"
                          dot={isInProgress}
                        >
                          {isComplete ? 'Scored' : isInProgress ? 'Evaluating' : 'Pending'}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Individual Judge Scores Breakdown */}
            <div>
              <div style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                Submitted Scores ({selectedDetails.scores?.length || 0})
              </div>

              {(!selectedDetails.scores || selectedDetails.scores.length === 0) ? (
                <div style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px dashed var(--border-subtle)',
                  borderRadius: 'var(--radius-md)'
                }}>
                  <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 4px' }}>
                    No Scores Submitted Yet
                  </p>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', margin: 0 }}>
                    When judges submit their rubric evaluations, the criteria breakdown and feedback comments will appear here.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {selectedDetails.scores.map((score, sIdx) => {
                    const total = score.total ?? (score.completion + score.originality + score.learning + score.design + score.technology);
                    const matchingFeedback = selectedDetails.feedbacks?.find((f) => f.judgeId === score.judgeId);
                    return (
                      <div
                        key={score.id || sIdx}
                        style={{
                          padding: '14px 18px',
                          background: 'var(--bg-surface-elevated)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <div>
                            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {score.judge?.name || `Judge ${sIdx + 1}`}
                            </span>
                            {score.set && (
                              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                                Set #{score.set.setNumber}
                              </span>
                            )}
                          </div>
                          <span className="tabular-nums" style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--accent)' }}>
                            {total} / 50
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, fontSize: 'var(--font-size-2xs)', color: 'var(--text-secondary)' }}>
                          <div style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, textAlign: 'center' }}>
                            <span style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 10 }}>COMP</span>
                            <strong className="tabular-nums" style={{ color: 'var(--text-primary)', fontSize: 13 }}>{score.completion}</strong>
                          </div>
                          <div style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, textAlign: 'center' }}>
                            <span style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 10 }}>ORIG</span>
                            <strong className="tabular-nums" style={{ color: 'var(--text-primary)', fontSize: 13 }}>{score.originality}</strong>
                          </div>
                          <div style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, textAlign: 'center' }}>
                            <span style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 10 }}>LEARN</span>
                            <strong className="tabular-nums" style={{ color: 'var(--text-primary)', fontSize: 13 }}>{score.learning}</strong>
                          </div>
                          <div style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, textAlign: 'center' }}>
                            <span style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 10 }}>DESIGN</span>
                            <strong className="tabular-nums" style={{ color: 'var(--text-primary)', fontSize: 13 }}>{score.design}</strong>
                          </div>
                          <div style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, textAlign: 'center' }}>
                            <span style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 10 }}>TECH</span>
                            <strong className="tabular-nums" style={{ color: 'var(--text-primary)', fontSize: 13 }}>{score.technology}</strong>
                          </div>
                        </div>
                        {matchingFeedback?.comment && (
                          <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-secondary)', borderLeft: '3px solid var(--accent)' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-tertiary)', marginRight: 6 }}>COMMENT:</span>
                            {matchingFeedback.comment}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
