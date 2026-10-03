
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const SCENARIOS = {
  "ALPHA-07": { name: 'ALPHA-07 · Contested Approach', phase: '02 / degraded information', objective: 'Maintain a coherent picture while reports diverge.', difficulty: 6, comms: 42, latency: 68, dropout: 21, conflict: 28 },
  "CIPHER-11": { name: 'CIPHER-11 · Network Fracture', phase: '03 / cross-domain handoff', objective: 'Coordinate a small team while cyber and EW indicators disagree.', difficulty: 8, comms: 58, latency: 92, dropout: 36, conflict: 46 },
  "NORTHSTAR-03": { name: 'NORTHSTAR-03 · Quiet Window', phase: '01 / baseline', objective: 'Build a reliable baseline before the information picture degrades.', difficulty: 3, comms: 16, latency: 28, dropout: 7, conflict: 8 }
};

const BASE_REPORTS = [
  { id: 'R-701', time: '14:32:08Z', source: 'Raven-2 / UAS', domain: 'AIR', headline: 'Two thermal signatures near OBJ KESTREL', detail: 'Vector 118° · low-confidence due to feed age', confidence: 72, freshness: 38, state: 'stale', truth: 'STALE', corroborated: 1, icon: '◌' },
  { id: 'R-702', time: '14:34:41Z', source: 'Alpha 1-1', domain: 'LAND', headline: 'Route ECHO is clear for movement', detail: 'Authenticated voice report · route status current', confidence: 86, freshness: 91, state: 'live', truth: 'SUPPORTED', corroborated: 2, icon: '⌁' },
  { id: 'R-703', time: '14:35:03Z', source: 'NetWatch', domain: 'CYBER', headline: 'Possible credential replay on logistics node', detail: 'Corroboration pending · low-frequency anomaly', confidence: 58, freshness: 86, state: 'live', truth: 'SUPPORTED', corroborated: 1, icon: '◇' },
  { id: 'R-704', time: '14:35:17Z', source: 'Echo 3', domain: 'EW', headline: 'GNSS drift detected. Position unreliable.', detail: '2 km radius uncertainty · alternate reference required', confidence: 91, freshness: 94, state: 'jammed', truth: 'SUPPORTED', corroborated: 2, icon: '▧' }
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
const stamp = function() { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
const trustScore = function(r) {
  var base = r.confidence * 0.52 + r.freshness * 0.28 + Math.min(r.corroborated, 3) * 6.5;
  var penalty = r.state === 'conflict' ? 18 : r.state === 'dropped' ? 28 : 0;
  return clamp(Math.round(base - penalty));
};

function App() {
  const [activeTab, setActiveTab] = useState('cockpit');
  const [mode, setMode] = useState('trainee');
  const [scenarioKey, setScenarioKey] = useState('ALPHA-07');
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
  const channelRef = useRef(null);

  const scenario = SCENARIOS[scenarioKey];

  useEffect(function() {
    if (!running) return undefined;
    var timer = setInterval(function() { setElapsed(function(v) { return v + 1; }); }, 1000);
    return function() { clearInterval(timer); };
  }, [running]);

  useEffect(function() { setReplayAt(elapsed); }, [elapsed]);

  useEffect(function() {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    var channel = new BroadcastChannel('sentinel-grid-room');
    channelRef.current = channel;
    channel.onmessage = function(event) {
      var p = event.data || {};
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
    if (channelRef.current) channelRef.current.postMessage(payload);
  };

  const addEvent = function(tag, text) {
    var event = { at: elapsed, tag: tag, text: text };
    setEvents(function(current) { return current.concat(event); });
    broadcast({ type: 'EVENT', event: event });
  };

  const visibleReports = useMemo(function() {
    return selectedDomain === 'ALL' ? reports : reports.filter(function(r) { return r.domain === selectedDomain; });
  }, [reports, selectedDomain]);

  const trustRows = useMemo(function() {
    return reports.map(function(r) { return { ...r, trust: trustScore(r) }; }).sort(function(a, b) { return b.trust - a.trust; });
  }, [reports]);

  const metrics = useMemo(function() {
    var count = decisions.length;
    var avgConfidence = count ? Math.round(decisions.reduce(function(a, d) { return a + Number(d.confidence); }, 0) / count) : 0;
    var evidenceCoverage = count ? Math.round(decisions.reduce(function(a, d) { return a + Math.min((d.evidence || []).length / 3, 1); }, 0) / count * 100) : 0;
    var contradictionUse = reports.some(function(r) { return r.state === 'conflict'; })
      ? clamp(52 + decisions.filter(function(d) { return (d.evidence || []).some(function(id) { var r = reports.find(function(x) { return x.id === id; }); return r && r.state === 'conflict'; }); }).length * 13)
      : 76;
    var teamCoherence = clamp(Math.round(netHealth * 0.45 + (100 - dropout) * 0.25 + (messages.length > 3 ? 25 : 15)));
    return { count: count, avgConfidence: avgConfidence, evidenceCoverage: evidenceCoverage, contradictionUse: contradictionUse, teamCoherence: teamCoherence };
  }, [decisions, reports, netHealth, dropout, messages.length]);

  const focus = useMemo(function() {
    var out = [];
    if (decisions.some(function(d) { return (d.evidence || []).some(function(id) { var r = reports.find(function(x) { return x.id === id; }); return r && r.state === 'stale'; }); })) out.push('stale-data handling');
    if (reports.some(function(r) { return r.state === 'conflict'; })) out.push('contradiction handling');
    if (decisions.some(function(d) { return d.confidence > 80 && d.action === 'HOLD'; })) out.push('confidence calibration');
    if (decisions.length < 2) out.push('decision tempo');
    return out.length ? out : ['evidence corroboration'];
  }, [decisions, reports]);

  const inject = function(kind) {
    if (kind === 'delay') {
      setLatency(function(v) { return clamp(v + 18); });
      setFreshnessDecay(function(v) { return clamp(v + 10); });
      setReports(function(current) { return current.map(function(r) { return r.domain === 'AIR' ? { ...r, freshness: clamp(r.freshness - 14), state: clamp(r.freshness - 14) < 40 ? 'stale' : r.state } : r; }); });
      addEvent('INJECT', 'ISR feed delayed. Freshness decay accelerated.');
    }
    if (kind === 'dropout') {
      setDropout(function(v) { return clamp(v + 14); });
      setNetHealth(function(v) { return clamp(v - 13); });
      setMembers(function(current) { return current.map(function(m) { return m.id === 'patel' ? { ...m, status: 'offline' } : m; }); });
      setReports(function(current) { return current.map(function(r) { return r.id === 'R-703' ? { ...r, state: 'dropped', detail: 'Source unreachable · last packet retained locally' } : r; }); });
      addEvent('INJECT', 'NETWATCH node dropped. Last-known data retained.');
    }
    if (kind === 'conflict') {
      setConflict(function(v) { return clamp(v + 16); });
      setReports(function(current) { return current.map(function(r) {
        return r.id === 'R-702' ? { ...r, state: 'conflict', confidence: 42, headline: 'CONFLICT: Route ECHO status disputed', detail: 'Echo 3 voice report contradicts the earlier route status', corroborated: 3 } : r;
      }); });
      addEvent('INJECT', 'Conflicting route report injected from an independent source.');
    }
    if (kind === 'stale') {
      setFreshnessDecay(function(v) { return clamp(v + 18); });
      setReports(function(current) { return current.map(function(r) { return r.id === 'R-701' ? { ...r, state: 'stale', freshness: 19, detail: 'Effective age 3m 12s · review before relying on it' } : r; }); });
      addEvent('INJECT', 'Raven-2 feed aged beyond the normal decision window.');
    }
    if (kind === 'split') {
      setTeamChannelDegraded(true);
      setDropout(function(v) { return clamp(v + 18); });
      setNetHealth(function(v) { return clamp(v - 18); });
      addEvent('INJECT', 'Team channel split. Cross-cell transmissions may be delayed or dropped.');
    }
  };

  const loadScenario = function(key) {
    var s = SCENARIOS[key];
    setScenarioKey(key);
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
    setEvents([{ at: 0, tag: 'SYSTEM', text: 'Loaded ' + s.name + '. Ground truth remains hidden until AAR.' }]);
  };

  const toggleEvidence = function(id) {
    setSelectedEvidence(function(current) {
      return current.indexOf(id) >= 0 ? current.filter(function(x) { return x !== id; }) : current.concat(id);
    });
  };

  const logDecision = function() {
    if (!decisionText.trim()) return;
    var d = {
      id: 'D-' + String(decisions.length + 1).padStart(3, '0'),
      at: elapsed,
      actor: activeSeat === 'you' ? 'You / OC' : members.find(function(m) { return m.id === activeSeat; }).name,
      role: members.find(function(m) { return m.id === activeSeat; }).role,
      action: decisionType,
      rationale: decisionText.trim(),
      confidence: Number(confidence),
      evidence: selectedEvidence,
    };
    setDecisions(function(current) { return [d].concat(current); });
    addEvent('DECISION', d.id + ' · ' + d.action + ' logged with ' + d.evidence.length + ' evidence item(s).');
    broadcast({ type: 'DECISION', decision: d });
    setDecisionText('');
    setSelectedEvidence([]);
  };

  const sendMessage = function() {
    if (!messageText.trim()) return;
    var msg = { id: 'M-' + Date.now(), at: elapsed, actor: 'Arjun Mehta', initials: 'AM', text: messageText.trim() };
    setMessages(function(current) { return [msg].concat(current); });
    addEvent('TEAM', 'You → ALPHA CELL: ' + msg.text);
    broadcast({ type: 'TEAM_MESSAGE', message: msg });
    setMessageText('');
  };

  const generateNextExercise = function() {
    var targetDifficulty = clamp(6 + focus.length, 1, 10);
    setScenarioKey('CIPHER-11');
    setNetHealth(36);
    setLatency(clamp(72 + focus.length * 6));
    setDropout(36);
    setConflict(clamp(34 + focus.length * 9));
    setFreshnessDecay(58);
    setReports(cloneReports().map(function(r) { return r.id === 'R-701' ? { ...r, freshness: 24, state: 'stale' } : r; }));
    setElapsed(0);
    setReplayAt(0);
    setDecisions([]);
    setEvents([{ at: 0, tag: 'ADAPT', text: 'Adaptive Director generated a targeted exercise at difficulty ' + targetDifficulty + '/10 for ' + focus.join(', ') + '.' }]);
    addEvent('ADAPT', 'Training loop recalibrated: observe → diagnose → target weakness.');
  };

  const joinSeat = function(member) {
    setActiveSeat(member.id);
    var updated = { ...member, status: 'online' };
    setMembers(function(current) { return current.map(function(m) { return m.id === member.id ? updated : m; }); });
    broadcast({ type: 'JOIN', member: updated });
  };

  const exportAAR = function(format) {
    var payload = {
      product: 'Sentinel Grid Omega',
      exercise: scenario.name,
      exportedAt: new Date().toISOString(),
      durationSeconds: elapsed,
      network: { netHealth: netHealth, latency: latency, dropout: dropout, conflict: conflict, freshnessDecay: freshnessDecay },
      trainingMetrics: metrics,
      observedFocus: focus,
      decisions: decisions.slice().sort(function(a, b) { return a.at - b.at; }),
      eventTimeline: events.slice().sort(function(a, b) { return a.at - b.at; }),
      informationLedger: reports.map(function(r) { return { id: r.id, source: r.source, domain: r.domain, state: r.state, confidence: r.confidence, freshness: r.freshness, trustScore: trustScore(r), groundTruth: r.truth }; }),
      teamMessages: messages.slice().sort(function(a, b) { return a.at - b.at; }),
      note: 'Synthetic training analytics; not an operational assessment.'
    };
    var text = '';
    var mime = 'application/json';
    var filename = 'sentinel-grid-aar.json';
    if (format === 'html') {
      mime = 'text/html';
      filename = 'sentinel-grid-aar.html';
      text = '<!doctype html><html><head><meta charset="utf-8"><title>Sentinel Grid Omega AAR</title><style>body{font-family:Arial;background:#071019;color:#dce7ee;padding:30px}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #294453;text-align:left}.card{border:1px solid #294453;padding:18px;margin:14px 0;background:#0d1923}</style></head><body><h1>Sentinel Grid Omega — After Action Review</h1><p>' + scenario.name + ' · T+' + fmtClock(elapsed) + '</p><div class="card"><h2>Training metrics</h2><p>Decisions: ' + metrics.count + ' · Avg confidence: ' + metrics.avgConfidence + '% · Evidence coverage: ' + metrics.evidenceCoverage + '% · Team coherence: ' + metrics.teamCoherence + '%</p></div><div class="card"><h2>Observed training focus</h2><p>' + focus.join(' · ') + '</p></div><div class="card"><h2>Decision timeline</h2>' + decisions.slice().sort(function(a,b){return a.at-b.at;}).map(function(d){return '<p><b>T+' + fmtClock(d.at) + '</b> · ' + d.action + ' · ' + d.confidence + '% · ' + d.rationale + '</p>';}).join('') + '</div><div class="card"><h2>Information ledger / ground truth reveal</h2><table><tr><th>ID</th><th>Source</th><th>State</th><th>Trust</th><th>Ground truth</th></tr>' + reports.map(function(r){return '<tr><td>' + r.id + '</td><td>' + r.source + '</td><td>' + r.state + '</td><td>' + trustScore(r) + '%</td><td>' + r.truth + '</td></tr>';}).join('') + '</table></div></body></html>';
    } else {
      text = JSON.stringify(payload, null, 2);
    }
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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
          <div className="nav-label instructor-label">TRAINING DIRECTOR</div>
          <button className={activeTab === 'director' ? 'nav-item active' : 'nav-item'} onClick={() => { setMode('instructor'); setActiveTab('director'); }}><span className="icon">⚙</span>Exercise director</button>
          <button className="nav-item" onClick={() => exportAAR('html')}><span className="icon">⇩</span>Export AAR</button>
        </nav>
        <div className="sidebar-footer"><div className="user-dot">AM</div><div><strong>Arjun Mehta</strong><small>OC / ALPHA CELL</small></div><span className="more">•••</span></div>
      </aside>

      <main className="main">
        <header className="topbar"><div><div className="breadcrumb">EXERCISE / {scenarioKey} / <span>{activeTab.toUpperCase()}</span></div><h1>{activeTab === 'cockpit' ? 'Decision cockpit' : activeTab === 'team' ? 'Team room' : activeTab === 'aar' ? 'AAR & replay' : 'Exercise director'}</h1></div><div className="top-actions"><div className="sync"><span className="sync-dot"></span>{mode.toUpperCase()} <small>LOCAL / AUDITABLE</small></div><button className="ghost-btn" onClick={() => setRunning(function(v){return !v;})}>{running ? 'PAUSE' : 'RESUME'}</button><button className="avatar">AM</button></div></header>

        {mode === 'instructor' && activeTab === 'cockpit' && <section className="director-banner"><div><div className="eyebrow">INSTRUCTOR VIEW</div><strong>Observe the exercise without revealing hidden ground truth.</strong><span>Live decision traces and degradation state are visible to the director.</span></div><button className="primary-btn" onClick={() => setActiveTab('director')}>OPEN DIRECTOR ↗</button></section>}

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
                <div className="panel-head"><div><div className="eyebrow">INFORMATION INTEGRITY</div><h2>Trust state</h2></div><span className="lock">◎</span></div><p className="panel-note">Trust combines confidence, freshness and corroboration. Hidden truth is withheld until AAR.</p>
                <div className="trust-stack">{trustRows.map(function(r){return <div className="trust-card" key={r.id}><div><span>{r.id}</span><small>{r.source}</small></div><strong>{r.trust}%</strong><div className="trust-bar"><span style={{width: r.trust + '%'}}></span></div></div>;})}</div>
                <div className="panel-divider"></div>
                <div className="panel-head small"><h3>Adaptive training focus</h3><span className="badge live">{focus.length} FOCUS</span></div><div className="focus-list">{focus.map(function(f){return <div key={f}><span>◎</span>{f}</div>;})}</div>
                <div className="panel-divider"></div>
                <div className="panel-head small"><h3>Team presence</h3><span className="badge live">{members.filter(function(m){return m.status === 'online';}).length} ONLINE</span></div><div className="presence">{members.map(function(m){return <Presence key={m.id} {...m} active={m.id === activeSeat} onClick={() => joinSeat(m)} />;})}</div>
              </aside>
            </div>

            <section className="bottom-grid"><div className="timeline-panel"><div className="section-head compact"><div><div className="eyebrow">LIVE EVENT STREAM</div><h2>What changed</h2></div><span className="live-indicator"><i className="pulse"></i> CAPTURING</span></div><div className="event-list">{events.slice(-6).reverse().map(function(e,i){return <div className="event-row" key={e.at + '-' + i}><span className="event-time">T+{fmtClock(e.at)}</span><span className={'badge ' + e.tag.toLowerCase()}>{e.tag}</span><span>{e.text}</span></div>;})}</div></div><div className="analytics-panel"><div className="section-head compact"><div><div className="eyebrow">DECISION INTELLIGENCE</div><h2>Training telemetry</h2></div><span className="micro-label">SYNTHETIC</span></div><div className="metric-grid"><Metric label="DECISIONS" value={metrics.count}/><Metric label="EVIDENCE COVERAGE" value={metrics.evidenceCoverage + '%'}/><Metric label="CONTRADICTION" value={metrics.contradictionUse + '%'}/><Metric label="TEAM COHERENCE" value={metrics.teamCoherence + '%'}/></div></div></section>
          </>
        )}

        {activeTab === 'team' && <TeamPanel members={members} activeSeat={activeSeat} joinSeat={joinSeat} messages={messages} messageText={messageText} setMessageText={setMessageText} sendMessage={sendMessage} degraded={teamChannelDegraded}/>}
        {activeTab === 'director' && <DirectorPanel scenarioKey={scenarioKey} scenario={scenario} onScenario={loadScenario} netHealth={netHealth} setNetHealth={setNetHealth} latency={latency} setLatency={setLatency} dropout={dropout} setDropout={setDropout} conflict={conflict} setConflict={setConflict} freshnessDecay={freshnessDecay} setFreshnessDecay={setFreshnessDecay} inject={inject} metrics={metrics} events={events} decisions={decisions} focus={focus} generateNextExercise={generateNextExercise}/>}
        {activeTab === 'aar' && <AARPanel decisions={decisions} events={events} reports={reports} metrics={metrics} focus={focus} replayAt={replayAt} setReplayAt={setReplayAt} elapsed={elapsed} exportAAR={exportAAR}/>}

        <footer className="app-footer"><span>Sentinel Grid Ω · synthetic training environment · no operational data</span><span>Browser-local room · auditable ledger · hidden-truth AAR</span></footer>
      </main>
    </div>
  );
}

function Metric({ label, value }) { return <div className="metric"><small>{label}</small><strong>{value}</strong></div>; }

function Presence(props) {
  return <button className={'presence-row ' + (props.active ? 'active' : '')} onClick={props.onClick}><div className={'mini-avatar ' + (props.active ? 'me' : '')}>{props.initials}</div><div><strong>{props.name}</strong><small>{props.role}</small></div><span className={props.status === 'online' ? 'online-dot' : props.status === 'degraded' ? 'degraded-dot' : 'away-dot'}></span></button>;
}

function TeamPanel({ members, activeSeat, joinSeat, messages, messageText, setMessageText, sendMessage, degraded }) {
  return <div className="team-layout"><section className="chat-panel"><div className="section-head"><div><div className="eyebrow">TEAM ROOM</div><h2>ALPHA CELL <span className="channel-lock">⌁</span></h2></div><span className={'badge ' + (degraded ? 'ew' : 'live')}>{degraded ? 'DEGRADED NET' : 'STABLE NET'}</span></div><div className="room-banner"><div><strong>Multi-seat prototype</strong><span>Open this Vite URL in another browser tab to join the local team room.</span></div><span className="room-chip">BroadcastChannel</span></div><div className="chat-messages">{messages.slice().reverse().map(function(c){return <div className="chat-message" key={c.id}><div className="mini-avatar">{c.initials}</div><div><div className="chat-meta"><strong>{c.actor}</strong><span>T+{fmtClock(c.at)}</span></div><p>{c.text}</p></div></div>;})}<div className="system-message">Critical traffic may be delayed, dropped or arrive out of order. Verify before escalating.</div></div><div className="composer"><textarea value={messageText} onChange={function(e){setMessageText(e.target.value);}} onKeyDown={function(e){if(e.key === 'Enter' && !e.shiftKey){e.preventDefault();sendMessage();}}} placeholder="Transmit to ALPHA CELL…"/><button className="primary-btn" onClick={sendMessage}>TRANSMIT ↗</button></div></section><aside className="team-side"><div className="eyebrow">TEAM SEATS</div>{members.map(function(m){return <button key={m.id} className={activeSeat === m.id ? 'channel active' : 'channel'} onClick={() => joinSeat(m)}><span>{m.initials}</span>{m.role}<small>{m.status}</small></button>;})}<div className="side-tip"><strong>Training cue</strong><p>Track source, age, corroboration and contradiction before committing a decision.</p></div></aside></div>;
}

function DirectorPanel({ scenarioKey, scenario, onScenario, netHealth, setNetHealth, latency, setLatency, dropout, setDropout, conflict, setConflict, freshnessDecay, setFreshnessDecay, inject, metrics, events, decisions, focus, generateNextExercise }) {
  return <div className="director-layout"><section className="director-main"><div className="section-head"><div><div className="eyebrow">SCENARIO DIRECTOR</div><h2>Inject friction without breaking exercise flow</h2></div><span className="badge live">LIVE CONTROL</span></div><div className="scenario-picker">{Object.entries(SCENARIOS).map(function(pair){var key=pair[0], item=pair[1];return <button key={key} className={scenarioKey === key ? 'scenario-card active' : 'scenario-card'} onClick={() => onScenario(key)}><small>SCENARIO</small><strong>{key}</strong><span>{item.phase}</span><span>Difficulty {item.difficulty}/10</span></button>;})}</div><div className="director-controls"><Control label="NETWORK HEALTH" value={netHealth} suffix="%" onChange={setNetHealth}/><Control label="TELEMETRY LATENCY" value={latency} suffix="sec" onChange={setLatency}/><Control label="VOICE DROPOUT" value={dropout} suffix="%" onChange={setDropout}/><Control label="CONFLICT PRESSURE" value={conflict} suffix="%" onChange={setConflict}/><Control label="FRESHNESS DECAY" value={freshnessDecay} suffix="pts/min" onChange={setFreshnessDecay}/></div><div className="event-injection"><div className="section-head compact"><div><div className="eyebrow">MID-EXERCISE INJECTION</div><h2>Change the information environment</h2></div></div><div className="inject-grid large"><button onClick={() => inject('delay')}><span>◴</span><strong>Delay feed</strong><small>Increase age + latency</small></button><button onClick={() => inject('dropout')}><span>⌁</span><strong>Drop node</strong><small>Remove a source</small></button><button onClick={() => inject('conflict')}><span>↯</span><strong>Conflict report</strong><small>Create source disagreement</small></button><button onClick={() => inject('stale')}><span>◷</span><strong>Age report</strong><small>Force freshness decay</small></button><button onClick={() => inject('split')}><span>⫸</span><strong>Split team net</strong><small>Cross-cell delay/dropout</small></button></div></div><div className="director-footer-card"><div><small>NEXT TRAINING FOCUS</small><strong>{focus.join(' · ')}</strong></div><button className="primary-btn" onClick={generateNextExercise}>GENERATE NEXT EXERCISE ↗</button></div></section><aside className="director-side"><div className="eyebrow">LIVE MONITOR</div><h3>Team decision trace</h3><div className="monitor-grid"><Metric label="DECISIONS" value={metrics.count}/><Metric label="AVG CONFIDENCE" value={metrics.avgConfidence + '%'}/><Metric label="TEAM COHERENCE" value={metrics.teamCoherence + '%'}/><Metric label="EVIDENCE COVERAGE" value={metrics.evidenceCoverage + '%'}/></div><div className="panel-divider"></div><div className="eyebrow">LATEST DECISIONS</div><div className="decision-stream">{decisions.slice(0,6).map(function(d){return <div className="stream-row" key={d.id}><span>T+{fmtClock(d.at)}</span><strong>{d.action}</strong><small>{d.rationale}</small></div>;})}</div><div className="panel-divider"></div><div className="eyebrow">LATEST EVENTS</div><div className="decision-stream">{events.slice(-5).reverse().map(function(e,i){return <div className="stream-row" key={e.at+'-'+i}><span>T+{fmtClock(e.at)}</span><strong>{e.tag}</strong><small>{e.text}</small></div>;})}</div></aside></div>;
}

function Control({ label, value, suffix, onChange }) {
  return <div className="control"><div><label>{label}</label><strong>{Math.round(value)}<small>{suffix}</small></strong></div><input type="range" min="0" max="100" value={value} onChange={function(e){onChange(Number(e.target.value));}}/><div className="control-scale"><span>LOW</span><span>HIGH</span></div></div>;
}

function AARPanel({ decisions, events, reports, metrics, focus, replayAt, setReplayAt, elapsed, exportAAR }) {
  var replayEvents = events.filter(function(e){return e.at <= replayAt;}).slice(-5).reverse();
  return <div className="aar-layout"><section className="aar-summary"><div className="section-head"><div><div className="eyebrow">AFTER-ACTION REVIEW</div><h2>Decision reconstruction</h2></div><div className="export-actions"><button className="ghost-btn" onClick={() => exportAAR('html')}>HTML</button><button className="primary-btn" onClick={() => exportAAR('json')}>JSON ↗</button></div></div><div className="score-row"><div><small>DECISIONS</small><strong>{metrics.count}</strong></div><div><small>AVG CONFIDENCE</small><strong>{metrics.avgConfidence}%</strong></div><div><small>EVIDENCE COVERAGE</small><strong>{metrics.evidenceCoverage}%</strong></div><div><small>TEAM COHERENCE</small><strong>{metrics.teamCoherence}%</strong></div></div><div className="aar-focus"><div><div className="eyebrow">ADAPTIVE TRAINING FINDINGS</div><h3>Observed focus areas</h3></div><div className="focus-pills">{focus.map(function(w){return <span key={w}>{w}</span>;})}</div></div><div className="replay-bar"><div className="replay-head"><span>REPLAY T+{fmtClock(replayAt)}</span><span className="muted">Reconstruct the information timeline</span></div><input type="range" min="0" max={Math.max(elapsed,1)} value={Math.min(replayAt,elapsed)} onChange={function(e){setReplayAt(Number(e.target.value));}}/></div><div className="aar-table"><div className="table-head"><span>TIME</span><span>ACTOR</span><span>ACTION</span><span>TRACE</span></div>{decisions.slice().sort(function(a,b){return a.at-b.at;}).map(function(d){return <div className="table-row" key={d.id}><span>T+{fmtClock(d.at)}</span><span>{d.actor}</span><span className="badge decision">{d.action}</span><span><strong>{d.rationale}</strong><small>{(d.evidence || []).length} evidence · {d.confidence}% confidence</small></span></div>;})}{!decisions.length && <div className="empty-state">No decisions recorded yet. Use the cockpit to create an auditable decision trace.</div>}</div></section><aside className="replay-card"><div className="eyebrow">GROUND TRUTH REVEAL</div><h3>What the trainee could not see</h3><p className="replay-note">Ground truth is intentionally hidden during play and appears only in AAR, preventing hindsight contamination.</p><div className="truth-list">{reports.map(function(r){return <div className="truth-row" key={r.id}><div><strong>{r.id}</strong><small>{r.source}</small></div><span>{r.truth}</span><b>{trustScore(r)}%</b></div>;})}</div><div className="panel-divider"></div><div className="eyebrow">REPLAY EVENTS</div><div className="replay-line">{replayEvents.map(function(e,i){return <div className="replay-item" key={e.at+'-'+i}><i className={i === 0 ? 'replay-dot current' : 'replay-dot'}></i><small>T+{fmtClock(e.at)}</small><span>{e.text}</span></div>;})}{!replayEvents.length && <div className="empty-state">Move the replay slider to reconstruct the exercise.</div>}</div></aside></div>;
}

createRoot(document.getElementById('root')).render(<App />);
