/*
 * Sentinel Grid Ω — procedural scenario DSL
 *
 * The DSL describes families of synthetic communication-degradation exercises.
 * Generation is deterministic for a seed and validates minimum training
 * constraints before a scenario is returned.
 */

const LABELS = ['CLEAR', 'BLOCKED', 'UNRELIABLE'];

export const SCENARIO_DSL = {
  version: '1.0',
  phases: [
    '01 / baseline',
    '02 / degraded information',
    '03 / cross-domain handoff',
    '04 / compound disruption'
  ],
  objectives: [
    'Maintain a coherent picture while reports diverge.',
    'Decide whether to commit, verify or defer as information quality falls.',
    'Coordinate a small team while domains disagree.',
    'Preserve evidence traceability during communications disruption.',
    'Separate high-confidence signals from high-quality evidence.'
  ],
  sources: [
    { name: 'Alpha 1-1', domain: 'LAND', baseReliability: 0.90 },
    { name: 'Echo 3', domain: 'EW', baseReliability: 0.82 },
    { name: 'Raven-2 / UAS', domain: 'AIR', baseReliability: 0.78 },
    { name: 'NetWatch', domain: 'CYBER', baseReliability: 0.74 },
    { name: 'Relay-5', domain: 'LAND', baseReliability: 0.68 },
    { name: 'Scout-4', domain: 'AIR', baseReliability: 0.71 }
  ],
  routeTopics: [
    { topic: 'route_echo', route: 'ECHO' },
    { topic: 'route_foxtrot', route: 'FOXTROT' },
    { topic: 'route_kestrel', route: 'KESTREL' }
  ],
  nonRouteTopics: [
    { topic: 'gnss_reliability', domain: 'EW', stance: 'UNRELIABLE' },
    { topic: 'credential_replay', domain: 'CYBER', stance: 'ANOMALY' },
    { topic: 'thermal_signature', domain: 'AIR', stance: 'PRESENT' }
  ],
  constraints: {
    minReports: 5,
    maxReports: 8,
    minIndependentRouteSources: 2,
    minRouteReports: 3
  }
};

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

function intRange(rng, min, max) {
  return Math.round(min + rng() * (max - min));
}

