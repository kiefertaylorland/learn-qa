// Authored teaching scenarios only; snippets and observations are never executed.
export const regression = [
  {
    title: 'Tax after the refactor',
    description: 'Protect rounding behavior when money code changes.',
    prompt:
      'A refactor replaces per-line tax rounding with order-level rounding. The contract still rounds each line to cents before summing. Select the targeted regression checks.',
    options: [
      'Use several low-price lines whose fractional taxes accumulate.',
      'Assert each rounded line and the final sum against the contract.',
      'Only test a zero-tax product.',
      'Accept any total within one dollar.',
    ],
    answers: [0, 1],
    explanation:
      'Rounding location changes the result even with the same tax rate. Several fractional-cent lines expose the difference; compare against independently calculated per-line expected values rather than the new implementation.',
  },
  {
    title: 'Remembered filters',
    description: 'Follow persisted state across a search redesign.',
    prompt:
      'Search now stores filters in the URL. Previously saved links must still open the same category and page, and Back must restore the prior filters. Select the most relevant checks.',
    options: [
      'Verify only a fresh visit to the homepage.',
      'Open an old saved search URL and check results.',
      'Change two filters, then use Back and check URL plus results.',
      'Require every saved link to redirect to the homepage.',
    ],
    answers: [1, 2],
    explanation:
      'URL migration affects existing entry points and browser history. Checking visible controls alone misses mismatches between filters and returned results, so verify both old-link behavior and restored search data.',
  },
  {
    title: 'A renamed address field',
    description: 'Check consumers of a shared response.',
    prompt:
      'The shipping API adds streetLine while retaining street for old mobile clients for one release. Select release checks that protect compatibility.',
    options: [
      'An old client can still read street.',
      'The updated client displays streetLine correctly.',
      'Remove street immediately because the web app no longer uses it.',
      'Only assert the response status is 200.',
    ],
    answers: [0, 1],
    explanation:
      'An additive migration promises compatibility for both client versions. A successful status cannot show whether either client can interpret the payload; validate field values through representative consumers.',
  },
  {
    title: 'The shared date picker',
    description: 'Trace a component change to its callers.',
    prompt:
      'A shared date picker gains a minimum-date option used only by booking. Birthdays must still accept past dates. Select risk-based regression coverage.',
    options: [
      'Reject all dates before today in every form.',
      'Check booking rejects dates before its configured minimum.',
      'Check a birthday form accepts a valid date in the past.',
      'Skip birthday because its source file did not change.',
    ],
    answers: [1, 2],
    explanation:
      'Shared components spread behavioral changes beyond edited screens. Exercise a caller that enables the option and one that leaves it unset to catch a default that accidentally restricts all consumers.',
  },
  {
    title: 'Cache across accounts',
    description: 'Test identity boundaries after caching is introduced.',
    prompt:
      'Profile responses are now cached. Each signed-in user must see only their own profile, including after account switching in one browser. Select priority regressions.',
    options: [
      'Load as Alice, sign out, then load as Bob and verify Bob’s data.',
      'Request the same profile route from two sessions and check isolation.',
      'Treat faster responses as proof that authorization works.',
      'Allow the cached profile until the next refresh after logout.',
    ],
    answers: [0, 1],
    explanation:
      'A cache key or client state that omits identity can leak another account’s profile. Test both server session isolation and browser account switching; response speed supplies no evidence of access control.',
  },
  {
    title: 'Queue delivery twice',
    description: 'Preserve side-effect guarantees during a worker migration.',
    prompt:
      'Email receipts move to an at-least-once queue. A receipt must be sent once per order, and failed jobs must retry. Select relevant regressions.',
    options: [
      'Deliver the same job twice and assert one receipt.',
      'Simulate a transient failure and assert eventual successful delivery.',
      'Disable retries so duplicates cannot occur.',
      'Only test a queue with no jobs.',
    ],
    answers: [0, 1],
    explanation:
      'At-least-once delivery requires duplicate handling as well as recovery. Test repeated delivery and transient failures together so a duplicate-prevention mechanism does not silently suppress legitimate retries.',
  },
  {
    title: 'Flag off, checkout on',
    description: 'Cover both branches of a feature flag.',
    prompt:
      'A new checkout is behind a flag. Existing checkout must remain available when the flag is off, and both paths must charge the displayed total. Select release checks.',
    options: [
      'Test only the enabled branch because it is new.',
      'Complete a purchase with the flag off.',
      'Complete a purchase with the flag on and compare displayed and charged totals.',
      'Assume flag configuration prevents defects.',
    ],
    answers: [1, 2],
    explanation:
      'Feature flags create multiple supported execution paths. Verify the fallback as well as the new branch, with the same money invariant, because shared dependencies can break the supposedly unchanged experience.',
  },
  {
    title: 'Index without lost rows',
    description: 'Verify observable behavior after a database optimization.',
    prompt:
      'A query gains a composite index and a rewritten sort. Reports must retain all rows, ordered by timestamp then id. Select appropriate regressions.',
    options: [
      'Compare row identities before and after on a fixed fixture.',
      'Include equal timestamps and verify the id tie-breaker.',
      'Accept missing rows if the report is faster.',
      'Check only the first row of an empty report.',
    ],
    answers: [0, 1],
    explanation:
      'Performance work must preserve result membership and deterministic ordering. Fixed fixtures with tied timestamps expose sort changes that ordinary unique timestamps hide, while row identities reveal omissions.',
  },
  {
    title: 'Unicode in the export',
    description: 'Check a CSV library replacement.',
    prompt:
      'A new CSV library must preserve names with accents, commas, quotes, and embedded newlines when the file is read back. Select targeted tests.',
    options: [
      'Use only simple ASCII names.',
      'Round-trip names containing commas and quotes through a CSV parser.',
      'Round-trip accented names and a field containing a newline.',
      'Count physical lines to determine records despite embedded newlines.',
    ],
    answers: [1, 2],
    explanation:
      'CSV escaping and character encoding are separate regression risks. Parse exported records back into fields and compare values; physical line counts are misleading when quoted fields legitimately contain newlines.',
  },
  {
    title: 'The timezone upgrade',
    description: 'Protect scheduling across a library update.',
    prompt:
      'A calendar library upgrade must preserve stored UTC instants and display them in the selected zone. Select checks that can reveal regressions.',
    options: [
      'Check appointments near a daylight-saving transition.',
      'Verify an existing stored instant is unchanged after editing an unrelated field.',
      'Require every local day to contain exactly 24 hours.',
      'Test only noon UTC in a zone without seasonal clock changes.',
    ],
    answers: [0, 1],
    explanation:
      'Timezone changes can alter display offsets or corrupt saved instants during conversion. Include seasonal transitions and a persistence round trip; a local calendar day need not contain exactly 24 elapsed hours.',
  },
  {
    title: 'Roles after consolidation',
    description: 'Review access when two middleware layers become one.',
    prompt:
      'A middleware refactor combines login and role checks. Editors may publish; viewers may read but never publish. Select release-blocking regressions.',
    options: [
      'Verify an editor can publish.',
      'Verify a logged-in viewer receives a denial when calling publish directly.',
      'Check only that the publish button is hidden.',
      'Grant publishing to every authenticated session.',
    ],
    answers: [0, 1],
    explanation:
      'Authorization regression needs an allowed action and a forbidden action against the actual endpoint. A hidden control is not enforcement, and successful authentication does not establish the required role.',
  },
  {
    title: 'A retry policy grows',
    description: 'Check recovery without repeating unsafe operations.',
    prompt:
      'A shared HTTP client starts retrying timeouts. Reads may retry; order creation requires a stable idempotency key. Select critical regressions.',
    options: [
      'Lose an order response after creation and verify retry produces one order.',
      'Verify the same idempotency key is reused across attempts.',
      'Assign a fresh key to each retry.',
      'Assume a timeout proves the server performed no work.',
    ],
    answers: [0, 1],
    explanation:
      'A timeout leaves the server outcome uncertain. Simulating response loss after the side effect tests the dangerous path; a stable key makes repeated attempts refer to the same operation instead of new orders.',
  },
  {
    title: 'Old sessions meet new signing',
    description: 'Test an intentional migration window.',
    prompt:
      'During key rotation, unexpired sessions signed by the previous key remain valid for one hour. New sessions use the new key; expired sessions stay invalid. Select required coverage.',
    options: [
      'Check old-key sessions within and after the migration window.',
      'Check new-key sessions and expired sessions independently.',
      'Accept every old-key token forever.',
      'Use only newly created sessions in the regression suite.',
    ],
    answers: [0, 1],
    explanation:
      'Rotation has a time-bounded compatibility promise and an expiration invariant. A controlled clock lets tests cover the grace boundary while proving that compatibility does not revive expired credentials.',
  },
  {
    title: 'When rollback reads new data',
    description: 'Plan compatibility checks across release versions.',
    prompt:
      'Version B writes a new optional metadata field. The deployment promises rollback to A without losing orders. Select evidence needed before release.',
    options: [
      'Create an order in B, then read it using A.',
      'Verify A tolerates the extra field and retains required order values.',
      'Assume successful deployment proves rollback compatibility.',
      'Delete all B-created orders before testing A.',
    ],
    answers: [0, 1],
    explanation:
      'Rollback compatibility concerns data written by the newer version, not just old fixtures. Exercise the promised version sequence with representative orders; deleting new records would evade the actual risk.',
  },
  {
    title: 'A flaky green build',
    description: 'Distinguish test instability from product recovery.',
    prompt:
      'A payment regression fails intermittently after a concurrency change, then passes on rerun. Select sound release decisions.',
    options: [
      'Investigate the failed attempt’s trace and transaction evidence.',
      'Repeat with controlled concurrent requests to isolate the failure.',
      'Erase the first failure because the rerun is green.',
      'Declare a product defect solely from the test name.',
    ],
    answers: [0, 1],
    explanation:
      'A passing rerun does not explain an earlier failure. Preserve the initial evidence and reproduce the relevant interleaving; investigation must distinguish a test synchronization problem from a real payment race.',
  },
];

