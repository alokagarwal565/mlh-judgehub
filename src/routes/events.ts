import { Router } from 'express';
import { prisma } from '../index.js';
import { authenticate, requireRole } from '../middleware/auth.js';

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

export default router;
