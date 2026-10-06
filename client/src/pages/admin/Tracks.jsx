import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useActiveEvent } from '../../context/ActiveEventContext';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import {
  Tags,
  Plus,
  Award,
  Edit3,
  Trash2
} from '../../components/ui/icons';

export default function AdminTracks() {
  const [tracks, setTracks] = useState([]);
  const [eventId, setEventId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTrack, setEditingTrack] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', color: '#0A84FF' });
  const [deletingTrack, setDeletingTrack] = useState(null);
  const { activeEvent } = useActiveEvent();
  const { success, error: toastError } = useToast();

  const loadTracks = () => {
    if (eventId) {
      api.get(`/events/${eventId}/tracks`).then((r) => setTracks(r.data)).catch(() => {});
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
    loadTracks();
  }, [eventId]);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingTrack) {
        const res = await api.put(`/events/${eventId}/tracks/${editingTrack.id}`, form);
        setTracks(tracks.map((t) => (t.id === editingTrack.id ? res.data : t)));
        success('Category track updated');
      } else {
        const res = await api.post(`/events/${eventId}/tracks`, form);
        setTracks([...tracks, res.data]);
        success('Category track created');
      }
      setShowModal(false);
      setEditingTrack(null);
      setForm({ name: '', description: '', color: '#0A84FF' });
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to save track');
    }
  };

  const confirmDelete = async () => {
    if (!deletingTrack) return;
    try {
      await api.delete(`/events/${eventId}/tracks/${deletingTrack.id}`);
      success('Track category deleted');
      setDeletingTrack(null);
      loadTracks();
    } catch (err) {
      toastError('Failed to delete track');
    }
  };

  return (
    <div>
      <PageHeader
        title="Category Tracks"
        subtitle={`Special awards & prize tracks for ${activeEvent?.name || 'event'}`}
        actions={
          <Button
            variant="primary"
            size="md"
            icon={Plus}
            onClick={() => {
              setEditingTrack(null);
              setForm({ name: '', description: '', color: '#0A84FF' });
              setShowModal(true);
            }}
          >
            New Track
          </Button>
        }
      />

      {tracks.length === 0 ? (
        <Card headerBorder={false}>
          <EmptyState
            icon={Tags}
            title="No Category Tracks"
            description="Create custom award tracks (e.g. Best AI Hack, Best Hardware, Social Impact) for judges to nominate standout submissions."
            action={
              <Button
                variant="primary"
                icon={Plus}
                onClick={() => {
                  setEditingTrack(null);
                  setForm({ name: '', description: '', color: '#0A84FF' });
                  setShowModal(true);
                }}
              >
                Create First Track
              </Button>
            }
          />
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
          {tracks.map((track) => {
            const trackColor = track.color || '#0A84FF';
            const nominationCount = track._count?.nominations || 0;
            return (
              <div
                key={track.id}
                className="apple-card"
                style={{
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                <div>
                  {/* Card Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          background: trackColor,
                          boxShadow: `0 0 10px ${trackColor}60`,
                          flexShrink: 0
                        }}
                      />
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>
                        {track.name}
                      </h3>
                    </div>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '3px 9px',
                        borderRadius: 'var(--radius-pill)',
                        background: `${trackColor}18`,
                        border: `1px solid ${trackColor}40`,
                        color: trackColor,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                        flexShrink: 0
                      }}
                    >
                      <Award size={13} strokeWidth={2.2} /> Award
                    </span>
                  </div>

                  {/* Description */}
                  <p style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                    margin: '0 0 14px',
                    minHeight: 38
                  }}>
                    {track.description || 'Special category award for standout submissions.'}
                  </p>

                  {/* Judge Nominations Metric */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12
                  }}>
                    <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>Judge Nominations</span>
                    <span className="tabular-nums" style={{ fontWeight: 700, color: nominationCount > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                      {nominationCount} {nominationCount === 1 ? 'nomination' : 'nominations'}
                    </span>
                  </div>
                </div>

                {/* Card Footer Single Clean Action Bar */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 16,
                  paddingTop: 12,
                  borderTop: '1px solid var(--border-subtle)'
                }}>
                  <IconButton
                    icon={Edit3}
                    label="Edit Track"
                    size="sm"
                    onClick={() => {
                      setEditingTrack(track);
                      setForm({
                        name: track.name,
                        description: track.description || '',
                        color: track.color || '#0A84FF'
                      });
                      setShowModal(true);
                    }}
                  />
                  <IconButton
                    icon={Trash2}
                    label="Delete Track"
                    size="sm"
                    variant="danger"
                    onClick={() => setDeletingTrack(track)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingTrack ? 'Edit Track' : 'Create Award Track'}
        subtitle="Specify category name, criteria, and brand color"
        maxWidth="500px"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSave}>Save Track</Button>
          </>
        }
      >
        <form onSubmit={handleSave}>
          <Input
            label="Track Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Best AI Integration"
            required
            autoFocus
          />
          <div className="apple-form-group">
            <label className="apple-form-label">Description & Criteria</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="apple-input"
              style={{ resize: 'vertical' }}
              placeholder="What makes a project eligible for this prize?"
            />
          </div>
          <div className="apple-form-group">
            <label className="apple-form-label">Brand Color Accent</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
              {['#0A84FF', '#BF5AF2', '#30D158', '#FF9F0A', '#FF375F', '#5E5CE6', '#64D2FF'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: c,
                    border: form.color === c ? '2px solid #fff' : '2px solid transparent',
                    boxShadow: form.color === c ? `0 0 10px ${c}` : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                style={{
                  width: 34,
                  height: 28,
                  padding: 0,
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: 'transparent'
                }}
                title="Custom color"
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingTrack}
        onClose={() => setDeletingTrack(null)}
        title="Delete Award Track?"
        subtitle="This action removes the category and any judge nominations."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingTrack(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete}>Delete Track</Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Are you sure you want to delete <strong>{deletingTrack?.name}</strong>?
        </p>
      </Modal>
    </div>
  );
}
