import { config } from '../config.js';

/**
 * FixFlow AI triage service
 * ==========================
 * Turns a raw, human-typed complaint into structured maintenance data:
 * category, priority, urgency score, tags, safety flags and a summary.
 *
 * Two modes, same output contract:
 *
 *  1. `heuristic` (default) — a deterministic, dependency-free NLP pipeline
 *     (lexicon scoring + phrase matching + hazard rules + risk combination).
 *     Works offline, is unit-tested, and never returns a 500 because a vendor
 *     is down. This is what the demo and the test-suite exercise.
 *
 *  2. `llm` — when `OPENAI_API_KEY` is configured we ask an LLM for the same
 *     JSON shape and blend it with the heuristic result. Any network error,
 *     timeout or malformed payload silently degrades to mode 1.
 *
 * Hiring note: the interesting engineering here is not the model call, it is
 * the guardrails around it (schema validation, timeouts, deterministic
 * fallback, safety-floor rules that an LLM is not allowed to lower).
 */

const CATEGORY_LEXICON = {
  electrical: {
    label: 'Electrical',
    terms: [
      ['power outage', 9], ['no power', 9], ['power cut', 9], ['blackout', 9],
      ['short circuit', 9], ['electrical', 8], ['electric', 7], ['wiring', 8],
      ['wire', 6], ['socket', 7], ['outlet', 7], ['power socket', 8],
      ['circuit breaker', 8], ['breaker', 6], ['fuse', 6], ['sparks', 9],
      ['sparking', 9], ['flickering', 6], ['flicker', 5], ['lamp', 4],
      ['light', 4], ['lights', 4], ['bulb', 5], ['lighting', 5],
      ['generator', 7], ['transformer', 8], ['voltage', 7], ['tripped', 6],
      ['switchboard', 7], ['panel', 4], ['burnt smell', 8], ['burning smell', 8],
    ],
  },
  plumbing: {
    label: 'Plumbing & Water',
    terms: [
      ['water leak', 10], ['leaking', 8], ['leak', 8], ['pipe', 8], ['pipes', 8],
      ['burst pipe', 10], ['flooding', 10], ['flood', 9], ['water', 6],
      ['tap', 6], ['faucet', 7], ['sink', 6], ['drain', 7], ['drainage', 7],
      ['blocked drain', 9], ['clogged', 8], ['toilet', 7], ['cistern', 7],
      ['sewage', 9], ['sewer', 9], ['overflow', 8], ['overflowing', 8],
      ['water heater', 7], ['boiler', 7], ['no water', 9], ['low pressure', 7],
      ['shower', 5], ['bathroom', 4], ['dripping', 6], ['damp', 6],
      ['water damage', 9], ['soaked', 8],
    ],
  },
  hvac: {
    label: 'HVAC & Climate',
    terms: [
      ['air conditioning', 9], ['air conditioner', 9], ['hvac', 9], ['ac unit', 9],
      ['ac ', 5], ['a/c', 8], ['cooling', 6], ['not cooling', 9], ['heating', 7],
      ['heater', 7], ['radiator', 7], ['thermostat', 7], ['ventilation', 7],
      ['vent', 5], ['air quality', 6], ['stuffy', 5], ['temperature', 5],
      ['too cold', 6], ['too hot', 6], ['freezing', 5], ['humidity', 5],
      ['condenser', 8], ['compressor', 8], ['filter', 4], ['duct', 6],
    ],
  },
  elevator: {
    label: 'Elevators & Lifts',
    terms: [
      ['elevator', 10], ['lift', 9], ['stuck in lift', 12], ['stuck in elevator', 12],
      ['trapped in', 11], ['overload', 6], ['escalator', 9], ['shaft', 8],
      ['lift door', 9], ['elevator door', 9], ['floor 3 and', 0], ['malfunction lift', 9],
    ],
  },
  it_network: {
    label: 'IT & Network',
    terms: [
      ['wifi', 9], ['wi-fi', 9], ['internet', 8], ['network', 7], ['ethernet', 7],
      ['router', 7], ['switch port', 6], ['server', 7], ['printer', 7],
      ['computer', 6], ['laptop', 5], ['monitor', 5], ['software', 5],
      ['login', 5], ['system down', 9], ['offline', 6], ['slow connection', 6],
      ['projector', 6], ['camera feed', 6], ['access point', 7], ['vpn', 6],
    ],
  },
  cleaning: {
    label: 'Cleaning & Housekeeping',
    terms: [
      ['clean', 7], ['cleaning', 8], ['housekeeping', 8], ['dirty', 7],
      ['trash', 7], ['garbage', 7], ['rubbish', 7], ['waste', 6], ['bin', 6],
      ['spill', 6], ['stain', 5], ['dust', 5], ['floors', 5], ['mop', 6],
      ['odour', 6], ['odor', 6], ['smell', 5], ['unhygienic', 7],
    ],
  },
  security: {
    label: 'Security & Access',
    terms: [
      ['security', 8], ['intruder', 10], ['trespass', 9], ['theft', 9],
      ['stolen', 9], ['burglar', 10], ['cctv', 8], ['camera', 6],
      ['lock', 6], ['locked out', 7], ['broken lock', 8], ['door lock', 8],
      ['badge reader', 8], ['access card', 7], ['gate', 6], ['alarm', 8],
      ['unauthorised', 8], ['unauthorized', 8], ['suspicious', 8],
    ],
  },
  structural: {
    label: 'Structural & Civil',
    terms: [
      ['ceiling', 7], ['roof', 7], ['roof leak', 10], ['wall', 6], ['crack', 7],
      ['cracked', 7], ['collapse', 11], ['collapsed', 11], ['concrete', 7],
      ['tile', 5], ['tiles', 5], ['window', 5], ['broken window', 8],
      ['door', 5], ['asphalt', 5], ['pothole', 6], ['pavement', 5],
      ['paint', 4], ['plaster', 5], ['foundation', 7], ['handrail', 6],
    ],
  },
  appliance: {
    label: 'Appliances & Equipment',
    terms: [
      ['fridge', 8], ['refrigerator', 8], ['freezer', 8], ['microwave', 7],
      ['oven', 7], ['dishwasher', 8], ['washing machine', 8], ['dryer', 7],
      ['kettle', 6], ['coffee machine', 6], ['tv', 5], ['appliance', 7],
      ['equipment', 6], ['machine broken', 8], ['not working', 6],
    ],
  },
  pest: {
    label: 'Pest Control',
    terms: [
      ['pest', 9], ['cockroach', 9], ['roach', 9], ['rat', 9], ['rats', 9],
      ['mouse', 8], ['mice', 8], ['insect', 7], ['termite', 9], ['bedbug', 9],
      ['bed bug', 9], ['mosquito', 6], ['ants', 6], ['infestation', 10],
      ['rodent', 9], ['snake', 10], ['wasp', 8], ['bees', 8],
    ],
  },
  furniture: {
    label: 'Furniture & Fixtures',
    terms: [
      ['chair', 6], ['desk', 6], ['table', 6], ['cabinet', 6], ['shelf', 6],
      ['sofa', 6], ['couch', 6], ['cupboard', 6], ['blinds', 5], ['curtain', 5],
      ['carpet', 5], ['furniture', 7], ['broken chair', 8], ['wobbly', 6],
    ],
  },
};

