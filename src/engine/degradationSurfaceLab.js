/*
 * Sentinel Grid Ω — degradation response surface laboratory
 *
 * Sweeps synthetic communication quality against contradiction pressure while
 * holding a deterministic case stream fixed across the grid.
 *
 * The surface is intended to expose the decision-system phase transition:
 * confident commitment -> uncertainty -> abstention.
 *
 * Results are synthetic sensitivity evidence only; they do not establish
 * human-learning or operational effectiveness.
 */

import { robustFuse, brierScore, evaluateDecisionOutcome } from './decisionIntelligence.js';

const DEFAULT_HEALTH = [10, 25, 40, 55, 70, 85, 100];
const DEFAULT_CONFLICT = [0, 15, 30, 45, 60, 75, 90];
const LABELS = ['CLEAR', 'BLOCKED', 'UNRELIABLE'];

function seeded(seed) {
  let value = (Number(seed) >>> 0) || 1;
  return function random() {
    value = Math.imul(1664525, value) + 1013904223;
    return (value >>> 0) / 4294967296;
  };
}

function clamp(value, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, Number(value)));
}

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length
    : 0;
}

function pick(rng, values) {
  return values[Math.floor(rng() * values.length)];
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

function decisionAction(decision) {
  if (decision.abstain) return 'VERIFY';
  if (decision.label === 'CLEAR') return 'HOLD';
  if (decision.label === 'BLOCKED') return 'REROUTE';
  return 'VERIFY';
}

function phaseFor(decision) {
  if (decision.abstain) return 'ABSTAIN';
  if (
    Number(decision.probability || 0) >= 70 &&
    Number(decision.uncertainty || 0) < 30 &&
    Number(decision.sufficiency || 0) >= 52
  ) {
    return 'COMMIT';
  }
  return 'UNCERTAIN';
}

function phaseCode(phase) {
  return phase === 'COMMIT' ? 0 : phase === 'UNCERTAIN' ? 1 : 2;
}

function makeBaseCase(rng, index) {
  const truth = pick(rng, LABELS);
  const sourceBlueprints = [
    { source: 'Alpha 1-1', domain: 'LAND', baseConfidence: 91, baseFreshness: 96 },
    { source: 'Echo 3', domain: 'EW', baseConfidence: 87, baseFreshness: 94 },
    { source: 'Raven-2 / UAS', domain: 'AIR', baseConfidence: 83, baseFreshness: 91 },
    { source: 'Relay-5', domain: 'LAND', baseConfidence: 78, baseFreshness: 89 }
  ];

  return {
    id: 'DS-' + String(index + 1).padStart(3, '0'),
    truth,
    reports: sourceBlueprints.map(function(blueprint, reportIndex) {
      const confidenceJitter = Math.round((rng() - 0.5) * 10);
      const freshnessJitter = Math.round((rng() - 0.5) * 8);
      return {
        id: 'DS-' + String(index + 1).padStart(3, '0') + '-R' + (reportIndex + 1),
        source: blueprint.source,
        domain: blueprint.domain,
        topic: 'route_echo',
        stance: truth,
        confidence: blueprint.baseConfidence + confidenceJitter,
        freshness: blueprint.baseFreshness + freshnessJitter,
        corroborated: reportIndex === 0 ? 3 : 2,
        state: 'live'
      };
    })
  };
}

function stressCase(baseCase, networkHealth, conflictPressure, stressSeed) {
  const rng = seeded(stressSeed);
  const health = clamp(networkHealth / 100);
  const pressure = clamp(conflictPressure / 100);
  const reports = baseCase.reports.map(function(report, index) {
    // Consume all random draws unconditionally. This is common-random-number
    // control: every grid cell sees the same stochastic stream per base case,
    // with only the stress thresholds changing.
    const ageNoise = Math.round((rng() - 0.5) * 10);
    const dropoutRoll = rng();
    const conflictRoll = rng();
    const flipRoll = rng();
    const freshness = Math.max(12, Math.min(100, Math.round(
      28 + health * 68 + ageNoise
    )));
    const confidencePenalty = Math.round((1 - health) * 22);
    const dropoutProbability = Math.min(0.28, (1 - health) * 0.30);
    const dropped = dropoutRoll < dropoutProbability && index > 0;
    const conflicting = !dropped && index > 0 && conflictRoll < pressure;

    let stance = report.stance;
    if (conflicting) {
      const alternatives = LABELS.filter(label => label !== baseCase.truth);
      stance = alternatives[Math.min(
        alternatives.length - 1,
        Math.floor(flipRoll * alternatives.length)
      )];
    }

    return {
      ...report,
      stance,
      freshness,
      confidence: Math.max(42, Math.min(96, report.confidence - confidencePenalty)),
      state: dropped
        ? 'dropped'
        : conflicting
          ? 'conflict'
          : freshness < 36
            ? 'stale'
            : 'live'
    };
  });

  // Keep one high-quality anchor report so the surface measures graceful
  // degradation before total information collapse.
  reports[0] = {
    ...reports[0],
    stance: baseCase.truth,
    freshness: Math.max(reports[0].freshness, Math.round(48 + health * 0.50)),
    confidence: Math.max(reports[0].confidence, Math.round(58 + health * 0.34)),
    state: 'live'
  };

  return reports;
}
function summarizeCell(rows) {
  const total = rows.length;
  const probability = mean(rows.map(row => row.probability));
  const uncertainty = mean(rows.map(row => row.uncertainty));
  const sufficiency = mean(rows.map(row => row.sufficiency));
  const abstentionRate = mean(rows.map(row => row.abstain ? 1 : 0));
  const falseConfidenceRate = mean(rows.map(row => row.falseConfidence ? 1 : 0));
  const confidenceOnlyFalseConfidenceRate = mean(rows.map(row => row.confidenceOnlyFalseConfidence ? 1 : 0));
  const falseConfidenceDelta = falseConfidenceRate - confidenceOnlyFalseConfidenceRate;
  const correctRate = mean(rows.map(row => row.correct ? 1 : 0));
  const brier = mean(rows.map(row => row.brier));

  const phaseCounts = {
    COMMIT: rows.filter(row => row.phase === 'COMMIT').length,
    UNCERTAIN: rows.filter(row => row.phase === 'UNCERTAIN').length,
    ABSTAIN: rows.filter(row => row.phase === 'ABSTAIN').length
  };
  const dominantPhase = Object.entries(phaseCounts)
    .sort((a, b) => b[1] - a[1])[0][0];

  return {
    cases: total,
    probability: Number((probability * 100).toFixed(1)),
    uncertainty: Number((uncertainty * 100).toFixed(1)),
    sufficiency: Number((sufficiency * 100).toFixed(1)),
    abstentionRate: Number((abstentionRate * 100).toFixed(1)),
    falseConfidenceRate: Number((falseConfidenceRate * 100).toFixed(1)),
    confidenceOnlyFalseConfidenceRate: Number((confidenceOnlyFalseConfidenceRate * 100).toFixed(1)),
    falseConfidenceDelta: Number((falseConfidenceDelta * 100).toFixed(1)),
    accuracy: Number((correctRate * 100).toFixed(1)),
    brier: Number(brier.toFixed(3)),
    phase: dominantPhase,
    phaseCode: phaseCode(dominantPhase),
    phaseFractions: {
      COMMIT: Number((phaseCounts.COMMIT / Math.max(total, 1) * 100).toFixed(1)),
      UNCERTAIN: Number((phaseCounts.UNCERTAIN / Math.max(total, 1) * 100).toFixed(1)),
      ABSTAIN: Number((phaseCounts.ABSTAIN / Math.max(total, 1) * 100).toFixed(1))
    }
  };
}

export function runDegradationSurfaceStudy({
  networkHealthLevels = DEFAULT_HEALTH,
  conflictLevels = DEFAULT_CONFLICT,
  casesPerCell = 16,
  seed = 20261009
} = {}) {
  const caseRng = seeded(seed);
  const baseCases = Array.from(
    { length: Math.max(1, Number(casesPerCell) || 1) },
    (_, index) => makeBaseCase(caseRng, index)
  );

  const cells = [];
  const matrices = {
    probability: [],
    uncertainty: [],
    sufficiency: [],
    abstention: [],
    falseConfidence: [],
    falseConfidenceDelta: [],
    phaseCode: [],
    phaseLabel: []
  };

  conflictLevels.forEach(function(conflictPressure, yIndex) {
    const probabilityRow = [];
    const uncertaintyRow = [];
    const sufficiencyRow = [];
    const abstentionRow = [];
    const falseConfidenceRow = [];
    const falseConfidenceDeltaRow = [];
    const phaseCodeRow = [];
    const phaseLabelRow = [];

    networkHealthLevels.forEach(function(networkHealth, xIndex) {
      const rows = baseCases.map(function(baseCase, baseIndex) {
        const caseSeed = (
          Number(seed) +
          (baseIndex + 1) * 100003 +
          97
        ) >>> 0;
        const reports = stressCase(
          baseCase,
          networkHealth,
          conflictPressure,
          caseSeed
        );
        const decision = robustFuse(reports, networkHealth / 100, {});
        const outcome = evaluateDecisionOutcome(
          decisionAction(decision),
          decision,
          6,
          baseCase.truth
        );

        const confidenceOnlyDecision = confidenceOnly(reports);
        const confidenceOnlyOutcome = evaluateDecisionOutcome(
          decisionAction(confidenceOnlyDecision),
          confidenceOnlyDecision,
          6,
          baseCase.truth
        );

        const probability = clamp(Number(decision.probability || 0) / 100);
        const confidenceOnlyProbability = clamp(
          Number(confidenceOnlyDecision.probability || 0) / 100
        );

        return {
          correct: Boolean(outcome.correct),
          probability,
          uncertainty: clamp(Number(decision.uncertainty || 0) / 100),
          sufficiency: clamp(Number(decision.sufficiency || 0) / 100),
          abstain: Boolean(decision.abstain),
          falseConfidence: !outcome.correct && probability >= 0.70,
          confidenceOnlyFalseConfidence: !confidenceOnlyOutcome.correct &&
            confidenceOnlyProbability >= 0.70,
          phase: phaseFor(decision),
          brier: brierScore(probability, outcome.correct)
        };
      });

      const summary = summarizeCell(rows);
      const cell = {
        networkHealth,
        conflictPressure,
        ...summary
      };
      cells.push(cell);
      probabilityRow.push(summary.probability);
      uncertaintyRow.push(summary.uncertainty);
      sufficiencyRow.push(summary.sufficiency);
      abstentionRow.push(summary.abstentionRate);
      falseConfidenceRow.push(summary.falseConfidenceRate);
      falseConfidenceDeltaRow.push(summary.falseConfidenceDelta);
      phaseCodeRow.push(summary.phaseCode);
      phaseLabelRow.push(summary.phase);
    });

    matrices.probability.push(probabilityRow);
    matrices.uncertainty.push(uncertaintyRow);
    matrices.sufficiency.push(sufficiencyRow);
    matrices.abstention.push(abstentionRow);
    matrices.falseConfidence.push(falseConfidenceRow);
    matrices.falseConfidenceDelta.push(falseConfidenceDeltaRow);
    matrices.phaseCode.push(phaseCodeRow);
    matrices.phaseLabel.push(phaseLabelRow);
  });

  const leastDegraded = cells.find(
    cell => cell.networkHealth === Math.max(...networkHealthLevels) &&
      cell.conflictPressure === Math.min(...conflictLevels)
  ) || cells[0];
  const mostDegraded = cells.find(
    cell => cell.networkHealth === Math.min(...networkHealthLevels) &&
      cell.conflictPressure === Math.max(...conflictLevels)
  ) || cells[cells.length - 1];
  const maxFalseConfidenceDelta = [...cells].sort(
    (a, b) => b.falseConfidenceDelta - a.falseConfidenceDelta
  )[0];

  return {
    seed: Number(seed) >>> 0,
    casesPerCell,
    networkHealthLevels,
    conflictLevels,
    cells,
    matrices,
    headline: {
      baselineCommitProbability: leastDegraded.probability,
      baselineAbstentionRate: leastDegraded.abstentionRate,
      stressUncertainty: mostDegraded.uncertainty,
      stressAbstentionRate: mostDegraded.abstentionRate,
      maxFalseConfidenceDelta: maxFalseConfidenceDelta.falseConfidenceDelta,
      maxFalseConfidenceCell: {
        networkHealth: maxFalseConfidenceDelta.networkHealth,
        conflictPressure: maxFalseConfidenceDelta.conflictPressure
      }
    },
    methodology: {
      fixedBaseCaseStream: true,
      gridDimensions: 'network health × contradiction pressure',
      scoringUsesHiddenTruthOnlyAfterDecision: true,
      baselineComparator: 'confidence-only mean-by-stance',
      note: 'Synthetic response-surface sensitivity study. Phase labels visualize production output states; they are not operational decision rules.'
    }
  };
}

export function degradationSurfaceCsv(study) {
  const header = [
    'networkHealth',
    'conflictPressure',
    'cases',
    'probability',
    'uncertainty',
    'sufficiency',
    'abstentionRate',
    'falseConfidenceRate',
    'confidenceOnlyFalseConfidenceRate',
    'falseConfidenceDelta',
    'accuracy',
    'brier',
    'phase'
  ];

  const rows = (study.cells || []).map(cell => [
    cell.networkHealth,
    cell.conflictPressure,
    cell.cases,
    cell.probability,
    cell.uncertainty,
    cell.sufficiency,
    cell.abstentionRate,
    cell.falseConfidenceRate,
    cell.confidenceOnlyFalseConfidenceRate,
    cell.falseConfidenceDelta,
    cell.accuracy,
    cell.brier,
    cell.phase
  ].join(','));

  return [header.join(','), ...rows].join('\n');
}
