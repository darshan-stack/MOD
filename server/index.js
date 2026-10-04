/**
 * Sentinel Grid Omega — reference real-time training session server.
 *
 * Dependency-free Node HTTP/SSE reference for an authorized training LAN.
 * It is intentionally synthetic: no operational C2, targeting, or real-world data.
 *
 * Run:
 *   npm run backend
 *
 * Endpoints:
 *   POST /api/session
 *   POST /api/session/:id/join
 *   GET  /api/session/:id/stream?role=OC&participantId=p1
 *   POST /api/session/:id/command
 *   GET  /api/session/:id/state?role=OC
 */

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { simulationPlan } from '../src/engine/realtimeSimulation.js';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';

const sessions = new Map();

const BASE_REPORTS = [
  { id: 'R-701', time: 'SIM', source: 'Raven-2 / UAS', domain: 'AIR', topic: 'kestrel_presence', stance: 'PRESENT', headline: 'Two thermal signatures near OBJ KESTREL', detail: 'Synthetic thermal report · freshness decays with exercise time', confidence: 72, freshness: 100, state: 'live', truth: 'STALE', corroborated: 1, icon: '◌' },
  { id: 'R-702', time: 'SIM', source: 'Alpha 1-1', domain: 'LAND', topic: 'route_echo', stance: 'CLEAR', headline: 'Route ECHO is clear for movement', detail: 'Synthetic authenticated voice report', confidence: 86, freshness: 100, state: 'live', truth: 'SUPPORTED', corroborated: 2, icon: '⌁' },
  { id: 'R-703', time: 'SIM', source: 'NetWatch', domain: 'CYBER', topic: 'credential_replay', stance: 'ANOMALY', headline: 'Possible credential replay on logistics node', detail: 'Synthetic cyber indicator · corroboration pending', confidence: 58, freshness: 100, state: 'live', truth: 'SUPPORTED', corroborated: 1, icon: '◇' },
  { id: 'R-704', time: 'SIM', source: 'Echo 3', domain: 'EW', topic: 'gnss_reliability', stance: 'UNRELIABLE', headline: 'Navigation reliability degraded', detail: 'Synthetic EW indicator · alternate reference required', confidence: 91, freshness: 100, state: 'live', truth: 'SUPPORTED', corroborated: 2, icon: '▧' },
];

const ROLE_DOMAINS = {
  OC: ['ALL'],
  LAND: ['LAND'],
  AIR: ['AIR'],
  CYBER: ['CYBER'],
  EW: ['EW'],
};

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
  });
  res.end(body);
}

function sse(res, event, payload) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function createSession(scenarioKey = 'ALPHA-07') {
  const session = {
    id: 'SG-' + Math.floor(100000 + Math.random() * 900000),
    scenarioKey,
    elapsed: 0,
    running: false,
    speed: 1,
    autoSimulation: true,
    netHealth: 58,
    latency: 68,
    dropout: 21,
    conflict: 28,
    freshnessDecay: 34,
    participants: new Map(),
    decisions: [],
    messages: [],
    events: [],
    reports: BASE_REPORTS.map(report => ({ ...report })),
    clients: new Set(),
    triggered: new Set(),
    timer: null,
  };
  session.events.push({
    id: randomUUID(),
    at: 0,
    tag: 'SYSTEM',
    text: `Session ${session.id} created for ${scenarioKey}.`,
  });
  sessions.set(session.id, session);
  return session;
}

function getSession(id) {
  return sessions.get(id);
}

function roleVisibleReports(session, role) {
  // The reference server preserves asymmetric-information training semantics.
  // OC sees the complete synthetic ledger; cell seats see only their domain.
  const allowed = ROLE_DOMAINS[role] || ROLE_DOMAINS.OC;
  if (allowed.includes('ALL')) return session.reports;
  return session.reports.filter(report => allowed.includes(report.domain));
}

function snapshot(session, role = 'OC') {
  return {
    sessionId: session.id,
    scenarioKey: session.scenarioKey,
    elapsed: session.elapsed,
    running: session.running,
    speed: session.speed,
    autoSimulation: session.autoSimulation,
    network: {
      netHealth: session.netHealth,
      latency: session.latency,
      dropout: session.dropout,
      conflict: session.conflict,
      freshnessDecay: session.freshnessDecay,
    },
    participants: [...session.participants.values()].map(({ id, name, role: participantRole, status }) => ({
      id, name, role: participantRole, status,
    })),
    reports: roleVisibleReports(session, role),
    decisions: session.decisions,
    messages: session.messages,
    events: session.events,
  };
}

