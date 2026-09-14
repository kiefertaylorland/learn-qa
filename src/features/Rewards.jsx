import { useCallback, useEffect, useState } from 'react';
import { api } from 'virtual:qa-api';
export function Rewards({ user, onStart, onEquip }) {
  const [data, setData] = useState(null),
    [quests, setQuests] = useState([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const [r, q] = await Promise.all([
      api('/rewards'),
      api('/seasons/challenges'),
    ]);
    setData(r);
    setQuests(q.challenges);
    onEquip(r.equipped);
  }, [onEquip]);
  useEffect(() => {
    if (user)
      Promise.resolve()
        .then(refresh)
        .catch((e) => setError(e.message));
  }, [user, refresh]);
  async function act(path, body) {
    setBusy(true);
    setError('');
    try {
      const next = await api(path, body);
      setData(next);
      onEquip(next.equipped);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!user)
    return (
      <p className="panel roadmap-panel">
        Start a guest quest or sign in to collect credits and seasonal rewards.
      </p>
    );
  if (!data) return <p role="status">{error || 'Loading rewards…'}</p>;
  return (
    <div className="roadmap-stack">
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <section className="panel roadmap-panel">
        <span className="eyebrow">{data.season.id} · FREE SEASON</span>
        <h2>{data.season.name}</h2>
        <p>
          Ends {new Date(data.season.endsAt).toUTCString()}. Complete three
          exclusive missions and claim your rewards.
        </p>
        <p>
          Season progress: {data.season.progress} / 3. Seasonal missions earn
          tier credits; permanent curriculum first clears earn XP.
        </p>
        <div className="roadmap-cards">
          {quests.map((q) => (
            <article key={q.id}>
              <h3>{q.title}</h3>
              <p>
                {data.season.completed.includes(q.id)
                  ? '✓ Completed'
                  : 'Season-exclusive mission'}
              </p>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => onStart(q)}
              >
                {data.season.completed.includes(q.id)
                  ? 'Practice again'
                  : 'Play mission'}
              </button>
            </article>
          ))}
        </div>
        <div className="roadmap-actions">
          {data.season.tiers.map((t) => (
            <button
              key={t.tier}
              className="button secondary"
              disabled={busy || t.claimed || data.season.progress < t.required}
              onClick={() =>
                act('/seasons/claim', { season: data.season.id, tier: t.tier })
              }
            >
              {t.claimed ? '✓ Claimed' : `Tier ${t.tier}: ${t.credits} credits`}
            </button>
          ))}
        </div>
        <details>
          <summary>Past reward claims ({data.history.length})</summary>
          <ul>
            {data.history.map((r) => (
              <li key={`${r.season}-${r.tier}`}>
                {r.season}: tier {r.tier}
              </li>
            ))}
          </ul>
        </details>
      </section>
      <section className="panel roadmap-panel">
        <span className="eyebrow">EARNED COSMETICS</span>
        <h2>{data.balance} credits available</h2>
        <p>
          Earn 50 credits per permanent challenge first clear, plus seasonal
          rewards. Cosmetics change your accent color and never affect scoring.
        </p>
        <div className="roadmap-cards">
          {data.cosmetics.map((c) => (
            <article key={c.id} data-theme={c.id}>
              <span className={`color-swatch ${c.id}`} />
              <h3>{c.name}</h3>
              <p>{c.description}</p>
              <p>{c.price} credits</p>
              <button
                className="button secondary"
                disabled={
                  busy ||
                  data.equipped === c.id ||
                  (!data.owned.includes(c.id) && data.balance < c.price)
                }
                onClick={() =>
                  act(
                    data.owned.includes(c.id)
                      ? '/cosmetics/equip'
                      : '/cosmetics/buy',
                    { id: c.id },
                  )
                }
              >
                {data.equipped === c.id
                  ? 'Equipped'
                  : data.owned.includes(c.id)
                    ? 'Equip'
                    : 'Buy cosmetic'}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
