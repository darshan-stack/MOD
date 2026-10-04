/*
 * Sentinel Grid Ω — deterministic red-team resilience harness
 *
 * Purpose: test the decision layer against synthetic information attacks
 * that increase stale, contradictory, duplicated or missing evidence.
 * This is a validation/education tool, not an operational detector.
 */

import { robustFuse } from './decisionIntelligence.js';

const LABELS = ['CLEAR', 'BLOCKED', 'UNRELIABLE'];

const ATTACKS = [
  { key: 'STALE_DECEPTION', label: 'Stale high-confidence report', description: 'Inject an old but very confident contradictory report.' },
  { key: 'CONFLICT_BURST', label: 'Conflict burst', description: 'Increase contradictory reports while degrading channel quality.' },
  { key: 'NODE_LOSS', label: 'True-source dropout', description: 'Drop most corroborating reports and leave weak residual evidence.' },
  { key: 'DUPLICATE_ECHO', label: 'Duplicate-source echo', description: 'Repeat a contradictory message from one source to test source independence.' },
  { key: 'DELAYED_CONTRADICTION', label: 'Delayed contradiction', description: 'Add a late, high-confidence contradiction with poor freshness.' }
];

const SOURCES = [
  { source: 'Alpha 1-1', domain: 'LAND', base: 0.90 },
  { source: 'Echo 3', domain: 'EW', base: 0.82 },
  { source: 'Raven-2', domain: 'AIR', base: 0.78 },
  { source: 'NetWatch', domain: 'CYBER', base: 0.74 },
  { source: 'Relay-5', domain: 'LAND', base: 0.68 }
];

function seeded(seed) {
  let value = seed >>> 0;
  return function random() {
    value = Math.imul(1664525, value) + 1013904223;
    return (value >>> 0) / 4294967296;
  };
}

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, Number(v)));
}

function wrongLabel(truth, offset = 0) {
  const choices = LABELS.filter(x => x !== truth);
  return choices[offset % choices.length];
}

function makeBaseCase(rng, index) {
  const truth = LABELS[index % LABELS.length];
  const reports = SOURCES.map(function(source, i) {
    const correct = rng() < source.base;
    return {
      id: 'RT-' + index + '-' + i,
      source: source.source,
      domain: source.domain,
      topic: 'route_echo',
      stance: correct ? truth : wrongLabel(truth, i),
      confidence: Math.round(clamp(correct ? 0.78 + rng() * 0.18 : 0.55 + rng() * 0.22, 0.20, 0.99) * 100),
      freshness: Math.round(clamp(0.82 + rng() * 0.15, 0.20, 0.99) * 100),
      corroborated: i === 0 ? 3 : 1 + (rng() > 0.55 ? 1 : 0),
      state: 'live'
    };
  });

  return { truth, reports };
}

function mutate(reports, attack, rng) {
  const next = reports.map(r => ({ ...r }));

  if (attack === 'STALE_DECEPTION') {
    next.push({
      id: 'ATTACK-STALE',
      source: 'False-Relay',
      domain: 'LAND',
      topic: 'route_echo',
      stance: wrongLabel(next[0].stance),
      confidence: 98,
      freshness: 4,
      corroborated: 1,
      state: 'stale'
    });
  }

  if (attack === 'CONFLICT_BURST') {
    next.forEach((r, i) => {
      if (i % 2 === 1) {
        r.stance = wrongLabel(r.stance, i);
        r.confidence = Math.max(70, r.confidence);
        r.freshness = Math.max(40, r.freshness - 18);
        r.state = 'conflict';
      }
    });
  }

  if (attack === 'NODE_LOSS') {
    next.forEach((r, i) => {
      if (i < 3) r.state = 'dropped';
    });
  }

  if (attack === 'DUPLICATE_ECHO') {
    const anchor = next.find(r => r.source === 'Relay-5') || next[0];
    for (let i = 0; i < 3; i++) {
      next.push({
        ...anchor,
        id: 'ATTACK-ECHO-' + i,
        stance: wrongLabel(anchor.stance, i),
        confidence: 92,
        freshness: 88,
        corroborated: 1,
        state: 'live'
      });
    }
  }

  if (attack === 'DELAYED_CONTRADICTION') {
    const anchor = next.find(r => r.source === 'Alpha 1-1') || next[0];
    next.push({
      ...anchor,
      id: 'ATTACK-DELAYED',
      source: 'Old-Relay',
      stance: wrongLabel(anchor.stance),
      confidence: 95,
      freshness: Math.round(8 + rng() * 12),
      corroborated: 1,
      state: 'stale'
    });
  }

  return next;
}

