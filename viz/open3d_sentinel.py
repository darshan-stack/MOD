"""
Sentinel Grid Ω -> Open3D 3D point-cloud companion viewer.

Consumes the same synthetic JSON bundle exported by Visualization Lab.
Open3D is used here for point-cloud / geometry inspection and screenshot-friendly
standalone 3D rendering.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import open3d as o3d


DOMAIN_POSITIONS = {
    "LAND": (-7.0, -2.0, 0.0),
    "AIR": (-1.0, 6.0, 4.0),
    "CYBER": (6.0, 2.0, 1.0),
    "EW": (3.0, -6.0, 2.0),
}


def load_bundle(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("bundle", nargs="?", default="artifacts/sentinel-grid-viz.json")
    args = parser.parse_args()

    bundle = load_bundle(Path(args.bundle))
    reports = bundle.get("reports", [])

    points = [[0.0, 0.0, 1.0]]
    colors = [[0.53, 0.87, 0.84]]

    for i, report in enumerate(reports):
        bx, by, bz = DOMAIN_POSITIONS.get(report.get("domain"), (0.0, 0.0, 0.0))
        pos = [bx + i * 0.8, by + ((i % 2) * 2 - 1) * 0.7, bz]
        points.append(pos)
        if report.get("state") == "live":
            colors.append([0.35, 0.72, 0.80])
        else:
            colors.append([0.76, 0.60, 0.34])

    # Synthetic route corridor.
    x = np.linspace(-9, 9, 250)
    route = np.stack([x, np.sin(x * 0.55) * 1.4, np.zeros_like(x) + 0.05], axis=1)
    points.extend(route.tolist())
    colors.extend([[0.39, 0.75, 0.67] for _ in range(len(route))])

    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(np.asarray(points, dtype=np.float64))
    pcd.colors = o3d.utility.Vector3dVector(np.asarray(colors, dtype=np.float64))

    grid = o3d.geometry.TriangleMesh.create_coordinate_frame(size=2.0, origin=[0, 0, 0])
    o3d.visualization.draw_geometries(
        [pcd, grid],
        window_name="Sentinel Grid Ω · Open3D 3D View",
        width=1440,
        height=900,
    )


if __name__ == "__main__":
    main()
