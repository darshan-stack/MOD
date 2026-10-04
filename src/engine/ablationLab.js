/*
 * Sentinel Grid Ω — component ablation laboratory
 *
 * The study removes one decision-intelligence mechanism at a time while
 * holding the generated exercise stream fixed. Results are synthetic.
 *
 * This is a contribution/sensitivity study, not a claim of human or
 * operational superiority.
 */

import {
  robustFuse,
  updateSourceHistory,
  brierScore,
  evaluateDecisionOutcome
} from './decisionIntelligence.js';
import { generateScenario } from './scenarioGenerator.js';

const BASE_RUNS = 240;

const VARIANTS = [
  {
    key: 'FULL',
    label: 'Full Sentinel Ω',
    description: 'Production fusion + uncertainty + abstention + learned source history.'
  },
  {
    key: 'NO_FRESHNESS',
    label: 'Freshness fixed @100',
    description: 'Removes report-age variation before production fusion; reliability remains.'
  },
  {
    key: 'NO_LEARNED_RELIABILITY',
    label: 'No learned reliability',
    description: 'History never updates; source priors remain, but feedback learning is removed.'
  },
  {
    key: 'NO_ABSTENTION',
    label: 'No abstention',
    description: 'Production fusion output is forced to commit even when it would abstain.'
  },
  {
    key: 'CONFIDENCE_ONLY',
    label: 'Confidence-only',
    description: 'Chooses the stance with the highest confidence mass; no freshness/reliability fusion.'
  }
];

function seeded(seed) {
  let value = (Number(seed) >>> 0) || 1;
  return function random() {
    value = Math.imul(1664525, value) + 1013904223;
    return (value >>> 0) / 4294967296;
  };
}

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length
    : 0;
}

function clamp(value, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, Number(value)));
}

function confidenceOnly(reports) {
  const groups = new Map();
  reports.filter(report => report.state !== 'dropped').forEach(report => {
    if (!groups.has(report.stance)) groups.set(report.stance, []);
    groups.get(report.stance).push(report);
  });

  const candidates = [...groups.entries()].map(([label, group]) => ({
    label,
    score: mean(group.map(report => Number(report.confidence || 0))) / 100
  })).sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best) {
    return { label: 'UNKNOWN', confidence: 0, probability: 0, abstain: true };
  }

  return {
    label: best.label,
    confidence: Math.round(best.score * 100),
    probability: Math.round(best.score * 100),
    abstain: false
  };
}

function methodDecision(variant, reports, channelHealth, history) {
  if (variant.key === 'CONFIDENCE_ONLY') {
    return confidenceOnly(reports);
  }

  const transformed = variant.key === 'NO_FRESHNESS'
    ? reports.map(report => ({ ...report, freshness: 100 }))
    : reports;

  const effectiveHistory = variant.key === 'NO_LEARNED_RELIABILITY' ? {} : history;
  const fused = robustFuse(transformed, channelHealth, effectiveHistory);

  if (variant.key === 'NO_ABSTENTION') {
    return {
      ...fused,
      abstain: false
    };
  }

  return fused;
}

function freshReportForHistory(report) {
  return {
    ...report,
    state: 'live'
  };
}

function summarize(rows) {
  const cases = rows.length;
  const correct = rows.filter(row => row.correct).length;
  const falseConfidence = rows.filter(row => !row.correct && row.probability >= 70).length;
  const abstain = rows.filter(row => row.abstain).length;
  const brier = mean(rows.map(row => row.brier));

  return {
    cases,
    accuracy: Number((correct / Math.max(cases, 1) * 100).toFixed(1)),
    falseConfidenceRate: Number((falseConfidence / Math.max(cases, 1) * 100).toFixed(1)),
    abstentionRate: Number((abstain / Math.max(cases, 1) * 100).toFixed(1)),
    coverage: Number(((cases - abstain) / Math.max(cases, 1) * 100).toFixed(1)),
    brier: Number(brier.toFixed(3)),
    correct,
    falseConfidence,
    abstain
  };
}

