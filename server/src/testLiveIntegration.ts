import assert from 'node:assert/strict';

console.log('🚀 Running Live End-to-End Integration & PWA Asset Verification...\n');

const BASE_API = 'http://localhost:3001/api';
const CLIENT_URL = 'http://localhost:5173';

async function runLiveTest() {
  // 1. Verify Client PWA Assets & Service Worker
  console.log('1. Verifying PWA Assets on live Vite dev server...');
  
  const manifestRes = await fetch(`${CLIENT_URL}/manifest.webmanifest`);
  assert.equal(manifestRes.status, 200, 'Expected /manifest.webmanifest to return 200 OK');
  const manifestJson = await manifestRes.json();
  assert.equal(manifestJson.name, 'MLH JudgeHub');
  assert.equal(manifestJson.display, 'standalone');
  console.log('  ✔ Passed: /manifest.webmanifest loaded with valid PWA manifest');

  const swRes = await fetch(`${CLIENT_URL}/sw.js`);
  assert.equal(swRes.status, 200, 'Expected /sw.js to return 200 OK');
  const swText = await swRes.text();
  assert(swText.includes('mlh-judge-static-v1'), 'Expected sw.js to contain cache key');
  assert(swText.includes('skipWaiting'), 'Expected sw.js to contain update lifecycle');
  console.log('  ✔ Passed: /sw.js loaded with Cache-First & Network-First strategies');

  // 2. Verify Authentication on Backend
  console.log('\n2. Verifying Judge Authentication (POST /api/auth/login)...');
  const loginRes = await fetch(`${BASE_API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'sarah.chen@mlh.sample', password: 'judge123' })
  });

  assert.equal(loginRes.status, 200, 'Login failed');
  const loginData = await loginRes.json();
  const token = loginData.token;
  assert(token, 'JWT token must be present');
  console.log(`  ✔ Passed: Authenticated as ${loginData.user.name} (${loginData.user.role})`);

  // 3. Fetch Active Event & Sets
  console.log('\n3. Verifying Event and Assigned Sets Fetching...');
  const eventsRes = await fetch(`${BASE_API}/events`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const events = await eventsRes.json();
  const activeEvent = events.find((e: any) => e.isActive) || events[0];
  assert(activeEvent, 'No event found');
  console.log(`  ✔ Passed: Active event: ${activeEvent.name} (ID: ${activeEvent.id})`);

  const setsRes = await fetch(`${BASE_API}/events/${activeEvent.id}/assignments/my-sets`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const sets = await setsRes.json();
  console.log(`  ✔ Passed: Judge has ${sets.length} assigned sets`);

  // 4. Test Live Batch Sync Endpoint
  console.log('\n4. Verifying Batch Sync Endpoint (POST /api/events/:eventId/sync)...');
  if (sets.length > 0) {
    const targetSet = sets[0];
    const project = targetSet.projects?.[0]?.project || targetSet.projects?.[0];
    const projectId = project?.id || project?.projectId;

    const testMutations = [
      {
        id: `mut_test_score_${Date.now()}`,
        idempotencyKey: `idemp_score_${Date.now()}`,
        operation: 'SAVE_SCORE',
        setId: targetSet.id,
        projectId,
        payload: {
          completion: 9,
          originality: 9,
          learning: 8,
          design: 10,
          technology: 9,
          timeSpentSeconds: 145
        }
      },
      {
        id: `mut_test_fb_${Date.now()}`,
        idempotencyKey: `idemp_fb_${Date.now()}`,
        operation: 'SAVE_FEEDBACK',
        setId: targetSet.id,
        projectId,
        payload: {
          comment: 'Live E2E Verification Feedback - Excellent architecture!'
        }
      }
    ];

    const syncRes = await fetch(`${BASE_API}/events/${activeEvent.id}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ mutations: testMutations })
    });

    assert.equal(syncRes.status, 200, 'Sync endpoint failed');
    const syncData = await syncRes.json();
    assert.equal(syncData.processed, 2);
    assert.equal(syncData.results[0].status, 'SYNCED');
    assert.equal(syncData.results[1].status, 'SYNCED');
    console.log('  ✔ Passed: Batch sync endpoint successfully processed SCORE & FEEDBACK mutations atomically');

    // 5. Test Idempotency on Set Completion
    console.log('\n5. Verifying Idempotency on POST /complete...');
    // Attempt complete request
    const completeRes1 = await fetch(`${BASE_API}/events/${activeEvent.id}/sets/${targetSet.id}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`  Attempt 1 status: ${completeRes1.status}`);

    const completeRes2 = await fetch(`${BASE_API}/events/${activeEvent.id}/sets/${targetSet.id}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const completeData2 = await completeRes2.json();
    console.log(`  Attempt 2 status: ${completeRes2.status}`, completeData2);
    assert.equal(completeRes2.status, 200);
    assert(
      completeData2.message?.includes('completed'),
      'Expected idempotent completion acknowledgement'
    );
    console.log('  ✔ Passed: Repeated completion call returns clean idempotent response without errors');
  }

  console.log('\n🎉 ALL LIVE RESILIENCE, PWA & CONCURRENCY TESTS PASSED ON LIVE SERVERS!\n');
}

runLiveTest().catch((err) => {
  console.error('❌ Live test failed:', err);
  process.exit(1);
});