export const documentation = [
  {
    title: 'Up to five, including five?',
    description: 'Turn an ambiguous limit into a testable contract.',
    prompt:
      'An upload guide says “files up to 5 MB” but does not define bytes or inclusivity. Select useful findings before implementing boundary tests.',
    options: [
      'Clarify whether MB means 5,000,000 bytes or 5 MiB.',
      'State whether a file exactly at the limit is accepted.',
      'Assume the size limit applies only to filenames.',
      'Replace the requirement with “small files only.”',
    ],
    answers: [0, 1],
    explanation:
      'A measurable boundary needs a unit and an equality rule. Without them, independently reasonable tests can disagree; record an exact byte limit and expected behavior at and immediately above that limit.',
  },
  {
    title: 'Two shipping promises',
    description: 'Find contradictions between user and API documentation.',
    prompt:
      'The help page promises free shipping at $50 or more. The API guide says only orders over $50 qualify. Select valid findings.',
    options: [
      'The documents disagree for an order of exactly $50.',
      'The product owner must resolve the intended threshold before a single expected result is chosen.',
      'Both statements mean exactly the same thing.',
      'Test $70 alone to resolve the contradiction.',
    ],
    answers: [0, 1],
    explanation:
      'Inclusive and exclusive thresholds differ at equality. Testing a value that satisfies both statements cannot resolve the conflict; obtain one authoritative rule and update both documents to match it.',
  },
  {
    title: 'An example that cannot log in',
    description: 'Review a quickstart for reproducibility.',
    prompt:
      'A quickstart calls a protected endpoint but never explains how to obtain a token or supply it. Select documentation improvements.',
    options: [
      'Document token acquisition and the required authorization header.',
      'Describe the expected unauthorized response when credentials are absent.',
      'Embed a real production token in the example.',
      'Tell readers to disable authentication globally.',
    ],
    answers: [0, 1],
    explanation:
      'A reproducible guide describes prerequisites and expected failure behavior. Use placeholders for credentials and explain how readers obtain their own; publishing a working secret creates a security problem.',
  },
  {
    title: 'The disappearing error schema',
    description: 'Find missing API contract details.',
    prompt:
      'An endpoint guide documents 200 responses but only says “invalid requests fail.” Clients need to display field errors reliably. Select missing details.',
    options: [
      'Error status codes and a stable response schema.',
      'Examples mapping invalid fields to machine-readable error identifiers.',
      'The server’s private stack traces.',
      'A promise that clients never send invalid input.',
    ],
    answers: [0, 1],
    explanation:
      'Consumers need predictable failure contracts as much as success payloads. Specify statuses, field paths, and stable identifiers with examples; internal stack traces are neither necessary nor an appropriate public contract.',
  },
  {
    title: 'Delete, but for how long?',
    description: 'Separate removal from retention.',
    prompt:
      'A product requirement says “delete removes the account immediately,” while operations retain backups for 30 days. Select points to clarify.',
    options: [
      'When the account becomes inaccessible in the live product.',
      'How retained backups expire and how restored data respects prior deletions.',
      'Claim all backup bytes disappear immediately without evidence.',
      'Omit retention because users cannot browse backups.',
    ],
    answers: [0, 1],
    explanation:
      'User-visible deletion and backup retention describe different lifecycle stages. The documentation should explain both and define restore handling so a recovery process does not unintentionally reactivate deleted accounts.',
  },
  {
    title: 'A webhook without a clock',
    description: 'Make delivery guarantees explicit.',
    prompt:
      'A webhook guide says “events are delivered automatically” but integrators must build reliable consumers. Select useful additions.',
    options: [
      'Retry schedule, maximum retry period, and duplicate-delivery expectations.',
      'Whether ordering is guaranteed and which event id supports deduplication.',
      'Guarantee delivery exactly once because HTTP is used.',
      'Tell clients to trust arrival order without a stated guarantee.',
    ],
    answers: [0, 1],
    explanation:
      'Consumers cannot infer ordering or uniqueness from HTTP. Document retry and duplication semantics along with a stable event identity, allowing integrations to handle delayed, repeated, or out-of-order deliveries deliberately.',
  },
  {
    title: 'Works on mobile',
    description: 'Replace a broad claim with a support contract.',
    prompt:
      'Acceptance criteria say “the form works on mobile.” Select changes that make verification repeatable.',
    options: [
      'Name supported browser and viewport combinations.',
      'Define observable expectations for keyboard use, validation, and completing submission.',
      'Treat a screenshot as proof that submission works.',
      'Require only that the page loads without a crash.',
    ],
    answers: [0, 1],
    explanation:
      'A support claim needs a defined environment matrix and task outcomes. Layout alone does not demonstrate that users can enter data, understand errors, navigate controls, and finish the workflow.',
  },
  {
    title: 'One field, three meanings',
    description: 'Resolve schema and example drift.',
    prompt:
      'The schema declares total as integer cents, the prose calls it dollars, and the example uses 12.50. Select review findings.',
    options: [
      'The unit and type conflict across the documentation.',
      'Align schema, prose, and examples with one authoritative representation.',
      'Assume every client will guess the intended currency scale.',
      'Change only the field’s color in the guide.',
    ],
    answers: [0, 1],
    explanation:
      'A unit mismatch can turn a valid-looking number into an incorrect charge. Decide the authoritative representation, then correct every occurrence and add a concrete example that makes the currency scale unambiguous.',
  },
  {
    title: 'Deprecation without a date',
    description: 'Review a migration notice from the consumer’s perspective.',
    prompt:
      'A notice says “v1 will be removed soon; use v2,” but customers run scheduled integrations. Select essential missing migration information.',
    options: [
      'A removal date with timezone and an overlap policy.',
      'A mapping of changed fields and a way to verify migrated requests.',
      'Only the new API logo.',
      'A requirement that customers discover breaking changes in production.',
    ],
    answers: [0, 1],
    explanation:
      'Integrators need both a planning deadline and actionable technical differences. A concrete timeline and verifiable migration examples reduce uncertainty; “soon” cannot support scheduling or a reliable compatibility test.',
  },
  {
    title: 'The recovery runbook gap',
    description: 'Check whether an operator can verify recovery.',
    prompt:
      'A runbook says “restart the worker to fix stuck jobs” but gives no diagnosis, success check, or duplicate-job warning. Select necessary improvements.',
    options: [
      'Define evidence of stuck processing and measurable post-restart recovery checks.',
      'Explain handling of in-flight jobs and when to escalate if recovery fails.',
      'Declare success as soon as the restart command returns.',
      'Delete the queue before every restart without evaluating pending work.',
    ],
    answers: [0, 1],
    explanation:
      'An operational procedure must connect an observed symptom to an action and a verified outcome. Restarting a process does not prove jobs are progressing, and in-flight work may repeat or require explicit reconciliation.',
  },
];

