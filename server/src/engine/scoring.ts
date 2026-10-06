import { prisma } from '../lib/prisma.js';

export interface LeaderboardEntry {
  projectId: string;
  projectTitle: string;
  teamName: string;
  teamNumber: string | null;
  roomNumber: string | null;
  leaderName: string | null;
  phone: string | null;
  email: string;
  projectStatus: string;
  stackPoints: number;
  totalMarks: number;
  timesEvaluated: number;
  rank: number;
  isTied: boolean;
  tieBreakerRank?: number;
}

export interface LeaderboardOptions {
  excludeTrackWinners?: boolean;
  excludeFlagged?: boolean;
}

/**
 * Generate full leaderboard for an event with optional filters.
 * Priority: stackPoints DESC → totalMarks DESC
 */
export async function generateLeaderboard(eventId: string, options?: LeaderboardOptions): Promise<LeaderboardEntry[]> {
  // Get track winners if needed to filter them out
  let trackWinnerProjectIds: Set<string> = new Set();
  if (options?.excludeTrackWinners) {
    const trackWinners = await getTrackWinners(eventId);
    trackWinnerProjectIds = new Set(
      trackWinners
        .map(t => t.winner?.projectId)
        .filter(Boolean) as string[]
    );
  }

  const projects = await prisma.project.findMany({
    where: { eventId },
    include: {
      team: { select: { name: true, phone: true, email: true } },
      stackRankVotes: {
        include: { set: true }
      },
      scores: {
        include: { set: true }
      }
    }
  });

  // Apply filters
  let filteredProjects = projects;
  if (options?.excludeTrackWinners) {
    filteredProjects = filteredProjects.filter(p => !trackWinnerProjectIds.has(p.id));
  }
  if (options?.excludeFlagged) {
    filteredProjects = filteredProjects.filter(p => p.status !== 'FLAGGED');
  }

  const entries: LeaderboardEntry[] = filteredProjects.map(project => {
    const stackPoints = project.stackRankVotes
      .filter(v => v.set.setNumber !== 0 && v.set.status === 'COMPLETED')
      .reduce((sum, v) => sum + v.points, 0);
    const totalMarks = project.scores
      .filter(s => s.set.setNumber !== 0 && s.set.status === 'COMPLETED')
      .reduce((sum, s) => sum + s.total, 0);
    const timesEvaluated = project.scores.filter(s => s.set.setNumber !== 0 && s.set.status === 'COMPLETED').length;
    
    // Tie breaker rank should also only be counted if the set is completed
    const tieBreaker = project.stackRankVotes.find(v => v.set.setNumber === 0 && v.set.status === 'COMPLETED');

    return {
      projectId: project.id,
      projectTitle: project.title,
      teamName: project.team.name,
      teamNumber: project.teamNumber,
      roomNumber: project.roomNumber,
      leaderName: project.leaderName,
      phone: project.team.phone,
      email: project.team.email,
      projectStatus: project.status,
      stackPoints,
      totalMarks,
      timesEvaluated,
      rank: 0,
      isTied: false,
      tieBreakerRank: tieBreaker?.rank
    };
  });

  // Sort: stackPoints DESC, then totalMarks DESC, then tieBreakerRank ASC
  entries.sort((a, b) => {
    if (b.stackPoints !== a.stackPoints) return b.stackPoints - a.stackPoints;
    if (b.totalMarks !== a.totalMarks) return b.totalMarks - a.totalMarks;
    // Lower rank is better (1st > 2nd)
    if (a.tieBreakerRank !== b.tieBreakerRank) {
      if (!a.tieBreakerRank) return 1;
      if (!b.tieBreakerRank) return -1;
      return a.tieBreakerRank - b.tieBreakerRank;
    }
    return 0;
  });

  // Assign ranks and detect ties
  for (let i = 0; i < entries.length; i++) {
    entries[i].rank = i + 1;
    if (i > 0) {
      const prev = entries[i - 1];
      if (prev.stackPoints === entries[i].stackPoints && 
          prev.totalMarks === entries[i].totalMarks &&
          prev.tieBreakerRank === entries[i].tieBreakerRank) {
        entries[i].rank = prev.rank;
        entries[i].isTied = true;
        prev.isTied = true;
      }
    }
  }

  return entries;
}

/**
 * Get track winners — project with most nominations per track.
 * Tiebreaker: highest totalMarks.
 */
export async function getTrackWinners(eventId: string) {
  const tracks = await prisma.track.findMany({
    where: { eventId },
    include: {
      nominations: {
        where: {
          set: { status: 'COMPLETED' }
        },
        include: {
          project: {
            include: {
              team: { select: { name: true, phone: true } },
              scores: true,
              stackRankVotes: true
            }
          }
        }
      }
    }
  });

  return tracks.map(track => {
    // Count nominations per project
    const tally: Record<string, { count: number; projectId: string; projectTitle: string; teamName: string; teamNumber: string | null; leaderName: string | null; roomNumber: string | null; totalMarks: number; stackPoints: number }> = {};

    for (const nom of track.nominations) {
      const pid = nom.projectId;
      if (!tally[pid]) {
        const totalMarks = nom.project.scores.reduce((s, sc) => s + sc.total, 0);
        const stackPoints = nom.project.stackRankVotes.reduce((s, v) => s + v.points, 0);
        tally[pid] = {
          count: 0,
          projectId: pid,
          projectTitle: nom.project.title,
          teamName: nom.project.team.name,
          teamNumber: nom.project.teamNumber,
          leaderName: nom.project.leaderName,
          roomNumber: nom.project.roomNumber,
          totalMarks,
          stackPoints
        };
      }
      tally[pid].count++;
    }

    const sorted = Object.values(tally).sort((a, b) => {
      if (b.stackPoints !== a.stackPoints) return b.stackPoints - a.stackPoints;
      if (b.totalMarks !== a.totalMarks) return b.totalMarks - a.totalMarks;
      return b.count - a.count;
    });

    return {
      trackId: track.id,
      trackName: track.name,
      trackColor: track.color,
      totalNominations: track.nominations.length,
      winner: sorted[0] || null,
      allNominees: sorted
    };
  });
}

/**
 * Find tied projects that need rejudging.
 */
export async function findTiedProjects(eventId: string): Promise<string[][]> {
  const leaderboard = await generateLeaderboard(eventId);
  const tiedGroups: Map<number, string[]> = new Map();

  for (const entry of leaderboard) {
    if (entry.isTied) {
      const key = entry.rank;
      if (!tiedGroups.has(key)) tiedGroups.set(key, []);
      tiedGroups.get(key)!.push(entry.projectId);
    }
  }

  return Array.from(tiedGroups.values());
}

// ponytail: Helper to prevent CSV formula injection and correctly escape double quotes
function escapeCsvField(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Export leaderboard as CSV string with formula injection protection.
 */
export function leaderboardToCsv(entries: LeaderboardEntry[]): string {
  const header = 'Rank,Team Name,Team No.,Project Title,Room No.,Leader Name,Phone,Email,Stack Points,Total Marks,Times Evaluated,Tied';
  const rows = entries.map(e =>
    [
      e.rank,
      escapeCsvField(e.teamName),
      escapeCsvField(e.teamNumber || ''),
      escapeCsvField(e.projectTitle),
      escapeCsvField(e.roomNumber || ''),
      escapeCsvField(e.leaderName || ''),
      escapeCsvField(e.phone || ''),
      escapeCsvField(e.email),
      e.stackPoints,
      e.totalMarks,
      e.timesEvaluated,
      e.isTied
    ].join(',')
  );
  return [header, ...rows].join('\n');
}

