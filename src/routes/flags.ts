import { Router } from 'express';
import { prisma } from '../index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { runIntegrityChecks } from '../engine/integrity.js';

const router = Router();

// GET /api/events/:eventId/flags
router.get('/:eventId/flags', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const flags = await prisma.flag.findMany({
      where: { eventId: req.params.eventId },
      include: {
        project: { select: { title: true, roomNumber: true } },
        creator: { select: { name: true, role: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(flags);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/flags — Create flag
router.post('/:eventId/flags', authenticate, async (req, res) => {
  try {
    const { projectId, reason } = req.body;
    const flag = await prisma.flag.create({
      data: {
        eventId: req.params.eventId,
        projectId,
        flaggedBy: req.user!.userId,
        reason
      }
    });

    // Mark the project as flagged
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'FLAGGED' }
    });

    const io = req.app.get('io');
    io.emit('flag:created', {
      flagId: flag.id,
      projectId,
      reason,
      flaggedBy: req.user!.name
    });

    res.status(201).json(flag);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/events/:eventId/flags/:flagId — Update flag
router.put('/:eventId/flags/:flagId', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    const flag = await prisma.flag.update({
      where: { id: req.params.flagId },
      data: { status, adminNotes }
    });
    res.json(flag);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/integrity-check — Run automated checks
router.post('/:eventId/integrity-check', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const integrityFlags = await runIntegrityChecks(req.params.eventId);

    // Auto-create Flag entries for each detected issue
    for (const f of integrityFlags) {
      if (f.projectId) {
        await prisma.flag.create({
          data: {
            eventId: req.params.eventId,
            projectId: f.projectId,
            flaggedBy: req.user!.userId,
            reason: `[AUTO] ${f.type}: ${f.details}`
          }
        });
      }
    }

    res.json({ total: integrityFlags.length, flags: integrityFlags });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
