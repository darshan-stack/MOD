/*
 * Sentinel Grid Ω — decision-intelligence kernel
 *
 * Research-facing modules:
 *   - dynamic source reliability with Beta posteriors
 *   - Subjective Logic-style belief / disbelief / uncertainty
 *   - Glicko-2 trainee skill estimation
 *   - proper confidence scoring (Brier)
 *   - adaptive exercise selection
 *
 * The Subjective Logic representation follows Jøsang's opinion model:
 *   omega = (belief, disbelief, uncertainty, baseRate)
 * and uses a conservative consensus-style fusion for independent reports.
 *
 * Glicko-2 implementation follows Mark Glickman's published algorithm.
 */

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v)));

export function exponentialFreshness(ageSeconds, halfLife = 90) {
  return clamp(Math.exp(-Math.max(0, ageSeconds) * Math.log(2) / halfLife));
}

/* ----------------------------- Reliability ----------------------------- */

export function betaReliability(alpha = 2, beta = 1) {
  return clamp(alpha / Math.max(alpha + beta, 1));
}

export function betaPosterior(history = {}, key, priorAlpha = 2, priorBeta = 1) {
  const h = history[key] || {};
  const supported = Number(h.supported);
  const contradicted = Number(h.contradicted);
  return {
    alpha: priorAlpha + (Number.isFinite(supported) ? Math.max(0, supported) : 0),
    beta: priorBeta + (Number.isFinite(contradicted) ? Math.max(0, contradicted) : 0)
  };
}

export function sourceReliability(report, history = {}) {
  const posterior = betaPosterior(history, report.source);
  const prior = betaReliability(posterior.alpha, posterior.beta);
  const freshness = clamp(Number(report.freshness || 0) / 100);
  const confidence = clamp(Number(report.confidence || 0) / 100);
  const corroboration = clamp(Number(report.corroborated || 0) / 3);
  return clamp(0.50 * prior + 0.22 * freshness + 0.18 * confidence + 0.10 * corroboration);
}

export function updateSourceHistory(history = {}, report, supported) {
  const next = { ...history };
  const current = next[report.source] || { supported: 0, contradicted: 0 };
  next[report.source] = {
    supported: current.supported + (supported ? 1 : 0),
    contradicted: current.contradicted + (supported ? 0 : 1)
  };
  return next;
}

export function evidenceWeight(report, channelHealth = 1, history = {}) {
  const reliability = sourceReliability(report, history);
  const freshness = clamp(Number(report.freshness || 0) / 100);
  const channel = clamp(channelHealth);
  return clamp(reliability * channel * (0.72 + 0.28 * freshness));
}

/* --------------------------- Conflict analysis ------------------------- */

export function conflictIndex(reports, history = {}) {
  const byTopic = new Map();
  reports.forEach(r => {
    const topic = r.topic || r.id;
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic).push(r);
  });

  let total = 0;
  let pairs = 0;

  byTopic.forEach(group => {
    if (group.length < 2) return;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (a.stance && b.stance && a.stance !== b.stance) {
          const aw = evidenceWeight(a, 1, history);
          const bw = evidenceWeight(b, 1, history);
          total += clamp(Math.min(aw, bw) * 1.7);
          pairs += 1;
        }
      }
    }
  });

  return pairs ? clamp(total / pairs) : 0;
}

/* -------------------------- Subjective Logic --------------------------- */

export function opinionFromReport(report, targetLabel, channelHealth = 1, history = {}) {
  const reliability = sourceReliability(report, history);
  const freshness = clamp(Number(report.freshness || 0) / 100);
  const confidence = clamp(Number(report.confidence || 0) / 100);
  const corroboration = clamp(Number(report.corroborated || 0) / 3);
  const channel = clamp(channelHealth);

  // Evidence strength controls how much mass leaves the uncertainty bucket.
  const strength = clamp(
    reliability *
    channel *
    (0.60 + 0.40 * freshness) *
    (0.65 + 0.35 * confidence) *
    (0.75 + 0.25 * corroboration)
  );

  if (!report.stance) {
    return { belief: 0, disbelief: 0, uncertainty: 1, baseRate: 0.5, strength };
  }

  const supports = report.stance === targetLabel;
  return {
    belief: supports ? strength : 0,
    disbelief: supports ? 0 : strength,
    uncertainty: 1 - strength,
    baseRate: 0.5,
    strength
  };
}

