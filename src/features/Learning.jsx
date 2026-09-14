import { modes } from '../../shared/progression.js';
export function Metrics({ metrics }) {
  if (!metrics?.length) return null;
  // Scale separately by unit; different units are never compared on one axis.
  return (
    <div className="measurements">
      <h3>Observed measurements</h3>
      <table>
        <thead>
          <tr>
            <th>Measurement</th>
            <th>Value</th>
            <th>Relative scale within unit</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m, i) => {
            const max = Math.max(
              ...metrics.filter((n) => n.unit === m.unit).map((n) => n.value),
              1,
            );
            return (
              <tr key={i}>
                <th scope="row">{m.label}</th>
                <td>
                  {m.value} {m.unit}
                </td>
                <td>
                  <span className="metric-bar" aria-hidden="true">
                    <i
                      style={{ width: `${Math.max(0, m.value / max) * 100}%` }}
                    />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
export function SkillTree({ state, challenges, onStart, onExplore }) {
  return (
    <section className="panel roadmap-panel">
      <h2>Your skill paths</h2>
      <p className="muted">
        Build foundations, then branch into release confidence, clearer
        requirements, and performance.
      </p>
      <div className="skill-tree">
        {Object.entries(modes).map(([id, mode]) => {
          const progress = state.modeProgress[id] || {
            completed: 0,
            total: mode.total,
          };
          const next =
            challenges.find(
              (c) => c.mode === id && c.unlocked && !c.completed,
            ) || challenges.find((c) => c.mode === id && c.unlocked);
          return (
            <article key={id}>
              <span className="tiny-label">
                {mode.prerequisite
                  ? `↳ Requires ${modes[mode.prerequisite.split('-')[0]].name} level ${mode.prerequisite.split('-')[1]}`
                  : 'Foundation · Start here'}
              </span>
              <h3>{mode.name}</h3>
              <p>{mode.description}</p>
              <progress
                aria-label={`${mode.name} progress`}
                value={progress.completed}
                max={progress.total}
              />
              <p>
                {progress.completed} / {progress.total} mastered
              </p>
              <button
                className="button secondary"
                onClick={() => (next ? onStart(next) : onExplore(id))}
              >
                {next ? 'Practice this path' : 'View prerequisites'}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const exercises = {
  bugs: [
    'Customers aged 18 or older may register.',
    'Which behavior is a defect?',
    'An 18-year-old is rejected.',
    'A 17-year-old is rejected.',
    'The inclusive boundary includes age 18. Rejecting 17 matches the rule.',
  ],
  tests: [
    'A shop offers free delivery on orders of $50 or more.',
    'Which set best checks the boundary?',
    '$49, $50, and $51',
    '$100, $200, and $300',
    'Check just below, at, and just above the threshold.',
  ],
  regression: [
    'The release raises the upload limit to 10 MB. Deleting uploads must still work.',
    'Which observation is a regression?',
    'Deleting an existing upload fails.',
    'A 7 MB upload now succeeds.',
    'The higher limit is intentional. The existing delete operation must still work.',
  ],
  documentation: [
    'A requirement says: search should be fast.',
    'What clarification makes this testable?',
    'Specify a latency percentile, threshold, and workload.',
    'Choose a different name for the search button.',
    'Measurable acceptance criteria let different testers reach the same pass/fail judgment.',
  ],
  performance: [
    'Target: p95 under 500 ms. Observed mean: 100 ms; p95: 800 ms.',
    'Which conclusion follows?',
    'The p95 target fails despite the low mean.',
    'The low mean proves all requests are fast.',
    'Evaluate the stated percentile. An average can hide slow requests.',
  ],
};
export function TutorialExercise({ mode, ready, onReady }) {
  const [scenario, question, right, wrong, explanation] = exercises[mode];
  return (
    <div className="tutorial-example">
      <strong>{scenario}</strong>
      <p>{question}</p>
      <button
        className={`answer-option ${ready ? 'correct-answer' : ''}`}
        onClick={() => onReady(true)}
      >
        {right}
      </button>
      <button className="answer-option" onClick={() => onReady(false)}>
        {wrong}
      </button>
      <p role="status">
        {ready
          ? `Exactly! ${explanation}`
          : 'Select the best answer to continue.'}
      </p>
    </div>
  );
}
