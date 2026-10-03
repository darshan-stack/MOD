
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
