import { Router } from 'express';
import { prisma } from '../index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { generateLeaderboard, getTrackWinners, findTiedProjects, leaderboardToCsv } from '../engine/scoring.js';

const router = Router();

// GET /api/events/:eventId/results — Leaderboard
router.get('/:eventId/results', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const leaderboard = await generateLeaderboard(req.params.eventId);
    res.json(leaderboard);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:eventId/results/tracks — Track winners
router.get('/:eventId/results/tracks', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const trackWinners = await getTrackWinners(req.params.eventId);
    res.json(trackWinners);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:eventId/results/export — CSV export
router.get('/:eventId/results/export', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const leaderboard = await generateLeaderboard(req.params.eventId);
    const csv = leaderboardToCsv(leaderboard);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leaderboard.csv"');
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/results/rejudge — Trigger rejudge for tied teams
router.post('/:eventId/results/rejudge', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const tiedGroups = await findTiedProjects(req.params.eventId);

    if (tiedGroups.length === 0) {
      return res.json({ message: 'No ties found', rejudgeAssignments: [] });
    }

    // Find judges who haven't evaluated any of the tied projects
    // For load balancing: Get the number of completed sets for each judge
    const judgeStats = await prisma.judgeSet.groupBy({
      by: ['judgeId'],
      where: { status: 'COMPLETED', judgeId: { not: null } },
      _count: { _all: true }
    });
    const completedCounts: Record<string, number> = {};
    judgeStats.forEach(stat => {
      if (stat.judgeId) completedCounts[stat.judgeId] = stat._count._all;
    });

    const allJudges = await prisma.user.findMany({ where: { role: 'JUDGE' } });
    const assignments = [];
    for (const group of tiedGroups) {
      // Find judges who haven't scored any of these projects
      const projectScores = await prisma.score.findMany({
        where: { projectId: { in: group } },
        select: { judgeId: true }
      });
      const usedJudgeIds = new Set(projectScores.map(s => s.judgeId));

      let eligibleJudges = allJudges.filter(j => !usedJudgeIds.has(j.id));
      if (eligibleJudges.length === 0) {
        // Tier 2 Fallback: If no impartial judges, pick from everyone
        eligibleJudges = allJudges;
      }

      if (eligibleJudges.length === 0) continue;

      // Sort by completed sets count (least first)
      eligibleJudges.sort((a: any, b: any) => (completedCounts[a.id] || 0) - (completedCounts[b.id] || 0));
      const availableJudge = eligibleJudges[0];

      const judgeSet = await prisma.judgeSet.create({
        data: {
          eventId: req.params.eventId,
          judgeId: availableJudge.id,
          setNumber: 0, // Flag for tie-breaker
          column: 0,
          status: 'IN_PROGRESS'
        }
      });

      await prisma.judgeSetProject.createMany({
        data: group.map((projectId, idx) => ({
          setId: judgeSet.id,
          projectId,
          sortOrder: idx + 1
        }))
      });

      const rejudge = await prisma.rejudgeAssignment.create({
        data: {
          eventId: req.params.eventId,
          judgeId: availableJudge.id,
          tiedProjectIds: group.join(',')
        }
      });

      // Update local counts for rotation
      completedCounts[availableJudge.id] = (completedCounts[availableJudge.id] || 0) + 1;

      assignments.push({ ...rejudge, judgeSetId: judgeSet.id });
    }

    res.json({ tiedGroups: tiedGroups.length, rejudgeAssignments: assignments });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:eventId/projects/:projectId/details — Detailed evaluations for a project
router.get('/:eventId/projects/:projectId/details', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { eventId, projectId } = req.params;

    const evaluations = await prisma.judgeSetProject.findMany({
      where: { projectId },
      include: {
        set: {
          include: {
            judge: { select: { id: true, name: true } },
            scores: { where: { projectId } },
            feedback: { where: { projectId } },
            nominations: { where: { projectId }, include: { track: true } },
            stackRankVotes: { where: { projectId } },
            projects: { include: { project: true } }
          }
        },
        project: { select: { id: true, title: true, roomNumber: true, leaderName: true, team: { select: { name: true } } } }
      }
    });

    res.json(evaluations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