function naiveFuse(reports) {
  const active = reports.filter(r => r.state !== 'dropped');
  const buckets = {};
  let total = 0;
  active.forEach(function(r) {
    const w = clamp(r.confidence / 100);
    buckets[r.stance] = (buckets[r.stance] || 0) + w;
    total += w;
  });
  const ranked = LABELS.map(label => ({
    label,
    probability: total ? (buckets[label] || 0) / total : 0
  })).sort((a, b) => b.probability - a.probability);
  const best = ranked[0] || { label: 'UNKNOWN', probability: 0 };
  return {
    label: best.label,
    probability: best.probability,
    abstain: false
  };
}

function runOne(reports, truth, attack) {
  const naive = naiveFuse(reports);
  const sentinel = robustFuse(reports, attack.key === 'CONFLICT_BURST' ? 0.48 : 0.82, {});
  const naiveCorrect = !naive.abstain && naive.label === truth;
  const sentinelCorrect = !sentinel.abstain && sentinel.label === truth;

  return {
    naive,
    sentinel,
    naiveCorrect,
    sentinelCorrect,
    naiveFalseConfidence: !naiveCorrect && naive.probability >= 0.70,
    sentinelFalseConfidence: !sentinelCorrect && Number(sentinel.probability || 0) >= 70,
    attackStopped: sentinel.abstain || sentinelCorrect
  };
}

export function runResilienceBenchmark({ runsPerAttack = 40, seed = 20261004 } = {}) {
  const rng = seeded(seed);
  const byAttack = {};
  const all = [];

  ATTACKS.forEach(function(attack) {
    const samples = [];
    for (let i = 0; i < runsPerAttack; i++) {
      const base = makeBaseCase(rng, i + attack.key.length * 100);
      const reports = mutate(base.reports, attack.key, rng);
      const scored = runOne(reports, base.truth, attack);
      samples.push(scored);
      all.push({ attack: attack.key, ...scored });
    }

    const count = samples.length || 1;
    const naiveAccuracy = samples.filter(x => x.naiveCorrect).length / count;
    const sentinelAccuracy = samples.filter(x => x.sentinelCorrect).length / count;
    const naiveFC = samples.filter(x => x.naiveFalseConfidence).length / count;
    const sentinelFC = samples.filter(x => x.sentinelFalseConfidence).length / count;
    const sentinelAbstain = samples.filter(x => x.sentinel.abstain).length / count;
    const attackStopped = samples.filter(x => x.attackStopped).length / count;

    byAttack[attack.key] = {
      key: attack.key,
      label: attack.label,
      description: attack.description,
      runs: count,
      naiveAccuracy: Number((naiveAccuracy * 100).toFixed(1)),
      sentinelAccuracy: Number((sentinelAccuracy * 100).toFixed(1)),
      naiveFalseConfidence: Number((naiveFC * 100).toFixed(1)),
      sentinelFalseConfidence: Number((sentinelFC * 100).toFixed(1)),
      abstentionRate: Number((sentinelAbstain * 100).toFixed(1)),
      attackStoppedRate: Number((attackStopped * 100).toFixed(1)),
      falseConfidenceReduction: Number(((naiveFC - sentinelFC) * 100).toFixed(1))
    };
  });

  const worst = Object.values(byAttack)
    .slice()
    .sort((a, b) => b.naiveFalseConfidence - a.naiveFalseConfidence || a.attackStoppedRate - b.attackStoppedRate)[0];

  const naiveFC = all.filter(x => x.naiveFalseConfidence).length / Math.max(all.length, 1);
  const sentinelFC = all.filter(x => x.sentinelFalseConfidence).length / Math.max(all.length, 1);
  const stopRate = all.filter(x => x.attackStopped).length / Math.max(all.length, 1);

  return {
    seed,
    totalRuns: all.length,
    attacks: ATTACKS.map(a => a.key),
    byAttack,
    headline: {
      falseConfidenceReduction: Number(((naiveFC - sentinelFC) * 100).toFixed(1)),
      attackStoppedRate: Number((stopRate * 100).toFixed(1)),
      sentinelFalseConfidence: Number((sentinelFC * 100).toFixed(1)),
      worstAttack: worst ? worst.label : '—'
    }
  };
}
