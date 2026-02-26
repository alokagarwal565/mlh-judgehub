import { Project } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/**
 * After any judging event (set assigned / set completed), recompute
 * and update the project's status based on how many sets it has been
 * fully evaluated in.
 *
 * Transition rules:
 *   ≥1 set assigned to a judge (IN_PROGRESS or COMPLETED) → IN_JUDGING
 *   ≥3 sets COMPLETED                                      → JUDGING_COMPLETE
 *
 * Never downgrades FLAGGED or SCORED projects.
 */
export async function updateProjectJudgingStatus(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { status: true }
  });
  if (!project) return;
  // Never overwrite manually-set terminal statuses
  if (project.status === 'FLAGGED' || project.status === 'SCORED') return;

  // Count completed evaluations (distinct COMPLETED sets containing this project, only real assignment sets)
  const completedCount = await prisma.judgeSetProject.count({
    where: {
      projectId,
      set: { setNumber: { gte: 0 }, status: 'COMPLETED' }
    }
  });

  // Count total assigned evaluations (IN_PROGRESS + COMPLETED, only real assignment sets)
  const assignedCount = await prisma.judgeSetProject.count({
    where: {
      projectId,
      set: { setNumber: { gte: 0 }, status: { in: ['IN_PROGRESS', 'COMPLETED'] } }
    }
  });

  let newStatus: string | null = null;
  if (completedCount >= 3) {
    newStatus = 'JUDGING_COMPLETE';
  } else if (assignedCount >= 1) {
    newStatus = 'IN_JUDGING';
  }

  if (newStatus && newStatus !== project.status) {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: newStatus as any }
    });
    console.log(`[ProjectStatus] ${projectId} → ${newStatus} (${completedCount} completed, ${assignedCount} assigned)`);
  }
}

/**
 * Phase 1: Generate 3 staggered set columns.
 * Each column is an array of sets (each set = array of project IDs).
 * Offsets stagger by ~(setSize * col/3) to break neighbor grouping.
 * Wrap-around when indices exceed total projects.
 */
export function generateSetColumns(
  projects: Project[],
  setSize: number = 5
): string[][][] {
  const N = projects.length;
  // Starting Offsets for setSize=5: 1, 3, 4 (Indices 0, 2, 3)
  const offsets = [1, 3, 4];
  const columns: string[][][] = [];

  for (let col = 0; col < 3; col++) {
    const column: string[][] = [];
    let currentStart = offsets[col];

    while (true) {
      const currentEnd = currentStart + setSize - 1;
      
      // Stop rule: Start value > N AND block doesn't include N
      if (currentStart > N && !(currentStart <= N && N <= currentEnd)) {
        break;
      }

      const set: string[] = [];
      for (let i = 0; i < setSize; i++) {
        const teamNum = ((currentStart + i - 1) % N) + 1;
        set.push(projects[teamNum - 1].id);
      }

      if (set.length > 0) {
        column.push(set);
      }

      // If this block contained N or started at N, it's the last for this stream
      if (currentStart === N || (currentStart <= N && N <= currentEnd)) {
        break;
      }

      currentStart += setSize;
    }
    columns.push(column);
  }

  return columns;
}

/**
 * Create all sets in the database for an event.
 * Sets start as UNASSIGNED (no judge_id).
 */
export async function createSetsForEvent(eventId: string): Promise<number> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error('Event not found');

  const projects = await prisma.project.findMany({
    where: { eventId },
    orderBy: { roomNumber: 'asc' }
  });

  if (projects.length === 0) throw new Error('No projects in this event');

  // Delete existing assignment sets for this event (but preserve placeholder sets with setNumber: -1)
  await prisma.judgeSet.deleteMany({ where: { eventId, setNumber: { gte: 0 } } });

  const columns = generateSetColumns(projects, event.setSize);
  let totalSets = 0;

  for (let col = 0; col < columns.length; col++) {
    for (let s = 0; s < columns[col].length; s++) {
      const setProjects = columns[col][s];

      const judgeSet = await prisma.judgeSet.create({
        data: {
          eventId,
          column: col + 1,
          setNumber: s + 1,
          status: 'UNASSIGNED'
        }
      });

      // Create JudgeSetProject entries
      const projectEntries = setProjects.map((projectId, idx) => ({
        setId: judgeSet.id,
        projectId,
        sortOrder: idx + 1
      }));

      await prisma.judgeSetProject.createMany({ data: projectEntries });
      totalSets++;
    }
  }

  // ─── Over-assignment deduplication pass ───────────────────────────────────
  // If any project ended up in more than 3 sets (due to wrap-around), remove
  // it from the excess sets. Priority: keep earliest blocks (setNumber ASC),
  // and within the same setNumber prefer lower column (column ASC).
  // The set itself remains intact — only this one project is removed from it.

  const allMemberships = await prisma.judgeSetProject.findMany({
    where: { set: { eventId, setNumber: { gte: 0 } } },
    include: { set: { select: { setNumber: true, column: true } } },
    orderBy: [
      { set: { setNumber: 'asc' } },
      { set: { column: 'asc' } }
    ]
  });

  // Group by projectId, already in priority order
  const byProject: Record<string, typeof allMemberships> = {};
  for (const m of allMemberships) {
    if (!byProject[m.projectId]) byProject[m.projectId] = [];
    byProject[m.projectId].push(m);
  }

  const MAX_SETS_PER_PROJECT = 3;
  const idsToDelete: string[] = [];

  for (const [projectId, memberships] of Object.entries(byProject)) {
    if (memberships.length > MAX_SETS_PER_PROJECT) {
      const excess = memberships.slice(MAX_SETS_PER_PROJECT);
      for (const m of excess) {
        idsToDelete.push(m.id);
        console.log(
          `[OverAssign] Removing project ${projectId} from set ` +
          `col=${m.set.column} setNum=${m.set.setNumber} (was in ${memberships.length} sets)`
        );
      }
    }
  }

  if (idsToDelete.length > 0) {
    await prisma.judgeSetProject.deleteMany({ where: { id: { in: idsToDelete } } });
    console.log(`[OverAssign] Trimmed ${idsToDelete.length} excess project-set assignments.`);
  }
  // ──────────────────────────────────────────────────────────────────────────

  return totalSets;
}

