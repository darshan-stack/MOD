/*
 * Sentinel Grid Ω — statistical experiment laboratory
 *
 * Inference is intentionally scoped to the synthetic curriculum simulator.
 * Session-level resampling preserves the repeated-measures structure of each
 * virtual trainee better than treating every trial as independent.
 */

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, Number(v)));
}

function seeded(seed) {
  let value = (Number(seed) >>> 0) || 1;
  return function random() {
    value = Math.imul(1664525, value) + 1013904223;
    return (value >>> 0) / 4294967296;
  };
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function variance(values) {
  if (values.length < 2) return 0;
  const mu = mean(values);
  return values.reduce((sum, value) => sum + (Number(value || 0) - mu) ** 2, 0) / (values.length - 1);
}

function quantile(values, probability) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const p = clamp(probability);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function round(value, digits = 3) {
  return Number(Number(value).toFixed(digits));
}

function bySession(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = Number(row.session);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]);
}

function sessionMeans(rows, field) {
  return bySession(rows).map(function([session, sessionRows]) {
    return {
      session,
      value: mean(sessionRows.map(row => Number(row[field] || 0)))
    };
  });
}

function bootstrapStatistic(valuesBySession, statistic, { seed = 1, repetitions = 2000 } = {}) {
  const values = valuesBySession.map(Number);
  if (!values.length) return { estimate: null, lower: null, upper: null, repetitions: 0 };

  const rng = seeded(seed);
  const n = values.length;
  const samples = new Array(Math.max(1, repetitions));

  for (let i = 0; i < samples.length; i++) {
    const resample = new Array(n);
    for (let j = 0; j < n; j++) {
      resample[j] = values[Math.floor(rng() * n)];
    }
    samples[i] = statistic(resample);
  }

  return {
    estimate: statistic(values),
    lower: round(quantile(samples, 0.025), 3),
    upper: round(quantile(samples, 0.975), 3),
    repetitions: samples.length
  };
}

function pairedRandomizationPValue(differences, { seed = 1, repetitions = 20000 } = {}) {
  const values = differences.map(Number).filter(Number.isFinite);
  if (!values.length) return null;

  const observed = Math.abs(mean(values));
  const rng = seeded(seed);
  let extreme = 0;

  for (let i = 0; i < repetitions; i++) {
    let total = 0;
    for (const difference of values) {
      total += (rng() < 0.5 ? -1 : 1) * difference;
    }
    if (Math.abs(total / values.length) >= observed - 1e-12) extreme += 1;
  }

  return round((extreme + 1) / (repetitions + 1), 4);
}

function cohenH(p1, p2) {
  const safe = function(p) {
    return clamp(Number(p), 1e-9, 1 - 1e-9);
  };
  return round(2 * (Math.asin(Math.sqrt(safe(p2))) - Math.asin(Math.sqrt(safe(p1)))), 3);
}

function pairedDz(differences) {
  const values = differences.map(Number).filter(Number.isFinite);
  const sd = Math.sqrt(variance(values));
  return sd > 1e-12 ? round(mean(values) / sd, 3) : 0;
}

function ciRecord(estimate, bootstrap, digits = 3) {
  return {
    estimate: round(estimate, digits),
    lower: round(bootstrap.lower, digits),
    upper: round(bootstrap.upper, digits)
  };
}

function comparison({
  label,
  fixedValues,
  adaptiveValues,
  scale = 1,
  seed = 1,
  repetitions = 2000,
  effect = null
}) {
  const paired = fixedValues.map(function(value, index) {
    return Number(adaptiveValues[index]) - Number(value);
  });
  const fixed = mean(fixedValues);
  const adaptive = mean(adaptiveValues);
  const bootstrap = bootstrapStatistic(paired, mean, { seed, repetitions });
  const pValue = pairedRandomizationPValue(paired, { seed: seed + 100003, repetitions: repetitions * 10 });

  const fixedScaled = fixed * scale;
  const adaptiveScaled = adaptive * scale;
  const differenceScaled = mean(paired) * scale;

  return {
    label,
    fixed: round(fixedScaled),
    adaptive: round(adaptiveScaled),
    difference: round(differenceScaled),
    confidenceInterval95: {
      lower: round(bootstrap.lower * scale),
      upper: round(bootstrap.upper * scale)
    },
    pValueRandomization: pValue,
    effectSize: effect || {
      type: 'paired Cohen dz',
      value: pairedDz(paired)
    },
    sessions: fixedValues.length
  };
}