export function runAblationStudy({
  runs = BASE_RUNS,
  seed = 20261008
} = {}) {
  const scenarioRng = seeded(seed);
  const histories = Object.fromEntries(VARIANTS.map(variant => [variant.key, {}]));
  const rowsByVariant = Object.fromEntries(VARIANTS.map(variant => [variant.key, []]));

  for (let run = 0; run < runs; run++) {
    const difficulty = 2 + Math.floor(scenarioRng() * 8);
    const scenarioSeed = (Number(seed) + run * 101 + Math.floor(scenarioRng() * 10000)) >>> 0;
    const scenario = generateScenario({
      seed: scenarioSeed,
      difficulty,
      variant: 300 + run
    });

    const reports = scenario.reports.filter(
      report => report.topic && report.topic.startsWith('route_')
    );
    const channelHealth = 1 - scenario.comms / 100;

    VARIANTS.forEach(function(variant) {
      const decision = methodDecision(
        variant,
        reports,
        channelHealth,
        histories[variant.key]
      );

      const outcome = evaluateDecisionOutcome(
        decision.abstain ? 'VERIFY' : (
          decision.label === 'CLEAR' ? 'HOLD' :
          decision.label === 'BLOCKED' ? 'REROUTE' : 'VERIFY'
        ),
        decision,
        difficulty,
        scenario.routeTruth
      );

      const probability = clamp(
        Number(decision.probability ?? decision.confidence ?? 0) / 100
      );
      const row = {
        run: run + 1,
        difficulty,
        variant: variant.key,
        probability: Number(probability.toFixed(4)),
        confidence: Number(decision.confidence || 0),
        abstain: Boolean(decision.abstain),
        correct: Boolean(outcome.correct),
        brier: brierScore(probability, outcome.correct)
      };
      rowsByVariant[variant.key].push(row);

      if (variant.key === 'FULL') {
        const nextHistory = histories[variant.key];
        reports.forEach(function(report) {
          const supported = report.stance === scenario.routeTruth;
          Object.assign(
            nextHistory,
            updateSourceHistory(nextHistory, freshReportForHistory(report), supported)
          );
        });
      }
    });
  }

  const full = summarize(rowsByVariant.FULL);
  const methods = VARIANTS.map(function(variant) {
    const summary = summarize(rowsByVariant[variant.key]);
    return {
      ...variant,
      ...summary,
      accuracyDeltaVsFull: Number((summary.accuracy - full.accuracy).toFixed(1)),
      falseConfidenceDeltaVsFull: Number((summary.falseConfidenceRate - full.falseConfidenceRate).toFixed(1)),
      brierDeltaVsFull: Number((summary.brier - full.brier).toFixed(3))
    };
  });

  methods.sort((a, b) => b.accuracy - a.accuracy);
  const production = methods.find(method => method.key === 'FULL');
  const worstAccuracy = [...methods]
    .filter(method => method.key !== 'FULL')
    .sort((a, b) => a.accuracyDeltaVsFull - b.accuracyDeltaVsFull)[0];
  const safestFalseConfidence = [...methods]
    .filter(method => method.key !== 'FULL')
    .sort((a, b) => a.falseConfidenceDeltaVsFull - b.falseConfidenceDeltaVsFull)[0];

  return {
    seed,
    runs,
    variants: methods,
    rowsByVariant,
    headline: {
      productionAccuracy: production.accuracy,
      mostAccuracySensitive: worstAccuracy?.key || null,
      largestAccuracyDrop: worstAccuracy?.accuracyDeltaVsFull ?? 0,
      mostFalseConfidenceSensitive: safestFalseConfidence?.key || null,
      largestFalseConfidenceChange: safestFalseConfidence?.falseConfidenceDeltaVsFull ?? 0
    },
    methodology: {
      sameGeneratedCaseStream: true,
      scoringUsesHiddenTruthOnlyAfterDecision: true,
      learnedHistoryEnabledOnlyFor: 'FULL',
      note: 'Component removals are sensitivity tests over a synthetic simulator; they do not identify causal effects in human trainees.'
    }
  };
}

export function ablationCsv(study) {
  const rows = [];
  rows.push([
    'variant',
    'run',
    'difficulty',
    'probability',
    'confidence',
    'abstain',
    'correct',
    'brier'
  ].join(','));

  Object.values(study.rowsByVariant || {}).forEach(function(variantRows) {
    variantRows.forEach(function(row) {
      rows.push([
        row.variant,
        row.run,
        row.difficulty,
        row.probability,
        row.confidence,
        row.abstain ? 1 : 0,
        row.correct ? 1 : 0,
        row.brier
      ].join(','));
    });
  });

  return rows.join('\n');
}
