import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { parse } from 'csv-parse/sync';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requireActiveEvent } from '../middleware/activeEventCheck.js';

const router = Router();

// GET /api/events/:eventId/projects
router.get('/:eventId/projects', authenticate, requireActiveEvent, async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: { eventId: req.params.eventId },
      include: { 
        team: { 
          select: { 
            id: true, 
            name: true, 
            phone: true
          } 
        } 
      },
      orderBy: { roomNumber: 'asc' }
    });
    res.json(projects);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:eventId/projects/:projectId — Single project with full evaluation, team, and score breakdown
router.get('/:eventId/projects/:projectId', authenticate, requireActiveEvent, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.projectId, eventId: req.params.eventId },
      include: {
        team: {
          select: { id: true, name: true, phone: true, email: true }
        },
        scores: {
          include: {
            judge: { select: { id: true, name: true } },
            set: { select: { id: true, column: true, setNumber: true, status: true } }
          }
        },
        feedbacks: {
          include: {
            judge: { select: { id: true, name: true } }
          }
        },
        judgeSetProjects: {
          include: {
            set: {
              include: {
                judge: { select: { id: true, name: true } },
                stackRankVotes: { where: { projectId: req.params.projectId } },
                nominations: { where: { projectId: req.params.projectId }, include: { track: true } }
              }
            }
          }
        },
        flags: {
          select: { id: true, reason: true, status: true, adminNotes: true }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/projects
router.post('/:eventId/projects', authenticate, requireActiveEvent, requireRole('ADMIN', 'TEAM'), async (req, res) => {
  try {
    const { title, description, demoLink, videoUrl, teamName, teamNumber, roomNumber, leaderName, phone, email, password } = req.body;

    if (req.user!.role === 'ADMIN' && teamNumber) {
      const existingProject = await prisma.project.findFirst({
        where: { eventId: req.params.eventId, teamNumber },
        include: { team: true }
      });

      if (existingProject) {
        const updatedProject = await prisma.project.update({
          where: { id: existingProject.id },
          data: {
            ...(title !== undefined && { title }),
            ...(description !== undefined && { description }),
            ...(demoLink !== undefined && { demoLink }),
            ...(videoUrl !== undefined && { videoUrl }),
            ...(roomNumber !== undefined && { roomNumber }),
            ...(teamNumber !== undefined && { teamNumber }),
            ...(leaderName !== undefined && { leaderName }),
            team: {
              update: {
                ...(teamName !== undefined && { name: teamName }),
                ...(phone !== undefined && { phone })
              }
            }
          },
          include: { team: true }
        });

        return res.json(updatedProject);
      }
    }
    
    // If teamName/email provided, create/link user first (Manual Add from Admin)
    let teamId = req.user!.role === 'ADMIN' ? null : req.user!.userId;

    if (req.user!.role === 'ADMIN' && email) {
      const passwordHash = await bcrypt.hash(password || crypto.randomBytes(4).toString('hex'), 10);
      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            name: teamName || 'New Team',
            email,
            passwordHash,
            role: 'TEAM',
            phone
          }
        });
      } else {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            name: teamName || user.name,
            phone: phone || user.phone
          }
        });
      }
      teamId = user.id;
    }

    if (!teamId) return res.status(400).json({ error: 'Team ID or user details required' });

    const project = await prisma.project.create({
      data: {
        eventId: req.params.eventId,
        teamId,
        title: title || `${teamName}'s Project`,
        description,
        demoLink,
        videoUrl,
        roomNumber,
        teamNumber: teamNumber,
        leaderName
      }
    });
    res.status(201).json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/events/:eventId/projects/:projectId
router.delete('/:eventId/projects/:projectId', authenticate, requireActiveEvent, requireRole('ADMIN'), async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Delete project will cascade to scores, feedback etc in real DB but prisma needs manual delete or schema cascade
    await prisma.project.delete({ where: { id: req.params.projectId } });
    
    // Optional: Delete team user if they have no other projects
    const otherProjects = await prisma.project.findMany({ where: { teamId: project.teamId } });
    if (otherProjects.length === 0) {
      await prisma.user.delete({ where: { id: project.teamId } });
    }

    res.json({ message: 'Project deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/events/:eventId/projects/:projectId
router.put('/:eventId/projects/:projectId', authenticate, async (req, res) => {
  try {
    const { title, description, demoLink, videoUrl, roomNumber, teamNumber, status, teamName, leaderName, phone } = req.body;
    
    const project = await prisma.project.update({
      where: { id: req.params.projectId },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(demoLink !== undefined && { demoLink }),
        ...(videoUrl !== undefined && { videoUrl }),
        roomNumber,
        ...(teamNumber !== undefined && { teamNumber }),
        ...(leaderName !== undefined && { leaderName }),
        ...(status !== undefined && { status }),
        // Update team user info via nested update
        team: {
          update: {
            ...(teamName !== undefined && { name: teamName }),
            ...(phone !== undefined && { phone })
          }
        }
      },
      include: { team: true }
    });
    res.json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/projects/import — Bulk CSV import teams
router.post('/:eventId/projects/import', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { csvData } = req.body;
    if (!csvData) return res.status(400).json({ error: 'csvData is required' });

    const records = parse(csvData, { columns: true, skip_empty_lines: true, trim: true });
    const credentials: Array<{ teamName: string; teamNumber: string; leaderName: string; phone: string; email: string; password: string }> = [];

    for (const row of records) {
      const teamName = row.team_name || row.teamName;
      const teamNumber = row.team_number || row.teamNumber;
      const roomNumber = row.room_number || row.roomNumber;
      const teamLeader = row.team_leader || row.teamLeader;
      const teamPhone = row.team_phone || row.teamPhone;

      if (!teamName || !teamNumber || !teamLeader || !teamPhone) continue;

      const existingProject = await prisma.project.findFirst({
        where: { eventId: req.params.eventId, teamNumber }
      });

      if (existingProject) {
        await prisma.project.update({
          where: { id: existingProject.id },
          data: {
            title: `${teamName}'s Project`,
            roomNumber: roomNumber || teamNumber,
            teamNumber,
            leaderName: teamLeader,
            team: {
              update: {
                name: teamName,
                phone: teamPhone
              }
            }
          }
        });
        continue;
      }

      // ponytail: Scope team email by event ID to prevent cross-event collisions and account hijacking
      const cleanEventId = req.params.eventId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
      const email = `team-${cleanEventId}-${teamNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}@event.local`;

      // Create or update user
      let user = await prisma.user.findUnique({ where: { email } });
      let password = '';
      if (!user) {
        password = crypto.randomBytes(4).toString('hex'); // 8-char random
        const passwordHash = await bcrypt.hash(password, 10);
        user = await prisma.user.create({
          data: {
            name: teamName,
            email,
            passwordHash,
            role: 'TEAM',
            phone: teamPhone
          }
        });
      } else {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            name: teamName,
            phone: teamPhone || user.phone
          }
        });
      }

      await prisma.project.create({
        data: {
          eventId: req.params.eventId,
          teamId: user.id,
          title: `${teamName}'s Project`,
          roomNumber: roomNumber || teamNumber,
          teamNumber,
          leaderName: teamLeader
        }
      });

      if (password) {
        credentials.push({ teamName, teamNumber, leaderName: teamLeader, phone: teamPhone, email, password });
      }
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
