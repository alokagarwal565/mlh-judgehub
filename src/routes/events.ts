import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { createSampleData } from '../utils/sampleData.js';

const router = Router();

// GET /api/events
router.get('/', authenticate, async (_req, res) => {
  try {
    const events = await prisma.event.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events
router.post('/', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, description, startDate, endDate, timePerProject, setSize } = req.body;
    const event = await prisma.event.create({
      data: {
        name,
        description,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        timePerProject: timePerProject || 180,
        setSize: setSize || 5
      }
    });
    res.status(201).json(event);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: {
        tracks: true,
        _count: { select: { projects: true, judgeSets: true } }
      }
    });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/events/:id
router.put('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, description, startDate, endDate, timePerProject, setSize, status } = req.body;
    const event = await prisma.event.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(startDate !== undefined && { startDate: new Date(startDate) }),
        ...(endDate !== undefined && { endDate: new Date(endDate) }),
        ...(timePerProject !== undefined && { timePerProject }),
        ...(setSize !== undefined && { setSize }),
        ...(status !== undefined && { status })
      }
    });

    if (status) {
      const io = req.app.get('io');
      io.emit('event:statusChanged', { eventId: event.id, status: event.status });
    }

    res.json(event);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:id/initialize — Start judging process automatically
router.post('/:id/initialize', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { initializeEventJudging } = await import('../engine/assignment.js');
    const result = await initializeEventJudging(req.params.id);
    
    const io = req.app.get('io');
    io.emit('event:statusChanged', { eventId: req.params.id, status: 'JUDGING' });
    
    res.json({ message: 'Judging initialized', ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/events/:id/activate — Set an event as the global active event
router.post('/:id/activate', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    // First, deactivate all other events
    await (prisma.event as any).updateMany({
      data: { isActive: false }
    });

    // Then, activate this one
    const event = await (prisma.event as any).update({
      where: { id },
      data: { isActive: true }
    });

    const io = req.app.get('io');
    io.emit('event:activeChanged', { eventId: event.id });

    res.json(event);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/events/:id
router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Find all teams and judges associated with this event before deletion
    const projects = await prisma.project.findMany({
      where: { eventId: id },
      select: { teamId: true, teamNumber: true }
    });
    const judgeSets = await prisma.judgeSet.findMany({
      where: { eventId: id },
      select: { judgeId: true }
    });

    const teamUserIds = projects.map(p => p.teamId);
    const judgeUserIds = judgeSets.map(js => js.judgeId).filter(Boolean) as string[];

    // NEW: Find sample judges and teams by their stable domains
    const sampleUsers = await prisma.user.findMany({
      where: {
        role: { in: ['JUDGE', 'TEAM'] },
        OR: [
          { email: { endsWith: '@mlh.sample' } },
          { email: { endsWith: '@team.sample' } }
        ]
      },
      select: { id: true }
    });
    const sampleUserIds = sampleUsers.map(u => u.id);
    const userIdsToDelete = [...new Set([...teamUserIds, ...judgeUserIds, ...sampleUserIds])];

    // 2. Delete the event and all associated records
    // We do manual cleanup for problematic intermediate tables that lack Project-side cascades
    await prisma.stackRankVote.deleteMany({ where: { set: { eventId: id } } });
    await prisma.trackNomination.deleteMany({ where: { set: { eventId: id } } });
    await prisma.feedback.deleteMany({ where: { set: { eventId: id } } });
    await prisma.score.deleteMany({ where: { set: { eventId: id } } });
    await prisma.judgeSetProject.deleteMany({ where: { set: { eventId: id } } });
    
    // Now safe to delete event (it will cascade to Projects, Tracks, and JudgeSets)
    await prisma.event.delete({ where: { id } });

    // 3. Cleanup associated users
    // We only delete users who are roles 'TEAM' or 'JUDGE' to be safe
    
    if (userIdsToDelete.length > 0) {
      // Manual cleanup for users who were only in this event
      // Deleting logs and associations first to avoid FK constraints
      await prisma.auditLog.deleteMany({ where: { userId: { in: userIdsToDelete } } });
      await prisma.rejudgeAssignment.deleteMany({ where: { judgeId: { in: userIdsToDelete } } });
      await prisma.editRequest.deleteMany({ where: { judgeId: { in: userIdsToDelete } } });
      
      // Cleanup flags created by these users
      await prisma.flag.deleteMany({ where: { flaggedBy: { in: userIdsToDelete } } });

      await prisma.user.deleteMany({
        where: {
          id: { in: userIdsToDelete },
          role: { in: ['TEAM', 'JUDGE'] }
        }
      });
    }

    res.json({ message: 'Event and associated users deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/sample — Create a sample event with dummy data
router.post('/sample', authenticate, requireRole('ADMIN'), async (_req, res) => {
  try {
    const event = await createSampleData();
    res.status(201).json(event);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
