
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
- Procedural Scenario DSL that generates deterministic, constraint-validated synthetic exercises instead of relying only on hand-authored templates.
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
Scenario DSL / Procedural Generator
      |
      v
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
- **vis-timeline 8.5.4** — zoomable/pannable event and decision timeline. Apache-2.0 OR MIT licensed.
- **Plotly.js 4.1.1** — interactive scientific plots for learning curves, calibration diagrams, difficulty-response curves, heatmaps and ablation sensitivity charts. MIT licensed. ([GitHub](https://github.com/plotly/plotly.js))

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
- a deterministic Scenario DSL with minimum evidence constraints, procedural report/event generation and seed-based reproducibility;
- SHA-256 exercise fingerprinting for tamper-evident AAR integrity checks.
- Deterministic benchmark laboratory comparing Sentinel Ω against confidence-only and confidence×freshness baselines under controlled degradation.
- Red-team resilience laboratory that deterministically attacks the information layer with stale deception, conflict bursts, true-source dropout, duplicate-source echoes and delayed contradictions, measuring false-confidence exposure and explicit abstention.
- Synthetic Curriculum Experiment Lab running seeded multi-session comparisons between fixed and adaptive curricula, with learning curves, difficulty-response plots, calibration diagrams, adaptive-gain heatmaps, session-level bootstrap confidence intervals, paired randomization tests, effect sizes, trial-level CSV/JSON export, and component ablation sensitivity analysis.

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
11. Open **Red-team Resilience** to replay the five deterministic attack classes and show how often the system stops an adversarial information state by correcting or abstaining.
12. Open the **Statistical Inference** panel inside the experiment lab to show 95% bootstrap intervals, paired sign-randomization p-values and effect sizes.
13. Use the experiment JSON/CSV exports as a reproducible lab record; the statistical layer treats each virtual trainee/session as the resampling unit.
14. Review the **Component Ablation** section to compare the full production path against freshness-fixed, learned-reliability-disabled, abstention-disabled and confidence-only variants, with Plotly sensitivity charts.
15. In **Exercise Director**, use **GENERATE NEXT EXERCISE** to create a seeded procedural scenario from the Scenario DSL; inspect the generated evidence count, network degradation and event stream.
16. Open **Visualization Lab**, press **EXPORT 3D BUNDLE**, then run `npm run viz:rerun` or `npm run viz:open3d` for the companion high-end 3D views. For a saved Rerun recording, use `npm run viz:rerun -- --save artifacts/sentinel-grid.rrd`.

The system is intentionally synthetic and software-only. It is not connected to weapons, operational networks or real-world targeting systems.

## Red-team validation

The resilience harness is designed as a falsification layer rather than a performance showcase. Each run starts from seeded synthetic reports, applies one attack family, and evaluates both a confidence-only aggregation baseline and Sentinel Ω. The key safety-oriented metric is **false confidence**: a wrong high-confidence commitment. An attack is considered “stopped” when Sentinel produces the correct class or abstains instead of committing to the wrong high-confidence class.


## Procedural Scenario DSL

The generator lives in `src/engine/scenarioGenerator.js`. A scenario is generated from a versioned DSL containing phase templates, objectives, synthetic source families, route/non-route topics and minimum evidence constraints.

Every generated exercise includes a deterministic seed and validation metadata. The generator guarantees minimum route evidence and independent source coverage before returning a scenario. The current training loop uses the procedural generator after adaptive focus selection, while the original ALPHA-07, CIPHER-11 and NORTHSTAR-03 templates remain available as fixed reference cases.


## Statistical inference layer

The curriculum experiment now reports session-level uncertainty rather than only point estimates. Each virtual trainee is treated as a repeated-measures unit; the bootstrap resamples complete trainee sessions and the paired sign-randomization test evaluates the adaptive-versus-fixed difference without assuming normality.

The exported experiment JSON contains:
- percentile bootstrap 95% confidence intervals;
- paired randomization p-values;
- Cohen's h for proportion differences;
- paired Cohen's dz for continuous paired metrics;
- round-level accuracy confidence bands;
- the exact seed, session count and round count used to reproduce the run.

These statistics describe the behavior of the synthetic simulator. They are not evidence of human learning, operational effectiveness or statistical significance in a participant study.


## Component ablation laboratory

The experiment lab includes a deterministic component-sensitivity study over the same procedural case stream. The FULL configuration uses the production Sentinel Ω decision path. Comparison variants constrain one mechanism at a time so the team can inspect how accuracy, false-confidence exposure, abstention and Brier score move.

The ablation study is intentionally narrower than the benchmark suite: it is a mechanism-level sensitivity analysis, not a claim that any single component has been causally proven responsible for human performance. Results remain synthetic and reproducible from the displayed seed.
