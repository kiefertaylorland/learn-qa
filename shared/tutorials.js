export const tutorials = [
  {
    id: 'bugs',
    title: 'Boundary values in 30 seconds',
    slides: [
      [
        'Read the contract',
        'A discount starts at 50 points.\nThe boundary is inclusive.',
      ],
      [
        'Probe the boundary',
        'Test 49, 50, and 51.\nOnly 49 should miss the discount.',
      ],
      [
        'Report the difference',
        'If 50 fails, record expected vs actual.\nAdd the boundary case to regression tests.',
      ],
    ],
  },
  {
    id: 'tests',
    title: 'Build a useful test case',
    slides: [
      [
        'Set the starting state',
        'Precondition: a signed-in shopper\nhas one available item in the cart.',
      ],
      [
        'Describe actions and outcomes',
        'Apply a valid coupon and check out.\nExpect one order with the correct total.',
      ],
      [
        'Expand your coverage',
        'Try invalid coupons, empty carts,\nand a lost payment response.',
      ],
    ],
  },
  {
    id: 'regression',
    title: 'Change or regression?',
    slides: [
      [
        'Read the release change',
        'The upload limit grows from 5 to 10 MB.\nExisting supported files must still upload.',
      ],
      [
        'Keep the old promises',
        'A 7 MB upload is newly allowed.\nA failed 3 MB upload is a regression.',
      ],
      [
        'Select evidence, not guesses',
        'Check preserved behavior and new limits.\nDo not flag intentional changes as bugs.',
      ],
    ],
  },
  {
    id: 'documentation',
    title: 'Make requirements testable',
    slides: [
      [
        'Question vague language',
        'The page should load quickly.\nHow quickly, and under what load?',
      ],
      [
        'Ask for measurable criteria',
        'Specify a percentile, time limit,\nworkload, and measurement conditions.',
      ],
      [
        'Cover what is missing',
        'Clarify failures, permissions, boundaries,\nand the expected recovery behavior.',
      ],
    ],
  },
  {
    id: 'performance',
    title: 'Look beyond averages',
    slides: [
      [
        'Read the target',
        'Target: p95 latency below 500 ms.\nMeasure under the specified workload.',
      ],
      [
        'Compare the right metric',
        'Mean is 120 ms, but p95 is 900 ms.\nThe tail-latency target fails.',
      ],
      [
        'Investigate before concluding',
        'Measure queue time, CPU, and memory.\nThe latency alone does not prove a cause.',
      ],
    ],
  },
];
