import { useEffect, useState } from 'react';
import { tutorials } from '../shared/tutorials.js';
export function InstallApp() {
  const [prompt, setPrompt] = useState(null),
    [offline, setOffline] = useState(!navigator.onLine),
    [help, setHelp] = useState(false);
  useEffect(() => {
    const capture = (e) => {
        e.preventDefault();
        setPrompt(e);
      },
      online = () => setOffline(false),
      off = () => setOffline(true);
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('online', online);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', off);
    };
  }, []);
  return (
    <section className="install-app">
      <p role="status">
        {offline
          ? 'Offline: reconnect before starting or submitting timed challenges.'
          : ''}
      </p>
      <button
        className="text-button"
        onClick={async () => {
          if (prompt) {
            await prompt.prompt();
            setPrompt(null);
          } else setHelp(!help);
        }}
      >
        Install QA Quest
      </button>
      {help && (
        <p className="fine-print">
          Use your browser’s Install app option. On iPhone or iPad, open in
          Safari, tap Share, then Add to Home Screen. Availability depends on
          your browser. HTTPS is required outside localhost.
        </p>
      )}
    </section>
  );
}
export function VideoLibrary() {
  return (
    <section className="video-library">
      <h2>Thirty-second QA lessons</h2>
      <p className="muted">
        Original silent teaching clips, with English captions and full
        transcripts.
      </p>
      <div className="roadmap-cards">
        {tutorials.map((t) => (
          <article className="panel" key={t.id}>
            <h3>{t.title}</h3>
            <video controls preload="metadata" playsInline aria-label={t.title}>
              <source
                src={`${import.meta.env.BASE_URL}tutorials/${t.id}.mp4`}
                type="video/mp4"
              />
              <track
                kind="captions"
                src={`${import.meta.env.BASE_URL}tutorials/${t.id}.vtt`}
                srcLang="en"
                label="English"
                default
              />
              Your browser does not support video. Read the transcript below.
            </video>
            <details>
              <summary>Read transcript</summary>
              {t.slides.map(([title, body]) => (
                <p key={title}>
                  <strong>{title}.</strong> {body}
                </p>
              ))}
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
