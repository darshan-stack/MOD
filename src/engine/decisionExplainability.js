/*
 * Sentinel Grid Ω — causal / counterfactual decision explainability
 *
 * Explainability is computed only from the evidence visible to the trainee.
 * Hidden ground truth is intentionally excluded.
 */

import { robustFuse } from './decisionIntelligence.js';

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, Number(v)));
}

function normalize(reports, selectedIds) {
  const ids = new Set(selectedIds || []);
  return reports.filter(r => ids.has(r.id) && r.topic === 'route_echo');
}

function summarize(report, baseline, counterfactual, mode) {
  const baselineProbability = Number(baseline.probability || 0);
  const counterProbability = Number(counterfactual.probability || 0);
  const impact = baseline.label === counterfactual.label
    ? baselineProbability - counterProbability
    : baselineProbability;
  return {
    id: report.id,
    source: report.source,
    stance: report.stance,
    confidence: Number(report.confidence || 0),
    freshness: Number(report.freshness || 0),
    trust: Number(report.trust || 0),
    mode,
    impact: Math.round(impact),
    sufficiencyDelta: Math.round(Number(baseline.sufficiency || 0) - Number(counterfactual.sufficiency || 0)),
    labelChanged: baseline.label !== counterfactual.label,
    abstentionChanged: Boolean(baseline.abstain) !== Boolean(counterfactual.abstain),
    counterfactualLabel: counterfactual.label,
    counterfactualProbability: Number(counterProbability.toFixed(2))
  };
}

export function explainDecision(reports = [], selectedIds = [], channelHealth = 1, history = {}) {
  const selected = normalize(reports, selectedIds);
  const baseline = robustFuse(selected, channelHealth, history);
  const selectedIdsSet = new Set(selected.map(r => r.id));

  const removal = selected.map(function(report) {
    const remaining = selected.filter(r => r.id !== report.id);
    const counterfactual = robustFuse(remaining, channelHealth, history);
    return summarize(report, baseline, counterfactual, 'REMOVAL');
  }).sort(function(a, b) {
    return Number(b.impact) - Number(a.impact) || Number(b.sufficiencyDelta) - Number(a.sufficiencyDelta);
  });

  const candidates = reports
    .filter(r => r.topic === 'route_echo' && !selectedIdsSet.has(r.id) && r.state !== 'dropped')
    .map(function(report) {
      const counterfactual = robustFuse(selected.concat(report), channelHealth, history);
      const labelFlip = baseline.label !== counterfactual.label;
      const abstentionFlip = Boolean(baseline.abstain) !== Boolean(counterfactual.abstain);
      const probabilityDelta = Number(counterfactual.probability || 0) - Number(baseline.probability || 0);
      return {
        ...summarize(report, baseline, counterfactual, 'ADDITION'),
        probabilityDelta: Math.round(probabilityDelta),
        labelChanged: labelFlip,
        abstentionChanged: abstentionFlip
      };
    })
    .sort(function(a, b) {
      return Number(b.labelChanged) - Number(a.labelChanged) ||
        Number(b.abstentionChanged) - Number(a.abstentionChanged) ||
        Math.abs(Number(b.probabilityDelta)) - Math.abs(Number(a.probabilityDelta));
    });

  const pivotal = removal[0] || null;
  const flipCandidate = candidates.find(x => x.labelChanged || x.abstentionChanged) || candidates[0] || null;

  let diagnosis = 'No route evidence selected; the trainer should seek corroboration before committing.';
  if (selected.length && baseline.abstain) {
    diagnosis = 'The selected evidence does not provide enough independent support for a committed route claim.';
  } else if (pivotal?.labelChanged) {
    diagnosis = 'The decision is fragile: removing one selected report changes the fused claim.';
  } else if (pivotal && Number(pivotal.impact) >= 20) {
    diagnosis = 'One source carries substantial decision leverage; seek an independent corroborating signal.';
  } else if (flipCandidate?.labelChanged) {
    diagnosis = 'An available report could materially change the fused claim; inspect it before committing.';
  } else if (baseline.label !== 'UNKNOWN') {
    diagnosis = 'The selected evidence is directionally coherent; the largest single-source leverage is shown below.';
  }

  return {
    baseline: {
      label: baseline.label,
      probability: Number(baseline.probability || 0),
      confidence: Number(baseline.confidence || 0),
      uncertainty: Number(baseline.uncertainty || 0),
      sufficiency: Number(baseline.sufficiency || 0),
      abstain: Boolean(baseline.abstain)
    },
    selectedCount: selected.length,
    independentSources: new Set(selected.map(r => r.source)).size,
    removal,
    additions: candidates,
    pivotal,
    flipCandidate,
    diagnosis,
    robustness: {
      fragile: Boolean(pivotal?.labelChanged || pivotal?.abstentionChanged),
      leverage: pivotal ? clamp(Number(pivotal.impact) / 100, 0, 1) * 100 : 0
    }
  };
}
