import { achievementDefinitions, challengeById, challenges } from '../server/content.js'

const DAY = 86_400_000
const BONUS_XP = 150
const STORE_KEY = 'qa-quest-demo-store'

const fallbackStorage = {
  data: new Map(),
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null },
  setItem(key, value) { this.data.set(key, value) },
  removeItem(key) { this.data.delete(key) },
}

const ranges = { all: [1, Infinity], '1-5': [1, 5], '6-15': [6, 15], '16-30': [16, 30], '31+': [31, Infinity] }
const modeTotals = Object.fromEntries(['bugs', 'tests'].map((mode) => [mode, challenges.filter((challenge) => challenge.mode === mode).length]))
const challengeAnswers = new Map(challenges.map((challenge) => {
  if (!Array.isArray(challenge.answers) || challenge.answers.length === 0) throw new Error(`Challenge ${challenge.id} is missing demo answers.`)
  return [challenge.id, challenge.answers]
}))

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function dayKey(time) {
  return new Date(time).toISOString().slice(0, 10)
}

function iso(time) {
  return new Date(time).toISOString()
}

function weekStart(time) {
  const date = new Date(time)
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const day = (date.getUTCDay() + 6) % 7
  return midnight - day * DAY
}

function normalizeName(name) {
  if (typeof name !== 'string') throw new Error('Enter a display name.')
  const normalized = name.trim().replaceAll(/\s+/g, ' ')
  if (normalized.length < 2 || normalized.length > 30) throw new Error('Display names must be 2 to 30 characters.')
  return normalized
}

function normalizeEmail(email) {
  if (typeof email !== 'string') throw new Error('Enter an email address.')
  const normalized = email.trim().toLowerCase()
  if (!normalized || normalized.length > 254 || !normalized.includes('@')) throw new Error('Enter a valid email address.')
  return normalized
}

function assertPassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
    throw new Error('Passwords must be 10 to 128 characters.')
  }
  return password
}

function defaultStore() {
  return {
    users: [],
    sessionUserId: null,
    attempts: [],
    completions: [],
    dailyRewards: [],
    achievements: [],
    xpEvents: [],
  }
}

function publicUser(user) {
  return user ? { id: user.id, name: user.name } : null
}

function challengeSummary(challenge) {
  const { id, mode, title, level, difficulty, durationSeconds, description } = challenge
  return { id, mode, title, level, difficulty, durationSeconds, description }
}

function correctAnswersFor(challengeId) {
  return challengeAnswers.get(challengeId)
}

