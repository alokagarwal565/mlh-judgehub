import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requireActiveEvent } from '../middleware/activeEventCheck.js';
import { generateLeaderboard, getTrackWinners, findTiedProjects, leaderboardToCsv, escapeCsvField } from '../engine/scoring.js';

const router = Router();

// GET /api/events/:eventId/results — Leaderboard
router.get('/:eventId/results', authenticate, requireActiveEvent, requireRole('ADMIN'), async (req, res) => {
  try {
    const leaderboard = await generateLeaderboard(req.params.eventId);
    res.json(leaderboard);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:eventId/results/tracks — Track winners
router.get('/:eventId/results/tracks', authenticate, requireActiveEvent, requireRole('ADMIN'), async (req, res) => {
  try {
    const trackWinners = await getTrackWinners(req.params.eventId);
    res.json(trackWinners);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:eventId/results/export — CSV export
router.get('/:eventId/results/export', authenticate, requireActiveEvent, requireRole('ADMIN'), async (req, res) => {
  try {
    const excludeTrackWinners = req.query.excludeTrackWinners === 'true';
    const excludeFlagged = req.query.excludeFlagged === 'true';
    
    const leaderboard = await generateLeaderboard(req.params.eventId, {
      excludeTrackWinners,
      excludeFlagged
    });
    const csv = leaderboardToCsv(leaderboard);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leaderboard.csv"');
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/results/rejudge — Trigger rejudge for tied teams
router.post('/:eventId/results/rejudge', authenticate, requireActiveEvent, requireRole('ADMIN'), async (req, res) => {
  try {
    const tiedGroups = await findTiedProjects(req.params.eventId);

    if (tiedGroups.length === 0) {
      return res.json({ message: 'No ties found', rejudgeAssignments: [] });
    }

    // Find judges who haven't evaluated any of the tied projects
    // For load balancing: Get the number of completed sets for each judge
    const judgeStats = await prisma.judgeSet.groupBy({
      by: ['judgeId'],
      where: { eventId: req.params.eventId, status: 'COMPLETED', judgeId: { not: null } },
      _count: { _all: true }
    });
    const completedCounts: Record<string, number> = {};
    judgeStats.forEach(stat => {
      if (stat.judgeId) completedCounts[stat.judgeId] = stat._count._all;
    });

    const allJudges = await prisma.user.findMany({ 
      where: { 
        role: 'JUDGE',
        judgeSets: { some: { eventId: req.params.eventId } }
      }
    });
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
router.get('/:eventId/projects/:projectId/details', authenticate, requireActiveEvent, requireRole('ADMIN'), async (req, res) => {
  try {
    const { eventId, projectId } = req.params;

    // Only fetch evaluations from real assignment sets (setNumber >= 0), not placeholder sets
    const evaluations = await prisma.judgeSetProject.findMany({
      where: { 
        projectId,
        set: { eventId, setNumber: { gte: 0 } }
      },
      include: {
        set: {
          include: {
            judge: { select: { id: true, name: true } },
            scores: { where: { projectId } },
            feedbacks: { where: { projectId } },
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

// GET /api/events/:eventId/export/projects — Master Projects CSV Export
router.get('/:eventId/export/projects', authenticate, requireActiveEvent, requireRole('ADMIN'), async (req, res) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params.eventId } });
    const projects = await prisma.project.findMany({
      where: { eventId: req.params.eventId },
      include: {
        team: { select: { name: true, phone: true, email: true } }
      },
      orderBy: [{ roomNumber: 'asc' }, { teamNumber: 'asc' }]
    });

    const header = 'Team Name,Team Number,Project Title,Description,Room Number,Team Leader,Leader Phone,Leader Email,Demo Link,Video URL,Status,Created At';
    const rows = projects.map(p => [
      escapeCsvField(p.team?.name || ''),
      escapeCsvField(p.teamNumber || ''),
      escapeCsvField(p.title),
      escapeCsvField(p.description || ''),
      escapeCsvField(p.roomNumber || ''),
      escapeCsvField(p.leaderName || ''),
      escapeCsvField(p.team?.phone || ''),
      escapeCsvField(p.team?.email || ''),
      escapeCsvField(p.demoLink || ''),
      escapeCsvField(p.videoUrl || ''),
      escapeCsvField(p.status),
      escapeCsvField(new Date(p.createdAt).toISOString())
    ].join(','));

    const csv = '\uFEFF' + [header, ...rows].join('\n');
    const safeName = (event?.name || 'event').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="projects-master-${safeName}.csv"`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:eventId/export/judges — Master Judges CSV Export
router.get('/:eventId/export/judges', authenticate, requireActiveEvent, requireRole('ADMIN'), async (req, res) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params.eventId } });
    const judges = await prisma.user.findMany({
      where: { role: 'JUDGE' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        judgeSets: {
          where: { eventId: req.params.eventId },
          select: { id: true, status: true, setNumber: true, column: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    const header = 'Judge Name,Email,Phone,Role,Total Assigned Sets,Completed Sets,In Progress Sets,Created At';
    const rows = judges.map(j => {
      const totalSets = j.judgeSets.length;
      const completedSets = j.judgeSets.filter(s => s.status === 'COMPLETED').length;
      const inProgressSets = j.judgeSets.filter(s => s.status === 'IN_PROGRESS').length;
      return [
        escapeCsvField(j.name),
        escapeCsvField(j.email),
        escapeCsvField(j.phone || ''),
        escapeCsvField(j.role),
        totalSets,
        completedSets,
        inProgressSets,
        escapeCsvField(new Date(j.createdAt).toISOString())
      ].join(',');
    });

    const csv = '\uFEFF' + [header, ...rows].join('\n');
    const safeName = (event?.name || 'event').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="judges-master-${safeName}.csv"`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:eventId/export/scores — Granular Rubrics / Evaluations CSV Export
router.get('/:eventId/export/scores', authenticate, requireActiveEvent, requireRole('ADMIN'), async (req, res) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params.eventId } });
    const scores = await prisma.score.findMany({
      where: { set: { eventId: req.params.eventId } },
      include: {
        judge: { select: { name: true, email: true } },
        project: { select: { title: true, teamNumber: true, roomNumber: true, team: { select: { name: true } } } },
        set: { select: { setNumber: true, column: true, status: true } }
      },
      orderBy: [{ set: { column: 'asc' } }, { set: { setNumber: 'asc' } }, { createdAt: 'asc' }]
    });

    const votes = await prisma.stackRankVote.findMany({
      where: { set: { eventId: req.params.eventId } },
      select: { setId: true, projectId: true, judgeId: true, rank: true, points: true }
    });
    const voteMap = new Map();
    votes.forEach(v => {
      voteMap.set(`${v.setId}_${v.projectId}_${v.judgeId}`, v);
    });

    const feedbacks = await prisma.feedback.findMany({
      where: { set: { eventId: req.params.eventId } },
      select: { setId: true, projectId: true, judgeId: true, comment: true }
    });
    const feedbackMap = new Map();
    feedbacks.forEach(f => {
      feedbackMap.set(`${f.setId}_${f.projectId}_${f.judgeId}`, f.comment);
    });

    const header = 'Set Number,Wave / Round,Set Status,Judge Name,Judge Email,Team Name,Team Number,Project Title,Room Number,Completion (/10),Originality (/10),Learning (/10),Design (/10),Technology (/10),Total Rubric (/50),Stack Rank,Stack Points,Time Spent (s),Feedback Comment,Scored At';
    const rows = scores.map(s => {
      const key = `${s.setId}_${s.projectId}_${s.judgeId}`;
      const vote = voteMap.get(key);
      const comment = feedbackMap.get(key) || '';
      return [
        s.set.setNumber,
        s.set.column === 0 ? 'Tie Breaker' : `Round ${s.set.column}`,
        s.set.status,
        escapeCsvField(s.judge.name),
        escapeCsvField(s.judge.email),
        escapeCsvField(s.project.team.name),
        escapeCsvField(s.project.teamNumber || ''),
        escapeCsvField(s.project.title),
        escapeCsvField(s.project.roomNumber || ''),
        s.completion,
        s.originality,
        s.learning,
        s.design,
        s.technology,
        s.total,
        vote ? vote.rank : '',
        vote ? vote.points : 0,
        s.timeSpentSeconds || 0,
        escapeCsvField(comment),
        escapeCsvField(new Date(s.createdAt).toISOString())
      ].join(',');
    });

    const csv = '\uFEFF' + [header, ...rows].join('\n');
    const safeName = (event?.name || 'event').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="evaluations-master-${safeName}.csv"`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