export const performance = [
  {
    title: 'The average hides the queue',
    description: 'Read latency percentiles against a release target.',
    prompt:
      'At the agreed load, the search target is p95 at most 400 ms. These measurements are from one representative run. Select supported conclusions.',
    metrics: [
      { label: 'Mean latency', value: 180, unit: 'ms' },
      { label: 'p95 latency', value: 720, unit: 'ms' },
      { label: 'p95 target', value: 400, unit: 'ms' },
    ],
    options: [
      'This run misses the p95 target.',
      'The low mean does not show that slow requests meet the target.',
      'Every request took 720 ms.',
      'The mean alone proves the release passes.',
    ],
    answers: [0, 1],
    explanation:
      'The 95th-percentile measurement exceeds the stated threshold even though the mean is lower. Percentiles describe a latency distribution; p95 is neither the duration of every request nor the maximum.',
  },
  {
    title: 'Faster by failing',
    description: 'Evaluate throughput alongside errors.',
    prompt:
      'Under the same offered load, the candidate responds faster but returns more errors. The error budget is at most 1%. Select supported release findings.',
    metrics: [
      { label: 'Baseline p95', value: 500, unit: 'ms' },
      { label: 'Candidate p95', value: 260, unit: 'ms' },
      { label: 'Baseline errors', value: 0.2, unit: '%' },
      { label: 'Candidate errors', value: 8, unit: '%' },
    ],
    options: [
      'The candidate violates the error budget.',
      'Compare successful-request latency and successful throughput before claiming an improvement.',
      'Faster error responses prove users finish tasks faster.',
      'Ignore failed requests in all release criteria.',
    ],
    answers: [0, 1],
    explanation:
      'Fast failures can make aggregate latency look better while useful work declines. Evaluate success rate, successful throughput, and latency together; the candidate already exceeds the explicitly allowed error rate.',
  },
  {
    title: 'One query per row',
    description: 'Recognize database work that scales with result count.',
    prompt:
      'Tracing shows one list query plus one owner lookup for each displayed item. Select justified findings from the two runs.',
    metrics: [
      { label: 'Items in small page', value: 10, unit: 'items' },
      { label: 'Queries for small page', value: 11, unit: 'queries' },
      { label: 'Items in large page', value: 100, unit: 'items' },
      { label: 'Queries for large page', value: 101, unit: 'queries' },
    ],
    options: [
      'The trace demonstrates an N+1 query pattern.',
      'Evaluate batching or joining owner lookups, then verify returned data remains correct.',
      'Increasing the browser font size removes these database queries.',
      'The data proves the database has no indexes.',
    ],
    answers: [0, 1],
    explanation:
      'The explicit trace and counts show one additional lookup per item. Batching or an appropriate join can reduce round trips, but result correctness and query plans still need verification; these counts do not prove index absence.',
  },
  {
    title: 'Heap that stays high',
    description: 'Interpret a soak test without overclaiming a cause.',
    prompt:
      'In a fixed-load soak test, retained heap measured after comparable garbage-collection cycles rises steadily. Select appropriate conclusions and next steps.',
    metrics: [
      { label: 'Retained heap at 10 minutes', value: 120, unit: 'MiB' },
      { label: 'Retained heap at 60 minutes', value: 310, unit: 'MiB' },
      { label: 'Retained heap at 120 minutes', value: 540, unit: 'MiB' },
    ],
    options: [
      'Investigate growing retained objects using heap snapshots.',
      'Extend the test and check whether growth stabilizes within the memory budget.',
      'These samples identify the exact leaking function.',
      'A fast first request rules out a long-running memory problem.',
    ],
    answers: [0, 1],
    explanation:
      'Persistent retained-heap growth is evidence worth investigating, but samples alone cannot distinguish an unbounded cache from a leak or name its source. Compare object retention and longer-run behavior against a defined budget.',
  },
  {
    title: 'A warm-cache victory',
    description: 'Check whether a benchmark represents first-time visitors.',
    prompt:
      'The release target is first-visit load below 3 seconds on a specified mobile network. A warm-cache run and a cold-cache run use that same device and network. Select supported findings.',
    metrics: [
      { label: 'Warm-cache load', value: 1.1, unit: 's' },
      { label: 'Cold-cache load', value: 4.8, unit: 's' },
      { label: 'First-visit target', value: 3, unit: 's' },
    ],
    options: [
      'The measured cold first visit misses the target.',
      'Report cache state and investigate cold-load resources.',
      'Use only the warm result to certify first-visit performance.',
      'The difference proves all visitors have fast connections.',
    ],
    answers: [0, 1],
    explanation:
      'A first visit cannot rely on assets already cached from a prior visit. The cold measurement matches the stated scenario and fails its threshold; keep cache state explicit so repeated benchmarks remain comparable.',
  },
  {
    title: 'Workers without throughput',
    description: 'Spot a saturation point in a load experiment.',
    prompt:
      'Doubling worker count under a sufficient fixed backlog barely changes throughput while database CPU approaches saturation. Select justified next actions.',
    metrics: [
      { label: 'Throughput with 4 workers', value: 200, unit: 'jobs/s' },
      { label: 'Throughput with 8 workers', value: 205, unit: 'jobs/s' },
      { label: 'Database CPU with 8 workers', value: 98, unit: '%' },
    ],
    options: [
      'Investigate database waits and query costs before adding more workers.',
      'Measure queue delay and errors as well as completed jobs.',
      'Promise that 16 workers will double throughput.',
      'Conclude that CPU alone identifies one defective query.',
    ],
    answers: [0, 1],
    explanation:
      'Additional workers provide little gain and the database is a plausible bottleneck, not a proven single-query cause. Gather wait and query evidence, while checking whether extra concurrency increases queueing or errors.',
  },
  {
    title: 'Unequal benchmark tracks',
    description: 'Identify confounding test conditions.',
    prompt:
      'Version A used a tiny fixture and version B used a much larger fixture on the same machine. Select sound interpretations of their report times.',
    metrics: [
      { label: 'A fixture', value: 1000, unit: 'rows' },
      { label: 'B fixture', value: 100000, unit: 'rows' },
      { label: 'A duration', value: 80, unit: 'ms' },
      { label: 'B duration', value: 900, unit: 'ms' },
    ],
    options: [
      'Rerun both versions against the same representative dataset.',
      'The current comparison mixes version changes with dataset size.',
      'The numbers prove B is slower on identical workloads.',
      'Divide by rows and assume all report costs scale perfectly linearly.',
    ],
    answers: [0, 1],
    explanation:
      'Dataset size is a confounding variable, so the report cannot isolate the version’s effect. Match fixtures and conditions before comparing; fixed costs and nonlinear query behavior make simple per-row normalization unreliable.',
  },
  {
    title: 'Burst after a quiet hour',
    description: 'Measure recovery after a traffic spike.',
    prompt:
      'A burst test allows the queue to grow, but requires it to drain within 60 seconds after traffic returns to normal. Select supported findings.',
    metrics: [
      { label: 'Queue before burst', value: 0, unit: 'jobs' },
      { label: 'Queue at burst end', value: 800, unit: 'jobs' },
      { label: 'Queue 60 seconds later', value: 230, unit: 'jobs' },
      { label: 'Queue 120 seconds later', value: 0, unit: 'jobs' },
    ],
    options: [
      'The observed run misses the 60-second recovery requirement.',
      'Measure job age and processing capacity during recovery.',
      'The eventual empty queue proves the recovery deadline was met.',
      'A temporary queue is forbidden by this requirement.',
    ],
    answers: [0, 1],
    explanation:
      'The contract permits a burst backlog but sets a recovery deadline. Remaining work at 60 seconds fails that deadline even if it later drains; job age and processing capacity help explain the delay experienced by users.',
  },
  {
    title: 'Compression with a tradeoff',
    description: 'Evaluate resource savings against a user-facing budget.',
    prompt:
      'A compression change reduces transfer size but raises server processing time. End-to-end p95 must stay at most 700 ms on the target network. Select supported conclusions.',
    metrics: [
      { label: 'Baseline transfer', value: 900, unit: 'KiB' },
      { label: 'Candidate transfer', value: 240, unit: 'KiB' },
      { label: 'Baseline end-to-end p95', value: 650, unit: 'ms' },
      { label: 'Candidate end-to-end p95', value: 810, unit: 'ms' },
    ],
    options: [
      'The candidate reduces transferred bytes but misses the latency budget.',
      'Profile compression cost and retest alternative settings under the same load.',
      'Smaller payloads guarantee faster complete requests.',
      'Approve solely because transfer size improved.',
    ],
    answers: [0, 1],
    explanation:
      'Optimizing one resource can worsen the complete user request. The measured end-to-end percentile is the acceptance criterion; investigate processing cost and test alternatives while retaining comparable load and network conditions.',
  },
  {
    title: 'The missing slow clients',
    description: 'Recognize a load-generator measurement blind spot.',
    prompt:
      'A closed-loop generator waits for each response before sending its next request. During a stall, its achieved rate falls far below the planned arrival rate. Select valid findings.',
    metrics: [
      { label: 'Planned arrival rate', value: 100, unit: 'requests/s' },
      { label: 'Achieved rate during stall', value: 12, unit: 'requests/s' },
      { label: 'Observed p95', value: 950, unit: 'ms' },
    ],
    options: [
      'The test did not maintain the intended arrival pressure during the stall.',
      'Consider an arrival-rate workload and account for scheduled but delayed requests.',
      'The observed percentile proves the service met the planned 100 requests/s workload.',
      'A lower achieved rate means real users stopped wanting the service.',
    ],
    answers: [0, 1],
    explanation:
      'Waiting for responses can suppress new arrivals exactly when the service slows, hiding queueing under the intended workload. An arrival-rate model with adequate generator capacity makes missed or delayed scheduled work visible.',
  },
];