export function createDemoApi(options = {}) {
  const storage = options.storage ?? globalThis.localStorage ?? fallbackStorage
  const now = options.now ?? (() => Date.now())
  const randomUUID = options.randomUUID ?? (() => globalThis.crypto.randomUUID())
  const cryptoApi = options.cryptoApi ?? globalThis.crypto
  const listen = options.addEventListener ?? globalThis.addEventListener?.bind(globalThis)
  const unlisten = options.removeEventListener ?? globalThis.removeEventListener?.bind(globalThis)
  const setIntervalFn = options.setIntervalFn ?? globalThis.setInterval?.bind(globalThis)
  const clearIntervalFn = options.clearIntervalFn ?? globalThis.clearInterval?.bind(globalThis)

  function loadStore() {
    try {
      const raw = storage.getItem(STORE_KEY)
      if (!raw) return defaultStore()
      const parsed = JSON.parse(raw)
      return {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        sessionUserId: typeof parsed.sessionUserId === 'string' ? parsed.sessionUserId : null,
        attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
        completions: Array.isArray(parsed.completions) ? parsed.completions : [],
        dailyRewards: Array.isArray(parsed.dailyRewards) ? parsed.dailyRewards : [],
        achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
        xpEvents: Array.isArray(parsed.xpEvents) ? parsed.xpEvents : [],
      }
    } catch {
      return defaultStore()
    }
  }

  function saveStore(store) {
    storage.setItem(STORE_KEY, JSON.stringify(store))
  }

  function currentUser(store) {
    return store.users.find((user) => user.id === store.sessionUserId) || null
  }

  function completedIds(store, userId) {
    return store.completions
      .filter((entry) => entry.userId === userId)
      .sort((a, b) => a.completedAt - b.completedAt || a.challengeId.localeCompare(b.challengeId))
      .map((entry) => entry.challengeId)
  }

  function unlocked(challenge, completed) {
    return challenges
      .filter((item) => item.mode === challenge.mode && item.level < challenge.level)
      .every((item) => completed.includes(item.id))
  }

  function state(store, userId, time = now()) {
    const user = store.users.find((entry) => entry.id === userId)
    if (!user) throw new Error('Sign in to keep exploring.')
    const completed = completedIds(store, userId)
    const attemptRows = store.attempts.filter((entry) => entry.userId === userId)
    const settled = attemptRows.filter((entry) => entry.submittedAt || entry.expiresAt <= time)
    const accuracy = settled.length
      ? Math.round(settled.reduce((sum, entry) => sum + (entry.accuracy ?? 0), 0) / settled.length)
      : 0
    const start = weekStart(time)
    const weeklyXp = store.xpEvents
      .filter((entry) => entry.userId === userId && entry.earnedAt >= start && entry.earnedAt < start + 7 * DAY)
      .reduce((sum, entry) => sum + entry.amount, 0)
    const staleStreak = !user.lastActive || user.lastActive < dayKey(time - DAY)
    return {
      profile: {
        id: user.id,
        name: user.name,
        xp: user.xp,
        level: Math.floor(user.xp / 500) + 1,
        streak: staleStreak ? 0 : user.streak,
        isGuest: !user.email,
      },
      completed,
      achievements: achievementDefinitions.map((item) => ({
        ...item,
        earned: store.achievements.some((entry) => entry.userId === userId && entry.achievementId === item.id),
      })),
      stats: { attempts: attemptRows.length, completed: completed.length, accuracy, weeklyXp },
      modeProgress: Object.fromEntries(Object.keys(modeTotals).map((mode) => [mode, {
        completed: completed.filter((id) => challengeById.get(id).mode === mode).length,
        total: modeTotals[mode],
      }])),
    }
  }

  function attemptResponse(attempt) {
    const item = challengeById.get(attempt.challengeId)
    const { id, mode, title, level, prompt, code, options, durationSeconds } = item
    return {
      attemptId: attempt.id,
      challenge: { id, mode, title, level, prompt, ...(code ? { code } : {}), options: clone(options), durationSeconds },
      startedAt: iso(attempt.startedAt),
      expiresAt: iso(attempt.expiresAt),
    }
  }

  function dailyChallenge(time = now()) {
    return challenges[Math.floor(time / DAY) % challenges.length]
  }

  async function hashPassword(password) {
    if (!cryptoApi?.subtle?.digest) throw new Error('This browser cannot create demo accounts. Try the guest demo or a newer browser.')
    const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(password))
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  }

  function requireUser(store) {
    const user = currentUser(store)
    if (!user) {
      const error = new Error('Sign in to keep exploring.')
      error.status = 401
      throw error
    }
    return user
  }

  function leaderboard(store, query) {
    const category = query.get('category') || 'xp'
    const range = query.get('range') || 'all'
    if (!['xp', 'accuracy', 'speed'].includes(category) || !Object.hasOwn(ranges, range)) {
      throw new Error('Invalid leaderboard category or level range.')
    }
    const time = now()
    const start = weekStart(time)
    const viewer = currentUser(store)
    const rows = store.users.map((user) => {
      const attempts = store.attempts.filter((entry) => entry.userId === user.id)
      const weeklyAttempts = attempts.filter((entry) => {
        const sampleTime = Math.min(entry.submittedAt ?? entry.expiresAt, entry.expiresAt)
        return sampleTime >= start && sampleTime < start + 7 * DAY && (entry.submittedAt || entry.expiresAt <= time)
      })
      const successes = weeklyAttempts.filter((entry) => entry.correct)
      const xp = store.xpEvents
        .filter((entry) => entry.userId === user.id && entry.earnedAt >= start && entry.earnedAt < start + 7 * DAY)
        .reduce((sum, entry) => sum + entry.amount, 0)
      return {
        userId: user.id,
        id: user.publicId,
        name: user.name,
        totalXp: user.xp,
        xp,
        accuracy: weeklyAttempts.length ? weeklyAttempts.reduce((sum, entry) => sum + (entry.accuracy ?? 0), 0) / weeklyAttempts.length : 0,
        speed: successes.length ? successes.reduce((sum, entry) => sum + entry.duration, 0) / successes.length : 0,
        samples: weeklyAttempts.length,
        successes: successes.length,
      }
    }).filter((row) => row.xp > 0 || row.samples > 0)

    const [min, max] = ranges[range]
    const eligible = rows
      .map((row) => ({ ...row, level: Math.floor(row.totalXp / 500) + 1 }))
      .filter((row) => row.level >= min && row.level <= max
        && (category === 'xp' ? row.xp > 0 : category === 'accuracy' ? row.samples >= 3 && row.successes >= 1 : row.successes >= 1))

    eligible.sort((a, b) => (category === 'xp' ? b.xp - a.xp : category === 'accuracy' ? b.accuracy - a.accuracy : a.speed - b.speed)
      || b.xp - a.xp || a.id.localeCompare(b.id))

    return {
      week: dayKey(start),
      entries: eligible.slice(0, 100).map((row, index) => ({
        id: row.id,
        name: row.name,
        level: row.level,
        xp: row.xp,
        accuracy: Math.round(row.accuracy),
        speed: Math.round(row.speed * 10) / 10,
        rank: index + 1,
        isCurrentUser: row.userId === viewer?.id,
      })),
    }
  }

  async function register(store, values) {
    const name = normalizeName(values.name)
    const email = normalizeEmail(values.email)
    const passwordHash = await hashPassword(assertPassword(values.password))
    const existing = store.users.find((entry) => entry.email === email)
    if (existing) {
      const error = new Error('Unable to register with these details. Try signing in.')
      error.status = 409
      throw error
    }
    const user = currentUser(store)
    if (user?.email) {
      const error = new Error('Sign out before creating another account.')
      error.status = 409
      throw error
    }
    if (user) {
      user.name = name
      user.email = email
      user.passwordHash = passwordHash
      saveStore(store)
      return { user: publicUser(user) }
    }
    const nextUser = {
      id: randomUUID(),
      publicId: randomUUID(),
      name,
      email,
      passwordHash,
      xp: 0,
      streak: 0,
      lastActive: null,
    }
    store.users.push(nextUser)
    store.sessionUserId = nextUser.id
    saveStore(store)
    return { user: publicUser(nextUser) }
  }

  async function login(store, values) {
    const email = normalizeEmail(values.email)
    const passwordHash = await hashPassword(assertPassword(values.password))
    const user = store.users.find((entry) => entry.email === email)
    if (!user || user.passwordHash !== passwordHash) {
      const error = new Error('Email or password is incorrect.')
      error.status = 401
      throw error
    }
    store.sessionUserId = user.id
    saveStore(store)
    return { user: publicUser(user) }
  }

  function createGuest(store) {
    const user = currentUser(store)
    if (user) return { user: publicUser(user) }
    const nextUser = {
      id: randomUUID(),
      publicId: randomUUID(),
      name: `Explorer ${randomUUID().slice(0, 4)}`,
      email: null,
      passwordHash: null,
      xp: 0,
      streak: 0,
      lastActive: null,
    }
    store.users.push(nextUser)
    store.sessionUserId = nextUser.id
    saveStore(store)
    return { user: publicUser(nextUser) }
  }

  async function api(path, body) {
    const store = loadStore()
    if (path === '/me') return { user: publicUser(currentUser(store)) }
    if (path === '/auth/guest') return createGuest(store)
    if (path === '/auth/register') return register(store, body ?? {})
    if (path === '/auth/login') return login(store, body ?? {})
    if (path === '/auth/logout') {
      store.sessionUserId = null
      saveStore(store)
      return {}
    }
    if (path === '/state') return state(store, requireUser(store).id)
    if (path === '/challenges') {
      const user = requireUser(store)
      const completed = completedIds(store, user.id)
      return {
        challenges: challenges.map((challenge) => ({
          ...challengeSummary(challenge),
          unlocked: unlocked(challenge, completed),
          completed: completed.includes(challenge.id),
        })),
      }
    }
    if (path === '/daily') {
      const user = requireUser(store)
      const time = now()
      const challenge = dailyChallenge(time)
      const date = dayKey(time)
      return {
        date,
        challengeId: challenge.id,
        title: challenge.title,
        mode: challenge.mode,
        completed: store.dailyRewards.some((entry) => entry.userId === user.id && entry.date === date),
        bonusXp: BONUS_XP,
      }
    }
    if (path === '/attempts') {
      const user = requireUser(store)
      const { challengeId, daily = false } = body ?? {}
      if (typeof challengeId !== 'string' || !challengeById.has(challengeId) || typeof daily !== 'boolean') {
        const error = new Error('Choose a valid challenge and daily flag.')
        error.status = 400
        throw error
      }
      const time = now()
      const challenge = challengeById.get(challengeId)
      if (daily ? dailyChallenge(time).id !== challengeId : !unlocked(challenge, completedIds(store, user.id))) {
        const error = new Error(daily ? 'This is not today’s daily challenge.' : 'Complete the previous levels in this mode first.')
        error.status = 403
        throw error
      }
      const pending = store.attempts
        .filter((entry) => entry.userId === user.id && !entry.result && entry.expiresAt > time)
        .sort((a, b) => b.startedAt - a.startedAt)[0]
      if (pending) {
        if (pending.challengeId === challengeId && pending.dailyDate === (daily ? dayKey(time) : null)) return attemptResponse(pending)
        const error = new Error('Finish your active challenge or wait for its timer to expire.')
        error.status = 409
        throw error
      }
      const attempt = {
        id: randomUUID(),
        userId: user.id,
        challengeId,
        dailyDate: daily ? dayKey(time) : null,
        startedAt: time,
        expiresAt: time + challenge.durationSeconds * 1000,
        submittedAt: null,
        accuracy: null,
        correct: false,
        duration: null,
        result: null,
      }
      store.attempts.push(attempt)
      saveStore(store)
      return attemptResponse(attempt)
    }
    if (path.startsWith('/attempts/') && path.endsWith('/submit')) {
      const user = requireUser(store)
      const attemptId = path.split('/')[2]
      const { answers } = body ?? {}
      if (!Array.isArray(answers) || answers.length > 8 || answers.some((answer) => typeof answer !== 'string' || answer.length > 32)
        || new Set(answers).size !== answers.length) {
        const error = new Error('Answers must be a list of unique option ids.')
        error.status = 400
        throw error
      }
      const attempt = store.attempts.find((entry) => entry.id === attemptId && entry.userId === user.id)
      if (!attempt) {
        const error = new Error('Attempt not found.')
        error.status = 404
        throw error
      }
      const challenge = challengeById.get(attempt.challengeId)
      if (answers.some((answer) => !challenge.options.some((option) => option.id === answer))) {
        const error = new Error('Unknown answer option.')
        error.status = 400
        throw error
      }
      if (attempt.result) return clone(attempt.result)

      const time = now()
      const expired = time >= attempt.expiresAt
      const correctAnswers = correctAnswersFor(challenge.id)
      const correct = !expired && answers.length === correctAnswers.length && answers.every((answer) => correctAnswers.includes(answer))
      const intersection = answers.filter((answer) => correctAnswers.includes(answer)).length
      const accuracy = expired ? 0 : Math.round(100 * intersection / new Set([...answers, ...correctAnswers]).size)
      const duration = Math.max(0, Math.min(time - attempt.startedAt, challenge.durationSeconds * 1000)) / 1000

      attempt.submittedAt = time
      attempt.accuracy = accuracy
      attempt.correct = correct
      attempt.duration = duration

      let xpEarned = 0
      let bonus = false

      if (correct) {
        const today = dayKey(time)
        const streak = user.lastActive === today ? user.streak : user.lastActive === dayKey(time - DAY) ? user.streak + 1 : 1
        user.streak = streak
        user.lastActive = today

        const firstClear = !store.completions.some((entry) => entry.userId === user.id && entry.challengeId === challenge.id)
        if (firstClear) store.completions.push({ userId: user.id, challengeId: challenge.id, completedAt: time })
        if (firstClear) xpEarned = 100 + challenge.level * 15 + Math.floor(50 * (1 - duration / challenge.durationSeconds)) + Math.min(streak - 1, 7) * 5
        if (attempt.dailyDate === today && !store.dailyRewards.some((entry) => entry.userId === user.id && entry.date === today)) {
          bonus = true
          store.dailyRewards.push({ userId: user.id, date: today })
          xpEarned += BONUS_XP
        }
        if (xpEarned) {
          user.xp += xpEarned
          store.xpEvents.push({ userId: user.id, amount: xpEarned, earnedAt: time })
        }
        const completed = completedIds(store, user.id)
        const previousAttempts = store.attempts.filter((entry) => entry.userId === user.id && entry.challengeId === challenge.id
          && entry.id !== attempt.id && (entry.submittedAt || entry.expiresAt <= time)).length
        const awards = [
          ['first-clear', completed.length >= 1],
          ['bug-spotter', completed.filter((id) => id.startsWith('bugs-')).length >= 5],
          ['test-master', completed.filter((id) => id.startsWith('tests-')).length === 10],
          ['speed-demon', firstClear && duration < 30],
          ['perfectionist', firstClear && previousAttempts === 0],
          ['seven-day-warrior', streak >= 7],
          ['quest-complete', completed.length === 20],
        ]
        for (const [achievementId, earned] of awards) {
          if (earned && !store.achievements.some((entry) => entry.userId === user.id && entry.achievementId === achievementId)) {
            store.achievements.push({ userId: user.id, achievementId, earnedAt: time })
          }
        }
      }

      const rewardExplanation = !correct ? '' : xpEarned === 0 ? ' Practice clear: no repeat-clear XP is awarded.'
        : bonus ? ' Includes the once-per-UTC-day +150 daily bonus.' : ' First-clear XP awarded.'
      const missedRolloverBonus = correct && attempt.dailyDate && attempt.dailyDate !== dayKey(time)
        && !store.dailyRewards.some((entry) => entry.userId === user.id && entry.date === attempt.dailyDate)
      const rolloverExplanation = missedRolloverBonus ? ' The daily date changed before submission, so no daily bonus was awarded.' : ''

      attempt.result = {
        correct,
        accuracy,
        xpEarned,
        explanation: `${expired ? 'Time expired. No XP was awarded. ' : ''}${challenge.explanation}${rewardExplanation}${rolloverExplanation}`,
        correctAnswers: clone(correctAnswers),
        state: state(store, user.id, time),
      }
      saveStore(store)
      return clone(attempt.result)
    }
    if (path.startsWith('/leaderboard')) {
      return leaderboard(store, new URL(path, 'https://demo.local').searchParams)
    }
    throw new Error('API endpoint not found.')
  }

  function subscribeToLeaderboard(onInvalidate) {
    const handlers = []
    if (listen && unlisten) {
      const sync = (event) => {
        if (event?.key && event.key !== STORE_KEY) return
        onInvalidate()
      }
      listen('storage', sync)
      handlers.push(() => unlisten('storage', sync))
    }
    const timer = setIntervalFn?.(onInvalidate, 30000)
    if (timer !== undefined) handlers.push(() => clearIntervalFn?.(timer))
    return () => {
      for (const stop of handlers) stop()
    }
  }

  return { isDemoMode: true, api, subscribeToLeaderboard }
}

const demoApi = createDemoApi()

export const isDemoMode = demoApi.isDemoMode
export const api = demoApi.api
export const subscribeToLeaderboard = demoApi.subscribeToLeaderboard
