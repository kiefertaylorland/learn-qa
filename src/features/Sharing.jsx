import { useEffect, useState } from 'react';
import { api } from 'virtual:qa-api';
function download(name, value, type = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ShareAchievements({ state }) {
  const [message, setMessage] = useState('');
  const text = `${state.profile.name} · QA Quest\nLevel ${state.profile.level} · ${state.completed.length} challenges mastered\n${state.achievements
    .filter((a) => a.earned)
    .map((a) => `- ${a.name}: ${a.description}`)
    .join('\n')}`;
  return (
    <div className="roadmap-actions">
      <button
        className="button secondary"
        disabled={!state.achievements.some((a) => a.earned)}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setMessage('Achievement summary copied.');
          } catch {
            setMessage('Clipboard unavailable. Use Download summary.');
          }
        }}
      >
        Copy earned achievements
      </button>
      <button
        className="button secondary"
        onClick={() => download('qa-quest-achievements.md', text)}
      >
        Download summary
      </button>
      <span role="status">{message}</span>
    </div>
  );
}
export function PublicPortfolio() {
  const [data, setData] = useState(null),
    [error, setError] = useState('');
  useEffect(() => {
    api(
      `/portfolio/${encodeURIComponent(new URLSearchParams(location.search).get('portfolio'))}`,
    )
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="public-portfolio">
      <a href={import.meta.env.BASE_URL}>← QA Quest</a>
      <h1>QA learning portfolio</h1>
      {error ? (
        <p role="alert">{error}</p>
      ) : data ? (
        <>
          <h2>{data.name}</h2>
          <p>
            Level {data.level} · {data.completed} challenges mastered
          </p>
          <div className="roadmap-cards">
            {data.achievements.map((a) => (
              <article className="panel roadmap-panel" key={a.id}>
                <h3>{a.name}</h3>
                <p>{a.description}</p>
              </article>
            ))}
          </div>
          <p className="muted">
            A record of practice in QA Quest, not a professional certification.
          </p>
          <button
            className="button secondary"
            onClick={() =>
              download(
                'qa-portfolio.json',
                JSON.stringify(data, null, 2),
                'application/json',
              )
            }
          >
            Download portfolio
          </button>
        </>
      ) : (
        <p>Loading portfolio…</p>
      )}
    </main>
  );
}
