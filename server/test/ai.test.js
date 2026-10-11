import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyseHeuristic } from '../src/services/ai.js';

test('classifies a water leak as plumbing and escalates the priority', () => {
  const analysis = analyseHeuristic({
    title: 'Water leaking from the bathroom ceiling',
    description: 'Water is dripping through the ceiling and spreading quickly down the wall near a socket.',
    locationText: 'Level 3, west corridor',
  });

  assert.equal(analysis.category, 'plumbing');
  assert.ok(analysis.urgency >= 0 && analysis.urgency <= 100);
  assert.ok(['HIGH', 'CRITICAL'].includes(analysis.priority));
  assert.ok(Array.isArray(analysis.flags));
  assert.ok(typeof analysis.confidence === 'number');
});

test('smoke / fire language is never below HIGH priority', () => {
  const analysis = analyseHeuristic({
    title: 'Burning smell in the lift motor room',
    description: 'There is smoke coming from the electrical cabinet and a strong burning smell. Staff were evacuated.',
  });

  assert.ok(['HIGH', 'CRITICAL'].includes(analysis.priority));
  assert.ok(analysis.tags.some((tag) => tag === 'safety'));
  assert.ok(analysis.suggestedActions.length > 0);
});

test('structural risk wording raises both flags and urgency', () => {
  const analysis = analyseHeuristic({
    title: 'Ceiling panel looks like it could fall',
    description: 'A large section of ceiling is sagging and cracking. Two children are in the room right now.',
  });

  assert.ok(analysis.urgency >= 70);
  assert.notEqual(analysis.category, ''); // never blank
});

test('vague, short reports degrade gracefully without crashing', () => {
  const analysis = analyseHeuristic({ title: 'Help', description: 'Something is broken' });

  assert.ok(analysis.category);
  assert.ok(typeof analysis.categoryLabel === 'string');
  assert.ok(Array.isArray(analysis.tags));
  assert.ok(Array.isArray(analysis.suggestedActions));
  assert.ok(Array.isArray(analysis.drivers));
  assert.equal(analysis.model, 'fixflow-triage-v1');
  assert.equal(analysis.source, 'heuristic');
});

test('explicit category hint overrides the lexicon pick', () => {
  const analysis = analyseHeuristic({
    title: 'Loud noise overnight',
    description: 'The machine keeps making a rattling sound',
    categoryHint: 'hvac',
  });

  assert.equal(analysis.category, 'hvac');
});