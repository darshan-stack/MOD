
# Sentinel Grid Omega — Production Web Architecture

## 1. Deployment model

For an institutional training deployment, Sentinel Grid should run inside an authorized training network rather than on the public Internet.

Instructor / Trainee Browsers
        |
      HTTPS
        |
  Reverse Proxy / SSO
        |
  +-----+-------------------------+
  |     |            |            |
 API  Event Stream  Session      Media
      (SSE/WS)      Engine       SFU
  |     |            |
  +-----+------------+
        |
     Redis
        |
   PostgreSQL

The current server/index.js is a dependency-free reference server implementing session creation, participant join, server-authoritative clock, live event streaming, instructor commands, asymmetric role-based information visibility, and in-memory decision/message/event state.

## 2. Why the server, not WebRTC, owns exercise truth

WebRTC is a media/peer transport technology. It is not the authority for scenario time, hidden truth, trainee decisions, or instructor controls.

Use:

- HTTP/HTTPS for session creation and authenticated commands.
- SSE or WebSocket for authoritative simulation state and event fan-out.
- Redis for multi-instance pub/sub and live presence.
- PostgreSQL for durable exercise, participant, decision, event and AAR records.
- WebRTC + SFU for optional low-latency team voice/video.

This separation prevents a media connection failure from becoming a simulation-state failure.

## 3. Participant information envelopes

A core PS 26248 behavior is asymmetric information.

The backend can expose:

- OC -> full synthetic information ledger.
- LAND -> LAND reports.
- AIR -> AIR reports.
- CYBER -> CYBER reports.
- EW -> EW reports.

A production version should make the envelope more granular by source/channel and by scenario rules, so each trainee sees exactly the information that the exercise intends to provide.

## 4. Real-time event lifecycle

Scenario clock
     |
     v
Scheduled event
     |
     +----> delay
     +----> dropout
     +----> contradiction
     +----> team-network degradation
     |
     v
Per-participant information envelope
     |
     v
Human/team decision
     |
     v
Decision ledger
     |
     v
AAR + replay

Every event should carry a server timestamp and simulation timestamp. This allows reconstruction of the exact information state available to a trainee at the moment of decision.

## 5. WebRTC production path

Use WebRTC only for communication channels that benefit from media-grade low latency.

Trainee A --Trainee B ----> WebRTC SFU ----> Trainee C
Trainee D --/         |
                     |
                Instructor

A managed or self-hosted SFU such as LiveKit, mediasoup or Janus can be evaluated during production hardening.

The exercise engine can still apply logical communication degradation to the simulated command channel without intentionally breaking the user's physical Internet/LAN connection.

Example:

Physical transport: healthy
        |
        v
Simulation policy:
  latency = 8s
  drop = 25%
  contradiction = enabled
        |
        v
Trainee experiences degraded command communication

## 6. Production persistence

Recommended entities:

- training_sessions
- scenario_definitions
- scenario_events
- participants
- information_items
- information_deliveries
- team_messages
- decisions
- decision_evidence
- aar_reports
- trainee_skill_history

The most important table is information_deliveries because it answers:

What information did this particular trainee actually receive, and when?

That should be the source used to reconstruct AARs instead of assuming all participants had the same feed.

## 7. Security hardening

The reference server supports an optional TRAINING_TOKEN environment variable.

A real institutional deployment should additionally use:

- organization-managed identity/SSO;
- role-based access control;
- instructor-only scenario mutation;
- audit logging;
- encrypted transport;
- network segmentation;
- session-level authorization;
- secure secret management;
- controlled retention/export policies.

No operational military network, weapon-control function or real targeting data should be connected to the prototype.

## 8. Scale path

Prototype:
Browser + BroadcastChannel

LAN pilot:
React + Node reference server + SSE/WS

Multi-machine pilot:
React + API + WebSocket + Redis + PostgreSQL

Production training platform:
React + API gateway + session service + simulation workers + Redis + PostgreSQL + WebRTC SFU + SSO + audit service

This staged path lets the team demonstrate PS 26248 now without pretending that a browser prototype is already a production defence deployment.