function broadcast(session, event, payload) {
  for (const client of session.clients) {
    const role = client.role || 'OC';
    sse(client.res, event, { ...payload, state: snapshot(session, role) });
  }
}

function inject(session, kind, at = session.elapsed) {
  if (kind === 'delay') {
    session.latency = Math.min(100, session.latency + 18);
    session.freshnessDecay = Math.min(100, session.freshnessDecay + 10);
    session.reports = session.reports.map(report =>
      report.domain === 'AIR'
        ? { ...report, freshness: Math.max(0, report.freshness - 14), state: report.freshness - 14 < 40 ? 'stale' : report.state }
        : report
    );
  }

  if (kind === 'dropout') {
    session.dropout = Math.min(100, session.dropout + 14);
    session.netHealth = Math.max(0, session.netHealth - 13);
    session.participants.forEach(p => {
      if (p.role === 'CYBER') p.status = 'offline';
    });
    session.reports = session.reports.map(report =>
      report.domain === 'CYBER'
        ? { ...report, state: 'dropped', detail: 'Source unreachable · last packet retained locally' }
        : report
    );
  }

  if (kind === 'conflict') {
    session.conflict = Math.min(100, session.conflict + 16);
    const base = session.reports.find(r => r.id === 'R-702');
    if (base) base.state = 'conflict', base.confidence = 42;
    if (!session.reports.some(r => r.id === 'R-705')) {
      session.reports.push({
        id: 'R-705',
        time: 'SIM',
        source: 'EW Relay',
        domain: 'EW',
        topic: 'route_echo',
        stance: 'BLOCKED',
        headline: 'CONFLICT: Route ECHO status disputed',
        detail: 'Independent synthetic report disagrees with an earlier land report',
        confidence: 61,
        freshness: 89,
        state: 'conflict',
        truth: 'CONTRADICTORY',
        corroborated: 1,
        icon: '↯',
      });
    }
  }

  if (kind === 'stale') {
    session.freshnessDecay = Math.min(100, session.freshnessDecay + 18);
    session.reports = session.reports.map(report =>
      report.id === 'R-701'
        ? { ...report, state: 'stale', freshness: 19, detail: 'Effective age beyond the normal decision window' }
        : report
    );
  }

  if (kind === 'split') {
    session.dropout = Math.min(100, session.dropout + 18);
    session.netHealth = Math.max(0, session.netHealth - 18);
    session.participants.forEach(p => {
      if (p.role !== 'OC') p.status = p.status === 'offline' ? 'offline' : 'degraded';
    });
  }

  session.events.push({
    id: randomUUID(),
    at,
    tag: 'INJECT',
    text: `${kind.toUpperCase()} · synthetic information-environment change`,
  });
}

function resetSession(session, scenarioKey) {
  session.scenarioKey = scenarioKey || session.scenarioKey;
  session.elapsed = 0;
  session.running = false;
  session.triggered.clear();
  session.decisions = [];
  session.messages = [];
  session.reports = [];
  session.events = [{
    id: randomUUID(),
    at: 0,
    tag: 'SYSTEM',
    text: `Scenario ${session.scenarioKey} loaded. Ground truth remains hidden until AAR.`,
  }];
  session.netHealth = 58;
  session.latency = 68;
  session.dropout = 21;
  session.conflict = 28;
  session.freshnessDecay = 34;
}

function startClock(session) {
  if (session.timer) clearInterval(session.timer);
  session.timer = setInterval(() => {
    if (!session.running) return;
    session.elapsed += session.speed;

    for (const planned of simulationPlan(session.scenarioKey)) {
      if (session.autoSimulation && planned.at <= session.elapsed && !session.triggered.has(planned.id)) {
        session.triggered.add(planned.id);
        inject(session, planned.kind, planned.at);
        broadcast(session, 'simulation', { type: 'SIMULATION_EVENT', event: planned });
      }
    }

    const decay = Math.max(0, session.freshnessDecay / 60) * Math.max(1, session.speed);
    session.reports = session.reports.map(report => report.state === 'dropped'
      ? report
      : { ...report, freshness: Math.max(0, report.freshness - decay), state: report.freshness - decay < 40 ? 'stale' : report.state });

    broadcast(session, 'tick', { type: 'CLOCK_TICK', elapsed: session.elapsed });
  }, 1000);
  session.timer.unref?.();
}

