import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requireActiveEvent } from '../middleware/activeEventCheck.js';
import { runIntegrityChecks } from '../engine/integrity.js';

const router = Router();

// GET /api/events/:eventId/flags
router.get('/:eventId/flags', authenticate, requireActiveEvent, async (req, res) => {
  try {
    const flags = await prisma.flag.findMany({
      where: { eventId: req.params.eventId },
      include: {
        project: { select: { title: true, roomNumber: true, teamNumber: true, team: { select: { name: true } } } },
        creator: { select: { name: true, role: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(flags);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/flags — Create or update flag (upsert)
router.post('/:eventId/flags', authenticate, requireActiveEvent, async (req, res) => {
  try {
    const { projectId, reason } = req.body;
    const flag = await prisma.flag.upsert({
      where: {
        projectId_flaggedBy: {
          projectId,
          flaggedBy: req.user!.userId
        }
      },
      update: {
        reason,
        status: 'OPEN' // Reset to OPEN if updating existing flag
      },
      create: {
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
      eventId: req.params.eventId,
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

// PUT /api/events/:eventId/flags/:flagId/edit-reason — Judges can edit their own flag's reason
router.put('/:eventId/flags/:flagId/edit-reason', authenticate, requireActiveEvent, async (req, res) => {
  try {
    const { reason } = req.body;
    
    // Check if flag exists and belongs to this judge or was raised by this judge
    const flag = await prisma.flag.findUnique({
      where: { id: req.params.flagId }
    });

    if (!flag) {
      return res.status(404).json({ error: 'Flag not found' });
    }

    // Only allow judge to edit if they raised the flag AND it's still open/reviewed
    if (flag.flaggedBy !== req.user!.userId) {
      return res.status(403).json({ error: 'You can only edit your own flags' });
    }

    if (flag.status !== 'OPEN' && flag.status !== 'REVIEWED') {
      return res.status(400).json({ error: 'Cannot edit flag after it has been dismissed' });
    }

    const updatedFlag = await prisma.flag.update({
      where: { id: req.params.flagId },
      data: { reason }
    });

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    io.emit('flag:updated', {
      eventId: req.params.eventId,
      flagId: updatedFlag.id,
      projectId: updatedFlag.projectId,
      status: updatedFlag.status
    });

    res.json(updatedFlag);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/events/:eventId/flags/:flagId — Update flag
router.put('/:eventId/flags/:flagId', authenticate, requireActiveEvent, requireRole('ADMIN'), async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    const flag = await prisma.flag.update({
      where: { id: req.params.flagId },
      data: { status, adminNotes }
    });

    // If dismissed, remove FLAGGED status from project (only if no other OPEN/REVIEWED flags remain)
    if (status === 'DISMISSED' && flag.projectId) {
      const otherActiveFlags = await prisma.flag.count({
        where: {
          projectId: flag.projectId,
          id: { not: flag.id },
          status: { in: ['OPEN', 'REVIEWED'] }
        }
      });

      // Only remove FLAGGED status if no other active flags AND project is currently FLAGGED
      if (otherActiveFlags === 0) {
        const project = await prisma.project.findUnique({
          where: { id: flag.projectId },
          select: { status: true }
        });

        if (project?.status === 'FLAGGED') {
          // Determine appropriate status based on judging progress (only real assignment sets)
          const completedSets = await prisma.judgeSetProject.count({
            where: {
              projectId: flag.projectId,
              set: { setNumber: { gte: 0 }, status: 'COMPLETED' }
            }
          });

          const assignedSets = await prisma.judgeSetProject.count({
            where: {
              projectId: flag.projectId,
              set: { setNumber: { gte: 0 }, status: { in: ['IN_PROGRESS', 'COMPLETED'] } }
            }
          });

          let newStatus = 'SUBMITTED';
          if (completedSets >= 3) {
            newStatus = 'JUDGING_COMPLETE';
          } else if (assignedSets >= 1) {
            newStatus = 'IN_JUDGING';
          }

          await prisma.project.update({
            where: { id: flag.projectId },
            data: { status: newStatus as any }
          });
        }
      }
    }

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    io.emit('flag:updated', {
      eventId: req.params.eventId,
      flagId: flag.id,
      projectId: flag.projectId,
      status
    });

    res.json(flag);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:eventId/projects/:projectId/flags — Get all flags for a project
router.get('/:eventId/projects/:projectId/flags', authenticate, requireActiveEvent, async (req, res) => {
  try {
    const flags = await prisma.flag.findMany({
      where: {
        eventId: req.params.eventId,
        projectId: req.params.projectId
      },
      include: {
        creator: { select: { name: true, role: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(flags);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/events/:eventId/flags/:flagId — Delete flag (judge can delete own, admin can delete any)
router.delete('/:eventId/flags/:flagId', authenticate, requireActiveEvent, async (req, res) => {
  try {
    const flag = await prisma.flag.findUnique({
      where: { id: req.params.flagId }
    });

    if (!flag) {
      return res.status(404).json({ error: 'Flag not found' });
    }

    // Check permissions: judge can only delete their own flag, admin can delete any
    if (req.user!.role !== 'ADMIN' && flag.flaggedBy !== req.user!.userId) {
      return res.status(403).json({ error: 'You can only delete your own flags' });
    }

    await prisma.flag.delete({
      where: { id: req.params.flagId }
    });

    // Check if any OPEN or REVIEWED flags remain for this project
    const remainingActiveFlags = await prisma.flag.count({
      where: {
        projectId: flag.projectId,
        status: { in: ['OPEN', 'REVIEWED'] }
      }
    });

    // If no active flags remain, restore project status based on judging progress
    if (remainingActiveFlags === 0) {
      const project = await prisma.project.findUnique({
        where: { id: flag.projectId },
        select: { status: true }
      });

      if (project?.status === 'FLAGGED') {
        // Determine appropriate status based on judging progress (only real assignment sets)
        const completedSets = await prisma.judgeSetProject.count({
          where: {
            projectId: flag.projectId,
            set: { setNumber: { gte: 0 }, status: 'COMPLETED' }
          }
        });

        const assignedSets = await prisma.judgeSetProject.count({
          where: {
            projectId: flag.projectId,
            set: { setNumber: { gte: 0 }, status: { in: ['IN_PROGRESS', 'COMPLETED'] } }
          }
        });

        let newStatus = 'SUBMITTED';
        if (completedSets >= 3) {
          newStatus = 'JUDGING_COMPLETE';
        } else if (assignedSets >= 1) {
          newStatus = 'IN_JUDGING';
        }

        await prisma.project.update({
          where: { id: flag.projectId },
          data: { status: newStatus as any }
        });
      }
    }

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    io.emit('flag:deleted', {
      eventId: req.params.eventId,
      flagId: flag.id,
      projectId: flag.projectId
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/integrity-check — Run automated checks
router.post('/:eventId/integrity-check', authenticate, requireActiveEvent, requireRole('ADMIN'), async (req, res) => {
  try {
    const integrityFlags = await runIntegrityChecks(req.params.eventId);

    // Auto-create or update Flag entries for each detected issue (upsert to avoid duplicates)
    for (const f of integrityFlags) {
      if (f.projectId) {
        await prisma.flag.upsert({
          where: {
            projectId_flaggedBy: {
              projectId: f.projectId,
              flaggedBy: req.user!.userId
            }
          },
          update: {
            reason: `[AUTO] ${f.type}: ${f.details}`,
            status: 'OPEN'
          },
          create: {
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
