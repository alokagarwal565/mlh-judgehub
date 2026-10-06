import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { authenticate, signToken } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    // ponytail: Public registration is strictly limited to TEAM role. ADMIN/JUDGE must be provisioned by admin.
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: 'TEAM' }
    });
    const token = signToken({ userId: user.id, email: user.email, role: user.role, name: user.name });
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Fetch active event
    const activeEvent = await prisma.event.findFirst({
      where: { isActive: true },
      select: { id: true, name: true }
    });

    // If no active event, reject all non-admin logins
    if (!activeEvent) {
      if (user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'No event is currently active. Please contact an administrator.' });
      }
      // Admin can login even with no active event
      const token = signToken({ userId: user.id, email: user.email, role: user.role, name: user.name });
      return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role }, activeEventId: null });
    }

    // For non-admin users, check if they're assigned to the active event
    if (user.role !== 'ADMIN') {
      if (user.role === 'JUDGE') {
        // Check if judge has any JudgeSet in the active event
        const hasAssignment = await prisma.judgeSet.count({
          where: { judgeId: user.id, eventId: activeEvent.id }
        });
        if (hasAssignment === 0) {
          return res.status(403).json({ error: `Your assigned event is not currently active.` });
        }
      } else if (user.role === 'TEAM') {
        // Check if team has any Project in the active event
        const hasProject = await prisma.project.count({
          where: { teamId: user.id, eventId: activeEvent.id }
        });
        if (hasProject === 0) {
          return res.status(403).json({ error: `You don't have a project in the currently active event.` });
        }
      }
    }

    const token = signToken({ userId: user.id, email: user.email, role: user.role, name: user.name, activeEventId: activeEvent.id });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role }, activeEventId: activeEvent.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, name: true, email: true, role: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/change-password
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both fields are required' });
    if (newPassword.length < 4) return res.status(400).json({ error: 'New password must be at least 4 characters' });
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


export default router;
