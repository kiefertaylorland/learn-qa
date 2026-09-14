import {
  emptyRewards,
  rewardView,
  buyCosmetic,
  equipCosmetic,
  claimTier,
  seasonFor,
} from '../shared/progression.js';

export function createRewards({
  db,
  app,
  requireAuth,
  body,
  completedIds,
  now,
}) {
  db.exec(`CREATE TABLE IF NOT EXISTS player_rewards (user_id TEXT PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS season_attempts (attempt_id TEXT PRIMARY KEY REFERENCES attempts(id), season TEXT NOT NULL);`);
  const load = (id) => {
    const row = db
      .prepare('SELECT data FROM player_rewards WHERE user_id=?')
      .get(id);
    return row ? JSON.parse(row.data) : emptyRewards();
  };
  const save = (id, data) =>
    db
      .prepare(
        'INSERT INTO player_rewards VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data',
      )
      .run(id, JSON.stringify(data));
  const view = (id) => rewardView(load(id), completedIds(id), now());
  app.get('/api/rewards', requireAuth, (req, res) =>
    res.json(view(req.user.id)),
  );
  for (const [route, keys, action] of [
    [
      '/cosmetics/buy',
      ['id'],
      (r, v, id) => buyCosmetic(r, completedIds(id), v.id, now()),
    ],
    ['/cosmetics/equip', ['id'], (r, v) => equipCosmetic(r, v.id)],
    [
      '/seasons/claim',
      ['season', 'tier'],
      (r, v) => claimTier(r, v.season, v.tier, now()),
    ],
  ])
    app.post(`/api${route}`, requireAuth, (req, res) => {
      const value = body(req, keys);
      db.exec('BEGIN IMMEDIATE');
      try {
        const records = load(req.user.id);
        action(records, value, req.user.id);
        save(req.user.id, records);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      res.json(view(req.user.id));
    });
  return {
    view,
    markAttempt(attemptId, season) {
      db.prepare('INSERT INTO season_attempts VALUES (?,?)').run(
        attemptId,
        season,
      );
    },
    seasonOf(attemptId) {
      return db
        .prepare('SELECT season FROM season_attempts WHERE attempt_id=?')
        .get(attemptId)?.season;
    },
    complete(userId, attemptId, challengeId) {
      const season = this.seasonOf(attemptId);
      if (!season || season !== seasonFor(now()).id) return;
      const records = load(userId);
      if (
        !records.seasonal.some(
          (r) => r.season === season && r.challengeId === challengeId,
        )
      ) {
        records.seasonal.push({ season, challengeId });
        save(userId, records);
      }
    },
  };
}
