import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import { useLoader } from '../../context/LoaderContext';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Textarea, AppleSlider } from '../../components/ui/Input';
import { CheckCircleIcon, ArrowLeftIcon, LayersIcon, SparklesIcon, TrophyIcon, UserIcon } from '../../components/ui/icons';

const RUBRIC_CRITERIA = [
  { key: 'completion', label: 'Completion', desc: 'Is the project functionally working and complete?' },
  { key: 'originality', label: 'Originality', desc: 'Novelty of approach and inventive concept' },
  { key: 'learning', label: 'Learning & Growth', desc: 'Technical ambition and self-directed learning' },
  { key: 'design', label: 'Design & UX', desc: 'Visual polish, user flow, and craftsmanship' },
  { key: 'technology', label: 'Technical Execution', desc: 'Architecture quality and system robustness' }
];

export default function AdminSetDetail() {
  const { setId } = useParams();
  const navigate = useNavigate();
  const { error: toastError, success: toastSuccess } = useToast();
  const { activeEvent } = useActiveEvent();
  const { showLoader, hideLoader } = useLoader();

  const getSetRange = (projects) => {
    if (!projects || projects.length === 0) return '';
    const sorted = [...projects].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const m = sorted[0]?.project?.teamNumber?.match(/\d+/);
    if (!m) return '';
    const start = parseInt(m[0]);
    return `Team ${start} – ${start + sorted.length - 1}`;
  };

  const [eventId, setEventId] = useState('');
  const [set, setSet] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [scores, setScores] = useState({});
  const [feedback, setFeedback] = useState({});
  const [nominations, setNominations] = useState({});
  const [rankings, setRankings] = useState([null, null, null]);
  const [phase, setPhase] = useState('scoring'); // 'scoring' | 'ranking' | 'done'
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    showLoader('Loading set details...');
    api.get('/events').then(r => {
      const ev = activeEvent || r.data[0];
      if (ev) {
        setEventId(ev.id);
        api.get(`/events/${ev.id}/sets/${setId}`).then(r => {
          setSet(r.data);
          const existingScores = {};
          const existingFeedback = {};
          const existingNoms = {};
          for (const s of r.data.scores || []) {
            existingScores[s.projectId] = {
              completion: s.completion,
              originality: s.originality,
              learning: s.learning,
              design: s.design,
              technology: s.technology
            };
          }
          for (const f of r.data.feedback || []) {
            existingFeedback[f.projectId] = f.comment;
          }
          for (const n of r.data.nominations || []) {
            if (!existingNoms[n.projectId]) existingNoms[n.projectId] = [];
            existingNoms[n.projectId].push(n.trackId);
          }
          setScores(existingScores);
          setFeedback(existingFeedback);
          setNominations(existingNoms);

          if (r.data.stackRankVotes?.length >= 3) {
            const sortedVotes = [...r.data.stackRankVotes].sort((a, b) => a.rank - b.rank);
            setRankings(sortedVotes.map(v => v.projectId));
          }
        }).finally(() => hideLoader());
        api.get(`/events/${ev.id}/tracks`).then(r => setTracks(r.data));
      } else {
        hideLoader();
      }
    });
  }, [setId]);

  const projects = set?.projects?.map(sp => sp.project) || [];
  const currentProject = projects[currentIdx];

  const getScore = (projectId) => scores[projectId] || { completion: 5, originality: 5, learning: 5, design: 5, technology: 5 };

  const updateScore = (projectId, field, value) => {
    setScores(prev => ({
      ...prev,
      [projectId]: { ...getScore(projectId), [field]: parseInt(value) }
    }));
  };

  const submitScore = async (projectId) => {
    const s = getScore(projectId);
    await api.post(`/events/${eventId}/sets/${setId}/scores`, { projectId, ...s });
    if (feedback[projectId]) {
      await api.post(`/events/${eventId}/sets/${setId}/feedback`, { projectId, comment: feedback[projectId] });
    }
    const noms = nominations[projectId];
    if (noms && noms.length > 0) {
      await api.post(`/events/${eventId}/sets/${setId}/nominate`, { projectId, trackIds: noms });
    }
  };

  const handleNext = async () => {
    if (!currentProject) return;
    setSaving(true);
    try {
      await submitScore(currentProject.id);
      if (currentIdx < projects.length - 1) {
        setCurrentIdx(currentIdx + 1);
      } else {
        setPhase('ranking');
      }
    } catch (err) {
      toastError('Failed to record project score');
    } finally {
      setSaving(false);
    }
  };

  const toggleNomination = (projectId, trackId) => {
    setNominations(prev => {
      const current = prev[projectId] || [];
      const has = current.includes(trackId);
      return { ...prev, [projectId]: has ? current.filter(t => t !== trackId) : [...current, trackId] };
    });
  };

  const setRanking = (rank, projectId) => {
    setRankings(prev => {
      const newR = [...prev];
      const existingIdx = newR.indexOf(projectId);
      if (existingIdx !== -1) newR[existingIdx] = null;
      newR[rank] = projectId;
      return newR;
    });
  };

  const submitRankings = async () => {
    if (rankings.includes(null)) {
      toastError('Please allocate all top 3 positions before saving.');
      return;
    }
    setSaving(true);
    try {
      const data = rankings.map((projectId, i) => ({ projectId, rank: i + 1 }));
      await api.post(`/events/${eventId}/sets/${setId}/rank`, { rankings: data });
      await api.post(`/events/${eventId}/sets/${setId}/complete`);
      toastSuccess('Set evaluations and stack rank updated');
      setPhase('done');
      setTimeout(() => navigate('/admin/assignments'), 1200);
    } catch (err) {
      toastError('Failed to finalize set ranking');
    } finally {
      setSaving(false);
    }
  };

  if (!set) {
    return <div style={{ maxWidth: 880, margin: '40px auto', textAlign: 'center' }}>Loading evaluation set...</div>;
  }

  if (phase === 'done') {
    return (
      <div style={{ maxWidth: 640, margin: '80px auto', textAlign: 'center' }}>
        <Card style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--success-subtle)',
            color: 'var(--success)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20
          }}>
            <CheckCircleIcon size={32} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            Set Evaluation Complete
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 24px', maxWidth: 380 }}>
            Rubric scores and stack rankings for Set {set.column} have been safely written to the ledger.
          </p>
          <Button variant="secondary" onClick={() => navigate('/admin/assignments')}>
            Return to Set Assignments
          </Button>
        </Card>
      </div>
    );
  }

  const s = currentProject ? getScore(currentProject.id) : {};
  const currentTotal = (s.completion || 0) + (s.originality || 0) + (s.learning || 0) + (s.design || 0) + (s.technology || 0);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title={`Set ${set.column} Evaluation`}
        subtitle={`${getSetRange(set.projects)} · Set ID: ${set.id.slice(0, 8)}`}
        badge={set.judge ? { text: `Assigned: ${set.judge.name}`, variant: 'accent' } : { text: 'Unassigned', variant: 'neutral' }}
        actions={
          <Button variant="ghost" icon={ArrowLeftIcon} onClick={() => navigate('/admin/assignments')}>
            Back to Sets
          </Button>
        }
      />

      {phase === 'ranking' ? (
        <Card style={{ padding: 32 }}>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.01em' }}>
              Final Stack Ranking
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
              Designate 1st, 2nd, and 3rd place from this set based on relative merit.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[
              { rank: 0, label: '1st Place', pts: '3 Points', color: '#ffd60a', bg: 'rgba(255, 214, 10, 0.12)' },
              { rank: 1, label: '2nd Place', pts: '2 Points', color: '#98989d', bg: 'rgba(152, 152, 157, 0.12)' },
              { rank: 2, label: '3rd Place', pts: '1 Point',  color: '#ff9f0a', bg: 'rgba(255, 159, 10, 0.12)' }
            ].map(tier => {
              const assignedProject = projects.find(p => p.id === rankings[tier.rank]);
              return (
                <div key={tier.rank} style={{
                  padding: 20,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${assignedProject ? tier.color : 'var(--border-hairline)'}`
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: 999,
                        background: tier.bg,
                        color: tier.color,
                        fontWeight: 700,
                        fontSize: 12
                      }}>
                        {tier.label}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{tier.pts}</span>
                    </div>
                    {assignedProject && (
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                        Selected
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                    {projects.map(p => {
                      const isSelected = rankings[tier.rank] === p.id;
                      const sc = scores[p.id];
                      const totalSc = sc ? (sc.completion||0)+(sc.originality||0)+(sc.learning||0)+(sc.design||0)+(sc.technology||0) : null;

                      return (
                        <div
                          key={p.id}
                          onClick={() => setRanking(tier.rank, p.id)}
                          style={{
                            padding: '12px 14px',
                            borderRadius: 'var(--radius-sm)',
                            background: isSelected ? 'var(--bg-secondary)' : 'var(--bg-base)',
                            border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-hairline)'}`,
                            cursor: 'pointer',
                            transition: 'all var(--transition-fast)'
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: 13, color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                            {p.title}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                            <span>Team {p.team?.teamNumber}</span>
                            {totalSc !== null && <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{totalSc}/50</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border-hairline)' }}>
            <Button variant="ghost" onClick={() => setPhase('scoring')}>
              ← Back to Project Scoring
            </Button>
            <Button
              variant="primary"
              size="lg"
              icon={CheckCircleIcon}
              onClick={submitRankings}
              disabled={rankings.includes(null) || saving}
            >
              {saving ? 'Saving...' : 'Finalize & Complete Set'}
            </Button>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Stepper Progress */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {projects.map((p, idx) => (
              <div
                key={p.id}
                onClick={() => setCurrentIdx(idx)}
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 999,
                  background: idx < currentIdx ? 'var(--success)' : idx === currentIdx ? 'var(--accent)' : 'var(--bg-elevated)',
                  cursor: 'pointer',
                  transition: 'background var(--transition-fast)'
                }}
                title={`Project ${idx + 1}: ${p.title}`}
              />
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 500 }}>
              Project {currentIdx + 1} of {projects.length}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {currentIdx > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setCurrentIdx(currentIdx - 1)}>
                  Previous Project
                </Button>
              )}
            </div>
          </div>

          {/* Current Project Card */}
          <Card style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                  {currentProject?.title}
                </h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
                  {currentProject?.description || 'No description provided.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Badge variant="accent">Team #{currentProject?.team?.teamNumber}</Badge>
                {currentProject?.team?.roomNumber && (
                  <Badge variant="neutral">Room {currentProject.team.roomNumber}</Badge>
                )}
              </div>
            </div>
          </Card>

          {/* Rubric Evaluation Card */}
          <Card style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Scoring Criteria</h3>
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                  Score each category from 0 (insufficient) to 10 (exceptional)
                </p>
              </div>
              <div style={{
                fontSize: 22,
                fontWeight: 800,
                color: 'var(--accent)',
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums'
              }}>
                {currentTotal}
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)', marginLeft: 3 }}>
                  / 50
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {RUBRIC_CRITERIA.map(c => (
                <div key={c.key} style={{
                  padding: '16px 20px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-hairline)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{c.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{c.desc}</div>
                    </div>
                    <span style={{
                      fontWeight: 800,
                      fontSize: 16,
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--text-primary)'
                    }}>
                      {s[c.key] ?? 5}
                    </span>
                  </div>
                  <AppleSlider
                    min={0}
                    max={10}
                    value={s[c.key] ?? 5}
                    onChange={e => updateScore(currentProject.id, c.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Track Nominations Card */}
          {tracks.length > 0 && (
            <Card style={{ padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>Category Track Nominations</h3>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 16px' }}>
                Select tracks this project qualifies for or deserves recognition in
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {tracks.map(t => {
                  const isNominated = (nominations[currentProject?.id] || []).includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleNomination(currentProject.id, t.id)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 999,
                        fontSize: 13,
                        fontWeight: 600,
                        border: `1px solid ${isNominated ? t.color : 'var(--border-hairline)'}`,
                        background: isNominated ? `${t.color}22` : 'var(--bg-elevated)',
                        color: isNominated ? t.color : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all var(--transition-fast)'
                      }}
                    >
                      {isNominated ? '✓ ' : ''}{t.name}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Admin Feedback Card */}
          <Card style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>Evaluation Notes & Feedback</h3>
            <Textarea
              placeholder="Private judge and admin evaluation observations..."
              value={feedback[currentProject?.id] || ''}
              onChange={e => setFeedback(prev => ({ ...prev, [currentProject.id]: e.target.value }))}
              rows={3}
            />
          </Card>

          {/* Action Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button
              variant="primary"
              size="lg"
              onClick={handleNext}
              disabled={saving}
            >
              {saving ? 'Saving...' : currentIdx < projects.length - 1 ? 'Save & Next Project →' : 'Save & Proceed to Stack Ranking →'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
