import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import Pagination, { usePagination } from '../../components/Pagination';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
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
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        marginBottom: 24,
        flexWrap: 'wrap'
      }}>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { id: 'leaderboard', label: 'Overall Standings', icon: Trophy, count: displayLeaderboard.length },
            { id: 'tracks', label: 'Track Category Winners', icon: Award, count: trackWinners.length }
          ]}
        />

        {tab === 'leaderboard' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            background: 'var(--bg-surface-elevated)',
            padding: '6px 10px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ width: 240 }}>
              <SearchField
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search teams, titles, rooms..."
              />
            </div>

            <button
              type="button"
              onClick={() => setHideTrackWinners(!hideTrackWinners)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 'var(--radius-pill)',
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${hideTrackWinners ? 'var(--accent)' : 'var(--border-subtle)'}`,
                background: hideTrackWinners ? 'var(--accent-tint)' : 'rgba(255, 255, 255, 0.04)',
                color: hideTrackWinners ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                whiteSpace: 'nowrap',
                userSelect: 'none'
              }}
            >
              <span style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: hideTrackWinners ? 'var(--accent)' : 'var(--text-tertiary)'
              }} />
              <span>Hide Track Winners</span>
            </button>

            <button
              type="button"
              onClick={() => setHideFlagged(!hideFlagged)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 'var(--radius-pill)',
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${hideFlagged ? 'var(--accent-danger)' : 'var(--border-subtle)'}`,
                background: hideFlagged ? 'var(--accent-danger-tint)' : 'rgba(255, 255, 255, 0.04)',
                color: hideFlagged ? 'var(--accent-danger)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                whiteSpace: 'nowrap',
                userSelect: 'none'
              }}
            >
              <span style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: hideFlagged ? 'var(--accent-danger)' : 'var(--text-tertiary)'
              }} />
              <span>Hide Flagged ({flaggedCount})</span>
            </button>
          </div>
        )}
      </div>

      {tab === 'leaderboard' ? (
        <>
          {/* Top 3 Podium Cards */}
          {page === 1 && !search && top3.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
              {top3.map((item, idx) => {
                const tierConfig = [
                  {
                    color: '#ffd60a',
                    bg: 'rgba(255, 214, 10, 0.08)',
                    border: 'rgba(255, 214, 10, 0.28)',
                    glow: 'rgba(255, 214, 10, 0.15)',
                    badge: 'Gold • 1st Place',
                    place: '1st',
                    Icon: Trophy
                  },
                  {
                    color: '#c5cad3',
                    bg: 'rgba(197, 202, 211, 0.08)',
                    border: 'rgba(197, 202, 211, 0.28)',
                    glow: 'rgba(197, 202, 211, 0.12)',
                    badge: 'Silver • 2nd Place',
                    place: '2nd',
                    Icon: Award
                  },
                  {
                    color: '#e59b5f',
                    bg: 'rgba(229, 155, 95, 0.08)',
                    border: 'rgba(229, 155, 95, 0.28)',
                    glow: 'rgba(229, 155, 95, 0.12)',
                    badge: 'Bronze • 3rd Place',
                    place: '3rd',
                    Icon: Award
                  }
                ];
                const t = tierConfig[idx] || tierConfig[0];
                const TierIcon = t.Icon;

                return (
                  <div
                    key={item.projectId}
                    className="apple-card is-interactive"
                    onClick={() => handleOpenDetails(item.projectId)}
                    style={{
                      background: `linear-gradient(180deg, ${t.bg} 0%, rgba(17, 19, 25, 0.95) 100%)`,
                      borderColor: t.border,
                      boxShadow: `0 4px 20px ${t.glow}`,
                      padding: 24,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 16,
                      borderRadius: 'var(--radius-lg)'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          background: `${t.color}18`,
                          border: `1px solid ${t.color}40`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: t.color
                        }}>
                          <TierIcon size={22} strokeWidth={2.2} />
                        </div>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-pill)',
                          background: `${t.color}20`,
                          color: t.color,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: '0.02em',
                          textTransform: 'uppercase'
                        }}>
                          {t.badge}
                        </span>
                      </div>
                      <h4 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: '-0.015em' }}>
                        {item.projectTitle}
                      </h4>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                        Team {item.teamName} {item.roomNumber && `· ${item.roomNumber.toLowerCase().startsWith('room') ? item.roomNumber : `Room ${item.roomNumber}`}`}
                      </p>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                      <div>
                        <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: '0.04em', display: 'block' }}>
                          Stack Rank Points
                        </span>
                        <span className="tabular-nums" style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.02em' }}>
                          {item.stackPoints} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary)' }}>pts</span>
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: '0.04em', display: 'block' }}>
                          Total Marks
                        </span>
                        <span className="tabular-nums" style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                          {item.totalMarks} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary)' }}>/ 50</span>
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
                              {item.roomNumber.toLowerCase().startsWith('room') ? item.roomNumber : `Room ${item.roomNumber}`}
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
                          <span className="tabular-nums" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            {item.totalMarks}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="tabular-nums apple-badge apple-badge-default apple-badge-sm">
                            {item.timesEvaluated} {item.timesEvaluated === 1 ? 'judge' : 'judges'}
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
                          <IconButton
                            icon={Eye}
                            label="View Score Breakdown"
                            size="sm"
                            onClick={() => handleOpenDetails(item.projectId)}
                          />
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: 'rgba(191, 90, 242, 0.15)',
                        border: '1px solid rgba(191, 90, 242, 0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--accent-purple)'
                      }}>
                        <Trophy size={22} strokeWidth={2.2} />
                      </div>
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
        subtitle={`Team ${selectedDetails?.team?.name || 'Unknown'} ${selectedDetails?.roomNumber ? `· ${selectedDetails.roomNumber.toLowerCase().startsWith('room') ? selectedDetails.roomNumber : `Room ${selectedDetails.roomNumber}`}` : ''} ${selectedDetails?.teamNumber ? `· #${selectedDetails.teamNumber}` : ''}`}
        maxWidth="640px"
        footer={
          <Button variant="secondary" onClick={() => setSelectedDetails(null)}>
            Close
          </Button>
        }
      >
        {selectedDetails && (
          <div>
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

            {/* Evaluations breakdown */}
            <div style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
              Judge Evaluations ({selectedDetails.scores?.length || 0})
            </div>

            {(!selectedDetails.scores || selectedDetails.scores.length === 0) ? (
              <div style={{
                padding: '28px 20px',
                textAlign: 'center',
                background: 'var(--bg-surface-elevated)',
                border: '1px dashed var(--border-subtle)',
                borderRadius: 'var(--radius-lg)'
              }}>
                <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 4px' }}>
                  No Evaluations Recorded Yet
                </p>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', margin: 0 }}>
                  When assigned judges evaluate this project, their category score breakdown and comments will appear here.
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
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, fontSize: 'var(--font-size-2xs)', color: 'var(--text-secondary)', marginBottom: matchingFeedback?.comment ? 10 : 0 }}>
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
        )}
      </Modal>
    </div>
  );
}
