import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import PageHeader from '../../components/ui/PageHeader';
import Card, { StatCard } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import SegmentedControl from '../../components/ui/SegmentedControl';
import Modal from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import EmptyState from '../../components/ui/EmptyState';
import SyncStatusPill from '../../components/ui/SyncStatusPill';
import { cacheSet, getAllCachedSets } from '../../services/idb';
import { getSetRange } from '../../utils/formatters';
import {
  Layers,
  CheckCircle2,
  Clock,
  Play,
  ArrowRight,
  Eye,
  FileText,
  AlertTriangle,
  Sparkles,
  Lock,
  Flag
} from '../../components/ui/icons';

export default function JudgeDashboard({ isAdminView }) {
  const { viewAsJudgeId } = useParams();
  const { info, error: toastError, success } = useToast();
  const { activeEvent } = useActiveEvent();
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [sets, setSets] = useState([]);
  const [userFlags, setUserFlags] = useState({});
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('inProgress');
  const [editModal, setEditModal] = useState(false);
  const [selectedSet, setSelectedSet] = useState(null);
  const [requestReason, setRequestReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const socket = useSocket();

  useEffect(() => {
    api.get('/events').then((r) => {
      setEvents(r.data);
      if (activeEvent) {
        setEventId(activeEvent.id);
      } else if (r.data.length > 0) {
        setEventId(r.data[0].id);
      }
    });
  }, [activeEvent]);

  const loadSets = useCallback(() => {
    if (eventId) {
      // 1. Load from IndexedDB for instant offline viewing
      getAllCachedSets(eventId)
        .then((cached) => {
          if (cached?.length > 0) setSets(cached);
        })
        .catch(() => {});

      // 2. Fetch fresh sets from network
      const url = isAdminView
        ? `/events/${eventId}/assignments/judge/${viewAsJudgeId}`
        : `/events/${eventId}/assignments/my-sets`;
      api.get(url)
        .then((r) => {
          setSets(r.data);
          if (Array.isArray(r.data)) {
            r.data.forEach((s) => cacheSet(s).catch(() => {}));
          }
        })
        .catch((err) => {
          console.warn('[Dashboard] Network fetch failed; showing cached sets', err);
        });

      // 3. Fetch judge's own flags
      api.get(`/events/${eventId}/flags${isAdminView && viewAsJudgeId ? `?judgeId=${viewAsJudgeId}` : ''}`)
        .then((r) => {
          const map = {};
          (r.data || []).forEach((f) => {
            if (!f.reason?.startsWith('[ABSENT')) {
              map[f.projectId] = f;
            }
          });
          setUserFlags(map);
        })
        .catch(() => {});
    }
  }, [eventId, isAdminView, viewAsJudgeId]);

  useEffect(() => {
    loadSets();
  }, [loadSets]);

  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => loadSets();
    socket.on('event:statusChanged', handleUpdate);
    socket.on('assignment:new', handleUpdate);
    socket.on('edit-request:statusChanged', handleUpdate);
    socket.on('flag:created', handleUpdate);
    socket.on('flag:updated', handleUpdate);
    return () => {
      socket.off('event:statusChanged', handleUpdate);
      socket.off('assignment:new', handleUpdate);
      socket.off('edit-request:statusChanged', handleUpdate);
      socket.off('flag:created', handleUpdate);
      socket.off('flag:updated', handleUpdate);
    };
  }, [socket, loadSets]);

  const requestNext = async () => {
    setLoading(true);
    try {
      const res = await api.post(`/events/${eventId}/assignments/next`);
      if (res.data.set) {
        success('New set allocated to your queue!');
        loadSets();
      } else {
        info('All project sets are currently assigned or completed.', 'Queue Empty');
      }
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to request a new set');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestEdit = async (e) => {
    e.preventDefault();
    if (!requestReason.trim()) return;
    setIsSubmitting(true);
    try {
      await api.post('/edit-requests/request', { setId: selectedSet.id, reason: requestReason });
      setEditModal(false);
      setRequestReason('');
      success('Edit unlock request sent to hackathon organizers');
      loadSets();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to submit unlock request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inProgressSets = sets.filter((s) => s.status === 'IN_PROGRESS');
  const completedSets = sets.filter((s) => s.status === 'COMPLETED');
  const activeSet = inProgressSets[0];

  const getScoreUrl = (setId) => {
    return isAdminView
      ? `/admin/view-judge/${viewAsJudgeId}/score/${setId}`
      : `/judge/score/${setId}`;
  };

  const getViewUrl = (setId) => {
    return isAdminView
      ? `/admin/view-judge/${viewAsJudgeId}/score/${setId}`
      : `/judge/view/${setId}`;
  };

  return (
    <div>
      <PageHeader
        title={isAdminView ? "Judge Simulation" : "Judge Evaluation Queue"}
        subtitle={isAdminView ? `Simulating evaluations as Judge ID: ${viewAsJudgeId}` : "Evaluate assigned projects, record criteria scores, and submit stack rankings"}
        badge={
          isAdminView ? (
            <Badge variant="warning">Admin View</Badge>
          ) : (
            <Badge variant="primary" dot pulse={inProgressSets.length > 0}>
              {inProgressSets.length > 0 ? "Active Set Ready" : "Queue Idle"}
            </Badge>
          )
        }
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SyncStatusPill />
            {!isAdminView && inProgressSets.length === 0 && (
              <Button
                variant="primary"
                size="md"
                icon={Sparkles}
                loading={loading}
                onClick={requestNext}
              >
                Request Next Set
              </Button>
            )}
          </div>
        }
      />

      {/* Metrics Header */}
      <div className="apple-stats-grid" style={{ marginBottom: 24 }}>
        <StatCard
          label="Active Set"
          value={inProgressSets.length}
          subvalue={inProgressSets.length > 0 ? "In evaluation" : "No active set"}
          icon={Layers}
          variant={inProgressSets.length > 0 ? "primary" : "default"}
        />

        <StatCard
          label="Completed Sets"
          value={completedSets.length}
          subvalue="Evaluations submitted"
          icon={CheckCircle2}
          variant="success"
        />

        <StatCard
          label="Total Projects Evaluated"
          value={completedSets.reduce((acc, s) => acc + (s.projects?.length || 0), 0)}
          subvalue="Projects graded"
          icon={Clock}
          variant="default"
        />
      </div>

      {/* Hero: Active in-progress set card */}
      {activeSet && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8 }}>
            Current Assignment
          </div>
          <Card
            style={{
              background: 'linear-gradient(135deg, rgba(10, 132, 255, 0.08), rgba(88, 86, 214, 0.04))',
              border: '1px solid rgba(10, 132, 255, 0.3)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Set #{activeSet.setNumber}
                  </h3>
                  {getSetRange(activeSet.projects) && (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-subtle)'
                      }}
                    >
                      Teams {getSetRange(activeSet.projects)}
                    </span>
                  )}
                  <Badge variant="warning" dot pulse>In Progress</Badge>
                  {activeSet.setNumber === 0 && (
                    <Badge variant="danger">⚡ Tie-Breaker Round</Badge>
                  )}
                </div>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                  {activeSet.projects?.length || 0} projects assigned for evaluation
                </p>
              </div>

              <Button
                variant="primary"
                size="lg"
                icon={Play}
                onClick={() => navigate(getScoreUrl(activeSet.id))}
              >
                Continue Evaluation
              </Button>
            </div>

            {/* List of projects in this set */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {activeSet.projects?.map((sp, idx) => {
                const p = sp.project;
                const isScored = activeSet.scores?.some((s) => s.projectId === p.id);
                const isFlaggedByMe = !!userFlags[p.id];
                const roomText = p.roomNumber
                  ? (p.roomNumber.toLowerCase().startsWith('room') ? p.roomNumber : `Room ${p.roomNumber}`)
                  : 'Room TBD';

                return (
                  <div
                    key={p.id}
                    style={{
                      padding: '14px 16px',
                      background: 'var(--bg-surface-elevated)',
                      border: `1px solid ${isFlaggedByMe ? 'rgba(255, 69, 58, 0.35)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      minHeight: 90,
                      gap: 10
                    }}
                  >
                    {/* Header: Project Title on Left, Scored/Pending Badge on Right */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)', lineHeight: 1.35 }}>
                        {idx + 1}. {p.title}
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        {isScored ? (
                          <Badge variant="success" size="sm" icon={CheckCircle2}>Scored</Badge>
                        ) : (
                          <Badge variant="default" size="sm">Pending</Badge>
                        )}
                      </div>
                    </div>

                    {/* Footer: Room & Team on Left, Flagged Badge on Right */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                        <strong style={{ color: 'var(--text-secondary)' }}>{roomText}</strong>
                        {p.teamNumber ? ` • Team ${p.teamNumber}` : ''}
                      </div>

                      {isFlaggedByMe && (
                        <Badge variant="danger" size="xs" icon={Flag} title={userFlags[p.id].reason}>
                          Flagged by you
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Tabs: Active vs Completed */}
      <div style={{ marginBottom: 16 }}>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { id: 'inProgress', label: 'Active Queue', count: inProgressSets.length },
            { id: 'completed', label: 'Completed Sets', count: completedSets.length }
          ]}
        />
      </div>

      {tab === 'inProgress' ? (
        inProgressSets.length === 0 ? (
          <Card>
            <EmptyState
              icon={Layers}
              title="No Active Sets"
              description="You do not have any set in progress right now. Request your next judging assignment when ready."
              action={
                !isAdminView && (
                  <Button variant="primary" icon={Sparkles} loading={loading} onClick={requestNext}>
                    Request Next Assignment
                  </Button>
                )
              }
            />
          </Card>
        ) : null
      ) : (
        /* Completed Sets list */
        completedSets.length === 0 ? (
          <Card>
            <EmptyState
              icon={CheckCircle2}
              title="No Completed Sets Yet"
              description="Submitted sets will appear here for review and historical reference."
            />
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {completedSets.map((set) => {
              const latestEdit = set.editRequests?.[0];
              const flaggedProjectsInSet = (set.projects || []).filter((sp) => userFlags[(sp.project || sp).id]);

              return (
                <Card
                  key={set.id}
                  headerBorder={false}
                  style={{ padding: 18 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                        <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Set #{set.setNumber}
                        </h4>
                        {getSetRange(set.projects) && (
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
                        )}
                        <Badge variant="success" icon={CheckCircle2}>Submitted</Badge>
                        {flaggedProjectsInSet.length > 0 && (
                          <Badge variant="danger" icon={Flag} size="sm">
                            {flaggedProjectsInSet.length} Flagged by you
                          </Badge>
                        )}
                        {latestEdit?.status === 'PENDING' && (
                          <Badge variant="warning">Unlock Requested</Badge>
                        )}
                        {latestEdit?.status === 'APPROVED' && (
                          <Badge variant="primary">Unlock Approved</Badge>
                        )}
                      </div>
                      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                        {set.projects?.length || 0} projects evaluated
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={Eye}
                        onClick={() => navigate(getViewUrl(set.id))}
                      >
                        View Scores
                      </Button>

                      {!isAdminView && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Lock}
                          onClick={() => {
                            setSelectedSet(set);
                            setEditModal(true);
                          }}
                        >
                          Request Edit
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Project tags with any flagged indicators */}
                  {set.projects?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                      {set.projects.map((sp) => {
                        const p = sp.project || sp;
                        const isFlaggedByMe = !!userFlags[p.id];
                        return (
                          <div
                            key={p.id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '4px 10px',
                              borderRadius: 'var(--radius-sm)',
                              background: isFlaggedByMe ? 'rgba(255, 69, 58, 0.1)' : 'var(--bg-surface)',
                              border: `1px solid ${isFlaggedByMe ? 'rgba(255, 69, 58, 0.3)' : 'var(--border-subtle)'}`,
                              fontSize: 'var(--font-size-xs)',
                              color: isFlaggedByMe ? 'var(--accent-danger)' : 'var(--text-secondary)'
                            }}
                          >
                            {isFlaggedByMe && <Flag size={12} />}
                            <span style={{ fontWeight: isFlaggedByMe ? 600 : 400 }}>{p.title}</span>
                            {isFlaggedByMe && (
                              <span style={{ fontSize: 10, opacity: 0.9 }}>• Flagged by you</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* Edit Access Request Modal */}
      <Modal
        isOpen={editModal}
        onClose={() => setEditModal(false)}
        title="Request Reopen Access"
        subtitle={`Request organizer permission to modify scores for Set #${selectedSet?.setNumber}${getSetRange(selectedSet?.projects) ? ` (Teams ${getSetRange(selectedSet?.projects)})` : ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={isSubmitting} onClick={handleRequestEdit}>
              Submit Request
            </Button>
          </>
        }
      >
        <form onSubmit={handleRequestEdit}>
          <div style={{ marginBottom: 12, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            Completed sets are locked to preserve scoring integrity. Explain why an edit is required (e.g. grading mistake, re-demoed feature).
          </div>
          <Input
            label="Reason for Modification"
            value={requestReason}
            onChange={(e) => setRequestReason(e.target.value)}
            placeholder="e.g. Correcting technology rubric score after live re-demo"
            required
            autoFocus
          />
        </form>
      </Modal>
    </div>
  );
}
