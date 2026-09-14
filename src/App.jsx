import { useCallback, useEffect, useRef, useState } from 'react'
import { api, isDemoMode, subscribeToLeaderboard } from 'virtual:qa-api'
import './App.css'
import { modes as MODES, totalChallenges } from '../shared/progression.js'
import { SkillTree, Rewards, Community, ShareAchievements, Metrics, TutorialExercise } from './Roadmap.jsx'
import { InstallApp, VideoLibrary } from './Mobile.jsx'

const EMPTY = {
  profile: { name: 'Explorer', level: 1, xp: 0, streak: 0 },
  completed: [], achievements: [],
  stats: { attempts: 0, completed: 0, accuracy: 0, weeklyXp: 0 },
  modeProgress: Object.fromEntries(Object.entries(MODES).map(([id,m])=>[id,{completed:0,total:m.total}])),
}
const TERMS = [
  ['Acceptance criteria', 'Specific, testable conditions that a feature must satisfy to be accepted.'],
  ['Boundary value analysis', 'Testing at and just either side of a limit, such as ages 17, 18, and 19 for an 18+ rule.'],
  ['Equivalence partitioning', 'Grouping inputs expected to behave alike and testing a representative from each group.'],
  ['Regression testing', 'Re-running tests after a change to check that existing behavior still works.'],
  ['Happy path', 'The expected successful journey with valid inputs and no errors.'],
  ['Negative testing', 'Checking that invalid inputs and unexpected actions are handled safely.'],
  ['Test case', 'A set of preconditions, inputs, actions, and expected results used to verify behavior.'],
  ['Severity vs. priority', 'Severity describes impact; priority describes how urgently an issue should be addressed.'],
  ['Smoke testing', 'A small set of checks that confirms the most important functions work before deeper testing.'],
  ['Quality assurance', 'Activities that improve development processes and help prevent defects, not only find them.'],
]

function Icon({ name, size = 20, ...props }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    bug: <><path d="M9 4 7 2m8 2 2-2M4 9H1m22 0h-3M4 15H1m22 0h-3M6 19l-3 3m15-3 3 3" /><rect x="5" y="5" width="14" height="16" rx="7" /><path d="M5 10h14m-7 0v11" /></>,
    code: <><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" /></>,
    trophy: <><path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H3v2a5 5 0 0 0 5 5m8-7h5v2a5 5 0 0 1-5 5m-4 1v7m-5 1h10" /></>,
    badge: <><path d="m8 14-2 8 6-3 6 3-2-8" /><circle cx="12" cy="9" r="7" /><path d="m12 5 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" /></>,
    book: <><path d="M12 5v16M12 5C8 2 4 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-2-1-6-2-10 1Z" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    flame: <path d="M13 2c1 7-6 7-5 12-2-1-3-3-3-3-4 6 0 11 7 11s10-6 7-11c0 4-3 4-3 4 3-7-3-13-3-13Z" />,
    bolt: <path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z" />,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    search: <><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" /></>,
    logout: <><path d="M9 3H3v18h6m6-15 6 6-6 6m-7-6h13" /></>,
    spark: <><path d="m12 3 2 6 6 3-6 2-2 7-2-7-7-2 7-3 2-6Zm8-2v4m-2-2h4" /></>,
    menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.spark}</svg>
}

