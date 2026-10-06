import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useActiveEvent } from '../../context/ActiveEventContext';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import EmptyState from '../../components/ui/EmptyState';
import {
  FolderGit2,
  Edit3,
  ExternalLink,
  Play,
  CheckCircle2,
  Clock,
  Sparkles
} from '../../components/ui/icons';

export default function TeamDashboard() {
  const { user } = useAuth();
  const { activeEvent } = useActiveEvent();
  const { success, error: toastError } = useToast();

  const [project, setProject] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', demoLink: '', videoUrl: '' });

  const fetchTeamProject = async () => {
    try {
      const eventsRes = await api.get('/events');
      const targetEvent = activeEvent || eventsRes.data.find((e) => e.isActive) || eventsRes.data[0];
      if (targetEvent) {
        const pr = await api.get(`/events/${targetEvent.id}/projects`);
        const mine = pr.data.find((p) => p.team?.id === user?.id);
        if (mine) {
          setProject(mine);
          setForm({
            title: mine.title,
            description: mine.description || '',
            demoLink: mine.demoLink || '',
            videoUrl: mine.videoUrl || '',
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch project', err);
    }
  };

  useEffect(() => {
    fetchTeamProject();
  }, [user, activeEvent]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!project) return;
    setSaving(true);
    try {
      const eventId = activeEvent?.id || project.eventId;
      const res = await api.put(`/events/${eventId}/projects/${project.id}`, form);
      setProject(res.data);
      setEditing(false);
      success('Project submission updated successfully!');
    } catch (err) {
      toastError(err.response?.data?.error || 'Failed to update project');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name}!`}
        subtitle="Participant Portal • Manage submission details and view judging feedback"
        badge={
          project?.status === 'SCORED' ? (
            <Badge variant="success" icon={CheckCircle2}>Evaluation Complete</Badge>
          ) : project?.status === 'UNDER_REVIEW' ? (
            <Badge variant="warning" dot pulse>In Evaluation</Badge>
          ) : (
            <Badge variant="primary">Submitted</Badge>
          )
        }
        actions={
          project && !editing && (
            <Button
              variant="secondary"
              size="md"
              icon={Edit3}
              onClick={() => setEditing(true)}
            >
              Edit Submission
            </Button>
          )
        }
      />

      {!project ? (
        <Card>
          <EmptyState
            icon={FolderGit2}
            title="No Project Assigned"
            description="Your team account does not have a linked project in the active hackathon yet. Please ask an organizer to register your project."
          />
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr)', gap: 20 }}>
          <Card
            title={editing ? "Edit Submission Details" : project.title}
            subtitle={
              editing
                ? "Update your title, demo links, and description"
                : `Team #${project.teamNumber || '—'} • Assigned Location: Room ${project.roomNumber || 'TBD'}`
            }
          >
            {editing ? (
              <form onSubmit={handleSave}>
                <Input
                  label="Project Title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Project name"
                  required
                />

                <div className="apple-form-group">
                  <label className="apple-form-label">Description & Concept</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={4}
                    className="apple-input"
                    style={{ resize: 'vertical' }}
                    placeholder="Briefly describe what your project does and how it was built..."
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Input
                    label="Live Demo Link"
                    type="url"
                    value={form.demoLink}
                    onChange={(e) => setForm({ ...form, demoLink: e.target.value })}
                    placeholder="https://..."
                  />
                  <Input
                    label="Demo Video Link"
                    type="url"
                    value={form.videoUrl}
                    onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                    placeholder="https://youtube.com/..."
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                  <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button variant="primary" loading={saving} type="submit">Save Changes</Button>
                </div>
              </form>
            ) : (
              <div>
                <div style={{ marginBottom: 18 }}>
                  <span style={{ fontSize: 'var(--font-size-2xs)', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    About Project
                  </span>
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {project.description || 'No description provided yet.'}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                  {project.demoLink && (
                    <a
                      href={project.demoLink}
                      target="_blank"
                      rel="noreferrer"
                      className="apple-btn apple-btn-secondary apple-btn-sm"
                      style={{ textDecoration: 'none' }}
                    >
                      <ExternalLink size={14} /> Open Demo
                    </a>
                  )}
                  {project.videoUrl && (
                    <a
                      href={project.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="apple-btn apple-btn-secondary apple-btn-sm"
                      style={{ textDecoration: 'none' }}
                    >
                      <Play size={14} /> Watch Video
                    </a>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
