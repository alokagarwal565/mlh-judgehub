import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requireActiveEvent } from '../middleware/activeEventCheck.js';
import { generateLeaderboard } from '../engine/scoring.js';

const router = Router();

// Helper: Authorize set access and get acting judge ID
async function authorizeSetAccess(req: Request, eventId: string, setId: string) {
  const set = await prisma.judgeSet.findUnique({
    where: { id: setId },
    include: { projects: true }
  });

  if (!set || set.eventId !== eventId) {
    return { error: 'Set not found in this event', status: 404, set: null, judgeId: null };
  }

  const user = req.user!;
  if (user.role === 'JUDGE' && set.judgeId !== user.userId) {
    return { error: 'Forbidden: You are not assigned to evaluate this set', status: 403, set: null, judgeId: null };
  }

  const judgeId = user.role === 'ADMIN' ? (set.judgeId || user.userId) : user.userId;
  return { error: null, status: 200, set, judgeId };
}

// POST /api/events/:eventId/sets/:setId/scores — Submit score for a project in a set
router.post('/:eventId/sets/:setId/scores', authenticate, requireActiveEvent, requireRole('JUDGE', 'ADMIN'), async (req, res) => {
  try {
    const { eventId, setId } = req.params;
    const { projectId, completion, originality, learning, design, technology, timeSpentSeconds } = req.body;

    const auth = await authorizeSetAccess(req, eventId, setId);
    if (auth.error || !auth.set) {
      return res.status(auth.status).json({ error: auth.error });
    }

    // Verify projectId belongs to this set
    const isProjectInSet = auth.set.projects.some(p => p.projectId === projectId);
    if (!isProjectInSet) {
      return res.status(400).json({ error: 'Project is not assigned to this set' });
    }

    // Validate all 5 scores are present and 0-10
    const scores = { completion, originality, learning, design, technology };
    for (const [key, val] of Object.entries(scores)) {
      if (val === undefined || val === null || val < 0 || val > 10) {
        return res.status(400).json({ error: `${key} must be between 0 and 10` });
      }
    }

    const total = completion + originality + learning + design + technology;
    const judgeId = auth.judgeId!;
    const timeSeconds = typeof timeSpentSeconds === 'number' && timeSpentSeconds > 0 ? timeSpentSeconds : 0;

    const score = await prisma.score.upsert({
      where: {
        setId_projectId_judgeId: {
          setId,
          projectId,
          judgeId
        }
      },
      create: {
        setId,
        projectId,
        judgeId,
        completion, originality, learning, design, technology, total,
        timeSpentSeconds: timeSeconds
      },
      update: { completion, originality, learning, design, technology, total, timeSpentSeconds: timeSeconds }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`event:${eventId}`).emit('score:submitted', {
        judgeId,
        projectId,
        setId
      });
    }

    res.json(score);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/sets/:setId/feedback
router.post('/:eventId/sets/:setId/feedback', authenticate, requireRole('JUDGE', 'ADMIN'), async (req, res) => {
  try {
    const { eventId, setId } = req.params;
    const { projectId, comment } = req.body;
    if (!comment) return res.status(400).json({ error: 'Comment is required' });

    const auth = await authorizeSetAccess(req, eventId, setId);
    if (auth.error || !auth.set) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const isProjectInSet = auth.set.projects.some(p => p.projectId === projectId);
    if (!isProjectInSet) {
      return res.status(400).json({ error: 'Project is not assigned to this set' });
    }

    // ponytail: Replace previous feedback from this judge for this set & project to prevent duplicate rows
    await prisma.feedback.deleteMany({
      where: {
        setId,
        projectId,
        judgeId: auth.judgeId!
      }
    });

    const feedback = await prisma.feedback.create({
      data: {
        setId,
        projectId,
        judgeId: auth.judgeId!,
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
    const { eventId, setId } = req.params;
    const { projectId, trackIds } = req.body;
    if (!projectId || !Array.isArray(trackIds)) {
      return res.status(400).json({ error: 'projectId and trackIds[] are required' });
    }

    const auth = await authorizeSetAccess(req, eventId, setId);
    if (auth.error || !auth.set) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const isProjectInSet = auth.set.projects.some(p => p.projectId === projectId);
    if (!isProjectInSet) {
      return res.status(400).json({ error: 'Project is not assigned to this set' });
    }

    const judgeId = auth.judgeId!;

    // ponytail: Atomic delete and create in a single transaction
    await prisma.$transaction([
      prisma.trackNomination.deleteMany({
        where: {
          setId,
          projectId,
          judgeId
        }
      }),
      ...(trackIds.length > 0
        ? [
            prisma.trackNomination.createMany({
              data: trackIds.map((trackId: string) => ({
                setId,
                projectId,
                judgeId,
                trackId
              }))
            })
          ]
        : [])
    ]);

    res.json({ message: 'Nominations saved', trackIds });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/sets/:setId/rank — Submit stack rank (1st/2nd/3rd)
router.post('/:eventId/sets/:setId/rank', authenticate, requireRole('JUDGE', 'ADMIN'), async (req, res) => {
  try {
    const { eventId, setId } = req.params;
    const { rankings } = req.body;

    const auth = await authorizeSetAccess(req, eventId, setId);
    if (auth.error || !auth.set) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const numProjects = auth.set.projects.length;
    const isTieBreaker = auth.set.setNumber === 0;
    // Fairness guard: In small sets (trimmed tail), only top max(1, numProjects - 2) earn points
    // 5 projects -> 3 earn points (3, 2, 1; 2 get 0)
    // 4 projects -> 2 earn points (3, 2; 2 get 0)
    // 3 projects -> 1 earns points (3; 2 get 0)
    const allowedPointSlots = isTieBreaker ? numProjects : Math.max(1, numProjects - 2);
    const requiredRanks = isTieBreaker ? numProjects : Math.min(3, numProjects);

    if (!Array.isArray(rankings) || rankings.length < requiredRanks) {
      return res.status(400).json({ error: `At least ${requiredRanks} rankings required` });
    }

    // Verify all ranked projects belong to this set
    const validProjectIds = new Set(auth.set.projects.map(p => p.projectId));
    for (const r of rankings) {
      if (!validProjectIds.has(r.projectId)) {
        return res.status(400).json({ error: `Invalid project ${r.projectId} in rankings` });
      }
    }

    const judgeId = auth.judgeId!;
    const basePoints = [3, 2, 1];
    const pointsMap: Record<number, number> = {};
    for (let i = 0; i < allowedPointSlots; i++) {
      pointsMap[i + 1] = basePoints[i] || 0;
    }

    // ponytail: Atomic transaction prevents losing previous ranks if insertion fails
    await prisma.$transaction([
      prisma.stackRankVote.deleteMany({
        where: {
          setId,
          judgeId
        }
      }),
      prisma.stackRankVote.createMany({
        data: rankings.map((r: { projectId: string; rank: number }) => ({
          setId,
          judgeId,
          projectId: r.projectId,
          rank: r.rank,
          points: pointsMap[r.rank] || 0
        }))
      })
    ]);

    res.json({ message: 'Rankings saved' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/sets/:setId/reopen — Reopen a completed set for editing
router.post('/:eventId/sets/:setId/reopen', authenticate, requireRole('JUDGE', 'ADMIN'), async (req, res) => {
  try {
    const { eventId, setId } = req.params;
    const set = await prisma.judgeSet.findUnique({ where: { id: setId } });
    if (!set || set.eventId !== eventId) return res.status(404).json({ error: 'Set not found' });
    if (set.status !== 'COMPLETED') return res.status(400).json({ error: 'Set is not completed' });

    if (req.user!.role === 'JUDGE') {
      if (set.judgeId !== req.user!.userId) return res.status(403).json({ error: 'Not your set' });

      // Check for approved edit request
      const editRequest = await prisma.editRequest.findFirst({
        where: { setId, judgeId: req.user!.userId, status: 'APPROVED' }
      });

      if (!editRequest) {
        return res.status(403).json({ error: 'Editing locked. Please request access from an administrator.' });
      }

      // Check if judge has an active IN_PROGRESS set
      const activeSet = await prisma.judgeSet.findFirst({
        where: { judgeId: req.user!.userId, setNumber: { gte: 0 }, status: 'IN_PROGRESS' }
      });
      if (activeSet) {
        return res.status(400).json({ error: 'Cannot edit: you have an active set in progress. Complete it first.' });
      }

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
    if (io) {
      io.to(`event:${eventId}`).emit('set:reopened', { setId, eventId });
    }

    res.json({ message: 'Set reopened for editing' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/sets/:setId/complete — Mark set complete
router.post('/:eventId/sets/:setId/complete', authenticate, requireRole('JUDGE', 'ADMIN'), async (req, res) => {
  try {
    const { eventId, setId } = req.params;
    const auth = await authorizeSetAccess(req, eventId, setId);
    if (auth.error || !auth.set) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const set = auth.set;
    const judgeId = auth.judgeId!;

    // Idempotency guard: If set is already COMPLETED, return early without re-assigning or duplicate side-effects
    if (set.status === 'COMPLETED') {
      return res.json({ message: 'Set already completed', setId, status: 'COMPLETED' });
    }

    const projectIds = set.projects.map(p => p.projectId);
    const scores = await prisma.score.findMany({
      where: { setId, judgeId, projectId: { in: projectIds } }
    });

    if (scores.length < projectIds.length) {
      return res.status(400).json({
        error: `Score all ${projectIds.length} projects before completing (only ${scores.length} scored)`
      });
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
    if (io) {
      io.to(`event:${eventId}`).emit('set:completed', { judgeId, setId, eventId });
    }

    const { getAssignmentProgress, assignNextSetToJudge } = await import('../engine/assignment.js');
    
    // Auto-assign next set to this judge if they are a JUDGE role
    if (req.user!.role === 'JUDGE') {
      const newSetId = await assignNextSetToJudge(eventId, judgeId);
      if (newSetId) {
        console.log(`[AutoAssign] Judge ${judgeId} received new set ${newSetId}`);
        if (io) {
          io.to(`event:${eventId}`).emit('assignment:new', { judgeId, setId: newSetId });
        }
      }
    }

    const progress = await getAssignmentProgress(eventId);
    if (io) {
      io.to(`event:${eventId}`).emit('judging:progress', { eventId, ...progress });
    }

    // Check tie-breaking phase (Set #0)
    try {
      const { checkAndTriggerTieBreaker } = await import('../engine/tiebreaker.js');
      await checkAndTriggerTieBreaker(eventId);
    } catch (err) {
      console.error('[TieBreakerError]', err);
    }

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
    const { eventId, setId } = req.params;
    const user = req.user!;

    const set = await prisma.judgeSet.findUnique({
      where: { id: setId },
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

    if (!set || set.eventId !== eventId) return res.status(404).json({ error: 'Set not found' });

    // Authorization: JUDGE can only view their assigned set; TEAM cannot view sets
    if (user.role === 'JUDGE' && set.judgeId !== user.userId) {
      return res.status(403).json({ error: 'Forbidden: You cannot view sets assigned to another judge' });
    }
    if (user.role === 'TEAM') {
      return res.status(403).json({ error: 'Forbidden: Teams cannot access judge set details' });
    }

    // Enrich Set #0 with base rank for UI display
    let baseRank = null;
    if (set.setNumber === 0) {
      const projectsCount = set.projects.length;
      if (projectsCount > 0) {
        const leaderboard = await generateLeaderboard(eventId);
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

// POST /api/events/:eventId/sync — Batch sync offline mutations
router.post('/:eventId/sync', authenticate, requireRole('JUDGE', 'ADMIN'), async (req, res) => {
  try {
    const { eventId } = req.params;
    const { mutations } = req.body;
    if (!Array.isArray(mutations) || mutations.length === 0) {
      return res.json({ processed: 0, results: [] });
    }

    const results: Array<{ id: string; status: 'SYNCED' | 'FAILED' | 'CONFLICT'; error?: string }> = [];

    for (const mut of mutations) {
      try {
        const { id, operation, setId, projectId, payload } = mut;
        const auth = await authorizeSetAccess(req, eventId, setId);
        if (auth.error || !auth.set) {
          results.push({ id, status: 'CONFLICT', error: auth.error || 'Set access denied or reassigned' });
          continue;
        }

        const judgeId = auth.judgeId!;

        if (operation === 'SAVE_SCORE') {
          const { completion, originality, learning, design, technology, timeSpentSeconds } = payload;
          const total = (Number(completion) || 0) + (Number(originality) || 0) + (Number(learning) || 0) + (Number(design) || 0) + (Number(technology) || 0);
          const timeSeconds = typeof timeSpentSeconds === 'number' && timeSpentSeconds > 0 ? timeSpentSeconds : 0;

          await prisma.score.upsert({
            where: {
              setId_projectId_judgeId: { setId, projectId, judgeId }
            },
            create: {
              setId,
              projectId,
              judgeId,
              completion: Number(completion) || 0,
              originality: Number(originality) || 0,
              learning: Number(learning) || 0,
              design: Number(design) || 0,
              technology: Number(technology) || 0,
              total,
              timeSpentSeconds: timeSeconds
            },
            update: {
              completion: Number(completion) || 0,
              originality: Number(originality) || 0,
              learning: Number(learning) || 0,
              design: Number(design) || 0,
              technology: Number(technology) || 0,
              total,
              timeSpentSeconds: timeSeconds
            }
          });
          results.push({ id, status: 'SYNCED' });
        } else if (operation === 'SAVE_FEEDBACK') {
          if (payload.comment) {
            await prisma.feedback.deleteMany({
              where: { setId, projectId, judgeId }
            });
            await prisma.feedback.create({
              data: {
                setId,
                projectId,
                judgeId,
                comment: String(payload.comment)
              }
            });
          }
          results.push({ id, status: 'SYNCED' });
        } else if (operation === 'SAVE_NOMINATIONS') {
          const trackIds = Array.isArray(payload.trackIds) ? payload.trackIds : [];
          await prisma.$transaction([
            prisma.trackNomination.deleteMany({
              where: { setId, projectId, judgeId }
            }),
            ...(trackIds.length > 0
              ? [
                  prisma.trackNomination.createMany({
                    data: trackIds.map((trackId: string) => ({
                      setId,
                      projectId,
                      judgeId,
                      trackId
                    }))
                  })
                ]
              : [])
          ]);
          results.push({ id, status: 'SYNCED' });
        } else if (operation === 'SAVE_RANKS') {
          const rankings = Array.isArray(payload.rankings) ? payload.rankings : [];
          if (rankings.length > 0) {
            const numProjects = auth.set.projects.length;
            const isTieBreaker = auth.set.setNumber === 0;
            const allowedPointSlots = isTieBreaker ? numProjects : Math.max(1, numProjects - 2);
            const basePoints = [3, 2, 1];
            const pointsMap: Record<number, number> = {};
            for (let i = 0; i < allowedPointSlots; i++) {
              pointsMap[i + 1] = basePoints[i] || 0;
            }

            await prisma.$transaction([
              prisma.stackRankVote.deleteMany({ where: { setId, judgeId } }),
              prisma.stackRankVote.createMany({
                data: rankings.map((r: { projectId: string; rank: number }) => ({
                  setId,
                  judgeId,
                  projectId: r.projectId,
                  rank: r.rank,
                  points: pointsMap[r.rank] || 0
                }))
              })
            ]);
          }
          results.push({ id, status: 'SYNCED' });
        } else if (operation === 'COMPLETE_SET') {
          if (auth.set.status === 'COMPLETED') {
            results.push({ id, status: 'SYNCED' });
          } else {
            await prisma.judgeSet.update({
              where: { id: setId },
              data: { status: 'COMPLETED' }
            });

            const { updateProjectJudgingStatus, assignNextSetToJudge } = await import('../engine/assignment.js');
            for (const sp of auth.set.projects) {
              await updateProjectJudgingStatus(sp.projectId);
            }

            if (req.user!.role === 'JUDGE') {
              const newSetId = await assignNextSetToJudge(eventId, judgeId);
              if (newSetId) {
                const io = req.app.get('io');
                if (io) io.to(`event:${eventId}`).emit('assignment:new', { judgeId, setId: newSetId });
              }
            }
            results.push({ id, status: 'SYNCED' });
          }
        } else {
          results.push({ id, status: 'FAILED', error: `Unknown operation: ${operation}` });
        }
      } catch (err: any) {
        results.push({ id: mut.id, status: 'FAILED', error: err.message });
      }
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`event:${eventId}`).emit('score:batchSynced', {
        judgeId: req.user?.userId,
        syncedCount: results.filter(r => r.status === 'SYNCED').length
      });
    }

    res.json({ processed: results.length, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