/*
 * Consensus fusion for two independent binomial opinions.
 * This keeps explicit epistemic uncertainty instead of collapsing evidence
 * directly into a point estimate.
 */
export function fuseSubjectiveOpinions(a, b) {
  const den = a.uncertainty + b.uncertainty - a.uncertainty * b.uncertainty;

  if (den <= 1e-9) {
    const baseA = a.belief + a.baseRate * a.uncertainty;
    const baseB = b.belief + b.baseRate * b.uncertainty;
    const mean = clamp((baseA + baseB) / 2);
    return {
      belief: mean,
      disbelief: 1 - mean,
      uncertainty: 0,
      baseRate: (a.baseRate + b.baseRate) / 2
    };
  }

  const belief = clamp(
    (a.belief * b.uncertainty + b.belief * a.uncertainty) / den
  );
  const disbelief = clamp(
    (a.disbelief * b.uncertainty + b.disbelief * a.uncertainty) / den
  );
  const uncertainty = clamp(
    (a.uncertainty * b.uncertainty) / den
  );

  return {
    belief,
    disbelief,
    uncertainty,
    baseRate: clamp((a.baseRate + b.baseRate) / 2)
  };
}

export function projectedProbability(opinion) {
  return clamp(opinion.belief + opinion.baseRate * opinion.uncertainty);
}

export function temperatureScaleDistribution(distribution, temperature = 1) {
  const t = Math.max(Number(temperature) || 1, 0.25);
  if (!distribution.length) return [];
  const logits = distribution.map(item => Math.log(Math.max(clamp(item.probability), 1e-9)) / t);
  const maxLogit = Math.max(...logits);
  const exps = logits.map(x => Math.exp(x - maxLogit));
  const total = exps.reduce((sum, x) => sum + x, 0) || 1;
  return distribution.map((item, i) => ({
    label: item.label,
    probability: Number((exps[i] / total).toFixed(6))
  }));
}

export function expectedCalibrationError(samples = [], binCount = 10) {
  if (!samples.length) return null;
  const bins = Array.from({ length: binCount }, () => ({ n: 0, p: 0, y: 0 }));
  samples.forEach(sample => {
    const p = clamp(Number(sample.probability ?? sample.confidence ?? 0));
    const y = sample.correct ? 1 : 0;
    const index = Math.min(binCount - 1, Math.floor(p * binCount));
    bins[index].n += 1;
    bins[index].p += p;
    bins[index].y += y;
  });
  const total = samples.length;
  return Number(bins
    .filter(bin => bin.n)
    .reduce((sum, bin) => {
      const gap = Math.abs(bin.p / bin.n - bin.y / bin.n);
      return sum + (bin.n / total) * gap;
    }, 0)
    .toFixed(4));
}