function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Storage is optional in private browsing. */ }
}
function Modal({ title, children, onClose }) {
  const ref = useRef()
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} className="modal" aria-labelledby="modal-title" onCancel={onClose}>
    <div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button></div>
    {children}
  </dialog>
}
function Auth({ onClose, onSuccess, isGuest }) {
  const [tab, setTab] = useState('register')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    setBusy(true); setError('')
    try { await onSuccess(await api(`/auth/${tab}`, values)) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function guest() {
    setBusy(true); setError('')
    try { await onSuccess(await api('/auth/guest', {})) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <Modal title={isGuest ? 'Make your progress yours' : 'Your QA adventure starts here'} onClose={onClose}>
    <p className="muted">Learn by doing. No experience needed.</p>
    <div className="segmented"><button className={tab === 'register' ? 'selected' : ''} onClick={() => setTab('register')}>Create account</button><button className={tab === 'login' ? 'selected' : ''} onClick={() => setTab('login')}>Sign in</button></div>
    <form onSubmit={submit} className="auth-form">
      {tab === 'register' && <label>Display name<input name="name" required minLength={2} maxLength={30} autoComplete="nickname" placeholder="Your explorer name" /></label>}
      <label>Email<input type="email" name="email" required maxLength={254} autoComplete="email" placeholder="you@example.com" /></label>
      <label>Password<input type="password" name="password" required minLength={tab === 'register' ? 10 : 1} maxLength={128} autoComplete={tab === 'register' ? 'new-password' : 'current-password'} placeholder={tab === 'register' ? 'At least 10 characters' : 'Your password'} /></label>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button className="button primary wide" disabled={busy}>{busy ? 'One moment…' : tab === 'register' ? 'Create account' : 'Sign in'}<Icon name="arrow" /></button>
    </form>
    {!isGuest && <button className="button secondary wide guest-button" disabled={busy} onClick={guest}>Explore as a guest</button>}
    <p className="fine-print">Your display name and scores appear on the leaderboard. {isGuest ? 'Creating an account keeps your guest progress.' : 'Guest progress stays linked to this browser’s session.'}</p>
  </Modal>
}
function Countdown({ expiresAt, onExpire }) {
  const [now, setNow] = useState(Date.now)
  const expired = useRef(false)
  const remaining = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000))
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer) }, [])
  useEffect(() => {
    if (remaining === 0 && !expired.current) { expired.current = true; onExpire() }
  }, [remaining, onExpire])
  return <span className={`timer ${remaining < 30 ? 'urgent' : ''}`} role="timer" aria-label={`${remaining} seconds remaining`}><Icon name="clock" />{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</span>
}
function Leaderboard({ entries, category, compact = false }) {
  return entries.length ? <div className={`leaderboard ${compact ? 'compact' : ''}`}>
    <div className="leaderboard-row table-heading"><span>#</span><span>Explorer</span><span>{category === 'accuracy' ? 'Accuracy' : category === 'speed' ? 'Avg. time' : 'Weekly XP'}</span></div>
    {entries.slice(0, compact ? 5 : 50).map((entry) => <div className={`leaderboard-row ${entry.isCurrentUser ? 'your-row' : ''}`} key={entry.id}>
      <span className={`rank rank-${entry.rank}`}>{entry.rank === 1 ? <Icon name="trophy" size={17} /> : String(entry.rank).padStart(2, '0')}</span>
      <div className="leader-person"><span className={`avatar avatar-${entry.rank % 4}`}>{entry.name.slice(0, 2).toUpperCase()}</span><div><strong>{entry.name}{entry.isCurrentUser && <small> YOU</small>}</strong><span>Level {entry.level}</span></div></div>
      <strong className="leader-score">{category === 'accuracy' ? `${Math.round(entry.accuracy)}%` : category === 'speed' ? `${Number(entry.speed).toFixed(1)}s` : `${entry.xp.toLocaleString()}`}<small>{category === 'xp' ? ' XP' : ''}</small></strong>
    </div>)}
  </div> : <div className="empty-state"><Icon name="trophy" size={32} /><h3>The podium is open</h3><p>Finish a challenge to join this week’s leaderboard. Only real explorer scores appear here.</p></div>
}

