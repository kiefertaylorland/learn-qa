import { useEffect, useState } from 'react';
export function Match({ match, busy, act, onBack }) {
  const [answers, setAnswers] = useState({}),
    [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const serverNow = match.serverNow + clock - match.receivedAt;
  const me = match.players.find((p) => p.isYou),
    finished = match.status === 'finished';
  const remaining = Math.max(
    0,
    Math.ceil(
      ((match.status === 'countdown' ? match.startsAt : match.endsAt) -
        serverNow) /
        1000,
    ),
  );
  return (
    <section className="panel roadmap-panel">
      <button className="text-button" onClick={onBack}>
        ← Matches (timer continues)
      </button>
      <h2>{match.players.map((p) => p.name).join(' vs ')}</h2>
      <p role="status">
        {match.status === 'countdown'
          ? `Starts in ${remaining} seconds`
          : match.status === 'playing'
            ? `${remaining} seconds remaining`
            : match.status}
      </p>
      {match.status === 'lobby' && (
        <>
          <p>
            Invite a second explorer with{' '}
            <code className="share-code">{match.code}</code>. Lobby expires in
            15 minutes.
          </p>
          <p>
            {match.players
              .map((p) => `${p.name}: ${p.ready ? 'ready' : 'not ready'}`)
              .join(' · ')}
          </p>
          <div className="roadmap-actions">
            <button
              className="button primary"
              disabled={busy || me.ready}
              onClick={() => act(`/matches/${match.id}/ready`, {}, 'match')}
            >
              Ready
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => act(`/matches/${match.id}/cancel`, {}, 'match')}
            >
              Cancel lobby
            </button>
          </div>
        </>
      )}
      {me.submitted && !finished && (
        <p role="status">
          Submission locked. Waiting for your opponent or the deadline before
          revealing answers.
        </p>
      )}
      {match.questions.map((q) => (
        <fieldset
          className="match-question"
          key={q.id}
          disabled={busy || me.submitted || finished || remaining === 0}
        >
          <legend>{q.prompt}</legend>
          {q.options.map((o) => (
            <label className="portfolio-option" key={o.id}>
              <input
                type="checkbox"
                checked={(answers[q.id] || []).includes(o.id)}
                onChange={() =>
                  setAnswers((prev) => ({
                    ...prev,
                    [q.id]: (prev[q.id] || []).includes(o.id)
                      ? prev[q.id].filter((id) => id !== o.id)
                      : [...(prev[q.id] || []), o.id],
                  }))
                }
              />
              {o.text}
              {finished && q.correctAnswers.includes(o.id) && ' ✓ Expected'}
            </label>
          ))}
          {finished && <p>{q.explanation}</p>}
        </fieldset>
      ))}
      {match.status === 'playing' && !me.submitted && (
        <button
          className="button primary"
          disabled={busy || remaining === 0}
          onClick={() =>
            act(
              `/matches/${match.id}/submit`,
              {
                answers: match.questions.map((q) => ({
                  questionId: q.id,
                  options: answers[q.id] || [],
                })),
              },
              'match',
            )
          }
        >
          Submit all answers
        </button>
      )}
      {finished && (
        <>
          <h3>
            {match.winner
              ? `${match.players.find((p) => p.code === match.winner)?.name} wins`
              : 'A tie!'}
          </h3>
          {match.players.map((p) => (
            <p key={p.code}>
              {p.name}: {p.accuracy}% · {p.duration}s
              {p.submitted ? '' : ' · No submission'}
            </p>
          ))}
        </>
      )}
      {['finished', 'expired', 'cancelled'].includes(match.status) && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => act(`/matches/${match.id}/rematch`, {}, 'match')}
        >
          Create rematch invitation
        </button>
      )}
      <p className="fine-print">
        Reconnect or reopen this match to recover its current state. Unsubmitted
        answers are kept only while this panel is open. Live state refreshes
        every three seconds.
      </p>
    </section>
  );
}
