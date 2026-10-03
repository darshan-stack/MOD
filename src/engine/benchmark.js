import { subjectiveLogicFuse, brierScore, expectedCalibrationError } from './decisionIntelligence.js';

const LABELS = ['CLEAR', 'BLOCKED', 'UNRELIABLE'];
const SOURCES = [
  { name: 'Alpha 1-1', domain: 'LAND', base: 0.90 },
  { name: 'Echo 3', domain: 'EW', base: 0.82 },
  { name: 'Raven-2', domain: 'AIR', base: 0.78 },
  { name: 'NetWatch', domain: 'CYBER', base: 0.74 },
  { name: 'Relay-5', domain: 'LAND', base: 0.68 }
];

const CONDITIONS = [
  { key: 'BASELINE', label: 'Baseline', networkHealth: 0.96, latency: 4, dropout: 0.02, conflict: 0.06, errorBoost: 0.00 },
  { key: 'DELAYED', label: 'Delayed feed', networkHealth: 0.72, latency: 28, dropout: 0.10, conflict: 0.18, errorBoost: 0.06 },
  { key: 'LOSS', label: 'Packet loss', networkHealth: 0.48, latency: 55, dropout: 0.30, conflict: 0.32, errorBoost: 0.14 },
  { key: 'CONFLICT', label: 'High conflict', networkHealth: 0.32, latency: 78, dropout: 0.42, conflict: 0.68, errorBoost: 0.24 }
];

function seeded(seed) {
  let value = seed >>> 0;
  return function random() {
    value = Math.imul(1664525, value) + 1013904223;
    return (value >>> 0) / 4294967296;
  };
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, Number(v)));
}

function wrongLabel(rng, truth) {
  const choices = LABELS.filter(x => x !== truth);
  return pick(rng, choices);
}

function generateRun(rng, condition, runIndex) {
  const truth = pick(rng, LABELS);
  const reports = SOURCES.map((source, index) => {
    const reliability = clamp(source.base - condition.errorBoost + (rng() - 0.5) * 0.08);
    const correct = rng() < reliability;
    const confidence = clamp(
      correct
        ? 0.72 + rng() * 0.25 - condition.conflict * 0.14
        : 0.48 + rng() * 0.28,
      0.20, 0.98
    );
    const freshness = clamp(
      0.96 - condition.latency / 160 - condition.dropout * 0.35 + (rng() - 0.5) * 0.10,
      0.10, 0.99
    );
    return {
      id: 'B-' + condition.key + '-' + runIndex + '-' + index,
      source: source.name,
      domain: source.domain,
      topic: 'route_echo',
      stance: correct ? truth : wrongLabel(rng, truth),
      confidence: Math.round(confidence * 100),
      freshness: Math.round(freshness * 100),
      corroborated: Math.max(1, Math.min(3, Math.round((index === 0 ? 2 : 1) + rng()))),
      state: condition.dropout > 0.38 && index === 3 && rng() < 0.35 ? 'dropped' : 'live'
    };
  });

  return { truth, reports };
}

const CALIBRATION_HISTORY = {
  'Alpha 1-1': { supported: 90, contradicted: 10 },
  'Echo 3': { supported: 82, contradicted: 18 },
  'Raven-2': { supported: 78, contradicted: 22 },
  'NetWatch': { supported: 74, contradicted: 26 },
  'Relay-5': { supported: 68, contradicted: 32 }
};

function weightedBaseline(reports, mode, history = {}) {
  const buckets = {};
  let total = 0;
  for (const report of reports) {
    if (report.state === 'dropped') continue;
    const confidence = clamp(report.confidence / 100);
    const freshness = clamp(report.freshness / 100);
    const learned = history[report.source] || { supported: 0, contradicted: 0 };
    const reliability = (learned.supported + 2) / Math.max(learned.supported + learned.contradicted + 3, 1);
    const weight = mode === 'fresh'
      ? confidence * freshness
      : mode === 'reliability'
        ? confidence * freshness * reliability
        : confidence;
    buckets[report.stance] = (buckets[report.stance] || 0) + weight;
    total += weight;
  }
  const distribution = LABELS.map(label => ({
    label,
    probability: total ? (buckets[label] || 0) / total : 0
  }));
  distribution.sort((a, b) => b.probability - a.probability);
  const best = distribution[0] || { label: 'UNKNOWN', probability: 0 };
  return {
    label: best.label,
    confidence: Math.round(best.probability * 100),
    abstain: false,
    distribution
  };
}

