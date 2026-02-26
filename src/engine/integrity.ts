import { prisma } from '../lib/prisma.js';

export interface IntegrityFlag {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  projectId?: string;
  judgeId?: string;
  details: string;
}

/**
 * Run all integrity checks for an event.
 */
export async function runIntegrityChecks(eventId: string): Promise<IntegrityFlag[]> {
  const flags: IntegrityFlag[] = [];

  // 1. Score variance check: flag projects where judge scores differ by >2 stddev
  await checkScoreVariance(eventId, flags);

  // 2. Speed check: flag if judge completed a set too quickly
  await checkScoringSpeed(eventId, flags);

  // 3. Uniformity check: judge gave identical scores to all projects in a set
  await checkUniformScoring(eventId, flags);

  return flags;
}

async function checkScoreVariance(eventId: string, flags: IntegrityFlag[]) {
  const projects = await prisma.project.findMany({
    where: { eventId },
    include: { scores: true }
  });

  for (const project of projects) {
    if (project.scores.length < 2) continue;

    const totals = project.scores.map(s => s.total);
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    const variance = totals.reduce((sum, t) => sum + (t - mean) ** 2, 0) / totals.length;
    const stddev = Math.sqrt(variance);

    for (const score of project.scores) {
      if (Math.abs(score.total - mean) > 2 * stddev && stddev > 0) {
        flags.push({
          type: 'SCORE_VARIANCE',
          severity: 'MEDIUM',
          projectId: project.id,
          judgeId: score.judgeId,
          details: `Judge score (${score.total}) deviates >2σ from mean (${mean.toFixed(1)}, σ=${stddev.toFixed(1)}) for project "${project.title}"`
        });
      }
    }
  }
}

async function checkScoringSpeed(eventId: string, flags: IntegrityFlag[]) {
  const sets = await prisma.judgeSet.findMany({
    where: { eventId, status: 'COMPLETED' },
    include: {
      scores: { orderBy: { createdAt: 'asc' } },
      projects: true
    }
  });

  for (const set of sets) {
    if (set.scores.length < 2 || !set.judgeId) continue;

    const timestamps = set.scores.map(s => s.createdAt.getTime());
    const firstScore = Math.min(...timestamps);
    const lastScore = Math.max(...timestamps);
    const durationSec = (lastScore - firstScore) / 1000;
    const projectCount = set.projects.length;

    // Less than 30 seconds per project is suspicious
    if (durationSec < projectCount * 30) {
      flags.push({
        type: 'SPEED_SUSPICIOUS',
        severity: 'HIGH',
        judgeId: set.judgeId,
        details: `Judge completed set ${set.setNumber} (col ${set.column}) in ${durationSec.toFixed(0)}s for ${projectCount} projects (< ${projectCount * 30}s threshold)`
      });
    }
  }
}

async function checkUniformScoring(eventId: string, flags: IntegrityFlag[]) {
  const sets = await prisma.judgeSet.findMany({
    where: { eventId, status: 'COMPLETED' },
    include: { scores: true }
  });

  for (const set of sets) {
    if (set.scores.length < 2 || !set.judgeId) continue;

    const totals = set.scores.map(s => s.total);
    const allSame = totals.every(t => t === totals[0]);

    if (allSame) {
      flags.push({
        type: 'UNIFORM_SCORES',
        severity: 'MEDIUM',
        judgeId: set.judgeId,
        details: `Judge gave identical total score (${totals[0]}) to all ${totals.length} projects in set ${set.setNumber} (col ${set.column})`
      });
    }
  }
}
