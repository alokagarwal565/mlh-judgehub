import { useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import { useActiveEvent } from '../../context/ActiveEventContext';
import { useLoader } from '../../context/LoaderContext';
import { Card, StatCard } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { SearchField } from '../../components/ui/Input';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { EmptyState } from '../../components/ui/EmptyState';
import { ActivityIcon, CheckCircleIcon, ClockIcon, LayersIcon, SearchIcon, SparklesIcon, UserIcon } from '../../components/ui/icons';

export default function AdminProgress() {
  const [progress, setProgress] = useState(null);
  const [judges, setJudges] = useState([]);
  const [search, setSearch] = useState('');
  const [activityFilter, setActivityFilter] = useState('ALL');
  const socket = useSocket();
  const { activeEvent } = useActiveEvent();
  const { showLoader, hideLoader } = useLoader();

  useEffect(() => {
    if (!activeEvent?.id) return;
    showLoader('Loading progress telemetry...');
    Promise.all([
      api.get(`/events/${activeEvent.id}/assignments/progress`),
      api.get(`/events/${activeEvent.id}/judges`).catch(() => ({ data: [] }))
    ]).then(([progressRes, judgesRes]) => {
      setProgress(progressRes.data);
      setJudges(judgesRes.data);
    }).finally(() => hideLoader());
  }, [activeEvent?.id]);

  useEffect(() => {
    if (!socket || !activeEvent?.id) return;
    const handler = (data) => {
      if (data.eventId === activeEvent.id) {
        setProgress(prev => ({ ...prev, ...data }));
      }
    };
    socket.on('judging:progress', handler);
    return () => socket.off('judging:progress', handler);
  }, [socket, activeEvent?.id]);

  const pct = progress ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100) : 0;
  
  const fmtTime = (s) => {
    if (!s) return '—';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${sec}s`;
  };

  if (!activeEvent) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <PageHeader title="Live Judging Telemetry" subtitle="Real-time progress matrix across sets and judges" />
        <Card>
          <EmptyState
            icon={ClockIcon}
            title="No Active Event Selected"
            description="Select or activate a hackathon event in Events to view real-time judging telemetry and judge velocity."
            actionLabel="Go to Events"
            onAction={() => window.location.href = '/admin/events'}
          />
        </Card>
      </div>
    );
  }

  const activeCount = judges.filter(j => j.inProgressSets > 0).length;
  const doneCount = judges.filter(j => j.completedSets === j.totalSets && j.totalSets > 0 && j.inProgressSets === 0).length;
  const idleCount = judges.filter(j => j.inProgressSets === 0 && !(j.completedSets === j.totalSets && j.totalSets > 0)).length;

  const filteredJudges = judges.filter(j => {
    if (activityFilter === 'ACTIVE' && j.inProgressSets === 0) return false;
    if (activityFilter === 'IDLE' && (j.inProgressSets > 0 || (j.completedSets === j.totalSets && j.totalSets > 0))) return false;
    if (activityFilter === 'DONE' && !(j.completedSets === j.totalSets && j.totalSets > 0 && j.inProgressSets === 0)) return false;
    if (search && !j.name.toLowerCase().includes(search.toLowerCase()) && !j.email?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="Live Judging Telemetry"
        subtitle={`Real-time progress and velocity for ${activeEvent.name}`}
        badge={{ text: 'Live Telemetry', variant: 'accent' }}
      />

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <StatCard
          label="Total Partition Sets"
          value={progress?.total || 0}
          caption={`${activeEvent.name}`}
          icon={LayersIcon}
        />
        <StatCard
          label="Unassigned Sets"
          value={progress?.unassigned || 0}
          caption="Awaiting judge allocation"
          icon={ClockIcon}
        />
        <StatCard
          label="Sets In Progress"
          value={progress?.inProgress || 0}
          caption="Currently being evaluated"
          icon={ActivityIcon}
        />
        <StatCard
          label="Completed Sets"
          value={progress?.completed || 0}
          caption={`${pct}% judging completion`}
          icon={CheckCircleIcon}
        />
      </div>

      {/* Velocity Progress Bar Card */}
      <Card style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Judging Velocity</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-tertiary)' }}>
              {progress?.completed || 0} of {progress?.total || 0} evaluation sets fully ranked and submitted
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
              {pct}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)' }}>%</span>
          </div>
        </div>
        <div style={{
          height: 10,
          background: 'var(--bg-elevated)',
          borderRadius: 999,
          overflow: 'hidden',
          padding: 2,
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)'
        }}>
          <div style={{
            height: '100%',
            width: `${Math.min(pct, 100)}%`,
            background: 'var(--accent)',
            borderRadius: 999,
            transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
          }} />
        </div>
      </Card>

      {/* Judge Activity Table Card */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-hairline)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16
        }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Judge Floor Status</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-tertiary)' }}>
              Active evaluations and turnaround duration per judge
            </p>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ width: 220 }}>
              <SearchField
                placeholder="Search judge..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <SegmentedControl
              options={[
                { value: 'ALL', label: 'All', badge: judges.length },
                { value: 'ACTIVE', label: 'Active', badge: activeCount },
                { value: 'IDLE', label: 'Idle', badge: idleCount },
                { value: 'DONE', label: 'Done', badge: doneCount }
              ]}
              value={activityFilter}
              onChange={setActivityFilter}
            />
          </div>
        </div>

        {filteredJudges.length === 0 ? (
          <EmptyState
            icon={UserIcon}
            title={search || activityFilter !== 'ALL' ? 'No Judges Found' : 'No Judges Configured'}
            description={search || activityFilter !== 'ALL' ? 'Try adjusting your search query or activity filter.' : 'Judges assigned to this event will appear in the telemetry feed once allocated.'}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-hairline)' }}>
                  <th style={{ padding: '12px 24px', fontWeight: 600, color: 'var(--text-secondary)' }}>Judge</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Sets</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Completion</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 160 }}>Progress</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                  <th style={{ padding: '12px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Total Duration</th>
                </tr>
              </thead>
              <tbody>
                {filteredJudges.map(j => {
                  const jpct = j.totalSets > 0 ? Math.round((j.completedSets / j.totalSets) * 100) : 0;
                  const isActive = j.inProgressSets > 0;
                  const isDone = j.completedSets === j.totalSets && j.totalSets > 0 && !isActive;

                  return (
                    <tr
                      key={j.id}
                      style={{
                        borderBottom: '1px solid var(--border-hairline)',
                        transition: 'background var(--transition-fast)'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '16px 24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-hairline)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'var(--text-primary)'
                          }}>
                            {j.name ? j.name.slice(0, 2).toUpperCase() : 'JD'}
                          </div>
                          <div>
                            <a
                              href={`/admin/view-judge/${j.id}`}
                              style={{
                                color: 'var(--text-primary)',
                                textDecoration: 'none',
                                fontWeight: 600,
                                fontSize: 14
                              }}
                              onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-primary)'}
                            >
                              {j.name}
                            </a>
                            {j.email && (
                              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                {j.email}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {j.totalSets}
                      </td>
                      <td style={{ padding: '16px 20px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                        {j.completedSets} / {j.totalSets}
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            flex: 1,
                            height: 6,
                            background: 'var(--bg-elevated)',
                            borderRadius: 999,
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              height: '100%',
                              width: `${jpct}%`,
                              background: isDone ? 'var(--success)' : 'var(--accent)',
                              borderRadius: 999,
                              transition: 'width 0.4s ease'
                            }} />
                          </div>
                          <span style={{
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                            minWidth: 32,
                            fontVariantNumeric: 'tabular-nums'
                          }}>
                            {jpct}%
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        {isActive ? (
                          <Badge variant="warning" dot pulse>Active Evaluating</Badge>
                        ) : isDone ? (
                          <Badge variant="success" dot>Completed All</Badge>
                        ) : (
                          <Badge variant="neutral">Idle</Badge>
                        )}
                      </td>
                      <td style={{ padding: '16px 24px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', fontSize: 12 }}>
                        {fmtTime(j.totalTimeSeconds)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
