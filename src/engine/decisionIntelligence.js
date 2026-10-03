
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

export function exponentialFreshness(ageSeconds, halfLife = 90) {
  return clamp(Math.exp(-Math.max(0, ageSeconds) * Math.log(2) / halfLife));
}

export function betaReliability(alpha = 2, beta = 1) {
  return clamp(alpha / Math.max(alpha + beta, 1));
}

export function sourceReliability(report, history = {}) {
  const h = history[report.source] || { supported: 2, contradicted: 1 };
  const prior = betaReliability(h.supported + 2, h.contradicted + 1);
  const freshness = report.freshness / 100;
  const confidence = report.confidence / 100;
  const corroboration = clamp(report.corroborated / 3);
  return clamp(0.45 * prior + 0.25 * freshness + 0.20 * confidence + 0.10 * corroboration);
}

export function evidenceWeight(report, channelHealth = 1, history = {}) {
  return clamp(sourceReliability(report, history) * (report.freshness / 100) * channelHealth);
}

export function conflictIndex(reports) {
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
          const aw = evidenceWeight(a);
          const bw = evidenceWeight(b);
          total += clamp(Math.min(aw, bw) * 1.7);
          pairs += 1;
        }
      }
    }
  });
  return pairs ? clamp(total / pairs) : 0;
}

export function robustFuse(reports, channelHealth = 1, history = {}) {
  if (!reports.length) {
    return { label: 'UNKNOWN', confidence: 0, conflict: 0, sufficiency: 0, abstain: true, contributors: [] };
  }
  const weighted = reports.map(r => ({
    report: r,
    weight: evidenceWeight(r, channelHealth, history),
    score: clamp((r.confidence / 100) * (r.freshness / 100))
  })).sort((a, b) => b.weight - a.weight);

  const labels = [...new Set(weighted.map(x => x.report.stance || 'UNKNOWN'))];
  const owa = [0.50, 0.30, 0.20, 0.10];
  const labelScores = {};
  labels.forEach(label => { labelScores[label] = 0; });

  weighted.forEach((item, index) => {
    const w = owa[index] || (1 / Math.max(weighted.length, 1));
    const label = item.report.stance || 'UNKNOWN';
    labelScores[label] += w * item.score;
  });

  const total = Object.values(labelScores).reduce((a, b) => a + b, 0) || 1;
  const normalized = Object.fromEntries(Object.entries(labelScores).map(([k, v]) => [k, v / total]));
  const best = Object.entries(normalized).sort((a, b) => b[1] - a[1])[0];
  const conflict = conflictIndex(reports);
  const independentSources = new Set(reports.map(r => r.source)).size;
  const sufficiency = clamp(0.48 * best[1] + 0.22 * Math.min(independentSources / 2, 1) + 0.30 * (1 - conflict));
  return {
    label: best[0],
    confidence: Math.round(best[1] * 100),
    conflict: Math.round(conflict * 100),
    sufficiency: Math.round(sufficiency * 100),
    abstain: best[1] < 0.67 || conflict > 0.36 || independentSources < 2,
    contributors: weighted.slice(0, 4).map(x => ({ id: x.report.id, weight: Math.round(x.weight * 100), score: Math.round(x.score * 100) }))
  };
}

export function informationIntegrityIndex(reports, networkHealth, latency, dropout, conflictPressure) {
  if (!reports.length) return 0;
  const avgFresh = reports.reduce((a, r) => a + r.freshness, 0) / reports.length;
  const avgTrust = reports.reduce((a, r) => a + sourceReliability(r) * 100, 0) / reports.length;
  const networkPenalty = (100 - networkHealth) * 0.32;
  const latencyPenalty = Math.min(latency, 100) * 0.16;
  const dropoutPenalty = dropout * 0.18;
  const conflictPenalty = conflictPressure * 0.20;
  return Math.round(clamp(avgFresh * 0.22 + avgTrust * 0.22 + 100 - networkPenalty - latencyPenalty - dropoutPenalty - conflictPenalty, 0, 100));
}

export function calibrationGap(decisions, reports) {
  if (!decisions.length) return 0;
  const gaps = decisions.map(d => {
    const evidence = (d.evidence || []).map(id => reports.find(r => r.id === id)).filter(Boolean);
    const support = evidence.length
      ? evidence.reduce((a, r) => a + sourceReliability(r) * 100, 0) / evidence.length
      : 0;
    return Math.abs(Number(d.confidence) - support);
  });
  return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
}

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
