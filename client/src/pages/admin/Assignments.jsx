import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import { useLoader } from '../../context/LoaderContext';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { SearchField, Select } from '../../components/ui/Input';
import SegmentedControl from '../../components/ui/SegmentedControl';
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
  Users,
  Plus,
  AlertTriangle,
  Lock,
  Trophy,
  Phone,
  MapPin,
  X,
  Check
} from '../../components/ui/icons';

const MLH_COLUMNS = [
  { id: 1, name: 'Set 1', round: 'Round 1', color: '#30d158', bg: 'rgba(48, 209, 88, 0.12)', border: 'rgba(48, 209, 88, 0.3)' },
  { id: 2, name: 'Set 2', round: 'Round 2', color: '#0a84ff', bg: 'rgba(10, 132, 255, 0.12)', border: 'rgba(10, 132, 255, 0.3)' },
  { id: 3, name: 'Set 3', round: 'Round 3', color: '#bf5af2', bg: 'rgba(191, 90, 242, 0.12)', border: 'rgba(191, 90, 242, 0.3)' }
];

export default function AdminAssignments() {
  const { error: toastError, success: toastSuccess } = useToast();
  const { activeEvent } = useActiveEvent();
  const { showLoader, hideLoader } = useLoader();
  const navigate = useNavigate();

  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [timeFilter, setTimeFilter] = useState('ALL'); // ALL, OVERDUE, ACTIVE, FAST, ZERO
  const [sortBy, setSortBy] = useState('DEFAULT'); // DEFAULT, LONGEST, RECENT

  // Manual assign drawer/modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [idleJudges, setIdleJudges] = useState([]);
  const [selectedJudge, setSelectedJudge] = useState(null);
  const [selectedSet, setSelectedSet] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [judgeSearch, setJudgeSearch] = useState('');
  const [unassignTargetSet, setUnassignTargetSet] = useState(null);
  const [unassigning, setUnassigning] = useState(false);

  // Reassign modal state
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [reassignTargetSet, setReassignTargetSet] = useState(null);
  const [eligibleJudges, setEligibleJudges] = useState([]);
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [selectedReplacementJudge, setSelectedReplacementJudge] = useState(null);
  const [reassignReason, setReassignReason] = useState('');
  const [reassigning, setReassigning] = useState(false);

  useEffect(() => {
    if (activeEvent) {
      setEventId(activeEvent.id);
    } else {
      api.get('/events').then((r) => {
        setEvents(r.data);
        if (r.data.length > 0) setEventId(r.data[0].id);
      }).catch(() => {});
    }
  }, [activeEvent]);

  const currentEvent = useMemo(() => {
    return activeEvent || events.find((e) => e.id === eventId);
  }, [activeEvent, events, eventId]);

  const isJudging = currentEvent?.status === 'JUDGING';

  const loadSets = () => {
    if (!eventId) return;
    showLoader('Loading assignments...');
    api.get(`/events/${eventId}/assignments`)
      .then((r) => setSets(r.data || []))
      .catch(() => {})
      .finally(() => hideLoader());
  };

  const loadIdleJudges = () => {
    if (!eventId) return;
    api.get(`/events/${eventId}/assignments/idle-judges`)
      .then((r) => setIdleJudges(r.data || []))
      .catch(() => {});
  };

  useEffect(() => {
    if (eventId) {
      loadSets();
      loadIdleJudges();
    }
  }, [eventId]);

  const handleGenerate = async () => {
    if (isJudging) {
      if (!window.confirm('Judging is currently in progress! Regenerating assignments may disrupt active scoring. Are you sure you want to proceed?')) {
        return;
      }
    }
    setLoading(true);
    try {
      const res = await api.post(`/events/${eventId}/assignments`);
      toastSuccess(`Generated ${res.data.totalSets || 'all'} evaluation sets successfully!`);
      loadSets();
      loadIdleJudges();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to generate assignments');
    } finally {
      setLoading(false);
    }
  };

  const openManualAssign = (preselectedSet = null) => {
    setSelectedSet(preselectedSet);
    setSelectedJudge(null);
    setJudgeSearch('');
    loadIdleJudges();
    setShowAssignModal(true);
  };

  const handleManualAssign = async () => {
    if (!selectedJudge || !selectedSet) return;
    setAssigning(true);
    try {
      await api.post(`/events/${eventId}/assignments/manual-assign`, {
        setId: selectedSet.id,
        judgeId: selectedJudge.id
      });
      toastSuccess(`Set #${selectedSet.setNumber} assigned to ${selectedJudge.name}`);
      setShowAssignModal(false);
      setSelectedJudge(null);
      setSelectedSet(null);
      loadSets();
      loadIdleJudges();
    } catch (err) {
      toastError(err.response?.data?.error || 'Assignment failed');
    } finally {
      setAssigning(false);
    }
  };

  const confirmUnassign = async () => {
    if (!unassignTargetSet) return;
    setUnassigning(true);
    try {
      const targetEventId = unassignTargetSet.eventId || eventId || activeEvent?.id;
      await api.post(`/events/${targetEventId}/assignments/unassign`, { setId: unassignTargetSet.id });
      toastSuccess(`Unassigned ${unassignTargetSet.judge?.name || 'judge'} from Set #${unassignTargetSet.setNumber}`);
      setUnassignTargetSet(null);
      loadSets();
      loadIdleJudges();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to unassign judge');
    } finally {
      setUnassigning(false);
    }
  };

  const openReassignModal = async (set) => {
    setReassignTargetSet(set);
    setSelectedReplacementJudge(null);
    setReassignReason('');
    setReassignModalOpen(true);
    setLoadingEligible(true);
    try {
      const targetEventId = set.eventId || eventId || activeEvent?.id;
      const res = await api.get(`/events/${targetEventId}/assignments/${set.id}/eligible-judges`);
      setEligibleJudges(res.data.judges || []);
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to load eligible replacement judges');
    } finally {
      setLoadingEligible(false);
    }
  };

  const handleConfirmReassign = async () => {
    if (!reassignTargetSet || !selectedReplacementJudge) return;
    setReassigning(true);
    try {
      const targetEventId = reassignTargetSet.eventId || eventId || activeEvent?.id;
      const res = await api.post(`/events/${targetEventId}/assignments/reassign`, {
        setId: reassignTargetSet.id,
        newJudgeId: selectedReplacementJudge.id,
        reason: reassignReason.trim()
      });
      toastSuccess(res.data.message || 'Set successfully reassigned');
      setReassignModalOpen(false);
      setReassignTargetSet(null);
      setSelectedReplacementJudge(null);
      loadSets();
      loadIdleJudges();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to reassign set');
    } finally {
      setReassigning(false);
    }
  };

  const getSetRange = (projects) => {
    if (!projects || projects.length === 0) return '';
    const sorted = [...projects].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const firstMatch = sorted[0]?.project?.teamNumber?.match(/\d+/);
    if (!firstMatch) {
      return `${sorted.length} projects`;
    }
    const start = parseInt(firstMatch[0], 10);
    const end = start + sorted.length - 1;
    return `#${start} – #${end}`;
  };

  const fmtTime = (s) => {
    if (!s || s <= 0) return null;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  };

  const cleanRoom = (room) => {
    if (!room) return '—';
    const normalized = room.replace(/^(r\.|rm\.?|room)\s*/i, '').trim();
    return normalized ? `Room ${normalized}` : room;
  };

  const cleanRoomBadge = (room) => {
    if (!room) return '—';
    const normalized = room.replace(/^(r\.|rm\.?|room)\s*/i, '').trim();
    return normalized ? `Rm ${normalized}` : room;
  };

  const filterSet = (set) => {
    const q = search.toLowerCase().trim();
    if (statusFilter !== 'ALL' && set.status !== statusFilter) return false;

    // Time / Duration filtering
    if (timeFilter !== 'ALL') {
      const dur = set.totalTimeSpentSeconds ?? set.scores?.reduce((sum, sc) => sum + (sc.timeSpentSeconds || 0), 0) ?? 0;
      if (timeFilter === 'OVERDUE' && (dur < 900 || set.status === 'COMPLETED')) return false;
      if (timeFilter === 'ACTIVE' && (dur < 300 || dur >= 900)) return false;
      if (timeFilter === 'FAST' && (dur <= 0 || dur >= 300)) return false;
      if (timeFilter === 'ZERO' && dur > 0) return false;
    }

    if (!q) return true;
    if (String(set.setNumber || '').toLowerCase().includes(q)) return true;
    if (set.judge?.name?.toLowerCase().includes(q)) return true;
    if (getSetRange(set.projects).toLowerCase().includes(q)) return true;
    return set.projects?.some((sp) => {
      const title = (sp.project?.title || '').toLowerCase();
      const team = (sp.project?.team?.name || '').toLowerCase();
      const num = (sp.project?.teamNumber || '').toLowerCase();
      const room = (sp.project?.roomNumber || '').toLowerCase();
      return title.includes(q) || team.includes(q) || num.includes(q) || room.includes(q);
    });
  };

  const sortSets = (list) => {
    if (sortBy === 'LONGEST') {
      return [...list].sort((a, b) => {
        const durA = a.totalTimeSpentSeconds ?? a.scores?.reduce((sum, s) => sum + (s.timeSpentSeconds || 0), 0) ?? 0;
        const durB = b.totalTimeSpentSeconds ?? b.scores?.reduce((sum, s) => sum + (s.timeSpentSeconds || 0), 0) ?? 0;
        return durB - durA;
      });
    }
    if (sortBy === 'RECENT') {
      return [...list].sort((a, b) => new Date(b.lastActiveAt || 0) - new Date(a.lastActiveAt || 0));
    }
    return list;
  };

  // Status counts
  const totalCount = sets.length;
  const inProgressCount = sets.filter((s) => s.status === 'IN_PROGRESS').length;
  const completedCount = sets.filter((s) => s.status === 'COMPLETED').length;
  const unassignedCount = sets.filter((s) => s.status === 'UNASSIGNED').length;
  const idleJudgesCount = idleJudges.filter((j) => j.isIdle).length;

  // Tie breaker sets (setNumber === 0 or column === 0)
  const tieBreakers = sets.filter((s) => s.setNumber === 0 || s.column === 0);

  if (!activeEvent && events.length === 0) {
    return (
      <div>
        <PageHeader title="Judging Floor Assignments" subtitle="MLH 3-round evaluation matrix" />
        <Card style={{ textAlign: 'center', padding: '48px 24px' }}>
          <EmptyState
            icon={Network}
            title="No Active Event"
            description="Please mark an event as Active in Events & Setup to manage judging assignments."
            action={
              <Button variant="primary" onClick={() => navigate('/admin/events')}>
                Go to Events
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Judging Floor Assignments"
        subtitle={`MLH 3-round evaluation matrix and evaluator allocation for ${currentEvent?.name || 'event'}`}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isJudging && (
              <Badge variant="warning" dot pulse icon={Lock}>
                Judging In Progress
              </Badge>
            )}

            <Button
              variant="secondary"
              icon={Users}
              onClick={() => openManualAssign()}
              title="Manually allocate idle evaluators to sets"
            >
              Manual Assign
              {idleJudgesCount > 0 && (
                <span
                  style={{
                    marginLeft: 6,
                    padding: '1px 7px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 700,
                    background: 'var(--accent)',
                    color: '#fff'
                  }}
                >
                  {idleJudgesCount} idle
                </span>
              )}
            </Button>

            <Button
              variant="primary"
              icon={Sparkles}
              loading={loading}
              onClick={handleGenerate}
              title={isJudging ? 'Regenerating sets while judging is active requires confirmation' : 'Generate partitioned judging sets'}
            >
              Generate Sets
            </Button>
          </div>
        }
      />

      {/* Unified Filter and Search Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          marginBottom: 20,
          flexWrap: 'wrap'
        }}
      >
        <SearchField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search judge, team, room number, or team range..."
          style={{ width: 520, minWidth: 420, maxWidth: 600 }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SegmentedControl
            size="sm"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { id: 'ALL', label: 'All', badge: totalCount },
              { id: 'IN_PROGRESS', label: 'In Progress', badge: inProgressCount },
              { id: 'COMPLETED', label: 'Completed', badge: completedCount },
              { id: 'UNASSIGNED', label: 'Unassigned', badge: unassignedCount }
            ]}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', fontWeight: 500 }}>
              Duration:
            </span>
            <Select
              size="sm"
              width={160}
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'All Durations' },
                { value: 'OVERDUE', label: '⚠️ Stalled (>15m)' },
                { value: 'ACTIVE', label: 'Active (5–15m)' },
                { value: 'FAST', label: 'Quick (<5m)' },
                { value: 'ZERO', label: 'Not Started' }
              ]}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', fontWeight: 500 }}>
              Order:
            </span>
            <Select
              size="sm"
              width={175}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              options={[
                { value: 'DEFAULT', label: 'Default (Set #)' },
                { value: 'LONGEST', label: 'Longest Active First' },
                { value: 'RECENT', label: 'Recently Active First' }
              ]}
            />
          </div>
        </div>
      </div>

      {sets.length === 0 ? (
        <Card>
          <EmptyState
            icon={Network}
            title="No Evaluation Sets Generated"
            description="Generate partitioned evaluation sets to allocate judging blocks across 3 waves as per the MLH protocol."
            action={
              <Button variant="primary" icon={Sparkles} onClick={handleGenerate} loading={loading}>
                Generate Initial Sets
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {/* ── Tie Breaker Section (Round 0) ── */}
          {tieBreakers.length > 0 && (
            <div
              style={{
                marginBottom: 24,
                padding: 16,
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255, 159, 10, 0.05)',
                border: '1px solid rgba(255, 159, 10, 0.35)',
                boxShadow: '0 4px 20px rgba(255, 159, 10, 0.08)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Trophy size={18} style={{ color: '#ff9f0a' }} />
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                      Tie Breaker Evaluation (Round 0)
                    </h3>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Targeted evaluation blocks generated to resolve tied podium positions
                    </span>
                  </div>
                </div>
                <Badge variant="warning" dot pulse>
                  Action Required
                </Badge>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 14 }}>
                {sortSets(tieBreakers.filter(filterSet)).map((set) => (
                  <div
                    key={set.id}
                    className="mlh-set-card status-tie-breaker"
                    style={{ background: 'var(--bg-surface-elevated)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                          Tie Breaker @ Position #{set.baseRank || '?'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                          {set.projects?.length || 0} contending projects
                        </div>
                      </div>
                      <Badge
                        variant={set.status === 'COMPLETED' ? 'success' : set.status === 'IN_PROGRESS' ? 'warning' : 'danger'}
                        size="sm"
                      >
                        {set.status}
                      </Badge>
                    </div>

                    {set.judge ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                        <User size={14} style={{ color: 'var(--accent)' }} />
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{set.judge.name}</span>
                        {set.judge.phone && (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>· {set.judge.phone}</span>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent-danger)' }}>
                        <AlertTriangle size={14} />
                        <span>No judge assigned</span>
                      </div>
                    )}

                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, background: 'rgba(255, 255, 255, 0.02)', padding: '6px 8px', borderRadius: 'var(--radius-xs)' }}>
                      {set.projects?.map((sp) => sp.project?.team?.name || sp.project?.title).join(' · ')}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
                      {set.status !== 'COMPLETED' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={Plus}
                          onClick={() => openManualAssign(set)}
                        >
                          Assign Judge
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Eye}
                        onClick={() => navigate(`/admin/sets/${set.id}`)}
                      >
                        Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── MLH 3-Column Wave Board (Set 1, Set 2, Set 3) ── */}
          <div className="mlh-assignments-grid">
            {MLH_COLUMNS.map((colConfig) => {
              const col = colConfig.id;
              const colSets = sets
                .filter((s) => s.column === col && s.setNumber > 0)
                .sort((a, b) => (a.setNumber || 0) - (b.setNumber || 0));

              const filteredSets = sortSets(colSets.filter(filterSet));
              const completed = colSets.filter((s) => s.status === 'COMPLETED').length;
              const inProgress = colSets.filter((s) => s.status === 'IN_PROGRESS').length;
              const unassigned = colSets.filter((s) => s.status === 'UNASSIGNED').length;
              const progressPct = colSets.length > 0 ? Math.round((completed / colSets.length) * 100) : 0;

              return (
                <div key={col} className="mlh-column">
                  {/* Column Header */}
                  <div className={`mlh-column-header col-${col}`}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: colConfig.color,
                            boxShadow: `0 0 8px ${colConfig.color}90`
                          }}
                        />
                        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                          {colConfig.name}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: colConfig.color,
                            background: colConfig.bg,
                            border: `1px solid ${colConfig.border}`,
                            padding: '1px 7px',
                            borderRadius: 10
                          }}
                        >
                          {colConfig.round}
                        </span>
                      </div>

                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>
                        {search || statusFilter !== 'ALL'
                          ? `${filteredSets.length}/${colSets.length} blocks`
                          : `${colSets.length} blocks`}
                      </span>
                    </div>

                    {/* Metric pills */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                      <span style={{ color: 'var(--accent-success)', fontWeight: 600 }}>
                        ✓ {completed}
                      </span>
                      <span style={{ color: 'var(--accent-warning)', fontWeight: 600 }}>
                        ⏳ {inProgress}
                      </span>
                      <span style={{ color: 'var(--text-tertiary)' }}>
                        ○ {unassigned}
                      </span>
                      <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {progressPct}%
                      </span>
                    </div>

                    {/* Slim progress bar at bottom of header */}
                    <div
                      className="mlh-column-progress"
                      style={{
                        width: `${progressPct}%`,
                        background: colConfig.color
                      }}
                    />
                  </div>

                  {/* Vertically Stacked Set Cards */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {filteredSets.length === 0 ? (
                      <div
                        style={{
                          padding: '32px 16px',
                          textAlign: 'center',
                          color: 'var(--text-tertiary)',
                          fontSize: 13,
                          background: 'var(--bg-surface-elevated)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px dashed var(--border-subtle)'
                        }}
                      >
                        No matching blocks in {colConfig.name}
                      </div>
                    ) : (
                      filteredSets.map((set) => {
                        const totalTime = set.scores?.reduce((sum, sc) => sum + (sc.timeSpentSeconds || 0), 0);
                        const isSetComplete = set.status === 'COMPLETED';
                        const isSetInProgress = set.status === 'IN_PROGRESS';

                        return (
                          <div
                            key={set.id}
                            className={`mlh-set-card status-${set.status.toLowerCase().replace('_', '-')}`}
                          >
                            {/* Card Top: Set Identifier & Status */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                                    Set #{set.setNumber}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      padding: '2px 8px',
                                      borderRadius: 6,
                                      background: 'rgba(255, 255, 255, 0.05)',
                                      color: 'var(--text-secondary)',
                                      border: '1px solid var(--border-subtle)'
                                    }}
                                  >
                                    Teams {getSetRange(set.projects)}
                                  </span>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                  {set.projects?.length || 0} teams in this wave
                                </div>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                {isSetComplete ? (
                                  <Badge variant="success" size="sm" icon={CheckCircle2}>
                                    Complete
                                  </Badge>
                                ) : isSetInProgress ? (
                                  <Badge variant="warning" size="sm" dot pulse>
                                    In Progress
                                  </Badge>
                                ) : (
                                  <Badge variant="default" size="sm">
                                    Unassigned
                                  </Badge>
                                )}

                                {totalTime > 0 && (
                                  <span
                                    style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}
                                    title="Total judging time spent"
                                  >
                                    <Clock size={12} />
                                    {fmtTime(totalTime)}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Evaluator / Judge Box */}
                            <div
                              style={{
                                padding: '10px 12px',
                                borderRadius: 'var(--radius-sm)',
                                background: set.judge ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 159, 10, 0.04)',
                                border: `1px solid ${set.judge ? 'var(--border-subtle)' : 'rgba(255, 159, 10, 0.2)'}`,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 6
                              }}
                            >
                              {/* Row 1: Evaluator Name & Actions */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                  <User size={14} style={{ color: set.judge ? 'var(--accent)' : 'var(--text-tertiary)', flexShrink: 0 }} />
                                  <span
                                    style={{
                                      fontWeight: 600,
                                      fontSize: 13,
                                      color: set.judge ? 'var(--text-primary)' : 'var(--accent-warning)',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis'
                                    }}
                                  >
                                    {set.judge ? set.judge.name : 'No Evaluator Assigned'}
                                  </span>
                                </div>

                                <div style={{ flexShrink: 0 }}>
                                  {set.judge ? (
                                    !isSetComplete && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openReassignModal(set);
                                          }}
                                          style={{
                                            background: 'var(--accent-tint)',
                                            border: '1px solid var(--accent)',
                                            color: 'var(--accent)',
                                            fontSize: 11,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            padding: '2px 8px',
                                            borderRadius: 'var(--radius-pill)',
                                            transition: 'all var(--transition-fast)'
                                          }}
                                          title="Reassign this set to another eligible judge"
                                        >
                                          Reassign
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setUnassignTargetSet(set);
                                          }}
                                          style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: 'var(--accent-danger)',
                                            fontSize: 11,
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            padding: '2px 6px'
                                          }}
                                          title="Unassign judge from this set"
                                        >
                                          Unassign
                                        </button>
                                      </div>
                                    )
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => openManualAssign(set)}
                                      style={{
                                        background: 'var(--accent)',
                                        border: 'none',
                                        color: '#fff',
                                        fontSize: 11,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        padding: '3px 10px',
                                        borderRadius: 'var(--radius-pill)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4
                                      }}
                                    >
                                      + Assign
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Row 2: Phone & Room Location Telemetry */}
                              {set.judge && (set.judge.phone || set.recentLocation) && (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    fontSize: 11,
                                    color: 'var(--text-tertiary)',
                                    flexWrap: 'wrap',
                                    paddingTop: 4,
                                    borderTop: '1px solid rgba(255, 255, 255, 0.04)'
                                  }}
                                >
                                  {set.judge.phone && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                                      <Phone size={10} style={{ color: 'var(--text-tertiary)' }} />
                                      <span>{set.judge.phone}</span>
                                    </span>
                                  )}

                                  {set.judge.phone && set.recentLocation && (
                                    <span style={{ color: 'var(--text-tertiary)', opacity: 0.4 }}>·</span>
                                  )}

                                  {set.recentLocation && (
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        whiteSpace: 'nowrap',
                                        color: set.locationStatus === 'ACTIVE' ? 'var(--accent)' : 'var(--text-secondary)',
                                        fontWeight: set.locationStatus === 'ACTIVE' ? 600 : 400
                                      }}
                                      title={
                                        set.locationStatus === 'ACTIVE'
                                          ? `Currently evaluating in ${cleanRoom(set.recentLocation)}`
                                          : `Last room evaluated: ${cleanRoom(set.recentLocation)}`
                                      }
                                    >
                                      <MapPin size={10} style={{ color: set.locationStatus === 'ACTIVE' ? 'var(--accent)' : 'var(--text-tertiary)' }} />
                                      <span>
                                        {set.locationStatus === 'ACTIVE' ? 'Now: ' : 'Last: '}
                                        {cleanRoomBadge(set.recentLocation)}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Projects In Set List */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {(() => {
                                const scoredProjectIds = new Set(set.scores?.map((s) => s.projectId) || []);
                                const activePid = set.activeProjectId || (isSetInProgress ? set.projects?.find((p) => !scoredProjectIds.has(p.projectId))?.projectId : null);

                                return set.projects?.map((sp, idx) => {
                                  const isScored = scoredProjectIds.has(sp.projectId);
                                  const isActive = isSetInProgress && sp.projectId === activePid;

                                  return (
                                    <div
                                      key={sp.projectId}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        fontSize: 12,
                                        padding: '4px 8px',
                                        borderRadius: 'var(--radius-xs)',
                                        background: isActive
                                          ? 'rgba(10, 132, 255, 0.08)'
                                          : isScored
                                          ? 'rgba(255, 255, 255, 0.015)'
                                          : 'rgba(255, 255, 255, 0.02)',
                                        border: isActive ? '1px solid rgba(10, 132, 255, 0.3)' : '1px solid transparent',
                                        transition: 'all 0.15s ease'
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', flex: 1, paddingRight: 8 }}>
                                        <span
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            minWidth: 16,
                                            fontSize: 11,
                                            color: isScored
                                              ? 'var(--accent-success)'
                                              : isActive
                                              ? 'var(--accent)'
                                              : 'var(--text-tertiary)',
                                            fontWeight: isActive ? 700 : 400
                                          }}
                                        >
                                          {isScored ? (
                                            <Check size={12} strokeWidth={2.5} />
                                          ) : isActive ? (
                                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
                                          ) : (
                                            `${idx + 1}.`
                                          )}
                                        </span>
                                        <span
                                          style={{
                                            fontWeight: isActive ? 600 : 500,
                                            color: isScored
                                              ? 'var(--text-secondary)'
                                              : isActive
                                              ? 'var(--text-primary)'
                                              : 'var(--text-primary)',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                          }}
                                        >
                                          {sp.project?.team?.name || sp.project?.title}
                                        </span>
                                        {sp.project?.teamNumber && (
                                          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                            ({sp.project.teamNumber})
                                          </span>
                                        )}
                                      </div>

                                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                                        {isActive && (
                                          <span
                                            style={{
                                              fontSize: 9,
                                              fontWeight: 700,
                                              color: 'var(--accent)',
                                              background: 'rgba(10, 132, 255, 0.15)',
                                              padding: '1px 5px',
                                              borderRadius: 4,
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.04em'
                                            }}
                                          >
                                            Now
                                          </span>
                                        )}
                                        <span
                                          className={`apple-badge ${isScored ? 'apple-badge-success' : isActive ? 'apple-badge-primary' : 'apple-badge-default'} apple-badge-sm`}
                                          style={{ fontSize: 10, padding: '1px 6px' }}
                                        >
                                          {cleanRoomBadge(sp.project?.roomNumber)}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                });
                              })()}
                            </div>

                            {/* Card Footer Actions */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                paddingTop: 10,
                                borderTop: '1px solid var(--border-subtle)',
                                marginTop: 'auto'
                              }}
                            >
                              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                {set.scores?.length || 0}/{set.projects?.length || 0} scored
                              </div>

                              <div>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/admin/sets/${set.id}`)}
                                  className="apple-btn apple-btn-secondary apple-btn-sm"
                                  style={{ fontSize: 12, height: 28, padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                  title={isSetComplete ? 'Inspect finalized evaluation and rubric scores' : isSetInProgress ? 'Inspect live judge scoring progress' : 'View set projects and details'}
                                >
                                  <Eye size={13} />
                                  <span>{isSetComplete ? 'View Evaluation' : isSetInProgress ? 'Live Inspection' : 'Set Details'}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Manual Evaluator Allocation Modal with MLH Overlap Protection ── */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title="Manual Evaluator Allocation"
        subtitle="Assign an available judge to an unassigned set with automated conflict check"
        maxWidth="780px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {selectedJudge && selectedSet ? (
                <span>
                  Assigning <strong>Col {selectedSet.column} · Set #{selectedSet.setNumber}</strong> ({getSetRange(selectedSet.projects)}) → <strong>{selectedJudge.name}</strong>
                </span>
              ) : (
                <span>Select a judge and an unassigned set to continue</span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" onClick={() => setShowAssignModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={assigning}
                disabled={!selectedJudge || !selectedSet}
                onClick={handleManualAssign}
              >
                Confirm Assignment
              </Button>
            </div>
          </div>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, minHeight: 380 }}>
          {/* Left Panel: Judges Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderRight: '1px solid var(--border-subtle)', paddingRight: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-tertiary)' }}>
                Evaluators ({idleJudges.length})
              </span>
              <span style={{ fontSize: 11, color: 'var(--accent-success)', fontWeight: 600 }}>
                {idleJudges.filter((j) => j.isIdle).length} Idle
              </span>
            </div>

            <input
              type="text"
              placeholder="Filter judges..."
              value={judgeSearch}
              onChange={(e) => setJudgeSearch(e.target.value)}
              className="apple-input is-sm"
              style={{ width: '100%', marginBottom: 4 }}
            />

            <div style={{ overflowY: 'auto', maxHeight: 320, display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
              {idleJudges
                .filter((j) => !judgeSearch || j.name.toLowerCase().includes(judgeSearch.toLowerCase()))
                .map((judge) => {
                  const isSelected = selectedJudge?.id === judge.id;

                  return (
                    <div
                      key={judge.id}
                      onClick={() => setSelectedJudge(judge)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        background: isSelected ? 'var(--accent-tint)' : 'rgba(255, 255, 255, 0.03)',
                        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                        transition: 'all var(--transition-fast)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: judge.isIdle ? 'var(--accent-success)' : 'var(--accent-warning)',
                              boxShadow: `0 0 6px ${judge.isIdle ? 'var(--accent-success)' : 'var(--accent-warning)'}80`,
                              flexShrink: 0
                            }}
                          />
                          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                            {judge.name}
                          </span>
                        </div>

                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: 10,
                            background: judge.isIdle ? 'rgba(48, 209, 88, 0.12)' : 'rgba(255, 159, 10, 0.12)',
                            color: judge.isIdle ? 'var(--accent-success)' : 'var(--accent-warning)'
                          }}
                        >
                          {judge.isIdle ? 'Idle' : 'Busy'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, marginLeft: 16 }}>
                        <span>{judge.completedSets || 0}/{judge.totalSets || 0} sets done</span>
                        {judge.phone && <span>· {judge.phone}</span>}
                        {judge.recentLocation && <span>· R.{judge.recentLocation}</span>}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Right Panel: Unassigned Sets with Conflict Detection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-tertiary)' }}>
                Unassigned Sets
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {sets.filter((s) => s.status === 'UNASSIGNED').length} available
              </span>
            </div>

            {!selectedJudge ? (
              <div
                style={{
                  height: 300,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-tertiary)',
                  fontSize: 13,
                  textAlign: 'center',
                  border: '1px dashed var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 20
                }}
              >
                ← Select an evaluator to inspect conflict checks and assign a block
              </div>
            ) : (
              <div style={{ overflowY: 'auto', maxHeight: 330, display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
                {(() => {
                  const evalSet = new Set(selectedJudge.evaluatedProjectIds || []);
                  const unassigned = sets.filter((s) => s.status === 'UNASSIGNED');

                  if (unassigned.length === 0) {
                    return (
                      <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '30px 10px', textAlign: 'center' }}>
                        All judging sets have evaluators assigned!
                      </div>
                    );
                  }

                  return unassigned.map((set) => {
                    const hasConflict = set.projects?.some((sp) => evalSet.has(sp.projectId));
                    const isSelected = selectedSet?.id === set.id;

                    return (
                      <div
                        key={set.id}
                        onClick={() => !hasConflict && setSelectedSet(isSelected ? null : set)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-sm)',
                          cursor: hasConflict ? 'not-allowed' : 'pointer',
                          background: isSelected ? 'var(--accent-tint)' : 'rgba(255, 255, 255, 0.03)',
                          border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                          opacity: hasConflict ? 0.45 : 1,
                          transition: 'all var(--transition-fast)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                            {set.column > 0 ? `Set ${set.column} (Wave ${set.column})` : 'Tie Breaker'} · Set #{set.setNumber}
                          </span>

                          {hasConflict ? (
                            <span style={{ fontSize: 10, color: 'var(--accent-danger)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                              <AlertTriangle size={12} /> Conflict: Judged Earlier
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              Teams {getSetRange(set.projects)}
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.4 }}>
                          {set.projects?.map((sp) => sp.project?.team?.name || sp.project?.title).join(' · ')}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Unassign Confirmation Modal */}
      {unassignTargetSet && (
        <Modal
          isOpen={true}
          onClose={() => !unassigning && setUnassignTargetSet(null)}
          title="Unassign Evaluator"
          subtitle={`Set #${unassignTargetSet.setNumber}`}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setUnassignTargetSet(null)}
                disabled={unassigning}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={confirmUnassign}
                loading={unassigning}
              >
                Unassign Judge
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(255, 69, 58, 0.08)', border: '1px solid rgba(255, 69, 58, 0.2)' }}>
              <AlertTriangle size={20} style={{ color: 'var(--accent-danger)', flexShrink: 0 }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Are you sure you want to unassign <strong style={{ color: 'var(--text-primary)' }}>{unassignTargetSet.judge?.name}</strong> from <strong style={{ color: 'var(--text-primary)' }}>Set #{unassignTargetSet.setNumber}</strong>?
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.5 }}>
              This set will return to the unassigned queue. Any uncommitted evaluation drafts for this set will be cleared so another evaluator can pick it up cleanly.
            </p>
          </div>
        </Modal>
      )}

      {/* ── Safe Reassignment Modal with Eligibility Check & Conflict Prevention ── */}
      {reassignTargetSet && (
        <Modal
          isOpen={reassignModalOpen}
          onClose={() => !reassigning && setReassignModalOpen(false)}
          title={`Reassign Set #${reassignTargetSet.setNumber}`}
          subtitle={`Currently allocated to ${reassignTargetSet.judge?.name || 'Evaluator'}`}
          maxWidth="640px"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {selectedReplacementJudge ? (
                  <span>
                    New Evaluator: <strong style={{ color: 'var(--accent)' }}>{selectedReplacementJudge.name}</strong>
                  </span>
                ) : (
                  <span>Select an eligible replacement evaluator</span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  variant="secondary"
                  onClick={() => setReassignModalOpen(false)}
                  disabled={reassigning}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleConfirmReassign}
                  disabled={!selectedReplacementJudge}
                  loading={reassigning}
                >
                  Confirm Reassignment
                </Button>
              </div>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Context Box */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Set #{reassignTargetSet.setNumber} · {reassignTargetSet.column > 0 ? `Wave ${reassignTargetSet.column}` : 'Tie Breaker'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  Teams {getSetRange(reassignTargetSet.projects)} ({reassignTargetSet.projects?.length || 0} teams)
                </div>
              </div>
              <Badge variant="warning" dot pulse>
                In Progress
              </Badge>
            </div>

            {/* Replacement Evaluators List */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-tertiary)' }}>
                  Available Replacement Evaluators
                </span>
                <span style={{ fontSize: 11, color: 'var(--accent-success)', fontWeight: 600 }}>
                  {eligibleJudges.filter((j) => j.isEligible).length} Eligible
                </span>
              </div>

              {loadingEligible ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                  Verifying evaluator eligibility and evaluating project overlap...
                </div>
              ) : eligibleJudges.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                  No other evaluators registered for this event.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto', paddingRight: 4 }}>
                  {eligibleJudges.map((judge) => {
                    const isSelected = selectedReplacementJudge?.id === judge.id;
                    const canSelect = judge.isEligible;

                    return (
                      <div
                        key={judge.id}
                        onClick={() => canSelect && setSelectedReplacementJudge(judge)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-sm)',
                          cursor: canSelect ? 'pointer' : 'not-allowed',
                          background: isSelected ? 'var(--accent-tint)' : 'rgba(255, 255, 255, 0.03)',
                          border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                          opacity: canSelect ? 1 : 0.5,
                          transition: 'all var(--transition-fast)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: canSelect ? 'var(--accent-success)' : 'var(--accent-danger)',
                                boxShadow: `0 0 6px ${canSelect ? 'var(--accent-success)' : 'var(--accent-danger)'}80`,
                                flexShrink: 0
                              }}
                            />
                            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                              {judge.name}
                            </span>
                            {judge.phone && (
                              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>· {judge.phone}</span>
                            )}
                          </div>

                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              padding: '1px 7px',
                              borderRadius: 10,
                              background: canSelect ? 'rgba(48, 209, 88, 0.12)' : 'rgba(255, 69, 58, 0.12)',
                              color: canSelect ? 'var(--accent-success)' : 'var(--accent-danger)'
                            }}
                          >
                            {canSelect ? 'Eligible' : 'Conflict / Ineligible'}
                          </span>
                        </div>

                        <div style={{ fontSize: 11, color: canSelect ? 'var(--text-secondary)' : 'var(--accent-danger)', marginTop: 4, marginLeft: 16 }}>
                          {judge.reason}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Optional Reason / Notes */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Reassignment Reason (Logged for Audit Trail)
              </label>
              <input
                type="text"
                placeholder="e.g., Evaluator had an emergency / hardware issue / stepped away"
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                className="apple-input"
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
