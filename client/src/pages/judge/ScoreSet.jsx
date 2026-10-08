import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button, { IconButton } from '../../components/ui/Button';
import { Slider, Select } from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Skeleton, { SkeletonCard } from '../../components/ui/Skeleton';
import SyncStatusPill from '../../components/ui/SyncStatusPill';
import TouchScoreStepper from '../../components/ui/TouchScoreStepper';
import {
  cacheSet,
  getCachedSet,
  saveDraftScore,
  getDraftScores,
  enqueueMutation
} from '../../services/idb';
import { syncEngine } from '../../services/syncEngine';
import {
  Clock,
  CheckCircle2,
  Trophy,
  ArrowRight,
  ArrowLeft,
  Flag,
  ExternalLink,
  Award,
  AlertTriangle,
  Play,
  Check,
  X,
  FileText,
  Eye,
  User,
  Sparkles
} from '../../components/ui/icons';

const CRITERIA = [
  { key: 'completion', label: 'Completion & Polish', desc: 'Is the core functionality working smoothly without crashes?' },
  { key: 'originality', label: 'Originality & Creativity', desc: 'How unique and innovative is the concept or approach?' },
  { key: 'learning', label: 'Learning & Growth', desc: 'Did the team stretch their skills or overcome difficult challenges?' },
  { key: 'design', label: 'Design & User Experience', desc: 'Is the interface intuitive, accessible, and well crafted?' },
  { key: 'technology', label: 'Technical Execution', desc: 'Code quality, architecture, APIs, and stack integration.' },
];