function finalBandSessionValues(rows, field) {
  const groups = bySession(rows);
  const maxRound = Math.max(...rows.map(row => Number(row.round || 0)));
  const startRound = Math.max(1, maxRound - 3);
  return groups.map(function([session, sessionRows]) {
    const selected = sessionRows.filter(row => Number(row.round) >= startRound);
    return { session, value: mean(selected.map(row => Number(row[field] || 0))) };
  });
}

function buildRoundConfidence(rows, rounds, sessions, seed, repetitions) {
  const result = [];
  for (let round = 1; round <= rounds; round++) {
    const rowsAtRound = rows.filter(row => Number(row.round) === round);
    const fixedBySession = sessionMeans(rowsAtRound, 'fixedCorrect');
    const adaptiveBySession = sessionMeans(rowsAtRound, 'adaptiveCorrect');
    const fixedValues = fixedBySession.map(x => x.value);
    const adaptiveValues = adaptiveBySession.map(x => x.value);
    const fixedBoot = bootstrapStatistic(fixedValues, mean, { seed: seed + round * 31, repetitions });
    const adaptiveBoot = bootstrapStatistic(adaptiveValues, mean, { seed: seed + round * 37, repetitions });
    const differenceBoot = bootstrapStatistic(
      fixedValues.map((value, index) => adaptiveValues[index] - value),
      mean,
      { seed: seed + round * 41, repetitions }
    );

    result.push({
      round,
      fixedAccuracy: round === 0 ? 0 : round(fixedBoot.estimate * 100, 1),
      adaptiveAccuracy: round(adaptiveBoot.estimate * 100, 1),
      fixedAccuracyCI95: [round(fixedBoot.lower * 100, 1), round(fixedBoot.upper * 100, 1)],
      adaptiveAccuracyCI95: [round(adaptiveBoot.lower * 100, 1), round(adaptiveBoot.upper * 100, 1)],
      accuracyGainCI95: [round(differenceBoot.lower * 100, 1), round(differenceBoot.upper * 100, 1)]
    });
  }
  return result;
}

