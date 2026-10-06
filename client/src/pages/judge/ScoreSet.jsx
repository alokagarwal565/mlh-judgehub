import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button, { IconButton } from '../../components/ui/Button';
import { Slider } from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
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
  FileText
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
  const [projectFlags, setProjectFlags] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadSetData = async () => {
      try {
        let ev = activeEvent;
        if (!ev) {
          const eventsRes = await api.get('/events');
          ev = eventsRes.data.find((e) => e.isActive) || eventsRes.data.find((e) => e.status === 'JUDGING') || eventsRes.data[0];
        }

        if (!ev) {
          if (isMounted) toastError('No active hackathon event found.');
          return;
        }

        const setRes = await api.get(`/events/${ev.id}/sets/${setId}`);
        if (!isMounted) return;

        const setData = setRes.data;
        setSet(setData);

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
        const numProjects = setData.projects.length;
        const isTieBreaker = setData.setNumber === 0;
        const reqRanks = isTieBreaker ? numProjects : Math.min(3, numProjects);
        const initialRankings = Array(reqRanks).fill(null);

        if (setData.stackRankVotes?.length > 0) {
          const sortedVotes = [...setData.stackRankVotes].sort((a, b) => a.rank - b.rank);
          sortedVotes.slice(0, reqRanks).forEach((v, i) => {
            initialRankings[i] = v.projectId;
          });
        }
        setRankings(initialRankings);

        // Check if all scored
        const allScored = setData.projects.every((sp) =>
          setData.scores?.some((s) => s.projectId === sp.project.id)
        );
        if (allScored && setData.scores?.length > 0) {
          setIsEditing(true);
        }

        // Fetch flags & tracks
        const [flagsRes, tracksRes] = await Promise.allSettled([
          api.get(`/events/${ev.id}/flags`),
          api.get(`/events/${ev.id}/tracks`)
        ]);

        if (isMounted && flagsRes.status === 'fulfilled') {
          const flagsByProject = {};
          for (const flag of flagsRes.value.data) {
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

  if (!set) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <span className="apple-btn-spinner" style={{ width: 28, height: 28, margin: '0 auto 16px', display: 'block' }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>Loading evaluation set...</p>
      </div>
    );
  }

  const projects = set.projects.map((sp) => sp.project);
  const currentProject = projects[currentIdx];

  const getScore = (projectId) => {
    return scores[projectId] || { completion: 5, originality: 5, learning: 5, design: 5, technology: 5 };
  };

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
  const totalScore = currentScore.completion + currentScore.originality + currentScore.learning + currentScore.design + currentScore.technology;

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const saveCurrentProjectScore = async () => {
    if (readonly || !currentProject) return;
    setSaving(true);
    try {
      const eventId = activeEvent?.id || set.eventId;
      const s = getScore(currentProject.id);

      await Promise.all([
        api.post(`/events/${eventId}/sets/${setId}/scores`, {
          projectId: currentProject.id,
          ...s,
          timeSpentSeconds: timer,
        }),
        feedback[currentProject.id]
          ? api.post(`/events/${eventId}/sets/${setId}/feedback`, {
              projectId: currentProject.id,
              comment: feedback[currentProject.id],
            })
          : Promise.resolve(),
        nominations[currentProject.id]
          ? api.post(`/events/${eventId}/sets/${setId}/nominate`, {
              projectId: currentProject.id,
              trackIds: nominations[currentProject.id],
            })
          : Promise.resolve(),
      ]);
    } catch (err) {
      console.error('Save failed', err);
      toastError('Failed to save scores for this project');
    } finally {
      setSaving(false);
    }
  };

  const handleNextProject = async () => {
    await saveCurrentProjectScore();
    if (currentIdx < projects.length - 1) {
      setCurrentIdx((prev) => prev + 1);
      setTimer(0);
    } else {
      setPhase('ranking');
    }
  };

  const handlePrevProject = async () => {
    await saveCurrentProjectScore();
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
      const eventId = activeEvent?.id || set.eventId;
      const ranksPayload = rankings.map((pid, idx) => ({ projectId: pid, rank: idx + 1 }));

      await api.post(`/events/${eventId}/sets/${setId}/rank`, { rankings: ranksPayload });
      await api.post(`/events/${eventId}/sets/${setId}/complete`);

      success('Evaluation set submitted successfully!');
      navigate(isAdminView ? `/admin/assignments` : `/judge`);
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to complete set');
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
      setFlagModal(false);
      setFlagReason('');
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to submit flag');
    }
  };

  return (
    <div>
      {/* Top Banner & Stepper Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, color: 'var(--text-tertiary)' }}>
              Set #{set.setNumber} {set.setNumber === 0 ? '• Tie Breaker' : ''}
            </span>
            <span style={{ color: 'var(--text-tertiary)' }}>•</span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
              {phase === 'scoring' ? `Project ${currentIdx + 1} of ${projects.length}` : 'Final Priority Ranking'}
            </span>
          </div>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
            {phase === 'scoring' ? currentProject?.title : 'Stack Rank Top Projects'}
          </h2>
        </div>

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
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(360px, 1.4fr)', gap: 24, alignItems: 'start' }}>
          {/* Left Column: Project Overview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card
              title={currentProject?.title}
              subtitle={`Team: ${currentProject?.team?.name || 'Unknown'} • Room ${currentProject?.roomNumber || 'TBD'}`}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Flag}
                  onClick={() => setFlagModal(true)}
                  style={{ color: 'var(--accent-danger)' }}
                >
                  Flag
                </Button>
              }
            >
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
              <Card title="Category Nominations" subtitle="Nominate this project for special track prizes">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {tracks.map((t) => {
                    const isNominated = (nominations[currentProject?.id] || []).includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleNomination(t.id)}
                        disabled={readonly}
                        className={`apple-badge apple-badge-md ${isNominated ? 'apple-badge-purple' : 'apple-badge-default'}`}
                        style={{ cursor: readonly ? 'default' : 'pointer', border: '1px solid var(--border-subtle)' }}
                      >
                        <Award size={13} />
                        <span>{t.name}</span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Judge Private Notes */}
            <Card title="Private Notes & Feedback" subtitle="Constructive comments for organizers or participants">
              <textarea
                value={feedback[currentProject?.id] || ''}
                onChange={(e) => setFeedback({ ...feedback, [currentProject.id]: e.target.value })}
                disabled={readonly}
                placeholder="Write specific feedback on technical strengths, UI polish, or suggestions..."
                rows={3}
                className="apple-input"
                style={{ resize: 'vertical' }}
              />
            </Card>
          </div>

          {/* Right Column: Scoring Rubric Sliders */}
          <Card
            title="Evaluation Rubric"
            subtitle="Rate each criterion from 0 (poor) to 10 (exceptional)"
            action={
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span className="tabular-nums" style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--accent)' }}>
                  {totalScore}
                </span>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)' }}>/ 50</span>
              </div>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {CRITERIA.map((crit) => (
                <div key={crit.key} style={{ paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)' }}>
                  <Slider
                    label={crit.label}
                    min={0}
                    max={10}
                    value={currentScore[crit.key]}
                    onChange={(e) => updateScoreField(crit.key, e.target.value)}
                    disabled={readonly}
                  />
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginTop: -6 }}>
                    {crit.desc}
                  </div>
                </div>
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
                {currentIdx === projects.length - 1 ? 'Go to Stack Ranking' : 'Save & Next'}
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        /* Phase 2: Priority Stack Ranking */
        <Card
          title="Stack Rank Top Projects"
          subtitle="Assign priority ranks for Borda count scoring (1st = 3 pts, 2nd = 2 pts, 3rd = 1 pt)"
        >
          <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {rankings.map((selectedId, rIdx) => {
              const rankLabels = ['🥇 1st Place (3 Points)', '🥈 2nd Place (2 Points)', '🥉 3rd Place (1 Point)'];
              const label = rankLabels[rIdx] || `Rank #${rIdx + 1}`;

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

                  <select
                    value={selectedId || ''}
                    onChange={(e) => setRankingSlot(rIdx, e.target.value || null)}
                    disabled={readonly}
                    className="apple-select"
                  >
                    <option value="">-- Choose Project --</option>
                    {projects.map((p) => {
                      const s = getScore(p.id);
                      const total = s.completion + s.originality + s.learning + s.design + s.technology;
                      return (
                        <option key={p.id} value={p.id}>
                          {p.title} ({total}/50 marks)
                        </option>
                      );
                    })}
                  </select>
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

              {!readonly && (
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
