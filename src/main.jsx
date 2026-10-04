
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { adaptiveChoice, calibrationGap as computeCalibrationGap, informationIntegrityIndex, robustFuse, sha256Fingerprint, defaultGlicko2, glicko2Update, calibrationSummary, evaluateDecisionOutcome, updateSourceHistory, sourceReliability, brierScore } from './engine/decisionIntelligence';
import { runBenchmark, benchmarkHeadline } from './engine/benchmark';
import { runResilienceBenchmark } from './engine/resilienceLab';
import { explainDecision } from './engine/decisionExplainability';
import { generateScenario } from './engine/scenarioGenerator';

const SCENARIOS = {
  "ALPHA-07": { name: 'ALPHA-07 · Contested Approach', phase: '02 / degraded information', objective: 'Maintain a coherent picture while reports diverge.', difficulty: 6, comms: 42, latency: 68, dropout: 21, conflict: 28, routeTruth: 'CLEAR' },
  "CIPHER-11": { name: 'CIPHER-11 · Network Fracture', phase: '03 / cross-domain handoff', objective: 'Coordinate a small team while cyber and EW indicators disagree.', difficulty: 8, comms: 58, latency: 92, dropout: 36, conflict: 46, routeTruth: 'BLOCKED' },
  "NORTHSTAR-03": { name: 'NORTHSTAR-03 · Quiet Window', phase: '01 / baseline', objective: 'Build a reliable baseline before the information picture degrades.', difficulty: 3, comms: 16, latency: 28, dropout: 7, conflict: 8, routeTruth: 'CLEAR' }
};

const BASE_REPORTS = [
  { id: 'R-701', time: '14:32:08Z', source: 'Raven-2 / UAS', domain: 'AIR', topic: 'kestrel_presence', stance: 'PRESENT', headline: 'Two thermal signatures near OBJ KESTREL', detail: 'Vector 118° · low-confidence due to feed age', confidence: 72, freshness: 38, state: 'stale', truth: 'STALE', corroborated: 1, icon: '◌' },
  { id: 'R-702', time: '14:34:41Z', source: 'Alpha 1-1', domain: 'LAND', topic: 'route_echo', stance: 'CLEAR', headline: 'Route ECHO is clear for movement', detail: 'Authenticated voice report · route status current', confidence: 86, freshness: 91, state: 'live', truth: 'SUPPORTED', corroborated: 2, icon: '⌁' },
  { id: 'R-703', time: '14:35:03Z', source: 'NetWatch', domain: 'CYBER', topic: 'credential_replay', stance: 'ANOMALY', headline: 'Possible credential replay on logistics node', detail: 'Corroboration pending · low-frequency anomaly', confidence: 58, freshness: 86, state: 'live', truth: 'SUPPORTED', corroborated: 1, icon: '◇' },
  { id: 'R-704', time: '14:35:17Z', source: 'Echo 3', domain: 'EW', topic: 'gnss_reliability', stance: 'UNRELIABLE', headline: 'GNSS drift detected. Position unreliable.', detail: '2 km radius uncertainty · alternate reference required', confidence: 91, freshness: 94, state: 'jammed', truth: 'SUPPORTED', corroborated: 2, icon: '▧' }
];

const BASE_EVENTS = [
  { at: 0, tag: 'SYSTEM', text: 'Exercise clock started · information integrity ledger active.' },
  { at: 58, tag: 'AIR', text: 'Raven-2 report received with 90 sec effective age.' },
  { at: 152, tag: 'LAND', text: 'Alpha 1-1 authenticated on primary voice net.' },
  { at: 189, tag: 'EW', text: 'GNSS degradation crossed amber threshold.' }
];

const DECISION_TYPES = ['HOLD', 'REROUTE', 'REPORT', 'VERIFY'];

const cloneReports = () => BASE_REPORTS.map(function(r) { return { ...r }; });
const clamp = function(v, min, max) { min = min === undefined ? 0 : min; max = max === undefined ? 100 : max; return Math.max(min, Math.min(max, Number(v))); };
const fmtClock = function(seconds) {
  var s = Math.max(0, Math.floor(seconds));
  var hh = String(Math.floor(s / 3600)).padStart(2, '0');
  var mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  var ss = String(s % 60).padStart(2, '0');
  return hh + ':' + mm + ':' + ss;
};
let idCounter = 0;
const makeId = function(prefix) {
  if (globalThis.crypto?.randomUUID) return prefix + '-' + globalThis.crypto.randomUUID();
  idCounter += 1;
  return prefix + '-' + Date.now().toString(36) + '-' + idCounter.toString(36);
};
const escapeHtml = function(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};
const downloadBlob = function(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
};
const trustScore = function(r) {
  var base = r.confidence * 0.52 + r.freshness * 0.28 + Math.min(r.corroborated, 3) * 6.5;
  var penalty = r.state === 'conflict' ? 18 : r.state === 'dropped' ? 28 : 0;
  return clamp(Math.round(base - penalty));
};

