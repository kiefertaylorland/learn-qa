import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createApp } from '../app.js';
import { challenges, challengeById } from '../content.js';

const DAY = 86_400_000;
const PASSWORD = 'Long test passphrase 42!';

async function fixture(t, options = {}) {
  const clock = { time: Date.parse('2026-01-05T12:00:00Z') };
  const api = createApp({ databasePath: ':memory:', now: () => clock.time, ...options });
  api.server.listen(0, '127.0.0.1');
  await once(api.server, 'listening');
  const base = `http://127.0.0.1:${api.server.address().port}`;
  t.after(() => api.close());
  function client(initialCookie = '') {
    let cookie = initialCookie;
    return {
      get cookie() { return cookie; },
      async request(route, { method = 'GET', body, headers = {} } = {}) {
        const response = await fetch(`${base}${route}`, {
          method,
          headers: { Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return { status: response.status, data: await response.json(), headers: response.headers };
      },
      post(route, body = {}, headers) { return this.request(route, { method: 'POST', body, headers }); },
      async guest() {
        const response = await this.post('/api/auth/guest');
        assert.equal(response.status, 201);
        return response.data.user;
      },
      async start(id, daily = false) {
        const response = await this.post('/api/attempts', { challengeId: id, daily });
        assert.ok([200, 201].includes(response.status), JSON.stringify(response.data));
        return response.data;
      },
      async submit(attempt, answers = challengeById.get(attempt.challenge.id).answers) {
        return this.post(`/api/attempts/${attempt.attemptId}/submit`, { answers });
      },
      async clear(id, daily = false) {
        const attempt = await this.start(id, daily);
        clock.time += 1000;
        const response = await this.submit(attempt);
        assert.equal(response.status, 200);
        assert.equal(response.data.correct, true);
        return response.data;
      },
    };
  }
  return { ...api, clock, base, client };
}

test('original modes retain ten distinct meaningful levels', () => {
  assert.equal(challenges.length, 55);
  assert.equal(new Set(challenges.map((challenge) => challenge.title)).size, 55);
  assert.equal(new Set(challenges.map((challenge) => challenge.prompt)).size, 55);
  for (const mode of ['bugs', 'tests']) {
    const items = challenges.filter((challenge) => challenge.mode === mode);
    assert.deepEqual(items.map((challenge) => challenge.level), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const item of items) {
      assert.ok(item.durationSeconds >= 120 && item.durationSeconds <= 180);
      assert.ok(item.explanation.length > 100);
      assert.ok(item.answers.length > 1 && item.answers.length < item.options.length);
      assert.ok(item.answers.every((id) => item.options.some((option) => option.id === id)));
    }
  }
});

test('authentication is required and challenge catalogs never expose grading keys', async (t) => {
  const api = await fixture(t);
  const player = api.client();
  assert.deepEqual((await player.request('/api/me')).data, { user: null });
  for (const route of ['/api/state', '/api/challenges', '/api/daily']) {
    assert.equal((await player.request(route)).status, 401);
  }
  assert.deepEqual((await player.request('/api/leaderboard')).data.entries, []);
  await player.guest();
  const catalog = await player.request('/api/challenges');
  assert.equal(catalog.data.challenges.length, 55);
  assert.deepEqual(catalog.data.challenges.filter((item) => item.unlocked).map((item) => item.id), ['bugs-1', 'tests-1']);
  assert.ok(!/answers|explanation|prompt|options/i.test(JSON.stringify(catalog.data)));
  const attempt = await player.start('bugs-1');
  assert.ok(!/correctAnswers|"answers"|"explanation"/.test(JSON.stringify(attempt)));
  assert.equal(new Date(attempt.expiresAt) - new Date(attempt.startedAt), 120_000);
  assert.match(catalog.headers.get('cache-control'), /no-store/);
  assert.equal(catalog.headers.get('x-content-type-options'), 'nosniff');
});

test('guest upgrades retain progress, rotate credentials, and can sign in after logout', async (t) => {
  const api = await fixture(t);
  const player = api.client();
  const guest = await player.guest();
  const oldCookie = player.cookie;
  const clear = await player.clear('bugs-1');
  const registered = await player.post('/api/auth/register', { name: '  Ada QA  ', email: 'ADA@example.com', password: PASSWORD });
  assert.equal(registered.status, 201);
  assert.deepEqual(registered.data.user, { id: guest.id, name: 'Ada QA' });
  assert.notEqual(player.cookie, oldCookie);
  assert.match(registered.headers.get('set-cookie'), /HttpOnly/);
  assert.match(registered.headers.get('set-cookie'), /SameSite=Strict/);
  assert.equal((await api.client(oldCookie).request('/api/state')).status, 401);
  const state = (await player.request('/api/state')).data;
  assert.equal(state.profile.isGuest, false);
  assert.equal(state.profile.xp, clear.state.profile.xp);
  assert.deepEqual(state.completed, ['bugs-1']);
  const stored = api.db.prepare('SELECT * FROM users WHERE id = ?').get(guest.id);
  assert.equal(stored.email, 'ada@example.com');
  assert.notEqual(stored.password_hash, PASSWORD);
  assert.equal(stored.password_hash.length, 128);
  assert.ok(!JSON.stringify(api.db.prepare('SELECT * FROM sessions').all()).includes(player.cookie.split('=')[1]));
  const upgradedCookie = player.cookie;
  assert.deepEqual((await player.post('/api/auth/logout')).data, {});
  assert.equal((await api.client(upgradedCookie).request('/api/state')).status, 401);
  assert.equal((await player.post('/api/auth/login', { email: 'ada@example.com', password: 'incorrect password' })).status, 401);
  const loggedIn = await player.post('/api/auth/login', { email: 'ada@example.com', password: PASSWORD });
  assert.equal(loggedIn.status, 200);
  assert.equal(loggedIn.data.user.id, guest.id);
  assert.equal((await player.request('/api/state')).data.profile.xp, state.profile.xp);
  api.clock.time += 31 * DAY;
  assert.deepEqual((await player.request('/api/me')).data, { user: null });
});

test('same-origin, media-type, JSON, and credential validation reject unsafe requests', async (t) => {
  const api = await fixture(t);
  const player = api.client();
  assert.equal((await player.post('/api/auth/guest', {}, { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await player.post('/api/auth/guest', {}, { Origin: '' })).status, 403);
  assert.equal((await player.post('/api/auth/guest', {}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await player.post('/api/auth/guest', {}, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await player.post('/api/auth/guest', { extra: 1 })).status, 400);
  assert.equal((await player.post('/api/auth/guest', [])).status, 400);
  assert.equal((await player.post('/api/auth/register', { name: '<b>Ada</b>', email: 'ada@example.com', password: PASSWORD })).status, 400);
  assert.equal((await player.post('/api/auth/register', { name: 'Ada', email: 'not-an-email', password: PASSWORD })).status, 400);
  assert.equal((await player.post('/api/auth/register', { name: 'Ada', email: 'ada@example.com', password: 'short' })).status, 400);
  assert.equal((await player.post('/api/auth/login', { email: 'ada@example.com', password: 'x'.repeat(129) })).status, 400);
  const malformed = await fetch(`${api.base}/api/auth/guest`, { method: 'POST', headers: { Origin: api.base, 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: 'Invalid JSON.' });
  const oversized = await player.post('/api/auth/guest', { value: 'x'.repeat(9000) });
  assert.equal(oversized.status, 413);
  assert.equal((await player.request('/api/missing')).status, 404);
});

test('production sessions use secure host-only cookies and honor explicit public origin', async (t) => {
  const api = await fixture(t, { production: true, origin: 'https://quest.example' });
  const player = api.client();
  assert.equal((await player.post('/api/auth/guest')).status, 403);
  const response = await player.post('/api/auth/guest', {}, { Origin: 'https://quest.example' });
  assert.equal(response.status, 201);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /^__Host-qa_session=/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; Path=\//);
  assert.ok(!cookie.includes('Domain='));
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
  assert.equal((await player.request('/api/challenges')).status, 200);
});

test('production serves the SPA for navigation but never turns missing APIs or assets into HTML', async (t) => {
  const api = await fixture(t, { production: true, distDir: path.resolve('server/tests/fixtures') });
  for (const route of ['/', '/quest/challenges']) {
    const response = await fetch(`${api.base}${route}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /QA Quest test shell/);
  }
  for (const route of ['/api/unknown', '/missing.js', '/server/content.js', '/.env']) {
    const response = await fetch(`${api.base}${route}`);
    assert.equal(response.status, 404);
    assert.equal(typeof (await response.json()).error, 'string');
  }
});

test('login failures are generic and per-account brute-force attempts are bounded', async (t) => {
  const api = await fixture(t);
  const player = api.client();
  await player.post('/api/auth/register', { name: 'Ada', email: 'ada@example.com', password: PASSWORD });
  await player.post('/api/auth/logout');
  const known = await player.post('/api/auth/login', { email: 'ada@example.com', password: 'wrong' });
  const unknown = await player.post('/api/auth/login', { email: 'nobody@example.com', password: 'wrong' });
  assert.equal(known.status, 401);
  assert.deepEqual(known.data, unknown.data);
  for (let i = 0; i < 9; i += 1) assert.equal((await player.post('/api/auth/login', { email: 'ada@example.com', password: 'wrong' })).status, 401);
  const limited = await player.post('/api/auth/login', { email: 'ada@example.com', password: PASSWORD });
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get('retry-after'));
  api.clock.time += 15 * 60_000;
  assert.equal((await player.post('/api/auth/login', { email: 'ada@example.com', password: PASSWORD })).status, 200);
});

test('registration attempts are rate-limited per normalized email and reset after the window', async (t) => {
  const api = await fixture(t);
  const emails = ['ADA@example.com', 'ada@example.com', 'Ada@example.com', 'ADA@example.com', 'ada@example.com', 'Ada@example.com'];
  for (const [index, email] of emails.entries()) {
    const response = await api.client().post('/api/auth/register', { name: `Ada ${index}`, email, password: PASSWORD });
    assert.equal(response.status, 201);
    api.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(response.data.user.id);
    api.db.prepare('DELETE FROM users WHERE id = ?').run(response.data.user.id);
  }
  const limited = await api.client().post('/api/auth/register', { name: 'Ada 6', email: 'aDa@example.com', password: PASSWORD });
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get('retry-after'));
  api.clock.time += 15 * 60_000;
  assert.equal((await api.client().post('/api/auth/register', { name: 'Ada 7', email: 'AdA@example.com', password: PASSWORD })).status, 201);
});

test('only one live attempt is allowed; attempts and answers are user-scoped and validated', async (t) => {
  const api = await fixture(t);
  const player = api.client();
  const other = api.client();
  await player.guest();
  await other.guest();
  assert.equal((await player.post('/api/attempts', { challengeId: 'bugs-2', daily: false })).status, 403);
  assert.equal((await player.post('/api/attempts', { challengeId: 'bugs-1', daily: 'false' })).status, 400);
  assert.equal((await player.post('/api/attempts', { challengeId: '__proto__' })).status, 400);
  assert.equal((await player.post('/api/attempts', { challengeId: 'bugs-1', startedAt: 0 })).status, 400);
  const attempt = await player.start('bugs-1');
  assert.deepEqual(await player.start('bugs-1'), attempt);
  assert.equal((await player.post('/api/attempts', { challengeId: 'tests-1' })).status, 409);
  assert.equal((await other.submit(attempt)).status, 404);
  for (const answers of ['option-1', null, [null], ['option-1', 'option-1'], ['unknown'], Array(9).fill('option-1')]) {
    assert.equal((await player.post(`/api/attempts/${attempt.attemptId}/submit`, { answers })).status, 400);
  }
  assert.equal((await player.submit(attempt)).status, 200);
  assert.equal((await player.start('tests-1')).challenge.id, 'tests-1');
});

test('wrong answers allow retry; concurrent and repeated submissions award XP only once', async (t) => {
  const api = await fixture(t);
  const player = api.client();
  const user = await player.guest();
  const wrongAttempt = await player.start('bugs-1');
  const wrong = await player.submit(wrongAttempt, []);
  assert.equal(wrong.data.correct, false);
  assert.equal(wrong.data.accuracy, 0);
  assert.equal(wrong.data.xpEarned, 0);
  assert.deepEqual(wrong.data.correctAnswers, challengeById.get('bugs-1').answers);
  assert.ok(wrong.data.explanation.length > 100);
  assert.deepEqual((await player.submit(wrongAttempt)).data, wrong.data);
  const retry = await player.start('bugs-1');
  api.clock.time += 10_000;
  const [first, second] = await Promise.all([player.submit(retry), player.submit(retry)]);
  assert.deepEqual(first.data, second.data);
  assert.equal(first.data.correct, true);
  assert.equal(first.data.accuracy, 100);
  assert.equal(first.data.state.profile.xp, first.data.xpEarned);
  assert.equal(first.data.state.profile.level, Math.floor(first.data.xpEarned / 500) + 1);
  assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM xp_events WHERE user_id = ?').get(user.id).n, 1);
  assert.equal(first.data.state.stats.attempts, 2);
  assert.equal(first.data.state.stats.accuracy, 50);
  assert.equal(first.data.state.achievements.find((award) => award.id === 'perfectionist').earned, false);
  const replay = await player.clear('bugs-1');
  assert.equal(replay.xpEarned, 0);
  assert.match(replay.explanation, /no repeat-clear XP/);
  assert.equal(replay.state.profile.xp, first.data.xpEarned);
});

test('partial accuracy penalizes over-selection and expired attempts cannot earn XP', async (t) => {
  const api = await fixture(t);
  const player = api.client();
  await player.guest();
  const allSelected = await player.start('bugs-1');
  const partial = await player.submit(allSelected, allSelected.challenge.options.map((option) => option.id));
  assert.equal(partial.data.correct, false);
  assert.equal(partial.data.accuracy, 50);
  const timed = await player.start('bugs-1');
  api.clock.time = Date.parse(timed.expiresAt);
  const state = (await player.request('/api/state')).data;
  assert.equal(state.stats.attempts, 2);
  assert.equal(state.stats.accuracy, 25);
  const expired = await player.submit(timed);
  assert.equal(expired.status, 200);
  assert.equal(expired.data.correct, false);
  assert.equal(expired.data.accuracy, 0);
  assert.equal(expired.data.xpEarned, 0);
  assert.match(expired.data.explanation, /Time expired/);
  assert.deepEqual(expired.data.state.completed, []);
  assert.deepEqual((await player.submit(timed)).data, expired.data);
  assert.notEqual((await player.start('bugs-1')).attemptId, timed.attemptId);
});

test('all twenty levels unlock independently and achievements reflect real completions', async (t) => {
  const api = await fixture(t);
  const player = api.client();
  await player.guest();
  let result;
  for (let level = 1; level <= 10; level += 1) result = await player.clear(`bugs-${level}`);
  let catalog = (await player.request('/api/challenges')).data.challenges;
  assert.equal(catalog.find((item) => item.id === 'tests-2').unlocked, false);
  assert.equal(result.state.modeProgress.bugs.completed, 10);
  for (let level = 1; level <= 10; level += 1) result = await player.clear(`tests-${level}`);
  assert.equal(result.state.stats.completed, 20);
  assert.equal(result.state.stats.attempts, 20);
  assert.equal(result.state.stats.accuracy, 100);
  assert.equal(result.state.profile.level, Math.floor(result.state.profile.xp / 500) + 1);
  assert.deepEqual(result.state.modeProgress.bugs, { completed: 10, total: 10 });
  assert.deepEqual(result.state.modeProgress.tests, { completed: 10, total: 10 });
  for (const id of ['first-clear', 'bug-spotter', 'test-master', 'perfectionist', 'speed-demon', 'quest-complete']) {
    assert.equal(result.state.achievements.find((award) => award.id === id).earned, true);
  }
  catalog = (await player.request('/api/challenges')).data.challenges;
  assert.ok(catalog.filter(item=>['bugs','tests'].includes(item.mode)).every((item) => item.completed && item.unlocked));
});

test('daily rotation is global, permits locked challenges, and awards a bonus once per UTC day', async (t) => {
  const api = await fixture(t);
  const player = api.client();
  const other = api.client();
  await player.guest();
  await other.guest();
  const daily = (await player.request('/api/daily')).data;
  assert.deepEqual((await other.request('/api/daily')).data, daily);
  assert.equal(daily.bonusXp, 150);
  const notDaily = challenges.find((challenge) => challenge.id !== daily.challengeId);
  assert.equal((await player.post('/api/attempts', { challengeId: notDaily.id, daily: true })).status, 403);
  const result = await player.clear(daily.challengeId, true);
  assert.ok(result.xpEarned > 150);
  assert.match(result.explanation, /once-per-UTC-day/);
  assert.equal((await player.request('/api/daily')).data.completed, true);
  assert.equal((await other.request('/api/daily')).data.completed, false);
  const replay = await player.clear(daily.challengeId, true);
  assert.equal(replay.xpEarned, 0);
  assert.equal(replay.state.profile.xp, result.state.profile.xp);
  assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM daily_rewards').get().n, 1);
  const catalog = (await player.request('/api/challenges')).data.challenges;
  const dailyItem = challengeById.get(daily.challengeId);
  if (dailyItem.level > 1 && dailyItem.level < 10) {
    assert.equal(catalog.find((item) => item.id === `${dailyItem.mode}-${dailyItem.level + 1}`).unlocked, false);
  }
  api.clock.time += DAY;
  const tomorrow = (await player.request('/api/daily')).data;
  assert.notEqual(tomorrow.challengeId, daily.challengeId);
  assert.equal(tomorrow.completed, false);
});

test('daily attempts crossing midnight do not claim a bonus for either day', async (t) => {
  const api = await fixture(t);
  const player = api.client();
  await player.guest();
  api.clock.time = Date.parse('2026-01-05T23:59:59Z');
  const daily = (await player.request('/api/daily')).data;
  const attempt = await player.start(daily.challengeId, true);
  api.clock.time += 2000;
  const result = await player.submit(attempt);
  assert.equal(result.data.correct, true);
  assert.match(result.data.explanation, /daily date changed/);
  assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM daily_rewards').get().n, 0);
  const today = (await player.request('/api/daily')).data;
  assert.equal(today.completed, false);
  const todayResult = await player.clear(today.challengeId, true);
  assert.match(todayResult.explanation, /once-per-UTC-day/);
  assert.equal(api.db.prepare('SELECT date FROM daily_rewards').get().date, '2026-01-06');
});

test('streaks use UTC dates, preserve earned badges, and reset after missed days', async (t) => {
  const api = await fixture(t);
  const player = api.client();
  await player.guest();
  api.clock.time = Date.parse('2026-01-05T23:59:58Z');
  let result = await player.clear('bugs-1');
  assert.equal(result.state.profile.streak, 1);
  api.clock.time = Date.parse('2026-01-06T00:00:01Z');
  result = await player.clear('bugs-1');
  assert.equal(result.state.profile.streak, 2);
  result = await player.clear('bugs-1');
  assert.equal(result.state.profile.streak, 2);
  for (let day = 0; day < 5; day += 1) {
    api.clock.time += DAY;
    result = await player.clear('bugs-1');
  }
  assert.equal(result.state.profile.streak, 7);
  assert.equal(result.state.achievements.find((award) => award.id === 'seven-day-warrior').earned, true);
  api.clock.time += 2 * DAY;
  assert.equal((await player.request('/api/state')).data.profile.streak, 0);
  result = await player.clear('bugs-1');
  assert.equal(result.state.profile.streak, 1);
  assert.equal(result.state.achievements.find((award) => award.id === 'seven-day-warrior').earned, true);
});

test('weekly leaderboard uses real events, valid filters, successful speed samples, and public ids', async (t) => {
  const api = await fixture(t);
  const player = api.client();
  const other = api.client();
  const user = await player.guest();
  await other.guest();
  assert.deepEqual((await player.request('/api/leaderboard')).data.entries, []);
  await player.clear('bugs-1');
  const wrong = await other.start('bugs-1');
  await other.submit(wrong, []);
  let board = (await player.request('/api/leaderboard')).data;
  assert.equal(board.week, '2026-01-05');
  assert.equal(board.entries.length, 1);
  assert.equal(board.entries[0].name, user.name);
  assert.notEqual(board.entries[0].id, user.id);
  assert.equal(board.entries[0].isCurrentUser, true);
  assert.equal(board.entries[0].rank, 1);
  assert.deepEqual(Object.keys(board.entries[0]).sort(), ['accuracy', 'id', 'isCurrentUser', 'level', 'name', 'rank', 'speed', 'xp'].sort());
  assert.equal((await player.request('/api/leaderboard?category=speed')).data.entries.length, 1);
  assert.deepEqual((await player.request('/api/leaderboard?category=accuracy')).data.entries, []);
  await player.clear('bugs-2');
  await player.clear('bugs-3');
  board = (await player.request('/api/leaderboard?category=accuracy&range=1-5')).data;
  assert.equal(board.entries.length, 1);
  assert.equal(board.entries[0].accuracy, 100);
  assert.equal(board.entries[0].speed, 1);
  assert.deepEqual((await player.request('/api/leaderboard?range=31%2B')).data.entries, []);
  for (const query of ['category=unknown', 'range=__proto__', 'range=2-6', 'category=xp&category=speed']) {
    assert.equal((await player.request(`/api/leaderboard?${query}`)).status, 400);
  }
  api.clock.time += 7 * DAY;
  assert.deepEqual((await player.request('/api/leaderboard')).data.entries, []);
  assert.equal((await player.request('/api/state')).data.stats.weeklyXp, 0);
});

test('WebSocket sends only leaderboard invalidations and rejects foreign origins', async (t) => {
  const api = await fixture(t);
  const player = api.client();
  await player.guest();
  const ws = new WebSocket(api.base.replace('http:', 'ws:') + '/live', { origin: api.base });
  await once(ws, 'open');
  t.after(() => ws.terminate());
  const message = once(ws, 'message');
  await player.clear('bugs-1');
  assert.deepEqual(JSON.parse((await message)[0].toString()), { type: 'leaderboard' });
  const rejected = new WebSocket(api.base.replace('http:', 'ws:') + '/live', { origin: 'https://attacker.example' });
  rejected.on('error', () => {});
  const [, response] = await once(rejected, 'unexpected-response');
  assert.equal(response.statusCode, 403);
  rejected.terminate();
});

test('SQLite preserves sessions, pending clocks, rewards, and idempotent results across restart', async (t) => {
  const directory = path.resolve('server', `.test-data-${randomUUID()}`);
  mkdirSync(directory, { mode: 0o700 });
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, 'quest.sqlite');
  const first = await fixture(t, { databasePath });
  const player = first.client();
  await player.guest();
  const result = await player.clear('bugs-1');
  const pending = await player.start('tests-1');
  const cookie = player.cookie;
  const savedClock = first.clock.time;
  await first.close();
  const second = await fixture(t, { databasePath, now: () => savedClock });
  const resumed = second.client(cookie);
  const state = (await resumed.request('/api/state')).data;
  assert.equal(state.profile.xp, result.state.profile.xp);
  assert.deepEqual(state.completed, ['bugs-1']);
  assert.deepEqual(await resumed.start('tests-1'), pending);
  const submission = await resumed.submit(pending);
  assert.equal(submission.data.correct, true);
  assert.equal(submission.data.state.completed.length, 2);
  await second.close();
});
