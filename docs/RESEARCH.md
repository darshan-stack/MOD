
# Sentinel Grid Ω — Research Basis & Algorithm Design

## SIH26248 mapping

The trainer is designed around four explicit SIH requirements:

1. Mid-exercise communication degradation: delay, dropout and conflicting reports.
2. Multiplayer team coordination under degraded information.
3. Instructor control and real-time trainee monitoring.
4. Exportable AAR with decision timelines and rationale.

The implementation adds an auditable information-integrity layer between scenario events and human decisions.

## Research-informed design

### 1. Time-aware information freshness

Each report carries a freshness value. The production model uses exponential decay:

F(t) = exp(-ln(2) * age / halfLife)

This reflects a general principle from dynamic truth-discovery research: information truth and source reliability can evolve over time, so a static source score is inadequate for streaming environments.

Reference:
https://pmc.ncbi.nlm.nih.gov/articles/PMC4688022/

### 2. Dynamic source reliability

Each source has a Bayesian reliability prior represented as a Beta distribution. Historical support/contradiction evidence can update the source estimate:

R_source = alpha / (alpha + beta)

Current prototype combines this prior with freshness, report confidence and corroboration.

Reference:
https://www.sciencedirect.com/org/science/article/pii/S1546221825004321

### 3. Conflict-tolerant evidence fusion

The prototype uses reliability-weighted OWA evidence fusion rather than blindly averaging reports. The purpose is to reduce single-source dominance when evidence conflicts.

Recent evidence-fusion literature continues to document the difficulty of highly conflicting evidence for classical Dempster-Shafer combination rules, and recent work explores reliability-aware and conflict-aware weighting.

References:
https://www.sciencedirect.com/science/article/pii/S0020025526001040
https://www.sciencedirect.com/science/article/pii/S0952197625030246

### 4. Abstention / insufficient-evidence state

A key design rule is that the system is allowed to say:

INSUFFICIENT EVIDENCE

instead of forcing a confident state.

The prototype exposes fused confidence, conflict and sufficiency and turns low-sufficiency cases into a training cue to verify or seek corroboration.

This is consistent with modern selective-prediction work showing the value of calibrated uncertainty and explicit deferral in safety-critical decision support.

Reference:
https://www.nature.com/articles/s41598-026-40637-w

### 5. Human confidence calibration

The AAR calculates a confidence gap between trainee confidence and the quality of the evidence they selected.

This is informed by research showing that confidence calibration affects appropriate reliance and human-AI team performance.

References:
https://doi.org/10.1145/3613904.3642671
https://doi.org/10.1145/3530874

### 6. Team cognitive readiness

The platform tracks team coherence and information-handling behavior rather than only task success.

This follows the cognitive-readiness literature, which treats readiness as more than procedural completion and emphasizes performance under complex, uncertain and stressful conditions.

References:
https://doi.org/10.1177/1555343412444606
https://doi.org/10.1177/1555343412449626

### 7. Adaptive exercise selection

After a run, the system extracts observed focus areas such as stale-data handling, contradiction handling, confidence calibration and decision tempo.

The next scenario is selected using a lightweight contextual exploration/exploitation policy. A production version can replace the lightweight policy with a calibrated contextual bandit or knowledge-tracing model after enough trainee history exists.

Reference:
https://pmc.ncbi.nlm.nih.gov/articles/PMC13030155/

## Why AAR is not just a report generator

Current defence training products already provide sophisticated AAR capabilities. Saab's 2026 A3R platform, for example, combines training data from structured and unstructured sources and produces AI-assisted insights. Hadean likewise provides AI AAR, replay, course-of-action comparison and multi-domain simulation.

Sentinel Grid therefore does not claim generic AAR as novelty.

The differentiating prototype chain is:

information state
→ selected evidence
→ human decision
→ rationale + confidence
→ hidden ground truth
→ calibration / reasoning analysis
→ targeted next exercise

This focuses the system on the *reasoning process under information degradation*, rather than only the final outcome.

## Design implication from current Army research

Recent U.S. Army publications emphasize that degraded communications should be deliberately built into collective training and that future AI-enabled mission command must help humans interpret uncertainty rather than simply process more data.

References:
https://www.lineofdeparture.army.mil/Journals/Army-Communicator/Archive/Fall-2026/Network-Is-in-the-Fight/
https://arl.devcom.army.mil/arlreport/arl-tr-10070/
https://ssi.armywarcollege.edu/SSI-Media/Recent-Publications/Article/4564888/fighting-with-data-design-implications-for-ai-enabled-mission-command-systems/
https://arl.devcom.army.mil/arlreport/arl-tr-10403/

## Auditability

The AAR exports an SHA-256 fingerprint over the exercise evidence, decisions, events and team messages.

This is a tamper-evident integrity check for the exported training record. It is not a blockchain and it is not a security certification.

## Safety / scope

This is a synthetic training environment. It does not contain real operational data, real-world targeting logic or interfaces for controlling physical military systems.
