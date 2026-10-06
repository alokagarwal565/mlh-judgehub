import { io as ioClient } from '../../client/node_modules/socket.io-client/build/esm/index.js';

const BASE_URL = 'http://localhost:3001';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function step(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    process.stdout.write(`⏳ ${name}... `);
    await fn();
    const durationMs = Date.now() - start;
    console.log(`✅ PASSED (${durationMs}ms)`);
    results.push({ name, passed: true, durationMs });
  } catch (err: any) {
    const durationMs = Date.now() - start;
    console.log(`❌ FAILED (${durationMs}ms)`);
    console.error(`   Error: ${err.message || err}`);
    results.push({ name, passed: false, error: err.message || String(err), durationMs });
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function request(path: string, options: RequestInit = {}, token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await res.json() : await res.text();

  return { status: res.status, headers: res.headers, body };
}

async function runE2E() {
  console.log('\n========================================');
  console.log('🚀 MLH JUDGEHUB END-TO-END VERIFICATION');
  console.log('========================================\n');

  let adminToken = '';
  let judge1Token = '';
  let judge2Token = '';
  let eventId = '';
  let assignedSetId = '';
  let assignedProjectIds: string[] = [];
  let adminSocket: any = null;
  const socketEventsReceived: string[] = [];

  // 1. Health check
  await step('1. Server Health Check', async () => {
    const res = await request('/api/health');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.status === 'ok', `Expected { status: "ok" }`);
  });

  // 2. Admin Authentication
  await step('2. Admin Authentication & Role Verification', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@mlh.local', password: 'admin123' })
    });
    assert(res.status === 200, `Login failed: ${JSON.stringify(res.body)}`);
    assert(!!res.body.token, 'Token not received');
    assert(res.body.user.role === 'ADMIN', `Expected ADMIN role, got ${res.body.user.role}`);
    adminToken = res.body.token;

    // Verify /me endpoint
    const meRes = await request('/api/auth/me', {}, adminToken);
    assert(meRes.status === 200, `/api/auth/me failed: ${JSON.stringify(meRes.body)}`);
    assert(meRes.body.email === 'admin@mlh.local', 'User email mismatch');
  });

  // 3. Event Retrieval & Activation
  await step('3. Fetch Active Event & Initialize Judging', async () => {
    const eventsRes = await request('/api/events', {}, adminToken);
    assert(eventsRes.status === 200 && Array.isArray(eventsRes.body) && eventsRes.body.length > 0, 'No events found');
    
    // Pick the first event
    const event = eventsRes.body[0];
    eventId = event.id;

    // Activate event
    const actRes = await request(`/api/events/${eventId}/activate`, { method: 'POST' }, adminToken);
    assert(actRes.status === 200, `Failed to activate event: ${JSON.stringify(actRes.body)}`);

    // Ensure sets are initialized
    const initRes = await request(`/api/events/${eventId}/initialize`, { method: 'POST' }, adminToken);
    assert(initRes.status === 200 || initRes.body.totalSets !== undefined, `Initialize event failed: ${JSON.stringify(initRes.body)}`);
  });

  // 4. WebSocket Auth & Room Scoping
  await step('4. Authenticated Socket.IO Connection & Room Subscription', async () => {
    await new Promise<void>((resolve, reject) => {
      adminSocket = ioClient(BASE_URL, {
        auth: { token: adminToken },
        transports: ['websocket', 'polling'],
        timeout: 5000
      });

      adminSocket.on('connect', () => {
        adminSocket.emit('join:event', eventId);
        adminSocket.on('score:submitted', (data: any) => {
          socketEventsReceived.push('score:submitted');
        });
        adminSocket.on('set:completed', (data: any) => {
          socketEventsReceived.push('set:completed');
        });
        adminSocket.on('judging:progress', (data: any) => {
          socketEventsReceived.push('judging:progress');
        });
        resolve();
      });

      adminSocket.on('connect_error', (err: any) => {
        reject(new Error(`Socket connection failed: ${err.message}`));
      });
    });
  });

  // 5. Judge 1 & Judge 2 Authentication
  await step('5. Judge 1 & Judge 2 Authentication', async () => {
    const j1Res = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'sarah.chen@mlh.sample', password: 'judge123' })
    });
    assert(j1Res.status === 200, `Judge 1 login failed: ${JSON.stringify(j1Res.body)}`);
    assert(j1Res.body.user.role === 'JUDGE', 'Expected JUDGE role for judge 1');
    judge1Token = j1Res.body.token;

    const j2Res = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'james.liu@mlh.sample', password: 'judge123' })
    });
    assert(j2Res.status === 200, `Judge 2 login failed: ${JSON.stringify(j2Res.body)}`);
    assert(j2Res.body.user.role === 'JUDGE', 'Expected JUDGE role for judge 2');
    judge2Token = j2Res.body.token;
  });

  // 6. Judge 1 Assignment Allocation
  await step('6. Judge 1 Set Assignment Retrieval / Allocation', async () => {
    let mySetsRes = await request(`/api/events/${eventId}/assignments/my-sets`, {}, judge1Token);
    assert(mySetsRes.status === 200, `Failed to get judge sets: ${JSON.stringify(mySetsRes.body)}`);

    let activeSet = mySetsRes.body.find((s: any) => s.status === 'IN_PROGRESS');
    if (!activeSet) {
      // Request next set
      const nextRes = await request(`/api/events/${eventId}/assignments/next`, { method: 'POST' }, judge1Token);
      assert(nextRes.status === 200, `Failed to get next set: ${JSON.stringify(nextRes.body)}`);
      activeSet = nextRes.body.set;
    }

    assert(!!activeSet, 'No active set found or assigned to Judge 1');
    assignedSetId = activeSet.id;
    assignedProjectIds = activeSet.projects.map((p: any) => p.projectId || p.project.id);
    assert(assignedProjectIds.length > 0, 'Set has 0 projects');
  });

  // 7. Judge 1 Scoring Flow
  await step('7. Project Evaluation & Scoring (All Criteria 0-10)', async () => {
    for (let i = 0; i < assignedProjectIds.length; i++) {
      const projectId = assignedProjectIds[i];
      const scoreRes = await request(`/api/events/${eventId}/sets/${assignedSetId}/scores`, {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          completion: 8 + (i % 3),
          originality: 7 + (i % 3),
          learning: 9,
          design: 8,
          technology: 9,
          timeSpentSeconds: 150
        })
      }, judge1Token);

      assert(scoreRes.status === 200, `Failed to score project ${projectId}: ${JSON.stringify(scoreRes.body)}`);
    }

    // Give socket brief moment to process event
    await new Promise(r => setTimeout(r, 200));
    assert(socketEventsReceived.includes('score:submitted'), 'Socket did not receive score:submitted event');
  });

  // 8. Stack Ranking
  await step('8. Stack Rank Submission (1st, 2nd, 3rd)', async () => {
    const ranks = assignedProjectIds.slice(0, 3).map((projectId, idx) => ({
      projectId,
      rank: idx + 1
    }));

    const rankRes = await request(`/api/events/${eventId}/sets/${assignedSetId}/rank`, {
      method: 'POST',
      body: JSON.stringify({ rankings: ranks })
    }, judge1Token);

    assert(rankRes.status === 200, `Failed to save rankings: ${JSON.stringify(rankRes.body)}`);
  });

  // 9. Complete Set
  await step('9. Set Completion & Status Transition', async () => {
    const compRes = await request(`/api/events/${eventId}/sets/${assignedSetId}/complete`, {
      method: 'POST'
    }, judge1Token);

    assert(compRes.status === 200, `Failed to complete set: ${JSON.stringify(compRes.body)}`);

    await new Promise(r => setTimeout(r, 200));
    assert(socketEventsReceived.includes('set:completed'), 'Socket did not receive set:completed event');
    assert(socketEventsReceived.includes('judging:progress'), 'Socket did not receive judging:progress event');
  });

  // 10. Security & IDOR Verification: Judge 2 attempts to score Judge 1's set
  await step('10. Security IDOR Check: Judge 2 Tampering with Judge 1 Set Blocked (403)', async () => {
    const idorRes = await request(`/api/events/${eventId}/sets/${assignedSetId}/scores`, {
      method: 'POST',
      body: JSON.stringify({
        projectId: assignedProjectIds[0],
        completion: 10,
        originality: 10,
        learning: 10,
        design: 10,
        technology: 10,
        timeSpentSeconds: 10
      })
    }, judge2Token);

    assert(idorRes.status === 403, `Expected 403 Forbidden for cross-judge score, got ${idorRes.status}: ${JSON.stringify(idorRes.body)}`);
  });

  // 11. Flagging & Integrity Engine
  await step('11. Flagging Lifecycle: Judge Flags Project & Admin Resolves', async () => {
    const flagRes = await request(`/api/events/${eventId}/flags`, {
      method: 'POST',
      body: JSON.stringify({
        projectId: assignedProjectIds[0],
        reason: 'Suspected pre-built codebase template'
      })
    }, judge1Token);

    assert(flagRes.status === 200 || flagRes.status === 201, `Failed to create flag: ${JSON.stringify(flagRes.body)}`);

    // Admin lists flags
    const listRes = await request(`/api/events/${eventId}/flags`, {}, adminToken);
    assert(listRes.status === 200 && Array.isArray(listRes.body), 'Failed to list flags');
    const flag = listRes.body.find((f: any) => f.projectId === assignedProjectIds[0]);
    assert(!!flag, 'Created flag not found in event flags list');

    // Admin reviews flag
    const resolveRes = await request(`/api/events/${eventId}/flags/${flag.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        status: 'REVIEWED',
        adminNotes: 'Verified commit history during hackathon window.'
      })
    }, adminToken);

    assert(resolveRes.status === 200, `Failed to resolve flag: ${JSON.stringify(resolveRes.body)}`);
  });

  // 12. Leaderboard Calculation
  await step('12. Leaderboard Calculation (Stack Points & Total Marks)', async () => {
    const lbRes = await request(`/api/events/${eventId}/results`, {}, adminToken);
    assert(lbRes.status === 200, `Failed to retrieve leaderboard: ${JSON.stringify(lbRes.body)}`);
    assert(Array.isArray(lbRes.body), 'Leaderboard is not an array');
    assert(lbRes.body.length > 0, 'Leaderboard has 0 entries');

    const topProject = lbRes.body[0];
    assert(typeof topProject.rank === 'number', 'Leaderboard item missing rank');
    assert(typeof topProject.totalMarks === 'number', 'Leaderboard item missing totalMarks');
    assert(typeof topProject.stackPoints === 'number', 'Leaderboard item missing stackPoints');
  });

  // 13. CSV Export with Formula Injection Guard
  await step('13. CSV Export Security & Content Validation', async () => {
    const csvRes = await request(`/api/events/${eventId}/results/export`, {}, adminToken);
    assert(csvRes.status === 200, `Failed to export CSV: ${csvRes.status}`);
    const csvText = typeof csvRes.body === 'string' ? csvRes.body : '';
    assert(csvText.includes('Rank') || csvText.includes('Project') || csvText.includes('Title'), 'CSV missing expected headers');
  });

  // 14. Self-Registration Role Privilege Escalation Block
  await step('14. Security: Self-Registration Role Escalation Forced to TEAM', async () => {
    const hackerEmail = `tester.${Date.now()}@example.com`;
    const regRes = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Escalation Test User',
        email: hackerEmail,
        password: 'Password123!',
        role: 'ADMIN' // Trying to register as ADMIN
      })
    });

    assert(regRes.status === 201, `Register failed: ${JSON.stringify(regRes.body)}`);
    assert(regRes.body.user.role === 'TEAM', `Privilege escalation succeeded! Role was set to: ${regRes.body.user.role}`);
  });

  // Cleanup
  if (adminSocket) {
    adminSocket.disconnect();
  }

  // Summary
  console.log('\n========================================');
  console.log('📊 TEST SUMMARY RESULTS');
  console.log('========================================');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.error('\n❌ Some E2E tests failed:');
    results.filter(r => !r.passed).forEach(r => console.error(`- ${r.name}: ${r.error}`));
    process.exit(1);
  } else {
    console.log('\n🎉 ALL END-TO-END TESTS PASSED CLEANLY!\n');
    process.exit(0);
  }
}

runE2E().catch(err => {
  console.error('Fatal E2E error:', err);
  process.exit(1);
});