export function subjectiveLogicFuse(reports, channelHealth = 1, history = {}) {
  if (!reports.length) {
    return {
      label: 'UNKNOWN',
      confidence: 0,
      belief: 0,
      disbelief: 0,
      uncertainty: 1,
      conflict: 0,
      sufficiency: 0,
      abstain: true,
      method: 'SUBJECTIVE_LOGIC',
      distribution: [],
      contributors: []
    };
  }

  const usableReports = reports.filter(r => r.state !== 'dropped');
  if (!usableReports.length) {
    return {
      label: 'UNKNOWN',
      confidence: 0,
      rawConfidence: 0,
      probability: 0,
      rawProbability: 0,
      belief: 0,
      disbelief: 0,
      uncertainty: 100,
      conflict: 0,
      sufficiency: 0,
      abstain: true,
      method: 'SUBJECTIVE_LOGIC',
      calibrationTemperature: 1,
      distribution: [],
      rawDistribution: [],
      contributors: []
    };
  }

  const labels = [...new Set(usableReports.map(r => r.stance || 'UNKNOWN'))].filter(Boolean);
  const conflict = conflictIndex(usableReports, history);
  const independentSources = new Set(usableReports.map(r => r.source)).size;

  /*
   * Weighted opinion pooling:
   * each report contributes explicit support (belief), opposition
   * (disbelief) and residual epistemic uncertainty. Using a uniform base
   * rate across the mutually-exclusive labels makes the projected
   * probabilities sum to one while preserving uncertainty separately.
   */
  const weighted = usableReports.map(report => ({
    report,
    weight: evidenceWeight(report, channelHealth, history)
  }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const averageEvidenceStrength = weighted.length
    ? clamp(totalWeight / weighted.length)
    : 0;
  const uncertainty = clamp(1 - averageEvidenceStrength);
  const committedMass = 1 - uncertainty;

  const candidates = labels.map(label => {
    const labelWeight = weighted.reduce(
      (sum, item) => sum + (item.report.stance === label ? item.weight : 0),
      0
    );
    const share = totalWeight > 1e-12 ? labelWeight / totalWeight : 1 / Math.max(labels.length, 1);
    const belief = committedMass * share;
    const disbelief = committedMass * (1 - share);
    const baseRate = 1 / Math.max(labels.length, 1);
    const projected = clamp(belief + baseRate * uncertainty);

    return {
      label,
      opinion: { belief, disbelief, uncertainty, baseRate },
      projected,
      contributors: weighted
        .filter(item => item.report.stance === label)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 4)
        .map(item => ({
          id: item.report.id,
          weight: Math.round(item.weight * 100),
          strength: Math.round(item.weight * 100)
        }))
    };
  }).sort((a, b) => b.projected - a.projected);

  const best = candidates[0];
  const uncertainty = best.opinion.uncertainty;
  const sufficiency = clamp(
    0.50 * best.projected +
    0.22 * Math.min(independentSources / 2, 1) +
    0.28 * (1 - conflict) -
    0.18 * uncertainty
  );

  const rawDistribution = candidates.map(candidate => ({
    label: candidate.label,
    probability: Number(candidate.projected.toFixed(6))
  }));

  /*
   * Uncertainty-aware temperature scaling is a confidence calibration layer,
   * not a label-changing rule. As uncertainty or contradiction rises, the
   * distribution is softened so the UI does not expose unjustified certainty.
   */
  // Keep the production score aligned with the Subjective Logic projected
  // probability. Temperature scaling remains available as an experiment via
  // temperatureScaleDistribution(), but is not applied by default.
  const calibrationTemperature = 1;
  const distribution = rawDistribution;
  const calibratedBest = distribution[0];

  return {
    label: best.label,
    // Human-facing confidence is belief mass; projected probability is kept
    // separately for proper probabilistic scoring and calibration diagnostics.
    confidence: Math.round(best.opinion.belief * 100),
    rawConfidence: Math.round(best.opinion.belief * 100),
    probability: Math.round(calibratedBest.probability * 100),
    rawProbability: Math.round(best.projected * 100),
    belief: Math.round(best.opinion.belief * 100),
    disbelief: Math.round(best.opinion.disbelief * 100),
    uncertainty: Math.round(best.opinion.uncertainty * 100),
    conflict: Math.round(conflict * 100),
    sufficiency: Math.round(sufficiency * 100),
    abstain: sufficiency < 0.52 || best.projected < 0.50 || independentSources < 2,
    method: 'SUBJECTIVE_LOGIC',
    calibrationTemperature: Number(calibrationTemperature.toFixed(2)),
    distribution,
    rawDistribution,
    contributors: best.contributors
  };
}

/* Backward-compatible API used by the cockpit. */
export function robustFuse(reports, channelHealth = 1, history = {}) {
  return subjectiveLogicFuse(reports, channelHealth, history);
}

/* --------------------- Information / calibration ----------------------- */

export function informationIntegrityIndex(reports, networkHealth, latency, dropout, conflictPressure, history = {}) {
  if (!reports.length) return 0;
  const avgFresh = reports.reduce((a, r) => a + Number(r.freshness || 0), 0) / reports.length;
  const avgTrust = reports.reduce((a, r) => a + sourceReliability(r, history) * 100, 0) / reports.length;
  const networkPenalty = (100 - networkHealth) * 0.32;
  const latencyPenalty = Math.min(latency, 100) * 0.16;
  const dropoutPenalty = dropout * 0.18;
  const conflictPenalty = conflictPressure * 0.20;
  return Math.round(clamp(
    avgFresh * 0.22 +
    avgTrust * 0.22 +
    100 -
    networkPenalty -
    latencyPenalty -
    dropoutPenalty -
    conflictPenalty,
    0, 100
  ));
}

export function calibrationGap(decisions, reports, history = {}) {
  if (!decisions.length) return 0;
  const gaps = decisions.map(d => {
    const evidence = (d.evidence || []).map(id => reports.find(r => r.id === id)).filter(Boolean);
    const support = evidence.length
      ? evidence.reduce((a, r) => a + sourceReliability(r, history) * 100, 0) / evidence.length
      : 0;
    return Math.abs(Number(d.confidence) - support);
  });
  return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
}

export function brierScore(probability, outcome) {
  const p = clamp(Number(probability));
  const y = outcome ? 1 : 0;
  return (p - y) * (p - y);
}

export function calibrationSummary(decisions) {
  const scored = decisions.filter(d => typeof d.correct === 'boolean');
  if (!scored.length) return { brier: null, accuracy: null, samples: 0 };
  const total = scored.reduce((sum, d) => sum + brierScore(Number(d.confidence) / 100, d.correct), 0);
  const correct = scored.filter(d => d.correct).length;
  return {
    brier: Number((total / scored.length).toFixed(3)),
    accuracy: Math.round(correct / scored.length * 100),
    samples: scored.length
  };
}

/* ----------------------------- Glicko-2 -------------------------------- */

const GLICKO_SCALE = 173.7178;
const GLICKO_TAU = 0.5;
const GLICKO_EPSILON = 0.000001;

export function defaultGlicko2() {
  return {
    rating: 1500,
    rd: 350,
    sigma: 0.06,
    rounds: 0
  };
}

const glickoG = phi => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const glickoE = (mu, muJ, phiJ) => 1 / (1 + Math.exp(-glickoG(phiJ) * (mu - muJ)));

function volatilityFunction(x, delta, phi, v, a) {
  const ex = Math.exp(x);
  const numerator = ex * (delta * delta - phi * phi - v - ex);
  const denominator = 2 * Math.pow(phi * phi + v + ex, 2);
  return numerator / denominator - (x - a) / (GLICKO_TAU * GLICKO_TAU);
}

export function glicko2Update(player = defaultGlicko2(), results = []) {
  const safePlayer = { ...defaultGlicko2(), ...player };
  if (!results.length) {
    const phi = safePlayer.rd / GLICKO_SCALE;
    const sigma = safePlayer.sigma;
    const phiPrime = Math.sqrt(phi * phi + sigma * sigma);
    return {
      ...safePlayer,
      rd: Math.min(350, phiPrime * GLICKO_SCALE),
      rounds: Number(safePlayer.rounds || 0)
    };
  }

  const mu = (safePlayer.rating - 1500) / GLICKO_SCALE;
  const phi = safePlayer.rd / GLICKO_SCALE;
  const sigma = safePlayer.sigma;

  let sumVariance = 0;
  let sumDelta = 0;

  results.forEach(result => {
    const opponentRating = Number(result.opponentRating ?? 1500);
    const opponentRd = Number(result.opponentRd ?? 350);
    const muJ = (opponentRating - 1500) / GLICKO_SCALE;
    const phiJ = opponentRd / GLICKO_SCALE;
    const g = glickoG(phiJ);
    const e = glickoE(mu, muJ, phiJ);
    sumVariance += g * g * e * (1 - e);
    sumDelta += g * (Number(result.score) - e);
  });

  const v = 1 / Math.max(sumVariance, 1e-12);
  const delta = v * sumDelta;
  const a = Math.log(sigma * sigma);

  let A = a;
  let B;

  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (volatilityFunction(a - k * GLICKO_TAU, delta, phi, v, a) < 0 && k < 100) k += 1;
    B = a - k * GLICKO_TAU;
  }

  let fA = volatilityFunction(A, delta, phi, v, a);
  let fB = volatilityFunction(B, delta, phi, v, a);

  let guard = 0;
  while (Math.abs(B - A) > GLICKO_EPSILON && guard < 100) {
    const deltaF = fB - fA;
    const C = A + ((A - B) * fA) / (Math.abs(deltaF) > 1e-12 ? deltaF : (deltaF < 0 ? -1e-12 : 1e-12));
    const fC = volatilityFunction(C, delta, phi, v, a);

    if (fC * fB < 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }

    B = C;
    fB = fC;
    guard += 1;
  }

  const sigmaPrime = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt((1 / (phiStar * phiStar)) + (1 / v));

  const muPrime = mu + phiPrime * phiPrime * sumDelta;
  const ratingPrime = 1500 + GLICKO_SCALE * muPrime;
  const rdPrime = GLICKO_SCALE * phiPrime;

  return {
    rating: Math.round(ratingPrime * 10) / 10,
    rd: Math.round(Math.min(350, rdPrime) * 10) / 10,
    sigma: Number(sigmaPrime.toFixed(5)),
    rounds: Number(safePlayer.rounds || 0) + results.length
  };
}

