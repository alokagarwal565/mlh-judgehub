import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useActiveEvent } from '../../context/ActiveEventContext';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
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
        <Card>
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
          {tracks.map((track) => (
            <Card
              key={track.id}
              title={track.name}
              subtitle={track.description || 'Special category award'}
              action={<Badge variant="purple" icon={Award}>Award</Badge>}
            >
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  type="button"
                  className="apple-btn-icon-only apple-btn-ghost apple-btn-sm"
                  onClick={() => {
                    setEditingTrack(track);
                    setForm({
                      name: track.name,
                      description: track.description || '',
                      color: track.color || '#0A84FF'
                    });
                    setShowModal(true);
                  }}
                  title="Edit Track"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  type="button"
                  className="apple-btn-icon-only apple-btn-ghost apple-btn-sm"
                  onClick={() => setDeletingTrack(track)}
                  title="Delete Track"
                  style={{ color: 'var(--accent-danger)' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingTrack ? 'Edit Track' : 'Create Award Track'}
        subtitle="Specify category name and judging criteria"
        maxWidth="480px"
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
