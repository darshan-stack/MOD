"""
Sentinel Grid Ω -> Rerun 3D companion viewer.

Consumes a JSON bundle exported by the browser UI. The bundle is synthetic only.
Rerun renders spatial evidence, trajectories, uncertainty rays and telemetry
along a shared timeline. Use --web-viewer to open the Rerun viewer in a browser.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import rerun as rr


DOMAIN_POSITIONS = {
    "LAND": (-7.0, -2.0, 0.0),
    "AIR": (-1.0, 6.0, 4.0),
    "CYBER": (6.0, 2.0, 1.0),
    "EW": (3.0, -6.0, 2.0),
}
DOMAIN_OFFSET = {
    "LAND": np.array([0.0, 0.0, 0.0]),
    "AIR": np.array([0.0, 0.0, 1.0]),
    "CYBER": np.array([0.0, 0.0, 0.0]),
    "EW": np.array([0.0, 0.0, 0.0]),
}


def load_bundle(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def source_position(index: int, report: dict) -> np.ndarray:
    base = np.array(DOMAIN_POSITIONS.get(report.get("domain"), (0.0, 0.0, 0.0)))
    jitter = np.array([index * 0.8, ((index % 2) * 2 - 1) * 0.7, 0.0])
    return base + jitter + DOMAIN_OFFSET.get(report.get("domain"), np.zeros(3))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "bundle",
        nargs="?",
        default="artifacts/sentinel-grid-viz.json",
        help="JSON bundle exported from Visualization Lab",
    )
    parser.add_argument("--web-viewer", action="store_true", help="Serve/open the Rerun web viewer")
    parser.add_argument("--save", default="", help="Optional .rrd output path")
    args = parser.parse_args()

    bundle = load_bundle(Path(args.bundle))

    rr.init("sentinel_grid_omega", spawn=not args.web_viewer)
    if args.web_viewer:
        rr.serve_web()

    rr.log("/", rr.ViewCoordinates.RIGHT_HAND_Z_UP, static=True)

    # Synthetic arena / grid.
    grid = np.linspace(-12, 12, 25)
    lines = []
    for value in grid:
        lines.append([[-12, value, 0], [12, value, 0]])
        lines.append([[value, -12, 0], [value, 12, 0]])
    rr.log("world/grid", rr.LineStrips3D(np.array(lines), colors=[55, 75, 85]), static=True)

    reports = bundle.get("reports", [])
    positions = []
    labels = []
    colors = []
    radii = []

    # Team origin.
    rr.log("world/team", rr.Points3D([[0, 0, 1]], colors=[[134, 222, 215]], radii=[0.28]), static=True)

    for i, report in enumerate(reports):
        pos = source_position(i, report)
        positions.append(pos)
        labels.append(report.get("source", "SOURCE"))
        colors.append([120, 190, 210] if report.get("state") == "live" else [180, 150, 100])
        radii.append(0.12 + 0.12 * float(report.get("confidence", 0)) / 100.0)

        rr.log(
            f"world/sources/{report.get('id', i)}",
            rr.Points3D([pos], colors=[colors[-1]], radii=[radii[-1]]),
            static=True,
        )
        rr.log(
            f"world/sources/{report.get('id', i)}/evidence_ray",
            rr.LineStrips3D([[0, 0, 1], pos], colors=[80, 120, 130]),
            static=True,
        )

    if positions:
        rr.log("world/sources/all", rr.Points3D(np.asarray(positions), colors=np.asarray(colors), radii=np.asarray(radii)), static=True)

    # Represent the currently fused route as a compact synthetic corridor.
    route_x = np.linspace(-9, 9, 100)
    route = np.stack([route_x, np.sin(route_x * 0.55) * 1.4, np.zeros_like(route_x) + 0.05], axis=1)
    rr.log("world/route_echo", rr.LineStrips3D([route], colors=[100, 190, 175]), static=True)

    # Time-series telemetry.
    network = float(bundle.get("network", {}).get("netHealth", 0))
    latency = float(bundle.get("network", {}).get("latency", 0))
    dropout = float(bundle.get("network", {}).get("dropout", 0))
    conflict = float(bundle.get("network", {}).get("conflict", 0))
    rr.set_time_sequence("exercise", 0)
    rr.log("telemetry/network_health", rr.Scalar(network), static=False)
    rr.log("telemetry/latency", rr.Scalar(latency), static=False)
    rr.log("telemetry/dropout", rr.Scalar(dropout), static=False)
    rr.log("telemetry/conflict", rr.Scalar(conflict), static=False)

    # Event/decision reconstruction on the same timeline.
    for event in bundle.get("events", []):
        t = int(event.get("at", 0))
        rr.set_time_sequence("exercise", t)
        rr.log("timeline/events", rr.TextLog(f"{event.get('tag', 'EVENT')}: {event.get('text', '')}"))

    for decision in bundle.get("decisions", []):
        t = int(decision.get("at", 0))
        rr.set_time_sequence("exercise", t)
        rr.log(
            "timeline/decisions",
            rr.TextLog(
                f"{decision.get('action', 'DECISION')} | "
                f"confidence={decision.get('confidence', 0)}% | "
                f"uncertainty={decision.get('uncertainty', 0)}%"
            ),
        )

    fused = bundle.get("fusedRoute", {})
    rr.log(
        "analysis/fused_state",
        rr.TextDocument(
            f"# Sentinel Grid Ω\n\n"
            f"**Fused claim:** {fused.get('label', 'UNKNOWN')}  \n"
            f"**Belief:** {fused.get('belief', 0)}%  \n"
            f"**Disbelief:** {fused.get('disbelief', 0)}%  \n"
            f"**Uncertainty:** {fused.get('uncertainty', 0)}%  \n"
            f"**Conflict:** {fused.get('conflict', 0)}%  \n"
            f"**Sufficiency:** {fused.get('sufficiency', 0)}%",
            media_type=rr.MediaType.MARKDOWN,
        ),
        static=True,
    )

    if args.save:
        rr.save(args.save)
        print(f"Saved Rerun recording: {args.save}")
    else:
        print("Rerun viewer ready. Drag/zoom the 3D scene and scrub the exercise timeline.")

    if args.web_viewer:
        import time
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down Rerun web viewer…")


if __name__ == "__main__":
    main()
