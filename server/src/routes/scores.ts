import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requireActiveEvent } from '../middleware/activeEventCheck.js';
import { generateLeaderboard } from '../engine/scoring.js';

const router = Router();

// Helper: determine the acting judge ID — admin can act on behalf of the set's judge
async function getActingJudgeId(req: any, setId: string): Promise<string> {
  if (req.user!.role === 'ADMIN') {
    const set = await prisma.judgeSet.findUnique({ where: { id: setId }, select: { judgeId: true } });
    return set?.judgeId || req.user!.userId;
  }
  return req.user!.userId;
}

// POST /api/events/:eventId/sets/:setId/scores — Submit score for a project in a set
router.post('/:eventId/sets/:setId/scores', authenticate, requireActiveEvent, requireRole('JUDGE', 'ADMIN'), async (req, res) => {
  try {
    const { projectId, completion, originality, learning, design, technology, timeSpentSeconds } = req.body;

    // Validate all 5 scores are present and 0-10
    const scores = { completion, originality, learning, design, technology };
    for (const [key, val] of Object.entries(scores)) {
      if (val === undefined || val === null || val < 0 || val > 10) {
        return res.status(400).json({ error: `${key} must be between 0 and 10` });
      }
    }

    const total = completion + originality + learning + design + technology;
    const judgeId = await getActingJudgeId(req, req.params.setId);
    const timeSeconds = typeof timeSpentSeconds === 'number' && timeSpentSeconds > 0 ? timeSpentSeconds : 0;

    const score = await prisma.score.upsert({
      where: {
        setId_projectId_judgeId: {
          setId: req.params.setId,
          projectId,
          judgeId
        }
      },
      create: {
        setId: req.params.setId,
        projectId,
        judgeId,
        completion, originality, learning, design, technology, total,
        timeSpentSeconds: timeSeconds
      },
      update: { completion, originality, learning, design, technology, total, timeSpentSeconds: timeSeconds }
    });

    const io = req.app.get('io');
    io.emit('score:submitted', {
      judgeId,
      projectId,
      setId: req.params.setId
    });

    res.json(score);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/sets/:setId/feedback
router.post('/:eventId/sets/:setId/feedback', authenticate, requireRole('JUDGE', 'ADMIN'), async (req, res) => {
  try {
    const { projectId, comment } = req.body;
    if (!comment) return res.status(400).json({ error: 'Comment is required' });
    const judgeId = await getActingJudgeId(req, req.params.setId);

    const feedback = await prisma.feedback.create({
      data: {
        setId: req.params.setId,
        projectId,
        judgeId,
        comment
      }
    });
    res.status(201).json(feedback);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/sets/:setId/nominate — Track nominations
router.post('/:eventId/sets/:setId/nominate', authenticate, requireRole('JUDGE', 'ADMIN'), async (req, res) => {
  try {
    const { projectId, trackIds } = req.body; // trackIds: string[]
    if (!projectId || !Array.isArray(trackIds)) {
      return res.status(400).json({ error: 'projectId and trackIds[] are required' });
    }
    const judgeId = await getActingJudgeId(req, req.params.setId);

    // Delete existing nominations for this project in this set by this judge
    await prisma.trackNomination.deleteMany({
      where: {
        setId: req.params.setId,
        projectId,
        judgeId
      }
    });

    // Create new nominations
    if (trackIds.length > 0) {
      await prisma.trackNomination.createMany({
        data: trackIds.map((trackId: string) => ({
          setId: req.params.setId,
          projectId,
          judgeId,
          trackId
        }))
      });
    }

    res.json({ message: 'Nominations saved', trackIds });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/sets/:setId/rank — Submit stack rank (1st/2nd/3rd)
router.post('/:eventId/sets/:setId/rank', authenticate, requireRole('JUDGE', 'ADMIN'), async (req, res) => {
  try {
    const { rankings } = req.body;
    // rankings: [{ projectId, rank: 1|2|3|... }]
    
    // Fetch set to check project count
    const set = await prisma.judgeSet.findUnique({
      where: { id: req.params.setId },
      include: { projects: true }
    });
    if (!set) return res.status(404).json({ error: 'Set not found' });

    const numProjects = set.projects.length;
    const requiredRanks = Math.min(3, numProjects);

    if (!Array.isArray(rankings) || rankings.length < requiredRanks) {
      return res.status(400).json({ error: `At least ${requiredRanks} rankings required` });
    }
    const judgeId = await getActingJudgeId(req, req.params.setId);

    const pointsMap: Record<number, number> = { 1: 3, 2: 2, 3: 1 };

    // Delete existing votes for this set by this judge
    await prisma.stackRankVote.deleteMany({
      where: {
        setId: req.params.setId,
        judgeId
      }
    });

    // Create new votes
    await prisma.stackRankVote.createMany({
      data: rankings.map((r: { projectId: string; rank: number }) => ({
        setId: req.params.setId,
        judgeId,
        projectId: r.projectId,
        rank: r.rank,
        points: pointsMap[r.rank] || 0
      }))
    });

    res.json({ message: 'Rankings saved' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/sets/:setId/reopen — Reopen a completed set for editing
router.post('/:eventId/sets/:setId/reopen', authenticate, requireRole('JUDGE', 'ADMIN'), async (req, res) => {
  try {
    const setId = req.params.setId;
    const set = await prisma.judgeSet.findUnique({ where: { id: setId } });
    if (!set) return res.status(404).json({ error: 'Set not found' });
    if (set.status !== 'COMPLETED') return res.status(400).json({ error: 'Set is not completed' });

    // Judge-specific guard: cannot reopen unless they have an approved edit request OR they don't have an active set (if we allowed that before)
    // Actually, the new rule is: Judges can ONLY reopen if they have an APPROVED EditRequest.
    if (req.user!.role === 'JUDGE') {
      if (set.judgeId !== req.user!.userId) return res.status(403).json({ error: 'Not your set' });

      // Check for approved edit request
      const editRequest = await prisma.editRequest.findFirst({
        where: { setId, judgeId: req.user!.userId, status: 'APPROVED' }
      });

      if (!editRequest) {
        return res.status(403).json({ error: 'Editing locked. Please request access from an administrator.' });
      }


      // Check if judge has an active IN_PROGRESS set (only real assignment sets)
      const activeSet = await prisma.judgeSet.findFirst({
        where: { judgeId: req.user!.userId, setNumber: { gte: 0 }, status: 'IN_PROGRESS' }
      });
      if (activeSet) {
        return res.status(400).json({ error: 'Cannot edit: you have an active set in progress. Complete it first.' });
      }

      // Mark request as USED once they reopen
      await prisma.editRequest.update({
        where: { id: editRequest.id },
        data: { status: 'USED' }
      });
    }

    // Reopen the set
    await prisma.judgeSet.update({
      where: { id: setId },
      data: { status: 'IN_PROGRESS' }
    });

    const io = req.app.get('io');
    io.emit('set:reopened', { setId, eventId: req.params.eventId });

    res.json({ message: 'Set reopened for editing' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/sets/:setId/complete — Mark set complete
router.post('/:eventId/sets/:setId/complete', authenticate, requireRole('JUDGE', 'ADMIN'), async (req, res) => {
  try {
    const setId = req.params.setId;
    const isAdmin = req.user!.role === 'ADMIN';

    // Validate: all projects must have scores
    const set = await prisma.judgeSet.findUnique({
      where: { id: setId },
      include: { projects: true }
    });

    if (!set) return res.status(404).json({ error: 'Set not found' });
    if (!isAdmin && set.judgeId !== req.user!.userId) return res.status(403).json({ error: 'Not your set' });

    const judgeId = set.judgeId || req.user!.userId;
    const projectIds = set.projects.map(p => p.projectId);
    const scores = await prisma.score.findMany({
      where: { setId, judgeId, projectId: { in: projectIds } }
    });

    if (scores.length < projectIds.length) {
      return res.status(400).json({
        error: `Score all ${projectIds.length} projects before completing (only ${scores.length} scored)`
      });
    }

    // Validate: must have stack rank votes (up to 3, or all projects if fewer)
    const votes = await prisma.stackRankVote.findMany({
      where: { setId, judgeId }
    });

    const requiredRanks = Math.min(3, projectIds.length);
    if (votes.length < requiredRanks) {
      return res.status(400).json({ error: `Must rank top ${requiredRanks} projects before completing set` });
    }

    // Mark complete
    await prisma.judgeSet.update({
      where: { id: setId },
      data: { status: 'COMPLETED' }
    });

    // Update project statuses: may transition IN_JUDGING → JUDGING_COMPLETE
    const { updateProjectJudgingStatus } = await import('../engine/assignment.js');
    for (const sp of set.projects) {
      await updateProjectJudgingStatus(sp.projectId);
    }

    const io = req.app.get('io');
    io.emit('set:completed', { judgeId, setId, eventId: req.params.eventId });

    const { getAssignmentProgress, assignNextSetToJudge } = await import('../engine/assignment.js');
    
    // Auto-assign next set to this judge if they are a JUDGE role
    if (req.user!.role === 'JUDGE') {
      const newSetId = await assignNextSetToJudge(req.params.eventId, judgeId);
      if (newSetId) {
        console.log(`[AutoAssign] Judge ${judgeId} received new set ${newSetId}`);
        io.emit('assignment:new', { judgeId, setId: newSetId });
      } else {
        console.log(`[AutoAssign] No eligible unassigned sets for judge ${judgeId}`);
      }
    }

    const progress = await getAssignmentProgress(req.params.eventId);
    io.emit('judging:progress', { eventId: req.params.eventId, ...progress });

    // ─── TIE BREAKER TRIGGER ────────────────────────────────────────────────
    // Check if we need to start the tie-breaking phase (Set #0)
    try {
      const { checkAndTriggerTieBreaker } = await import('../engine/tiebreaker.js');
      await checkAndTriggerTieBreaker(req.params.eventId);
    } catch (err) {
      console.error('[TieBreakerError]', err);
    }
    // ────────────────────────────────────────────────────────────────────────

    // Mark any associated EditRequests as USED if they were APPROVED or PENDING
    await prisma.editRequest.updateMany({
      where: { setId, status: { in: ['APPROVED', 'PENDING'] } },
      data: { status: 'USED' }
    });

    res.json({ message: 'Set completed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:eventId/sets/:setId — Get set details
router.get('/:eventId/sets/:setId', authenticate, async (req, res) => {
  try {
    const set = await prisma.judgeSet.findUnique({
      where: { id: req.params.setId },
      include: {
        judge: { select: { id: true, name: true } },
        projects: {
          include: {
            project: {
              include: { team: { select: { id: true, name: true, phone: true } } }
            }
          },
          orderBy: { sortOrder: 'asc' }
        },
        scores: true,
        stackRankVotes: true,
        nominations: { include: { track: true } }
      }
    });
    if (!set) return res.status(404).json({ error: 'Set not found' });

    // Enrich Set #0 with base rank for UI display
    let baseRank = null;
    if (set.setNumber === 0) {
      const projectsCount = set.projects.length;
      if (projectsCount > 0) {
        const leaderboard = await generateLeaderboard(req.params.eventId);
        const p0Id = set.projects[0].projectId;
        const entry = leaderboard.find(e => e.projectId === p0Id);
        baseRank = entry?.rank || 1;
      }
    }

    res.json({ ...set, baseRank });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
