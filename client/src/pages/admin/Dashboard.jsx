import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import { useActiveEvent } from '../../context/ActiveEventContext';
import PageHeader from '../../components/ui/PageHeader';
import Card, { StatCard } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import {
  Activity,
  Layers,
  Scale,
  ShieldAlert,
  Trophy,
  Network,
  Clock,
  ArrowRight,
  AlertTriangle,
  Sparkles,
  Calendar
} from '../../components/ui/icons';

export default function AdminDashboard() {
  const [events, setEvents] = useState([]);
  const [progress, setProgress] = useState(null);
  const [flagsCount, setFlagsCount] = useState(0);
  const [projectsCount, setProjectsCount] = useState(0);
  const [judgesCount, setJudgesCount] = useState(0);
  const [recentFeed, setRecentFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const socket = useSocket();
  const { activeEvent } = useActiveEvent();
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    const fetchDashboard = async () => {
      try {
        const eventsRes = await api.get('/events');
        if (!isMounted) return;
        setEvents(eventsRes.data);

        const targetEvent = activeEvent || eventsRes.data.find((e) => e.isActive) || eventsRes.data[0];
        if (targetEvent) {
          const [progRes, flagsRes, projRes, judgesRes] = await Promise.allSettled([
            api.get(`/events/${targetEvent.id}/assignments/progress`),
            api.get(`/events/${targetEvent.id}/flags`),
            api.get(`/events/${targetEvent.id}/projects`),
            api.get(`/events/${targetEvent.id}/judges`)
          ]);

          if (isMounted) {
            if (progRes.status === 'fulfilled') setProgress(progRes.value.data);
            if (flagsRes.status === 'fulfilled') {
              const openFlags = flagsRes.value.data.filter((f) => f.status === 'OPEN').length;
              setFlagsCount(openFlags);
            }
            if (projRes.status === 'fulfilled') setProjectsCount(projRes.value.data.length);
            if (judgesRes.status === 'fulfilled') setJudgesCount(judgesRes.value.data.length);
          }
        }
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchDashboard();
    return () => { isMounted = false; };
  }, [activeEvent]);

  // Real-time socket event handling
  useEffect(() => {
    if (!socket) return;
    const targetEvent = activeEvent || events[0];

    const handleProgress = (data) => {
      if (targetEvent && data.eventId === targetEvent.id) {
        setProgress((prev) => ({ ...prev, ...data }));
      }
    };

    const handleScoreSubmitted = (data) => {
      setRecentFeed((prev) => [
        {
          id: Date.now(),
          type: 'score',
          message: `Score submitted for project in Set`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        },
        ...prev.slice(0, 9)
      ]);
    };

    const handleSetCompleted = (data) => {
      setRecentFeed((prev) => [
        {
          id: Date.now(),
          type: 'complete',
          message: `Judge completed a full evaluation set`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        },
        ...prev.slice(0, 9)
      ]);
      if (targetEvent) {
        api.get(`/events/${targetEvent.id}/assignments/progress`).then((r) => setProgress(r.data)).catch(() => {});
      }
    };

    socket.on('judging:progress', handleProgress);
    socket.on('score:submitted', handleScoreSubmitted);
    socket.on('set:completed', handleSetCompleted);

    return () => {
      socket.off('judging:progress', handleProgress);
      socket.off('score:submitted', handleScoreSubmitted);
      socket.off('set:completed', handleSetCompleted);
    };
  }, [socket, events, activeEvent]);

  const displayEvent = activeEvent || events[0];
  const completed = progress?.completed || 0;
  const inProgress = progress?.inProgress || 0;
  const totalSets = Math.max(progress?.total || 0, 1);
  const unassigned = Math.max(0, (progress?.total || 0) - completed - inProgress);
  const pct = Math.round((completed / totalSets) * 100);

  if (!displayEvent) {
    return (
      <div>
        <PageHeader title="Mission Control" subtitle="Hackathon operations and judging health" />
        <Card>
          <EmptyState
            icon={Calendar}
            title="No Active Event"
            description="Activate or create an event in the Events management tab to initialize the judging floor and dashboard."
            action={
              <Button variant="primary" icon={ArrowRight} onClick={() => navigate('/admin/events')}>
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
        title="Mission Control"
        subtitle={`Live operations for ${displayEvent.name}`}
        badge={
          <Badge
            variant={displayEvent.status === 'JUDGING' ? 'warning' : displayEvent.status === 'COMPLETED' ? 'success' : 'primary'}
            dot
            pulse={displayEvent.status === 'JUDGING'}
          >
            {displayEvent.status}
          </Badge>
        }
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button
              variant="secondary"
              size="md"
              icon={Network}
              onClick={() => navigate('/admin/assignments')}
            >
              Judging Floor
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={Trophy}
              onClick={() => navigate('/admin/results')}
            >
              Leaderboard
            </Button>
          </div>
        }
      />

      {/* Primary Metrics Grid */}
      <div className="apple-stats-grid">
        <StatCard
          label="Total Projects"
          value={projectsCount}
          subvalue="Registered teams"
          icon={Layers}
          variant="primary"
          onClick={() => navigate('/admin/projects')}
        />

        <StatCard
          label="Active Judges"
          value={judgesCount}
          subvalue="Evaluating submissions"
          icon={Scale}
          variant="default"
          onClick={() => navigate('/admin/judges')}
        />

        <StatCard
          label="Judging Velocity"
          value={`${pct}%`}
          subvalue={`${completed} of ${progress?.total || 0} sets complete`}
          icon={Activity}
          variant="success"
          onClick={() => navigate('/admin/progress')}
        />

        <StatCard
          label="Integrity Flags"
          value={flagsCount}
          subvalue={flagsCount > 0 ? 'Requires organizer review' : 'No open discrepancies'}
          icon={ShieldAlert}
          variant={flagsCount > 0 ? 'danger' : 'default'}
          onClick={() => navigate('/admin/integrity')}
        />
      </div>

      {/* Judging Progress & Velocity Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20, marginBottom: 24 }}>
        <Card
          title="Judging Floor Progression"
          subtitle="Real-time completion across assigned rounds"
          action={
            <Button variant="ghost" size="sm" icon={ArrowRight} iconPosition="right" onClick={() => navigate('/admin/progress')}>
              View Matrix
            </Button>
          }
        >
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Overall Completion
              </span>
              <span className="tabular-nums" style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--accent)' }}>
                {pct}%
              </span>
            </div>

            {/* Segmented Progress Bar */}
            <div style={{ height: 10, background: 'var(--bg-surface-overlay)', borderRadius: 'var(--radius-pill)', overflow: 'hidden', display: 'flex' }}>
              <div
                style={{
                  width: `${pct}%`,
                  background: 'var(--accent-success)',
                  transition: 'width 0.5s var(--motion-spring)'
                }}
                title={`Completed: ${completed}`}
              />
              <div
                style={{
                  width: `${Math.round((inProgress / totalSets) * 100)}%`,
                  background: 'var(--accent-warning)',
                  transition: 'width 0.5s var(--motion-spring)'
                }}
                title={`In Progress: ${inProgress}`}
              />
            </div>
          </div>

          {/* Breakdown legend */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginBottom: 2 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-success)' }} />
                <span>Completed</span>
              </div>
              <span className="tabular-nums" style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>
                {completed}
              </span>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginBottom: 2 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-warning)' }} />
                <span>In Progress</span>
              </div>
              <span className="tabular-nums" style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>
                {inProgress}
              </span>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginBottom: 2 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--border-strong)' }} />
                <span>Queued</span>
              </div>
              <span className="tabular-nums" style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>
                {unassigned}
              </span>
            </div>
          </div>
        </Card>

        {/* Live Event Stream / Activity */}
        <Card
          title="Live Floor Stream"
          subtitle="Real-time WebSocket event updates"
        >
          {recentFeed.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
              <Clock size={24} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
              <div>Listening for live evaluations...</div>
              <div style={{ fontSize: 'var(--font-size-xs)', marginTop: 4 }}>Submissions will appear here instantly</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 220, overflowY: 'auto' }}>
              {recentFeed.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-surface-overlay)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: 'var(--font-size-xs)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: item.type === 'complete' ? 'var(--accent-success)' : 'var(--accent)'
                      }}
                    />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item.message}</span>
                  </div>
                  <span className="tabular-nums" style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-2xs)' }}>
                    {item.time}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Operational Quick Launcher */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <Card
          interactive
          onClick={() => navigate('/admin/assignments')}
          style={{ padding: 20 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--accent-tint)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Network size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>Set Partitioning</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Allocate and rebalance judge sets</div>
            </div>
          </div>
        </Card>

        <Card
          interactive
          onClick={() => navigate('/admin/integrity')}
          style={{ padding: 20 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: flagsCount > 0 ? 'var(--accent-danger-tint)' : 'rgba(255,255,255,0.06)', color: flagsCount > 0 ? 'var(--accent-danger)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldAlert size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>Integrity Triage</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Review flagged projects and anomalies</div>
            </div>
          </div>
        </Card>

        <Card
          interactive
          onClick={() => navigate('/admin/results')}
          style={{ padding: 20 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--accent-success-tint)', color: 'var(--accent-success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Trophy size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>Leaderboard & Export</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Z-scores, podium, and CSV export</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