export function scenarioRating(difficulty = 5) {
  return Math.round(1000 + clamp(Number(difficulty), 1, 10) * 100);
}

export function evaluateDecisionOutcome(action, fused, scenarioDifficulty = 5, groundTruthLabel = fused.label) {
  const expectedAction = {
    CLEAR: 'HOLD',
    BLOCKED: 'REROUTE',
    UNRELIABLE: 'VERIFY',
    ANOMALY: 'REPORT',
    PRESENT: 'REPORT'
  }[groundTruthLabel];

  let correct = action === expectedAction;
  let rationale = correct
    ? 'Decision is consistent with the revealed ground-truth outcome.'
    : 'Decision does not match the exercise ground truth.';

  if (fused.abstain) {
    // In a training setting, explicit deferral is rewarded when the evidence
    // state is genuinely insufficient, regardless of the hidden outcome.
    correct = action === 'VERIFY';
    rationale = correct
      ? 'Appropriate abstention: evidence uncertainty justified verification.'
      : 'Evidence was insufficient; verification would have been the safer response.';
  }

  return {
    correct,
    score: correct ? 1 : 0,
    opponentRating: scenarioRating(scenarioDifficulty),
    rationale,
    brier: brierScore(fused.confidence / 100, correct)
  };
}

/* ----------------------------- Adaptation ------------------------------- */

export function adaptiveChoice(focus, history = {}, totalRounds = 1) {
  const templates = [
    { key: 'ALPHA-07', difficulty: 6, tags: ['decision tempo', 'stale-data handling'] },
    { key: 'CIPHER-11', difficulty: 8, tags: ['contradiction handling', 'team coordination', 'confidence calibration'] },
    { key: 'NORTHSTAR-03', difficulty: 3, tags: ['evidence corroboration', 'decision tempo'] }
  ];

  return templates.map(t => {
    const need = t.tags.reduce((s, tag) => s + (focus.includes(tag) ? 2 : 0.15), 0);
    const n = history[t.key] || 0;
    const exploration = Math.sqrt(Math.log(totalRounds + 1) / (n + 1));
    return { ...t, score: need + exploration };
  }).sort((a, b) => b.score - a.score)[0];
}

export async function sha256Fingerprint(payload) {
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let hash = 2166136261;
  for (const byte of encoded) hash = Math.imul(hash ^ byte, 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