export default function JudgeScoreSet({ isAdminView, isReadOnly }) {
  const readonly = isAdminView || isReadOnly;
  const { setId, viewAsJudgeId } = useParams();
  const navigate = useNavigate();
  const { success, error: toastError, info } = useToast();
  const { activeEvent } = useActiveEvent();

  const [set, setSet] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [scores, setScores] = useState({});
  const [feedback, setFeedback] = useState({});
  const [nominations, setNominations] = useState({});
  const [rankings, setRankings] = useState([]);
  const [phase, setPhase] = useState('scoring'); // scoring | ranking
  const [timer, setTimer] = useState(0);
  const timerRef = useRef(null);
  const [flagModal, setFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [absentModal, setAbsentModal] = useState(false);
  const [absentNotes, setAbsentNotes] = useState('');
  const [reportingAbsent, setReportingAbsent] = useState(false);
  const [projectFlags, setProjectFlags] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const populateSetData = (setData) => {
      // Prepopulate scores
      const existingScores = {};
      const existingFeedback = {};
      const existingNoms = {};
      for (const s of setData.scores || []) {
        existingScores[s.projectId] = {
          completion: s.completion,
          originality: s.originality,
          learning: s.learning,
          design: s.design,
          technology: s.technology,
        };
      }
      setScores(existingScores);

      // Prepopulate feedback
      for (const f of setData.feedback || []) {
        existingFeedback[f.projectId] = f.comment;
      }
      setFeedback(existingFeedback);

      // Prepopulate nominations
      for (const n of setData.nominations || []) {
        if (!existingNoms[n.projectId]) existingNoms[n.projectId] = [];
        existingNoms[n.projectId].push(n.trackId);
      }
      setNominations(existingNoms);

      // Prepopulate rankings
      const numProjects = setData.projects?.length || 0;
      const isTieBreaker = setData.setNumber === 0;
      const reqRanks = isTieBreaker ? numProjects : Math.min(3, numProjects);
      const initialRankings = Array(reqRanks).fill(null);

      if (setData.stackRankVotes?.length > 0) {
        const sortedVotes = [...setData.stackRankVotes].sort((a, b) => a.rank - b.rank);
        sortedVotes.slice(0, reqRanks).forEach((v, i) => {
          initialRankings[i] = v.projectId;
        });
      } else if (setData.scores?.length > 0) {
        const scoreMap = {};
        setData.scores.forEach((s) => {
          scoreMap[s.projectId] = s.total;
        });
        const sortedProjects = [...(setData.projects || [])].sort((a, b) => {
          const scoreA = scoreMap[a.project?.id || a.projectId] ?? 0;
          const scoreB = scoreMap[b.project?.id || b.projectId] ?? 0;
          return scoreB - scoreA;
        });
        sortedProjects.slice(0, reqRanks).forEach((sp, i) => {
          initialRankings[i] = sp.project?.id || sp.projectId;
        });
      }
      setRankings(initialRankings);

      // Check if all scored
      const allScored = (setData.projects || []).every((sp) =>
        setData.scores?.some((s) => s.projectId === (sp.project?.id || sp.projectId))
      );
      if (allScored && setData.scores?.length > 0) {
        setIsEditing(true);
      }
    };

    const loadSetData = async () => {
      try {
        // 1. Instant offline access: load from IndexedDB cache
        let cached = null;
        try {
          cached = await getCachedSet(setId);
          if (cached && isMounted) {
            setSet(cached);
            populateSetData(cached);
          }
        } catch (e) {
          console.warn('[Offline] Failed to read cached set', e);
        }

        let ev = activeEvent;
        if (!ev) {
          try {
            const eventsRes = await api.get('/events');
            ev = eventsRes.data.find((e) => e.isActive) || eventsRes.data.find((e) => e.status === 'JUDGING') || eventsRes.data[0];
          } catch {
            if (cached) ev = { id: cached.eventId };
          }
        }

        if (!ev && !cached) {
          if (isMounted) toastError('No active hackathon event found.');
          return;
        }

        const effectiveEventId = ev?.id || cached?.eventId;
        let setData = cached;

        try {
          const setRes = await api.get(`/events/${effectiveEventId}/sets/${setId}`);
          if (isMounted) {
            setData = setRes.data;
            setSet(setData);
            populateSetData(setData);
            cacheSet(setData).catch(() => {});
          }
        } catch (netErr) {
          if (!cached) {
            console.error('Fetch set error', netErr);
            if (isMounted) toastError('Failed to fetch set details. Please check connection.');
            return;
          }
          console.log('[Offline] Operating on cached set data');
        }

        // Overlay draft scores from IndexedDB
        try {
          const drafts = await getDraftScores(setId);
          if (drafts?.length > 0 && isMounted) {
            setScores((prev) => {
              const updated = { ...prev };
              drafts.forEach((d) => {
                if (d.scores) updated[d.projectId] = d.scores;
              });
              return updated;
            });
            setFeedback((prev) => {
              const updated = { ...prev };
              drafts.forEach((d) => {
                if (d.comment) updated[d.projectId] = d.comment;
              });
              return updated;
            });
            setNominations((prev) => {
              const updated = { ...prev };
              drafts.forEach((d) => {
                if (d.nominations) updated[d.projectId] = d.nominations;
              });
              return updated;
            });
          }
        } catch {
          // Ignore draft overlay failure
        }

        // Fetch flags & tracks
        const [flagsRes, tracksRes] = await Promise.allSettled([
          api.get(`/events/${effectiveEventId}/flags`),
          api.get(`/events/${effectiveEventId}/tracks`)
        ]);

        if (isMounted && flagsRes.status === 'fulfilled') {
          const flagsByProject = {};
          for (const flag of flagsRes.value.data) {
            if (flag.reason?.startsWith('[ABSENT')) continue;
            if (!flagsByProject[flag.projectId]) flagsByProject[flag.projectId] = [];
            flagsByProject[flag.projectId].push(flag);
          }
          setProjectFlags(flagsByProject);
        }

        if (isMounted && tracksRes.status === 'fulfilled') {
          setTracks(tracksRes.value.data);
        }
      } catch (err) {
        console.error('Failed to load set data', err);
        if (isMounted) toastError('Failed to load judging set');
      }
    };

    loadSetData();
    return () => { isMounted = false; };
  }, [setId, activeEvent]);

  // Timer
  useEffect(() => {
    if (readonly) return;
    timerRef.current = setInterval(() => {
      setTimer((t) => t + 1);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [readonly]);

  const projects = useMemo(() => {
    if (!set?.projects) return [];
    return set.projects.map((sp) => sp.project || sp).filter(Boolean);
  }, [set]);

  const currentProject = projects[currentIdx] || null;

  const getScore = useCallback((projectId) => {
    return scores[projectId] || { completion: 0, originality: 0, learning: 0, design: 0, technology: 0 };
  }, [scores]);

  // Check for score ties among projects in this set (unconditionally rendered hook)
  const detectedTies = useMemo(() => {
    if (!projects || projects.length === 0) return [];
    const scoreMap = {};
    projects.forEach((p) => {
      if (!p) return;
      const s = scores[p.id] || { completion: 0, originality: 0, learning: 0, design: 0, technology: 0 };
      const total = (s.completion || 0) + (s.originality || 0) + (s.learning || 0) + (s.design || 0) + (s.technology || 0);
      if (total > 0) {
        if (!scoreMap[total]) scoreMap[total] = [];
        scoreMap[total].push(p.title || 'Untitled');
      }
    });
    return Object.entries(scoreMap)
      .filter(([_, list]) => list.length > 1)
      .map(([pts, list]) => ({ points: pts, teams: list }));
  }, [projects, scores]);

  const updateScoreField = (field, val) => {
    if (readonly || !currentProject) return;
    setScores((prev) => ({
      ...prev,
      [currentProject.id]: {
        ...getScore(currentProject.id),
        [field]: Number(val),
      },
    }));
  };

  const currentScore = getScore(currentProject?.id);
  const totalScore = (currentScore.completion || 0) + (currentScore.originality || 0) + (currentScore.learning || 0) + (currentScore.design || 0) + (currentScore.technology || 0);

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (!set) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width={180} height={16} borderRadius={4} />
            <Skeleton width={320} height={28} borderRadius={6} />
          </div>
          <Skeleton width={110} height={36} borderRadius={20} />
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} width="20%" height={6} borderRadius={4} />
          ))}
        </div>
        <div className="judge-scoring-grid">
          <SkeletonCard rows={4} />
          <SkeletonCard rows={6} />
        </div>
      </div>
    );
  }

  const saveCurrentProjectScore = async () => {
    if (readonly || !currentProject) return;
    setSaving(true);
    try {
      const eventId = activeEvent?.id || set?.eventId;
      const s = getScore(currentProject.id);

      // 1. Immediately persist draft locally to IndexedDB
      await saveDraftScore(setId, currentProject.id, {
        scores: s,
        comment: feedback[currentProject.id] || '',
        nominations: nominations[currentProject.id] || [],
        timeSpentSeconds: timer,
      });

      // 2. Enqueue mutations to Outbox for reliable background synchronization
      await enqueueMutation({
        eventId,
        setId,
        projectId: currentProject.id,
        operation: 'SAVE_SCORE',
        payload: { ...s, timeSpentSeconds: timer },
      });

      if (feedback[currentProject.id]) {
        await enqueueMutation({
          eventId,
          setId,
          projectId: currentProject.id,
          operation: 'SAVE_FEEDBACK',
          payload: { comment: feedback[currentProject.id] },
        });
      }

      if (nominations[currentProject.id]?.length > 0) {
        await enqueueMutation({
          eventId,
          setId,
          projectId: currentProject.id,
          operation: 'SAVE_NOMINATIONS',
          payload: { trackIds: nominations[currentProject.id] },
        });
      }

      // 3. Trigger background sync flush (does not block if offline)
      syncEngine.flushOutbox();
    } catch (err) {
      console.error('Local save error', err);
    } finally {
      setSaving(false);
    }
  };

  const handleNextProject = async () => {
    if (!readonly) {
      await saveCurrentProjectScore();
    }
    if (currentIdx < projects.length - 1) {
      setCurrentIdx((prev) => prev + 1);
      setTimer(0);
    } else {
      // Auto-calculate rankings from current rubric scores if not already set
      setRankings((prev) => {
        if (prev.some((r) => r !== null)) return prev;
        const numProjects = projects.length;
        const isTieBreaker = set?.setNumber === 0;
        const reqRanks = isTieBreaker ? numProjects : Math.min(3, numProjects);

        const projectTotals = projects.map((p) => {
          const s = getScore(p.id);
          const total = (s.completion || 0) + (s.originality || 0) + (s.learning || 0) + (s.design || 0) + (s.technology || 0);
          return { id: p.id, total };
        });

        projectTotals.sort((a, b) => b.total - a.total);
        const autoRanks = Array(reqRanks).fill(null);
        projectTotals.slice(0, reqRanks).forEach((pt, idx) => {
          autoRanks[idx] = pt.id;
        });
        return autoRanks;
      });
      setPhase('ranking');
    }
  };

  const handlePrevProject = async () => {
    if (!readonly) {
      await saveCurrentProjectScore();
    }
    if (currentIdx > 0) {
      setCurrentIdx((prev) => prev - 1);
      setTimer(0);
    }
  };

  const toggleNomination = (trackId) => {
    if (readonly || !currentProject) return;
    const currentNoms = nominations[currentProject.id] || [];
    const updated = currentNoms.includes(trackId)
      ? currentNoms.filter((id) => id !== trackId)
      : [...currentNoms, trackId];
    setNominations((prev) => ({
      ...prev,
      [currentProject.id]: updated,
    }));
  };

  const setRankingSlot = (rankIdx, projectId) => {
    if (readonly) return;
    setRankings((prev) => {
      const next = [...prev];
      // If already assigned in another slot, clear that slot
      const existingIdx = next.indexOf(projectId);
      if (existingIdx !== -1) {
        next[existingIdx] = null;
      }
      next[rankIdx] = projectId;
      return next;
    });
  };

  const submitFinalSet = async () => {
    setSaving(true);
    try {
      const eventId = activeEvent?.id || set?.eventId;
      const ranksPayload = rankings.map((pid, idx) => ({ projectId: pid, rank: idx + 1 }));

      // Enqueue ranking and completion to Outbox
      await enqueueMutation({
        eventId,
        setId,
        operation: 'SAVE_RANKS',
        payload: { rankings: ranksPayload }
      });

      await enqueueMutation({
        eventId,
        setId,
        operation: 'COMPLETE_SET',
        payload: {}
      });

      // Attempt background sync
      syncEngine.flushOutbox();

      success('Evaluation set submitted! (Syncing automatically in background)');
      navigate(isAdminView ? `/admin/assignments` : `/judge`);
    } catch (err) {
      console.error('Failed to submit final set', err);
      toastError('Failed to record set submission');
    } finally {
      setSaving(false);
    }
  };

  const handleFlagSubmit = async () => {
    if (!flagReason.trim() || !currentProject) return;
    try {
      const eventId = activeEvent?.id || set.eventId;
      await api.post(`/events/${eventId}/flags`, {
        projectId: currentProject.id,
        reason: flagReason,
      });
      success('Flag submitted for organizer integrity review');
      setProjectFlags((prev) => ({
        ...prev,
        [currentProject.id]: [{ projectId: currentProject.id, reason: flagReason, createdAt: new Date() }]
      }));
      setFlagModal(false);
      setFlagReason('');
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to submit flag');
    }
  };

  const handleAbsentSubmit = async () => {
    if (!currentProject) return;
    setReportingAbsent(true);
    try {
      const eventId = activeEvent?.id || set.eventId;
      await api.post(`/events/${eventId}/projects/${currentProject.id}/absence`, {
        setId: set.id,
        notes: absentNotes
      });
      success(`Reported ${currentProject.title} as absent. Floor desk notified.`);
      setAbsentModal(false);
      setAbsentNotes('');
      if (currentIdx < projects.length - 1) {
        setCurrentIdx((prev) => prev + 1);
        setTimer(0);
      } else {
        setPhase('ranking');
      }
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to report absence');
    } finally {
      setReportingAbsent(false);
    }
  };

  return (
    <div>
      {/* Top Banner & Stepper Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, color: 'var(--text-tertiary)' }}>
              Set #{set.setNumber} {set.setNumber === 0 ? '• Tie Breaker' : ''}
            </span>
            <span style={{ color: 'var(--text-tertiary)' }}>•</span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
              {phase === 'scoring' ? `Project ${currentIdx + 1} of ${projects.length}` : 'Final Priority Ranking'}
            </span>

            {readonly && (
              <Badge variant="info" size="sm" icon={Eye}>
                Read-Only Inspection
              </Badge>
            )}

            {set.judge && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Evaluator: <strong style={{ color: 'var(--text-secondary)' }}>{set.judge.name}</strong>
              </span>
            )}
          </div>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
            {phase === 'scoring' ? currentProject?.title : 'Stack Rank Top Projects'}
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SyncStatusPill />

          {readonly && (
            <Button
              variant="secondary"
              size="sm"
              icon={ArrowLeft}
              onClick={() => navigate(isAdminView ? '/admin/assignments' : '/judge')}
            >
              Back to {isAdminView ? 'Assignments' : 'Dashboard'}
            </Button>
          )}

          {/* Live Timer Pill */}
          {!readonly && (
            <div
              className="tabular-nums"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 14px',
                borderRadius: 'var(--radius-pill)',
                background: timer >= 180 ? 'var(--accent-warning-tint)' : 'var(--bg-surface-elevated)',
                border: `1px solid ${timer >= 180 ? 'var(--accent-warning)' : 'var(--border-subtle)'}`,
                color: timer >= 180 ? 'var(--accent-warning)' : 'var(--text-primary)',
                fontWeight: 600,
                fontSize: 'var(--font-size-sm)'
              }}
            >
              <Clock size={15} />
              <span>{formatTimer(timer)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Stepper bar across projects */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {projects.map((p, idx) => {
          const isDone = scores[p.id] !== undefined;
          const isCurrent = idx === currentIdx && phase === 'scoring';

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                saveCurrentProjectScore();
                setCurrentIdx(idx);
                setPhase('scoring');
              }}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 'var(--radius-pill)',
                background: isCurrent ? 'var(--accent)' : isDone ? 'var(--accent-success)' : 'rgba(255,255,255,0.08)',
                border: 'none',
                cursor: 'pointer',
                transition: 'background var(--transition-fast)'
              }}
              title={`${idx + 1}. ${p.title} (${isDone ? 'Scored' : 'Pending'})`}
            />
          );
        })}
        <button
          type="button"
          onClick={() => {
            saveCurrentProjectScore();
            setPhase('ranking');
          }}
          style={{
            flex: 1,
            height: 6,
            borderRadius: 'var(--radius-pill)',
            background: phase === 'ranking' ? 'var(--accent-purple)' : 'rgba(255,255,255,0.08)',
            border: 'none',
            cursor: 'pointer',
            transition: 'background var(--transition-fast)'
          }}
          title="Stack Ranking Phase"
        />
      </div>

      {phase === 'scoring' ? (
        /* Phase 1: Rubric Scoring & Project Info */
        <div className="judge-scoring-grid">
          {/* Left Column: Project Overview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card
              title={currentProject?.title}
              subtitle={`Team: ${currentProject?.team?.name || 'Unknown'} • Room ${currentProject?.roomNumber || 'TBD'}`}
              action={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {projectFlags[currentProject?.id] && (
                    <Badge variant="danger" size="sm" icon={Flag} title={projectFlags[currentProject.id][0]?.reason}>
                      Flagged by you
                    </Badge>
                  )}
                  {!readonly && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={AlertTriangle}
                        onClick={() => setAbsentModal(true)}
                        style={{ color: 'var(--accent-warning)', borderColor: 'rgba(234, 179, 8, 0.3)' }}
                        title="Report team not at their assigned table"
                      >
                        Team Absent
                      </Button>
                      {!projectFlags[currentProject?.id] && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Flag}
                          onClick={() => setFlagModal(true)}
                          style={{ color: 'var(--accent-danger)' }}
                        >
                          Flag
                        </Button>
                      )}
                    </>
                  )}
                </div>
              }
            >
              {/* Flagged by you callout banner */}
              {projectFlags[currentProject?.id] && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 10,
                    padding: '10px 14px',
                    marginBottom: 16,
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(255, 69, 58, 0.08)',
                    border: '1px solid rgba(255, 69, 58, 0.25)',
                    color: 'var(--accent-danger)',
                    fontSize: 'var(--font-size-xs)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: '1 1 200px', minWidth: 0, wordBreak: 'break-word' }}>
                    <Flag size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ minWidth: 0, wordBreak: 'break-word', lineHeight: 1.5 }}>
                      <strong>Flagged by you:</strong> {projectFlags[currentProject.id][0]?.reason || 'Flagged for organizer review'}
                    </span>
                  </div>
                  {!readonly && (
                    <button
                      type="button"
                      onClick={() => {
                        setFlagReason(projectFlags[currentProject.id][0]?.reason || '');
                        setFlagModal(true);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent-danger)',
                        textDecoration: 'underline',
                        fontSize: 'var(--font-size-xs)',
                        cursor: 'pointer',
                        fontWeight: 600,
                        padding: 0,
                        whiteSpace: 'nowrap',
                        flexShrink: 0
                      }}
                    >
                      Edit Reason
                    </button>
                  )}
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 'var(--font-size-2xs)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Description
                </span>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {currentProject?.description || 'No project description provided.'}
                </p>
              </div>

              {/* Demo Links */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                {currentProject?.demoLink && (
                  <a
                    href={currentProject.demoLink}
                    target="_blank"
                    rel="noreferrer"
                    className="apple-btn apple-btn-secondary apple-btn-sm"
                    style={{ textDecoration: 'none' }}
                  >
                    <ExternalLink size={14} /> Open Demo
                  </a>
                )}
                {currentProject?.videoUrl && (
                  <a
                    href={currentProject.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="apple-btn apple-btn-secondary apple-btn-sm"
                    style={{ textDecoration: 'none' }}
                  >
                    <Play size={14} /> Watch Video
                  </a>
                )}
              </div>

              {/* Team Leader Contact */}
              {currentProject?.leaderName && (
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                  Team Lead: <strong style={{ color: 'var(--text-secondary)' }}>{currentProject.leaderName}</strong>
                </div>
              )}
            </Card>

            {/* Track Nominations */}
            {tracks.length > 0 && (
              <Card
                title="Category Nominations"
                subtitle={readonly ? "Nominated tracks for special prizes" : "Nominate this project for special track prizes"}
              >
                {readonly ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {tracks.filter((t) => (nominations[currentProject?.id] || []).includes(t.id)).length > 0 ? (
                      tracks
                        .filter((t) => (nominations[currentProject?.id] || []).includes(t.id))
                        .map((t) => (
                          <span
                            key={t.id}
                            className="apple-badge apple-badge-purple apple-badge-md"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            <Award size={13} />
                            <span>{t.name}</span>
                          </span>
                        ))
                    ) : (
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                        No category nominations recorded for this project.
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {tracks.map((t) => {
                      const isNominated = (nominations[currentProject?.id] || []).includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleNomination(t.id)}
                          className={`apple-badge apple-badge-md ${isNominated ? 'apple-badge-purple' : 'apple-badge-default'}`}
                          style={{ cursor: 'pointer', border: '1px solid var(--border-subtle)' }}
                        >
                          <Award size={13} />
                          <span>{t.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>
            )}

            {/* Judge Private Notes */}
            <Card
              title="Private Notes & Feedback"
              subtitle={readonly ? "Evaluator's recorded feedback" : "Constructive comments for organizers or participants"}
            >
              {readonly ? (
                <div
                  style={{
                    padding: '12px 14px',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    color: feedback[currentProject?.id] ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    fontSize: 'var(--font-size-sm)',
                    fontStyle: feedback[currentProject?.id] ? 'normal' : 'italic',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {feedback[currentProject?.id] || 'No private notes or feedback recorded for this project.'}
                </div>
              ) : (
                <textarea
                  value={feedback[currentProject?.id] || ''}
                  onChange={(e) => setFeedback({ ...feedback, [currentProject.id]: e.target.value })}
                  placeholder="Write specific feedback on technical strengths, UI polish, or suggestions..."
                  rows={3}
                  className="apple-input"
                  style={{ resize: 'vertical' }}
                />
              )}
            </Card>
          </div>

          {/* Right Column: Scoring Rubric */}
          <Card
            title={readonly ? "Evaluated Rubric" : "Evaluation Rubric"}
            subtitle={readonly ? "Criterion breakdown for this project" : "Rate each criterion from 0 (poor) to 10 (exceptional)"}
            action={
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span className="tabular-nums" style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--accent)' }}>
                  {totalScore}
                </span>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)' }}>/ 50</span>
              </div>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {CRITERIA.map((crit) => (
                <TouchScoreStepper
                  key={crit.key}
                  label={crit.label}
                  desc={crit.desc}
                  value={currentScore[crit.key]}
                  onChange={(val) => updateScoreField(crit.key, val)}
                  disabled={readonly}
                />
              ))}
            </div>

            {/* Stepper Navigation Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, gap: 12 }}>
              <Button
                variant="secondary"
                size="md"
                icon={ArrowLeft}
                disabled={currentIdx === 0}
                onClick={handlePrevProject}
              >
                Previous
              </Button>

              <Button
                variant="primary"
                size="md"
                icon={currentIdx === projects.length - 1 ? Trophy : ArrowRight}
                iconPosition="right"
                loading={saving}
                onClick={handleNextProject}
              >
                {currentIdx === projects.length - 1
                  ? (readonly ? 'View Stack Ranking' : 'Go to Stack Ranking')
                  : (readonly ? 'Next Project' : 'Save & Next')}
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        /* Phase 2: Priority Stack Ranking */
        <Card
          title="Stack Rank Top Projects"
          subtitle={`Assign priority ranks for final scoring. Projects in this set: ${projects.length}.`}
        >
          <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Auto-Calculation Notification */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                color: 'var(--text-primary)',
                fontSize: 'var(--font-size-sm)'
              }}
            >
              <Sparkles size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong style={{ color: 'var(--accent)' }}>Auto-Calculated from Rubric: </strong>
                Rankings have been pre-sorted according to each team's Phase 1 rubric total. You can review, modify, or swap any position below before finalizing.
              </div>
            </div>

            {/* Tie Detection Warning */}
            {detectedTies.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(234, 179, 8, 0.1)',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--font-size-sm)'
                }}
              >
                <AlertTriangle size={18} style={{ color: '#eab308', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong style={{ color: '#eab308' }}>Rubric Score Tie Detected: </strong>
                  {detectedTies.map((t, idx) => (
                    <span key={idx}>
                      {t.teams.join(' and ')} are tied at {t.points}/50 marks.
                    </span>
                  ))}{' '}
                  Please verify your preferred tie-break ordering.
                </div>
              </div>
            )}

            {rankings.map((selectedId, rIdx) => {
              const allowedPointSlots = Math.max(1, projects.length - 2);
              const points = rIdx < allowedPointSlots ? (3 - rIdx) : 0;
              const placeNames = ['🥇 1st Place', '🥈 2nd Place', '🥉 3rd Place'];
              const label = `${placeNames[rIdx] || `Rank #${rIdx + 1}`} (${points > 0 ? `+${points} Points` : '0 Points — Normalized for set size'})`;

              return (
                <div
                  key={rIdx}
                  style={{
                    padding: 16,
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)'
                  }}
                >
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>
                    {label}
                  </div>

                  <Select
                    value={selectedId || ''}
                    onChange={(e) => setRankingSlot(rIdx, (e.target ? e.target.value : e) || null)}
                    disabled={readonly}
                    placeholder="-- Choose Project --"
                    options={[
                      { value: '', label: '-- Choose Project --' },
                      ...projects.map((p) => {
                        const s = getScore(p.id);
                        const total = (s.completion || 0) + (s.originality || 0) + (s.learning || 0) + (s.design || 0) + (s.technology || 0);
                        const isFlagged = !!projectFlags[p.id];
                        return {
                          value: p.id,
                          label: `${isFlagged ? '🚩 ' : ''}${p.title} (${total}/50 marks)${isFlagged ? ' — Flagged by you' : ''}`
                        };
                      })
                    ]}
                  />

                  {selectedId && projectFlags[selectedId] && (
                    <div
                      style={{
                        marginTop: 8,
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 6,
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--accent-danger)'
                      }}
                    >
                      <Flag size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{ minWidth: 0, wordBreak: 'break-word', lineHeight: 1.5 }}>
                        Note: You flagged this project ({projectFlags[selectedId][0]?.reason || 'Flagged for organizer review'})
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Bottom Finalize Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, gap: 16 }}>
              <Button
                variant="secondary"
                size="lg"
                icon={ArrowLeft}
                onClick={() => setPhase('scoring')}
              >
                Back to Scoring
              </Button>

              {readonly ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Badge variant="success" size="md" icon={CheckCircle2}>
                    Set Evaluation Recorded
                  </Badge>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => navigate(isAdminView ? '/admin/assignments' : '/judge')}
                  >
                    Done
                  </Button>
                </div>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  icon={CheckCircle2}
                  loading={saving}
                  disabled={rankings.includes(null)}
                  onClick={submitFinalSet}
                >
                  Complete & Submit Set
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Report Absent Modal */}
      <Modal
        isOpen={absentModal}
        onClose={() => setAbsentModal(false)}
        title={`Report Team Absent: ${currentProject?.title}`}
        subtitle="Team not found at assigned table during judging rounds"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAbsentModal(false)}>Cancel</Button>
            <Button
              variant="warning"
              onClick={handleAbsentSubmit}
              loading={reportingAbsent}
            >
              Report Absent & Skip
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.25)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Marking this team as absent will alert the floor organizer desk to call the team leader (<strong style={{ color: 'var(--text-primary)' }}>{currentProject?.leaderName || 'Lead'}</strong>, Room <strong style={{ color: 'var(--text-primary)' }}>{currentProject?.roomNumber || 'TBD'}</strong>). They will be scheduled for a 2nd attempt.
          </div>
          <textarea
            value={absentNotes}
            onChange={(e) => setAbsentNotes(e.target.value)}
            placeholder="Optional notes (e.g. Visited table twice, laptops closed, no team members present)..."
            rows={3}
            className="apple-input"
            style={{ resize: 'vertical' }}
          />
        </div>
      </Modal>

      {/* Flag Project Modal */}
      <Modal
        isOpen={flagModal}
        onClose={() => setFlagModal(false)}
        title={`Flag Project: ${currentProject?.title}`}
        subtitle="Report discrepancies, non-functional demos, or pre-built codebases to organizers"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFlagModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleFlagSubmit}>Submit Flag</Button>
          </>
        }
      >
        <div style={{ marginBottom: 14, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
          Flagging routes this submission to the organizer integrity triage board for code inspection.
        </div>
        <textarea
          value={flagReason}
          onChange={(e) => setFlagReason(e.target.value)}
          placeholder="Describe the issue (e.g. Broken demo link, project created before hackathon started)..."
          rows={4}
          className="apple-input"
          style={{ resize: 'vertical' }}
          autoFocus
        />
      </Modal>
    </div>
  );
}
