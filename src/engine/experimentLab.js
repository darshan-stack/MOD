/*
 * Sentinel Grid Ω — synthetic curriculum experiment lab
 *
 * This is an experimental sandbox over procedurally generated scenarios.
 * It compares a fixed-difficulty curriculum with an adaptive curriculum.
 * Results are synthetic and should not be treated as evidence of real trainee
 * learning or operational effectiveness.
 */

import { generateScenario } from './scenarioGenerator.js';
import { robustFuse, glicko2Update, defaultGlicko2, evaluateDecisionOutcome, brierScore } from './decisionIntelligence.js';

const ACTION_FOR_LABEL = {
  CLEAR: 'HOLD',
  BLOCKED: 'REROUTE',
  UNRELIABLE: 'VERIFY'
};

const DIFFICULTIES = [2, 3, 4, 5, 6, 7, 8, 9];

function seeded(seed) {
  let value = (Number(seed) >>> 0) || 1;
  return function random() {
    value = Math.imul(1664525, value) + 1013904223;
    return (value >>> 0) / 4294967296;
  };
}

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, Number(v)));
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function expectedActionFromTruth(truth) {
  return ACTION_FOR_LABEL[truth] || 'VERIFY';
}

function chooseAction(rng, fused, rating, difficulty) {
  const mastery = clamp((rating - 1180) / 520);
  const slip = clamp(0.08 + difficulty * 0.035 - mastery * 0.10, 0.03, 0.38);

  let action = fused.abstain ? 'VERIFY' : expectedActionFromTruth(fused.label);
  if (rng() < slip) {
    const alternatives = ['HOLD', 'REROUTE', 'REPORT', 'VERIFY'].filter(x => x !== action);
    action = pick(rng, alternatives);
  }

  const baseConfidence = Number(fused.probability || fused.confidence || 0);
  const calibrationBias = (1 - mastery) * 10 + difficulty * 0.8;
  const noise = (rng() - 0.5) * 12;
  const confidence = Math.round(clamp((baseConfidence + calibrationBias + noise) / 100, 0.02, 0.99) * 100);

  return { action, confidence };
}

function fixedDifficulty(roundIndex) {
  return [3, 5, 7, 6][roundIndex % 4];
}

function adaptiveDifficulty(rating, roundIndex) {
  const estimatedSkill = clamp((rating - 1200) / 500);
  const target = 3 + estimatedSkill * 5.5 + ((roundIndex % 3) - 1) * 0.6;
  return Math.max(2, Math.min(9, Math.round(target)));
}

function createAccumulator() {
  return {
    correct: 0,
    cases: 0,
    brier: 0,
    confidenceSum: 0,
    ratings: [],
    roundScores: [],
    difficultyScores: Object.fromEntries(DIFFICULTIES.map(d => [d, { correct: 0, cases: 0 }])),
    calibration: Array.from({ length: 10 }, (_, bin) => ({ bin, cases: 0, confidence: 0, correct: 0 }))
  };
}

function addSample(acc, sample) {
  acc.cases += 1;
  acc.correct += sample.correct ? 1 : 0;
  acc.brier += sample.brier;
  acc.confidenceSum += sample.confidence;

  const difficultyBucket = acc.difficultyScores[sample.difficulty] || { correct: 0, cases: 0 };
  difficultyBucket.cases += 1;
  difficultyBucket.correct += sample.correct ? 1 : 0;

  const bin = Math.min(9, Math.max(0, Math.floor(sample.confidence / 10)));
  acc.calibration[bin].cases += 1;
  acc.calibration[bin].confidence += sample.confidence;
  acc.calibration[bin].correct += sample.correct ? 1 : 0;
}

function finalizeAccumulator(acc) {
  return {
    accuracy: Number((acc.correct / Math.max(acc.cases, 1) * 100).toFixed(1)),
    brier: Number((acc.brier / Math.max(acc.cases, 1)).toFixed(3)),
    avgConfidence: Number((acc.confidenceSum / Math.max(acc.cases, 1)).toFixed(1)),
    difficulty: Object.fromEntries(DIFFICULTIES.map(d => {
      const row = acc.difficultyScores[d];
      return [d, {
        accuracy: row.cases ? Number((row.correct / row.cases * 100).toFixed(1)) : null,
        cases: row.cases
      }];
    })),
    calibration: acc.calibration.map(function(row) {
      return {
        bin: row.bin,
        label: (row.bin * 10 + 5) + '%',
        cases: row.cases,
        confidence: row.cases ? Number((row.confidence / row.cases).toFixed(1)) : null,
        accuracy: row.cases ? Number((row.correct / row.cases * 100).toFixed(1)) : null
      };
    }).filter(row => row.cases)
  };
}

