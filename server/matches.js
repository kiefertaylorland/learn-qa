import { randomUUID, randomInt } from 'node:crypto';
function questions() {
  const threshold = randomInt(20, 95),
    limit = randomInt(100, 600),
    old = randomInt(1, 9);
  const raw = [
    [
      `A reward requires at least ${threshold} points. Which boundary observations violate that rule?`,
      [
        `${threshold} points is rejected.`,
        `${threshold - 1} points is rejected.`,
        `${threshold + 1} points is accepted.`,
        `${threshold - 1} points is accepted.`,
      ],
      [0, 3],
      'At least includes equality. Values below the threshold must be rejected; values at and above it must be accepted.',
    ],
    [
      `Release change: allow ${old + 1} items instead of ${old}. Removing an item must still work. Which findings are justified?`,
      [
        `${old + 1} items being allowed is an intentional change.`,
        'Removal failing is a regression.',
        `${old + 1} items being allowed is necessarily a bug.`,
        'Removal no longer needs testing.',
      ],
      [0, 1],
      'The new capacity is intentional. Existing removal behavior is still promised and must be covered by regression tests.',
    ],
    [
      `Latency target: p95 strictly below ${limit} ms. Mean is ${limit - 50} ms and p95 is ${limit + 50} ms. Which conclusions are valid?`,
      [
        'The target fails.',
        'The mean proves the target passes.',
        'The measurements prove a memory leak.',
        'The mean hides slower requests.',
      ],
      [0, 3],
      'A percentile target must be evaluated against that percentile. The average alone cannot show the tail or identify the bottleneck.',
    ],
  ];
  return raw.map(([prompt, texts, correct, explanation]) => {
    const options = texts.map((text, i) => ({
      id: randomUUID(),
      text,
      correct: correct.includes(i),
    }));
    // Randomize answer positions for every match, preserving identical questions for both players.
    for (let i = options.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [options[i], options[j]] = [options[j], options[i]];
    }
    return {
      id: randomUUID(),
      prompt,
      options: options.map(({ id, text }) => ({ id, text })),
      correctAnswers: options.filter((o) => o.correct).map((o) => o.id),
      explanation,
    };
  });
}
export function mountMatches(ctx) {
  const {
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
    transaction,
  } = ctx;
  db.exec(`CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY,code TEXT UNIQUE NOT NULL,created_at INTEGER NOT NULL,starts_at INTEGER,ends_at INTEGER,cancelled INTEGER NOT NULL DEFAULT 0,questions TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS match_players (match_id TEXT NOT NULL REFERENCES matches(id),user_id TEXT NOT NULL REFERENCES users(id),ready INTEGER NOT NULL DEFAULT 0,submitted_at INTEGER,accuracy REAL,duration INTEGER,PRIMARY KEY(match_id,user_id));`);
  function find(id, userId) {
    const m = get(
      'SELECT m.* FROM matches m JOIN match_players p ON m.id=p.match_id WHERE m.id=? AND p.user_id=?',
      id,
      userId,
    );
    if (!m) throw fail(404, 'Match not found.');
    return m;
  }
  const status = (m) =>
    m.cancelled
      ? 'cancelled'
      : !m.starts_at
        ? now() >= m.created_at + 900000
          ? 'expired'
          : 'lobby'
        : now() >= m.ends_at ||
            get(
              'SELECT COUNT(*) AS n FROM match_players WHERE match_id=? AND submitted_at IS NOT NULL',
              m.id,
            ).n === 2
          ? 'finished'
          : now() < m.starts_at
            ? 'countdown'
            : 'playing';
  function view(id, userId) {
    const m = find(id, userId),
      state = status(m),
      finished = state === 'finished';
    const players = all(
      'SELECT u.public_id AS code,u.name,p.* FROM match_players p JOIN users u ON u.id=p.user_id WHERE p.match_id=? ORDER BY u.public_id',
      id,
    );
    const ranked = finished
      ? [...players].sort(
          (a, b) =>
            (b.accuracy ?? 0) - (a.accuracy ?? 0) ||
            (a.duration ?? 120000) - (b.duration ?? 120000),
        )
      : [];
    const tied =
      finished &&
      (ranked[0].accuracy ?? 0) === (ranked[1].accuracy ?? 0) &&
      (ranked[0].duration ?? 120000) === (ranked[1].duration ?? 120000);
    return {
      id: m.id,
      code: m.code,
      status: state,
      startsAt: m.starts_at,
      endsAt: m.ends_at,
      serverNow: now(),
      expiresAt: m.created_at + 900000,
      players: players.map((p) => ({
        code: p.code,
        name: p.name,
        isYou: p.user_id === userId,
        ready: !!p.ready,
        submitted: p.submitted_at !== null,
        ...(finished
          ? {
              accuracy: p.accuracy ?? 0,
              duration: (p.duration ?? 120000) / 1000,
            }
          : {}),
      })),
      ...(finished ? { winner: tied ? null : ranked[0].code } : {}),
      questions: ['playing', 'finished'].includes(state)
        ? JSON.parse(m.questions).map((q) =>
            finished ? q : { id: q.id, prompt: q.prompt, options: q.options },
          )
        : [],
    };
  }
  const newMatch = (userId) => {
    limit(`match:${userId}`, 20, 3600000);
    const id = randomUUID();
    transaction(() => {
      run(
        'INSERT INTO matches (id,code,created_at,questions) VALUES (?,?,?,?)',
        id,
        code(),
        now(),
        JSON.stringify(questions()),
      );
      run(
        'INSERT INTO match_players (match_id,user_id) VALUES (?,?)',
        id,
        userId,
      );
    });
    return view(id, userId);
  };
  app.post('/api/matches', requireAuth, (req, res) => {
    body(req, []);
    res.json(newMatch(req.user.id));
  });
  app.post('/api/matches/join', requireAuth, (req, res) => {
    const value = body(req, ['code']).code;
    if (typeof value !== 'string')
      throw fail(400, 'Enter a match invitation code.');
    const m = get('SELECT * FROM matches WHERE code=?', value);
    if (!m) throw fail(404, 'Invitation not found.');
    if (
      get(
        'SELECT 1 FROM match_players WHERE match_id=? AND user_id=?',
        m.id,
        req.user.id,
      )
    )
      return res.json(view(m.id, req.user.id));
    if (status(m) !== 'lobby') throw fail(409, 'This lobby is closed.');
    transaction(() => {
      if (
        get('SELECT COUNT(*) AS n FROM match_players WHERE match_id=?', m.id)
          .n >= 2
      )
        throw fail(409, 'This match already has two players.');
      run(
        'INSERT INTO match_players (match_id,user_id) VALUES (?,?)',
        m.id,
        req.user.id,
      );
    });
    res.json(view(m.id, req.user.id));
  });
  app.get('/api/matches/:id', requireAuth, (req, res) =>
    res.json(view(req.params.id, req.user.id)),
  );
  app.post('/api/matches/:id/ready', requireAuth, (req, res) => {
    body(req, []);
    const m = find(req.params.id, req.user.id);
    if (status(m) !== 'lobby') throw fail(409, 'This lobby is closed.');
    transaction(() => {
      run(
        'UPDATE match_players SET ready=1 WHERE match_id=? AND user_id=?',
        m.id,
        req.user.id,
      );
      if (
        get(
          'SELECT COUNT(*) AS n FROM match_players WHERE match_id=? AND ready=1',
          m.id,
        ).n === 2
      )
        run(
          'UPDATE matches SET starts_at=?,ends_at=? WHERE id=?',
          now() + 3000,
          now() + 123000,
          m.id,
        );
    });
    res.json(view(m.id, req.user.id));
  });
  app.post('/api/matches/:id/cancel', requireAuth, (req, res) => {
    body(req, []);
    const m = find(req.params.id, req.user.id);
    if (status(m) !== 'lobby')
      throw fail(409, 'Only an unstarted lobby can be cancelled.');
    run('UPDATE matches SET cancelled=1 WHERE id=?', m.id);
    res.json(view(m.id, req.user.id));
  });
  app.post('/api/matches/:id/rematch', requireAuth, (req, res) => {
    body(req, []);
    const m = find(req.params.id, req.user.id);
    if (!['finished', 'expired', 'cancelled'].includes(status(m)))
      throw fail(409, 'Finish this match first.');
    res.json(newMatch(req.user.id));
  });
  app.post('/api/matches/:id/submit', requireAuth, (req, res) => {
    const { answers } = body(req, ['answers']);
    const m = find(req.params.id, req.user.id);
    const player = get(
      'SELECT * FROM match_players WHERE match_id=? AND user_id=?',
      m.id,
      req.user.id,
    );
    if (player.submitted_at !== null) return res.json(view(m.id, req.user.id));
    if (status(m) !== 'playing')
      throw fail(409, 'This match is not accepting answers.');
    const qs = JSON.parse(m.questions);
    if (
      !Array.isArray(answers) ||
      answers.length !== qs.length ||
      new Set(answers.map((a) => a?.questionId)).size !== qs.length
    )
      throw fail(400, 'Submit one answer set for each question.');
    let score = 0;
    for (const q of qs) {
      const a = answers.find((a) => a?.questionId === q.id);
      if (
        !a ||
        !Array.isArray(a.options) ||
        a.options.length > q.options.length ||
        new Set(a.options).size !== a.options.length ||
        a.options.some((id) => !q.options.some((o) => o.id === id))
      )
        throw fail(400, 'Use valid unique answer options.');
      const intersection = a.options.filter((id) =>
        q.correctAnswers.includes(id),
      ).length;
      score +=
        (100 * intersection) /
        new Set([...a.options, ...q.correctAnswers]).size;
    }
    run(
      'UPDATE match_players SET submitted_at=?,accuracy=?,duration=? WHERE match_id=? AND user_id=? AND submitted_at IS NULL',
      now(),
      Math.round(score / qs.length),
      now() - m.starts_at,
      m.id,
      req.user.id,
    );
    res.json(view(m.id, req.user.id));
  });
  return {
    list: (userId) =>
      all(
        'SELECT m.id FROM matches m JOIN match_players p ON p.match_id=m.id WHERE p.user_id=? ORDER BY created_at DESC LIMIT 10',
        userId,
      ).map((m) => {
        const v = view(m.id, userId);
        return { id: v.id, status: v.status, players: v.players };
      }),
  };
}