/** Signals that raise urgency regardless of category. */
const URGENCY_LEXICON = [
  // immediate danger / life safety
  [/\b(fire|flames|smoke|burning|explosion|exploded|blast)\b/, 45, 'FIRE_RISK'],
  [/\b(gas leak|gas smell|smell of gas|gas odour|gas odor)\b/, 45, 'GAS_LEAK'],
  [/\b(spark|sparks|sparking|short circuit|electrocution|electric shock|live wire)\b/, 35, 'ELECTRICAL_HAZARD'],
  [/\b(stuck in (the )?(lift|elevator)|trapped (in|inside)|cannot get out|can't get out)\b/, 50, 'CONFINED_TRAPPED'],
  [/\b(collapse|collapsed|falling|about to fall|structural damage)\b/, 40, 'STRUCTURAL_RISK'],
  [/\b(flood|flooding|burst pipe|water everywhere|pouring water)\b/, 35, 'WATER_INGRESS'],
  [/\b(blood|injury|injured|unconscious|fainted|ambulance|medical emergency)\b/, 45, 'MEDICAL'],
  [/\b(intruder|burglar|theft|stolen|robbery|trespass)\b/, 30, 'SECURITY_BREACH'],
  // severe disruption
  [/\b(completely (down|offline|broken)|total outage|entire (floor|building|wing))\b/, 25, null],
  [/\b(no (water|power|electricity|heating|internet|ac))\b/, 22, null],
  [/\b(out of service|not working at all|stopped working)\b/, 14, null],
  [/\b(overflow|overflowing|sewage|sewer)\b/, 22, 'SANITATION'],
  [/\b(immediately|urgent|emergency|asap|as soon as possible|right now)\b/, 16, null],
  [/\b(critical|severe|dangerous|hazard|unsafe)\b/, 18, null],
  [/\b(cannot (work|use|access)|can't (work|use|access)|blocked (access|entry)|obstruct)\b/, 10, null],
  // impact scale
  [/\b(multiple (rooms|floors|people|units)|whole (team|department|floor)|everyone)\b/, 15, null],
  [/\b(customer(s)? (waiting|arriving)|client visit|audit|inspection tomorrow)\b/, 12, null],
  [/\b(repeated|again|third time|keeps happening|recurring|still not fixed)\b/, 10, 'RECURRING'],
];

/** Lowers urgency slightly — signs the issue is stable / cosmetic. */
const DE_ESCALATORS = [
  [/\b(minor|cosmetic|slight|small|tiny)\b/, -6],
  [/\b(no rush|whenever (possible|convenient)|not urgent|low priority)\b/, -14],
  [/\b(suggestion|request|would be nice|please consider|feedback)\b/, -8],
  [/\b(aesthetic|appearance|paint colour|paint color)\b/, -6],
];

const NEGATIVE_SENTIMENT = [
  [/\b(frustrat\w*|angry|annoyed|terrible|awful|unacceptable|disappoint\w*|ridiculous|useless|fed up)\b/, 1],
  [/\b(wait\w* (for )?(days|weeks|months)|no one (came|responded)|ignored|escalate|complain\w*)\b/, 1],
];

const ASSET_PATTERNS = [
  /\b(?:unit|asset|machine|AC|AHU|FCU|pump|chiller|boiler|panel|switchboard|model)\s*(?:no\.?|number|id|#|:)?\s*([A-Z0-9][A-Z0-9\-/]{1,15})\b/g,
  /\b([A-Z]{2,}-?\d{2,6})\b/g, // e.g. AC-102, P-3312
];

const SENTENCE_RISK = {
  FIRE_RISK: 'Reported fire/smoke signal — fire-safety protocol applies.',
  GAS_LEAK: 'Possible gas leak — evacuate the immediate area and isolate supply.',
  ELECTRICAL_HAZARD: 'Live electrical hazard reported — isolate power before touching.',
  CONFINED_TRAPPED: 'Someone may be trapped — treat as life-safety emergency.',
  STRUCTURAL_RISK: 'Possible structural instability — restrict access and inspect.',
  WATER_INGRESS: 'Active water ingress — shut off supply to limit damage.',
  MEDICAL: 'Medical emergency reported — dispatch first responders.',
  SECURITY_BREACH: 'Security incident reported — notify site security immediately.',
  SANITATION: 'Sanitation risk — contain and disinfect the area.',
  RECURRING: 'Repeat failure — check for a root cause, not just a patch.',
};

const PLAYBOOKS = {
  electrical: ['Isolate the affected circuit at the distribution board', 'Test with a certified multimeter before re-energising', 'Replace damaged sockets/cabling and log the asset'],
  plumbing: ['Locate and close the nearest isolation valve', 'Contain standing water and protect nearby electronics', 'Inspect joints, seals and drain traps'],
  hvac: ['Check thermostat setpoint and power to the AHU/FCU', 'Inspect filters, belts and condenser coils', 'Verify refrigerant pressure and airflow'],
  elevator: ['Confirm no passengers are inside', 'Place the lift out of service with signage', 'Escalate to the certified lift contractor'],
  it_network: ['Check uplink, PoE and switch port status', 'Restart the affected access point', 'Log a ticket with the network vendor if the link stays down'],
  cleaning: ['Dispatch housekeeping with the correct consumables', 'Treat spills to prevent slips', 'Schedule a deep clean for repeat areas'],
  security: ['Preserve CCTV footage before it rotates out', 'Notify the security supervisor and site manager', 'Replace/rekey the affected locks or readers'],
  structural: ['Cordon off the area and stop access', 'Photograph and measure the defect for the engineer', 'Book a structural survey within 24 hours'],
  appliance: ['Tag the appliance out of service', 'Verify the fault against the warranty/AMC coverage', 'Book repair or replacement'],
  pest: ['Identify the species before treatment', 'Treat and set monitoring traps', 'Schedule a follow-up inspection in 7 days'],
  furniture: ['Inspect and repair or remove the item from service', 'Replace from stores if repair is not viable'],
  other: ['A supervisor will review and route this request', 'Gather more detail or photos from the reporter'],
};

const PRIORITY_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const RANK_PRIORITY = { 1: 'LOW', 2: 'MEDIUM', 3: 'HIGH', 4: 'CRITICAL' };
const HIGH_IMPACT_FLAGS = new Set([
  'FIRE_RISK', 'GAS_LEAK', 'ELECTRICAL_HAZARD', 'CONFINED_TRAPPED',
  'STRUCTURAL_RISK', 'MEDICAL', 'SECURITY_BREACH',
]);

const BASE_HOURS = {
  electrical: 3, plumbing: 3, hvac: 4, elevator: 5, it_network: 2,
  cleaning: 1, security: 2, structural: 12, appliance: 4, pest: 3,
  furniture: 2, other: 4,
};

const PRIORITY_HOURS_MULTIPLIER = { LOW: 2.2, MEDIUM: 1.4, HIGH: 0.8, CRITICAL: 0.45 };

export const CATEGORY_KEYS = Object.keys(CATEGORY_LEXICON);

/** Normalise text for matching (lowercase, collapse whitespace, keep punctuation for regexes). */
function normalise(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
}

/** Split into words + keep 2-/3-grams so phrases like "burst pipe" score once. */
function tokens(text) {
  const words = normalise(text).replace(/[^a-z0-9'/\-\s]/g, ' ').split(/\s+/).filter(Boolean);
  const out = new Set(words);
  for (let i = 0; i < words.length - 1; i += 1) out.add(`${words[i]} ${words[i + 1]}`);
  for (let i = 0; i < words.length - 2; i += 1) out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return { words, grams: out };
}

function scoreCategories(text, grams) {
  const scores = {};
  const evidence = {};
  for (const [key, { terms }] of Object.entries(CATEGORY_LEXICON)) {
    let score = 0;
    const hits = [];
    for (const [term, weight] of terms) {
      if (!weight) continue;
      const matched = term.includes(' ') || term.endsWith(' ') ? text.includes(term.trim()) : grams.has(term);
      if (matched) {
        score += weight;
        hits.push(term.trim());
      }
    }
    // Specificity bonus: long, unambiguous phrases are worth more than the sum of words.
    if (hits.length > 1) score *= 1 + Math.min(0.35, (hits.length - 1) * 0.08);
    scores[key] = score;
    evidence[key] = hits;
  }
  return { scores, evidence };
}

function pickCategory(scores, evidence) {
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topKey, topScore] = ranked[0];
  const secondScore = ranked[1]?.[1] ?? 0;

  if (topScore <= 0) {
    return { category: 'other', confidence: 0.34, evidence: [], runnerUp: null };
  }

  const margin = topScore === 0 ? 0 : (topScore - secondScore) / topScore;
  const coverage = Math.min(1, evidence[topKey].length / 3);
  const confidence = Math.max(0.4, Math.min(0.98, 0.52 + margin * 0.3 + coverage * 0.22));

  return {
    category: topKey,
    confidence: Number(confidence.toFixed(2)),
    evidence: evidence[topKey],
    runnerUp: secondScore > 0 ? { category: ranked[1][0], score: secondScore } : null,
  };
}

function scoreUrgency(text) {
  let score = 8; // baseline noise floor for any reported defect
  const flags = [];
  const drivers = [];

  for (const [pattern, weight, flag] of URGENCY_LEXICON) {
    const match = pattern.exec(text);
    if (!match) continue;
    score += weight;
    drivers.push({ signal: match[0].trim(), weight });
    if (flag && !flags.includes(flag)) flags.push(flag);
  }
  for (const [pattern, weight] of DE_ESCALATORS) {
    const match = pattern.exec(text);
    if (!match) continue;
    score += weight;
    drivers.push({ signal: match[0].trim(), weight });
  }
  return { score, flags, drivers };
}

function scoreSentiment(text) {
  let hits = 0;
  for (const [pattern] of NEGATIVE_SENTIMENT) if (pattern.test(text)) hits += 1;
  if (hits === 0) return 'neutral';
  return hits >= 2 ? 'frustrated' : 'concerned';
}

function extractAssets(text) {
  const found = new Set();
  for (const pattern of ASSET_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text.toUpperCase())) !== null) {
      const candidate = (match[1] ?? match[0]).trim();
      if (candidate.length >= 2 && !/^\d+$/.test(candidate)) found.add(candidate);
      if (found.size >= 6) break;
    }
  }
  return [...found];
}

function extractLocationHints(text) {
  const hints = [];
  const room = /\b(?:room|rm|unit|suite|apt|apartment|office|lab|classroom|block|wing|floor|level|gate|bay)\s*[-#:]?\s*([a-z0-9]{1,6})\b/gi;
  let match;
  while ((match = room.exec(text)) !== null) {
    hints.push(match[0].replace(/\s+/g, ' ').trim());
    if (hints.length >= 4) break;
  }
  return [...new Set(hints)];
}

function derivePriority({ categoryDefault, urgencyScore, flags, sentiment }) {
  let rank = PRIORITY_RANK[categoryDefault] ?? 2;
  if (urgencyScore >= 65) rank = Math.max(rank, 4);
  else if (urgencyScore >= 42) rank = Math.max(rank, 3);
  else if (urgencyScore >= 24) rank = Math.max(rank, 2);

  // Safety floor: hazards are never below HIGH, and life-safety is CRITICAL.
  const hasHighImpact = flags.some((flag) => HIGH_IMPACT_FLAGS.has(flag));
  if (hasHighImpact) rank = 4;
  else if (flags.length > 0) rank = Math.max(rank, 3);

  if (sentiment === 'frustrated' && rank < 3) rank += 1;
  return RANK_PRIORITY[Math.min(4, rank)];
}

function buildSummary({ category, priority, flags, evidence, locationHints, assets }) {
  const label = CATEGORY_LEXICON[category]?.label ?? 'Maintenance';
  const parts = [`${priority} ${label.toLowerCase()} issue`];
  if (evidence.length) parts.push(`matched on "${evidence.slice(0, 3).join('", "')}"`);
  if (assets.length) parts.push(`likely asset ${assets.slice(0, 2).join(', ')}`);
  if (locationHints.length) parts.push(`location "${locationHints[0]}"`);
  const risk = flags.map((flag) => SENTENCE_RISK[flag]).filter(Boolean);
  const head = `${parts.join(', ')}.`;
  return risk.length ? `${head} ${risk.join(' ')}` : head;
}

/**
 * Deterministic triage. Pure function — trivially unit-testable.
 * @returns {object} structured analysis
 */
export function analyseHeuristic({ title = '', description = '', categoryHint, locationText } = {}) {
  const text = normalise(`${title} ${title} ${description}`); // title weighted 2x
  const { grams } = tokens(text);
  const { scores, evidence } = scoreCategories(text, grams);
  const picked = pickCategory(scores, evidence);

  const category = categoryHint && CATEGORY_LEXICON[categoryHint] ? categoryHint : picked.category;
  const { score: rawUrgency, flags, drivers } = scoreUrgency(text);
  const urgency = Math.max(0, Math.min(100, Math.round(rawUrgency)));
  const sentiment = scoreSentiment(text);
  const assets = extractAssets(`${title} ${description}`);
  const locationHints = extractLocationHints(`${title} ${description} ${locationText ?? ''}`);

  const categoryDefault = DEFAULT_PRIORITY_BY_CATEGORY[category] ?? 'MEDIUM';
  const priority = derivePriority({ categoryDefault, urgencyScore: urgency, flags, sentiment });
  const estimatedHours = Number(
    ((BASE_HOURS[category] ?? 4) * PRIORITY_HOURS_MULTIPLIER[priority]).toFixed(1),
  );

  const tags = [...new Set([
    category,
    ...(flags.length ? ['safety'] : []),
    ...(sentiment !== 'neutral' ? [sentiment] : []),
    ...picked.evidence.slice(0, 4).map((term) => term.replace(/\s+/g, '-')),
    ...assets.slice(0, 2).map((asset) => `asset:${asset.toLowerCase()}`),
  ])].slice(0, 8);

  const actions = [...(PLAYBOOKS[category] ?? PLAYBOOKS.other)];
  for (const flag of flags) if (SENTENCE_RISK[flag]) actions.unshift(SENTENCE_RISK[flag]);

  return {
    category,
    categoryLabel: CATEGORY_LEXICON[category]?.label ?? 'General',
    confidence: picked.confidence,
    priority,
    urgency,
    sentiment,
    flags,
    tags,
    assets,
    locationHints,
    estimatedHours,
    summary: buildSummary({ category, priority, flags, evidence: picked.evidence, locationHints, assets }),
    suggestedActions: [...new Set(actions)].slice(0, 5),
    drivers: drivers.sort((a, b) => b.weight - a.weight).slice(0, 6),
    runnerUp: picked.runnerUp,
    model: 'fixflow-triage-v1',
    source: 'heuristic',
  };
}

/** Default priority per category, reused by the seed and the schema defaults. */
export const DEFAULT_PRIORITY_BY_CATEGORY = {
  electrical: 'HIGH',
  plumbing: 'HIGH',
  hvac: 'MEDIUM',
  elevator: 'HIGH',
  it_network: 'MEDIUM',
  cleaning: 'LOW',
  security: 'HIGH',
  structural: 'MEDIUM',
  appliance: 'MEDIUM',
  pest: 'MEDIUM',
  furniture: 'LOW',
  other: 'MEDIUM',
};

const LLM_SYSTEM_PROMPT = `You are FixFlow's maintenance triage engine.
Return ONLY minified JSON matching:
{"category":"electrical|plumbing|hvac|elevator|it_network|cleaning|security|structural|appliance|pest|furniture|other","priority":"LOW|MEDIUM|HIGH|CRITICAL","urgency":0-100,"confidence":0-1,"sentiment":"neutral|concerned|frustrated","tags":["..."],"flags":["FIRE_RISK"|"GAS_LEAK"|"ELECTRICAL_HAZARD"|"CONFINED_TRAPPED"|"STRUCTURAL_RISK"|"WATER_INGRESS"|"MEDICAL"|"SECURITY_BREACH"|"SANITATION"|"RECURRING"],"summary":"one sentence","suggestedActions":["..."],"estimatedHours":number}
Rules: life-safety signals must use CRITICAL. Never downgrade a safety flag. No prose, no markdown.`;

const VALID_PRIORITIES = new Set(Object.keys(PRIORITY_RANK));
const VALID_SENTIMENTS = new Set(['neutral', 'concerned', 'frustrated']);
const VALID_FLAGS = new Set(Object.keys(SENTENCE_RISK));

function coerceLlmPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const category = CATEGORY_LEXICON[payload.category] ? payload.category : null;
  const priority = VALID_PRIORITIES.has(payload.priority) ? payload.priority : null;
  if (!category || !priority) return null;
  const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  return {
    category,
    priority,
    urgency: Math.round(clamp(payload.urgency, 0, 100, 50)),
    confidence: Number(clamp(payload.confidence, 0, 1, 0.8).toFixed(2)),
    sentiment: VALID_SENTIMENTS.has(payload.sentiment) ? payload.sentiment : 'neutral',
    tags: Array.isArray(payload.tags) ? payload.tags.filter((tag) => typeof tag === 'string').slice(0, 8) : [],
    flags: Array.isArray(payload.flags) ? payload.flags.filter((flag) => VALID_FLAGS.has(flag)) : [],
    summary: typeof payload.summary === 'string' ? payload.summary.slice(0, 400) : null,
    suggestedActions: Array.isArray(payload.suggestedActions)
      ? payload.suggestedActions.filter((a) => typeof a === 'string').slice(0, 5)
      : [],
    estimatedHours: Number(clamp(payload.estimatedHours, 0.25, 80, 4).toFixed(1)),
  };
}

async function analyseWithLlm({ title, description, locationText }) {
  const { apiKey, model, baseUrl, timeoutMs } = config.ai;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: LLM_SYSTEM_PROMPT },
          { role: 'user', content: `Title: ${title}\nLocation: ${locationText ?? 'unknown'}\nDescription: ${description}` },
        ],
      }),
    });
    if (!response.ok) return null;
    const body = await response.json();
    const raw = body?.choices?.[0]?.message?.content;
    if (!raw) return null;
    return coerceLlmPayload(JSON.parse(raw));
  } catch {
    return null; // any failure → deterministic fallback
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Blend the heuristic result with the LLM result using safety-first rules.
 * The LLM may raise severity but the heuristic's safety flags are sticky.
 */
function blend(heuristic, llm) {
  if (!llm) return heuristic;

  const flags = [...new Set([...heuristic.flags, ...llm.flags])];
  const hasHighImpact = flags.some((flag) => HIGH_IMPACT_FLAGS.has(flag));
  let rank = Math.max(PRIORITY_RANK[heuristic.priority], PRIORITY_RANK[llm.priority]);
  if (hasHighImpact) rank = 4;

  const priority = RANK_PRIORITY[rank];
  const urgency = hasHighImpact ? Math.max(heuristic.urgency, llm.urgency, 70) : Math.round((heuristic.urgency + llm.urgency) / 2);
  const agreed = heuristic.category === llm.category;

  return {
    ...heuristic,
    category: llm.category,
    categoryLabel: CATEGORY_LEXICON[llm.category]?.label ?? heuristic.categoryLabel,
    confidence: Number(Math.min(0.99, (heuristic.confidence + llm.confidence) / 2 + (agreed ? 0.12 : -0.05)).toFixed(2)),
    priority,
    urgency,
    sentiment: llm.sentiment !== 'neutral' ? llm.sentiment : heuristic.sentiment,
    flags,
    tags: [...new Set([...llm.tags, ...heuristic.tags])].slice(0, 8),
    summary: llm.summary ?? heuristic.summary,
    suggestedActions: [...new Set([...llm.suggestedActions, ...heuristic.suggestedActions])].slice(0, 5),
    estimatedHours: llm.estimatedHours || heuristic.estimatedHours,
    model: `heuristic+${config.ai.model}`,
    source: 'llm',
    llmUsed: true,
  };
}

/**
 * Public entry point used by the ticket service.
 * Always resolves — never throws — so ticket creation can never fail on AI.
 */
export async function analyse(input = {}) {
  const heuristic = analyseHeuristic(input);
  try {
    const llm = await analyseWithLlm(input);
    return blend(heuristic, llm);
  } catch {
    return heuristic;
  }
}

/** SLA window: category baseline scaled by priority. */
export function computeSlaDueAt(category, priority, createdAt = new Date()) {
  const baseline = { electrical: 8, plumbing: 8, hvac: 12, elevator: 4, it_network: 8, cleaning: 24, security: 6, structural: 24, appliance: 24, pest: 48, furniture: 48, other: 24 }[category] ?? 24;
  const multiplier = { CRITICAL: 0.25, HIGH: 0.5, MEDIUM: 1, LOW: 2 }[priority] ?? 1;
  const hours = Math.max(1, Math.round(baseline * multiplier));
  return new Date(new Date(createdAt).getTime() + hours * 3600_000).toISOString();
}

export const AI_METADATA = {
  heuristicModel: 'fixflow-triage-v1',
  categories: CATEGORY_KEYS,
};
