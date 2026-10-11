import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSIGNMENT_WEIGHTS, scoreTechnician } from '../src/services/assignment.js';

const TICKET = { category: 'electrical', priority: 'HIGH', zone: 'North', building: 'Tower A' };

function tech(overrides = {}) {
  return {
    id: 1,
    name: 'Alex',
    level: 'SENIOR',
    zone: 'North',
    building: 'Tower A',
    skills: ['electrical'],
    is_available: 1,
    ...overrides,
  };
}

const emptyContext = () => ({ workload: new Map(), trackRecord: new Map() });

test('exact skill, same zone and availability produce a strong score', () => {
  const result = scoreTechnician(TICKET, tech(), emptyContext());

  assert.ok(result.score >= 80);
  assert.equal(result.available, true);
  assert.ok(result.reasons.length > 0);
});

test('an unavailable technician is gated from auto-assignment', () => {
  const result = scoreTechnician(TICKET, tech({ is_available: 0 }), emptyContext());

  assert.equal(result.available, false);
  assert.equal(result.breakdown.availability, 0);
});

test('an idle technician beats a busier one on spare capacity', () => {
  const context = { workload: new Map([[1, 5]]), trackRecord: new Map() };
  const busy = scoreTechnician(TICKET, tech({ id: 1, name: 'Busy' }), context);
  const idle = scoreTechnician(TICKET, tech({ id: 2, name: 'Idle' }), emptyContext());

  assert.equal(idle.breakdown.capacity, ASSIGNMENT_WEIGHTS.capacity);
  assert.ok(idle.breakdown.capacity > busy.breakdown.capacity);
  assert.ok(idle.score > busy.score);
});

test('an exact skill match is worth more than an adjacent/crossover trade', () => {
  const exact = scoreTechnician(TICKET, tech(), emptyContext());
  const adjacent = scoreTechnician(TICKET, tech({ id: 2, name: 'Sam', skills: ['it_network'] }), emptyContext());

  assert.equal(exact.breakdown.skill, ASSIGNMENT_WEIGHTS.skillExact);
  assert.equal(adjacent.breakdown.skill, ASSIGNMENT_WEIGHTS.skillAdjacent);
  assert.ok(exact.breakdown.skill > adjacent.breakdown.skill);
});

test('seniority is rewarded on high-severity work but not routine jobs', () => {
  const severe = scoreTechnician(TICKET, tech(), emptyContext());
  const routine = scoreTechnician({ ...TICKET, priority: 'LOW' }, tech(), emptyContext());
  const juniorOnSevere = scoreTechnician(TICKET, tech({ level: 'JUNIOR' }), emptyContext());

  assert.ok(severe.breakdown.seniority > 0);
  assert.ok(routine.breakdown.seniority <= 4);
  assert.ok(juniorOnSevere.breakdown.seniority < 0);
});

test('heavy existing workload drains capacity to a floor', () => {
  const context = { workload: new Map([[1, 99]]), trackRecord: new Map() };
  const result = scoreTechnician(TICKET, tech(), context);

  assert.equal(result.breakdown.capacity, 0);
});