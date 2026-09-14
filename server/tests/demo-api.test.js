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

test('GitHub Pages demo mode does not blame rollover when the earlier daily bonus was already claimed', async () => {
  let time = Date.parse('2026-01-05T12:00:00Z')
  let ids = 0
  const demo = createDemoApi({
    storage: memoryStorage(),
    now: () => time,
    randomUUID: () => `day-${++ids}`,
    addEventListener: undefined,
    removeEventListener: undefined,
    setIntervalFn: () => 0,
    clearIntervalFn: () => {},
  })

  await demo.api('/auth/guest', {})
  const daily = await demo.api('/daily')

  let attempt = await demo.api('/attempts', { challengeId: daily.challengeId, daily: true })
  time += 1000
  await demo.api(`/attempts/${attempt.attemptId}/submit`, { answers: challengeById.get(daily.challengeId).answers })

  time = Date.parse('2026-01-05T23:59:30Z')
  attempt = await demo.api('/attempts', { challengeId: daily.challengeId, daily: true })
  time = Date.parse('2026-01-06T00:01:00Z')
  const result = await demo.api(`/attempts/${attempt.attemptId}/submit`, { answers: challengeById.get(daily.challengeId).answers })

  assert.doesNotMatch(result.explanation, /daily date changed/)
})

test('GitHub Pages demo mode returns a friendly error when Web Crypto is unavailable', async () => {
  const demo = createDemoApi({
    storage: memoryStorage(),
    cryptoApi: {},
    addEventListener: undefined,
    removeEventListener: undefined,
    setIntervalFn: () => 0,
    clearIntervalFn: () => {},
  })

  await assert.rejects(
    () => demo.api('/auth/register', { name: 'Ada QA', email: 'ada@example.com', password: 'Long test passphrase 42!' }),
    /guest demo or a newer browser/,
  )
})

test('demo season rewards and cosmetics persist without affecting lifetime XP', async()=>{
 const storage=memoryStorage();let time=Date.parse('2026-01-05T12:00:00Z');
 const demo=createDemoApi({storage,now:()=>time});await demo.api('/auth/guest',{});
 const {seasonalChallenges}=await import('../seasonContent.js');
 const q=(await demo.api('/seasons/challenges')).challenges[0];
 await assert.rejects(demo.api('/attempts',{challengeId:q.id}),/previous/);
 const attempt=await demo.api('/attempts',{challengeId:q.id,seasonal:true});time+=1000;
 const result=await demo.api(`/attempts/${attempt.attemptId}/submit`,{answers:seasonalChallenges.find(c=>c.id===q.id).answers});
 assert.equal(result.xpEarned,0);assert.equal(result.state.completed.length,0);
 let r=await demo.api('/rewards');assert.equal(r.season.progress,1);
 await demo.api('/seasons/claim',{season:r.season.id,tier:1});await demo.api('/seasons/claim',{season:r.season.id,tier:1});
 const regular=await demo.api('/attempts',{challengeId:'bugs-1'});time+=1000;
 await demo.api(`/attempts/${regular.attemptId}/submit`,{answers:challengeById.get('bugs-1').answers});
 await demo.api('/cosmetics/buy',{id:'ocean'});await demo.api('/cosmetics/equip',{id:'ocean'});
 r=await createDemoApi({storage,now:()=>time}).api('/rewards');assert.equal(r.balance,25);assert.equal(r.equipped,'ocean');
 time=Date.parse('2026-02-01');assert.equal((await demo.api('/rewards')).season.progress,0);
});
