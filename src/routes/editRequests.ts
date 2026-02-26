import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// POST /api/edit-requests/request — Judge requests to edit a completed set
router.post('/request', authenticate, requireRole('JUDGE'), async (req, res) => {
  try {
    const { setId, reason } = req.body;
    const judgeId = req.user!.userId;

    if (!setId || !reason) {
      return res.status(400).json({ error: 'Set ID and reason are required' });
    }

    const set = await prisma.judgeSet.findUnique({ where: { id: setId } });
    if (!set) return res.status(404).json({ error: 'Set not found' });
    if (set.judgeId !== judgeId) return res.status(403).json({ error: 'Not your set' });
    if (set.status !== 'COMPLETED') return res.status(400).json({ error: 'Only completed sets can be requested for edit' });

    // Check if there's already a pending or approved request for this set
    const existing = await prisma.editRequest.findFirst({
      where: { setId, judgeId, status: { in: ['PENDING', 'APPROVED'] } }
    });
    if (existing) {
      return res.status(400).json({ error: 'A request for this set is already pending or approved' });
    }

    const request = await prisma.editRequest.create({
      data: { setId, judgeId, reason, status: 'PENDING' },
      include: { set: true, judge: { select: { name: true } } }
    });

    const io = req.app.get('io');
    io.emit('edit-request:new', request);

    res.json(request);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/edit-requests/admin — Admin lists all requests
router.get('/admin', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const requests = await prisma.editRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        judge: { select: { id: true, name: true, email: true } },
        set: {
          include: {
            event: { select: { name: true } },
            projects: { include: { project: { select: { title: true, teamNumber: true } } } }
          }
        }
      }
    });
    res.json(requests);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/edit-requests/:id/approve — Admin approves a request
router.post('/:id/approve', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const request = await prisma.editRequest.findUnique({
      where: { id: req.params.id },
      include: { judge: true }
    });
    if (!request) return res.status(404).json({ error: 'Request not found' });

    await prisma.editRequest.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED' }
    });

    const io = req.app.get('io');
    io.emit('edit-request:statusChanged', { requestId: request.id, status: 'APPROVED', judgeId: request.judgeId });

    res.json({ message: 'Request approved' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/edit-requests/:id/deny — Admin denies a request
router.post('/:id/deny', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const request = await prisma.editRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ error: 'Request not found' });

    await prisma.editRequest.update({
      where: { id: req.params.id },
      data: { status: 'DENIED' }
    });

    const io = req.app.get('io');
    io.emit('edit-request:statusChanged', { requestId: request.id, status: 'DENIED', judgeId: request.judgeId });

    res.json({ message: 'Request denied' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
