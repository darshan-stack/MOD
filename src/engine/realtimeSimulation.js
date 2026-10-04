// Real-time, deterministic exercise orchestration for Sentinel Grid Omega.
// This is a synthetic training model: it changes information availability and
// communication conditions; it does not model or control real-world systems.

export const SIMULATION_PLANS = {
  "ALPHA-07": [
    { id: "alpha-delay", at: 12, kind: "delay", title: "AIR ISR latency", summary: "Raven-2 feed begins arriving late; freshness decays faster." },
    { id: "alpha-conflict", at: 28, kind: "conflict", title: "Route ECHO conflict", summary: "A second report disputes the previously trusted route status." },
    { id: "alpha-dropout", at: 48, kind: "dropout", title: "NETWATCH node loss", summary: "Cyber reporting node drops; last-known information is retained." },
    { id: "alpha-split", at: 68, kind: "split", title: "Team network split", summary: "Cross-cell coordination is degraded and messages may be delayed." },
    { id: "alpha-stale", at: 88, kind: "stale", title: "ISR freshness collapse", summary: "The oldest air report crosses the decision window." }
  ],
  "CIPHER-11": [
    { id: "cipher-conflict", at: 10, kind: "conflict", title: "Cross-domain disagreement", summary: "Land and EW indicators disagree on Route ECHO." },
    { id: "cipher-delay", at: 24, kind: "delay", title: "Telemetry latency surge", summary: "Air telemetry latency increases and source freshness falls." },
    { id: "cipher-dropout", at: 42, kind: "dropout", title: "Cyber node dropout", summary: "NetWatch becomes unreachable while the last packet remains visible." },
    { id: "cipher-split", at: 62, kind: "split", title: "Command-net partition", summary: "Team messages may not reach every seat immediately." },
    { id: "cipher-stale", at: 82, kind: "stale", title: "Aged ISR picture", summary: "The primary air picture becomes stale at a critical decision point." }
  ],
  "NORTHSTAR-03": [
    { id: "north-delay", at: 18, kind: "delay", title: "First latency pulse", summary: "A low-level delay introduces the first information-age problem." },
    { id: "north-stale", at: 38, kind: "stale", title: "Freshness decay", summary: "The air report passes the normal freshness threshold." },
    { id: "north-conflict", at: 58, kind: "conflict", title: "Conflicting route report", summary: "A new relay disputes the baseline route picture." },
    { id: "north-dropout", at: 78, kind: "dropout", title: "Support node dropout", summary: "A supporting information source goes offline." }
  ]
};

export function simulationPlan(key) {
  return SIMULATION_PLANS[key] || SIMULATION_PLANS["ALPHA-07"];
}

export function nextSimulationEvents(key, elapsed, triggered = []) {
  const seen = new Set(triggered);
  return simulationPlan(key).filter(event => event.at <= elapsed && !seen.has(event.id));
}

export function simulationProgress(key, elapsed) {
  const plan = simulationPlan(key);
  const completed = plan.filter(event => event.at <= elapsed).length;
  const next = plan.find(event => event.at > elapsed);
  return {
    total: plan.length,
    completed,
    percent: plan.length ? Math.round((completed / plan.length) * 100) : 0,
    next
  };
}
