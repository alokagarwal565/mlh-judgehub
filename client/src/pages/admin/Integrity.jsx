import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import PageHeader from '../../components/ui/PageHeader';
import Card, { StatCard } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { SearchField } from '../../components/ui/Input';
import EmptyState from '../../components/ui/EmptyState';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Play,
  Check,
  X,
  Search,
  Flag,
  Sparkles
} from '../../components/ui/icons';

export default function AdminIntegrity() {
  const { success, error: toastError } = useToast();
  const { activeEvent } = useActiveEvent();

  const [eventId, setEventId] = useState('');
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchFlags = () => {
    if (eventId) {
      api.get(`/events/${eventId}/flags`).then((r) => setFlags(r.data)).catch(() => {});
    }
  };

  useEffect(() => {
    if (activeEvent) {
      setEventId(activeEvent.id);
    } else {
      api.get('/events').then((r) => {
        if (r.data.length > 0) setEventId(r.data[0].id);
      });
    }
  }, [activeEvent]);

  useEffect(() => {
    fetchFlags();
  }, [eventId]);

  const runIntegrityChecks = async () => {
    setLoading(true);
    try {
      const res = await api.post(`/events/${eventId}/integrity-check`);
      success(`Integrity scans finished: ${res.data?.discrepancies?.length || 0} potential anomalies detected.`);
      fetchFlags();
    } catch (err) {
      toastError('Integrity scan failed');
    } finally {
      setLoading(false);
    }
  };

  const updateFlagStatus = async (flagId, status) => {
    try {
      await api.put(`/events/${eventId}/flags/${flagId}`, { status });
      success(`Flag marked as ${status.toLowerCase()}`);
      setFlags((prev) => prev.map((f) => (f.id === flagId ? { ...f, status } : f)));
    } catch (err) {
      toastError('Failed to update flag status');
    }
  };

  const filteredFlags = flags.filter((f) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      f.project?.title?.toLowerCase().includes(q) ||
      f.project?.team?.name?.toLowerCase().includes(q) ||
      f.reason?.toLowerCase().includes(q) ||
      f.creator?.name?.toLowerCase().includes(q);

    const matchStatus = statusFilter === 'ALL' || f.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const openCount = flags.filter((f) => f.status === 'OPEN').length;
  const reviewedCount = flags.filter((f) => f.status === 'REVIEWED').length;
  const dismissedCount = flags.filter((f) => f.status === 'DISMISSED').length;

  return (
    <div>
      <PageHeader
        title="Integrity & Flag Triage"
        subtitle="Review anomalies, report violations, and investigate outlier judge scores"
        actions={
          <Button
            variant="primary"
            size="md"
            icon={Sparkles}
            loading={loading}
            onClick={runIntegrityChecks}
          >
            Run Integrity Scan
          </Button>
        }
      />

      {/* Metrics Header */}
      <div className="apple-stats-grid" style={{ marginBottom: 24 }}>
        <StatCard
          label="Open Flags"
          value={openCount}
          subvalue={openCount > 0 ? "Requires action" : "Inbox cleared"}
          icon={AlertTriangle}
          variant={openCount > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Reviewed & Verified"
          value={reviewedCount}
          subvalue="Resolved by organizers"
          icon={CheckCircle2}
          variant="success"
        />
        <StatCard
          label="Dismissed"
          value={dismissedCount}
          subvalue="Marked false positive"
          icon={ShieldAlert}
          variant="default"
        />
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <SegmentedControl
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { id: 'ALL', label: 'All Incidents', count: flags.length },
            { id: 'OPEN', label: 'Open', count: openCount },
            { id: 'REVIEWED', label: 'Reviewed', count: reviewedCount },
            { id: 'DISMISSED', label: 'Dismissed', count: dismissedCount }
          ]}
        />

        <SearchField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by project, team, reason..."
        />
      </div>

      {/* Flags List / Table */}
      <div className="apple-table-container">
        <div className="apple-table-scroll">
          <table className="apple-table">
            <thead>
              <tr>
                <th>Project & Team</th>
                <th>Location</th>
                <th>Reported By</th>
                <th>Reason & Notes</th>
                <th>Status</th>
                <th style={{ width: 180, textAlign: 'right' }}>Resolution Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredFlags.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '48px 0' }}>
                    <EmptyState
                      icon={ShieldAlert}
                      title="No Incident Flags"
                      description={search ? "No flag records match your query." : "Judging submissions currently meet all integrity checks."}
                    />
                  </td>
                </tr>
              ) : (
                filteredFlags.map((flag) => (
                  <tr key={flag.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {flag.project?.title || 'Unknown Project'}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                        Team: {flag.project?.team?.name || '—'}
                      </div>
                    </td>
                    <td>
                      {flag.project?.roomNumber ? (
                        <span className="apple-badge apple-badge-default apple-badge-sm">
                          Room {flag.project.roomNumber}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)' }}>
                        {flag.creator?.name || 'Automated Engine'}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--text-tertiary)' }}>
                        {flag.creator?.role || 'SYSTEM'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)', maxWidth: 360 }}>
                        {flag.reason}
                      </div>
                    </td>
                    <td>
                      {flag.status === 'OPEN' ? (
                        <Badge variant="danger" dot pulse>Open</Badge>
                      ) : flag.status === 'REVIEWED' ? (
                        <Badge variant="success" icon={CheckCircle2}>Reviewed</Badge>
                      ) : (
                        <Badge variant="default">Dismissed</Badge>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        {flag.status !== 'REVIEWED' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={Check}
                            onClick={() => updateFlagStatus(flag.id, 'REVIEWED')}
                          >
                            Resolve
                          </Button>
                        )}
                        {flag.status !== 'DISMISSED' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={X}
                            onClick={() => updateFlagStatus(flag.id, 'DISMISSED')}
                          >
                            Dismiss
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
