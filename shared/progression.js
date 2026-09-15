// Public metadata and deterministic rules. This module contains no answer keys.
export const modes = {
  bugs: {
    name: 'Bug Hunting',
    label: 'Find it. Flag it. Fix your instincts.',
    icon: 'bug',
    color: 'green',
    total: 10,
    prerequisite: null,
    description: 'Find the bugs hiding in everyday code.',
    lesson:
      'Compare expected behavior with actual behavior. Trace boundaries, failure paths, and authorization. Select every real issue and avoid false positives.',
  },
  tests: {
    name: 'Test Case Arena',
    label: 'Think outside the happy path.',
    icon: 'code',
    color: 'purple',
    total: 10,
    prerequisite: null,
    description: 'Build coverage that catches what others miss.',
    lesson:
      'A useful test has preconditions, actions, and expected results. Cover successful journeys, invalid inputs, and boundary values. Selected coverage is graded; notes are for practice.',
  },
  regression: {
    name: 'Regression Roulette',
    label: 'New release. Old promises.',
    icon: 'target',
    color: 'orange',
    total: 15,
    prerequisite: 'bugs-3',
    description: 'Separate returning bugs from intentional changes.',
    lesson:
      'Read the release change and the preserved requirements. Compare observed behavior with both. An intentional change is not a regression; broken existing promises are.',
  },
  documentation: {
    name: 'Documentation Detective',
    label: 'Make requirements testable.',
    icon: 'book',
    color: 'blue',
    total: 10,
    prerequisite: 'tests-3',
    description: 'Find ambiguity before it becomes a defect.',
    lesson:
      'Look for missing boundaries, conflicting rules, and undefined failure behavior. Flag questions that prevent an objective acceptance test. Do not invent requirements.',
  },
  performance: {
    name: 'Performance Patrol',
    label: 'Follow the evidence.',
    icon: 'bolt',
    color: 'purple',
    total: 10,
    prerequisite: 'regression-3',
    description: 'Read metrics to uncover bottlenecks.',
    lesson:
      'Compare measurements against explicit service targets. Examine tail latency, load, and resource trends together. Correlation suggests a test; it does not prove the cause.',
  },
};
export const totalChallenges = Object.values(modes).reduce(
  (sum, m) => sum + m.total,
  0,
);
export function isUnlocked(challenge, completed) {
  const mode = modes[challenge.mode];
  return (
    Boolean(mode) &&
    (!mode.prerequisite || completed.includes(mode.prerequisite)) &&
    Array.from(
      { length: challenge.level - 1 },
      (_, i) => `${challenge.mode}-${i + 1}`,
    ).every((id) => completed.includes(id))
  );
}
export const cosmetics = [
  {
    id: 'default',
    name: 'Forest explorer',
    price: 0,
    description: 'The original green accent.',
  },
  {
    id: 'ocean',
    name: 'Ocean analyst',
    price: 100,
    description: 'Cool aqua highlights.',
  },
  {
    id: 'violet',
    name: 'Violet investigator',
    price: 250,
    description: 'Lavender highlights.',
  },
  {
    id: 'sunrise',
    name: 'Sunrise champion',
    price: 500,
    description: 'Warm golden highlights.',
  },
];
const themes = ['Boundary expedition', 'Release rescue', 'Latency lab'];
export function seasonFor(time) {
  const d = new Date(time);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const index = m % 3;
  return {
    id: `${y}-${String(m + 1).padStart(2, '0')}`,
    name: themes[index],
    startsAt: Date.UTC(y, m, 1),
    endsAt: Date.UTC(y, m + 1, 1),
    challengeIds: [1, 2, 3].map((n) => `season-${index}-${n}`),
    tiers: [
      { tier: 1, required: 1, credits: 75 },
      { tier: 2, required: 2, credits: 100 },
      { tier: 3, required: 3, credits: 150 },
    ],
  };
}
export function emptyRewards() {
  return { purchased: [], claims: [], seasonal: [], equipped: 'default' };
}
export function rewardView(records, completed, time) {
  const season = seasonFor(time);
  const pastSeasons = new Map();
  for (const record of records.seasonal) {
    if (record.season >= season.id) continue;
    if (!pastSeasons.has(record.season))
      pastSeasons.set(record.season, new Set());
    pastSeasons.get(record.season).add(record.challengeId);
  }
  const progress = new Set(
    records.seasonal
      .filter((r) => r.season === season.id)
      .map((r) => r.challengeId),
  ).size;
  const owned = ['default', ...new Set(records.purchased)];
  const balance =
    new Set(completed).size * 50 +
    records.claims.reduce(
      (sum, r) =>
        sum + (season.tiers.find((t) => t.tier === r.tier)?.credits || 0),
      0,
    ) -
    cosmetics
      .filter((c) => records.purchased.includes(c.id))
      .reduce((sum, c) => sum + c.price, 0);
  return {
    balance,
    equipped: records.equipped,
    owned,
    cosmetics,
    season: {
      ...season,
      progress,
      completed: records.seasonal
        .filter((r) => r.season === season.id)
        .map((r) => r.challengeId),
      tiers: season.tiers.map((t) => ({
        ...t,
        claimed: records.claims.some(
          (r) => r.season === season.id && r.tier === t.tier,
        ),
      })),
    },
    pastSeasons: [...pastSeasons]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([id, missions]) => ({
        id,
        progress: missions.size,
        completed: [...missions],
      })),
    history: records.claims,
  };
}
const invalid = (message) => Object.assign(new Error(message), { status: 400 });
export function buyCosmetic(records, completed, id, time) {
  const item = cosmetics.find((c) => c.id === id);
  if (!item) throw invalid('Choose a valid cosmetic.');
  if (id === 'default' || records.purchased.includes(id)) return;
  if (rewardView(records, completed, time).balance < item.price)
    throw invalid(
      'Not enough credits. Clear more challenges or claim season rewards.',
    );
  records.purchased.push(id);
}
export function equipCosmetic(records, id) {
  if (id !== 'default' && !records.purchased.includes(id))
    throw invalid('You must own this cosmetic before equipping it.');
  records.equipped = id;
}
export function claimTier(records, seasonId, tier, time) {
  const season = seasonFor(time);
  if (seasonId !== season.id)
    throw invalid('Only the active season can be claimed.');
  const item = season.tiers.find((t) => t.tier === tier);
  if (!item) throw invalid('Choose a valid season tier.');
  if (records.claims.some((r) => r.season === seasonId && r.tier === tier))
    return;
  if (rewardView(records, [], time).season.progress < item.required)
    throw invalid('Complete more seasonal quests before claiming this tier.');
  records.claims.push({ season: seasonId, tier });
}
