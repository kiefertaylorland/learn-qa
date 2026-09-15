import test from 'node:test';
import assert from 'node:assert/strict';
import {
  modes,
  isUnlocked,
  seasonFor,
  rewardView,
  buyCosmetic,
  claimTier,
  equipCosmetic,
} from '../../shared/progression.js';

test('skill branches require foundation and sequential completion', () => {
  assert.equal(Object.keys(modes).length, 5);
  assert.equal(isUnlocked({ mode: 'regression', level: 1 }, []), false);
  assert.equal(isUnlocked({ mode: 'regression', level: 1 }, ['bugs-3']), true);
  assert.equal(isUnlocked({ mode: 'regression', level: 2 }, ['bugs-3']), false);
  assert.equal(
    isUnlocked({ mode: 'performance', level: 1 }, ['regression-3']),
    true,
  );
});
test('seasons follow UTC month boundaries and have exclusive content', () => {
  const a = seasonFor(Date.parse('2026-01-31T23:59:59Z'));
  const b = seasonFor(Date.parse('2026-02-01T00:00:00Z'));
  assert.notEqual(a.id, b.id);
  assert.equal(a.endsAt, b.startsAt);
  assert.equal(a.challengeIds.length, 3);
  assert.notDeepEqual(a.challengeIds, b.challengeIds);
});
test('credits cannot be farmed and purchases/equips validate ownership', () => {
  const records = {
    purchased: [],
    claims: [],
    seasonal: [],
    equipped: 'default',
  };
  const completions = ['bugs-1', 'bugs-2', 'bugs-3'];
  assert.equal(rewardView(records, completions, 0).balance, 150);
  assert.throws(() => equipCosmetic(records, 'ocean'), /own/);
  buyCosmetic(records, completions, 'ocean', 0);
  assert.equal(rewardView(records, completions, 0).balance, 50);
  buyCosmetic(records, completions, 'ocean', 0);
  assert.equal(rewardView(records, completions, 0).balance, 50);
  assert.throws(
    () => buyCosmetic(records, completions, 'violet', 0),
    /credits/,
  );
  equipCosmetic(records, 'ocean');
  assert.equal(records.equipped, 'ocean');
  assert.throws(
    () => buyCosmetic(records, completions, 'forged', 0),
    /cosmetic/,
  );
});
test('season tiers are unique, require progress and cannot claim previous month', () => {
  const now = Date.parse('2026-02-01T00:00:00Z');
  const season = seasonFor(now);
  const records = {
    purchased: [],
    claims: [],
    seasonal: [],
    equipped: 'default',
  };
  assert.throws(() => claimTier(records, season.id, 1, now), /Complete/);
  records.seasonal.push({
    season: season.id,
    challengeId: season.challengeIds[0],
  });
  claimTier(records, season.id, 1, now);
  claimTier(records, season.id, 1, now);
  assert.equal(records.claims.length, 1);
  assert.equal(rewardView(records, [], now).balance, 75);
  assert.throws(() => claimTier(records, '2026-01', 1, now), /active/);
});

test('past seasons preserve distinct unclaimed missions without carrying progress forward', () => {
  const january = seasonFor(Date.parse('2026-01-01T00:00:00Z'));
  const february = seasonFor(january.endsAt);
  const records = {
    purchased: [],
    claims: [],
    seasonal: january.challengeIds.slice(0, 2).map((challengeId) => ({
      season: january.id,
      challengeId,
    })),
    equipped: 'default',
  };
  records.seasonal.push({ ...records.seasonal[0] });
  assert.deepEqual(rewardView(records, [], january.startsAt).pastSeasons, []);

  let view = rewardView(records, [], february.startsAt);
  const januaryHistory = {
    id: january.id,
    progress: 2,
    completed: january.challengeIds.slice(0, 2),
  };
  assert.deepEqual(view.pastSeasons, [januaryHistory]);
  assert.equal(view.season.progress, 0);
  assert.deepEqual(view.season.completed, []);
  assert.deepEqual(view.history, []);
  assert.equal(view.balance, 0);
  assert.throws(() => claimTier(records, january.id, 1, february.startsAt), /active/);
  assert.throws(() => claimTier(records, february.id, 1, february.startsAt), /Complete/);

  records.seasonal.push({
    season: february.id,
    challengeId: february.challengeIds[0],
  });
  claimTier(records, february.id, 1, february.startsAt);
  view = rewardView(records, [], february.endsAt);
  assert.deepEqual(view.pastSeasons, [
    { id: february.id, progress: 1, completed: [february.challengeIds[0]] },
    januaryHistory,
  ]);
  assert.deepEqual(view.history, [{ season: february.id, tier: 1 }]);
  assert.equal(view.balance, 75);
  assert.equal(view.season.progress, 0);
  assert.ok(view.season.tiers.every((tier) => !tier.claimed));
  assert.throws(() => claimTier(records, february.id, 1, february.endsAt), /active/);
});