export default function App() {
  const [theme,setTheme] = useState('default')
  const [user, setUser] = useState(null)
  const [state, setState] = useState(EMPTY)
  const [challenges, setChallenges] = useState([])
  const [daily, setDaily] = useState(null)
  const [board, setBoard] = useState({ entries: [], week: '' })
  const [page, setPage] = useState('dashboard')
  const [filter, setFilter] = useState('all')
  const [category, setCategory] = useState('xp')
  const [range, setRange] = useState('all')
  const [modal, setModal] = useState(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [active, setActive] = useState(null)
  const [answers, setAnswers] = useState([])
  const [draft, setDraft] = useState('')
  const [result, setResult] = useState(null)
  const [mobileNav, setMobileNav] = useState(false)
  const [tutorialReady, setTutorialReady] = useState(false)
  const submitting = useRef(false)
  const main = useRef()

  const refresh = useCallback(async (currentUser) => {
    const [nextState, catalog, nextDaily] = await Promise.all([api('/state'), api('/challenges'), api('/daily')])
    const rewards = await api('/rewards'); setTheme(rewards.equipped)
    setState(nextState); setChallenges(catalog.challenges); setDaily(nextDaily)
    writeLocal(`qa-progress-${currentUser.id}`, nextState)
  }, [])
  const refreshBoard = useCallback(async () => {
    try { setBoard(await api(`/leaderboard?category=${category}&range=${encodeURIComponent(range)}`)) } catch { /* Gameplay remains available when the live board is offline. */ }
  }, [category, range])
  useEffect(() => {
    let disposed = false
    async function init() {
      try {
        const { user: currentUser } = await api('/me')
        if (disposed) return
        setUser(currentUser)
        if (currentUser) {
          const cache = readLocal(`qa-progress-${currentUser.id}`, null)
          if (cache?.profile && cache?.stats && cache?.modeProgress && Array.isArray(cache.achievements) && Array.isArray(cache.completed)) setState(cache)
          await refresh(currentUser)
        }
      } catch (err) { if (!disposed) setError(`Could not sync with the server. ${err.message}`) }
      finally { if (!disposed) setInitializing(false) }
    }
    init()
    return () => { disposed = true }
  }, [refresh])
  useEffect(() => {
    Promise.resolve().then(refreshBoard)
    return subscribeToLeaderboard(refreshBoard)
  }, [refreshBoard])
  useEffect(() => {
    if (active && !result) {
      const warn = (event) => { event.preventDefault(); event.returnValue = '' }
      window.addEventListener('beforeunload', warn)
      return () => window.removeEventListener('beforeunload', warn)
    }
  }, [active, result])
  useEffect(() => { main.current?.focus() }, [page, active, result])
  useEffect(() => {
    const sync = () => { if (!document.hidden && user && !active) refresh(user).catch((err) => setError(err.message)) }
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [user, active, refresh])

  function navigate(next, force = false) {
    if (!force && active && !result && !window.confirm('Leave this challenge? The timer will keep running, and no XP will be awarded.')) return
    setActive(null); setResult(null); setPage(next); setMobileNav(false); setError('')
  }
  async function authSuccess(data) {
    setUser(data.user); setModal(null); setError(''); setState(EMPTY)
    await refresh(data.user); await refreshBoard()
  }
  async function explore(mode = 'all') {
    setFilter(mode)
    if (!user) {
      setBusy(true); setError('')
      try { await authSuccess(await api('/auth/guest', {})); setPage('challenges') } catch (err) { setError(err.message) } finally { setBusy(false) }
    } else navigate('challenges')
  }
  async function logout() {
    setBusy(true)
    try { await api('/auth/logout', {}); setUser(null); setState(EMPTY); setChallenges([]); setDaily(null); navigate('dashboard', true); refreshBoard() } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function start(challenge, isDaily = false, skipTutorial = false) {
    if (!user) { setModal('auth'); return }
    if (!skipTutorial && !readLocal(`qa-tutorial-${user.id}-${challenge.mode}`, false)) {
      setTutorialReady(false); setModal({ type: 'tutorial', challenge, isDaily }); return
    }
    setBusy(true); setError('')
    try {
      const attempt = await api('/attempts', { challengeId: challenge.id, daily: isDaily, seasonal: !!challenge.seasonal })
      setAnswers([]); setDraft(''); setResult(null); setActive(attempt); setPage('challenges'); setModal(null)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const submit = useCallback(async () => {
    if (!active || submitting.current || result) return
    submitting.current = true; setBusy(true); setError('')
    try {
      const outcome = await api(`/attempts/${active.attemptId}/submit`, { answers })
      setResult(outcome); setState(outcome.state)
      writeLocal(`qa-progress-${user.id}`, outcome.state)
      await Promise.all([refresh(user), refreshBoard()])
    } catch (err) { setError(err.message) }
    finally { submitting.current = false; setBusy(false) }
  }, [active, answers, result, user, refresh, refreshBoard])

  const profile = state.profile
  const levelXp = profile.xp % 500
  const earned = state.achievements.filter((badge) => badge.earned)
  const headings = { dashboard: 'Your next level starts here.', challenges: 'Small challenges. Real skills.', leaderboard: 'A little friendly competition.', achievements: 'Milestones worth celebrating.', learn: 'Build your QA toolkit.', path:'Choose your learning path.', rewards:'Make progress. Make it yours.', community:'Learn and compete together.' }

  function modeCard(mode) {
    const info = MODES[mode]
    const progress = state.modeProgress[mode] || {completed:0,total:info.total}
    return <button className={`mode-card ${info.color}`} onClick={() => explore(mode)} disabled={busy || initializing}>
      <div className="mode-card-top"><span className={`mode-icon ${info.color}`}><Icon name={info.icon} size={25} /></span><span className="pill">{info.total} LEVELS</span><Icon name="arrow" /></div>
      <h3>{info.name}</h3><p>{info.description}</p>
      <div className="mode-progress"><span>{progress.completed} / {progress.total} completed</span><strong>{Math.round(progress.completed / progress.total * 100)}%</strong></div>
      <div className="progress-track"><span style={{ width: `${progress.completed / progress.total * 100}%` }} /></div>
      <div className="mode-bottom"><span><i />{{bugs:'FUNCTIONAL TESTING',tests:'TEST DESIGN',regression:'RELEASE CONFIDENCE',documentation:'REQUIREMENTS',performance:'PERFORMANCE'}[mode]}</span><span>1–3 min <Icon name="clock" size={13} /></span></div>
    </button>
  }

  return <div className="app-shell" data-theme={theme}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`} aria-label="Main navigation">
      <a href="#dashboard" className="brand" onClick={(event) => { event.preventDefault(); navigate('dashboard') }}><span className="brand-mark"><Icon name="code" size={23} /></span>qa<span>quest</span><span className="brand-dot">.</span></a>
      <div className="workspace-label">YOUR ADVENTURE</div>
      <nav>{[['dashboard', 'grid', 'Overview'], ['challenges', 'code', 'Challenges'], ['learn', 'book', 'Learning hub'], ['leaderboard', 'trophy', 'Leaderboard'], ['achievements', 'badge', 'Achievements'], ['path','target','Skill paths'], ['rewards','spark','Season & cosmetics'], ['community','user','Community']].map(([id, icon, label]) =>
        <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => id === 'challenges' && !user ? explore() : navigate(id)} disabled={busy || initializing}><Icon name={icon} />{label}{id === 'challenges' && <span className="nav-count">{totalChallenges}</span>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="sidebar-tip"><span className="tiny-label"><Icon name="spark" size={15} /> A LITTLE BETTER, EVERY DAY</span><p>Great QA engineers aren’t born.<br />They’re built, one bug at a time.</p><button onClick={() => { setQuery(''); setModal('glossary') }}>Explore the glossary <Icon name="arrow" size={15} /></button></div>
        <div className="sidebar-profile"><span className="avatar">{profile.name.slice(0, 2).toUpperCase()}</span><div><strong>{profile.name}</strong><span>{user ? profile.isGuest ? 'Guest explorer' : 'QA adventurer' : 'Your adventure awaits'}</span></div><button className="icon-button" aria-label={user ? 'Account settings' : 'Sign in'} onClick={() => setModal(user && !profile.isGuest ? 'account' : 'auth')}><Icon name="user" size={18} /></button></div>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label="Toggle navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(!mobileNav)}><Icon name="menu" /></button>
        <div className="breadcrumb">Workspace <Icon name="chevron" size={13} /><strong>{page === 'dashboard' ? 'Overview' : page === 'learn' ? 'Learning hub' : page.charAt(0).toUpperCase() + page.slice(1)}</strong></div>
        <div className="topbar-actions"><button className="glossary-button" onClick={() => { setQuery(''); setModal('glossary') }}><Icon name="search" size={17} /><span>QA glossary</span></button><span className="topbar-divider" /><span className="streak-mini"><Icon name="flame" size={19} />{profile.streak}<span>day streak</span></span><button className="avatar small" aria-label={user ? 'Open profile' : 'Sign in'} onClick={() => setModal(user && !profile.isGuest ? 'account' : 'auth')}>{profile.name.slice(0, 1).toUpperCase()}</button></div>
      </header>
      <main id="main-content" ref={main} tabIndex={-1}>
        {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><Icon name="close" size={16} /></button></div>}
        {initializing && <p className="sync-message" role="status">Preparing your adventure…</p>}
        {active ? <section className="challenge-player">
          <button className="text-button back-button" onClick={() => navigate('challenges')}>← Back to challenges</button>
          <div className="section-heading"><div><span className="eyebrow">{MODES[active.challenge.mode].name} / LEVEL {active.challenge.level}</span><h1>{active.challenge.title}</h1></div>{!result && <Countdown key={active.attemptId} expiresAt={active.expiresAt} onExpire={submit} />}</div>
          <div className="play-layout">
            <article className="panel scenario"><div className="panel-label"><Icon name="code" size={17} /> THE SCENARIO</div><h2>Your mission</h2><p>{active.challenge.prompt}</p><Metrics metrics={active.challenge.metrics}/>{active.challenge.code && <pre><code>{active.challenge.code}</code></pre>}<div className="learning-note"><Icon name="book" /><p>{MODES[active.challenge.mode].lesson}</p></div>
              {['tests','documentation'].includes(active.challenge.mode) && <label className="test-draft">Draft a test case <span className="muted">(practice notes, not scored or saved)</span><textarea value={draft} maxLength={3000} onChange={(event) => setDraft(event.target.value)} placeholder={'Preconditions:\nSteps:\nExpected result:'} rows={6} /></label>}
            </article>
            <article className="panel answer-panel"><div className="panel-label"><Icon name="target" size={17} /> {active.challenge.mode === 'tests' ? 'BUILD YOUR COVERAGE' : 'FOLLOW THE EVIDENCE'}</div><h2>{result ? 'Let’s break it down' : 'What would you flag?'}</h2><p className="muted">Select all that apply. Accuracy includes avoiding false positives.</p>
              <fieldset disabled={!!result || busy}><legend className="sr-only">Choose your answers</legend>{active.challenge.options.map((option, index) => <label key={option.id} className={`answer-option ${answers.includes(option.id) ? 'chosen' : ''} ${result && result.correctAnswers.includes(option.id) ? 'correct-answer' : ''} ${result && answers.includes(option.id) && !result.correctAnswers.includes(option.id) ? 'incorrect-answer' : ''}`}>
                <input type="checkbox" checked={answers.includes(option.id)} onChange={() => setAnswers((previous) => previous.includes(option.id) ? previous.filter((id) => id !== option.id) : [...previous, option.id])} /><span className="option-letter">{String.fromCharCode(65 + index)}</span><span>{option.text}{result && result.correctAnswers.includes(option.id) && <small>✓ Expected answer</small>}{result && answers.includes(option.id) && !result.correctAnswers.includes(option.id) && <small>✕ Not an issue / unnecessary coverage</small>}</span>
              </label>)}</fieldset>
              {!result ? <button className="button primary wide" disabled={busy || answers.length === 0} onClick={submit}>{busy ? 'Checking your work…' : 'Submit answer'}<Icon name="arrow" size={18} /></button> : <div className="result" role="status"><span className={`result-heading ${result.correct ? 'success' : ''}`}><Icon name={result.correct ? 'check' : 'book'} />{result.correct ? 'Nicely done, explorer!' : 'Every attempt is a chance to learn.'}</span><div className="result-numbers"><strong>{result.accuracy}% accuracy</strong><strong>+{result.xpEarned} XP</strong></div><p>{result.explanation}</p>{result.correct && result.xpEarned === 0 && !active.challenge.id.startsWith('season-') && <p className="muted">Already mastered! Replays are for practice; each first clear earns XP.</p>}<button className="button primary wide" onClick={() => navigate('challenges')}>Continue your journey<Icon name="arrow" /></button></div>}
            </article>
          </div>
        </section> : <>
          <div className="page-heading"><div><div className="eyebrow">{page === 'dashboard' ? `LET’S MAKE PROGRESS, ${profile.name.toUpperCase()}` : 'THE QA QUEST'}</div><h1>{headings[page]}</h1><p>{page === 'dashboard' ? 'Sharpen your instincts. Build your skills. Make quality your superpower.' : page === 'challenges' ? 'Choose a challenge and learn something you can use in the real world.' : page === 'leaderboard' ? 'Learn together. Level up together. Rankings reset every Monday, UTC.' : page === 'achievements' ? 'Keep showing up. Your next achievement is closer than you think.' : 'A little knowledge goes a long way. Take it into your next challenge.'}</p></div>{page === 'dashboard' && <span className="edition-tag"><span /> THE LEARNING NEVER STOPS</span>}</div>
          {isDemoMode && <div className="learning-note"><Icon name="spark" /><p>Live demo mode runs entirely in your browser. Progress and accounts stay on this device, and the leaderboard reflects local demo activity.</p></div>}

          {page === 'dashboard' && <>
            <div className="dashboard-grid">
              <section className="hero-card"><div className="hero-copy"><span className="hero-tag"><Icon name="bolt" size={14} /> LEARN BY DOING</span><h2>Good software starts<br />with a curious mind<span>.</span></h2><p>Find the unexpected. Challenge assumptions.<br />Your journey to becoming a QA engineer starts here.</p><button className="button primary" disabled={busy || initializing} onClick={() => explore('bugs')}>{state.completed.length ? 'Continue learning' : 'Start your first quest'}<Icon name="arrow" size={18} /></button><div className="hero-footnote"><span className="mini-check"><Icon name="check" size={11} /></span>Real skills. Bite-sized challenges. Always free.</div></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><span className="art-dot dot-one" /><span className="art-dot dot-two" /><div className="floating-tag tag-code"><Icon name="code" /> test. learn. repeat.</div><div className="bug-tile"><Icon name="bug" size={80} /><span className="tile-corner">✓</span></div><div className="floating-tag tag-check"><span>✓</span> BUG FOUND!</div><div className="art-spark">✧</div></div></section>
              <section className="level-card panel"><div className="panel-label">YOUR PROGRESS <Icon name="spark" size={17} /></div><div className="level-emblem"><Icon name="badge" size={37} /><span>{profile.level}</span></div><h3>{profile.level <= 5 ? 'QA Apprentice' : profile.level <= 15 ? 'Bug Investigator' : profile.level <= 30 ? 'Quality Champion' : 'QA Expert'}</h3><p>Level {profile.level} <span>·</span> Keep the curiosity going</p><div className="xp-line"><strong>{levelXp} <span>/ 500 XP</span></strong><span>Level {profile.level + 1}</span></div><div className="progress-track"><span style={{ width: `${levelXp / 5}%` }} /></div><p className="level-next">{500 - levelXp} XP to your next level</p></section>
            </div>
            <section className="stats-grid" aria-label="Your statistics">
              {[['bolt', 'Total experience', profile.xp.toLocaleString(), 'XP', 'green'], ['target', 'Answer accuracy', Math.round(state.stats.accuracy), '%', 'purple'], ['check', 'Challenges cleared', state.completed.length, `/ ${totalChallenges}`, 'blue'], ['flame', 'Current streak', profile.streak, profile.streak === 1 ? 'day' : 'days', 'orange']].map(([icon, title, value, suffix, color]) => <div className="stat-card" key={title}><span className={`stat-icon ${color}`}><Icon name={icon} size={21} /></span><div><span className="stat-title">{title}</span><div className="stat-value">{value}<span>{suffix}</span></div></div></div>)}
            </section>
            <div className="lower-grid">
              <div><section><div className="section-heading"><div><h2>Choose your challenge</h2><p>Five ways to build a quality-first mindset.</p></div><button className="text-button" onClick={() => explore()}>View all <Icon name="arrow" size={16} /></button></div><div className="mode-grid">{Object.keys(MODES).map(id=><div key={id}>{modeCard(id)}</div>)}</div></section>
                <section className="daily-card"><span className="daily-icon"><Icon name="bolt" size={25} /></span><div><span className="daily-eyebrow">THE DAILY QUEST <span>+{daily?.bonusXp || 150} BONUS XP</span></span><h3>{daily?.title || 'A fresh challenge. A fresh perspective.'}</h3><p>{daily?.completed ? 'Daily quest complete. Come back tomorrow for a new challenge!' : 'One challenge. All explorers. A new opportunity every day.'}</p></div><button className="button secondary" disabled={busy || initializing || daily?.completed} onClick={() => daily ? start({ id: daily.challengeId, mode: daily.mode }, true) : explore()}>{daily?.completed ? 'Completed ✓' : 'Take the quest'}{!daily?.completed && <Icon name="arrow" size={16} />}</button></section>
                <section className="next-up"><Icon name="book" size={20} /><p><strong>Curiosity is your best testing tool.</strong> Not sure what a term means? Your <button onClick={() => { setQuery(''); setModal('glossary') }}>QA glossary</button> is always one click away.</p></section>
              </div>
              <section className="panel weekly-board"><div className="section-heading"><h2><Icon name="trophy" size={19} />Weekly standouts</h2><span className="live-label"><i /> LIVE</span></div><p className="muted board-subtitle">A little inspiration from the community.</p><Leaderboard entries={board.entries} category={category} compact /><button className="text-button board-link" onClick={() => { setCategory('xp'); navigate('leaderboard') }}>View leaderboard<Icon name="arrow" size={16} /></button></section>
            </div>
          </>}

          {page === 'challenges' && <>
            <div className="challenge-toolbar"><div className="segmented">{[['all', 'All challenges'], ...Object.entries(MODES).map(([id,m])=>[id,m.name])].map(([id, title]) => <button key={id} className={filter === id ? 'selected' : ''} onClick={() => setFilter(id)}>{title}</button>)}</div><span className="muted">{state.completed.length} of {totalChallenges} mastered</span></div>
            <div className="learning-note"><Icon name="spark" /><p>Clear each level to unlock the next in that mode. First clears earn XP; replays sharpen your skills. Daily quests can introduce any level.</p></div>
            {!user ? <div className="empty-state panel"><h2>Ready to put your instincts to the test?</h2><p>Start as a guest, or create an account to keep your progress across devices.</p><button className="button primary" onClick={() => explore(filter)} disabled={busy}>Let’s get started<Icon name="arrow" /></button></div> : <div className="challenge-grid">{challenges.filter((challenge) => filter === 'all' || challenge.mode === filter).map((challenge) => <article key={challenge.id} className={`panel challenge-card ${!challenge.unlocked ? 'locked' : ''}`}><div className="mode-card-top"><span className={`mode-icon ${MODES[challenge.mode].color}`}><Icon name={MODES[challenge.mode].icon} /></span><span className="pill">LEVEL {String(challenge.level).padStart(2, '0')}</span>{challenge.completed ? <Icon name="check" /> : !challenge.unlocked ? <Icon name="lock" /> : null}</div><span className="tiny-label">{MODES[challenge.mode].name}</span><h2>{challenge.title}</h2><p>{challenge.description}</p><div className="challenge-meta"><span>{challenge.difficulty}</span><span><Icon name="clock" size={14} />{Math.ceil(challenge.durationSeconds / 60)} min</span></div><button className={`button ${challenge.unlocked ? 'secondary' : 'muted-button'} wide`} disabled={!challenge.unlocked || busy} onClick={() => start(challenge)}>{challenge.completed ? 'Practice again' : challenge.unlocked ? 'Start challenge' : challenge.level===1?`Requires ${MODES[challenge.mode].prerequisite}`:`Clear level ${challenge.level - 1} to unlock`}<Icon name={challenge.unlocked ? 'arrow' : 'lock'} size={16} /></button></article>)}</div>}
          </>}
          {page === 'leaderboard' && <section className="panel full-board">
            <div className="leader-controls">
              <div className="segmented">{[['xp', 'Weekly XP'], ['accuracy', 'Accuracy'], ['speed', 'Speed']].map(([value, title]) => <button className={category === value ? 'selected' : ''} onClick={() => setCategory(value)} key={value}>{title}</button>)}</div>
              <label>Level range <select value={range} onChange={(event) => setRange(event.target.value)}>
                <option value="all">All explorers</option><option value="1-5">Levels 1–5</option><option value="6-15">Levels 6–15</option><option value="16-30">Levels 16–30</option><option value="31+">Levels 31+</option>
              </select></label>
            </div>
            <Leaderboard entries={board.entries} category={category} />
            <p className="fine-print">Week of {board.week || 'this Monday'} · Live updates with automatic refresh. Speed measures successful attempts only.</p>
          </section>}
          {page === 'path' && <SkillTree state={state} challenges={challenges} onStart={start} onExplore={explore}/>}
          {page === 'rewards' && <Rewards user={user} onStart={start} onEquip={setTheme}/>}
          {page === 'community' && <Community user={user} state={state}/>}
          {page === 'achievements' && <><ShareAchievements state={state}/><div className="achievement-summary"><Icon name="badge" size={26} /><strong>{earned.length}</strong><span>achievements earned — a record of your growing skills.</span></div><div className="achievement-grid">{(state.achievements.length ? state.achievements : [{ id: 'preview-1', name: 'Bug Spotter', description: 'Clear your first Bug Hunting challenge.' }, { id: 'preview-2', name: 'Test Master', description: 'Master the Test Case Arena.' }, { id: 'preview-3', name: 'Speed Demon', description: 'Clear a challenge in under 30 seconds.' }, { id: 'preview-4', name: 'Perfectionist', description: 'Complete a challenge with 100% accuracy.' }]).map((badge) => <article className={`panel achievement-card ${badge.earned ? 'earned' : ''}`} key={badge.id}><span className="achievement-icon"><Icon name="badge" size={38} /></span><span className="pill">{badge.earned ? '✓ UNLOCKED' : 'IN PROGRESS'}</span><h2>{badge.name}</h2><p>{badge.description}</p></article>)}</div></>}
          {page === 'learn' && <><VideoLibrary/><div className="mode-grid tutorial-cards">{Object.entries(MODES).map(([id, mode]) => <article className="panel" key={id}><span className={`mode-icon ${mode.color}`}><Icon name={mode.icon} size={26} /></span><h2>{mode.name} fundamentals</h2><p>{mode.lesson}</p><button className="button secondary" onClick={() => user ? start(challenges.find(c=>c.mode===id&&c.unlocked&&!c.completed) || challenges.find(c=>c.mode===id&&c.unlocked) || challenges.find(c=>c.mode===id)) : explore(id)}>Put it into practice<Icon name="arrow" size={17} /></button></article>)}</div><div className="section-heading glossary-heading"><div><h2>The QA field guide</h2><p>Foundational concepts aligned with common ISTQB terminology.</p></div><a className="text-button" href="https://glossary.istqb.org/" target="_blank" rel="noreferrer">ISTQB glossary ↗</a></div><div className="glossary-grid">{TERMS.map(([term, definition]) => <article className="panel glossary-card" key={term}><h3>{term}</h3><p>{definition}</p></article>)}</div></>}
        </>}
        <InstallApp/><footer><span>Built for curious minds. Made for better software.</span><span>QA QUEST <span className="footer-dot">/</span> KEEP LEVELING UP <Icon name="spark" size={12} /></span></footer>
      </main>
    </div>
    {modal === 'auth' && <Auth onClose={() => setModal(null)} onSuccess={authSuccess} isGuest={profile.isGuest} />}
    {modal === 'account' && <Modal title="Your explorer profile" onClose={() => setModal(null)}><div className="account-info"><span className="avatar">{profile.name.slice(0, 2).toUpperCase()}</span><div><h3>{profile.name}</h3><p>Level {profile.level} · {profile.xp} XP · {state.completed.length} challenges cleared</p></div></div><p className="muted">Your progress is saved to your account and synced when you return. Sign in on another device to pick up where you left off.</p><button className="button secondary wide" disabled={busy} onClick={async () => { setModal(null); await logout() }}><Icon name="logout" size={18} />Sign out</button></Modal>}
    {modal === 'glossary' && <Modal title="Your QA glossary" onClose={() => setModal(null)}><label className="glossary-search"><Icon name="search" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a concept…" aria-label="Search glossary" /></label><div className="glossary-list">{TERMS.filter((entry) => entry.join(' ').toLowerCase().includes(query.toLowerCase())).map(([term, definition]) => <section key={term}><h3>{term}</h3><p>{definition}</p></section>)}{!TERMS.some((entry) => entry.join(' ').toLowerCase().includes(query.toLowerCase())) && <p>No matching terms. Try “boundary” or “test”.</p>}</div></Modal>}
    {modal?.type === 'tutorial' && <Modal title={`Quick start: ${MODES[modal.challenge.mode].name}`} onClose={() => setModal(null)}><span className={`mode-icon ${MODES[modal.challenge.mode].color}`}><Icon name={MODES[modal.challenge.mode].icon} size={30} /></span><p className="tutorial-lesson">{MODES[modal.challenge.mode].lesson}</p><TutorialExercise mode={modal.challenge.mode} ready={tutorialReady} onReady={setTutorialReady}/><p className="fine-print">The timer starts when you begin. Select every correct answer. XP rewards first clears, speed, and daily consistency.</p><button className="button primary wide" disabled={!tutorialReady || busy} onClick={() => { writeLocal(`qa-tutorial-${user.id}-${modal.challenge.mode}`, true); start(modal.challenge, modal.isDaily, true) }}>I’m ready. Let’s go!<Icon name="arrow" /></button></Modal>}
  </div>
}
