import assert from 'node:assert/strict';
import {
  defaultGlicko2,
  glicko2Update,
  opinionFromReport,
  fuseSubjectiveOpinions,
  subjectiveLogicFuse,
  brierScore
} from '../src/engine/decisionIntelligence.js';

const report = (stance, confidence=90, freshness=95, source='A') => ({
  id: source + '-' + stance,
  source,
  topic: 'route_echo',
  stance,
  confidence,
  freshness,
  corroborated: 2
});

// Opinion invariants.
const opinion = opinionFromReport(report('CLEAR'), 'CLEAR', 1);
assert(Math.abs(opinion.belief + opinion.disbelief + opinion.uncertainty - 1) < 1e-9);

const agreeable = subjectiveLogicFuse([
  report('CLEAR', 90, 98, 'A'),
  report('CLEAR', 88, 96, 'B')
], 1);
assert.equal(agreeable.label, 'CLEAR');
assert(agreeable.belief > 50);
assert(agreeable.uncertainty < 35);

const conflicting = subjectiveLogicFuse([
  report('CLEAR', 90, 98, 'A'),
  report('BLOCKED', 90, 98, 'B')
], 1);
assert(conflicting.uncertainty >= 0);
assert(conflicting.conflict > 0);

// Consensus fusion preserves opinion mass.
const a = opinionFromReport(report('CLEAR', 90, 98, 'A'), 'CLEAR');
const b = opinionFromReport(report('BLOCKED', 90, 98, 'B'), 'CLEAR');
const fused = fuseSubjectiveOpinions(a, b);
assert(Math.abs(fused.belief + fused.disbelief + fused.uncertainty - 1) < 1e-9);

// Glicko-2 directionality: beating a stronger item increases skill.
const baseline = defaultGlicko2();
const win = glicko2Update(baseline, [{ opponentRating: 1700, opponentRd: 120, score: 1 }]);
const loss = glicko2Update(baseline, [{ opponentRating: 1300, opponentRd: 120, score: 0 }]);
assert(win.rating > baseline.rating);
assert(loss.rating < baseline.rating);
assert(win.rd < baseline.rd);

// Proper score is zero for a perfectly calibrated outcome.
assert.equal(brierScore(1, true), 0);
assert.equal(brierScore(0, false), 0);

console.log('decision-intelligence checks: PASS');
console.log(JSON.stringify({
  agreeable: {label: agreeable.label, belief: agreeable.belief, uncertainty: agreeable.uncertainty},
  conflicting: {label: conflicting.label, uncertainty: conflicting.uncertainty, abstain: conflicting.abstain},
  glicko: {baseline: baseline.rating, afterWin: win.rating, afterLoss: loss.rating}
}, null, 2));


import { runBenchmark, benchmarkHeadline } from '../src/engine/benchmark.js';

const benchmark = runBenchmark({ runsPerCondition: 50, seed: 20261003 });
const headline = benchmarkHeadline(benchmark);
assert.equal(benchmark.totalRuns, 200);
assert.equal(benchmark.methods.sentinel.label, 'Sentinel Ω · Subjective Logic');
assert(benchmark.methods.naive.runs === 200);
assert(benchmark.methods.sentinel.runs === 200);
assert(benchmark.methods.sentinel.appropriateAbstention >= 0);
assert(benchmark.methods.sentinel.appropriateAbstention <= 100);
assert.equal(Object.keys(benchmark.byCondition).length, 4);

console.log('benchmark suite checks: PASS');
console.log(JSON.stringify({
  totalRuns: benchmark.totalRuns,
  headline,
  overall: {
    naive: benchmark.methods.naive,
    freshness: benchmark.methods.freshness,
    sentinel: benchmark.methods.sentinel
  }
}, null, 2));