export function runExperimentStatistics(
  pairedRows,
  {
    sessions = 32,
    roundsPerSession = 16,
    seed = 20261007,
    bootstrapRepetitions = 2000,
    permutationRepetitions = 20000
  } = {}
) {
  const groups = bySession(pairedRows);
  const fixedAccuracyBySession = groups.map(function([session, rows]) ({
    session,
    value: mean(rows.map(row => Number(row.fixedCorrect || 0)))
  }));
  const adaptiveAccuracyBySession = groups.map(function([session, rows]) ({
    session,
    value: mean(rows.map(row => Number(row.adaptiveCorrect || 0)))
  }));
  const fixedBrierBySession = groups.map(function([session, rows]) ({
    session,
    value: mean(rows.map(row => Number(row.fixedBrier || 0)))
  }));
  const adaptiveBrierBySession = groups.map(function([session, rows]) ({
    session,
    value: mean(rows.map(row => Number(row.adaptiveBrier || 0)))
  }));
  const fixedConfidenceBySession = groups.map(function([session, rows]) ({
    session,
    value: mean(rows.map(row => Number(row.fixedConfidence || 0)))
  }));
  const adaptiveConfidenceBySession = groups.map(function([session, rows]) ({
    session,
    value: mean(rows.map(row => Number(row.adaptiveConfidence || 0)))
  }));

  const accuracyDiffs = fixedAccuracyBySession.map((row, index) =>
    adaptiveAccuracyBySession[index].value - row.value
  );
  const brierDiffs = fixedBrierBySession.map((row, index) =>
    row.value - adaptiveBrierBySession[index].value
  );
  const confidenceDiffs = fixedConfidenceBySession.map((row, index) =>
    adaptiveConfidenceBySession[index].value - row.value
  );

  const finalFixed = finalBandSessionValues(pairedRows, 'fixedCorrect');
  const finalAdaptive = finalBandSessionValues(pairedRows, 'adaptiveCorrect');
  const finalAccuracyDiffs = finalFixed.map((row, index) => finalAdaptive[index].value - row.value);

  const finalRatingDiffs = groups.map(function([session, rows]) {
    const ordered = [...rows].sort((a, b) => Number(a.round) - Number(b.round));
    const last = ordered.at(-1);
    return Number(last?.adaptiveFinalRating || 0) - Number(last?.fixedFinalRating || 0);
  }).filter(Number.isFinite);

  const accuracyComparison = comparison({
    label: 'Overall accuracy',
    fixedValues: fixedAccuracyBySession.map(x => x.value),
    adaptiveValues: adaptiveAccuracyBySession.map(x => x.value),
    scale: 100,
    seed: seed + 1,
    repetitions: bootstrapRepetitions,
    effect: {
      type: 'Cohen h + paired randomization',
      value: cohenH(mean(fixedAccuracyBySession.map(x => x.value)), mean(adaptiveAccuracyBySession.map(x => x.value)))
    }
  });

  const brierComparison = comparison({
    label: 'Brier improvement',
    fixedValues: fixedBrierBySession.map(x => x.value),
    adaptiveValues: adaptiveBrierBySession.map(x => x.value),
    scale: -1,
    seed: seed + 2,
    repetitions: bootstrapRepetitions,
    effect: {
      type: 'paired Cohen dz',
      value: pairedDz(brierDiffs)
    }
  });

  const confidenceComparison = comparison({
    label: 'Mean confidence',
    fixedValues: fixedConfidenceBySession.map(x => x.value),
    adaptiveValues: adaptiveConfidenceBySession.map(x => x.value),
    scale: 1,
    seed: seed + 3,
    repetitions: bootstrapRepetitions,
    effect: {
      type: 'paired Cohen dz',
      value: pairedDz(confidenceDiffs)
    }
  });

  const finalAccuracyBootstrap = bootstrapStatistic(finalAccuracyDiffs, mean, {
    seed: seed + 4,
    repetitions: bootstrapRepetitions
  });

  const finalRatingBootstrap = bootstrapStatistic(finalRatingDiffs, mean, {
    seed: seed + 5,
    repetitions: bootstrapRepetitions
  });

  const finalAccuracy = {
    label: 'Final 4-round accuracy',
    fixed: round(mean(finalFixed.map(x => x.value)) * 100, 1),
    adaptive: round(mean(finalAdaptive.map(x => x.value)) * 100, 1),
    difference: round(mean(finalAccuracyDiffs) * 100, 1),
    confidenceInterval95: {
      lower: round(finalAccuracyBootstrap.lower * 100, 1),
      upper: round(finalAccuracyBootstrap.upper * 100, 1)
    },
    pValueRandomization: pairedRandomizationPValue(finalAccuracyDiffs, {
      seed: seed + 100004,
      repetitions: permutationRepetitions
    }),
    effectSize: {
      type: 'Cohen h',
      value: cohenH(mean(finalFixed.map(x => x.value)), mean(finalAdaptive.map(x => x.value)))
    },
    sessions
  };

  const finalRating = {
    label: 'Final Glicko-2 rating',
    fixed: null,
    adaptive: null,
    difference: round(mean(finalRatingDiffs), 1),
    confidenceInterval95: {
      lower: round(finalRatingBootstrap.lower, 1),
      upper: round(finalRatingBootstrap.upper, 1)
    },
    pValueRandomization: pairedRandomizationPValue(finalRatingDiffs, {
      seed: seed + 100005,
      repetitions: permutationRepetitions
    }),
    effectSize: {
      type: 'paired Cohen dz',
      value: pairedDz(finalRatingDiffs)
    },
    sessions
  };

  const roundConfidence = buildRoundConfidence(
    pairedRows,
    roundsPerSession,
    sessions,
    seed + 200,
    Math.max(500, Math.floor(bootstrapRepetitions / 2))
  );

  const publicationTable = [
    accuracyComparison,
    finalAccuracy,
    brierComparison,
    confidenceComparison,
    finalRating
  ];

  return {
    method: 'session-level percentile bootstrap + paired sign-randomization',
    confidenceLevel: 0.95,
    bootstrapUnit: 'virtual trainee/session',
    bootstrapRepetitions,
    permutationRepetitions,
    note: 'Synthetic simulator output; inferential statistics quantify simulator uncertainty, not human-subject effects.',
    comparisons: {
      accuracy: accuracyComparison,
      finalAccuracy,
      brier: brierComparison,
      confidence: confidenceComparison,
      finalRating
    },
    roundConfidence,
    publicationTable,
    sample: {
      sessions,
      roundsPerSession,
      pairedTrials: pairedRows.length
    }
  };
}
