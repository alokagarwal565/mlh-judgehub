import { Router } from 'express';
import { prisma } from '../index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { createSetsForEvent, assignNextSetToJudge, getAssignmentProgress } from '../engine/assignment.js';

const router = Router();

// POST /api/events/:eventId/assignments — Generate all sets
router.post('/:eventId/assignments', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const totalSets = await createSetsForEvent(req.params.eventId);
    res.status(201).json({ message: 'Sets generated', totalSets });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:eventId/assignments — View all sets with status
router.get('/:eventId/assignments', authenticate, async (req, res) => {
  try {
    const sets = await prisma.judgeSet.findMany({
      where: { eventId: req.params.eventId },
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
        scores: { select: { timeSpentSeconds: true } }
      },
      orderBy: [{ column: 'asc' }, { setNumber: 'asc' }]
    });
    res.json(sets);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:eventId/assignments/progress
router.get('/:eventId/assignments/progress', authenticate, async (req, res) => {
  try {
    const progress = await getAssignmentProgress(req.params.eventId);
    res.json(progress);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/assignments/next — Judge requests next set
router.post('/:eventId/assignments/next', authenticate, requireRole('JUDGE'), async (req, res) => {
  try {
    const setId = await assignNextSetToJudge(req.params.eventId, req.user!.userId);
    if (!setId) {
      return res.json({ message: 'No more sets available', set: null });
    }

    const set = await prisma.judgeSet.findUnique({
      where: { id: setId },
      include: {
        projects: {
          include: {
            project: {
              include: { team: { select: { id: true, name: true, phone: true } } }
            }
          },
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    const io = req.app.get('io');
    const progress = await getAssignmentProgress(req.params.eventId);
    io.emit('judging:progress', { eventId: req.params.eventId, ...progress });

    res.json({ set });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:eventId/assignments/my-sets — Judge's assigned sets
router.get('/:eventId/assignments/my-sets', authenticate, requireRole('JUDGE'), async (req, res) => {
  try {
    const sets = await prisma.judgeSet.findMany({
      where: {
        eventId: req.params.eventId,
        judgeId: req.user!.userId
      },
      include: {
        projects: {
          include: {
            project: {
              include: { team: { select: { id: true, name: true, phone: true } } }
            }
          },
          orderBy: { sortOrder: 'asc' }
        },
        scores: true,
        stackRankVotes: true
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json(sets);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:eventId/assignments/judge/:judgeId — Admin view's a judge's assigned sets
router.get('/:eventId/assignments/judge/:judgeId', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const sets = await prisma.judgeSet.findMany({
      where: {
        eventId: req.params.eventId,
        judgeId: req.params.judgeId
      },
      include: {
        projects: {
          include: {
            project: {
              include: { team: { select: { id: true, name: true, phone: true } } }
            }
          },
          orderBy: { sortOrder: 'asc' }
        },
        scores: true,
        stackRankVotes: true
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json(sets);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:eventId/assignments/idle-judges
// Returns judges who have NO current IN_PROGRESS set for this event
router.get('/:eventId/assignments/idle-judges', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { eventId } = req.params;

    const allJudges = await prisma.user.findMany({
      where: { role: 'JUDGE' },
      select: {
        id: true, name: true, email: true,
        judgeSets: {
          where: { eventId },
          select: { id: true, status: true, column: true, setNumber: true }
        }
      }
    });

    // An idle judge has no IN_PROGRESS set right now
    const idleJudges = allJudges.map(j => ({
      id: j.id,
      name: j.name,
      email: j.email,
      totalSets: j.judgeSets.length,
      completedSets: j.judgeSets.filter(s => s.status === 'COMPLETED').length,
      isIdle: !j.judgeSets.some(s => s.status === 'IN_PROGRESS'),
      // Track which projectIds this judge has already evaluated
      evaluatedProjectIds: [] as string[]
    }));

    // Fetch evaluated project IDs for each judge for overlap checking on the frontend
    const judgeIds = idleJudges.filter(j => j.isIdle).map(j => j.id);
    const evalData = await prisma.judgeSetProject.findMany({
      where: { set: { eventId, judgeId: { in: judgeIds }, status: { in: ['IN_PROGRESS', 'COMPLETED'] } } },
      select: { projectId: true, set: { select: { judgeId: true } } }
    });
    const evalMap: Record<string, Set<string>> = {};
    for (const e of evalData) {
      const jid = e.set.judgeId!;
      if (!evalMap[jid]) evalMap[jid] = new Set();
      evalMap[jid].add(e.projectId);
    }

    const enriched = idleJudges.map(j => ({
      ...j,
      evaluatedProjectIds: [...(evalMap[j.id] || [])]
    }));

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:eventId/assignments/manual-assign
// Admin manually assigns a specific UNASSIGNED set to a specific idle judge
router.post('/:eventId/assignments/manual-assign', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { eventId } = req.params;
    const { setId, judgeId } = req.body;
    if (!setId || !judgeId) return res.status(400).json({ error: 'setId and judgeId are required' });

    // Verify the set is unassigned
    const set = await prisma.judgeSet.findUnique({
      where: { id: setId },
      include: { projects: { select: { projectId: true } } }
    });
    if (!set) return res.status(404).json({ error: 'Set not found' });
    if (set.status !== 'UNASSIGNED') return res.status(409).json({ error: `Set is already ${set.status}` });

    // Check for project overlap with this judge's history
    const previousSets = await prisma.judgeSet.findMany({
      where: { eventId, judgeId, status: { in: ['IN_PROGRESS', 'COMPLETED'] } },
      include: { projects: { select: { projectId: true } } }
    });
    const evaluated = new Set(previousSets.flatMap(s => s.projects.map(p => p.projectId)));
    const overlap = set.projects.some(p => evaluated.has(p.projectId));
    if (overlap) return res.status(409).json({ error: 'This judge has already evaluated one or more projects in this set' });

    // Assign
    await prisma.judgeSet.update({
      where: { id: setId },
      data: { judgeId, status: 'IN_PROGRESS' }
    });

    // Update project statuses: SUBMITTED → IN_JUDGING
    const { updateProjectJudgingStatus } = await import('../engine/assignment.js');
    for (const p of set.projects) {
      await updateProjectJudgingStatus(p.projectId);
    }

    const io = req.app.get('io');
    const progress = await getAssignmentProgress(eventId);
    io.emit('judging:progress', { eventId, ...progress });

    res.json({ message: 'Set assigned successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
