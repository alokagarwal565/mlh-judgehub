import assert from 'node:assert/strict';
import { generateSetColumns } from './engine/assignment.js';
import { leaderboardToCsv, LeaderboardEntry } from './engine/scoring.js';
import { Prisma } from '@prisma/client';

console.log('🧪 Starting MLH JudgeHub Production Engine Self-Tests...\n');

// 1. Test generateSetColumns edge cases
console.log('Test 1: generateSetColumns with 0 projects');
const zeroProjects = generateSetColumns([], 5);
assert.deepEqual(zeroProjects, [], 'Expected empty array for 0 projects');
console.log('  ✔ Passed: 0 projects returns empty array without throwing NaN/crash');

console.log('\nTest 2: generateSetColumns with fewer projects than setSize');
const dummyProjectsSmall = [
  { id: 'p1', eventId: 'e1', teamId: 't1', title: 'P1', description: null, demoLink: null, videoUrl: null, roomNumber: null, teamNumber: '1', leaderName: null, status: 'SUBMITTED' as const, createdAt: new Date() },
  { id: 'p2', eventId: 'e1', teamId: 't2', title: 'P2', description: null, demoLink: null, videoUrl: null, roomNumber: null, teamNumber: '2', leaderName: null, status: 'SUBMITTED' as const, createdAt: new Date() }
];
const smallColumns = generateSetColumns(dummyProjectsSmall, 5);
assert.equal(smallColumns.length, 1);
assert.equal(smallColumns[0].length, 1);
assert.deepEqual(smallColumns[0][0], ['p1', 'p2']);
console.log('  ✔ Passed: Fewer projects than setSize gracefully wraps all projects');

console.log('\nTest 3: generateSetColumns with standard 26 projects');
const dummyProjects26 = Array.from({ length: 26 }, (_, i) => ({
  id: `p${i + 1}`,
  eventId: 'e1',
  teamId: `t${i + 1}`,
  title: `Project ${i + 1}`,
  description: null,
  demoLink: null,
  videoUrl: null,
  roomNumber: null,
  teamNumber: `${i + 1}`,
  leaderName: null,
  status: 'SUBMITTED' as const,
  createdAt: new Date()
}));
const standardColumns = generateSetColumns(dummyProjects26, 5);
assert.equal(standardColumns.length, 3, 'Expected 3 staggered columns');
assert(standardColumns[0].length > 0, 'Column 1 has sets');
assert(standardColumns[1].length > 0, 'Column 2 has sets');
assert(standardColumns[2].length > 0, 'Column 3 has sets');
console.log('  ✔ Passed: 26 projects generates 3 staggered columns correctly');

console.log('\nTest 4: leaderboardToCsv sanitizes formula injection');
const mockEntries: LeaderboardEntry[] = [
  {
    projectId: 'p1',
    projectTitle: '=SUM(A1:A10)', // Malicious formula
    teamName: '+cmd|calc!A0',      // Malicious formula
    teamNumber: '1',
    roomNumber: '101',
    leaderName: '@AdminUser',      // Malicious trigger
    phone: '-555-0101',           // Malicious trigger
    email: 'hacker@test.local',
    projectStatus: 'SCORED',
    stackPoints: 10,
    totalMarks: 45,
    timesEvaluated: 3,
    rank: 1,
    isTied: false
  }
];
const csvOutput = leaderboardToCsv(mockEntries);
assert(csvOutput.includes("\"'=SUM(A1:A10)\""), 'Expected leading single quote before =SUM formula');
assert(csvOutput.includes("\"'+cmd|calc!A0\""), 'Expected leading single quote before +cmd formula');
assert(csvOutput.includes("\"'@AdminUser\""), 'Expected leading single quote before @AdminUser trigger');
assert(csvOutput.includes("\"'-555-0101\""), 'Expected leading single quote before -555-0101 trigger');
console.log('  ✔ Passed: Formula triggers (=, +, -, @) neutralized with leading apostrophe');

console.log('\nTest 5: Prisma schema User fields do not contain passwordPlain');
const userFields = Prisma.dmmf.datamodel.models.find(m => m.name === 'User')?.fields.map(f => f.name) || [];
assert(!userFields.includes('passwordPlain'), 'passwordPlain must NOT exist in Prisma User model');
console.log('  ✔ Passed: passwordPlain field successfully removed from Prisma schema');

console.log('\nTest 6: JWT signing and token integrity');
import { signToken, JWT_SECRET, invalidateActiveEventCache } from './middleware/auth.js';
import jwt from 'jsonwebtoken';
const sampleToken = signToken({ userId: 'u1', email: 'test@mlh.local', role: 'JUDGE', name: 'Judge Test' });
const decoded = jwt.verify(sampleToken, JWT_SECRET) as any;
assert.equal(decoded.userId, 'u1');
assert.equal(decoded.role, 'JUDGE');
console.log('  ✔ Passed: JWT tokens sign and verify with strict payload structure');

console.log('\nTest 7: Cache invalidation function works');
assert.doesNotThrow(() => invalidateActiveEventCache(), 'Cache invalidation should not throw');
console.log('  ✔ Passed: Cache invalidation reset successfully');

console.log('\n🎉 ALL 7 PRODUCTION ENGINE SELF-CHECKS PASSED SUCCESSFULLY!');
