import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { SearchField } from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import {
  Network,
  Sparkles,
  Search,
  CheckCircle2,
  Clock,
  Eye,
  User,
  Plus
} from '../../components/ui/icons';

export default function AdminAssignments() {
  const { success, error: toastError } = useToast();
  const { activeEvent } = useActiveEvent();
  const navigate = useNavigate();

  const [eventId, setEventId] = useState('');
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [idleJudges, setIdleJudges] = useState([]);
  const [selectedSet, setSelectedSet] = useState(null);
  const [selectedJudgeId, setSelectedJudgeId] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (activeEvent) {
      setEventId(activeEvent.id);
    } else {
      api.get('/events').then((r) => {
        if (r.data.length > 0) setEventId(r.data[0].id);
      });
    }
  }, [activeEvent]);

  const loadSets = () => {
    if (eventId) {
      api.get(`/events/${eventId}/assignments`).then((r) => setSets(r.data)).catch(() => {});
    }
  };

  useEffect(() => {
    loadSets();
  }, [eventId]);

  const generateSets = async () => {
    setLoading(true);
    try {
      const res = await api.post(`/events/${eventId}/assignments`);
      success(`Generated ${res.data.totalSets} evaluation sets successfully!`);
      loadSets();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to partition sets');
    } finally {
      setLoading(false);
    }
  };

  const openManualAssign = (s) => {
    setSelectedSet(s);
    setSelectedJudgeId('');
    api.get(`/events/${eventId}/assignments/idle-judges`).then((r) => setIdleJudges(r.data)).catch(() => {});
    setShowAssignModal(true);
  };

  const handleManualAssign = async () => {
    if (!selectedJudgeId || !selectedSet) return;
    setAssigning(true);
    try {
      await api.post(`/events/${eventId}/assignments/manual-assign`, {
        setId: selectedSet.id,
        judgeId: selectedJudgeId,
      });
      success(`Set #${selectedSet.setNumber} assigned successfully.`);
      setShowAssignModal(false);
      loadSets();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to assign judge');
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (setId) => {
    try {
      await api.post(`/events/${eventId}/assignments/unassign`, { setId });
      success('Judge unassigned from set');
      loadSets();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to unassign judge');
    }
  };

  const filteredSets = sets.filter((s) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      s.setNumber?.toString().includes(q) ||
      s.judge?.name?.toLowerCase().includes(q) ||
      s.projects?.some((sp) => sp.project?.title?.toLowerCase().includes(q));

    const matchStatus = statusFilter === 'ALL' || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div>
      <PageHeader
        title="Judging Floor Assignments"
        subtitle={`Partitioning and evaluator allocation for ${activeEvent?.name || 'event'}`}
        actions={
          <Button
            variant="primary"
            size="md"
            icon={Sparkles}
            loading={loading}
            onClick={generateSets}
          >
            Generate Sets
          </Button>
        }
      />

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <SearchField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sets by judge, project, number..."
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>Filter Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="apple-select"
            style={{ width: 'auto', minHeight: 34, fontSize: 'var(--font-size-xs)', padding: '6px 28px 6px 12px' }}
          >
            <option value="ALL">All Sets ({sets.length})</option>
            <option value="UNASSIGNED">Unassigned</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
      </div>

      {/* Grid of Sets */}
      {filteredSets.length === 0 ? (
        <Card>
          <EmptyState
            icon={Network}
            title="No Sets Found"
            description={search ? "No set matches your search filter." : "Click 'Generate Sets' to create partitioned judging assignments."}
            action={
              sets.length === 0 && (
                <Button variant="primary" icon={Sparkles} onClick={generateSets}>
                  Generate Initial Sets
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
          {filteredSets.map((s) => (
            <Card
              key={s.id}
              className="is-interactive"
              title={`Set #${s.setNumber}`}
              subtitle={`${s.projects?.length || 0} projects assigned`}
              action={
                s.status === 'COMPLETED' ? (
                  <Badge variant="success" icon={CheckCircle2}>Complete</Badge>
                ) : s.status === 'IN_PROGRESS' ? (
                  <Badge variant="warning" dot pulse>In Progress</Badge>
                ) : (
                  <Badge variant="default">Unassigned</Badge>
                )
              }
            >
              {/* Judge assignment info */}
              <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 'var(--font-size-2xs)', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 2 }}>
                  Evaluator
                </div>
                {s.judge ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                      {s.judge.name}
                    </span>
                    {s.status !== 'COMPLETED' && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleUnassign(s.id); }}
                        style={{ background: 'transparent', border: 'none', color: 'var(--accent-danger)', fontSize: 11, cursor: 'pointer' }}
                      >
                        Unassign
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)' }}>None</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openManualAssign(s); }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      + Assign Judge
                    </button>
                  </div>
                )}
              </div>

              {/* Projects in set list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {s.projects?.map((sp, idx) => (
                  <div
                    key={sp.projectId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 'var(--font-size-xs)',
                      padding: '4px 0'
                    }}
                  >
                    <span style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '75%' }}>
                      {idx + 1}. {sp.project?.title}
                    </span>
                    <span className="apple-badge apple-badge-default apple-badge-sm">
                      {sp.project?.roomNumber ? `R.${sp.project.roomNumber}` : '—'}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ paddingTop: 12, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Eye}
                  onClick={() => navigate(`/admin/sets/${s.id}`)}
                >
                  Set Detail
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Manual Assign Judge Modal */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title={`Assign Judge to Set #${selectedSet?.setNumber}`}
        subtitle="Select an available evaluator from the idle pool"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowAssignModal(false)}>Cancel</Button>
            <Button variant="primary" loading={assigning} disabled={!selectedJudgeId} onClick={handleManualAssign}>
              Confirm Assignment
            </Button>
          </>
        }
      >
        <div style={{ marginBottom: 14 }}>
          <label className="apple-form-label" style={{ display: 'block', marginBottom: 6 }}>
            Available Evaluators ({idleJudges.length})
          </label>
          <select
            value={selectedJudgeId}
            onChange={(e) => setSelectedJudgeId(e.target.value)}
            className="apple-select"
          >
            <option value="">-- Choose Judge --</option>
            {idleJudges.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name} ({j.completedSets || 0} completed sets)
              </option>
            ))}
          </select>
        </div>
      </Modal>
    </div>
  );
}