function scoreCase(prediction, truth) {
  const correct = !prediction.abstain && prediction.label === truth;
  const pTrue = prediction.distribution
    ? ((prediction.distribution.find(x => x.label === truth) || {}).probability || 0)
    : (prediction.label === truth ? prediction.confidence / 100 : 0);
  const brier = prediction.distribution
    ? prediction.distribution.reduce((sum, item) => {
        const outcome = item.label === truth ? 1 : 0;
        return sum + Math.pow(item.probability - outcome, 2);
      }, 0)
    : brierScore(pTrue, correct);

  const rawBrier = prediction.rawDistribution
    ? prediction.rawDistribution.reduce((sum, item) => {
        const outcome = item.label === truth ? 1 : 0;
        return sum + Math.pow(item.probability - outcome, 2);
      }, 0)
    : brier;

  return {
    correct,
    falseConfident: !correct && prediction.confidence >= 70,
    brier,
    rawBrier
  };
}

function emptyAccumulator() {
  return {
    runs: 0,
    correct: 0,
    falseConfident: 0,
    abstain: 0,
    highConflictRuns: 0,
    appropriateAbstain: 0,
    brierSum: 0,
    rawBrierSum: 0,
    coveredBrierSum: 0,
    coveredRawBrierSum: 0,
    predicted: 0,
    calibrationSamples: [],
    rawCalibrationSamples: [],
    rankingSamples: []
  };
}

function addTo(acc, prediction, truth, highConflict) {
  const score = scoreCase(prediction, truth);
  acc.runs += 1;
  acc.correct += score.correct ? 1 : 0;
  acc.falseConfident += score.falseConfident ? 1 : 0;
  acc.abstain += prediction.abstain ? 1 : 0;
  acc.predicted += prediction.abstain ? 0 : 1;
  acc.brierSum += score.brier;
  acc.rawBrierSum += score.rawBrier;
  if (!prediction.abstain) {
    acc.coveredBrierSum += score.brier;
    acc.coveredRawBrierSum += score.rawBrier;
    acc.calibrationSamples.push({
      probability: (prediction.probability ?? prediction.confidence) / 100,
      correct: score.correct
    });
    acc.rawCalibrationSamples.push({
      probability: (prediction.rawProbability ?? prediction.probability ?? prediction.confidence) / 100,
      correct: score.correct
    });
  }

  acc.rankingSamples.push({
    confidence: Number(prediction.probability ?? prediction.confidence ?? 0) / 100,
    correct: score.correct,
    abstain: Boolean(prediction.abstain)
  });

  if (highConflict) {
    acc.highConflictRuns += 1;
    acc.appropriateAbstain += prediction.abstain ? 1 : 0;
  }
}

function riskCoverage(samples = []) {
  const ranked = samples.slice().sort((a, b) => b.confidence - a.confidence);
  if (!ranked.length) return { aurc: null, curve: [] };

  let correct = 0;
  let area = 0;
  const curve = ranked.map(function(sample, index) {
    if (sample.correct) correct += 1;
    const coverage = (index + 1) / ranked.length;
    const risk = 1 - correct / (index + 1);
    area += risk;
    return {
      coverage: Number(coverage.toFixed(3)),
      risk: Number(risk.toFixed(3))
    };
  });

  return {
    aurc: Number((area / ranked.length).toFixed(4)),
    curve
  };
}

function matchedCoverageAccuracy(samples = [], targetCoverage = 1) {
  const ranked = samples.slice().sort((a, b) => b.confidence - a.confidence);
  if (!ranked.length) return null;
  const count = Math.max(1, Math.min(ranked.length, Math.round(ranked.length * clamp(targetCoverage))));
  const correct = ranked.slice(0, count).filter(x => x.correct).length;
  return Number((correct / count * 100).toFixed(1));
}

function finalize(acc) {
  return {
    runs: acc.runs,
    accuracy: Number((acc.correct / Math.max(acc.runs, 1) * 100).toFixed(1)),
    coverage: Number((acc.predicted / Math.max(acc.runs, 1) * 100).toFixed(1)),
    selectiveAccuracy: acc.predicted ? Number((acc.correct / acc.predicted * 100).toFixed(1)) : null,
    falseConfidenceRate: Number((acc.falseConfident / Math.max(acc.runs, 1) * 100).toFixed(1)),
    abstentionRate: Number((acc.abstain / Math.max(acc.runs, 1) * 100).toFixed(1)),
    appropriateAbstention: acc.highConflictRuns
      ? Number((acc.appropriateAbstain / acc.highConflictRuns * 100).toFixed(1))
      : null,
    brier: Number((acc.brierSum / Math.max(acc.runs, 1)).toFixed(3)),
    rawBrier: Number((acc.rawBrierSum / Math.max(acc.runs, 1)).toFixed(3)),
    coveredBrier: acc.predicted ? Number((acc.coveredBrierSum / acc.predicted).toFixed(3)) : null,
    coveredRawBrier: acc.predicted ? Number((acc.coveredRawBrierSum / acc.predicted).toFixed(3)) : null,
    ece: expectedCalibrationError(acc.calibrationSamples),
    rawEce: expectedCalibrationError(acc.rawCalibrationSamples),
    aurc: riskCoverage(acc.rankingSamples).aurc
  };
}