export function runCurriculumExperiment({
  sessions = 24,
  roundsPerSession = 16,
  seed = 20261006
} = {}) {
  const rng = seeded(seed);
  const fixed = createAccumulator();
  const adaptive = createAccumulator();
  const roundBuckets = Array.from({ length: roundsPerSession }, () => ({
    fixed: { correct: 0, cases: 0 },
    adaptive: { correct: 0, cases: 0 }
  }));
  const pairedRows = [];
  const fixedRatings = Array(roundsPerSession).fill(0);
  const adaptiveRatings = Array(roundsPerSession).fill(0);
  const fixedDifficultyBuckets = Object.fromEntries(DIFFICULTIES.map(d => [d, { correct: 0, cases: 0 }]));
  const adaptiveDifficultyBuckets = Object.fromEntries(DIFFICULTIES.map(d => [d, { correct: 0, cases: 0 }]));

  for (let session = 0; session < sessions; session++) {
    let fixedSkill = defaultGlicko2();
    let adaptiveSkill = defaultGlicko2();
    for (let round = 0; round < roundsPerSession; round++) {
      const baseSeed = Number(seed) + session * 1000 + round * 17;
      const fixedDiff = fixedDifficulty(round);
      const adaptiveDiff = adaptiveDifficulty(adaptiveSkill.rating, round);

      const fixedScenario = generateScenario({
        seed: baseSeed,
        difficulty: fixedDiff,
        variant: 10 + session
      });
      const adaptiveScenario = generateScenario({
        seed: baseSeed,
        difficulty: adaptiveDiff,
        variant: 20 + session
      });

      const fixedReports = fixedScenario.reports.filter(r => r.topic === 'route_echo');
      const adaptiveReports = adaptiveScenario.reports.filter(r => r.topic === 'route_echo');
      const fixedFusion = robustFuse(fixedReports, 1 - fixedScenario.comms / 100, {});
      const adaptiveFusion = robustFuse(adaptiveReports, 1 - adaptiveScenario.comms / 100, {});

      const fixedChoice = chooseAction(rng, fixedFusion, fixedSkill.rating, fixedDiff);
      const adaptiveChoice = chooseAction(rng, adaptiveFusion, adaptiveSkill.rating, adaptiveDiff);

      const fixedOutcome = evaluateDecisionOutcome(
        fixedChoice.action,
        fixedFusion,
        fixedDiff,
        fixedScenario.routeTruth
      );
      const adaptiveOutcome = evaluateDecisionOutcome(
        adaptiveChoice.action,
        adaptiveFusion,
        adaptiveDiff,
        adaptiveScenario.routeTruth
      );

      const fixedBrier = brierScore(fixedChoice.confidence / 100, fixedOutcome.correct);
      const adaptiveBrier = brierScore(adaptiveChoice.confidence / 100, adaptiveOutcome.correct);

      const fixedSample = {
        curriculum: 'FIXED',
        session,
        round: round + 1,
        difficulty: fixedDiff,
        confidence: fixedChoice.confidence,
        correct: fixedOutcome.correct,
        brier: fixedBrier,
        abstain: fixedFusion.abstain
      };
      const adaptiveSample = {
        curriculum: 'ADAPTIVE',
        session,
        round: round + 1,
        difficulty: adaptiveDiff,
        confidence: adaptiveChoice.confidence,
        correct: adaptiveOutcome.correct,
        brier: adaptiveBrier,
        abstain: adaptiveFusion.abstain
      };

      addSample(fixed, fixedSample);
      addSample(adaptive, adaptiveSample);

      fixedSkill = glicko2Update(fixedSkill, [{
        opponentRating: fixedOutcome.opponentRating,
        opponentRd: 120,
        score: fixedOutcome.score
      }]);
      adaptiveSkill = glicko2Update(adaptiveSkill, [{
        opponentRating: adaptiveOutcome.opponentRating,
        opponentRd: 120,
        score: adaptiveOutcome.score
      }]);

      roundBuckets[round].fixed.cases += 1;
      roundBuckets[round].fixed.correct += fixedOutcome.correct ? 1 : 0;
      roundBuckets[round].adaptive.cases += 1;
      roundBuckets[round].adaptive.correct += adaptiveOutcome.correct ? 1 : 0;
      fixedRatings[round] += fixedSkill.rating;
      adaptiveRatings[round] += adaptiveSkill.rating;

      fixedDifficultyBuckets[fixedDiff].cases += 1;
      fixedDifficultyBuckets[fixedDiff].correct += fixedOutcome.correct ? 1 : 0;
      adaptiveDifficultyBuckets[adaptiveDiff].cases += 1;
      adaptiveDifficultyBuckets[adaptiveDiff].correct += adaptiveOutcome.correct ? 1 : 0;

      pairedRows.push({
        session: session + 1,
        round: round + 1,
        fixedDifficulty: fixedDiff,
        adaptiveDifficulty: adaptiveDiff,
        fixedCorrect: fixedOutcome.correct ? 1 : 0,
        adaptiveCorrect: adaptiveOutcome.correct ? 1 : 0,
        fixedConfidence: fixedChoice.confidence,
        adaptiveConfidence: adaptiveChoice.confidence
      });
    }
  }

  const fixedSummary = finalizeAccumulator(fixed);
  const adaptiveSummary = finalizeAccumulator(adaptive);

  const learningCurve = roundBuckets.map(function(row, index) {
    return {
      round: index + 1,
      fixedAccuracy: Number((row.fixed.correct / Math.max(row.fixed.cases, 1) * 100).toFixed(1)),
      adaptiveAccuracy: Number((row.adaptive.correct / Math.max(row.adaptive.cases, 1) * 100).toFixed(1)),
      fixedRating: Number((fixedRatings[index] / sessions).toFixed(1)),
      adaptiveRating: Number((adaptiveRatings[index] / sessions).toFixed(1))
    };
  });

  const difficultyCurve = DIFFICULTIES.map(function(d) {
    const f = fixedDifficultyBuckets[d];
    const a = adaptiveDifficultyBuckets[d];
    return {
      difficulty: d,
      fixedAccuracy: f.cases ? Number((f.correct / f.cases * 100).toFixed(1)) : null,
      adaptiveAccuracy: a.cases ? Number((a.correct / a.cases * 100).toFixed(1)) : null,
      fixedCases: f.cases,
      adaptiveCases: a.cases
    };
  });

  const gainHeatmap = Array.from({ length: 4 }, function(_, band) {
    return DIFFICULTIES.map(function(d) {
      const fixedRows = pairedRows.filter(x => Math.ceil(x.round / 4) === band + 1 && x.fixedDifficulty === d);
      const adaptiveRows = pairedRows.filter(x => Math.ceil(x.round / 4) === band + 1 && x.adaptiveDifficulty === d);
      const fixedAcc = fixedRows.length ? fixedRows.reduce((s, x) => s + x.fixedCorrect, 0) / fixedRows.length : null;
      const adaptiveAcc = adaptiveRows.length ? adaptiveRows.reduce((s, x) => s + x.adaptiveCorrect, 0) / adaptiveRows.length : null;
      return adaptiveAcc === null || fixedAcc === null ? null : Number(((adaptiveAcc - fixedAcc) * 100).toFixed(1));
    });
  });

  const totalCases = sessions * roundsPerSession;
  const finalBand = learningCurve.slice(-4);
  const fixedFinalAccuracy = finalBand.length
    ? Number((finalBand.reduce((s, x) => s + x.fixedAccuracy, 0) / finalBand.length).toFixed(1))
    : fixedSummary.accuracy;
  const adaptiveFinalAccuracy = finalBand.length
    ? Number((finalBand.reduce((s, x) => s + x.adaptiveAccuracy, 0) / finalBand.length).toFixed(1))
    : adaptiveSummary.accuracy;

  return {
    seed,
    sessions,
    roundsPerSession,
    totalCases: totalCases * 2,
    methods: {
      fixed: fixedSummary,
      adaptive: adaptiveSummary
    },
    learningCurve,
    difficultyCurve,
    calibration: {
      fixed: fixedSummary.calibration,
      adaptive: adaptiveSummary.calibration
    },
    gainHeatmap,
    pairedRows,
    headline: {
      finalAccuracyGain: Number((adaptiveFinalAccuracy - fixedFinalAccuracy).toFixed(1)),
      finalRatingGain: Number((learningCurve.at(-1).adaptiveRating - learningCurve.at(-1).fixedRating).toFixed(1)),
      brierDelta: Number((fixedSummary.brier - adaptiveSummary.brier).toFixed(3)),
      adaptiveAverageDifficulty: Number((pairedRows.reduce((s, x) => s + x.adaptiveDifficulty, 0) / Math.max(pairedRows.length, 1)).toFixed(2))
    }
  };
}

export function experimentCsv(experiment) {
  const header = [
    'session',
    'round',
    'fixedDifficulty',
    'adaptiveDifficulty',
    'fixedCorrect',
    'adaptiveCorrect',
    'fixedConfidence',
    'adaptiveConfidence'
  ];
  const rows = [];
  const rng = experiment.pairedRows || [];
  rng.forEach(row => rows.push([
    row.session,
    row.round,
    row.fixedDifficulty,
    row.adaptiveDifficulty,
    row.fixedCorrect,
    row.adaptiveCorrect,
    row.fixedConfidence,
    row.adaptiveConfidence
  ].join(',')));
  return [header.join(','), ...rows].join('\n');
}
