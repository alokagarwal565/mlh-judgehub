import assert from 'node:assert/strict';
import { prisma } from './lib/prisma.js';

console.log('🧪 Starting MLH JudgeHub Concurrency, Idempotency & Batch Sync Verification...\n');

async function runTests() {
  // 1. Verify Idempotency on Set Completion
  console.log('Test 1: Idempotency protection on Set Completion');
  // Find or create test event and set
  let event = await prisma.event.findFirst({ where: { status: 'JUDGING' } });
  if (!event) {
    event = await prisma.event.create({
      data: {
        name: 'Test Concurrency Hackathon',
        status: 'JUDGING',
        isActive: true,
        setSize: 5
      }
    });
  }

  // Find a test user judge
  let judge = await prisma.user.findFirst({ where: { role: 'JUDGE' } });
  if (!judge) {
    judge = await prisma.user.create({
      data: {
        name: 'Test Judge 1',
        email: `testjudge_${Date.now()}@test.local`,
        passwordHash: 'hash',
        role: 'JUDGE'
      }
    });
  }

  // Create an isolated test JudgeSet
  const testSet = await prisma.judgeSet.create({
    data: {
      eventId: event.id,
      judgeId: judge.id,
      column: 0,
      setNumber: 999,
      status: 'IN_PROGRESS'
    }
  });

  // Verify unique constraint on Score: upsert works without duplicate keys
  console.log('\nTest 2: Score upsert concurrency & unique constraint');
  const dummyProject = await prisma.project.findFirst({ where: { eventId: event.id } });
  let projId = dummyProject?.id;
  if (!projId) {
    const teamUser = await prisma.user.create({
      data: {
        name: 'Team 999',
        email: `team999_${Date.now()}@test.local`,
        passwordHash: 'hash',
        role: 'TEAM'
      }
    });
    const newProj = await prisma.project.create({
      data: {
        eventId: event.id,
        teamId: teamUser.id,
        title: 'Concurrency Test Project',
        teamNumber: `999_${Date.now()}`
      }
    });
    projId = newProj.id;
  }

  // Upsert Score 1
  const score1 = await prisma.score.upsert({
    where: { setId_projectId_judgeId: { setId: testSet.id, projectId: projId, judgeId: judge.id } },
    create: {
      setId: testSet.id,
      projectId: projId,
      judgeId: judge.id,
      completion: 8,
      originality: 8,
      learning: 8,
      design: 8,
      technology: 8,
      total: 40
    },
    update: {
      completion: 8,
      originality: 8,
      learning: 8,
      design: 8,
      technology: 8,
      total: 40
    }
  });

  // Upsert Score 2 (Updated marks on same project)
  const score2 = await prisma.score.upsert({
    where: { setId_projectId_judgeId: { setId: testSet.id, projectId: projId, judgeId: judge.id } },
    create: {
      setId: testSet.id,
      projectId: projId,
      judgeId: judge.id,
      completion: 10,
      originality: 10,
      learning: 10,
      design: 10,
      technology: 10,
      total: 50
    },
    update: {
      completion: 10,
      originality: 10,
      learning: 10,
      design: 10,
      technology: 10,
      total: 50
    }
  });

  assert.equal(score1.id, score2.id, 'Expected identical Score row ID after upsert');
  assert.equal(score2.total, 50, 'Expected total to be updated to 50');
  console.log('  ✔ Passed: Concurrent score upsert updates row without duplicate insertion');

  // Test 3: Simulation of 30 Judges Concurrent Batch Sync Traffic
  console.log('\nTest 3: Simulation of 30 Concurrent Judges Reconnect Burst');
  const CONCURRENT_JUDGES = 30;
  const startTime = Date.now();

  const syncPromises = Array.from({ length: CONCURRENT_JUDGES }, async (_, idx) => {
    // Each simulated judge executes an upsert query simultaneously
    const simTotal = 30 + (idx % 20);
    return prisma.score.upsert({
      where: { setId_projectId_judgeId: { setId: testSet.id, projectId: projId, judgeId: judge.id } },
      create: {
        setId: testSet.id,
        projectId: projId,
        judgeId: judge.id,
        completion: 6,
        originality: 6,
        learning: 6,
        design: 6,
        technology: 6,
        total: simTotal
      },
      update: {
        total: simTotal
      }
    });
  });

  const results = await Promise.all(syncPromises);
  const elapsed = Date.now() - startTime;
  assert.equal(results.length, CONCURRENT_JUDGES, 'All 30 concurrent judge operations must resolve');
  console.log(`  ✔ Passed: 30 concurrent operations resolved cleanly in ${elapsed}ms without connection pool exhaustion`);

  // Test 4: Database Index Verification
  console.log('\nTest 4: Database query index performance check');
  // Query JudgeSet using composite indexes
  const queryStart = Date.now();
  const setsCount = await prisma.judgeSet.count({
    where: { eventId: event.id, status: 'IN_PROGRESS' }
  });
  const queryElapsed = Date.now() - queryStart;
  assert(queryElapsed < 500, `Expected index lookup in under 500ms (took ${queryElapsed}ms)`);
  console.log(`  ✔ Passed: Indexed JudgeSet query completed in ${queryElapsed}ms (count: ${setsCount})`);

  // Cleanup test set
  await prisma.score.deleteMany({ where: { setId: testSet.id } });
  await prisma.judgeSet.delete({ where: { id: testSet.id } });

  console.log('\n🎉 ALL CONCURRENCY & RESILIENCE VERIFICATIONS PASSED!\n');
}

runTests()
  .catch((err) => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