export function runBenchmark({ runsPerCondition = 100, seed = 20261003 } = {}) {
  const rng = seeded(seed);
  const methods = {
    naive: emptyAccumulator(),
    freshness: emptyAccumulator(),
    reliability: emptyAccumulator(),
    sentinel: emptyAccumulator()
  };
  const byCondition = {};

  for (const condition of CONDITIONS) {
    const conditionAcc = {
      naive: emptyAccumulator(),
      freshness: emptyAccumulator(),
      reliability: emptyAccumulator(),
      sentinel: emptyAccumulator()
    };

    for (let i = 0; i < runsPerCondition; i++) {
      const data = generateRun(rng, condition, i);
      const highConflict = condition.conflict >= 0.50;

      const naive = weightedBaseline(data.reports, 'confidence');
      const freshness = weightedBaseline(data.reports, 'fresh');
      const reliability = weightedBaseline(data.reports, 'reliability', CALIBRATION_HISTORY);
      const sentinel = subjectiveLogicFuse(data.reports, condition.networkHealth, CALIBRATION_HISTORY);

      addTo(methods.naive, naive, data.truth, highConflict);
      addTo(methods.freshness, freshness, data.truth, highConflict);
      addTo(methods.reliability, reliability, data.truth, highConflict);
      addTo(methods.sentinel, sentinel, data.truth, highConflict);

      addTo(conditionAcc.naive, naive, data.truth, highConflict);
      addTo(conditionAcc.freshness, freshness, data.truth, highConflict);
      addTo(conditionAcc.reliability, reliability, data.truth, highConflict);
      addTo(conditionAcc.sentinel, sentinel, data.truth, highConflict);
    }

    byCondition[condition.key] = {
      label: condition.label,
      naive: finalize(conditionAcc.naive),
      freshness: finalize(conditionAcc.freshness),
      reliability: finalize(conditionAcc.reliability),
      sentinel: finalize(conditionAcc.sentinel)
    };
  }

  const finalized = {
    naive: { label: 'Naive confidence average', ...finalize(methods.naive) },
    freshness: { label: 'Confidence × freshness', ...finalize(methods.freshness) },
    reliability: { label: 'Reliability × freshness', ...finalize(methods.reliability) },
    sentinel: { label: 'Sentinel Ω · Subjective Logic', ...finalize(methods.sentinel) }
  };

  const matchedCoverage = finalized.sentinel.coverage / 100;
  Object.keys(finalized).forEach(function(key) {
    finalized[key].matchedCoverage = Number((matchedCoverage * 100).toFixed(1));
    finalized[key].matchedSelectiveAccuracy = matchedCoverageAccuracy(methods[key].rankingSamples, matchedCoverage);
  });

  return {
    suite: 'SG-Ω-DEGRADED-DECISION-001',
    seed,
    runsPerCondition,
    totalRuns: runsPerCondition * CONDITIONS.length,
    conditions: CONDITIONS.map(c => c.key),
    methods: finalized,
    byCondition
  };
}

export function benchmarkHeadline(result) {
  const s = result.methods.sentinel;
  const n = result.methods.naive;
  const r = result.methods.reliability;
  return {
    accuracyDeltaVsNaive: Number((s.accuracy - n.accuracy).toFixed(1)),
    selectiveAccuracyDeltaVsReliability: Number((s.selectiveAccuracy - r.selectiveAccuracy).toFixed(1)),
    falseConfidenceDeltaVsReliability: Number((s.falseConfidenceRate - r.falseConfidenceRate).toFixed(1)),
    brierDeltaVsNaive: Number((s.brier - n.brier).toFixed(3)),
    calibrationGain: Number((s.rawBrier - s.brier).toFixed(3)),
    coveredBrierDeltaVsReliability: Number((s.coveredBrier - r.coveredBrier).toFixed(3)),
    ece: s.ece,
    rawEce: s.rawEce,
    eceDeltaVsNaive: Number(((s.ece ?? 0) - (n.ece ?? 0)).toFixed(4)),
    coverage: s.coverage,
    abstentionRate: s.abstentionRate,
    appropriateAbstention: s.appropriateAbstention
  };
}