function App() {
  const [activeTab, setActiveTab] = useState('cockpit');
  const [mode, setMode] = useState('trainee');
  const [scenarioKey, setScenarioKey] = useState('ALPHA-07');
  const [scenarioDifficulty, setScenarioDifficulty] = useState(SCENARIOS['ALPHA-07'].difficulty);
  const [generatedScenario, setGeneratedScenario] = useState(null);
  const [running, setRunning] = useState(true);
  const [elapsed, setElapsed] = useState(1122);
  const [reports, setReports] = useState(cloneReports);
  const [events, setEvents] = useState(BASE_EVENTS);
  const [decisions, setDecisions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([
    { id: 'you', initials: 'AM', name: 'You / OC', role: 'ALPHA CELL', status: 'online' },
    { id: 'rao', initials: 'KR', name: 'K. Rao', role: 'ALPHA 1-1', status: 'online' },
    { id: 'singh', initials: 'DS', name: 'D. Singh', role: 'RAVEN-2', status: 'online' },
    { id: 'patel', initials: 'NP', name: 'N. Patel', role: 'NETWATCH', status: 'degraded' }
  ]);
  const [activeSeat, setActiveSeat] = useState('you');
  const [selectedDomain, setSelectedDomain] = useState('ALL');
  const [selectedEvidence, setSelectedEvidence] = useState(['R-701']);
  const [decisionType, setDecisionType] = useState('VERIFY');
  const [decisionText, setDecisionText] = useState('');
  const [confidence, setConfidence] = useState(64);
  const [messageText, setMessageText] = useState('');
  const [netHealth, setNetHealth] = useState(58);
  const [latency, setLatency] = useState(68);
  const [dropout, setDropout] = useState(21);
  const [conflict, setConflict] = useState(28);
  const [freshnessDecay, setFreshnessDecay] = useState(34);
  const [teamChannelDegraded, setTeamChannelDegraded] = useState(true);
  const [replayAt, setReplayAt] = useState(elapsed);
  const [ledgerFingerprint, setLedgerFingerprint] = useState('PENDING');
  const [benchmarkRun, setBenchmarkRun] = useState(1);
  const [resilienceRun, setResilienceRun] = useState(1);
  const resilience = useMemo(function() {
    return runResilienceBenchmark({ runsPerAttack: 40, seed: 20261004 + resilienceRun - 1 });
  }, [resilienceRun]);
  const [exerciseHistory, setExerciseHistory] = useState(function() {
    try { return JSON.parse(localStorage.getItem('sentinel-grid-exercise-history') || 'null') || {}; } catch (_) { return {}; }
  });
  const benchmark = useMemo(function() { return runBenchmark({ runsPerCondition: 100, seed: 20261003 + benchmarkRun - 1 }); }, [benchmarkRun]);
  const benchmarkSummary = useMemo(function() { return benchmarkHeadline(benchmark); }, [benchmark]);
  const [skill, setSkill] = useState(function() {
    try { return JSON.parse(localStorage.getItem('sentinel-grid-glicko2') || 'null') || defaultGlicko2(); } catch (_) { return defaultGlicko2(); }
  });
  const [sourceHistory, setSourceHistory] = useState(function() {
    try { return JSON.parse(localStorage.getItem('sentinel-grid-source-history') || 'null') || {}; } catch (_) { return {}; }
  });
  const channelRef = useRef(null);
  const sessionIdRef = useRef(makeId('TAB'));
  const elapsedRef = useRef(elapsed);

  const scenario = useMemo(function() {
    var base = generatedScenario || SCENARIOS[scenarioKey];
    return { ...base, difficulty: scenarioDifficulty };
  }, [scenarioKey, scenarioDifficulty, generatedScenario]);
  const routeEvidence = useMemo(function() { return reports.filter(function(r) { return r.topic === 'route_echo'; }); }, [reports]);
  const fusedRoute = useMemo(function() { return robustFuse(routeEvidence, netHealth / 100, sourceHistory); }, [routeEvidence, netHealth, sourceHistory]);
  const explainability = useMemo(function() {
    return explainDecision(reports, selectedEvidence, netHealth / 100, sourceHistory);
  }, [reports, selectedEvidence, netHealth, sourceHistory]);
  const integrityIndex = useMemo(function() { return informationIntegrityIndex(reports, netHealth, latency, dropout, conflict, sourceHistory); }, [reports, netHealth, latency, dropout, conflict, sourceHistory]);
  const confidenceGap = useMemo(function() { return computeCalibrationGap(decisions, reports, sourceHistory); }, [decisions, reports, sourceHistory]);
  const calibration = useMemo(function() { return calibrationSummary(decisions); }, [decisions]);

  useEffect(function() {
    if (!running) return undefined;
    var timer = setInterval(function() { setElapsed(function(v) { return v + 1; }); }, 1000);
    return function() { clearInterval(timer); };
  }, [running]);

  useEffect(function() { elapsedRef.current = elapsed; setReplayAt(elapsed); }, [elapsed]);
  useEffect(function() { try { localStorage.setItem('sentinel-grid-glicko2', JSON.stringify(skill)); } catch (_) {} }, [skill]);
  useEffect(function() { try { localStorage.setItem('sentinel-grid-source-history', JSON.stringify(sourceHistory)); } catch (_) {} }, [sourceHistory]);
  useEffect(function() { try { localStorage.setItem('sentinel-grid-exercise-history', JSON.stringify(exerciseHistory)); } catch (_) {} }, [exerciseHistory]);
  useEffect(function() { sha256Fingerprint({ scenarioKey: scenarioKey, scenarioGeneration: scenario.generation || null, reports: reports, decisions: decisions, events: events, messages: messages }).then(function(hash) { setLedgerFingerprint(hash.slice(0, 24).toUpperCase()); }); }, [scenarioKey, scenario.generation, reports, decisions, events, messages]);

  useEffect(function() {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    var channel = new BroadcastChannel('sentinel-grid-room');
    channelRef.current = channel;
    channel.onmessage = function(event) {
      var p = event.data || {};
      if (p.origin === sessionIdRef.current) return;
      if (p.type === 'SCENARIO') {
        loadScenario(p.key, true);
      }
      if (p.type === 'PROCEDURAL_SCENARIO' && p.scenario) {
        loadGeneratedScenario(p.scenario, true);
      }
      if (p.type === 'INJECT') {
        inject(p.kind, true);
      }
      if (p.type === 'JOIN') {
        setMembers(function(current) {
          if (current.some(function(m) { return m.id === p.member.id; })) return current;
          return current.concat(p.member);
        });
      }
      if (p.type === 'TEAM_MESSAGE') {
        setMessages(function(current) { return current.some(function(m) { return m.id === p.message.id; }) ? current : [p.message].concat(current); });
      }
      if (p.type === 'DECISION') {
        setDecisions(function(current) { return current.some(function(d) { return d.id === p.decision.id; }) ? current : [p.decision].concat(current); });
      }
      if (p.type === 'EVENT') {
        setEvents(function(current) { return current.concat(p.event); });
      }
    };
    return function() { channel.close(); };
  }, []);

  const broadcast = function(payload) {
    if (channelRef.current) channelRef.current.postMessage({ ...payload, origin: sessionIdRef.current });
  };

  const addEvent = function(tag, text, shouldBroadcast) {
    var event = { at: elapsedRef.current, tag: tag, text: text };
    setEvents(function(current) { return current.concat(event); });
    if (shouldBroadcast !== false) broadcast({ type: 'EVENT', event: event });
  };

  const visibleReports = useMemo(function() {
    return selectedDomain === 'ALL' ? reports : reports.filter(function(r) { return r.domain === selectedDomain; });
  }, [reports, selectedDomain]);

  const trustRows = useMemo(function() {
    return reports.map(function(r) {
      return { ...r, trust: trustScore(r), learned: Math.round(sourceReliability(r, sourceHistory) * 100) };
    }).sort(function(a, b) { return b.trust - a.trust; });
  }, [reports, sourceHistory]);

  const metrics = useMemo(function() {
    var count = decisions.length;
    var avgConfidence = count ? Math.round(decisions.reduce(function(a, d) { return a + Number(d.confidence); }, 0) / count) : 0;
    var scored = calibrationSummary(decisions);
    var evidenceCoverage = count ? Math.round(decisions.reduce(function(a, d) { return a + Math.min((d.evidence || []).length / 3, 1); }, 0) / count * 100) : 0;
    var contradictionUse = reports.some(function(r) { return r.state === 'conflict'; })
      ? clamp(52 + decisions.filter(function(d) { return (d.evidence || []).some(function(id) { var r = reports.find(function(x) { return x.id === id; }); return r && r.state === 'conflict'; }); }).length * 13)
      : 76;
    var teamCoherence = clamp(Math.round(netHealth * 0.45 + (100 - dropout) * 0.25 + (messages.length > 3 ? 25 : 15)));
    return { count: count, avgConfidence: avgConfidence, evidenceCoverage: evidenceCoverage, contradictionUse: contradictionUse, teamCoherence: teamCoherence, brier: scored.brier, accuracy: scored.accuracy, skillRating: Math.round(skill.rating), skillRd: Math.round(skill.rd) };
  }, [decisions, reports, netHealth, dropout, messages.length, skill]);

  const focus = useMemo(function() {
    var out = [];
    if (decisions.some(function(d) { return (d.evidence || []).some(function(id) { var r = reports.find(function(x) { return x.id === id; }); return r && r.state === 'stale'; }); })) out.push('stale-data handling');
    if (reports.some(function(r) { return r.state === 'conflict'; })) out.push('contradiction handling');
    if (decisions.some(function(d) { return d.confidence > 80 && d.action === 'HOLD'; })) out.push('confidence calibration');
    if (decisions.length < 2) out.push('decision tempo');
    return out.length ? out : ['evidence corroboration'];
  }, [decisions, reports]);

  const inject = function(kind, remote) {
    remote = Boolean(remote);
    if (kind === 'delay') {
      setLatency(function(v) { return clamp(v + 18); });
      setFreshnessDecay(function(v) { return clamp(v + 10); });
      setReports(function(current) { return current.map(function(r) { return r.domain === 'AIR' ? { ...r, freshness: clamp(r.freshness - 14), state: clamp(r.freshness - 14) < 40 ? 'stale' : r.state } : r; }); });
      addEvent('INJECT', 'ISR feed delayed. Freshness decay accelerated.', false);
    }
    if (kind === 'dropout') {
      setDropout(function(v) { return clamp(v + 14); });
      setNetHealth(function(v) { return clamp(v - 13); });
      setMembers(function(current) { return current.map(function(m) { return m.id === 'patel' ? { ...m, status: 'offline' } : m; }); });
      setReports(function(current) { return current.map(function(r) { return r.id === 'R-703' ? { ...r, state: 'dropped', detail: 'Source unreachable · last packet retained locally' } : r; }); });
      addEvent('INJECT', 'NETWATCH node dropped. Last-known data retained.', false);
    }
    if (kind === 'conflict') {
      setConflict(function(v) { return clamp(v + 16); });
      setReports(function(current) {
        var exists = current.some(function(r) { return r.id === 'R-705'; });
        var next = current.map(function(r) { return r.id === 'R-702' ? { ...r, state: 'conflict', confidence: 42, headline: 'CONFLICT: Route ECHO status disputed', detail: 'Echo 3 voice report contradicts the earlier route status', corroborated: 3 } : r; });
        if (!exists) next.push({ id: 'R-705', time: '14:36:02Z', source: 'Echo 3 / LAND RELAY', domain: 'EW', topic: 'route_echo', stance: 'BLOCKED', headline: 'Route ECHO may be obstructed', detail: 'Independent report disagrees with Alpha 1-1', confidence: 61, freshness: 89, state: 'conflict', truth: 'CONTRADICTORY', corroborated: 1, icon: '↯' });
        return next;
      });
      addEvent('INJECT', 'High-conflict evidence pair injected: same claim, opposing stances.', false);
    }
    if (kind === 'stale') {
      setFreshnessDecay(function(v) { return clamp(v + 18); });
      setReports(function(current) { return current.map(function(r) { return r.id === 'R-701' ? { ...r, state: 'stale', freshness: 19, detail: 'Effective age 3m 12s · review before relying on it' } : r; }); });
      addEvent('INJECT', 'Raven-2 feed aged beyond the normal decision window.', false);
    }
    if (kind === 'split') {
      setTeamChannelDegraded(true);
      setDropout(function(v) { return clamp(v + 18); });
      setNetHealth(function(v) { return clamp(v - 18); });
      addEvent('INJECT', 'Team channel split. Cross-cell transmissions may be delayed or dropped.', false);
    }
    if (!remote) broadcast({ type: 'INJECT', kind: kind });
  };

  const loadGeneratedScenario = function(s, remote) {
    remote = Boolean(remote);
    if (!s) return;
    setGeneratedScenario(s);
    setScenarioKey(s.key);
    setScenarioDifficulty(s.difficulty);
    setSelectedEvidence([]);
    setDecisionText('');
    setTeamChannelDegraded(s.dropout >= 20 || s.comms >= 40);
    setNetHealth(100 - s.comms);
    setLatency(s.latency);
    setDropout(s.dropout);
    setConflict(s.conflict);
    setFreshnessDecay(Math.round((s.latency + s.conflict) / 4));
    setReports(s.reports.map(function(r) { return { ...r }; }));
    setDecisions([]);
    setMessages([]);
    setElapsed(0);
    setReplayAt(0);
    setRunning(true);
    setExerciseHistory(function(current) { return { ...current, [s.key]: Number(current[s.key] || 0) + 1 }; });
    setEvents(s.events.map(function(e) { return { ...e }; }));
    if (!remote) broadcast({ type: 'PROCEDURAL_SCENARIO', scenario: s });
  };

  const loadScenario = function(key, remote) {
    remote = Boolean(remote);
    var s = SCENARIOS[key];
    setGeneratedScenario(null);
    setScenarioKey(key);
    setScenarioDifficulty(s.difficulty);
    setSelectedEvidence([]);
    setDecisionText('');
    setTeamChannelDegraded(s.dropout >= 20 || s.comms >= 40);
    setNetHealth(100 - s.comms);
    setLatency(s.latency);
    setDropout(s.dropout);
    setConflict(s.conflict);
    setFreshnessDecay(Math.round((s.latency + s.conflict) / 4));
    setReports(cloneReports());
    setDecisions([]);
    setMessages([]);
    setElapsed(0);
    setReplayAt(0);
    setRunning(true);
    setExerciseHistory(function(current) { return { ...current, [key]: Number(current[key] || 0) + 1 }; });
    setEvents([{ at: 0, tag: 'SYSTEM', text: 'Loaded ' + s.name + '. Ground truth is UI-hidden until AAR.' }]);
    if (!remote) broadcast({ type: 'SCENARIO', key: key });
  };

  const toggleEvidence = function(id) {
    setSelectedEvidence(function(current) {
      return current.indexOf(id) >= 0 ? current.filter(function(x) { return x !== id; }) : current.concat(id);
    });
  };

  const logDecision = function() {
    if (!decisionText.trim()) return;
    var currentActor = members.find(function(m) { return m.id === activeSeat; }) || members[0];
    var selectedReports = reports.filter(function(r) { return selectedEvidence.indexOf(r.id) >= 0; });
    var decisionReports = selectedReports.filter(function(r) { return r.topic === 'route_echo'; });
    var evidenceState = robustFuse(decisionReports, netHealth / 100, sourceHistory);
    var decisionExplainability = explainDecision(reports, selectedEvidence, netHealth / 100, sourceHistory);
    var outcome = evaluateDecisionOutcome(decisionType, evidenceState, scenario.difficulty, scenario.routeTruth);
    var d = {
      id: makeId('D'),
      at: elapsed,
      actor: activeSeat === 'you' ? 'You / OC' : currentActor.name,
      role: currentActor.role,
      action: decisionType,
      rationale: decisionText.trim(),
      confidence: Number(confidence),
      evidence: selectedEvidence.slice(),
      fusedClaim: evidenceState.label,
      belief: evidenceState.belief,
      disbelief: evidenceState.disbelief,
      uncertainty: evidenceState.uncertainty,
      sufficiency: evidenceState.sufficiency,
      correct: outcome.correct,
      brier: brierScore(Number(confidence) / 100, outcome.correct),
      itemRating: outcome.opponentRating,
      explainability: decisionExplainability
    };
    setDecisions(function(current) { return [d].concat(current); });
    setSourceHistory(function(current) {
      return decisionReports.reduce(function(history, report) {
        var supported = report.topic === 'route_echo'
          ? report.stance === scenario.routeTruth
          : report.truth === 'SUPPORTED';
        return updateSourceHistory(history, report, supported);
      }, current);
    });
    if (activeSeat === 'you') {
      setSkill(function(current) {
        return glicko2Update(current, [{ opponentRating: d.itemRating, opponentRd: 120, score: outcome.score }]);
      });
    }
    addEvent('DECISION', d.id + ' · ' + d.action + ' logged with ' + d.evidence.length + ' evidence item(s) · ' + (outcome.correct ? 'PASS' : 'REVIEW') + '.');
    broadcast({ type: 'DECISION', decision: d });
    setDecisionText('');
    setSelectedEvidence([]);
  };

  const sendMessage = function() {
    if (!messageText.trim()) return;
    var currentActor = members.find(function(m) { return m.id === activeSeat; }) || members[0];
    var msg = {
      id: makeId('M'),
      at: elapsed,
      actor: activeSeat === 'you' ? 'You / OC' : currentActor.name,
      initials: currentActor.initials,
      text: messageText.trim()
    };
    setMessages(function(current) { return [msg].concat(current); });
    addEvent('TEAM', msg.actor + ' → ALPHA CELL: ' + msg.text);
    broadcast({ type: 'TEAM_MESSAGE', message: msg });
    setMessageText('');
  };

  const generateNextExercise = function() {
    var roundsObserved = Object.values(exerciseHistory).reduce(function(sum, count) { return sum + Number(count || 0); }, 0);
    var nextChoice = adaptiveChoice(focus, exerciseHistory, Math.max(roundsObserved + 1, decisions.length + 1));
    var targetDifficulty = clamp(nextChoice.difficulty + focus.length - 1, 1, 10);
    var generated = generateScenario({
      seed: 20261005 + roundsObserved,
      difficulty: targetDifficulty,
      variant: decisions.length + focus.length
    });
    generated.events = generated.events.concat({
      at: 248,
      tag: 'ADAPT',
      text: 'Adaptive Director selected a procedural variant focused on ' + focus.join(', ') + ' at difficulty ' + targetDifficulty + '/10.'
    });
    loadGeneratedScenario(generated, false);
  };

  const joinSeat = function(member) {
    setActiveSeat(member.id);
    var updated = { ...member, status: 'online' };
    setMembers(function(current) { return current.map(function(m) { return m.id === member.id ? updated : m; }); });
    broadcast({ type: 'JOIN', member: updated });
  };

  const exportVisualizationBundle = function() {
    var payload = {
      schema: 'sentinel-grid-viz/v1',
      exportedAt: new Date().toISOString(),
      exercise: { key: scenarioKey, name: scenario.name, difficulty: scenario.difficulty },
      network: { netHealth: netHealth, latency: latency, dropout: dropout, conflict: conflict, freshnessDecay: freshnessDecay },
      fusedRoute: fusedRoute,
      reports: reports,
      events: events.slice().sort(function(a, b) { return a.at - b.at; }),
      decisions: decisions.slice().sort(function(a, b) { return a.at - b.at; }),
      note: 'Synthetic visualization bundle; not operational data.'
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'sentinel-grid-viz.json');
  };

  const exportAAR = function(format) {
    var payload = {
      product: 'Sentinel Grid Omega',
      exercise: scenario.name,
      exportedAt: new Date().toISOString(),
      durationSeconds: elapsed,
      network: { netHealth: netHealth, latency: latency, dropout: dropout, conflict: conflict, freshnessDecay: freshnessDecay },
      trainingMetrics: { ...metrics, integrityIndex: integrityIndex, confidenceGap: confidenceGap, fusedRoute: fusedRoute, sourceHistory: sourceHistory, exerciseHistory: exerciseHistory },
      scenarioGeneration: scenario.generation || null,
      observedFocus: focus,
      decisions: decisions.slice().sort(function(a, b) { return a.at - b.at; }),
      eventTimeline: events.slice().sort(function(a, b) { return a.at - b.at; }),
      informationLedger: reports.map(function(r) { return { id: r.id, source: r.source, domain: r.domain, state: r.state, confidence: r.confidence, freshness: r.freshness, trustScore: trustScore(r), groundTruth: r.truth }; }),
      teamMessages: messages.slice().sort(function(a, b) { return a.at - b.at; }),
      decisionSafety: {
        fusedClaim: fusedRoute,
        abstain: fusedRoute.abstain,
        trainingInstruction: fusedRoute.abstain ? 'VERIFY / SEEK CORROBORATION' : 'SUFFICIENT FOR TRAINING DECISION'
      },
      explainability: explainability,
      auditFingerprint: ledgerFingerprint,
      note: 'Synthetic training analytics; not an operational assessment.',
      explainabilityCurrent: explainability
    };
    var text = '';
    var mime = 'application/json';
    var filename = 'sentinel-grid-aar.json';
    if (format === 'html') {
      mime = 'text/html';
      filename = 'sentinel-grid-aar.html';
      text = '<!doctype html><html><head><meta charset="utf-8"><title>Sentinel Grid Omega AAR</title><style>body{font-family:Arial;background:#071019;color:#dce7ee;padding:30px}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #294453;text-align:left}.card{border:1px solid #294453;padding:18px;margin:14px 0;background:#0d1923}</style></head><body><h1>Sentinel Grid Omega — After Action Review</h1><p>' + scenario.name + ' · T+' + fmtClock(elapsed) + '</p><div class="card"><h2>Training metrics</h2><p>Decisions: ' + metrics.count + ' · Avg confidence: ' + metrics.avgConfidence + '% · Evidence coverage: ' + metrics.evidenceCoverage + '% · Team coherence: ' + metrics.teamCoherence + '%</p></div><div class="card"><h2>Observed training focus</h2><p>' + escapeHtml(focus.join(' · ')) + '</p></div><div class="card"><h2>Decision timeline</h2>' + decisions.slice().sort(function(a,b){return a.at-b.at;}).map(function(d){return '<p><b>T+' + fmtClock(d.at) + '</b> · ' + d.action + ' · ' + d.confidence + '% · ' + d.rationale + '</p>';}).join('') + '</div><div class="card"><h2>Information ledger / ground truth reveal</h2><table><tr><th>ID</th><th>Source</th><th>State</th><th>Trust</th><th>Ground truth</th></tr>' + reports.map(function(r){return '<tr><td>' + escapeHtml(r.id) + '</td><td>' + escapeHtml(r.source) + '</td><td>' + escapeHtml(r.state) + '</td><td>' + trustScore(r) + '%</td><td>' + escapeHtml(r.truth) + '</td></tr>';}).join('') + '</table></div></body></html>';
    } else {
      text = JSON.stringify(payload, null, 2);
    }
    var blob = new Blob([text], { type: mime });
    downloadBlob(blob, filename);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><span></span><span></span><span></span></div><div><strong>SENTINEL</strong><small>GRID Ω / TRAINING OS</small></div></div>
        <div className="exercise-card"><div className="eyebrow">ACTIVE EXERCISE</div><h3>{scenarioKey}</h3><p>{scenario.phase.toUpperCase()}</p><div className="exercise-meta"><span><i className="pulse"></i>{running ? ' LIVE' : ' PAUSED'}</span><span>T+{fmtClock(elapsed)}</span></div></div>
        <div className="mode-switch"><button className={mode === 'trainee' ? 'mode active' : 'mode'} onClick={() => setMode('trainee')}>TRAINEE</button><button className={mode === 'instructor' ? 'mode active' : 'mode'} onClick={() => setMode('instructor')}>INSTRUCTOR</button></div>
        <nav className="nav">
          <div className="nav-label">OPERATIONS</div>
          <button className={activeTab === 'cockpit' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('cockpit')}><span className="icon">◈</span>Decision cockpit</button>
          <button className={activeTab === 'team' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('team')}><span className="icon">⌁</span>Team room<em>{members.filter(function(m){return m.status === 'online';}).length}</em></button>
          <button className={activeTab === 'aar' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('aar')}><span className="icon">≡</span>AAR & replay</button>
          <button className={activeTab === 'benchmark' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('benchmark')}><span className="icon">◫</span>Benchmark lab<em>{benchmark.totalRuns}</em></button>
          <button className={activeTab === 'resilience' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('resilience')}><span className="icon">↯</span>Red-team resilience<em>{resilience.totalRuns}</em></button>
          <button className={activeTab === 'viz' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('viz')}><span className="icon">◈</span>Visualization lab<em>OSS</em></button>
          <div className="nav-label instructor-label">TRAINING DIRECTOR</div>
          <button className={activeTab === 'director' ? 'nav-item active' : 'nav-item'} onClick={() => { setMode('instructor'); setActiveTab('director'); }}><span className="icon">⚙</span>Exercise director</button>
          <button className="nav-item" onClick={() => exportAAR('html')}><span className="icon">⇩</span>Export AAR</button>
        </nav>
        <div className="sidebar-footer"><div className="user-dot">AM</div><div><strong>Arjun Mehta</strong><small>OC / ALPHA CELL</small></div><span className="more">•••</span></div>
      </aside>

      <main className="main">
        <header className="topbar"><div><div className="breadcrumb">EXERCISE / {scenarioKey} / <span>{activeTab.toUpperCase()}</span></div><h1>{activeTab === 'cockpit' ? 'Decision cockpit' : activeTab === 'team' ? 'Team room' : activeTab === 'aar' ? 'AAR & replay' : activeTab === 'benchmark' ? 'Benchmark laboratory' : activeTab === 'resilience' ? 'Red-team resilience lab' : activeTab === 'viz' ? 'Visualization laboratory' : 'Exercise director'}</h1></div><div className="top-actions"><div className="sync"><span className="sync-dot"></span>{mode.toUpperCase()} <small>LOCAL / AUDITABLE</small></div><button className="ghost-btn" onClick={() => setRunning(function(v){return !v;})}>{running ? 'PAUSE' : 'RESUME'}</button><button className="avatar">AM</button></div></header>

        {mode === 'instructor' && activeTab === 'cockpit' && <section className="director-banner"><div><div className="eyebrow">INSTRUCTOR VIEW</div><strong>Observe the exercise without revealing UI-hidden ground truth.</strong><span>Live decision traces and degradation state are visible to the director.</span></div><button className="primary-btn" onClick={() => setActiveTab('director')}>OPEN DIRECTOR ↗</button></section>}

        {activeTab === 'cockpit' && (
          <>
            <section className="status-strip"><div className="status-main"><span className="status-icon">!</span><div><strong>{netHealth < 45 ? 'COMMS SEVERELY DEGRADED' : 'COMMS DEGRADED'}</strong><span>{scenario.objective}</span></div></div><div className="status-metrics"><div><small>NETWORK HEALTH</small><strong className="amber-text">{netHealth}%</strong></div><div><small>AVG LATENCY</small><strong>{latency}s</strong></div><div><small>VOICE DROPOUT</small><strong>{dropout}%</strong></div><div><small>CONFLICT PRESSURE</small><strong>{conflict}%</strong></div></div></section>

            <div className="content-grid">
              <section className="left-column">
                <div className="section-head"><div><div className="eyebrow">MULTI-DOMAIN FEED</div><h2>Common operating picture <span className="badge live">LIVE</span></h2></div><span className="micro-label">INTEGRITY-FIRST VIEW</span></div>
                <div className="map-panel"><div className="map-top"><div className="map-legend"><span><i className="legend-dot blue"></i> FRIENDLY</span><span><i className="legend-dot amber"></i> UNCERTAIN</span><span><i className="legend-dot red"></i> UNRESOLVED</span></div><div className="map-time">T+{fmtClock(elapsed)} · SYNTHETIC GRID</div></div><div className="map-grid"><div className="contour contour-a"></div><div className="contour contour-b"></div><div className="route route-one">ROUTE ECHO</div><div className="route route-two">ROUTE FOXTROT</div><div className="map-label obj">OBJ<br/><b>KESTREL</b></div><div className="marker friendly m1"><span>▣</span><small>A1-1</small></div><div className="marker friendly m2"><span>▣</span><small>A1-2</small></div><div className="marker uncertain m3"><span>◇</span><small>RAVEN-2</small></div><div className="marker threat m4"><span>▲</span><small>?</small></div><div className="uncertainty-ring"></div><div className="map-scale">SYNTHETIC / NOT FOR NAVIGATION <span>+</span><span>−</span></div></div></div>

                <div className="section-head compact"><div><div className="eyebrow">INFORMATION LEDGER</div><h2>Select evidence before deciding</h2></div><div className="filter-pills">{['ALL','LAND','AIR','CYBER','EW'].map(function(d){return <button key={d} className={selectedDomain === d ? 'filter active' : 'filter'} onClick={() => setSelectedDomain(d)}>{d}</button>;})}</div></div>
                <div className="reports-list">{visibleReports.map(function(r){return <button key={r.id} className={'report-row ' + r.state + (selectedEvidence.indexOf(r.id) >= 0 ? ' selected' : '')} onClick={() => toggleEvidence(r.id)}><div className="report-icon">{r.icon}</div><div className="report-copy"><div className="report-top"><span className={'badge ' + r.domain.toLowerCase()}>{r.domain}</span><span className="report-source">{r.source}</span><span className="report-time">{r.time}</span></div><strong>{r.headline}</strong><p>{r.detail}</p><div className="integrity-row"><span>CONF {r.confidence}%</span><span>FRESH {r.freshness}%</span><span>TRUST {trustScore(r)}%</span></div></div><div className="report-state">{selectedEvidence.indexOf(r.id) >= 0 ? <span className="selected-text">✓ EVIDENCE</span> : r.state === 'live' ? <span className="fresh">● LIVE</span> : r.state === 'conflict' ? <span className="conflict-text">↯ CONFLICT</span> : r.state === 'dropped' ? <span className="stale-text">⌁ DROPPED</span> : <span className="stale-text">◷ STALE</span>}</div></button>;})}</div>

                <div className="decision-workbench"><div className="section-head compact"><div><div className="eyebrow">DECISION GATE</div><h2>Evidence-linked decision</h2></div><span className="micro-label">AUDITABLE</span></div><div className="decision-form"><div className="select-row">{DECISION_TYPES.map(function(t){return <button key={t} className={decisionType === t ? 'decision-chip active' : 'decision-chip'} onClick={() => setDecisionType(t)}>{t}</button>;})}</div><div className="evidence-summary">{selectedEvidence.length ? selectedEvidence.map(function(id){return <span className="evidence-chip" key={id}>{id}</span>;}) : <span className="evidence-empty">No evidence selected — the system will flag an untraceable decision.</span>}</div><textarea value={decisionText} onChange={function(e){setDecisionText(e.target.value);}} placeholder="State intent, what information you trusted, and why…"/><div className="confidence-row"><label>CONFIDENCE <b>{confidence}%</b></label><input type="range" min="1" max="100" value={confidence} onChange={function(e){setConfidence(e.target.value);}}/><button className="primary-btn" onClick={logDecision}>LOG DECISION ↗</button></div></div></div>
              </section>

              <aside className="right-column">
                <div className="panel-head"><div><div className="eyebrow">INFORMATION INTEGRITY</div><h2>Trust state</h2></div><span className="lock">◎</span></div><p className="panel-note">Trust combines source history, freshness, corroboration and network health. Hidden truth is withheld until AAR.</p><div className={'ai-advisor ' + (fusedRoute.abstain ? 'abstain' : '')}><div><div className="eyebrow">DECISION SAFETY KERNEL</div><strong>{fusedRoute.abstain ? 'INSUFFICIENT EVIDENCE' : 'EVIDENCE STATE STABLE'}</strong><p>{fusedRoute.abstain ? 'Training cue: verify or seek corroboration before committing.' : 'Training cue: current evidence is sufficiently aligned for the exercise.'}</p></div><div className="advisor-grid"><div><small>FUSED CLAIM</small><b>{fusedRoute.label}</b></div><div><small>BELIEF</small><b>{fusedRoute.belief}%</b></div><div><small>DISBELIEF</small><b>{fusedRoute.disbelief}%</b></div><div><small>UNCERTAINTY</small><b>{fusedRoute.uncertainty}%</b></div><div><small>CONFLICT</small><b>{fusedRoute.conflict}%</b></div><div><small>SUFFICIENCY</small><b>{fusedRoute.sufficiency}%</b></div></div></div>
                <ExplainabilityCard explainability={explainability}/>
                <div className="trust-stack">{trustRows.map(function(r){return <div className="trust-card" key={r.id}><div><span>{r.id}</span><small>{r.source} · CALIBRATED {r.learned}%</small></div><strong>{r.trust}%</strong><div className="trust-bar"><span style={{width: r.trust + '%'}}></span></div></div>;})}</div>
                <div className="panel-divider"></div>
                <div className="skill-card"><div><div className="eyebrow">TRAINEE SKILL MODEL</div><strong>GLICKO-2 RATING</strong></div><div className="skill-values"><b>{Math.round(skill.rating)}</b><span>± {Math.round(2 * skill.rd)}</span></div><div className="skill-bar"><span style={{width: Math.max(6, Math.min(100, (skill.rating - 1000) / 10)) + '%'}}></span></div><small>RD {Math.round(skill.rd)} · σ {Number(skill.sigma).toFixed(3)} · {skill.rounds} scored rounds</small></div>
                <div className="panel-divider"></div>
                <div className="panel-head small"><h3>Adaptive training focus</h3><span className="badge live">{focus.length} FOCUS</span></div><div className="focus-list">{focus.map(function(f){return <div key={f}><span>◎</span>{f}</div>;})}</div>
                <div className="panel-divider"></div>
                <div className="panel-head small"><h3>Team presence</h3><span className="badge live">{members.filter(function(m){return m.status === 'online';}).length} ONLINE</span></div><div className="presence">{members.map(function(m){return <Presence key={m.id} {...m} active={m.id === activeSeat} onClick={() => joinSeat(m)} />;})}</div>
              </aside>
            </div>

            <section className="bottom-grid"><div className="timeline-panel"><div className="section-head compact"><div><div className="eyebrow">LIVE EVENT STREAM</div><h2>What changed</h2></div><span className="live-indicator"><i className="pulse"></i> CAPTURING</span></div><div className="event-list">{events.slice(-6).reverse().map(function(e,i){return <div className="event-row" key={e.at + '-' + i}><span className="event-time">T+{fmtClock(e.at)}</span><span className={'badge ' + e.tag.toLowerCase()}>{e.tag}</span><span>{e.text}</span></div>;})}</div></div><div className="analytics-panel"><div className="section-head compact"><div><div className="eyebrow">DECISION INTELLIGENCE</div><h2>Training telemetry</h2></div><span className="micro-label">SYNTHETIC</span></div><div className="metric-grid"><Metric label="DECISIONS" value={metrics.count}/><Metric label="EVIDENCE COVERAGE" value={metrics.evidenceCoverage + '%'}/><Metric label="CONTRADICTION" value={metrics.contradictionUse + '%'}/><Metric label="TEAM COHERENCE" value={metrics.teamCoherence + '%'}/><Metric label="INTEGRITY" value={integrityIndex + '%'}/><Metric label="CONF. GAP" value={confidenceGap + '%'}/><Metric label="BRIER" value={calibration.brier === null ? '—' : calibration.brier}/><Metric label="SKILL" value={Math.round(skill.rating)}/></div></div></section>
          </>
        )}

        {activeTab === 'team' && <TeamPanel members={members} activeSeat={activeSeat} joinSeat={joinSeat} messages={messages} messageText={messageText} setMessageText={setMessageText} sendMessage={sendMessage} degraded={teamChannelDegraded}/>}
        {activeTab === 'benchmark' && <BenchmarkPanel benchmark={benchmark} summary={benchmarkSummary} onRerun={() => setBenchmarkRun(function(v){ return v + 1; })}/>}
        {activeTab === 'resilience' && <ResiliencePanel resilience={resilience} onRerun={() => setResilienceRun(function(v){ return v + 1; })}/>}
         {activeTab === 'viz' && <VisualizationPanel reports={reports} events={events} decisions={decisions} netHealth={netHealth} latency={latency} dropout={dropout} conflict={conflict} fusedRoute={fusedRoute} onExportBundle={exportVisualizationBundle}/>} 
        {activeTab === 'director' && <DirectorPanel scenarioKey={scenarioKey} scenario={scenario} onScenario={loadScenario} netHealth={netHealth} setNetHealth={setNetHealth} latency={latency} setLatency={setLatency} dropout={dropout} setDropout={setDropout} conflict={conflict} setConflict={setConflict} freshnessDecay={freshnessDecay} setFreshnessDecay={setFreshnessDecay} inject={inject} metrics={metrics} events={events} decisions={decisions} focus={focus} generateNextExercise={generateNextExercise}/>}
        {activeTab === 'aar' && <AARPanel decisions={decisions} events={events} reports={reports} metrics={metrics} focus={focus} replayAt={replayAt} setReplayAt={setReplayAt} elapsed={elapsed} exportAAR={exportAAR} integrityIndex={integrityIndex} confidenceGap={confidenceGap} fusedRoute={fusedRoute} ledgerFingerprint={ledgerFingerprint}/>}

        <footer className="app-footer"><span>Sentinel Grid Ω · synthetic training environment · no operational data</span><span>Browser-local room · auditable ledger · hidden-truth AAR</span></footer>
      </main>
    </div>
  );
}

function Metric({ label, value }) { return <div className="metric"><small>{label}</small><strong>{value}</strong></div>; }

function Presence(props) {
  return <button className={'presence-row ' + (props.active ? 'active' : '')} onClick={props.onClick}><div className={'mini-avatar ' + (props.active ? 'me' : '')}>{props.initials}</div><div><strong>{props.name}</strong><small>{props.role}</small></div><span className={props.status === 'online' ? 'online-dot' : props.status === 'degraded' ? 'degraded-dot' : 'away-dot'}></span></button>;
}

function RerunEmbeddedPanel() {
  const hostRef = useRef(null);
  const viewerRef = useRef(null);
  const objectUrlRef = useRef(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [status, setStatus] = useState('READY · LOAD A .RRD RECORDING');

  const stopViewer = function(keepObjectUrl) {
    if (viewerRef.current) {
      try { viewerRef.current.stop(); } catch (_) {}
      viewerRef.current = null;
    }
    if (!keepObjectUrl && objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  const startViewer = async function(source, keepObjectUrl) {
    if (!hostRef.current || !source) {
      setStatus('SELECT A .RRD FILE OR ENTER A RECORDING URL');
      return;
    }
    stopViewer(Boolean(keepObjectUrl));
    setStatus('LOADING RERUN WEB VIEWER…');
    try {
      const module = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@rerun-io/web-viewer@0.38.1/+esm');
      const viewer = new module.WebViewer();
      await viewer.start(source, hostRef.current, {
        width: '100%',
        height: '620px',
        hide_welcome_screen: true,
        theme: 'dark',
        allow_fullscreen: true,
        render_backend: 'webgl'
      });
      viewerRef.current = viewer;
      setStatus('LIVE · RERUN 3D VIEWER');
    } catch (error) {
      setStatus('RERUN LOAD ERROR · CHECK THE RECORDING URL/FILE');
      console.error('Rerun WebViewer error', error);
    }
  };

  const handleFile = function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    startViewer(objectUrl, true);
  };

  useEffect(function() {
    return function() { stopViewer(); };
  }, []);

  return <section className="viz-card rerun-embedded-card">
    <div className="section-head compact">
      <div><div className="eyebrow">RERUN WEB VIEWER · 0.38.1</div><h2>Embedded robotics-grade 3D workspace</h2></div>
      <span className="badge live">{status}</span>
    </div>
    <div className="rerun-toolbar">
      <label className="rerun-file-btn">LOAD .RRD<input type="file" accept=".rrd,application/octet-stream" onChange={handleFile}/></label>
      <input className="rerun-url" value={sourceUrl} onChange={function(e){setSourceUrl(e.target.value);}} placeholder="https://…recording.rrd or rerun+http://…/proxy"/>
      <button className="primary-btn" onClick={() => startViewer(sourceUrl.trim())}>CONNECT ↗</button>
      <button className="ghost-btn" onClick={stopViewer}>STOP</button>
    </div>
    <div ref={hostRef} className="rerun-host"></div>
    <p className="viz-note">Load the <code>sentinel-grid.rrd</code> recording produced by <code>npm run viz:rerun -- --save artifacts/sentinel-grid.rrd</code> to inspect the synthetic scene directly inside Sentinel Grid. The viewer supports 3D data and shared timelines.</p>
  </section>;
}

function VisualizationPanel({ reports, events, decisions, netHealth, latency, dropout, conflict, fusedRoute, onExportBundle }) {
  const networkRef = useRef(null);
  const chartRef = useRef(null);
  const timelineRef = useRef(null);

  useEffect(function() {
    if (!networkRef.current || !window.cytoscape) return undefined;
    const liveReports = reports.filter(function(r) { return r.state !== 'dropped'; });
    const nodes = [
      { data: { id: 'TEAM', label: 'ALPHA CELL', domain: 'TEAM' } }
    ].concat(liveReports.map(function(r) {
      return { data: { id: r.id, label: r.source, domain: r.domain, confidence: r.confidence } };
    }));
    const edges = liveReports.map(function(r) {
      return { data: { id: 'e-' + r.id, source: 'TEAM', target: r.id, weight: Math.max(1, r.confidence / 20) } };
    });

    const cy = window.cytoscape({
      container: networkRef.current,
      elements: nodes.concat(edges),
      layout: { name: 'cose', animate: false, fit: true, padding: 28 },
      minZoom: 0.65,
      maxZoom: 2.2,
      style: [
        { selector: 'node', style: {
          'background-color': '#12303a',
          'border-width': 1,
          'border-color': '#4e8d92',
          'label': 'data(label)',
          'color': '#d9eeee',
          'font-size': 9,
          'font-family': 'DM Mono',
          'text-wrap': 'wrap',
          'text-max-width': 90,
          'text-valign': 'center',
          'text-halign': 'center',
          'width': 58,
          'height': 40
        }},
        { selector: 'node[id="TEAM"]', style: {
          'background-color': '#234e52',
          'border-color': '#86ded7',
          'width': 78,
          'height': 48,
          'font-size': 10
        }},
        { selector: 'edge', style: {
          'line-color': '#31525d',
          'target-arrow-color': '#4f8087',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'width': 'mapData(weight, 1, 5, 1, 4)',
          'opacity': 0.78
        }}
      ]
    });

    return function() { cy.destroy(); };
  }, [reports]);

  useEffect(function() {
    if (!chartRef.current || !window.echarts) return undefined;
    const chart = window.echarts.init(chartRef.current);
    const labels = reports.map(function(r) { return r.source.split(' / ')[0]; });
    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: {
        textStyle: { color: '#829aa4', fontSize: 9, fontFamily: 'DM Mono' },
        data: ['Confidence', 'Freshness', 'Trust']
      },
      grid: { left: 34, right: 16, top: 34, bottom: 54 },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: { color: '#718993', fontSize: 8, rotate: 22 },
        axisLine: { lineStyle: { color: '#223c48' } }
      },
      yAxis: {
        type: 'value',
        max: 100,
        axisLabel: { color: '#718993', fontSize: 8 },
        splitLine: { lineStyle: { color: '#18303b' } }
      },
      series: [
        { name: 'Confidence', type: 'bar', data: reports.map(function(r) { return r.confidence; }), barMaxWidth: 18 },
        { name: 'Freshness', type: 'bar', data: reports.map(function(r) { return r.freshness; }), barMaxWidth: 18 },
        { name: 'Trust', type: 'line', smooth: true, data: reports.map(function(r) { return trustScore(r); }), symbolSize: 6 }
      ]
    });
    const onResize = function() { chart.resize(); };
    window.addEventListener('resize', onResize);
    return function() {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [reports]);

  useEffect(function() {
    if (!timelineRef.current || !window.vis) return undefined;
    const base = new Date();
    const items = new window.vis.DataSet(events.concat(decisions.map(function(d) {
      return { at: d.at, tag: 'DECISION', text: d.action + ' · ' + d.rationale };
    })).map(function(e, index) {
      return {
        id: index + '-' + e.at + '-' + e.tag,
        content: '<b>' + escapeHtml(e.tag) + '</b> ' + escapeHtml(e.text),
        start: new Date(base.getTime() + Number(e.at || 0) * 1000),
        group: e.tag
      };
    }));
    const timeline = new window.vis.Timeline(timelineRef.current, items, {
      stack: true,
      zoomMin: 15000,
      zoomMax: 1000 * 60 * 20,
      orientation: { axis: 'top' },
      margin: { item: 8, axis: 6 },
      selectable: true
    });
    return function() { timeline.destroy(); };
  }, [events, decisions]);

  const metrics = [
    ['NETWORK', netHealth + '%'],
    ['LATENCY', latency + 's'],
    ['DROPOUT', dropout + '%'],
    ['CONFLICT', conflict + '%'],
    ['FUSED', fusedRoute.label],
    ['UNCERTAINTY', fusedRoute.uncertainty + '%']
  ];

  return <div className="viz-layout">
    <div className="viz-banner">
      <div><div className="eyebrow">OPEN-SOURCE VISUALIZATION STACK</div><h2>3D telemetry + multimodal robotics visualization</h2><p>Browser views provide the dashboard; Rerun and Open3D provide the high-end 3D inspection layer from the same exported synthetic scene bundle.</p><div className="viz-actions"><button className="primary-btn" onClick={onExportBundle}>EXPORT 3D BUNDLE ↗</button><span className="viz-command">npm run viz:rerun · npm run viz:open3d</span></div></div>
      <div className="viz-metrics">{metrics.map(function(pair){return <div key={pair[0]}><small>{pair[0]}</small><strong>{pair[1]}</strong></div>;})}</div>
    </div>
    <div className="viz-grid">
      <RerunEmbeddedPanel />
      <section className="viz-card viz-3d-stack">
        <div className="section-head compact"><div><div className="eyebrow">RERUN.IO · MIT / APACHE-2.0</div><h2>Multimodal 3D replay companion</h2></div><span className="badge live">RERUN</span></div>
        <div className="viz-3d-callout"><div><strong>Rerun</strong><span>Time-aware 3D, trajectories, telemetry and event logs.</span></div><div><strong>Open3D</strong><span>Point-cloud and geometry inspection for synthetic spatial evidence.</span></div><div><strong>Bundle</strong><span>Export once from this screen, then inspect with either viewer.</span></div></div>
      </section>
      <section className="viz-card viz-network">
        <div className="section-head compact"><div><div className="eyebrow">CYTOSCAPE.JS · MIT</div><h2>Communication relationship graph</h2></div><span className="badge live">INTERACTIVE</span></div>
        <div ref={networkRef} className="cytoscape-canvas"></div>
        <p className="viz-note">Nodes represent the synthetic team and current information sources; edges show the evidence flow into the decision space.</p>
      </section>
      <section className="viz-card viz-chart">
        <div className="section-head compact"><div><div className="eyebrow">APACHE ECHARTS · APACHE-2.0</div><h2>Evidence integrity profile</h2></div><span className="badge ew">MULTI-SERIES</span></div>
        <div ref={chartRef} className="echarts-canvas"></div>
        <p className="viz-note">Confidence, freshness and derived trust are rendered together so degradation effects are immediately visible.</p>
      </section>
      <section className="viz-card viz-timeline">
        <div className="section-head compact"><div><div className="eyebrow">VIS-TIMELINE · APACHE-2.0 / MIT</div><h2>Exercise event reconstruction</h2></div><span className="badge live">ZOOM / PAN</span></div>
        <div ref={timelineRef} className="vis-timeline-canvas"></div>
        <p className="viz-note">Use the timeline to inspect information injections and decision events on a common temporal axis.</p>
      </section>
    </div>
    <div className="viz-footer"><strong>Open-source references:</strong> Cytoscape.js provides graph visualization/analysis under MIT; Apache ECharts is Apache-2.0; vis-timeline is dual-licensed Apache-2.0/MIT.</div>
  </div>;
}

function BenchmarkPanel({ benchmark, summary, onRerun }) {
  const methods = [
    ['naive', benchmark.methods.naive],
    ['freshness', benchmark.methods.freshness],
    ['reliability', benchmark.methods.reliability],
    ['sentinel', benchmark.methods.sentinel]
  ];
  const maxAccuracy = Math.max(...methods.map(function(pair) { return pair[1].accuracy; }), 1);
  return <div className="benchmark-layout">
    <section className="benchmark-main">
      <div className="section-head">
        <div><div className="eyebrow">VALIDATION SUITE · REPRODUCIBLE</div><h2>Controlled degraded-information benchmark <span className="badge live">MEASURED</span></h2></div>
        <button className="primary-btn" onClick={onRerun}>RERUN SUITE ↻</button>
      </div>
      <div className="benchmark-banner">
        <div><strong>{benchmark.totalRuns} synthetic decision cases</strong><span>Seed {benchmark.seed} · {benchmark.conditions.length} communication regimes · identical cases per method</span></div>
        <span className="benchmark-chip">NO LIVE DATA</span>
      </div>
      <div className="benchmark-methods">
        {methods.map(function(pair) {
          const key = pair[0], m = pair[1];
          return <div className={'benchmark-method ' + (key === 'sentinel' ? 'featured' : '')} key={key}>
            <div className="eyebrow">{key === 'sentinel' ? 'PROPOSED ENGINE' : 'BASELINE'}</div>
            <strong>{m.label}</strong>
            <div className="benchmark-number">{m.accuracy}%</div>
            <small>accuracy</small>
            <div className="benchmark-track"><span style={{width: (m.accuracy / maxAccuracy * 100) + '%'}}></span></div>
            <div className="benchmark-mini"><span>Selective accuracy <b>{m.selectiveAccuracy === null ? '—' : m.selectiveAccuracy + '%'}</b></span><span>Coverage <b>{m.coverage}%</b></span><span>False confidence <b>{m.falseConfidenceRate}%</b></span><span>Brier <b>{m.brier}</b></span><span>Covered Brier <b>{m.coveredBrier === null ? '—' : m.coveredBrier}</b></span><span>ECE <b>{m.ece === null ? '—' : m.ece}</b></span><span>AURC <b>{m.aurc === null ? '—' : m.aurc}</b></span><span>Matched @ {m.matchedCoverage}% <b>{m.matchedSelectiveAccuracy}%</b></span></div>
          </div>;
        })}
      </div>
      <div className="benchmark-delta">
        <div><small>SELECTIVE ACC Δ VS RELIABILITY</small><strong>{summary.selectiveAccuracyDeltaVsReliability > 0 ? '+' : ''}{summary.selectiveAccuracyDeltaVsReliability} pts</strong></div>
        <div><small>FALSE-CONFIDENCE Δ VS RELIABILITY</small><strong>{summary.falseConfidenceDeltaVsReliability > 0 ? '+' : ''}{summary.falseConfidenceDeltaVsReliability} pts</strong></div>
        <div><small>SENTINEL COVERAGE</small><strong>{summary.coverage}%</strong></div>
        <div><small>HIGH-CONFLICT ABSTENTION</small><strong>{summary.appropriateAbstention}%</strong></div>
      </div>
      <div className="section-head compact"><div><div className="eyebrow">STRESS MATRIX</div><h2>Performance by communication regime</h2></div><span className="micro-label">Same generator · same seed</span></div>
      <div className="benchmark-table">
        <div className="benchmark-row benchmark-head"><span>CONDITION</span><span>NAIVE</span><span>FRESHNESS</span><span>RELIABILITY</span><span>SENTINEL Ω</span></div>
        {benchmark.conditions.map(function(key) {
          const row = benchmark.byCondition[key];
          return <div className="benchmark-row" key={key}>
            <span><strong>{row.label}</strong><small>{row.sentinel.runs} cases</small></span>
            <span>{row.naive.accuracy}%<small>FC {row.naive.falseConfidenceRate}%</small></span>
            <span>{row.freshness.accuracy}%<small>FC {row.freshness.falseConfidenceRate}%</small></span>
            <span>{row.reliability.accuracy}%<small>FC {row.reliability.falseConfidenceRate}%</small></span>
            <span className="benchmark-best">{row.sentinel.accuracy}%<small>FC {row.sentinel.falseConfidenceRate}% · C {row.sentinel.coverage}% · U {row.sentinel.abstentionRate}%</small></span>
          </div>;
        })}
      </div>
      <div className="benchmark-note"><strong>Methodology.</strong> The suite uses a deterministic synthetic generator with controlled latency, packet loss, source reliability and conflict pressure. The reliability baseline and Sentinel Ω receive the same pre-exercise source-reliability history; Sentinel additionally models explicit uncertainty and abstention. AURC summarizes risk across the full confidence-ranked coverage curve; matched-coverage accuracy evaluates every method on the same coverage target as Sentinel. Treat this as an algorithmic ablation study, not evidence of operational performance.</div>
    </section>
    <aside className="benchmark-side">
      <div className="eyebrow">WHAT IS BEING TESTED</div>
      <h3>Why the comparison is defensible</h3>
      <div className="benchmark-points">
        <div><b>01</b><span><strong>Same evidence</strong> Every method sees the same generated reports.</span></div>
        <div><b>02</b><span><strong>Same truth</strong> Ground truth is known only to the benchmark scorer.</span></div>
        <div><b>03</b><span><strong>Same conditions</strong> Delay, loss and contradiction are parameterized.</span></div>
        <div><b>04</b><span><strong>Auditable metrics</strong> Accuracy, false confidence, Brier score, ECE, AURC and abstention are recorded.</span></div>
         <div><b>05</b><span><strong>Matched coverage</strong> Confidence ranking is evaluated at the same coverage target across methods, reducing the benefit of simply abstaining more.</span></div>
      </div>
      <div className="panel-divider"></div>
      <div className="eyebrow">RESEARCH CLAIM</div>
      <p className="benchmark-callout">“Do not claim superiority by appearance. Measure whether explicit uncertainty improves behavior under degradation.”</p>
      <div className="panel-divider"></div>
      <div className="eyebrow">REPRODUCIBILITY</div>
      <p className="panel-note">The seed is fixed for each run. Results can be regenerated locally from the benchmark engine without external services.</p>
    </aside>
  </div>;
}

function ExplainabilityCard({ explainability }) {
  var pivotal = explainability.pivotal;
  var flip = explainability.flipCandidate;
  return <div className="explain-card">
    <div className="panel-head small">
      <div><div className="eyebrow">CAUSAL DECISION TRACE</div><h3>Why did the model lean here?</h3></div>
      <span className={'badge ' + (explainability.robustness.fragile ? 'ew' : 'live')}>{explainability.robustness.fragile ? 'FRAGILE' : 'STABLE'}</span>
    </div>
    <p className="panel-note explain-diagnosis">{explainability.diagnosis}</p>
    <div className="explain-metrics">
      <div><small>SELECTED</small><strong>{explainability.selectedCount}</strong></div>
      <div><small>INDEPENDENT</small><strong>{explainability.independentSources}</strong></div>
      <div><small>LEVERAGE</small><strong>{Math.round(explainability.robustness.leverage)}%</strong></div>
    </div>
    <div className="explain-block">
      <div className="eyebrow">MOST PIVOTAL EVIDENCE</div>
      {pivotal ? <div className="explain-row"><div><strong>{pivotal.id} · {pivotal.source}</strong><small>{pivotal.stance} · CONF {pivotal.confidence}% · FRESH {pivotal.freshness}%</small></div><b>{pivotal.impact >= 0 ? '+' : ''}{pivotal.impact} pts</b><span>{pivotal.labelChanged ? 'FLIPS CLAIM' : pivotal.abstentionChanged ? 'CHANGES ABSTENTION' : 'LOSS IF REMOVED'}</span></div> : <div className="empty-state">Select route evidence to compute source-level leverage.</div>}
    </div>
    <div className="explain-block">
      <div className="eyebrow">COUNTERFACTUAL CHECK</div>
      {flip ? <div className="explain-row"><div><strong>{flip.id} · {flip.source}</strong><small>Unselected report · {flip.stance} · FRESH {flip.freshness}%</small></div><b>{flip.probabilityDelta >= 0 ? '+' : ''}{flip.probabilityDelta} pts</b><span>{flip.labelChanged ? 'COULD FLIP CLAIM' : flip.abstentionChanged ? 'CHANGES ABSTENTION' : 'NO LABEL FLIP'}</span></div> : <div className="empty-state">No unselected route report currently provides a stronger counterfactual.</div>}
    </div>
  </div>;
}

function ResiliencePanel({ resilience, onRerun }) {
  var rows = Object.values(resilience.byAttack);
  return <div className="resilience-layout">
    <section className="resilience-main">
      <div className="section-head">
        <div><div className="eyebrow">RED-TEAM VALIDATION · DETERMINISTIC</div><h2>Information-attack resilience <span className="badge live">MEASURED</span></h2></div>
        <button className="primary-btn" onClick={onRerun}>RERUN ATTACK SUITE ↻</button>
      </div>
      <div className="resilience-banner">
        <div><strong>{resilience.totalRuns} adversarial synthetic cases</strong><span>Seed {resilience.seed} · same base evidence generator · no live or operational data</span></div>
        <span className="benchmark-chip">RED TEAM</span>
      </div>
      <div className="resilience-hero">
        <div><small>FALSE-CONFIDENCE REDUCTION</small><strong>{resilience.headline.falseConfidenceReduction > 0 ? '+' : ''}{resilience.headline.falseConfidenceReduction} pts</strong><span>Sentinel vs confidence-only under attacks</span></div>
        <div><small>ATTACKS STOPPED</small><strong>{resilience.headline.attackStoppedRate}%</strong><span>Correct result or explicit abstention</span></div>
        <div><small>SENTINEL FALSE CONFIDENCE</small><strong>{resilience.headline.sentinelFalseConfidence}%</strong><span>Wrong + ≥70% predicted probability</span></div>
        <div><small>WORST ATTACK CLASS</small><strong>{resilience.headline.worstAttack}</strong><span>Highest naive false-confidence exposure</span></div>
      </div>
      <div className="section-head compact"><div><div className="eyebrow">ATTACK MATRIX</div><h2>How the information picture is stressed</h2></div><span className="micro-label">40 CASES / CLASS</span></div>
      <div className="resilience-table">
        <div className="resilience-row resilience-head"><span>ATTACK</span><span>NAIVE ACC</span><span>SENTINEL ACC</span><span>NAIVE FC</span><span>SENTINEL FC</span><span>STOPPED</span></div>
        {rows.map(function(row) {
          return <div className="resilience-row" key={row.key}>
            <span><strong>{row.label}</strong><small>{row.description}</small></span>
            <span>{row.naiveAccuracy}%</span>
            <span>{row.sentinelAccuracy}%</span>
            <span className={row.naiveFalseConfidence > row.sentinelFalseConfidence ? 'resilience-good' : ''}>{row.naiveFalseConfidence}%</span>
            <span className={row.sentinelFalseConfidence === 0 ? 'resilience-good' : ''}>{row.sentinelFalseConfidence}%</span>
            <span>{row.attackStoppedRate}%</span>
          </div>;
        })}
      </div>
      <div className="resilience-note"><strong>Interpretation.</strong> This harness is intentionally adversarial: it probes stale high-confidence evidence, conflict bursts, true-source dropout, duplicate-source echoes and delayed contradictions. “Stopped” means the Sentinel result was correct or it abstained rather than committing to a wrong high-confidence claim. This is a synthetic robustness test, not evidence of operational effectiveness.</div>
    </section>
    <aside className="resilience-side">
      <div className="eyebrow">WHY THIS MATTERS</div>
      <h3>From benchmark to red-team evaluation</h3>
      <div className="benchmark-points">
        <div><b>01</b><span><strong>Attack the assumptions</strong> Do not only test average conditions; deliberately construct misleading information states.</span></div>
        <div><b>02</b><span><strong>Measure overconfidence</strong> A wrong answer with high confidence is more important to catch than a cautious abstention.</span></div>
        <div><b>03</b><span><strong>Keep it reproducible</strong> Every run is seeded so the same attack suite can be re-executed in a presentation or lab notebook.</span></div>
        <div><b>04</b><span><strong>Keep the human in control</strong> The system can abstain and surface uncertainty; it never turns a synthetic signal into an operational action.</span></div>
      </div>
      <div className="panel-divider"></div>
      <div className="eyebrow">RESEARCH EXTENSION</div>
      <p className="benchmark-callout">Stress the decision model with a red-team generator before claiming that uncertainty handling is robust.</p>
      <div className="panel-divider"></div>
      <div className="eyebrow">REPRODUCIBILITY</div>
      <p className="panel-note">Seed {resilience.seed} · {resilience.totalRuns} total cases · five attack classes · deterministic report mutations.</p>
    </aside>
  </div>;
}

function TeamPanel({ members, activeSeat, joinSeat, messages, messageText, setMessageText, sendMessage, degraded }) {
  return <div className="team-layout"><section className="chat-panel"><div className="section-head"><div><div className="eyebrow">TEAM ROOM</div><h2>ALPHA CELL <span className="channel-lock">⌁</span></h2></div><span className={'badge ' + (degraded ? 'ew' : 'live')}>{degraded ? 'DEGRADED NET' : 'STABLE NET'}</span></div><div className="room-banner"><div><strong>Multi-seat prototype</strong><span>Open this Vite URL in another browser tab to join the local team room.</span></div><span className="room-chip">BroadcastChannel</span></div><div className="chat-messages">{messages.slice().reverse().map(function(c){return <div className="chat-message" key={c.id}><div className="mini-avatar">{c.initials}</div><div><div className="chat-meta"><strong>{c.actor}</strong><span>T+{fmtClock(c.at)}</span></div><p>{c.text}</p></div></div>;})}<div className="system-message">Critical traffic may be delayed, dropped or arrive out of order. Verify before escalating.</div></div><div className="composer"><textarea value={messageText} onChange={function(e){setMessageText(e.target.value);}} onKeyDown={function(e){if(e.key === 'Enter' && !e.shiftKey){e.preventDefault();sendMessage();}}} placeholder="Transmit to ALPHA CELL…"/><button className="primary-btn" onClick={sendMessage}>TRANSMIT ↗</button></div></section><aside className="team-side"><div className="eyebrow">TEAM SEATS</div>{members.map(function(m){return <button key={m.id} className={activeSeat === m.id ? 'channel active' : 'channel'} onClick={() => joinSeat(m)}><span>{m.initials}</span>{m.role}<small>{m.status}</small></button>;})}<div className="side-tip"><strong>Training cue</strong><p>Track source, age, corroboration and contradiction before committing a decision.</p></div></aside></div>;
}

function DirectorPanel({ scenarioKey, scenario, onScenario, netHealth, setNetHealth, latency, setLatency, dropout, setDropout, conflict, setConflict, freshnessDecay, setFreshnessDecay, inject, metrics, events, decisions, focus, generateNextExercise }) {
  return <div className="director-layout"><section className="director-main"><div className="section-head"><div><div className="eyebrow">SCENARIO DIRECTOR</div><h2>Inject friction without breaking exercise flow</h2></div><span className="badge live">LIVE CONTROL</span></div><div className="scenario-picker">{Object.entries(SCENARIOS).map(function(pair){var key=pair[0], item=pair[1];return <button key={key} className={scenarioKey === key ? 'scenario-card active' : 'scenario-card'} onClick={() => onScenario(key)}><small>SCENARIO</small><strong>{key}</strong><span>{item.phase}</span><span>Difficulty {item.difficulty}/10</span></button>;})}</div><div className="director-controls"><Control label="NETWORK HEALTH" value={netHealth} suffix="%" onChange={setNetHealth}/><Control label="TELEMETRY LATENCY" value={latency} suffix="sec" onChange={setLatency}/><Control label="VOICE DROPOUT" value={dropout} suffix="%" onChange={setDropout}/><Control label="CONFLICT PRESSURE" value={conflict} suffix="%" onChange={setConflict}/><Control label="FRESHNESS DECAY" value={freshnessDecay} suffix="pts/min" onChange={setFreshnessDecay}/></div><div className="event-injection"><div className="section-head compact"><div><div className="eyebrow">MID-EXERCISE INJECTION</div><h2>Change the information environment</h2></div></div><div className="inject-grid large"><button onClick={() => inject('delay')}><span>◴</span><strong>Delay feed</strong><small>Increase age + latency</small></button><button onClick={() => inject('dropout')}><span>⌁</span><strong>Drop node</strong><small>Remove a source</small></button><button onClick={() => inject('conflict')}><span>↯</span><strong>Conflict report</strong><small>Create source disagreement</small></button><button onClick={() => inject('stale')}><span>◷</span><strong>Age report</strong><small>Force freshness decay</small></button><button onClick={() => inject('split')}><span>⫸</span><strong>Split team net</strong><small>Cross-cell delay/dropout</small></button></div></div><div className="director-footer-card"><div><small>NEXT TRAINING FOCUS</small><strong>{focus.join(' · ')}</strong><span className="director-generated-meta">Procedural DSL · deterministic synthetic scenario generation</span></div><button className="primary-btn" onClick={generateNextExercise}>GENERATE NEXT EXERCISE ↗</button></div></section><aside className="director-side"><div className="eyebrow">LIVE MONITOR</div><h3>Team decision trace</h3><div className="monitor-grid"><Metric label="DECISIONS" value={metrics.count}/><Metric label="AVG CONFIDENCE" value={metrics.avgConfidence + '%'}/><Metric label="TEAM COHERENCE" value={metrics.teamCoherence + '%'}/><Metric label="EVIDENCE COVERAGE" value={metrics.evidenceCoverage + '%'}/></div><div className="panel-divider"></div><div className="eyebrow">LATEST DECISIONS</div><div className="decision-stream">{decisions.slice(0,6).map(function(d){return <div className="stream-row" key={d.id}><span>T+{fmtClock(d.at)}</span><strong>{d.action}</strong><small>{d.rationale}</small></div>;})}</div><div className="panel-divider"></div><div className="eyebrow">LATEST EVENTS</div><div className="decision-stream">{events.slice(-5).reverse().map(function(e,i){return <div className="stream-row" key={e.at+'-'+i}><span>T+{fmtClock(e.at)}</span><strong>{e.tag}</strong><small>{e.text}</small></div>;})}</div></aside></div>;
}

function Control({ label, value, suffix, onChange }) {
  return <div className="control"><div><label>{label}</label><strong>{Math.round(value)}<small>{suffix}</small></strong></div><input type="range" min="0" max="100" value={value} onChange={function(e){onChange(Number(e.target.value));}}/><div className="control-scale"><span>LOW</span><span>HIGH</span></div></div>;
}

function AARPanel({ decisions, events, reports, metrics, focus, replayAt, setReplayAt, elapsed, exportAAR, integrityIndex, confidenceGap, fusedRoute, ledgerFingerprint }) {
  var replayEvents = events.filter(function(e){return e.at <= replayAt;}).slice(-5).reverse();
  return <div className="aar-layout"><section className="aar-summary"><div className="section-head"><div><div className="eyebrow">AFTER-ACTION REVIEW</div><h2>Decision reconstruction</h2></div><div className="export-actions"><button className="ghost-btn" onClick={() => exportAAR('html')}>HTML</button><button className="primary-btn" onClick={() => exportAAR('json')}>JSON ↗</button></div></div><div className="score-row"><div><small>DECISIONS</small><strong>{metrics.count}</strong></div><div><small>AVG CONFIDENCE</small><strong>{metrics.avgConfidence}%</strong></div><div><small>EVIDENCE COVERAGE</small><strong>{metrics.evidenceCoverage}%</strong></div><div><small>TEAM COHERENCE</small><strong>{metrics.teamCoherence}%</strong></div></div><div className="aar-science"><div><small>GLICKO-2 SKILL</small><strong>{metrics.skillRating} ± {metrics.skillRd}</strong></div><div><small>DECISION ACCURACY</small><strong>{metrics.accuracy === null ? '—' : metrics.accuracy + '%'}</strong></div><div><small>BRIER SCORE</small><strong>{metrics.brier === null ? '—' : metrics.brier}</strong></div><div><small>SL UNCERTAINTY</small><strong>{fusedRoute.uncertainty}%</strong></div></div><div className="aar-focus"><div><div className="eyebrow">ADAPTIVE TRAINING FINDINGS</div><h3>Observed focus areas</h3></div><div className="focus-pills">{focus.map(function(w){return <span key={w}>{w}</span>;})}</div></div><div className="aar-science"><div><small>INFORMATION INTEGRITY</small><strong>{integrityIndex}%</strong></div><div><small>CONFIDENCE GAP</small><strong>{confidenceGap}%</strong></div><div><small>FUSED CLAIM</small><strong>{fusedRoute.label} · {fusedRoute.confidence}%</strong></div><div><small>AUDIT FINGERPRINT</small><strong>{ledgerFingerprint}</strong></div></div><div className="replay-bar"><div className="replay-head"><span>REPLAY T+{fmtClock(replayAt)}</span><span className="muted">Reconstruct the information timeline</span></div><input type="range" min="0" max={Math.max(elapsed,1)} value={Math.min(replayAt,elapsed)} onChange={function(e){setReplayAt(Number(e.target.value));}}/></div><div className="aar-table"><div className="table-head"><span>TIME</span><span>ACTOR</span><span>ACTION</span><span>TRACE</span></div>{decisions.slice().sort(function(a,b){return a.at-b.at;}).map(function(d){return <div className="table-row" key={d.id}><span>T+{fmtClock(d.at)}</span><span>{d.actor}</span><span className="badge decision">{d.action}</span><span><strong>{d.rationale}</strong><small>{(d.evidence || []).length} evidence · {d.confidence}% confidence · {d.explainability?.robustness?.fragile ? 'FRAGILE' : 'COUNTERFACTUAL-TESTED'}</small>{d.explainability?.pivotal && <small>Pivotal: {d.explainability.pivotal.id} · {d.explainability.pivotal.impact} pts leverage</small>}</span></div>;})}{!decisions.length && <div className="empty-state">No decisions recorded yet. Use the cockpit to create an auditable decision trace.</div>}</div></section><aside className="replay-card"><div className="eyebrow">GROUND TRUTH REVEAL</div><h3>What the trainee could not see</h3><p className="replay-note">Ground truth is UI-hidden during play and appears only in AAR; this presentation boundary is not a security control.</p><div className="truth-list">{reports.map(function(r){return <div className="truth-row" key={r.id}><div><strong>{r.id}</strong><small>{r.source}</small></div><span>{r.truth}</span><b>{trustScore(r)}%</b></div>;})}</div><div className="panel-divider"></div><div className="eyebrow">REPLAY EVENTS</div><div className="replay-line">{replayEvents.map(function(e,i){return <div className="replay-item" key={e.at+'-'+i}><i className={i === 0 ? 'replay-dot current' : 'replay-dot'}></i><small>T+{fmtClock(e.at)}</small><span>{e.text}</span></div>;})}{!replayEvents.length && <div className="empty-state">Move the replay slider to reconstruct the exercise.</div>}</div></aside></div>;
}

createRoot(document.getElementById('root')).render(<App />);
