import { prisma } from '../lib/prisma.js';
import { generateLeaderboard } from './scoring.js';

/**
 * Check if ALL judging sets (Set #1, #2, #3, ...) for an event are COMPLETED.
 * Tie-breaker sets (Set #0) are ignored in this check.
 */
export async function areAllStandardSetsCompleted(eventId: string): Promise<boolean> {
  const standardSets = await prisma.judgeSet.findMany({
    where: { 
      eventId,
      setNumber: { gt: 0 } // Exclude tie breakers
    },
    select: { status: true }
  });

  if (standardSets.length === 0) return false;
  return standardSets.every(s => s.status === 'COMPLETED');
}

/**
 * Main entry point to detect ties and generate Set #0.
 */
export async function checkAndTriggerTieBreaker(eventId: string) {
  // 1. Only start if all standard sets are done
  const finished = await areAllStandardSetsCompleted(eventId);
  if (!finished) {
    console.log(`[TieBreaker] Standard sets not yet finished for event ${eventId}`);
    return;
  }

  // 2. Generate leaderboard to find ties
  const leaderboard = await generateLeaderboard(eventId);
  
  // Group by (stackPoints, totalMarks) to find real ties
  // Note: generateLeaderboard already sorts by these, so we just look for isTied flag
  const tiedGroups: string[][] = [];
  let currentGroup: string[] = [];

  for (let i = 0; i < leaderboard.length; i++) {
    const entry = leaderboard[i];
    const next = leaderboard[i+1];
    
    currentGroup.push(entry.projectId);

    if (next && next.stackPoints === entry.stackPoints && next.totalMarks === entry.totalMarks) {
      // Still in tie group
    } else {
      // End of potential tie group
      if (currentGroup.length > 1) {
        // Check if this tie already has a Set #0
        const existingSet = await prisma.judgeSet.findFirst({
          where: {
            eventId,
            setNumber: 0,
            projects: { some: { projectId: { in: currentGroup } } }
          }
        });

        if (!existingSet) {
          tiedGroups.push(currentGroup);
        }
      }
      currentGroup = [];
    }
  }

  if (tiedGroups.length === 0) {
    console.log(`[TieBreaker] No new ties detected for event ${eventId}`);
    return;
  }

  console.log(`[TieBreaker] Found ${tiedGroups.length} tied groups. Generating Set #0s...`);

  // 3. Create sets for each group
  for (const group of tiedGroups) {
    await createTieBreakerSet(eventId, group);
  }
}

async function createTieBreakerSet(eventId: string, projectIds: string[]) {
  const numTeams = projectIds.length;
  const numJudgesNeeded = Math.ceil(numTeams / 5);
  
  // Find eligible judges
  // RULE: Judge MUST NOT have evaluated any of the tied teams.
  const previousJudges = await prisma.judgeSetProject.findMany({
    where: { projectId: { in: projectIds } },
    select: { set: { select: { judgeId: true } } }
  });
  const blacklistedJudgeIds = new Set(previousJudges.map(pj => pj.set.judgeId).filter(id => id !== null));

  const allJudges = await prisma.user.findMany({
    where: { 
      role: 'JUDGE',
      id: { notIn: Array.from(blacklistedJudgeIds) as string[] }
    },
    include: {
      judgeSets: {
        where: { eventId },
        select: { status: true }
      }
    }
  });

  // Priority: 1. Idle (no IN_PROGRESS), 2. Least completed sets
  const scoredJudges = allJudges.map(j => ({
    judge: j,
    isIdle: !j.judgeSets.some(s => s.status === 'IN_PROGRESS'),
    completedCount: j.judgeSets.filter(s => s.status === 'COMPLETED').length
  }));

  scoredJudges.sort((a, b) => {
    if (a.isIdle !== b.isIdle) return a.isIdle ? -1 : 1;
    if (a.completedCount !== b.completedCount) return a.completedCount - b.completedCount;
    return Math.random() - 0.5; // Random among equals
  });

  const selectedJudges = scoredJudges.slice(0, numJudgesNeeded);

  // Split teams among judges
  // Divide equally. Remainder +1 to judge with least completed sets.
  const baseSize = Math.floor(numTeams / numJudgesNeeded);
  const remainder = numTeams % numJudgesNeeded;

  let projectCursor = 0;
  for (let i = 0; i < numJudgesNeeded; i++) {
    const judgeObj = selectedJudges[i];
    const currentSize = baseSize + (i < remainder ? 1 : 0);
    const setProjects = projectIds.slice(projectCursor, projectCursor + currentSize);
    projectCursor += currentSize;

    const judgeId = judgeObj?.judge.id || null;
    const status = judgeId ? 'IN_PROGRESS' : 'UNASSIGNED';

    const tieSet = await prisma.judgeSet.create({
      data: {
        eventId,
        judgeId,
        setNumber: 0,
        column: 0, // Specialized column for tie breakers
        status
      }
    });

    await prisma.judgeSetProject.createMany({
      data: setProjects.map((pid, idx) => ({
        setId: tieSet.id,
        projectId: pid,
        sortOrder: idx + 1
      }))
    });

    console.log(`[TieBreaker] Created Set #0 for ${setProjects.length} teams. Assigned to ${judgeId || 'PENDING ADMIN'}`);
  }
}
