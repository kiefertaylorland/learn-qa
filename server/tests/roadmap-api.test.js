import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helper.js';
import { seasonalChallenges } from '../seasonContent.js';

test('season quests require current pool, persist rewards and do not farm XP', async (t) => {
  const f = await fixture(t),
    a = f.client();
  await a.guest();
  const catalog = (await a.request('/api/seasons/challenges')).data.challenges;
  const challenge = seasonalChallenges.find((c) => c.id === catalog[0].id);
  assert.equal(
    (await a.post('/api/attempts', { challengeId: challenge.id })).status,
    403,
  );
  const attempt = (
    await a.post('/api/attempts', { challengeId: challenge.id, seasonal: true })
  ).data;
  f.clock.time += 1000;
  const result = await a.post(`/api/attempts/${attempt.attemptId}/submit`, {
    answers: challenge.answers,
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.xpEarned, 0);
  let rewards = (await a.request('/api/rewards')).data;
  assert.equal(rewards.season.progress, 1);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await a.post('/api/seasons/claim', {
          season: rewards.season.id,
          tier: 1,
        })
      ).status,
      200,
    );
  rewards = (await a.request('/api/rewards')).data;
  assert.equal(rewards.balance, 75);
  assert.equal(
    (await a.post('/api/cosmetics/buy', { id: 'ocean' })).status,
    400,
  );
  await a.clear('bugs-1');
  assert.equal(
    (await a.post('/api/cosmetics/buy', { id: 'ocean' })).data.balance,
    25,
  );
  assert.equal(
    (await a.post('/api/cosmetics/buy', { id: 'ocean' })).data.balance,
    25,
  );
  assert.equal(
    (await a.post('/api/cosmetics/equip', { id: 'ocean' })).data.equipped,
    'ocean',
  );
  f.clock.time = Date.parse('2026-02-01');
  assert.equal((await a.request('/api/rewards')).data.season.progress, 0);
  assert.equal(
    (await a.post('/api/seasons/claim', { season: rewards.season.id, tier: 1 }))
      .status,
    400,
  );
});
test('friends require consent, use public codes, and can be removed', async (t) => {
  const f = await fixture(t),
    a = f.client(),
    b = f.client();
  const au = await a.guest();
  await b.guest();
  const code = (await b.request('/api/community')).data.publicId;
  const requested = await a.post('/api/friends/request', { code });
  assert.equal(requested.status, 200);
  assert.equal((await a.request('/api/community')).data.friends.length, 0);
  const incoming = (await b.request('/api/community')).data.incoming;
  assert.equal(incoming.length, 1);
  assert.notEqual(incoming[0].code, au.id);
  assert.equal(
    (
      await a.post('/api/friends/respond', {
        id: incoming[0].id,
        action: 'accept',
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await b.post('/api/friends/respond', {
        id: incoming[0].id,
        action: 'accept',
      })
    ).status,
    200,
  );
  await a.clear('bugs-1');
  assert.equal(
    (await b.request('/api/friends/leaderboard')).data.entries.length,
    1,
  );
  assert.equal((await a.post('/api/friends/remove', { code })).status, 200);
  assert.equal((await b.request('/api/community')).data.friends.length, 0);
});
test('public portfolio is opt-in, earned-only and revocable', async (t) => {
  const f = await fixture(t),
    a = f.client(),
    anon = f.client();
  await a.guest();
  const code = (await a.request('/api/community')).data.publicId;
  assert.equal((await anon.request(`/api/portfolio/${code}`)).status, 404);
  assert.equal(
    (
      await a.post('/api/portfolio', {
        enabled: true,
        achievementIds: ['all-domains'],
      })
    ).status,
    400,
  );
  await a.clear('bugs-1');
  assert.equal(
    (
      await a.post('/api/portfolio', {
        enabled: true,
        achievementIds: ['first-clear'],
      })
    ).status,
    200,
  );
  const publicData = (await anon.request(`/api/portfolio/${code}`)).data;
  assert.equal(publicData.achievements.length, 1);
  assert.ok(!/email|password|user_id|session/.test(JSON.stringify(publicData)));
  await a.post('/api/portfolio', { enabled: false, achievementIds: [] });
  assert.equal((await anon.request(`/api/portfolio/${code}`)).status, 404);
});
test('teams authorize membership and owners; tournament includes eligible results only', async (t) => {
  const f = await fixture(t),
    a = f.client(),
    b = f.client(),
    c = f.client();
  await a.guest();
  await b.guest();
  await c.guest();
  const team = (await a.post('/api/teams', { name: 'Quality guild' })).data;
  assert.ok(team.id);
  assert.equal((await c.request(`/api/teams/${team.id}`)).status, 404);
  assert.equal(
    (await b.post('/api/teams/join', { code: team.inviteCode })).status,
    200,
  );
  assert.equal(
    (
      await b.post(`/api/teams/${team.id}/tournaments`, {
        name: 'Sprint',
        durationHours: 24,
      })
    ).status,
    403,
  );
  await a.clear('bugs-1');
  const tournament = await a.post(`/api/teams/${team.id}/tournaments`, {
    name: 'Sprint',
    durationHours: 24,
  });
  assert.equal(tournament.status, 200);
  f.clock.time += 1000;
  await b.clear('bugs-1');
  const view = (await a.request(`/api/teams/${team.id}`)).data;
  assert.equal(view.tournaments[0].entries[0].score, 100);
  const member = view.members.find((m) => !m.isOwner);
  assert.equal(
    (
      await a.post(`/api/teams/${team.id}/members`, {
        action: 'remove',
        code: member.code,
      })
    ).status,
    200,
  );
  assert.equal((await b.request(`/api/teams/${team.id}`)).status, 404);
});
test('match lifecycle binds participants, delays answer disclosure and expires cleanly', async (t) => {
  const f = await fixture(t),
    a = f.client(),
    b = f.client(),
    outsider = f.client();
  await a.guest();
  await b.guest();
  await outsider.guest();
  const match = (await a.post('/api/matches', {})).data;
  assert.ok(match.id);
  assert.equal(
    (await outsider.request(`/api/matches/${match.id}`)).status,
    404,
  );
  assert.equal(
    (await b.post('/api/matches/join', { code: match.code })).status,
    200,
  );
  await a.post(`/api/matches/${match.id}/ready`, {});
  await b.post(`/api/matches/${match.id}/ready`, {});
  let view = (await a.request(`/api/matches/${match.id}`)).data;
  assert.ok(!JSON.stringify(view).includes('correctAnswers'));
  f.clock.time = view.startsAt + 1000;
  view = (await a.request(`/api/matches/${match.id}`)).data;
  assert.equal(view.questions.length, 3);
  const answers = view.questions.map((q) => ({
    questionId: q.id,
    options: [q.options[0].id],
  }));
  const submitted = await a.post(`/api/matches/${match.id}/submit`, {
    answers,
  });
  assert.equal(submitted.status, 200);
  assert.ok(!JSON.stringify(submitted.data).includes('correctAnswers'));
  assert.equal(
    (await outsider.post(`/api/matches/${match.id}/submit`, { answers }))
      .status,
    404,
  );
  assert.equal(
    (await a.post(`/api/matches/${match.id}/submit`, { answers })).status,
    200,
  );
  f.clock.time = view.endsAt;
  view = (await a.request(`/api/matches/${match.id}`)).data;
  assert.equal(view.status, 'finished');
  assert.equal(view.questions.length, 3);
  assert.ok(view.questions.every((q) => Array.isArray(q.correctAnswers)));
  assert.equal(view.players.find((p) => !p.submitted).accuracy, 0);
});

test('skill prerequisites are enforced server-side and all five domains can be cleared', async (t) => {
  const f = await fixture(t),
    a = f.client();
  await a.guest();
  assert.equal(
    (await a.post('/api/attempts', { challengeId: 'regression-1' })).status,
    403,
  );
  const { challenges } = await import('../content.js');
  let last;
  for (const q of challenges) {
    f.clock.time += 130000;
    last = await a.clear(q.id);
  }
  assert.equal(last.state.completed.length, 55);
  for (const id of [
    'quest-complete',
    'all-domains',
    'performance-patrol',
    'regression-master',
    'documentation-detective',
  ])
    assert.equal(last.state.achievements.find((a) => a.id === id).earned, true);
  assert.equal((await a.request('/api/rewards')).data.balance, 2750);
});
test('match refuses early, duplicate, malformed and late submissions; legitimate ties stay ties', async (t) => {
  const f = await fixture(t),
    a = f.client(),
    b = f.client();
  await a.guest();
  await b.guest();
  const m = (await a.post('/api/matches', {})).data;
  await b.post('/api/matches/join', { code: m.code });
  await a.post(`/api/matches/${m.id}/ready`, {});
  let v = (await b.post(`/api/matches/${m.id}/ready`, {})).data;
  assert.equal(
    (await a.post(`/api/matches/${m.id}/submit`, { answers: [] })).status,
    409,
  );
  f.clock.time = v.startsAt + 1000;
  v = (await a.request(`/api/matches/${m.id}`)).data;
  assert.equal(
    (
      await a.post(`/api/matches/${m.id}/submit`, {
        answers: [null, null, null],
      })
    ).status,
    400,
  );
  const privateQuestions = JSON.parse(
    f.db.prepare('SELECT questions FROM matches WHERE id=?').get(m.id)
      .questions,
  );
  const answers = privateQuestions.map((q) => ({
    questionId: q.id,
    options: q.correctAnswers,
  }));
  assert.equal(
    (await a.post(`/api/matches/${m.id}/submit`, { answers })).data.status,
    'playing',
  );
  const result = (await b.post(`/api/matches/${m.id}/submit`, { answers }))
    .data;
  assert.equal(result.status, 'finished');
  assert.equal(result.winner, null);
  assert.ok(result.players.every((p) => p.accuracy === 100));
  const repeat = (await a.post(`/api/matches/${m.id}/submit`, { answers: [] }))
    .data;
  assert.ok(repeat.players.every((p) => p.accuracy === 100));
});
test('team invitations expire, rotate, and ownership can be transferred', async (t) => {
  const f = await fixture(t),
    a = f.client(),
    b = f.client();
  await a.guest();
  await b.guest();
  let team = (await a.post('/api/teams', { name: 'QA team' })).data;
  const old = team.inviteCode;
  team = (await a.post(`/api/teams/${team.id}/invite`, {})).data;
  assert.equal((await b.post('/api/teams/join', { code: old })).status, 404);
  await b.post('/api/teams/join', { code: team.inviteCode });
  team = (await a.request(`/api/teams/${team.id}`)).data;
  const bCode = team.members.find((m) => !m.isOwner).code;
  assert.equal(
    (await a.post(`/api/teams/${team.id}/members`, { action: 'leave' })).status,
    400,
  );
  await a.post(`/api/teams/${team.id}/members`, {
    action: 'transfer',
    code: bCode,
  });
  assert.equal((await a.post(`/api/teams/${team.id}/invite`, {})).status, 403);
  assert.equal(
    (await a.post(`/api/teams/${team.id}/members`, { action: 'leave' })).status,
    200,
  );
  f.clock.time += 8 * 86400000;
  assert.equal(
    (await a.post('/api/teams/join', { code: team.inviteCode })).status,
    404,
  );
});

test('new private routes require authentication and exact origin', async (t) => {
  const f = await fixture(t),
    a = f.client();
  for (const route of [
    '/api/community',
    '/api/rewards',
    '/api/friends/leaderboard',
    '/api/seasons/challenges',
    '/api/teams/missing',
    '/api/matches/missing',
  ])
    assert.equal((await a.request(route)).status, 401, route);
  await a.guest();
  for (const route of [
    '/api/friends/request',
    '/api/teams',
    '/api/matches',
    '/api/portfolio',
    '/api/cosmetics/buy',
    '/api/seasons/claim',
  ])
    assert.equal(
      (await a.post(route, {}, { Origin: 'https://foreign.invalid' })).status,
      403,
      route,
    );
});

test('new rewards, teams, match lobbies and portfolio settings survive restart', async (t) => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = mkdtempSync(join(tmpdir(), 'qa-roadmap-persistence-'));
  const databasePath = join(directory, 'quest.sqlite');
  const first = await fixture(t, { databasePath }),
    a = first.client();
  await a.guest();
  await a.clear('bugs-1');
  await a.clear('bugs-2');
  await a.post('/api/cosmetics/buy', { id: 'ocean' });
  await a.post('/api/cosmetics/equip', { id: 'ocean' });
  const team = (await a.post('/api/teams', { name: 'Persistent team' })).data;
  const match = (await a.post('/api/matches', {})).data;
  await a.post('/api/portfolio', {
    enabled: true,
    achievementIds: ['first-clear'],
  });
  const publicId = (await a.request('/api/community')).data.publicId;
  await first.close();
  const second = await fixture(t, { databasePath }),
    restored = second.client(a.cookie);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.equal((await restored.request('/api/rewards')).data.equipped, 'ocean');
  assert.equal((await restored.request('/api/rewards')).data.balance, 0);
  assert.equal(
    (await restored.request(`/api/teams/${team.id}`)).data.name,
    'Persistent team',
  );
  assert.equal(
    (await restored.request(`/api/matches/${match.id}`)).data.code,
    match.code,
  );
  assert.equal(
    (await second.client().request(`/api/portfolio/${publicId}`)).data
      .achievements[0].id,
    'first-clear',
  );
});

test('season attempt creation is atomic with its season marker', async (t) => {
  const f = await fixture(t),
    a = f.client();
  await a.guest();
  const q = (await a.request('/api/seasons/challenges')).data.challenges[0];
  f.db.exec(
    "CREATE TRIGGER reject_season BEFORE INSERT ON season_attempts BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;",
  );
  assert.equal(
    (await a.post('/api/attempts', { challengeId: q.id, seasonal: true }))
      .status,
    500,
  );
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n, 0);
});