function makeTime(seconds) {
  const base = 14 * 3600 + 32 * 60;
  const total = base + Math.max(0, Math.floor(seconds));
  const hh = String(Math.floor(total / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return hh + ':' + mm + ':' + ss + 'Z';
}

function routeHeadline(label, stance) {
  if (label === 'ECHO') {
    return stance === 'CLEAR' ? 'Route ECHO is clear for movement' :
      stance === 'BLOCKED' ? 'Route ECHO may be obstructed' :
      'Route ECHO status cannot be verified';
  }
  if (label === 'FOXTROT') {
    return stance === 'CLEAR' ? 'Route FOXTROT is clear for movement' :
      stance === 'BLOCKED' ? 'Route FOXTROT obstruction reported' :
      'Route FOXTROT status is uncertain';
  }
  return stance === 'CLEAR' ? 'Route KESTREL is viable for movement' :
    stance === 'BLOCKED' ? 'Route KESTREL obstruction detected' :
    'Route KESTREL status is uncertain';
}

function routeDetail(source, stance, freshness, state) {
  const channel = source.domain === 'EW' ? 'cross-domain telemetry' :
    source.domain === 'AIR' ? 'sensor-derived feed' :
    source.domain === 'CYBER' ? 'network telemetry' : 'authenticated voice';
  const quality = freshness >= 75 ? 'current' : freshness >= 45 ? 'aging' : 'old';
  return source.name + ' via ' + channel + ' · evidence ' + quality + ' · state ' + state +
    (stance === 'BLOCKED' ? ' · obstruction indicator present' : '');
}

function reportState(freshness, conflictChance, rng) {
  if (rng() < 0.07) return 'dropped';
  if (rng() < conflictChance) return 'conflict';
  if (freshness < 36) return 'stale';
  return 'live';
}

export function validateScenario(scenario, dsl = SCENARIO_DSL) {
  if (!scenario || typeof scenario !== 'object') return { valid: false, errors: ['scenario missing'] };
  const errors = [];
  if (!scenario.key || !scenario.name || !scenario.routeTruth) errors.push('metadata incomplete');
  if (!LABELS.includes(scenario.routeTruth)) errors.push('routeTruth invalid');
  if (!Array.isArray(scenario.reports) || scenario.reports.length < dsl.constraints.minReports || scenario.reports.length > dsl.constraints.maxReports) {
    errors.push('report count outside DSL constraints');
  }
  const routeReports = (scenario.reports || []).filter(r => r.topic && r.topic.startsWith('route_'));
  const independent = new Set(routeReports.map(r => r.source));
  if (routeReports.length < dsl.constraints.minRouteReports) errors.push('insufficient route reports');
  if (independent.size < dsl.constraints.minIndependentRouteSources) errors.push('insufficient independent route sources');
  if (!Array.isArray(scenario.events) || !scenario.events.length) errors.push('event stream missing');
  return { valid: errors.length === 0, errors };
}

export function generateScenario({ seed = 20261005, difficulty = 6, variant = 0 } = {}) {
  const rng = seeded(Number(seed) + Number(variant || 0) * 7919);
  const dsl = SCENARIO_DSL;
  const level = Math.round(clamp(difficulty / 10, 0.1, 1) * 10);
  const route = pick(rng, dsl.routeTopics);
  const truth = pick(rng, LABELS);

  const comms = intRange(rng, 12 + level * 3, 28 + level * 6);
  const latency = intRange(rng, 20 + level * 4, 45 + level * 8);
  const dropout = intRange(rng, 5 + level * 2, 14 + level * 4);
  const conflict = intRange(rng, 6 + level * 2, 18 + level * 6);
  const reportCount = intRange(rng, dsl.constraints.minReports, dsl.constraints.maxReports);

  const routeSources = dsl.sources.slice();
  for (let i = routeSources.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = routeSources[i];
    routeSources[i] = routeSources[j];
    routeSources[j] = tmp;
  }
  const selectedRouteSources = routeSources.slice(0, 4);
  const reports = [];
  selectedRouteSources.forEach(function(source, index) {
    const correct = index === 0 || rng() > (0.14 + level * 0.025);
    const stance = correct ? truth : pick(rng, LABELS.filter(x => x !== truth));
    const freshness = intRange(rng, Math.max(20, 92 - level * 5), 98);
    const confidence = intRange(rng, correct ? 68 : 52, correct ? 96 : 84);
    const state = reportState(freshness, clamp(conflict / 100), rng);
    reports.push({
      id: 'P-' + String(index + 1).padStart(3, '0'),
      time: makeTime(index * intRange(rng, 22, 61)),
      source: source.name,
      domain: source.domain,
      topic: route.topic,
      stance,
      headline: routeHeadline(route.route, stance),
      detail: routeDetail(source, stance, freshness, state),
      confidence,
      freshness,
      state,
      truth: stance === truth ? 'SUPPORTED' : 'CONTRADICTORY',
      corroborated: Math.max(1, Math.min(3, intRange(rng, 1, 3))),
      icon: state === 'conflict' ? '↯' : state === 'stale' ? '◷' : '⌁'
    });
  });

  while (reports.length < reportCount) {
    const source = pick(rng, dsl.sources);
    const topic = pick(rng, dsl.nonRouteTopics);
    const freshness = intRange(rng, 35, 96);
    const confidence = intRange(rng, 44, 86);
    const state = reportState(freshness, clamp(conflict / 130), rng);
    reports.push({
      id: 'P-' + String(reports.length + 1).padStart(3, '0'),
      time: makeTime(reports.length * intRange(rng, 19, 57)),
      source: source.name,
      domain: topic.domain,
      topic: topic.topic,
      stance: topic.stance,
      headline: topic.topic === 'gnss_reliability' ? 'GNSS reference quality degraded' :
        topic.topic === 'credential_replay' ? 'Possible credential replay on logistics node' :
          'Thermal signature detected near synthetic objective',
      detail: source.name + ' · synthetic ' + topic.topic.replaceAll('_', ' ') + ' · review source age and corroboration',
      confidence,
      freshness,
      state,
      truth: 'SUPPORTED',
      corroborated: Math.max(1, Math.min(2, intRange(rng, 1, 2))),
      icon: topic.domain === 'CYBER' ? '◇' : topic.domain === 'EW' ? '▧' : '◌'
    });
  }

  reports.sort((a, b) => a.time.localeCompare(b.time));
  const seedText = String(Number(seed) >>> 0).padStart(10, '0');
  const suffix = seedText.slice(-4);
  const key = 'PROC-' + suffix;
  const name = key + ' · ' + route.route.toLowerCase() + ' stress case';
  const phase = pick(rng, dsl.phases);
  const objective = pick(rng, dsl.objectives);

  const scenario = {
    key,
    name,
    phase,
    objective,
    difficulty: level,
    comms,
    latency,
    dropout,
    conflict,
    routeTruth: truth,
    generated: true,
    generation: {
      dslVersion: dsl.version,
      seed: Number(seed) >>> 0,
      variant: Number(variant || 0),
      generator: 'sentinel-grid-procedural'
    },
    reports,
    events: [
      { at: 0, tag: 'SYSTEM', text: 'Procedural scenario ' + key + ' generated from DSL v' + dsl.version + '. Ground truth is UI-hidden until AAR.' },
      { at: intRange(rng, 42, 88), tag: 'LAND', text: 'Primary route evidence entered the synthetic information stream.' },
      { at: intRange(rng, 102, 168), tag: 'EW', text: 'Communication degradation crossed the synthetic threshold.' },
      { at: intRange(rng, 182, 236), tag: 'CYBER', text: 'Cross-domain information consistency check required.' }
    ]
  };

  const validation = validateScenario(scenario);
  if (!validation.valid) {
    throw new Error('Procedural scenario constraint failure: ' + validation.errors.join(', '));
  }

  return scenario;
}
