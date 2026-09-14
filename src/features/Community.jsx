import { useCallback, useEffect, useState } from 'react';
import { api, isDemoMode } from 'virtual:qa-api';
import { ShareAchievements } from './Sharing.jsx';
import { Match } from './Match.jsx';
function Form({ title, fields, submitLabel = title, onSubmit, busy }) {
  return (
    <form
      className="roadmap-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(Object.fromEntries(new FormData(e.currentTarget)));
      }}
    >
      <h3>{title}</h3>
      {fields.map((f) => (
        <label key={f.name}>
          {f.label}
          <input
            name={f.name}
            type={f.type || 'text'}
            required
            maxLength={f.maxLength || 100}
            min={f.min}
            max={f.max}
            defaultValue={f.value}
            autoComplete="off"
          />
        </label>
      ))}
      <button className="button secondary" disabled={busy}>
        {submitLabel}
      </button>
    </form>
  );
}
export function Community({ user, state }) {
  const [data, setData] = useState(null),
    [tab, setTab] = useState('friends'),
    [team, setTeam] = useState(null),
    [match, setMatch] = useState(null),
    [board, setBoard] = useState([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [selection, setSelection] = useState(null);
  const matchId = match?.id,
    teamId = team?.id;
  const selected =
    selection ?? (data ? JSON.parse(data.portfolio.achievements) : []);
  const refresh = useCallback(async () => {
    const d = await api('/community');
    setData(d);
    setBoard((await api('/friends/leaderboard')).entries);
  }, []);
  useEffect(() => {
    if (user && !isDemoMode)
      Promise.resolve()
        .then(refresh)
        .catch((e) => setError(e.message));
  }, [user, refresh]);
  useEffect(() => {
    if (!user || isDemoMode) return;
    const timer = setInterval(() => {
      if (matchId)
        api(`/matches/${matchId}`)
          .then((r) => setMatch({ ...r, receivedAt: Date.now() }))
          .catch((e) => setError(e.message));
      else if (teamId)
        api(`/teams/${teamId}`)
          .then(setTeam)
          .catch((e) => setError(e.message));
      else refresh().catch((e) => setError(e.message));
    }, 3000);
    return () => clearInterval(timer);
  }, [user, matchId, teamId, refresh]);
  async function act(path, body, kind) {
    setBusy(true);
    setError('');
    try {
      const r = await api(path, body);
      if (kind === 'team') setTeam(r);
      if (kind === 'match') setMatch({ ...r, receivedAt: Date.now() });
      await refresh();
      return r;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (isDemoMode)
    return (
      <section className="panel roadmap-panel">
        <h2>Learn together on the connected app</h2>
        <p>
          Friends, shared portfolios, head-to-head matches, and corporate teams
          require the QA Quest API deployment. This GitHub Pages demo stores
          data only in your browser and cannot connect players across devices.
        </p>
        <ShareAchievements state={state} />
      </section>
    );
  if (!user)
    return (
      <p className="panel roadmap-panel">
        Start a guest quest or sign in to join the community.
      </p>
    );
  return (
    <div className="roadmap-stack">
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="segmented">
        {['friends', 'teams', 'matches', 'portfolio'].map((id) => (
          <button
            key={id}
            className={tab === id ? 'selected' : ''}
            onClick={() => {
              setTab(id);
              setTeam(null);
              setMatch(null);
              setError('');
            }}
          >
            {id[0].toUpperCase() + id.slice(1)}
          </button>
        ))}
      </div>
      {!data ? (
        <p>Loading community…</p>
      ) : (
        <>
          {tab === 'friends' && (
            <section className="panel roadmap-panel">
              <h2>Your learning circle</h2>
              <p>
                Your public friend code:{' '}
                <code className="share-code">{data.publicId}</code>
              </p>
              <Form
                title="Invite a friend"
                fields={[{ name: 'code', label: 'Their public code' }]}
                busy={busy}
                onSubmit={(v) => act('/friends/request', v)}
              />
              <div className="roadmap-cards">
                <article>
                  <h3>Incoming invitations</h3>
                  {data.incoming.map((f) => (
                    <p key={f.id}>
                      {f.name}{' '}
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          act('/friends/respond', {
                            id: f.id,
                            action: 'accept',
                          })
                        }
                      >
                        Accept
                      </button>{' '}
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          act('/friends/respond', {
                            id: f.id,
                            action: 'reject',
                          })
                        }
                      >
                        Reject
                      </button>
                    </p>
                  ))}
                  {!data.incoming.length && <p>No pending invitations.</p>}
                </article>
                <article>
                  <h3>Friends</h3>
                  {data.friends.map((f) => (
                    <p key={f.code}>
                      {f.name}{' '}
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => act('/friends/remove', { code: f.code })}
                      >
                        Remove
                      </button>
                    </p>
                  ))}
                  {!data.friends.length && (
                    <p>Invite an explorer to learn together.</p>
                  )}
                  <h3>Sent invitations</h3>
                  {data.outgoing.map((f) => (
                    <p key={f.id}>
                      {f.name} · Pending{' '}
                      <button
                        className="text-button"
                        onClick={() => act('/friends/remove', { code: f.code })}
                        disabled={busy}
                      >
                        Cancel
                      </button>
                    </p>
                  ))}
                </article>
              </div>
              <h3>Friends · weekly XP</h3>
              <ol>
                {board.map((e) => (
                  <li key={e.id}>
                    {e.name} — {e.xp} XP{e.isCurrentUser ? ' (you)' : ''}
                  </li>
                ))}
              </ol>
              {!board.length && (
                <p>Complete a challenge to enter this week’s rankings.</p>
              )}
            </section>
          )}
          {tab === 'teams' &&
            (team ? (
              <section className="panel roadmap-panel">
                <button className="text-button" onClick={() => setTeam(null)}>
                  ← All teams
                </button>
                <h2>{team.name}</h2>
                {team.isOwner && (
                  <>
                    <p>
                      Invite code (expires{' '}
                      {new Date(team.inviteExpires).toLocaleString()}):{' '}
                      <code className="share-code">{team.inviteCode}</code>
                    </p>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        act(`/teams/${team.id}/invite`, {}, 'team')
                      }
                    >
                      Replace invitation code
                    </button>
                  </>
                )}
                <h3>Members</h3>
                {team.members.map((m) => (
                  <p key={m.code}>
                    {m.name}
                    {m.isOwner ? ' · Owner' : ''}
                    {m.isYou ? ' · You' : ''}
                    {team.isOwner && !m.isOwner && (
                      <>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={async () => {
                            await act(`/teams/${team.id}/members`, {
                              action: 'remove',
                              code: m.code,
                            });
                            const v = await act(`/teams/${team.id}`);
                            if (v) setTeam(v);
                          }}
                        >
                          Remove
                        </button>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={async () => {
                            await act(`/teams/${team.id}/members`, {
                              action: 'transfer',
                              code: m.code,
                            });
                            const v = await act(`/teams/${team.id}`);
                            if (v) setTeam(v);
                          }}
                        >
                          Transfer ownership
                        </button>
                      </>
                    )}
                  </p>
                ))}
                {!team.isOwner && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await act(`/teams/${team.id}/members`, {
                          action: 'leave',
                        })
                      )
                        setTeam(null);
                    }}
                  >
                    Leave team
                  </button>
                )}
                {team.isOwner && (
                  <Form
                    title="Start a tournament"
                    fields={[
                      { name: 'name', label: 'Tournament name', maxLength: 60 },
                      {
                        name: 'durationHours',
                        label: 'Duration in hours (1–168)',
                        type: 'number',
                        min: 1,
                        max: 168,
                        value: 24,
                      },
                    ]}
                    busy={busy}
                    onSubmit={(v) =>
                      act(
                        `/teams/${team.id}/tournaments`,
                        { ...v, durationHours: Number(v.durationHours) },
                        'team',
                      )
                    }
                  />
                )}
                <h3>Team tournaments</h3>
                <p>
                  Each distinct challenge cleared during the tournament earns
                  100 points. Attempts must start after joining. Replays of the
                  same challenge do not add points.
                </p>
                {team.tournaments.map((t) => (
                  <article className="tournament" key={t.id}>
                    <h3>{t.name}</h3>
                    <p>
                      {new Date(t.startsAt).toUTCString()} –{' '}
                      {new Date(t.endsAt).toUTCString()}
                    </p>
                    <ol>
                      {t.entries.map((e) => (
                        <li key={e.code}>
                          {e.name} — {e.score} points
                        </li>
                      ))}
                    </ol>
                  </article>
                ))}
              </section>
            ) : (
              <section className="panel roadmap-panel">
                <h2>Corporate teams & tournaments</h2>
                <p>
                  Create a private learning group, invite colleagues, and run
                  timed tournaments.
                </p>
                <div className="roadmap-cards">
                  <Form
                    title="Create team"
                    fields={[
                      { name: 'name', label: 'Team name', maxLength: 60 },
                    ]}
                    busy={busy}
                    onSubmit={(v) => act('/teams', v, 'team')}
                  />
                  <Form
                    title="Join team"
                    fields={[{ name: 'code', label: 'Invitation code' }]}
                    busy={busy}
                    onSubmit={(v) => act('/teams/join', v, 'team')}
                  />
                </div>
                <h3>Your teams</h3>
                {data.teams.map((t) => (
                  <p key={t.id}>
                    <button
                      className="button secondary"
                      onClick={() => act(`/teams/${t.id}`, undefined, 'team')}
                    >
                      {t.name}
                      {t.isOwner ? ' · Owner' : ''}
                    </button>
                  </p>
                ))}
              </section>
            ))}
          {tab === 'matches' &&
            (match ? (
              <Match
                key={match.id}
                match={match}
                busy={busy}
                act={act}
                onBack={() => setMatch(null)}
              />
            ) : (
              <section className="panel roadmap-panel">
                <h2>Head-to-head QA</h2>
                <p>
                  Three shared questions, two explorers, two minutes. Accuracy
                  wins; faster submission breaks a tie. Matches do not award
                  curriculum XP.
                </p>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => act('/matches', {}, 'match')}
                >
                  Create match
                </button>
                <Form
                  title="Join match"
                  fields={[{ name: 'code', label: 'Match invitation code' }]}
                  busy={busy}
                  onSubmit={(v) => act('/matches/join', v, 'match')}
                />
                <h3>Recent matches</h3>
                {data.matches.map((m) => (
                  <p key={m.id}>
                    <button
                      className="button secondary"
                      onClick={() =>
                        act(`/matches/${m.id}`, undefined, 'match')
                      }
                    >
                      {m.players.map((p) => p.name).join(' vs ')} · {m.status}
                    </button>
                  </p>
                ))}
              </section>
            ))}
          {tab === 'portfolio' && (
            <section className="panel roadmap-panel">
              <h2>Your portfolio</h2>
              <p>
                Choose earned achievements to publish alongside your display
                name, level, and total completed challenges. Anyone with the
                link can view it until you revoke sharing.
              </p>
              <fieldset>
                <legend>Achievements to publish</legend>
                {state.achievements
                  .filter((a) => a.earned)
                  .map((a) => (
                    <label className="portfolio-option" key={a.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(a.id)}
                        onChange={() =>
                          setSelection(
                            selected.includes(a.id)
                              ? selected.filter((id) => id !== a.id)
                              : [...selected, a.id],
                          )
                        }
                      />
                      {a.name}
                    </label>
                  ))}
              </fieldset>
              <div className="roadmap-actions">
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    act('/portfolio', {
                      enabled: true,
                      achievementIds: selected,
                    })
                  }
                >
                  Publish selected achievements
                </button>
                <button
                  className="button secondary"
                  disabled={busy || !data.portfolio.enabled}
                  onClick={() =>
                    act('/portfolio', { enabled: false, achievementIds: [] })
                  }
                >
                  Revoke public sharing
                </button>
              </div>
              {!!data.portfolio.enabled && (
                <>
                  <p>
                    Public portfolio:{' '}
                    <a
                      href={`?portfolio=${encodeURIComponent(data.publicId)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open shared page ↗
                    </a>
                  </p>
                  <label>
                    Paste this link into your portfolio site
                    <input
                      readOnly
                      value={`${location.origin}${import.meta.env.BASE_URL}?portfolio=${data.publicId}`}
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                </>
              )}
              <ShareAchievements state={state} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
