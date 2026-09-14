import { randomUUID, randomBytes } from 'node:crypto';
import { achievementDefinitions } from './content.js';
import { mountTeams } from './teams.js';
import { mountMatches } from './matches.js';
const DAY = 86400000;
export function mountCommunity({ app, db, requireAuth, body, now, limit }) {
  const run = (sql, ...p) => db.prepare(sql).run(...p),
    get = (sql, ...p) => db.prepare(sql).get(...p),
    all = (sql, ...p) => db.prepare(sql).all(...p);
  const fail = (status, message) =>
    Object.assign(new Error(message), { status });
  const code = () => randomBytes(12).toString('hex');
  const name = (value) => {
    if (
      typeof value !== 'string' ||
      value.trim().length < 2 ||
      value.trim().length > 60 ||
      /[\p{C}<>]/u.test(value)
    )
      throw fail(400, 'Use a name of 2–60 characters.');
    return value.trim();
  };
  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const userByCode = (value) =>
    typeof value === 'string'
      ? get('SELECT id,public_id,name FROM users WHERE public_id=?', value)
      : null;
  db.exec(`CREATE TABLE IF NOT EXISTS friendships (id TEXT PRIMARY KEY, sender TEXT NOT NULL REFERENCES users(id), recipient TEXT NOT NULL REFERENCES users(id), accepted INTEGER NOT NULL DEFAULT 0, UNIQUE(sender,recipient));
 CREATE TABLE IF NOT EXISTS portfolios (user_id TEXT PRIMARY KEY REFERENCES users(id), enabled INTEGER NOT NULL, achievements TEXT NOT NULL);`);
  const friends = (id) =>
    all(
      `SELECT u.public_id AS code,u.name FROM friendships f JOIN users u ON u.id=CASE WHEN f.sender=? THEN f.recipient ELSE f.sender END WHERE (f.sender=? OR f.recipient=?) AND f.accepted=1`,
      id,
      id,
      id,
    );
  const ctx = {
    app,
    db,
    requireAuth,
    body,
    now,
    limit,
    run,
    get,
    all,
    fail,
    code,
    name,
    transaction,
    userByCode,
  };
  const teams = mountTeams(ctx),
    matches = mountMatches(ctx);
  app.get('/api/community', requireAuth, (req, res) => {
    const id = req.user.id;
    res.json({
      publicId: req.user.public_id,
      friends: friends(id),
      incoming: all(
        'SELECT f.id,u.public_id AS code,u.name FROM friendships f JOIN users u ON u.id=f.sender WHERE f.recipient=? AND f.accepted=0',
        id,
      ),
      outgoing: all(
        'SELECT f.id,u.public_id AS code,u.name FROM friendships f JOIN users u ON u.id=f.recipient WHERE f.sender=? AND f.accepted=0',
        id,
      ),
      teams: teams.list(id),
      matches: matches.list(id),
      portfolio: get(
        'SELECT enabled,achievements FROM portfolios WHERE user_id=?',
        id,
      ) || { enabled: 0, achievements: '[]' },
    });
  });
  app.post('/api/friends/request', requireAuth, (req, res) => {
    limit(`friend:${req.user.id}`, 30, DAY);
    const target = userByCode(body(req, ['code']).code);
    if (!target || target.id === req.user.id)
      throw fail(400, 'Enter another explorer’s public code.');
    if (
      !get(
        'SELECT 1 FROM friendships WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',
        req.user.id,
        target.id,
        target.id,
        req.user.id,
      )
    )
      run(
        'INSERT INTO friendships VALUES (?,?,?,0)',
        randomUUID(),
        req.user.id,
        target.id,
      );
    res.json({ ok: true });
  });
  app.post('/api/friends/respond', requireAuth, (req, res) => {
    const { id, action } = body(req, ['id', 'action']);
    if (typeof id !== 'string' || !['accept', 'reject'].includes(action))
      throw fail(400, 'Choose accept or reject.');
    if (
      !get(
        'SELECT 1 FROM friendships WHERE id=? AND recipient=? AND accepted=0',
        id,
        req.user.id,
      )
    )
      throw fail(404, 'Invitation not found.');
    if (action === 'accept')
      run('UPDATE friendships SET accepted=1 WHERE id=?', id);
    else run('DELETE FROM friendships WHERE id=?', id);
    res.json({ ok: true });
  });
  app.post('/api/friends/remove', requireAuth, (req, res) => {
    const target = userByCode(body(req, ['code']).code);
    if (!target) throw fail(404, 'Explorer not found.');
    run(
      'DELETE FROM friendships WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',
      req.user.id,
      target.id,
      target.id,
      req.user.id,
    );
    res.json({ ok: true });
  });
  app.get('/api/friends/leaderboard', requireAuth, (req, res) => {
    const day = Math.floor(now() / DAY),
      start = (day - ((new Date(now()).getUTCDay() + 6) % 7)) * DAY;
    const allowed = new Set([
      req.user.public_id,
      ...friends(req.user.id).map((f) => f.code),
    ]);
    const entries = all(
      `SELECT u.public_id AS id,u.name,u.xp, SUM(e.amount) AS weekly FROM xp_events e JOIN users u ON u.id=e.user_id WHERE earned_at>=? AND earned_at<? GROUP BY u.id ORDER BY weekly DESC,u.public_id`,
      start,
      start + 7 * DAY,
    )
      .filter((r) => allowed.has(r.id))
      .map((r, i) => ({
        id: r.id,
        name: r.name,
        level: Math.floor(r.xp / 500) + 1,
        xp: r.weekly,
        rank: i + 1,
        isCurrentUser: r.id === req.user.public_id,
      }));
    res.json({ entries });
  });
  app.post('/api/portfolio', requireAuth, (req, res) => {
    const { enabled, achievementIds } = body(req, [
      'enabled',
      'achievementIds',
    ]);
    if (
      typeof enabled !== 'boolean' ||
      !Array.isArray(achievementIds) ||
      achievementIds.length > achievementDefinitions.length ||
      achievementIds.some((id) => typeof id !== 'string') ||
      new Set(achievementIds).size !== achievementIds.length
    )
      throw fail(400, 'Choose earned achievements and a sharing preference.');
    const earned = new Set(
      all(
        'SELECT achievement_id AS id FROM achievements WHERE user_id=?',
        req.user.id,
      ).map((r) => r.id),
    );
    if (achievementIds.some((id) => !earned.has(id)))
      throw fail(400, 'Only earned achievements can be published.');
    run(
      'INSERT INTO portfolios VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,achievements=excluded.achievements',
      req.user.id,
      Number(enabled),
      JSON.stringify(achievementIds),
    );
    res.json({ enabled, code: req.user.public_id });
  });
  app.get('/api/portfolio/:code', (req, res) => {
    const row = get(
      'SELECT u.name,u.xp,u.id,p.achievements FROM portfolios p JOIN users u ON u.id=p.user_id WHERE u.public_id=? AND p.enabled=1',
      req.params.code,
    );
    if (!row) throw fail(404, 'This portfolio is not shared.');
    const selected = JSON.parse(row.achievements);
    res.json({
      name: row.name,
      level: Math.floor(row.xp / 500) + 1,
      completed: get(
        'SELECT COUNT(*) AS n FROM completions WHERE user_id=?',
        row.id,
      ).n,
      achievements: achievementDefinitions.filter((a) =>
        selected.includes(a.id),
      ),
    });
  });
}
