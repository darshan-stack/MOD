
# Sentinel Grid Ω

Web-native multi-domain decision-making trainer for degraded communication environments — **SIH26248**.

## What this build implements

- Mid-exercise communication degradation: delay, dropout, freshness decay, conflict pressure and team-network split.
- Multi-domain information ledger with confidence, freshness, corroboration and a derived trust state.
- Hidden ground truth that remains inaccessible during play and is revealed during AAR.
- Evidence-linked decisions: a trainee selects the information used and records rationale + confidence.
- Multi-seat team coordination using the browser BroadcastChannel API; open the same Vite URL in two tabs for a local multiplayer demonstration.
- Instructor scenario director with scenario presets, live friction controls, mid-exercise injection and real-time decision/event monitoring.
- Adaptive training loop that diagnoses observed focus areas and generates the next exercise around them.
- Replay slider for reconstruction and exportable AAR in JSON or standalone HTML.
- Browser-local demo: no external operational services, no VR/AR hardware and no sensitive data.

## Run

~~~bash
npm install
npm run dev
~~~

For the LAN real-time reference server:

~~~bash
npm run backend
~~~

The reference server listens on port 8787 by default. It provides authenticated session creation, participant join, server-authoritative exercise state, live SSE state streaming, instructor commands, and role-scoped information views. See [docs/PRODUCTION_ARCHITECTURE.md](docs/PRODUCTION_ARCHITECTURE.md).

Open the Vite URL shown in the terminal.

For the presentation, open the same URL in two browser tabs. Use one as the instructor/director and one as the trainee/team seat. Inject a delay or conflicting report, transmit a team message, log an evidence-linked decision, then open AAR and move the replay slider.

## Architecture

~~~text
Scenario Engine
      |
      v
Information Integrity Layer
      |
      +-- confidence / freshness / corroboration
      +-- delay / dropout / conflict injection
      +-- hidden ground truth
      |
      v
Team Decision Space
      |
      +-- multi-seat team room
      +-- evidence selection
      +-- rationale + confidence
      |
      v
Decision Intelligence
      |
      +-- decision timeline
      +-- evidence coverage
      +-- contradiction handling
      +-- team coherence
      |
      v
AAR + Adaptive Director
      |
      +-- replay
      +-- ground-truth reveal
      +-- next exercise targeted at observed weaknesses
~~~

## Differentiation

The prototype does not claim that no comparable defence technology exists. Public defence systems already address pieces such as wargaming, adaptive training and automated AAR. The implementation focus here is the explicit, auditable chain:

**information state → evidence selected → human decision → rationale/confidence → hidden truth → adaptive next exercise**

The system is designed as a synthetic training environment, not an operational command or targeting system.


## Research-informed engine

The decision-intelligence kernel uses:

- exponential time decay for information freshness;
- Bayesian/Beta source-reliability priors;
- reliability-weighted OWA evidence fusion to avoid single-source dominance under conflict;
- an explicit abstention / insufficient-evidence state;
- confidence-vs-evidence calibration telemetry;
- lightweight contextual exploration/exploitation for adaptive exercise selection;
- SHA-256 exercise fingerprinting for tamper-evident AAR integrity checks.

See [docs/RESEARCH.md](docs/RESEARCH.md) for papers, Army/defence references, design rationale and citations.

## Presentation demonstration

1. Start **ALPHA-07**.
2. Open **Exercise Director**.
3. Inject **Delay Feed**, **Conflict Report**, then **Drop Node**.
4. Return to **Decision Cockpit** and select the reports used as evidence.
5. Log a decision with rationale and confidence.
6. Open **Team Room** in a second browser tab and transmit a team message.
7. Open **AAR & Replay** and move the replay slider.
8. Show the ground-truth reveal, confidence gap, information-integrity score and audit fingerprint.
9. In Director, press **GENERATE NEXT EXERCISE** to demonstrate the adaptive training loop.

The system is intentionally synthetic and software-only. It is not connected to weapons, operational networks or real-world targeting systems.

## Real-time simulation mode

The trainer now includes an instructor-authoritative real-time exercise clock and a deterministic degradation orchestrator. The sequence is visible before and during the exercise so a judge can immediately see how the PS is being fulfilled.

Example **ALPHA-07** sequence:

| Simulation time | Injected event | Training effect |
| --- | --- | --- |
| T+00:12 | AIR ISR latency | delayed feed + faster freshness decay |
| T+00:28 | Route ECHO conflict | contradictory LAND/EW reports |
| T+00:48 | NETWATCH node loss | CYBER source dropout |
| T+01:08 | Team network split | cross-cell coordination degradation |
| T+01:28 | ISR freshness collapse | stale evidence at a decision point |

The director can run the sequence at **1× / 2× / 4× / 8×** speed or disable automation and inject individual effects manually. Instructor controls, clock ticks and simulation injections are synchronized across browser tabs using the existing browser room.

### Recommended 2-tab demonstration

1. Open the Vite URL in **Tab A** and open **Exercise Director**.
2. Keep **AUTO SIM ON** and choose **4×** for a fast demonstration.
3. Open the same Vite URL in **Tab B** as the trainee seat.
4. Watch the common clock advance in real time; at each scheduled point the information environment changes.
5. On the trainee seat, select evidence, record a time-critical decision, send a team message, then open **AAR & Replay**.
6. Show the replay, hidden-ground-truth reveal, confidence/evidence gap, team metrics, event timeline and exported AAR.

This remains a synthetic web training environment: no operational network, targeting interface or sensitive defence data is used.


## Production-strength implementation

The codebase now demonstrates the full training architecture expected by PS 26248:

**Instructor → authoritative exercise clock → scheduled degradation → per-participant information state → team communication → evidence-linked decision → ground-truth reveal → AAR/replay → adaptive next exercise.**

The browser build remains the fast demonstration path. The included Node reference server is the LAN pilot path; a production deployment should place the server behind institutional identity, TLS, RBAC and network controls, persist to PostgreSQL, use Redis for multi-instance fan-out, and use WebRTC/SFU only for optional voice/video.
