import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../index.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// GET all admins and judges
router.get('/users', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'JUDGE'] } },
      select: { id: true, name: true, email: true, phone: true, role: true, passwordPlain: true, createdAt: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }]
    });
    // Mask judge passwords for admins
    const sanitized = users.map(u => u.role === 'JUDGE' ? { ...u, passwordPlain: null } : u);
    res.json(sanitized);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST create user (admin or judge)
router.post('/users', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, email, phone, role, password } = req.body;
    if (!name || !email || !password || !role) return res.status(400).json({ error: 'name, email, password and role are required' });
    if (!['ADMIN', 'JUDGE'].includes(role)) return res.status(400).json({ error: 'role must be ADMIN or JUDGE' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, phone: phone || null, role, passwordHash, passwordPlain: password },
      select: { id: true, name: true, email: true, phone: true, role: true, passwordPlain: true, createdAt: true }
    });
    res.status(201).json(user);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email already in use' });
    res.status(500).json({ error: err.message });
  }
});

// PUT edit user details
router.put('/users/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { name, email, phone: phone || null },
      select: { id: true, name: true, email: true, phone: true, role: true, passwordPlain: true, createdAt: true }
    });
    res.json(user);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email already in use' });
    res.status(500).json({ error: err.message });
  }
});

// PUT change password
router.put('/users/:id/password', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

    const targetUser = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    if (targetUser.role === 'JUDGE') return res.status(403).json({ error: 'Admins cannot change judge passwords' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash, passwordPlain: password },
      select: { id: true, name: true, email: true, phone: true, role: true, passwordPlain: true, createdAt: true }
    });
    res.json(user);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST reset judge password to default
router.post('/users/:id/reset-password', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const targetUser = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    if (targetUser.role !== 'JUDGE') return res.status(400).json({ error: 'Reset to default only allowed for judges' });

    const defaultPassword = 'judge123';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash, passwordPlain: defaultPassword },
      select: { id: true, name: true, email: true, phone: true, role: true, passwordPlain: true, createdAt: true }
    });
    res.json(user);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE user
router.delete('/users/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // 1. Fetch user to determine role
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // 2. Cleanup all related records manually since schema doesn't cascade users
    await prisma.score.deleteMany({ where: { judgeId: id } });
    await prisma.feedback.deleteMany({ where: { judgeId: id } });
    await prisma.trackNomination.deleteMany({ where: { judgeId: id } });
    await prisma.stackRankVote.deleteMany({ where: { judgeId: id } });
    await prisma.editRequest.deleteMany({ where: { judgeId: id } });
    await prisma.rejudgeAssignment.deleteMany({ where: { judgeId: id } });
    await prisma.auditLog.deleteMany({ where: { userId: id } });
    await prisma.flag.deleteMany({ where: { flaggedBy: id } });
    
    // 3. Unassign from judge sets
    await prisma.judgeSet.updateMany({
      where: { judgeId: id },
      data: { judgeId: null, status: 'UNASSIGNED' }
    });

    // 4. Handle TEAM specific cleanup
    if (user.role === 'TEAM') {
      await prisma.project.deleteMany({ where: { teamId: id } });
    }

    // 5. Finally, delete the user
    await prisma.user.delete({ where: { id } });
    
    res.json({ ok: true });
  } catch (err: any) { 
    res.status(500).json({ error: err.message }); 
  }
});

export default router;
