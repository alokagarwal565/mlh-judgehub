import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import Pagination, { usePagination } from '../../components/Pagination';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { SearchField } from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import {
  Trophy,
  Download,
  Award,
  RefreshCw,
  Search,
  Flag,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Eye,
  SlidersHorizontal
} from '../../components/ui/icons';

export default function AdminResults() {
  const { success, error: toastError } = useToast();
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [trackWinners, setTrackWinners] = useState([]);
  const [tab, setTab] = useState('leaderboard');
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [allSetsCompleted, setAllSetsCompleted] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [hideTrackWinners, setHideTrackWinners] = useState(false);
  const [hideFlagged, setHideFlagged] = useState(false);
  const [search, setSearch] = useState('');
  const socket = useSocket();
  const { activeEvent } = useActiveEvent();

  const trackWinnerIds = new Set(trackWinners.filter((t) => t.winner).map((t) => t.winner.projectId));
  const flaggedCount = leaderboard.filter((e) => e.projectStatus === 'FLAGGED').length;

  const displayLeaderboard = leaderboard
    .filter((e) => {
      if (hideTrackWinners && trackWinnerIds.has(e.projectId)) return false;
      if (hideFlagged && e.projectStatus === 'FLAGGED') return false;

      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch =
          e.teamName?.toLowerCase().includes(searchLower) ||
          e.projectTitle?.toLowerCase().includes(searchLower) ||
          e.teamNumber?.toString().includes(search) ||
          e.roomNumber?.toString().includes(search) ||
          e.roomNumber?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      return true;
    })
    .map((entry, idx) => ({
      ...entry,
      rank: idx + 1
    }));

  const { paged: pagedLeaderboard, totalPages: lbTotalPages, total: lbTotal } = usePagination(
    displayLeaderboard,
    page,
    perPage
  );

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

  const fetchData = useCallback(async () => {
    if (!eventId) return;
    setRefreshing(true);
    try {
      const [lbRes, twRes, progRes] = await Promise.all([
        api.get(`/events/${eventId}/results`),
        api.get(`/events/${eventId}/results/tracks`),
        api.get(`/events/${eventId}/assignments/progress`)
      ]);
      setLeaderboard(lbRes.data);
      setTrackWinners(twRes.data);
      const p = progRes.data;
      setAllSetsCompleted(p.total > 0 && p.unassigned === 0 && p.inProgress === 0);
    } catch (err) {
      console.error('Fetch failed', err);
    } finally {
      setRefreshing(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time WebSocket updates
  useEffect(() => {
    if (!socket || !eventId) return;
    const handleUpdate = () => fetchData();
    socket.on('set:completed', handleUpdate);
    socket.on('score:submitted', handleUpdate);
    socket.on('flag:resolved', handleUpdate);
    return () => {
      socket.off('set:completed', handleUpdate);
      socket.off('score:submitted', handleUpdate);
      socket.off('flag:resolved', handleUpdate);
    };
  }, [socket, eventId, fetchData]);

  const handleExportCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (hideTrackWinners) params.set('excludeTrackWinners', 'true');
      if (hideFlagged) params.set('excludeFlagged', 'true');

      const response = await api.get(`/events/${eventId}/results/export?${params.toString()}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `leaderboard-${activeEvent?.name || 'event'}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      success('Leaderboard CSV exported successfully');
    } catch (err) {
      toastError('Failed to export CSV');
    }
  };

  const handleOpenDetails = async (projectId) => {
    setLoadingDetails(true);
    try {
      const res = await api.get(`/events/${eventId}/projects/${projectId}`);
      setSelectedDetails(res.data);
    } catch (err) {
      toastError('Failed to fetch project breakdown');
    } finally {
      setLoadingDetails(false);
    }
  };

  const top3 = displayLeaderboard.slice(0, 3);

  return (
    <div>
      <PageHeader
        title="Leaderboard & Results"
        subtitle="Final rankings, Borda stack rank points, and track winners"
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button
              variant="secondary"
              size="md"
              icon={RefreshCw}
              loading={refreshing}
              onClick={fetchData}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={Download}
              onClick={handleExportCsv}
            >
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Top Navigation Tabs & Search Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { id: 'leaderboard', label: 'Overall Standings', icon: Trophy, count: displayLeaderboard.length },
            { id: 'tracks', label: 'Track Category Winners', icon: Award, count: trackWinners.length }
          ]}
        />

        {tab === 'leaderboard' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <SearchField
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Filter teams, titles, rooms..."
            />

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={hideTrackWinners}
                onChange={(e) => setHideTrackWinners(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span>Hide Track Winners</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={hideFlagged}
                onChange={(e) => setHideFlagged(e.target.checked)}
                style={{ accentColor: 'var(--accent-danger)' }}
              />
              <span>Hide Flagged ({flaggedCount})</span>
            </label>
          </div>
        )}
      </div>

      {tab === 'leaderboard' ? (
        <>
          {/* Top 3 Podium Cards */}
          {page === 1 && !search && top3.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
              {top3.map((item, idx) => {
                const medalColors = [
                  { bg: 'rgba(255, 214, 10, 0.1)', border: 'rgba(255, 214, 10, 0.35)', badge: 'Gold • 1st', medal: '🥇' },
                  { bg: 'rgba(162, 170, 187, 0.1)', border: 'rgba(162, 170, 187, 0.35)', badge: 'Silver • 2nd', medal: '🥈' },
                  { bg: 'rgba(205, 127, 50, 0.1)', border: 'rgba(205, 127, 50, 0.35)', badge: 'Bronze • 3rd', medal: '🥉' }
                ];
                const m = medalColors[idx] || medalColors[0];

                return (
                  <div
                    key={item.projectId}
                    className="apple-card is-interactive"
                    onClick={() => handleOpenDetails(item.projectId)}
                    style={{
                      background: m.bg,
                      borderColor: m.border,
                      padding: 22,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontSize: 24 }}>{m.medal}</span>
                        <span className="apple-badge apple-badge-sm" style={{ background: 'rgba(255,255,255,0.08)', fontWeight: 600 }}>
                          {m.badge}
                        </span>
                      </div>
                      <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                        {item.projectTitle}
                      </h4>
                      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                        Team: {item.teamName} {item.roomNumber && `• Room ${item.roomNumber}`}
                      </p>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                      <div>
                        <span style={{ fontSize: 'var(--font-size-2xs)', textTransform: 'uppercase', color: 'var(--text-tertiary)', display: 'block' }}>Stack Points</span>
                        <span className="tabular-nums" style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--accent)' }}>
                          {item.stackPoints} pts
                        </span>
                      </div>
                      <div>
                        <span style={{ fontSize: 'var(--font-size-2xs)', textTransform: 'uppercase', color: 'var(--text-tertiary)', display: 'block' }}>Total Marks</span>
                        <span className="tabular-nums" style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {item.totalMarks}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full Rankings Data Table */}
          <div className="apple-table-container">
            <div className="apple-table-scroll">
              <table className="apple-table">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>Rank</th>
                    <th>Project & Team</th>
                    <th>Location</th>
                    <th style={{ textAlign: 'right' }}>Stack Pts</th>
                    <th style={{ textAlign: 'right' }}>Total Marks</th>
                    <th style={{ textAlign: 'center' }}>Evaluations</th>
                    <th>Status</th>
                    <th style={{ width: 80, textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedLeaderboard.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ padding: '40px 0' }}>
                        <EmptyState
                          icon={Trophy}
                          title="No Projects Found"
                          description={search ? "No project or team matches your search query." : "Judging scores will generate the live leaderboard automatically."}
                        />
                      </td>
                    </tr>
                  ) : (
                    pagedLeaderboard.map((item) => (
                      <tr key={item.projectId}>
                        <td>
                          <span
                            className="tabular-nums"
                            style={{
                              fontWeight: 700,
                              fontSize: 'var(--font-size-base)',
                              color: item.rank <= 3 ? 'var(--accent)' : 'var(--text-secondary)'
                            }}
                          >
                            #{item.rank}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {item.projectTitle}
                          </div>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                            {item.teamName} {item.teamNumber && `• #${item.teamNumber}`}
                          </div>
                        </td>
                        <td>
                          {item.roomNumber ? (
                            <span className="apple-badge apple-badge-default apple-badge-sm">
                              Room {item.roomNumber}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)' }}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="tabular-nums" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                            {item.stackPoints}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {item.totalMarks}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="tabular-nums apple-badge apple-badge-default apple-badge-sm">
                            {item.timesEvaluated} judges
                          </span>
                        </td>
                        <td>
                          {item.projectStatus === 'FLAGGED' ? (
                            <Badge variant="danger" dot>Flagged</Badge>
                          ) : trackWinnerIds.has(item.projectId) ? (
                            <Badge variant="purple" icon={Award}>Winner</Badge>
                          ) : (
                            <Badge variant="success">Scored</Badge>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="apple-btn-icon-only apple-btn-ghost apple-btn-sm"
                            onClick={() => handleOpenDetails(item.projectId)}
                            title="View Score Breakdown"
                          >
                            <Eye size={15} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              totalPages={lbTotalPages}
              total={lbTotal}
              perPage={perPage}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
            />
          </div>
        </>
      ) : (
        /* Track Winners View */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
          {trackWinners.length === 0 ? (
            <div style={{ gridColumn: '1 / -1' }}>
              <Card>
                <EmptyState
                  icon={Award}
                  title="No Track Nominations Yet"
                  description="Judges will nominate standout projects for category tracks during rubric evaluation."
                />
              </Card>
            </div>
          ) : (
            trackWinners.map((track) => (
              <Card
                key={track.trackId}
                title={track.trackName}
                subtitle={track.description || 'Special category award'}
                action={<Badge variant="purple" icon={Award}>Track Award</Badge>}
              >
                {track.winner ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <span style={{ fontSize: 28 }}>🏆</span>
                      <div>
                        <div style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {track.winner.projectTitle}
                        </div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                          Team: {track.winner.teamName}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-surface-overlay)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Judge Nominations:</span>
                      <strong className="tabular-nums" style={{ color: 'var(--accent-purple)' }}>{track.winner.votes} votes</strong>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
                    No winner declared yet
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {/* Project Detail Modal */}
      <Modal
        isOpen={!!selectedDetails}
        onClose={() => setSelectedDetails(null)}
        title={selectedDetails?.title || 'Project Breakdown'}
        subtitle={`Team: ${selectedDetails?.team?.name || 'Unknown'}`}
        maxWidth="620px"
        footer={
          <Button variant="secondary" onClick={() => setSelectedDetails(null)}>
            Close
          </Button>
        }
      >
        {selectedDetails && (
          <div>
            {selectedDetails.description && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>
                  Description
                </div>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {selectedDetails.description}
                </p>
              </div>
            )}

            {/* Links */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
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
            </div>

            {/* Evaluations breakdown */}
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 10 }}>
              Individual Judge Scores ({selectedDetails.scores?.length || 0})
            </div>

            {selectedDetails.scores?.length === 0 ? (
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>No scores submitted yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {selectedDetails.scores?.map((score, sIdx) => {
                  const total = score.completion + score.originality + score.learning + score.design + score.technology;
                  return (
                    <div
                      key={sIdx}
                      style={{
                        padding: '12px 16px',
                        background: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {score.judge?.name || `Judge ${sIdx + 1}`}
                        </span>
                        <span className="tabular-nums" style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--accent)' }}>
                          {total} / 50
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, fontSize: 'var(--font-size-2xs)', color: 'var(--text-secondary)' }}>
                        <div>Comp: <strong className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{score.completion}</strong></div>
                        <div>Orig: <strong className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{score.originality}</strong></div>
                        <div>Learn: <strong className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{score.learning}</strong></div>
                        <div>Des: <strong className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{score.design}</strong></div>
                        <div>Tech: <strong className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{score.technology}</strong></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
