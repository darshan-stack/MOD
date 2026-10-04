"""
Real-time Sentinel Grid Ω synthetic simulator.

Runs a live, synthetic degraded-communications exercise directly into Rerun.
No operational data or external systems are used.
"""

from __future__ import annotations

import argparse
import math
import random
import time
from pathlib import Path

import numpy as np
import rerun as rr


SOURCES = [
    ("LAND", "R-07 Ground", np.array([-7.0, -2.0, 0.0])),
    ("AIR", "A-21 UAV", np.array([-1.0, 6.0, 4.0])),
    ("CYBER", "C-04 Net", np.array([6.0, 2.0, 1.0])),
    ("EW", "E-12 Spectrum", np.array([3.0, -6.0, 2.0])),
]


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--interval", type=float, default=0.5, help="Seconds between simulation ticks")
    parser.add_argument("--duration", type=float, default=0.0, help="Seconds to run; 0 means until Ctrl+C")
    parser.add_argument("--seed", type=int, default=20261004, help="Deterministic synthetic seed")
    parser.add_argument("--web-port", type=int, default=9090, help="Rerun web viewer port")
    args = parser.parse_args()

    if args.interval <= 0:
        raise SystemExit("--interval must be > 0")

    rng = random.Random(args.seed)

    # Use the same Rerun stack as the static companion, but keep the stream live.
    rr.init("sentinel_grid_omega_live", spawn=False)
    server_uri = rr.serve_grpc()
    rr.serve_web_viewer(
        web_port=args.web_port,
        connect_to=server_uri,
        open_browser=True,
    )

    rr.log("/", rr.ViewCoordinates.RIGHT_HAND_Z_UP, static=True)

    grid = np.linspace(-12, 12, 25)
    lines = []
    for value in grid:
        lines.append([[-12, value, 0], [12, value, 0]])
        lines.append([[value, -12, 0], [value, 12, 0]])
    rr.log(
        "world/grid",
        rr.LineStrips3D(np.asarray(lines)),
        static=True,
    )
    rr.log(
        "world/team",
        rr.Points3D([[0, 0, 1]], radii=[0.32]),
        static=True,
    )

    start = time.monotonic()
    tick = 0
    previous_action = "BOOT"

    print(f"Live Rerun viewer: http://127.0.0.1:{args.web_port}")
    print("Synthetic simulation running. Press Ctrl+C to stop.")

    try:
        while True:
            elapsed = time.monotonic() - start
            if args.duration and elapsed >= args.duration:
                break

            phase = elapsed * 0.55
            network = clamp(
                86
                - 58 * max(0.0, math.sin(phase * 0.82))
                + rng.uniform(-4, 4)
            )
            latency = clamp(
                0.35
                + 2.8 * max(0.0, math.sin(phase * 0.82)) ** 2
                + rng.uniform(-0.15, 0.15),
                0,
                10,
            )
            dropout = clamp(100 - network + rng.uniform(-3, 3))
            conflict = clamp(
                8
                + 82 * max(0.0, math.sin(phase * 0.53 - 0.9))
                + rng.uniform(-5, 5)
            )
            freshness = clamp(network * 0.72 + (100 - latency * 10) * 0.28)

            rr.set_time("exercise", sequence=tick)

            rr.log("telemetry/network_health", rr.Scalars(network))
            rr.log("telemetry/latency", rr.Scalars(latency))
            rr.log("telemetry/dropout", rr.Scalars(dropout))
            rr.log("telemetry/conflict", rr.Scalars(conflict))
            rr.log("telemetry/freshness", rr.Scalars(freshness))

            positions = []
            radii = []
            for index, (domain, name, base) in enumerate(SOURCES):
                angle = phase * (0.8 + index * 0.13) + index
                jitter = np.array(
                    [
                        0.75 * math.sin(angle),
                        0.65 * math.cos(angle * 1.3),
                        0.25 * math.sin(angle * 0.7),
                    ]
                )
                pos = base + jitter
                positions.append(pos)

                confidence = clamp(
                    92
                    - 0.48 * dropout
                    - 0.22 * conflict
                    + rng.uniform(-8, 8)
                )
                radius = 0.12 + 0.18 * confidence / 100.0
                radii.append(radius)

                state = "live" if rng.random() > dropout / 150.0 else "delayed"
                rr.log(
                    f"world/sources/{domain.lower()}",
                    rr.Points3D(
                        [pos],
                        radii=[radius],
                    ),
                )
                rr.log(
                    f"world/sources/{domain.lower()}/evidence_ray",
                    rr.LineStrips3D([[[0, 0, 1], pos]]),
                )
                rr.log(
                    f"world/sources/{domain.lower()}/state",
                    rr.TextLog(
                        f"{name} · {state} · conf={confidence:.0f}%"
                    ),
                )

            rr.log(
                "world/sources/all",
                rr.Points3D(np.asarray(positions), radii=np.asarray(radii)),
            )

            route_x = np.linspace(-9, 9, 100)
            route_y = (
                np.sin(route_x * 0.55 + phase * 0.18)
                * (1.05 + conflict / 130.0)
            )
            route = np.stack(
                [
                    route_x,
                    route_y,
                    np.zeros_like(route_x) + 0.08,
                ],
                axis=1,
            )
            rr.log("world/route_echo", rr.LineStrips3D([route]))

            committed = max(0.0, network * 0.52 + (100 - conflict) * 0.28 + freshness * 0.20)
            uncertainty = clamp(100 - committed)
            sufficiency = clamp(network * 0.55 + freshness * 0.45)
            if uncertainty >= 58 or sufficiency < 52:
                action = "VERIFY / ABSTAIN"
            elif conflict >= 65:
                action = "HOLD"
            else:
                action = "REROUTE"

            if action != previous_action:
                rr.log(
                    "timeline/decisions",
                    rr.TextLog(
                        f"{action} · network={network:.0f}% · conflict={conflict:.0f}% · "
                        f"uncertainty={uncertainty:.0f}%"
                    ),
                )
                previous_action = action

            rr.log(
                "analysis/fused_state",
                rr.TextDocument(
                    f"# Sentinel Grid Ω — LIVE\n\n"
                    f"**Action:** {action}  \n"
                    f"**Network:** {network:.1f}%  \n"
                    f"**Latency:** {latency:.2f}s  \n"
                    f"**Dropout:** {dropout:.1f}%  \n"
                    f"**Conflict:** {conflict:.1f}%  \n"
                    f"**Freshness:** {freshness:.1f}%  \n"
                    f"**Uncertainty:** {uncertainty:.1f}%  \n"
                    f"**Sufficiency:** {sufficiency:.1f}%",
                    media_type=rr.MediaType.MARKDOWN,
                ),
            )

            tick += 1
            time.sleep(args.interval)

    except KeyboardInterrupt:
        print("\nLive simulation stopped.")
    finally:
        # Give the browser one final state update before shutdown.
        rr.flush()
        print("Rerun gRPC source:", server_uri)


if __name__ == "__main__":
    main()
