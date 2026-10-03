# Sentinel Grid Ω — Rerun + Open3D visualization companion

Sentinel Grid Ω remains a browser-first training cockpit. This directory adds two high-end open-source 3D viewers for the same **synthetic** exercise state:

- **Rerun** — multimodal, time-aware robotics/Physical AI viewer. The current Python SDK is `rerun-sdk 0.38.1`; the viewer supports 3D spatial data, time series and text on shared timelines. ([GitHub](https://github.com/rerun-io/rerun), [Python API](https://ref.rerun.io/docs/python/0.38.1/))
- **Open3D** — 3D data processing and visualization library with point-cloud, mesh and rendering capabilities. The current release is `0.20.0`. ([GitHub](https://github.com/isl-org/Open3D), [PyPI](https://pypi.org/project/open3d/))

## Setup

~~~bash
python3 -m venv .viz-venv
source .viz-venv/bin/activate
pip install -r viz/requirements.txt
~~~

Export a **Visualization Bundle** from the browser's Visualization Lab. By default it is saved as:

~~~text
artifacts/sentinel-grid-viz.json
~~~

Then run either viewer:

~~~bash
npm run viz:rerun
~~~

or:

~~~bash
npm run viz:open3d
~~~

For a browser-hosted Rerun viewer:

~~~bash
python3 viz/rerun_sentinel.py artifacts/sentinel-grid-viz.json --web-viewer
~~~

To save an Rerun recording:

~~~bash
python3 viz/rerun_sentinel.py artifacts/sentinel-grid-viz.json --save artifacts/sentinel-grid.rrd
~~~

Rerun can serve its viewer over HTTP and supports browser viewing. ([Rerun CLI](https://github.com/rerun-io/rerun/blob/main/docs/content/reference/cli.md))

## Why these viewers are included

Rerun is useful for **time-aligned multimodal evidence and replay**. Open3D is useful for **point-cloud / geometry inspection**. They complement rather than replace the existing ECharts, Cytoscape.js and vis-timeline browser visualizations.

The companion scene is intentionally synthetic. It contains no operational data, targeting logic or physical-system controls.
