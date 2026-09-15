import { randomUUID } from 'node:crypto';
export function mountTeams(ctx) {
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
    name,
    transaction,
    userByCode,
  } = ctx;
  db.exec(`CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY,name TEXT NOT NULL,owner TEXT NOT NULL REFERENCES users(id),invite_code TEXT UNIQUE NOT NULL,invite_expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS team_members (team_id TEXT NOT NULL REFERENCES teams(id),user_id TEXT NOT NULL REFERENCES users(id),joined_at INTEGER NOT NULL,PRIMARY KEY(team_id,user_id));
 CREATE TABLE IF NOT EXISTS tournaments (id TEXT PRIMARY KEY,team_id TEXT NOT NULL REFERENCES teams(id),name TEXT NOT NULL,starts_at INTEGER NOT NULL,ends_at INTEGER NOT NULL);`);
  function authorize(id, userId, owner = false) {
    const team = get(
      'SELECT t.* FROM teams t JOIN team_members m ON t.id=m.team_id WHERE t.id=? AND m.user_id=?',
      id,
      userId,
    );
    if (!team) throw fail(404, 'Team not found.');
    if (owner && team.owner !== userId)
      throw fail(403, 'Only the team owner can do this.');
    return team;
  }
  function view(id, userId) {
    const team = authorize(id, userId);
    const members = all(
      'SELECT u.public_id AS code,u.name,u.id=? AS isOwner,u.id=? AS isYou FROM team_members m JOIN users u ON u.id=m.user_id WHERE team_id=?',
      team.owner,
      userId,
      id,
    );
    const tournaments = all(
      'SELECT id,name,starts_at AS startsAt,ends_at AS endsAt FROM tournaments WHERE team_id=? ORDER BY starts_at DESC LIMIT 20',
      id,
    ).map((t) => ({
      ...t,
      entries: all(
        `SELECT u.public_id AS code,u.name,COALESCE(SUM(best.score),0) AS score FROM team_members m JOIN users u ON u.id=m.user_id LEFT JOIN (
    SELECT a.user_id,a.challenge_id,MAX(a.accuracy) AS score FROM attempts a JOIN team_members tm ON tm.user_id=a.user_id AND tm.team_id=?
    WHERE a.started_at>=? AND a.started_at>=tm.joined_at AND a.submitted_at<? AND a.submitted_at<=? AND a.correct=1
    GROUP BY a.user_id,a.challenge_id) best ON best.user_id=m.user_id WHERE m.team_id=? GROUP BY u.id ORDER BY score DESC,u.public_id`,
        id,
        t.startsAt,
        t.endsAt,
        now(),
        id,
      ),
    }));
    return {
      id: team.id,
      name: team.name,
      isOwner: team.owner === userId,
      ...(team.owner === userId
        ? { inviteCode: team.invite_code, inviteExpires: team.invite_expires }
        : {}),
      members,
      tournaments,
    };
  }
  app.post('/api/teams', requireAuth, (req, res) => {
    limit(`teams:${req.user.id}`, 10, 86400000);
    const title = name(body(req, ['name']).name),
      id = randomUUID();
    transaction(() => {
      run(
        'INSERT INTO teams VALUES (?,?,?,?,?)',
        id,
        title,
        req.user.id,
        code(),
        now() + 7 * 86400000,
      );
      run('INSERT INTO team_members VALUES (?,?,?)', id, req.user.id, now());
    });
    res.json(view(id, req.user.id));
  });
  app.post('/api/teams/join', requireAuth, (req, res) => {
    const value = body(req, ['code']).code;
    if (typeof value !== 'string')
      throw fail(400, 'Enter a team invitation code.');
    const team = get(
      'SELECT id FROM teams WHERE invite_code=? AND invite_expires>?',
      value,
      now(),
    );
    if (!team) throw fail(404, 'Invitation is invalid or expired.');
    run(
      'INSERT OR IGNORE INTO team_members VALUES (?,?,?)',
      team.id,
      req.user.id,
      now(),
    );
    res.json(view(team.id, req.user.id));
  });
  app.get('/api/teams/:id', requireAuth, (req, res) =>
    res.json(view(req.params.id, req.user.id)),
  );
  app.post('/api/teams/:id/invite', requireAuth, (req, res) => {
    body(req, []);
    limit(`team-invite:${req.user.id}`, 30, 3600000);
    authorize(req.params.id, req.user.id, true);
    run(
      'UPDATE teams SET invite_code=?,invite_expires=? WHERE id=?',
      code(),
      now() + 7 * 86400000,
      req.params.id,
    );
    res.json(view(req.params.id, req.user.id));
  });
  app.post(
    '/api/teams/:id/members',
    requireAuth,
    (req, res) => {
      limit(`team-members:${req.user.id}`, 30, 86400000);
      const { action, code: targetCode } = body(req, ['action', 'code']);
      const team = authorize(req.params.id, req.user.id, action !== 'leave');
      if (!['leave', 'remove', 'transfer'].includes(action))
        throw fail(400, 'Choose a valid membership action.');
      const target = action === 'leave' ? req.user : userByCode(targetCode);
      if (
        !target ||
        !get(
          'SELECT 1 FROM team_members WHERE team_id=? AND user_id=?',
          team.id,
          target.id,
        )
      )
        throw fail(404, 'Member not found.');
      if (action === 'transfer')
        run('UPDATE teams SET owner=? WHERE id=?', target.id, team.id);
      else {
        if (target.id === team.owner)
          throw fail(
            400,
            'Transfer ownership before leaving or removing the owner.',
          );
        transaction(() => {
          run(
            'DELETE FROM team_members WHERE team_id=? AND user_id=?',
            team.id,
            target.id,
          );
          if (action === 'remove')
            run(
              'UPDATE teams SET invite_code=?,invite_expires=? WHERE id=?',
              code(),
              now() + 7 * 86400000,
              team.id,
            );
        });
      }
      res.json({ ok: true });
    },
  );
  app.post('/api/teams/:id/tournaments', requireAuth, (req, res) => {
    limit(`tournament:${req.user.id}`, 10, 86400000);
    authorize(req.params.id, req.user.id, true);
    const { name: title, durationHours } = body(req, ['name', 'durationHours']);
    if (
      !Number.isInteger(durationHours) ||
      durationHours < 1 ||
      durationHours > 168
    )
      throw fail(400, 'Choose a duration of 1–168 hours.');
    run(
      'INSERT INTO tournaments VALUES (?,?,?,?,?)',
      randomUUID(),
      req.params.id,
      name(title),
      now(),
      now() + durationHours * 3600000,
    );
    res.json(view(req.params.id, req.user.id));
  });
  return {
    list: (userId) =>
      all(
        'SELECT t.id,t.name,t.owner=? AS isOwner FROM teams t JOIN team_members m ON m.team_id=t.id WHERE m.user_id=?',
        userId,
        userId,
      ),
  };
}
