
# Sentinel Grid Ω

Web-native multi-domain decision-making trainer for degraded communication environments — **SIH26248**.

## What this build implements

- Mid-exercise communication degradation: delay, dropout, freshness decay, conflict pressure and team-network split.
- Multi-domain information ledger with confidence, freshness, corroboration and a derived trust state.
- Ground truth that is UI-hidden during play and revealed during AAR; this is a training-flow boundary, not a security boundary.
- Evidence-linked decisions: a trainee selects the information used and records rationale + confidence.
- Multi-seat team coordination using the browser BroadcastChannel API; open the same Vite URL in two tabs for a local multiplayer demonstration.
- Instructor scenario director with scenario presets, live friction controls, mid-exercise injection and real-time decision/event monitoring.
- Adaptive training loop that diagnoses observed focus areas and generates the next exercise around them.
- Replay slider for reconstruction and exportable AAR in JSON or standalone HTML.
- Browser-local demo: no external operational services, no VR/AR hardware and no sensitive data.

## Run

~~~bash
npm ci
npm run verify
npm run dev
~~~

Run `npm run verify` first. It checks the engine suite, Python syntax and production build before the interactive demo. Then open the Vite URL shown in the terminal.

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

Trainee skill and learned source-reliability history are persisted locally so repeated exercise sessions update both the Glicko-2 profile and the evidence model.


## Open-source visualization stack

The UI includes an optional Visualization Lab using open-source browser libraries loaded from pinned public CDNs:

- **Cytoscape.js 3.34.3** — interactive graph visualization for the synthetic communication/evidence network. MIT licensed. ([GitHub](https://github.com/cytoscape/cytoscape.js))
- **Apache ECharts 6.1.0** — interactive multi-series evidence/confidence analytics. Apache-2.0 licensed. ([GitHub](https://github.com/apache/echarts))
- **vis-timeline 8.5.4** — zoomable/pannable event and decision timeline. Apache-2.0 OR MIT licensed. ([GitHub](https://github.com/visjs/vis-timeline))

- **Rerun 0.38.1** — multimodal time-aware 3D robotics viewer for point clouds, trajectories, text and time-series replay. MIT OR Apache-2.0. ([GitHub](https://github.com/rerun-io/rerun))
- **Open3D 0.20.0** — 3D point-cloud, geometry and rendering companion viewer. MIT licensed. ([GitHub](https://github.com/isl-org/Open3D))

These visualizations reuse the same synthetic reports, events and decisions already driving Sentinel Grid Ω; they do not introduce operational data.

## Research-informed engine

The decision-intelligence kernel uses:

- exponential time decay for information freshness;
- Bayesian/Beta source-reliability priors;
- Subjective Logic-style belief / disbelief / uncertainty fusion for conflicting reports;
- an explicit abstention / insufficient-evidence state;
- confidence-vs-evidence calibration telemetry, ECE/Brier scoring and an opt-in temperature-scaling experiment;
- Glicko-2 trainee skill rating with rating deviation and volatility;
- lightweight contextual exploration/exploitation for adaptive exercise selection;
- SHA-256 exercise fingerprinting for tamper-evident AAR integrity checks.
- Deterministic benchmark laboratory comparing Sentinel Ω against confidence-only and confidence×freshness baselines under controlled degradation.

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
10. Open **Benchmark Lab** to reproduce the controlled 400-case comparison and inspect accuracy, selective accuracy, false-confidence, Brier, ECE and abstention metrics.
11. Open **Visualization Lab**, press **EXPORT 3D BUNDLE**, then run `npm run viz:rerun` or `npm run viz:open3d` for the companion high-end 3D views. For a saved Rerun recording, use `npm run viz:rerun -- --save artifacts/sentinel-grid.rrd`.

The system is intentionally synthetic and software-only. It is not connected to weapons, operational networks or real-world targeting systems.
