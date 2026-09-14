import test from 'node:test';
import assert from 'node:assert/strict';
import { challenges, challengeById, achievementDefinitions } from '../content.js';

test('all five curricula have distinct scenarios and valid multi-select grading keys', () => {
  assert.equal(challenges.length, 55);
  assert.equal(new Set(challenges.map(({ title }) => title)).size, 55);
  assert.equal(new Set(challenges.map(({ prompt }) => prompt)).size, 55);
  for (const [mode, count] of Object.entries({ bugs: 10, tests: 10, regression: 15, documentation: 10, performance: 10 })) {
    const items = challenges.filter((item) => item.mode === mode);
    assert.deepEqual(items.map(({ id }) => id), Array.from({ length: count }, (_, i) => `${mode}-${i + 1}`));
    for (const item of items) {
      assert.equal(challengeById.get(item.id), item);
      assert.ok(item.explanation.length > 100, item.id);
      assert.ok(item.answers.length > 1 && item.answers.length < item.options.length, item.id);
      assert.equal(new Set(item.answers).size, item.answers.length);
      assert.ok(item.answers.every((answer) => item.options.some(({ id }) => id === answer)));
    }
  }
});

test('performance cases expose finite, labeled measurements with units', () => {
  const cases = challenges.filter(({ mode }) => mode === 'performance');
  assert.equal(cases.length, 10);
  for (const item of cases) {
    assert.ok(item.metrics.length >= 2, item.id);
    assert.equal(new Set(item.metrics.map(({ label }) => label)).size, item.metrics.length);
    for (const metric of item.metrics) {
      assert.ok(metric.label.trim());
      assert.ok(metric.unit.trim());
      assert.equal(typeof metric.value, 'number');
      assert.ok(Number.isFinite(metric.value) && metric.value >= 0);
    }
  }
});

test('original completion remains compatible while new domains earn their own awards', () => {
  assert.equal(achievementDefinitions.find(({ id }) => id === 'quest-complete').description, 'Complete all twenty challenges.');
  for (const id of ['regression-master', 'documentation-detective', 'performance-patrol', 'all-domains']) {
    assert.ok(achievementDefinitions.some((award) => award.id === id), id);
  }
});
