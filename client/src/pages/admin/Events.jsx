import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import {
  Calendar,
  Plus,
  Play,
  CheckCircle2,
  Trash2,
  Edit3,
  Sparkles,
  Clock,
  Layers
} from '../../components/ui/icons';

export default function AdminEvents() {
  const [events, setEvents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [deletingEvent, setDeletingEvent] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', timePerProject: 180, setSize: 5 });
  const [creatingSample, setCreatingSample] = useState(false);
  const { success, error: toastError } = useToast();
  const { refreshActiveEvent } = useActiveEvent();

  const loadEvents = () => {
    api.get('/events').then((r) => setEvents(r.data)).catch(() => {});
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleActivate = async (id) => {
    try {
      await api.post(`/events/${id}/activate`);
      success('Event set as globally active');
      loadEvents();
      refreshActiveEvent();
    } catch (err) {
      toastError('Failed to activate event');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      if (editingEvent) {
        await api.put(`/events/${editingEvent.id}`, form);
        success('Event updated successfully');
      } else {
        await api.post('/events', form);
        success('Event created successfully');
      }
      setShowModal(false);
      setEditingEvent(null);
      setForm({ name: '', description: '', timePerProject: 180, setSize: 5 });
      loadEvents();
      refreshActiveEvent();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to save event');
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/events/${id}`, { status });
      success(`Event status shifted to ${status}`);
      loadEvents();
      refreshActiveEvent();
    } catch (err) {
      toastError('Failed to update event status');
    }
  };

  const confirmDelete = async () => {
    if (!deletingEvent) return;
    try {
      await api.delete(`/events/${deletingEvent.id}`);
      success('Event deleted');
      setDeletingEvent(null);
      loadEvents();
      refreshActiveEvent();
    } catch (err) {
      toastError('Failed to delete event');
    }
  };

  const createSample = async () => {
    setCreatingSample(true);
    try {
      await api.post('/events/sample');
      success('Sample AceHack 5.0 event seeded successfully');
      loadEvents();
      refreshActiveEvent();
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to generate sample event');
    } finally {
      setCreatingSample(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Event Operations"
        subtitle="Manage hackathons, active event selection, and judging session rules"
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            {events.length === 0 && (
              <Button
                variant="secondary"
                size="md"
                icon={Sparkles}
                loading={creatingSample}
                onClick={createSample}
              >
                Create Sample Event
              </Button>
            )}
            <Button
              variant="primary"
              size="md"
              icon={Plus}
              onClick={() => {
                setEditingEvent(null);
                setForm({ name: '', description: '', timePerProject: 180, setSize: 5 });
                setShowModal(true);
              }}
            >
              New Event
            </Button>
          </div>
        }
      />

      {/* Events Grid */}
      {events.length === 0 ? (
        <Card>
          <EmptyState
            icon={Calendar}
            title="No Events Found"
            description="Create your first hackathon event or seed demo sample data to start evaluating projects."
            action={
              <Button variant="primary" icon={Sparkles} onClick={createSample}>
                Seed AceHack 5.0 Demo
              </Button>
            }
          />
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
          {events.map((ev) => (
            <Card
              key={ev.id}
              title={ev.name}
              subtitle={ev.description || 'No description provided'}
              action={
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {ev.isActive && <Badge variant="primary" dot pulse>Active</Badge>}
                  <Badge variant={ev.status === 'JUDGING' ? 'warning' : ev.status === 'COMPLETED' ? 'success' : 'default'}>
                    {ev.status}
                  </Badge>
                </div>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '14px 0', padding: '12px 14px', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)' }}>
                <div>
                  <span style={{ fontSize: 'var(--font-size-2xs)', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>Set Size</span>
                  <div className="tabular-nums" style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {ev.setSize} projects / set
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 'var(--font-size-2xs)', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>Time per Project</span>
                  <div className="tabular-nums" style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {Math.round(ev.timePerProject / 60)} minutes
                  </div>
                </div>
              </div>

              {/* Status and Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {!ev.isActive && (
                    <Button variant="secondary" size="sm" onClick={() => handleActivate(ev.id)}>
                      Make Active
                    </Button>
                  )}
                  {ev.status !== 'JUDGING' ? (
                    <Button variant="secondary" size="sm" icon={Play} onClick={() => updateStatus(ev.id, 'JUDGING')}>
                      Start Judging
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" icon={CheckCircle2} onClick={() => updateStatus(ev.id, 'COMPLETED')}>
                      Complete Event
                    </Button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    className="apple-btn-icon-only apple-btn-ghost apple-btn-sm"
                    onClick={() => {
                      setEditingEvent(ev);
                      setForm({
                        name: ev.name,
                        description: ev.description || '',
                        timePerProject: ev.timePerProject || 180,
                        setSize: ev.setSize || 5,
                      });
                      setShowModal(true);
                    }}
                    title="Edit Event"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    type="button"
                    className="apple-btn-icon-only apple-btn-ghost apple-btn-sm"
                    onClick={() => setDeletingEvent(ev)}
                    title="Delete Event"
                    style={{ color: 'var(--accent-danger)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingEvent ? 'Edit Event' : 'Create Hackathon Event'}
        subtitle="Define event parameters, set sizes, and timer duration"
        maxWidth="500px"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate}>Save Event</Button>
          </>
        }
      >
        <form onSubmit={handleCreate}>
          <Input
            label="Event Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. AceHack 5.0"
            required
            autoFocus
          />

          <div className="apple-form-group">
            <label className="apple-form-label">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="apple-input"
              style={{ resize: 'vertical' }}
              placeholder="Brief summary of the hackathon event..."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Input
              label="Projects per Set"
              type="number"
              min={2}
              max={20}
              value={form.setSize}
              onChange={(e) => setForm({ ...form, setSize: Number(e.target.value) })}
              required
            />
            <Input
              label="Seconds per Project"
              type="number"
              min={30}
              step={30}
              value={form.timePerProject}
              onChange={(e) => setForm({ ...form, timePerProject: Number(e.target.value) })}
              helpText={`${Math.round(form.timePerProject / 60)} minutes`}
              required
            />
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingEvent}
        onClose={() => setDeletingEvent(null)}
        title="Delete Event?"
        subtitle="This action permanently deletes all associated sets, projects, and judging scores."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingEvent(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete}>Delete Event</Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Are you sure you want to delete <strong>{deletingEvent?.name}</strong>?
        </p>
      </Modal>
    </div>
  );
}
