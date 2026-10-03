# Sentinel Grid

**Immersive multi-domain decision-making trainer for degraded communication environments.**

Sentinel Grid is a web-based command training cockpit for land, air, cyber and EW scenarios. It deliberately models uncertainty rather than presenting a clean operating picture.

## Included in this prototype

- Live common operating picture with stale, jammed and contradictory reports
- Instructor controls for injecting delay, dropout and misinformation
- Team channel with degraded-send state and role assignment
- Decision log with confidence, rationale and replay timeline
- AAR export as a downloadable JSON report
- Browser-local demo state; no sensitive operational data or external services

## Run locally

```bash
npm install
npm run dev
```

Then open the local Vite URL. `npm run build` creates the production bundle.
