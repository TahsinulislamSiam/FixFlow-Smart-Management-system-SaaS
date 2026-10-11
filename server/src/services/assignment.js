import { all, get, parseJson } from '../db.js';

/**
 * Smart assignment engine
 * =======================
 * A transparent, weighted scorer — the kind of logic a dispatch manager
 * actually reasons about. Every decision returns human-readable `reasons`
 * so the UI (and the audit log) can explain *why* a technician was chosen
 * instead of presenting a black box.
 *
 * Factors, weighted:
 *   skill match        40  exact category skill, 18 for an adjacent trade
 *   proximity          16  same zone/building as the fault
 *   spare capacity     20  fewer open tickets = higher score (load balancing)
 *   seniority fit      12  LEAD/SENIOR for severe jobs, no penalty for easy ones
 *   track record        8  resolved-ticket volume, mild tie-breaker
 *   availability       10  hard gate for auto-assignment
 */

/** Trades that can plausibly cover each other in an emergency. */
const ADJACENT_SKILLS = {
  electrical: ['it_network', 'elevator', 'appliance'],
  plumbing: ['hvac', 'appliance', 'structural'],
  hvac: ['plumbing', 'appliance', 'electrical'],
  elevator: ['electrical', 'structural'],
  it_network: ['electrical', 'security'],
  cleaning: ['pest', 'furniture'],
  security: ['it_network'],
  structural: ['plumbing', 'furniture', 'elevator'],
  appliance: ['electrical', 'hvac', 'plumbing'],
  pest: ['cleaning'],
  furniture: ['structural', 'cleaning'],
  other: [],
};

const WEIGHTS = {
  skillExact: 40,
  skillAdjacent: 18,
  sameZone: 16,
  sameBuilding: 8,
  capacity: 20,
  seniorityLead: 12,
  senioritySenior: 8,
  seniorityJuniorPenalty: -10,
  trackRecord: 8,
  available: 10,
  onHoldPenalty: -6,
};

const SEVERE = new Set(['HIGH', 'CRITICAL']);

/** Open (not finished) ticket counts per technician, in one query. */
export function workloadByTechnician() {
  const rows = all(
    `SELECT assignee_id AS id, COUNT(*) AS open
       FROM tickets
      WHERE assignee_id IS NOT NULL
        AND status IN ('ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'TRIAGED')
      GROUP BY assignee_id`,
  );
  const map = new Map();
  for (const row of rows) map.set(Number(row.id), Number(row.open));
  return map;
}

function trackRecordByTechnician() {
  const rows = all(
    `SELECT assignee_id AS id, COUNT(*) AS resolved
       FROM tickets
      WHERE assignee_id IS NOT NULL AND status IN ('RESOLVED', 'CLOSED')
      GROUP BY assignee_id`,
  );
  const map = new Map();
  for (const row of rows) map.set(Number(row.id), Number(row.resolved));
  return map;
}

/**
 * Score a single technician for a ticket.
 * @returns {{score:number, reasons:string[], breakdown:object}}
 */
