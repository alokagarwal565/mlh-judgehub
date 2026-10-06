import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useSocket } from '../../context/SocketContext';
import { useLoader } from '../../context/LoaderContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { SearchField } from '../../components/ui/Input';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { EmptyState } from '../../components/ui/EmptyState';
import { ClockIcon, CheckCircleIcon, RefreshIcon, XCircleIcon, LayersIcon } from '../../components/ui/icons';

export default function EditRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const { info, error: toastError } = useToast();
  const socket = useSocket();
  const { showLoader, hideLoader } = useLoader();
  const { activeEvent } = useActiveEvent();

  const loadRequests = async () => {
    if (loading) showLoader('Loading edit requests...');
    try {
      const res = await api.get('/edit-requests/admin');
      setRequests(res.data);
    } catch (err) {
      toastError('Failed to load edit requests');
    } finally {
      setLoading(false);
      hideLoader();
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleNew = (req) => {
      setRequests(prev => [req, ...prev]);
      info(`New set edit request from ${req.judge?.name}`, 'Incoming Request');
    };
    socket.on('edit-request:new', handleNew);
    return () => socket.off('edit-request:new', handleNew);
  }, [socket]);

  const handleAction = async (id, action) => {
    try {
      await api.post(`/edit-requests/${id}/${action}`);
      info(`Request ${action === 'approve' ? 'approved' : 'denied'}`, 'Status Updated');
      loadRequests();
    } catch (err) {
      toastError(`Failed to ${action} request`);
    }
  };

  const getSetRange = (projects) => {
    if (!projects || projects.length === 0) return '';
    const nums = projects.map(p => p.project?.teamNumber).filter(n => n !== undefined && n !== null).sort((a, b) => a - b);
    if (nums.length === 0) return '';
    return `(${nums[0]} – ${nums[nums.length - 1]})`;
  };

  const filteredRequests = requests.filter(req => {
    const searchLower = search.toLowerCase();
    const matchesSearch = search === '' || 
      req.judge?.name?.toLowerCase().includes(searchLower) ||
      req.judge?.email?.toLowerCase().includes(searchLower) ||
      req.set?.event?.name?.toLowerCase().includes(searchLower) ||
      req.reason?.toLowerCase().includes(searchLower);

    const matchesStatus = statusFilter === 'ALL' || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = {
    ALL: requests.length,
    PENDING: requests.filter(r => r.status === 'PENDING').length,
    APPROVED: requests.filter(r => r.status === 'APPROVED').length,
    DENIED: requests.filter(r => r.status === 'DENIED').length,
    USED: requests.filter(r => r.status === 'USED').length
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="warning" dot pulse>Pending Review</Badge>;
      case 'APPROVED':
        return <Badge variant="success" dot>Approved</Badge>;
      case 'DENIED':
        return <Badge variant="danger" dot>Denied</Badge>;
      case 'USED':
        return <Badge variant="neutral">Score Re-entered</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  if (!activeEvent) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <PageHeader title="Judge Re-evaluation Requests" subtitle="Review requests from judges to modify completed evaluations" />
        <Card>
          <EmptyState
            icon={ClockIcon}
            title="No Active Event Selected"
            description="Select or mark an event as Active in Events to review judge unlock requests."
            actionLabel="Go to Events"
            onAction={() => window.location.href = '/admin/events'}
          />
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="Judge Re-evaluation Requests"
        subtitle="Review and approve score amendment requests from judges on completed sets"
        badge={statusCounts.PENDING > 0 ? { text: `${statusCounts.PENDING} Pending`, variant: 'warning' } : undefined}
        actions={
          <Button variant="secondary" icon={RefreshIcon} onClick={loadRequests}>
            Refresh Queue
          </Button>
        }
      />

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {/* Controls Bar */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-hairline)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16
        }}>
          <div style={{ width: 280 }}>
            <SearchField
              placeholder="Search judge, reason, event..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <SegmentedControl
            options={[
              { value: 'ALL', label: 'All', badge: statusCounts.ALL },
              { value: 'PENDING', label: 'Pending', badge: statusCounts.PENDING },
              { value: 'APPROVED', label: 'Approved', badge: statusCounts.APPROVED },
              { value: 'DENIED', label: 'Denied', badge: statusCounts.DENIED },
              { value: 'USED', label: 'Re-evaluated', badge: statusCounts.USED }
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>

        {filteredRequests.length === 0 ? (
          <EmptyState
            icon={LayersIcon}
            title={search || statusFilter !== 'ALL' ? 'No Matching Requests' : 'No Unlock Requests'}
            description={search || statusFilter !== 'ALL' ? 'Try adjusting your search query or filter pills.' : 'When a judge submits a request to modify a completed set evaluation, it will appear here.'}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-hairline)' }}>
                  <th style={{ padding: '12px 24px', fontWeight: 600, color: 'var(--text-secondary)' }}>Judge</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Event & Set</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Reason for Amendment</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Submitted</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                  <th style={{ padding: '12px 24px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map(req => (
                  <tr
                    key={req.id}
                    style={{
                      borderBottom: '1px solid var(--border-hairline)',
                      transition: 'background var(--transition-fast)'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '18px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 34,
                          height: 34,
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
                          {req.judge?.name ? req.judge.name.slice(0, 2).toUpperCase() : 'JD'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{req.judge?.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{req.judge?.email}</div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '18px 20px' }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{req.set?.event?.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <Badge variant="accent">
                          Set {req.set?.column} {getSetRange(req.set?.projects)}
                        </Badge>
                      </div>
                    </td>

                    <td style={{ padding: '18px 20px', maxWidth: 320 }}>
                      <div style={{
                        fontSize: 13,
                        lineHeight: 1.5,
                        background: 'var(--bg-elevated)',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-hairline)',
                        color: 'var(--text-secondary)',
                        fontStyle: 'italic'
                      }}>
                        "{req.reason}"
                      </div>
                    </td>

                    <td style={{ padding: '18px 20px', fontVariantNumeric: 'tabular-nums' }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {new Date(req.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    <td style={{ padding: '18px 20px' }}>
                      {renderStatusBadge(req.status)}
                    </td>

                    <td style={{ padding: '18px 24px', textAlign: 'right' }}>
                      {req.status === 'PENDING' ? (
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <Button
                            variant="primary"
                            size="sm"
                            icon={CheckCircleIcon}
                            onClick={() => handleAction(req.id, 'approve')}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            icon={XCircleIcon}
                            onClick={() => handleAction(req.id, 'deny')}
                          >
                            Deny
                          </Button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                          Processed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