/**
 * Phase 2: Assign next available set to a judge.
 * Filters out sets with any project the judge has already evaluated.
 */
export async function assignNextSetToJudge(
  eventId: string,
  judgeId: string
): Promise<string | null> {
  // Get all project IDs this judge has already evaluated (only real assignment sets)
  const previousSets = await prisma.judgeSet.findMany({
    where: {
      eventId,
      judgeId,
      setNumber: { gte: 0 },
      status: { in: ['IN_PROGRESS', 'COMPLETED'] }
    },
    include: { projects: true }
  });

  const evaluatedProjectIds = new Set<string>();
  for (const set of previousSets) {
    for (const sp of set.projects) {
      evaluatedProjectIds.add(sp.projectId);
    }
  }

  // Find unassigned sets where NO project overlaps with judge's history (only real assignment sets)
  const unassignedSets = await prisma.judgeSet.findMany({
    where: {
      eventId,
      setNumber: { gte: 0 },
      status: 'UNASSIGNED'
    },
    include: { projects: true }
  });

  if (unassignedSets.length === 0) return null;

  // Smart Priority: Pick set with lowest average evaluation count for its projects
  // Count evaluations (Completed + In Progress) for each project in this event (only real assignment sets)
  const assignmentCounts = await prisma.judgeSetProject.groupBy({
    by: ['projectId'],
    where: {
      set: {
        eventId,
        setNumber: { gte: 0 },
        status: { in: ['IN_PROGRESS', 'COMPLETED'] }
      }
    },
    _count: { projectId: true }
  });

  const countMap: Record<string, number> = {};
  assignmentCounts.forEach(c => { countMap[c.projectId] = c._count.projectId; });

  // Score each set based on the sum of evaluation counts of its projects
  const scoredSets = unassignedSets
    .filter(set => !set.projects.some(sp => evaluatedProjectIds.has(sp.projectId)))
    .map(set => {
      const score = set.projects.reduce((sum, sp) => sum + (countMap[sp.projectId] || 0), 0);
      return { set, score };
    });

  if (scoredSets.length === 0) {
    console.log(`[SmartAssign] No sets available for judge ${judgeId} after overlap filtering.`);
    return null;
  }

  // Sort by score (lowest first), then by column/setNumber for stability
  scoredSets.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.set.column !== b.set.column) return a.set.column - b.set.column;
    return a.set.setNumber - b.set.setNumber;
  });

  const bestSet = scoredSets[0].set;
  console.log(`[SmartAssign] Selected set ${bestSet.id} (Score: ${scoredSets[0].score}) for judge ${judgeId}`);

  // Assign this set to the judge
  await prisma.judgeSet.update({
    where: { id: bestSet.id },
    data: {
      judgeId,
      status: 'IN_PROGRESS'
    }
  });

  // Update project statuses: SUBMITTED → IN_JUDGING
  for (const sp of bestSet.projects) {
    await updateProjectJudgingStatus(sp.projectId);
  }

  return bestSet.id;
}

/**
 * High-level initialization: Generate sets, update status, and assign first sets.
 */
export async function initializeEventJudging(eventId: string) {
  // Only count judges bound to this event (those with JudgeSets in this event)
  const [projectsCount, eventJudges] = await Promise.all([
    prisma.project.count({ where: { eventId } }),
    prisma.user.findMany({ 
      where: { 
        role: 'JUDGE',
        judgeSets: { some: { eventId } }
      } 
    })
  ]);

  if (projectsCount === 0) throw new Error('Cannot start: No projects found in this event.');
  if (eventJudges.length === 0) throw new Error('Cannot start: No judges found in this event. Please import judges first.');

  // 1. Generate sets (this deletes old ones)
  await createSetsForEvent(eventId);

  // 2. Set status to JUDGING
  await prisma.event.update({
    where: { id: eventId },
    data: { status: 'JUDGING' }
  });

  // 3. Auto-assign first set to all judges (only those bound to this event)
  for (const judge of eventJudges) {
    await assignNextSetToJudge(eventId, judge.id);
  }

  return { projectsCount, judgesCount: eventJudges.length };
}

/**
 * Get assignment progress for an event.
 */
export async function getAssignmentProgress(eventId: string) {
  // Only count real assignment sets (setNumber >= 0), not placeholder sets (setNumber: -1)
  const total = await prisma.judgeSet.count({ where: { eventId, setNumber: { gte: 0 } } });
  const unassigned = await prisma.judgeSet.count({ where: { eventId, setNumber: { gte: 0 }, status: 'UNASSIGNED' } });
  const inProgress = await prisma.judgeSet.count({ where: { eventId, setNumber: { gte: 0 }, status: 'IN_PROGRESS' } });
  const completed = await prisma.judgeSet.count({ where: { eventId, setNumber: { gte: 0 }, status: 'COMPLETED' } });

  return { total, unassigned, inProgress, completed };
}