export function scoreTechnician(ticket, technician, context = {}) {
  const workload = context.workload ?? workloadByTechnician();
  const trackRecord = context.trackRecord ?? trackRecordByTechnician();
  const skills = Array.isArray(technician.skills) ? technician.skills : parseJson(technician.skills, []);
  const reasons = [];
  const breakdown = {};

  // --- skill fit -----------------------------------------------------------
  let skillScore = 0;
  if (skills.includes(ticket.category)) {
    skillScore = WEIGHTS.skillExact;
    reasons.push(`Certified in ${ticket.category.replace('_', ' ')}`);
  } else {
    const adjacent = ADJACENT_SKILLS[ticket.category] ?? [];
    const overlap = skills.filter((skill) => adjacent.includes(skill));
    if (overlap.length) {
      skillScore = WEIGHTS.skillAdjacent;
      reasons.push(`Crossover skill: ${overlap.join(', ').replace(/_/g, ' ')}`);
    } else {
      reasons.push(skills.length ? `No matching trade (has ${skills.join(', ')})` : 'No skills recorded');
    }
  }
  breakdown.skill = skillScore;

  // --- availability gate ---------------------------------------------------
  const available = technician.is_available === 1 || technician.is_available === true;
  const availabilityScore = available ? WEIGHTS.available : 0;
  if (!available) reasons.push('Currently off shift');
  breakdown.availability = availabilityScore;

  // --- spare capacity (load balancing) -------------------------------------
  const open = workload.get(Number(technician.id)) ?? 0;
  const capacityScore = Math.max(0, WEIGHTS.capacity - open * 5);
  breakdown.capacity = capacityScore;
  if (open === 0) reasons.push('No open tickets — immediate availability');
  else reasons.push(`${open} open ticket${open === 1 ? '' : 's'} in queue`);

  // --- proximity -----------------------------------------------------------
  const ticketZone = ticket.zone ?? null;
  const techZone = technician.zone ?? null;
  let proximityScore = 0;
  if (ticketZone && techZone && ticketZone === techZone) {
    proximityScore = WEIGHTS.sameZone;
    reasons.push(`Already working in ${ticketZone}`);
  } else if (technician.building && ticket.building && technician.building === ticket.building) {
    proximityScore = WEIGHTS.sameBuilding;
    reasons.push(`Based in ${technician.building}`);
  }
  breakdown.proximity = proximityScore;

  // --- seniority fit -------------------------------------------------------
  let seniorityScore = 0;
  if (SEVERE.has(ticket.priority)) {
    if (technician.level === 'LEAD') {
      seniorityScore = WEIGHTS.seniorityLead;
      reasons.push('Lead technician for a high-severity job');
    } else if (technician.level === 'SENIOR') {
      seniorityScore = WEIGHTS.senioritySenior;
      reasons.push('Senior technician for a high-severity job');
    } else {
      seniorityScore = WEIGHTS.seniorityJuniorPenalty;
      reasons.push('Junior — escalate for high-severity work');
    }
  } else if (technician.level === 'LEAD') {
    seniorityScore = 4; // slight preference to keep seniors on routine work hands-on
  }
  breakdown.seniority = seniorityScore;

  // --- track record --------------------------------------------------------
  const resolved = trackRecord.get(Number(technician.id)) ?? 0;
  const recordScore = Math.min(WEIGHTS.trackRecord, resolved * 0.4);
  if (resolved >= 10) reasons.push(`${resolved} tickets resolved to date`);
  breakdown.trackRecord = Number(recordScore.toFixed(1));

  const score = Math.max(
    0,
    Math.min(100, skillScore + availabilityScore + capacityScore + proximityScore + seniorityScore + recordScore),
  );

  return { score: Number(score.toFixed(1)), reasons, breakdown, available, open };
}

/** Rank every active technician for a ticket, best first. */
export function rankTechnicians(ticket, { limit = 8, includeUnavailable = false } = {}) {
  const technicians = all(
    `SELECT id, name, email, role, level, phone, title, zone, skills, is_available, avatar_color
       FROM users WHERE role = 'TECHNICIAN'`,
  );
  const context = { workload: workloadByTechnician(), trackRecord: trackRecordByTechnician() };

  return technicians
    .map((technician) => ({
      technician: { ...technician, skills: parseJson(technician.skills, []), is_available: technician.is_available === 1 },
      ...scoreTechnician(ticket, technician, context),
    }))
    .filter((entry) => includeUnavailable || entry.available)
    .sort((a, b) => b.score - a.score || a.technician.name.localeCompare(b.technician.name))
    .slice(0, Math.max(1, Math.min(limit, 25)));
}

/**
 * Choose the best technician for a ticket.
 * Returns `null` when nobody is available — the ticket stays in the manager
 * queue and a human decides (never silently assign the wrong trade).
 */
export function pickBestTechnician(ticket) {
  const ranked = rankTechnicians(ticket, { limit: 3 });
  if (!ranked.length) return null;

  const [best] = ranked;
  // A pure crossover match (no exact skill) is only auto-assigned when the
  // job is minor; anything serious should be routed by a human instead.
  const exactSkill = best.breakdown.skill >= WEIGHTS.skillExact;
  const minorJob = !SEVERE.has(ticket.priority) && ticket.priority !== 'CRITICAL';
  if (!exactSkill && !minorJob) {
    return { ...best, deferred: true, reasons: [...best.reasons, 'No exact trade available — routed to manager for review'] };
  }
  return best;
}

/** Convenience: return a ticket row enriched with location zone/building for scoring. */
export function ticketForScoring(ticketId) {
  return get(
    `SELECT t.*, l.zone AS zone, l.building AS building
       FROM tickets t LEFT JOIN locations l ON l.id = t.location_id
      WHERE t.id = ?`,
    [ticketId],
  );
}

export const ASSIGNMENT_WEIGHTS = WEIGHTS;
export const ADJACENCY = ADJACENT_SKILLS;
