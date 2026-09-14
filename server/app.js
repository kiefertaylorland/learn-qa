import express from 'express';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { challenges, challengeById, achievementDefinitions } from './content.js';

const deriveKey = promisify(scrypt);
const DAY = 86_400_000;
const SESSION_LIFETIME = 30 * DAY;
const iso = (time) => new Date(time).toISOString();
const dayKey = (time) => iso(time).slice(0, 10);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const publicUser = (user) => ({ id: user.id, name: user.name });
const fail = (status, message) => Object.assign(new Error(message), { status });

function weekStart(time) {
  const day = Math.floor(time / DAY);
  return (day - (new Date(time).getUTCDay() + 6) % 7) * DAY;
}

function initialize(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, public_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      email TEXT UNIQUE, password_hash TEXT, salt TEXT,
      xp INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0,
      last_active TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      challenge_id TEXT NOT NULL, daily_date TEXT, started_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL, submitted_at INTEGER, accuracy REAL, correct INTEGER,
      duration REAL, result TEXT
    );
    CREATE INDEX IF NOT EXISTS attempts_user ON attempts(user_id, started_at);
    CREATE TABLE IF NOT EXISTS completions (
      user_id TEXT NOT NULL REFERENCES users(id), challenge_id TEXT NOT NULL,
      completed_at INTEGER NOT NULL, PRIMARY KEY(user_id, challenge_id)
    );
    CREATE TABLE IF NOT EXISTS daily_rewards (
      user_id TEXT NOT NULL REFERENCES users(id), date TEXT NOT NULL,
      PRIMARY KEY(user_id, date)
    );
    CREATE TABLE IF NOT EXISTS xp_events (
      id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      amount INTEGER NOT NULL, earned_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS xp_events_time ON xp_events(earned_at, user_id);
    CREATE TABLE IF NOT EXISTS achievements (
      user_id TEXT NOT NULL REFERENCES users(id), achievement_id TEXT NOT NULL,
      earned_at INTEGER NOT NULL, PRIMARY KEY(user_id, achievement_id)
    );
  `);
}

export function createApp({
  dataDir = process.env.DATA_DIR || './data',
  databasePath,
  now = Date.now,
  production = process.env.NODE_ENV === 'production',
  origin = process.env.APP_ORIGIN,
  distDir = path.resolve('dist'),
} = {}) {
  if (!databasePath) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    databasePath = path.join(dataDir, 'quest.sqlite');
  }
  const db = new DatabaseSync(databasePath);
  initialize(db);
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  const cookieName = production ? '__Host-qa_session' : 'qa_session';
  const configuredOrigin = origin ? new URL(origin).origin : null;
  const limits = new Map();
  let hashesInFlight = 0;

  const run = (sql, ...params) => db.prepare(sql).run(...params);
  const get = (sql, ...params) => db.prepare(sql).get(...params);
  const all = (sql, ...params) => db.prepare(sql).all(...params);
  function transaction(action) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function limit(key, maximum, windowMs) {
    const time = now();
    let entry = limits.get(key);
    if (!entry || entry.until <= time) {
      if (limits.size >= 10_000) limits.delete(limits.keys().next().value);
      entry = { count: 0, until: time + windowMs };
      limits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > maximum) throw fail(429, 'Too many requests. Please try again later.');
  }

  function matchesOrigin(req) {
    const expected = configuredOrigin || `${production ? 'https' : 'http'}://${req.headers.host}`;
    return typeof req.headers.origin === 'string' && req.headers.origin === expected;
  }

  function sessionToken(req) {
    const cookies = (req.headers.cookie || '').split(';').map((cookie) => cookie.trim());
    const value = cookies.find((cookie) => cookie.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
  }

  function setSession(req, res, userId) {
    const token = randomBytes(32).toString('hex');
    if (req.sessionHash) run('DELETE FROM sessions WHERE token_hash = ?', req.sessionHash);
    run('DELETE FROM sessions WHERE expires_at <= ?', now());
    run('INSERT INTO sessions VALUES (?, ?, ?)', hash(token), userId, now() + SESSION_LIFETIME);
    res.cookie(cookieName, token, {
      httpOnly: true, secure: production, sameSite: 'strict', path: '/', maxAge: SESSION_LIFETIME,
    });
  }

  const requireAuth = (req, _res, next) => {
    if (!req.user) return next(fail(401, 'Sign in to continue.'));
    next();
  };
  function body(req, keys) {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
      || Object.keys(req.body).some((key) => !keys.includes(key))) {
      throw fail(400, 'Invalid request body.');
    }
    return req.body;
  }
  function credentials(req, register = false) {
    const value = body(req, register ? ['name', 'email', 'password'] : ['email', 'password']);
    if (typeof value.email !== 'string' || value.email.length > 254
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)
      || typeof value.password !== 'string' || value.password.length > 128
      || Buffer.byteLength(value.password) > 256
      || value.password.length < (register ? 10 : 1)) {
      throw fail(400, register ? 'Use a valid email and a password of 10–128 characters (up to 256 bytes).' : 'Invalid email or password format.');
    }
    if (register && (typeof value.name !== 'string' || value.name.trim().length < 2
      || value.name.trim().length > 32 || /[\p{C}<>]/u.test(value.name))) {
      throw fail(400, 'Display name must be 2–32 characters without control characters or angle brackets.');
    }
    return { ...value, email: value.email.toLowerCase(), name: value.name?.trim() };
  }
  async function passwordKey(password, salt) {
    if (hashesInFlight >= 4) throw fail(429, 'Authentication is busy. Please try again.');
    hashesInFlight += 1;
    try {
      return await deriveKey(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    } finally {
      hashesInFlight -= 1;
    }
  }
  function authLimit(req) {
    limit(`auth:${req.socket.remoteAddress}`, 20, 15 * 60_000);
  }
  function completedIds(userId) {
    return all('SELECT challenge_id FROM completions WHERE user_id = ? ORDER BY completed_at, challenge_id', userId)
      .map((row) => row.challenge_id);
  }
  function unlocked(challenge, completed) {
    return challenges.filter((item) => item.mode === challenge.mode && item.level < challenge.level)
      .every((item) => completed.includes(item.id));
  }
  function state(userId, time = now()) {
    const user = get('SELECT * FROM users WHERE id = ?', userId);
    const completed = completedIds(userId);
    const earned = all('SELECT achievement_id FROM achievements WHERE user_id = ?', userId).map((row) => row.achievement_id);
    const stats = get(`SELECT COUNT(*) AS attempts,
      COALESCE(AVG(CASE WHEN submitted_at IS NOT NULL OR expires_at <= ? THEN COALESCE(accuracy, 0) END), 0) AS accuracy
      FROM attempts WHERE user_id = ?`, time, userId);
    const weekly = get('SELECT COALESCE(SUM(amount), 0) AS xp FROM xp_events WHERE user_id = ? AND earned_at >= ? AND earned_at < ?',
      userId, weekStart(time), weekStart(time) + 7 * DAY);
    const staleStreak = !user.last_active || user.last_active < dayKey(time - DAY);
    return {
      profile: { id: user.id, name: user.name, xp: user.xp, level: Math.floor(user.xp / 500) + 1, streak: staleStreak ? 0 : user.streak, isGuest: !user.email },
      completed,
      achievements: achievementDefinitions.map((item) => ({ ...item, earned: earned.includes(item.id) })),
      stats: { attempts: stats.attempts, completed: completed.length, accuracy: Math.round(stats.accuracy), weeklyXp: weekly.xp },
      modeProgress: Object.fromEntries(['bugs', 'tests'].map((mode) => [mode, { completed: completed.filter((id) => challengeById.get(id).mode === mode).length, total: 10 }])),
    };
  }
  function dailyChallenge(time = now()) {
    return challenges[Math.floor(time / DAY) % challenges.length];
  }
  function attemptResponse(attempt) {
    const item = challengeById.get(attempt.challenge_id);
    // Explicit field selection keeps grading keys and explanations off the wire.
    const { id, mode, title, level, prompt, code, options, durationSeconds } = item;
    return {
      attemptId: attempt.id,
      challenge: { id, mode, title, level, prompt, ...(code ? { code } : {}), options, durationSeconds },
      startedAt: iso(attempt.started_at), expiresAt: iso(attempt.expires_at),
    };
  }
  function notifyLeaderboard() {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        if (client.bufferedAmount > 65536) client.terminate();
        else client.send(JSON.stringify({ type: 'leaderboard' }));
      }
    }
  }

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    if (production) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      limit(`api:${req.socket.remoteAddress}`, 240, 60_000);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        if (!matchesOrigin(req) || req.headers['sec-fetch-site'] === 'cross-site') {
          throw fail(403, 'Request origin is not allowed.');
        }
        if (!req.is('application/json')) throw fail(415, 'Send application/json.');
      }
      const token = sessionToken(req);
      req.sessionHash = token ? hash(token) : null;
      req.user = req.sessionHash ? get(`SELECT users.* FROM users JOIN sessions ON users.id = sessions.user_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ?`, req.sessionHash, now()) : null;
      next();
    } catch (error) { next(error); }
  });
  app.use('/api', express.json({ limit: '8kb', strict: true }));

  app.get('/api/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));
  app.post('/api/auth/guest', (req, res) => {
    body(req, []);
    if (req.user) return res.json({ user: publicUser(req.user) });
    authLimit(req);
    limit(`guest:${req.socket.remoteAddress}`, 8, 15 * 60_000);
    const id = randomUUID();
    const name = `Explorer ${randomBytes(3).toString('hex')}`;
    transaction(() => {
      run('INSERT INTO users (id, public_id, name, created_at) VALUES (?, ?, ?, ?)', id, randomUUID(), name, now());
      setSession(req, res, id);
    });
    res.status(201).json({ user: { id, name } });
  });
  app.post('/api/auth/register', async (req, res) => {
    authLimit(req);
    const { name, email, password } = credentials(req, true);
    if (req.user?.email) throw fail(409, 'Sign out before creating another account.');
    const salt = randomBytes(16).toString('hex');
    const passwordHash = (await passwordKey(password, salt)).toString('hex');
    const id = req.user?.id || randomUUID();
    transaction(() => {
      if (get('SELECT id FROM users WHERE email = ?', email)) throw fail(409, 'Unable to register with these details. Try signing in.');
      if (req.user) {
        const updated = run('UPDATE users SET name = ?, email = ?, password_hash = ?, salt = ? WHERE id = ? AND email IS NULL',
          name, email, passwordHash, salt, id);
        if (!updated.changes) throw fail(409, 'This guest has already been upgraded. Please sign in.');
        run('DELETE FROM sessions WHERE user_id = ?', id);
      } else {
        run('INSERT INTO users (id, public_id, name, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          id, randomUUID(), name, email, passwordHash, salt, now());
      }
      setSession(req, res, id);
    });
    notifyLeaderboard();
    res.status(201).json({ user: { id, name } });
  });
  app.post('/api/auth/login', async (req, res) => {
    authLimit(req);
    const { email, password } = credentials(req);
    limit(`login:${hash(email)}`, 10, 15 * 60_000);
    const user = get('SELECT * FROM users WHERE email = ?', email);
    const candidate = await passwordKey(password, user?.salt || 'qa-quest-nonexistent-user');
    const expected = user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64);
    if (!timingSafeEqual(candidate, expected) || !user) throw fail(401, 'Email or password is incorrect.');
    transaction(() => setSession(req, res, user.id));
    res.json({ user: publicUser(user) });
  });
  app.post('/api/auth/logout', (req, res) => {
    body(req, []);
    if (req.sessionHash) run('DELETE FROM sessions WHERE token_hash = ?', req.sessionHash);
    res.clearCookie(cookieName, { httpOnly: true, secure: production, sameSite: 'strict', path: '/' });
    res.json({});
  });
  app.get('/api/state', requireAuth, (req, res) => res.json(state(req.user.id)));
  app.get('/api/challenges', requireAuth, (req, res) => {
    const completed = completedIds(req.user.id);
    res.json({ challenges: challenges.map(({ id, mode, title, level, difficulty, durationSeconds, description }) => ({
      id, mode, title, level, difficulty, durationSeconds, description,
      unlocked: unlocked(challengeById.get(id), completed), completed: completed.includes(id),
    })) });
  });
  app.get('/api/daily', requireAuth, (req, res) => {
    const time = now();
    const challenge = dailyChallenge(time);
    const date = dayKey(time);
    res.json({ date, challengeId: challenge.id, title: challenge.title, mode: challenge.mode,
      completed: Boolean(get('SELECT 1 FROM daily_rewards WHERE user_id = ? AND date = ?', req.user.id, date)), bonusXp: 150 });
  });
  app.post('/api/attempts', requireAuth, (req, res) => {
    const { challengeId, daily = false } = body(req, ['challengeId', 'daily']);
    if (typeof challengeId !== 'string' || !challengeById.has(challengeId) || typeof daily !== 'boolean') {
      throw fail(400, 'Choose a valid challenge and daily flag.');
    }
    const time = now();
    const challenge = challengeById.get(challengeId);
    if (daily ? dailyChallenge(time).id !== challengeId : !unlocked(challenge, completedIds(req.user.id))) {
      throw fail(403, daily ? 'This is not today’s daily challenge.' : 'Complete the previous levels in this mode first.');
    }
    const pending = get('SELECT * FROM attempts WHERE user_id = ? AND submitted_at IS NULL AND expires_at > ? ORDER BY started_at DESC LIMIT 1',
      req.user.id, time);
    if (pending) {
      if (pending.challenge_id === challengeId && pending.daily_date === (daily ? dayKey(time) : null)) {
        return res.json(attemptResponse(pending));
      }
      throw fail(409, 'Finish your active challenge or wait for its timer to expire.');
    }
    limit(`start:${req.user.id}`, 30, 60 * 60_000);
    const attempt = { id: randomUUID(), user_id: req.user.id, challenge_id: challengeId,
      daily_date: daily ? dayKey(time) : null, started_at: time, expires_at: time + challenge.durationSeconds * 1000 };
    run('INSERT INTO attempts (id, user_id, challenge_id, daily_date, started_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      attempt.id, attempt.user_id, attempt.challenge_id, attempt.daily_date, attempt.started_at, attempt.expires_at);
    res.status(201).json(attemptResponse(attempt));
  });
  app.post('/api/attempts/:id/submit', requireAuth, (req, res) => {
    const { answers } = body(req, ['answers']);
    if (!Array.isArray(answers) || answers.length > 8 || answers.some((answer) => typeof answer !== 'string' || answer.length > 32)
      || new Set(answers).size !== answers.length) throw fail(400, 'Answers must be a list of unique option ids.');
    const time = now();
    const result = transaction(() => {
      const attempt = get('SELECT * FROM attempts WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
      if (!attempt) throw fail(404, 'Attempt not found.');
      const challenge = challengeById.get(attempt.challenge_id);
      if (answers.some((answer) => !challenge.options.some((option) => option.id === answer))) throw fail(400, 'Unknown answer option.');
      if (attempt.result) return JSON.parse(attempt.result);
      const expired = time >= attempt.expires_at;
      const correct = !expired && answers.length === challenge.answers.length && answers.every((answer) => challenge.answers.includes(answer));
      // Intersection over union penalizes guessing every option as well as omissions.
      const intersection = answers.filter((answer) => challenge.answers.includes(answer)).length;
      const accuracy = expired ? 0 : Math.round(100 * intersection / new Set([...answers, ...challenge.answers]).size);
      const duration = Math.max(0, Math.min(time - attempt.started_at, challenge.durationSeconds * 1000)) / 1000;
      run('UPDATE attempts SET submitted_at = ?, accuracy = ?, correct = ?, duration = ? WHERE id = ?', time, accuracy, Number(correct), duration, attempt.id);
      let xpEarned = 0;
      let bonus = false;
      if (correct) {
        const user = get('SELECT * FROM users WHERE id = ?', req.user.id);
        const today = dayKey(time);
        const streak = user.last_active === today ? user.streak : user.last_active === dayKey(time - DAY) ? user.streak + 1 : 1;
        run('UPDATE users SET streak = ?, last_active = ? WHERE id = ?', streak, today, user.id);
        const firstClear = run('INSERT OR IGNORE INTO completions VALUES (?, ?, ?)', user.id, challenge.id, time).changes > 0;
        if (firstClear) xpEarned = 100 + challenge.level * 15 + Math.floor(50 * (1 - duration / challenge.durationSeconds)) + Math.min(streak - 1, 7) * 5;
        if (attempt.daily_date === today) {
          bonus = run('INSERT OR IGNORE INTO daily_rewards VALUES (?, ?)', user.id, today).changes > 0;
          if (bonus) xpEarned += 150;
        }
        if (xpEarned) {
          run('UPDATE users SET xp = xp + ? WHERE id = ?', xpEarned, user.id);
          run('INSERT INTO xp_events (user_id, amount, earned_at) VALUES (?, ?, ?)', user.id, xpEarned, time);
        }
        const completed = completedIds(user.id);
        const previousAttempts = get(`SELECT COUNT(*) AS count FROM attempts WHERE user_id = ? AND challenge_id = ?
          AND id != ? AND (submitted_at IS NOT NULL OR expires_at <= ?)`, user.id, challenge.id, attempt.id, time).count;
        const awards = [
          ['first-clear', completed.length >= 1],
          ['bug-spotter', completed.filter((id) => id.startsWith('bugs-')).length >= 5],
          ['test-master', completed.filter((id) => id.startsWith('tests-')).length === 10],
          ['speed-demon', firstClear && duration < 30],
          ['perfectionist', firstClear && previousAttempts === 0],
          ['seven-day-warrior', streak >= 7],
          ['quest-complete', completed.length === 20],
        ];
        for (const [id, earned] of awards) if (earned) run('INSERT OR IGNORE INTO achievements VALUES (?, ?, ?)', user.id, id, time);
      }
      const rewardExplanation = !correct ? '' : xpEarned === 0 ? ' Practice clear: no repeat-clear XP is awarded.'
        : bonus ? ' Includes the once-per-UTC-day +150 daily bonus.' : ' First-clear XP awarded.';
      const rolloverExplanation = correct && attempt.daily_date && attempt.daily_date !== dayKey(time)
        ? ' The daily date changed before submission, so no daily bonus was awarded.' : '';
      const result = { correct, accuracy, xpEarned,
        explanation: `${expired ? 'Time expired. No XP was awarded. ' : ''}${challenge.explanation}${rewardExplanation}${rolloverExplanation}`,
        correctAnswers: challenge.answers, state: state(req.user.id, time) };
      run('UPDATE attempts SET result = ? WHERE id = ?', JSON.stringify(result), attempt.id);
      return result;
    });
    notifyLeaderboard();
    res.json(result);
  });

  app.get('/api/leaderboard', (req, res) => {
    const category = req.query.category || 'xp';
    const range = req.query.range || 'all';
    const ranges = { all: [1, Infinity], '1-5': [1, 5], '6-15': [6, 15], '16-30': [16, 30], '31+': [31, Infinity] };
    if (!['xp', 'accuracy', 'speed'].includes(category) || typeof range !== 'string' || !Object.hasOwn(ranges, range)) {
      throw fail(400, 'Invalid leaderboard category or level range.');
    }
    const time = now();
    const start = weekStart(time);
    const rows = all(`WITH weekly_xp AS (
        SELECT user_id, SUM(amount) AS xp FROM xp_events WHERE earned_at >= ? AND earned_at < ? GROUP BY user_id
      ), weekly_attempts AS (
        SELECT user_id, COUNT(*) AS samples, AVG(COALESCE(accuracy, 0)) AS accuracy,
          AVG(CASE WHEN correct = 1 THEN duration END) AS speed,
          SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) AS successes
        FROM attempts WHERE MIN(COALESCE(submitted_at, expires_at), expires_at) >= ?
          AND MIN(COALESCE(submitted_at, expires_at), expires_at) < ?
          AND (submitted_at IS NOT NULL OR expires_at <= ?) GROUP BY user_id
      )
      SELECT users.id AS user_id, users.public_id AS id, users.name, users.xp AS total_xp,
        COALESCE(weekly_xp.xp, 0) AS xp, COALESCE(weekly_attempts.accuracy, 0) AS accuracy,
        COALESCE(weekly_attempts.speed, 0) AS speed, COALESCE(weekly_attempts.samples, 0) AS samples,
        COALESCE(weekly_attempts.successes, 0) AS successes
      FROM users LEFT JOIN weekly_xp ON users.id = weekly_xp.user_id
      LEFT JOIN weekly_attempts ON users.id = weekly_attempts.user_id
      WHERE weekly_xp.xp > 0 OR weekly_attempts.samples > 0`, start, start + 7 * DAY, start, start + 7 * DAY, time);
    const [min, max] = ranges[range];
    const eligible = rows.map((row) => ({ ...row, level: Math.floor(row.total_xp / 500) + 1 }))
      .filter((row) => row.level >= min && row.level <= max
        && (category === 'xp' ? row.xp > 0 : category === 'accuracy' ? row.samples >= 3 && row.successes >= 1 : row.successes >= 1));
    eligible.sort((a, b) => (category === 'xp' ? b.xp - a.xp : category === 'accuracy' ? b.accuracy - a.accuracy : a.speed - b.speed)
      || b.xp - a.xp || a.id.localeCompare(b.id));
    res.json({ week: dayKey(start), entries: eligible.slice(0, 100).map((row, index) => ({
      id: row.id, name: row.name, level: row.level, xp: row.xp, accuracy: Math.round(row.accuracy),
      speed: Math.round(row.speed * 10) / 10, rank: index + 1, isCurrentUser: row.user_id === req.user?.id,
    })) });
  });
  app.use('/api', (_req, _res, next) => next(fail(404, 'API endpoint not found.')));
  if (production) {
    app.use(express.static(distDir, { index: false, dotfiles: 'deny' }));
    app.get('/{*path}', (req, res, next) => {
      if (path.extname(req.path) || req.path.split('/').some((segment) => segment.startsWith('.'))) return next(fail(404, 'File not found.'));
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'), (error) => { if (error) next(error); });
    });
  }
  app.use((_req, _res, next) => next(fail(404, 'Not found.')));
  app.use((error, _req, res, _next) => {
    const status = error.status >= 400 && error.status < 500 ? error.status : 500;
    const message = error.type === 'entity.too.large' ? 'Request is too large.'
      : error.type === 'entity.parse.failed' ? 'Invalid JSON.'
        : status === 500 ? 'An unexpected error occurred.' : error.message;
    if (status === 429) res.set('Retry-After', '60');
    res.status(status).json({ error: message });
  });

  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/live' || !matchesOrigin(req)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    try {
      limit(`ws:${req.socket.remoteAddress}`, 30, 60_000);
      const sameIp = [...wss.clients].filter((client) => client.remoteIp === req.socket.remoteAddress).length;
      if (sameIp >= 5 || wss.clients.size >= 1000) throw fail(429, 'Too many connections.');
    } catch {
      socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (client) => {
      client.remoteIp = req.socket.remoteAddress;
      client.alive = true;
      client.on('pong', () => { client.alive = true; });
      client.on('error', () => client.terminate());
      client.on('message', () => client.close(1008, 'This channel only sends updates.'));
      wss.emit('connection', client, req);
    });
  });
  let notifiedWeek = weekStart(now());
  const maintenance = setInterval(() => {
    for (const [key, value] of limits) if (value.until <= now()) limits.delete(key);
    for (const client of wss.clients) {
      if (!client.alive) client.terminate();
      else { client.alive = false; client.ping(); }
    }
    run('DELETE FROM sessions WHERE expires_at <= ?', now());
    if (notifiedWeek !== weekStart(now())) {
      notifiedWeek = weekStart(now());
      notifyLeaderboard();
    }
  }, 30_000);
  maintenance.unref();
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    clearInterval(maintenance);
    for (const client of wss.clients) client.terminate();
    await new Promise((resolve) => wss.close(resolve));
    if (server.listening) {
      await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    }
    db.close();
  }
  return { app, server, db, close };
}
