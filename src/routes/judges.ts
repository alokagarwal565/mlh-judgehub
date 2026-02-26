import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { parse } from 'csv-parse/sync';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/events/:eventId/judges
router.get('/:eventId/judges', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const judges = await prisma.user.findMany({
      where: { role: 'JUDGE' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        judgeSets: {
          where: { eventId: req.params.eventId },
          select: {
            id: true,
            status: true,
            column: true,
            setNumber: true,
            scores: { select: { timeSpentSeconds: true } }
          }
        }
      }
    });

    const result = judges.map(j => {
      const completedSets = j.judgeSets.filter(s => s.status === 'COMPLETED').length;
      const inProgressSets = j.judgeSets.filter(s => s.status === 'IN_PROGRESS').length;
      const allScores = j.judgeSets.flatMap(s => s.scores);
      const totalTimeSeconds = allScores.reduce((sum, sc) => sum + (sc.timeSpentSeconds || 0), 0);
      const scoredCount = allScores.length;
      const avgTimePerProjectSeconds = scoredCount > 0 ? Math.round(totalTimeSeconds / scoredCount) : 0;

      return {
        ...j,
        totalSets: j.judgeSets.length,
        completedSets,
        inProgressSets,
        totalTimeSeconds,
        avgTimePerProjectSeconds
      };
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/judges — Manual individual add
router.post('/:eventId/judges', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !phone) return res.status(400).json({ error: 'Name, email, and phone are required' });

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const passwordHash = await bcrypt.hash(password || crypto.randomBytes(4).toString('hex'), 10);
      user = await prisma.user.create({
        data: { name, email, phone, passwordHash, role: 'JUDGE' }
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name, phone }
      });
    }
    res.status(201).json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/events/:eventId/judges/:id — Update judge
router.put('/:eventId/judges/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(phone && { phone })
      }
    });
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/events/:eventId/judges/:id — Delete judge
router.delete('/:eventId/judges/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    // Check if judge has any active sets for this event
    await prisma.judgeSet.deleteMany({
      where: { judgeId: req.params.id, eventId: req.params.eventId }
    });
    
    // We don't delete the User entirely because they might be in other events
    // Just remove them from being a judge for this event? 
    // Actually, in this simple schema, a User is a JUDGE or TEAM globally.
    // If we delete the user, we delete them from the platform.
    await prisma.user.delete({ where: { id: req.params.id } });
    
    res.json({ message: 'Judge deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/judges/import — Bulk CSV import judges
router.post('/:eventId/judges/import', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { csvData } = req.body;
    if (!csvData) return res.status(400).json({ error: 'csvData is required' });

    const records = parse(csvData, { columns: true, skip_empty_lines: true, trim: true });
    const credentials: Array<{ judgeName: string; email: string; phone: string; password: string }> = [];

    for (const row of records) {
      const judgeName = row.judge_name || row.judgeName;
      const judgeEmail = row.judge_email || row.judgeEmail;
      const judgePhone = row.judge_phone || row.judgePhone;

      if (!judgeName || !judgeEmail || !judgePhone) continue;

      const password = crypto.randomBytes(4).toString('hex');
      const passwordHash = await bcrypt.hash(password, 10);

      let user = await prisma.user.findUnique({ where: { email: judgeEmail } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            name: judgeName,
            email: judgeEmail,
            phone: judgePhone,
            passwordHash,
            role: 'JUDGE'
          }
        });
      } else {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            name: judgeName,
            phone: judgePhone
          }
        });
      }

      credentials.push({ judgeName, email: judgeEmail, phone: judgePhone, password });
    }

    res.status(201).json({
      imported: credentials.length,
      credentials
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
