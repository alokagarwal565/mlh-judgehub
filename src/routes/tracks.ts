import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/events/:eventId/tracks
router.get('/:eventId/tracks', authenticate, async (req, res) => {
  try {
    const tracks = await prisma.track.findMany({
      where: { eventId: req.params.eventId },
      include: { _count: { select: { nominations: true } } }
    });
    res.json(tracks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/tracks
router.post('/:eventId/tracks', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, description, color } = req.body;
    const track = await prisma.track.create({
      data: { eventId: req.params.eventId, name, description, color }
    });
    res.status(201).json(track);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/events/:eventId/tracks/:trackId
router.put('/:eventId/tracks/:trackId', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, description, color } = req.body;
    const track = await prisma.track.update({
      where: { id: req.params.trackId },
      data: { name, description, color }
    });
    res.json(track);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/events/:eventId/tracks/:trackId
router.delete('/:eventId/tracks/:trackId', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    await prisma.track.delete({ where: { id: req.params.trackId } });
    res.json({ message: 'Track deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