function ensureSessionTimer(session) {
  if (!session.timer) startClock(session);
}

function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    return res.end();
  }

  if (req.method === 'POST' && url.pathname === '/api/session') {
    const body = parseBody(req);
    return body.then(data => {
      const session = createSession(data.scenarioKey || 'ALPHA-07');
      ensureSessionTimer(session);
      return json(res, 201, { session: snapshot(session), sessionId: session.id });
    }).catch(() => json(res, 400, { error: 'invalid JSON payload' }));
  }

  const match = url.pathname.match(/^\/api\/session\/([^/]+)(?:\/(stream|join|command|state))?$/);
  if (!match) return json(res, 404, { error: 'not found' });

  const session = getSession(match[1]);
  if (!session) return json(res, 404, { error: 'session not found' });
  ensureSessionTimer(session);

  if (req.method === 'GET' && match[2] === 'state') {
    return json(res, 200, snapshot(session, url.searchParams.get('role') || 'OC'));
  }

  if (req.method === 'GET' && match[2] === 'stream') {
    const role = url.searchParams.get('role') || 'OC';
    const participantId = url.searchParams.get('participantId') || randomUUID();
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
      'access-control-allow-origin': '*',
    });
    res.write(': connected\n\n');
    const client = { res, role, participantId };
    session.clients.add(client);
    sse(res, 'snapshot', { state: snapshot(session, role) });
    req.on('close', () => session.clients.delete(client));
    return;
  }

  if (req.method === 'POST' && match[2] === 'join') {
    return parseBody(req).then(data => {
      const participant = {
        id: data.participantId || randomUUID(),
        name: String(data.name || 'Trainee'),
        role: ROLE_DOMAINS[data.role] ? data.role : 'OC',
        status: 'online',
      };
      session.participants.set(participant.id, participant);
      broadcast(session, 'presence', { type: 'PRESENCE', participant });
      return json(res, 200, { participant, session: snapshot(session, participant.role) });
    }).catch(() => json(res, 400, { error: 'invalid JSON payload' }));
  }

  if (req.method === 'POST' && match[2] === 'command') {
    return parseBody(req).then(data => {
      if (data.type === 'CLOCK_CONTROL') session.running = Boolean(data.running);
      if (data.type === 'SIMULATION_OPTIONS') {
        session.autoSimulation = Boolean(data.autoSimulation);
        session.speed = [1, 2, 4, 8].includes(Number(data.speed)) ? Number(data.speed) : 1;
      }
      if (data.type === 'LOAD_SCENARIO') resetSession(session, data.scenarioKey);
      if (data.type === 'PARAM') {
        const allowed = new Set(['netHealth', 'latency', 'dropout', 'conflict', 'freshnessDecay']);
        if (allowed.has(data.field)) session[data.field] = Number(data.value);
      }
      if (data.type === 'INJECT') inject(session, data.kind, Number.isFinite(data.at) ? data.at : session.elapsed);
      if (data.type === 'TEAM_MESSAGE') {
        session.messages.push({ ...data.message, serverReceivedAt: session.elapsed });
      }
      if (data.type === 'DECISION') {
        session.decisions.push({ ...data.decision, serverReceivedAt: session.elapsed });
      }
      broadcast(session, 'state', { type: 'STATE_UPDATE' });
      return json(res, 200, { ok: true, session: snapshot(session, 'OC') });
    }).catch(() => json(res, 400, { error: 'invalid JSON payload' }));
  }

  return json(res, 405, { error: 'method not allowed' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(error => {
    console.error(error);
    if (!res.headersSent) json(res, 500, { error: 'internal server error' });
    else res.end();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Sentinel Grid real-time reference server listening on http://${HOST}:${PORT}`);
  console.log('Synthetic training mode only — no operational interfaces or data.');
});
