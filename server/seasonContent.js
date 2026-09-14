// Original seasonal missions, kept separate from the permanent curriculum.
const sets = [
  [
    [
      'Inclusive delivery',
      'Delivery is free from $50. A $49 cart costs $5 to deliver; $50 is also charged $5; $51 is free. Select the justified findings.',
      [
        'The $50 boundary violates the promise.',
        'Retest $49, $50 and $51 after the correction.',
        'Every delivery must be free.',
        'The $49 result is a regression.',
      ],
      [0, 1],
      'The equality boundary is wrong. Testing both adjacent values protects paid delivery below the threshold and free delivery at and above it. The observed $49 and $51 outcomes already match the rule.',
    ],
    [
      'An empty export',
      'An export supports zero through 100 rows. Zero rows causes a crash; 100 succeeds; 101 is rejected with a clear message. Select the useful findings.',
      [
        'The empty input is inside the supported partition.',
        'Add a zero-row regression test.',
        'Rejecting 101 is a defect.',
        'Remove the upper limit.',
      ],
      [0, 1],
      'Zero is a valid boundary in this contract and must have a defined successful export, such as headers without data. The maximum and immediate invalid neighbor behave as specified.',
    ],
    [
      'The midnight deadline',
      'Submissions are accepted strictly before 00:00 UTC. Requests at 23:59:59 succeed; requests at exactly 00:00 also succeed. Select justified actions.',
      [
        'Reject requests at the exact deadline.',
        'Test before, at, and after the UTC deadline.',
        'Use each browser’s local time.',
        'Reject all submissions on the previous day.',
      ],
      [0, 1],
      'Strictly before excludes equality. The server must enforce one UTC deadline for everyone, independent of local browser clocks. Boundary tests should include equality and neighboring instants.',
    ],
  ],
  [
    [
      'The returning coupon',
      'A release intentionally removes expired coupons. Valid coupons must still work. An expired coupon is rejected; a valid coupon is rejected too. Select actual findings.',
      [
        'Valid coupons regressed.',
        'Expired coupon rejection is intentional.',
        'Both rejections are defects.',
        'Stop checking coupon dates.',
      ],
      [0, 1],
      'The new rule explains expired-coupon rejection, but the original promise still requires valid coupons to work. A regression suite needs both classes to distinguish the intended change from damage.',
    ],
    [
      'A vanished draft',
      'Autosave now runs every ten seconds instead of five. Saving manually must still persist immediately. A manual save disappears after reload. Select justified findings.',
      [
        'The manual-save contract regressed.',
        'Test persistence by reloading after manual save.',
        'The ten-second autosave period itself is a defect.',
        'Only the button color matters.',
      ],
      [0, 1],
      'The release deliberately changed automatic timing, not the manual-save guarantee. Reloading checks actual persistence instead of trusting a confirmation toast or a local in-memory draft.',
    ],
    [
      'Retrying an order',
      'A new retry button is introduced. One order must still cause at most one charge. Retrying a lost response charges twice. Select protections.',
      [
        'Use a stable order idempotency key.',
        'Test retry after response loss.',
        'Generate a fresh key for each retry.',
        'Disable all error reporting.',
      ],
      [0, 1],
      'A stable key lets the payment operation recognize the same logical order. Response-loss tests reproduce the uncertain outcome where a charge succeeded but the client never received confirmation.',
    ],
  ],
  [
    [
      'Tail latency',
      'Target: p95 below 500 ms at 100 requests/s. Observed mean 120 ms, p95 900 ms at 100 requests/s. Select valid conclusions.',
      [
        'The tail-latency target fails.',
        'The mean alone would hide the problem.',
        'The mean proves the target passes.',
        'The data proves a memory leak.',
      ],
      [0, 1],
      'A mean and a percentile answer different questions. The explicitly targeted percentile exceeds its budget at the specified load; further profiling is needed to identify the underlying cause.',
    ],
    [
      'Rising heap',
      'After each identical load cycle and garbage collection, retained heap is 80, 130, then 180 MB. Select warranted actions.',
      [
        'Investigate objects retained across cycles.',
        'Compare heap snapshots after collection.',
        'This proves the database is slow.',
        'Ignore memory because requests succeed.',
      ],
      [0, 1],
      'Increasing retained memory under a repeatable workload is evidence worth investigating, even while functional requests succeed. Heap snapshots can reveal retaining paths; the measurements do not identify a cause by themselves.',
    ],
    [
      'Saturated workers',
      'At 50 requests/s latency is 100 ms. At 100 requests/s the worker pool is full and latency is 800 ms. Select useful next steps.',
      [
        'Measure queue wait separately from service time.',
        'Repeat controlled loads around saturation.',
        'Latency cannot depend on load.',
        'Raise the timeout and declare the bottleneck fixed.',
      ],
      [0, 1],
      'Queueing can dominate latency after capacity is exhausted. Measurements around the saturation point help locate the capacity boundary. Increasing a timeout changes failure behavior but does not add capacity.',
    ],
  ],
];
export const seasonalChallenges = sets.flatMap((items, s) =>
  items.map(([title, prompt, options, answers, explanation], i) => ({
    id: `season-${s}-${i + 1}`,
    mode: ['bugs', 'regression', 'performance'][s],
    level: i + 1,
    title,
    description: 'A season-exclusive mission.',
    prompt,
    options: options.map((text, j) => ({ id: `option-${j + 1}`, text })),
    answers: answers.map((j) => `option-${j + 1}`),
    explanation,
    durationSeconds: 120,
    difficulty: 'Seasonal',
  })),
);
