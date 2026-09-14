import test from 'node:test'
import assert from 'node:assert/strict'
import { challengeById } from '../content.js'
import { createDemoApi } from '../../src/demoApi.js'

function memoryStorage() {
  const data = new Map()
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null },
    setItem(key, value) { data.set(key, value) },
    removeItem(key) { data.delete(key) },
  }
}

test('GitHub Pages demo mode supports local play, progress, and leaderboard data', async () => {
  let time = Date.parse('2026-01-05T12:00:00Z')
  let ids = 0
  const demo = createDemoApi({
    storage: memoryStorage(),
    now: () => time,
    randomUUID: () => `id-${++ids}`,
    addEventListener: undefined,
    removeEventListener: undefined,
    setIntervalFn: () => 0,
    clearIntervalFn: () => {},
  })

  assert.deepEqual(await demo.api('/me'), { user: null })

  const guest = await demo.api('/auth/guest', {})
  assert.equal(guest.user.name, 'Explorer id-3')

  const catalog = await demo.api('/challenges')
  assert.deepEqual(catalog.challenges.filter((item) => item.unlocked).map((item) => item.id), ['bugs-1', 'tests-1'])

  const attempt = await demo.api('/attempts', { challengeId: 'bugs-1', daily: false })
  time += 1000
  const result = await demo.api(`/attempts/${attempt.attemptId}/submit`, { answers: challengeById.get('bugs-1').answers })
  assert.equal(result.correct, true)
  assert.equal(result.state.profile.xp, result.xpEarned)
  assert.equal(result.state.completed.length, 1)

  const board = await demo.api('/leaderboard?category=xp&range=all')
  assert.equal(board.entries.length, 1)
  assert.equal(board.entries[0].name, guest.user.name)
  assert.equal(board.entries[0].isCurrentUser, true)
})

test('GitHub Pages demo mode keeps registered accounts and can sign back in locally', async () => {
  const storage = memoryStorage()
  const demo = createDemoApi({
    storage,
    now: () => Date.parse('2026-01-05T12:00:00Z'),
    randomUUID: (() => {
      let ids = 0
      return () => `user-${++ids}`
    })(),
    addEventListener: undefined,
    removeEventListener: undefined,
    setIntervalFn: () => 0,
    clearIntervalFn: () => {},
  })

  await demo.api('/auth/register', { name: 'Ada QA', email: 'ADA@example.com', password: 'Long test passphrase 42!' })
  await demo.api('/auth/logout', {})
  assert.deepEqual(await demo.api('/me'), { user: null })

  const login = await demo.api('/auth/login', { email: 'ada@example.com', password: 'Long test passphrase 42!' })
  assert.deepEqual(login, { user: { id: 'user-1', name: 'Ada QA' } })
  assert.deepEqual(await demo.api('/me'), login)
})
