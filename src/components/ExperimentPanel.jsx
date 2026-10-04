import React, { useEffect, useMemo, useRef } from 'react';
import { experimentCsv } from '../engine/experimentLab.js';

function PlotlyFigure({ data, layout, config }) {
  const ref = useRef(null);

  useEffect(function() {
    if (!ref.current || !window.Plotly) return undefined;
    window.Plotly.react(ref.current, data, layout, {
      responsive: true,
      displaylogo: false,
      ...config
    });
    return function() {
      if (window.Plotly && ref.current) window.Plotly.purge(ref.current);
    };
  }, [data, layout, config]);

  return <div ref={ref} className="experiment-plot"></div>;
}

const downloadBlob = function(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
};

export default function ExperimentPanel({ experiment, onRerun }) {
  const figureBase = useMemo(() => ({
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(8,19,27,.55)',
    font: { family: 'Manrope', color: '#91a8b3', size: 10 },
    margin: { l: 50, r: 20, t: 42, b: 45 },
    hoverlabel: { bgcolor: '#0c1b24', bordercolor: '#294756', font: { family: 'DM Mono', size: 10 } },
    legend: { orientation: 'h', y: 1.12, font: { family: 'DM Mono', size: 9 } },
    xaxis: { gridcolor: '#19323e', zerolinecolor: '#29434f', tickfont: { family: 'DM Mono', size: 9 } },
    yaxis: { gridcolor: '#19323e', zerolinecolor: '#29434f', tickfont: { family: 'DM Mono', size: 9 } }
  }), []);

  const learning = experiment.learningCurve;
  const difficulty = experiment.difficultyCurve;
  const calibration = experiment.calibration;
  const heatmap = experiment.gainHeatmap;

  return <div className="experiment-layout">
    <section className="experiment-main">
      <div className="section-head">
        <div><div className="eyebrow">SYNTHETIC CURRICULUM EXPERIMENT · PLOTLY</div><h2>Learning and adaptation laboratory <span className="badge live">REPRODUCIBLE</span></h2></div>
        <div className="export-actions">
          <button className="ghost-btn" onClick={function() {
            const blob = new Blob([JSON.stringify(experiment, null, 2)], { type: 'application/json' });
            downloadBlob(blob, 'sentinel-grid-experiment.json');
          }}>JSON</button>
          <button className="ghost-btn" onClick={function() {
            const blob = new Blob([experimentCsv(experiment)], { type: 'text/csv;charset=utf-8' });
            downloadBlob(blob, 'sentinel-grid-experiment.csv');
          }}>CSV</button>
          <button className="primary-btn" onClick={onRerun}>RERUN ×{experiment.totalCases}</button>
        </div>
      </div>

      <div className="experiment-banner">
        <div><strong>{experiment.totalCases.toLocaleString()} synthetic decision trials</strong><span>{experiment.sessions} virtual trainees × {experiment.roundsPerSession} rounds × 2 curricula · seed {experiment.seed}</span></div>
        <span className="benchmark-chip">SYNTHETIC ONLY</span>
      </div>

      <div className="experiment-hero">
        <div><small>FINAL ACCURACY GAIN</small><strong>{experiment.headline.finalAccuracyGain > 0 ? '+' : ''}{experiment.headline.finalAccuracyGain} pts</strong><span>Adaptive vs fixed, last 4 rounds</span></div>
        <div><small>FINAL RATING GAIN</small><strong>{experiment.headline.finalRatingGain > 0 ? '+' : ''}{experiment.headline.finalRatingGain}</strong><span>Glicko-2 rating delta</span></div>
        <div><small>BRIER IMPROVEMENT</small><strong>{experiment.headline.brierDelta > 0 ? '+' : ''}{experiment.headline.brierDelta}</strong><span>Positive means adaptive has lower Brier</span></div>
        <div><small>ADAPTIVE AVG DIFFICULTY</small><strong>{experiment.headline.adaptiveAverageDifficulty}</strong><span>Procedural difficulty / 10</span></div>
      </div>

      <div className="experiment-grid">
        <div className="experiment-chart-card">
          <div className="experiment-chart-head"><div><div className="eyebrow">PANEL A</div><h3>Learning curve</h3></div><span>Accuracy</span></div>
          <PlotlyFigure
            data={[
              { x: learning.map(x => x.round), y: learning.map(x => x.fixedAccuracy), name: 'Fixed accuracy', mode: 'lines+markers', line: { width: 2 }, marker: { size: 5 } },
              { x: learning.map(x => x.round), y: learning.map(x => x.adaptiveAccuracy), name: 'Adaptive accuracy', mode: 'lines+markers', line: { width: 2 }, marker: { size: 5 } }
            ]}
            layout={{...figureBase, title: { text: 'Accuracy across repeated rounds', font: { size: 11 } }, xaxis: {...figureBase.xaxis, title: 'Round'}, yaxis: {...figureBase.yaxis, title: 'Accuracy (%)', range: [0,100]}}}
          />
        </div>

        <div className="experiment-chart-card">
          <div className="experiment-chart-head"><div><div className="eyebrow">PANEL B</div><h3>Performance vs difficulty</h3></div><span>Generated tiers</span></div>
          <PlotlyFigure
            data={[
              { x: difficulty.map(x => x.difficulty), y: difficulty.map(x => x.fixedAccuracy), name: 'Fixed', mode: 'lines+markers', connectgaps: false, marker: { size: 6 } },
              { x: difficulty.map(x => x.difficulty), y: difficulty.map(x => x.adaptiveAccuracy), name: 'Adaptive', mode: 'lines+markers', connectgaps: false, marker: { size: 6 } }
            ]}
            layout={{...figureBase, title: { text: 'Accuracy by generated difficulty', font: { size: 11 } }, xaxis: {...figureBase.xaxis, title: 'Difficulty / 10', dtick: 1}, yaxis: {...figureBase.yaxis, title: 'Accuracy (%)', range: [0,100]}}}
          />
        </div>

        <div className="experiment-chart-card">
          <div className="experiment-chart-head"><div><div className="eyebrow">PANEL C</div><h3>Confidence calibration</h3></div><span>Reliability diagram</span></div>
          <PlotlyFigure
            data={[
              { x: [0,100], y: [0,100], name: 'Perfect calibration', mode: 'lines', line: { dash: 'dot', width: 1 } },
              { x: calibration.fixed.map(x => x.confidence), y: calibration.fixed.map(x => x.accuracy), name: 'Fixed', mode: 'lines+markers', marker: { size: 6 }, customdata: calibration.fixed.map(x => x.cases), hovertemplate: 'Confidence %{x:.1f}%<br>Accuracy %{y:.1f}%<br>n=%{customdata}<extra>Fixed</extra>' },
              { x: calibration.adaptive.map(x => x.confidence), y: calibration.adaptive.map(x => x.accuracy), name: 'Adaptive', mode: 'lines+markers', marker: { size: 6 }, customdata: calibration.adaptive.map(x => x.cases), hovertemplate: 'Confidence %{x:.1f}%<br>Accuracy %{y:.1f}%<br>n=%{customdata}<extra>Adaptive</extra>' }
            ]}
            layout={{...figureBase, title: { text: 'Predicted confidence vs observed accuracy', font: { size: 11 } }, xaxis: {...figureBase.xaxis, title: 'Predicted confidence (%)', range: [0,100]}, yaxis: {...figureBase.yaxis, title: 'Observed accuracy (%)', range: [0,100]}, showlegend: true}}
          />
        </div>

        <div className="experiment-chart-card">
          <div className="experiment-chart-head"><div><div className="eyebrow">PANEL D</div><h3>Adaptive gain heatmap</h3></div><span>Adaptive − fixed</span></div>
          <PlotlyFigure
            data={[{
              z: heatmap,
              x: experiment.difficultyCurve.map(x => String(x.difficulty)),
              y: ['Rounds 1–4', 'Rounds 5–8', 'Rounds 9–12', 'Rounds 13–16'],
              type: 'heatmap',
              zmid: 0,
              colorbar: { title: 'pts', tickfont: { size: 8 }, titlefont: { size: 8 } },
              hovertemplate: 'Difficulty %{x}<br>%{y}<br>Gain %{z:.1f} pts<extra></extra>'
            }]}
            layout={{...figureBase, title: { text: 'Where adaptation helps or hurts', font: { size: 11 } }, xaxis: {...figureBase.xaxis, title: 'Difficulty'}, yaxis: {...figureBase.yaxis, title: 'Training phase'}}}
          />
        </div>
      </div>

      <div className="experiment-note"><strong>Interpretation.</strong> This is a controlled synthetic experiment. The virtual trainee is simulated, so the plots do not establish real human-learning effects. Use the output to inspect curriculum behavior and generate hypotheses for later participant studies.</div>
    </section>

    <aside className="experiment-side">
      <div className="eyebrow">EXPERIMENT DESIGN</div>
      <h3>What the lab measures</h3>
      <div className="benchmark-points">
        <div><b>01</b><span><strong>Procedural scenarios</strong> Fixed and adaptive curricula draw from the same seeded generator family.</span></div>
        <div><b>02</b><span><strong>Repeated exposure</strong> Each virtual trainee completes the same number of rounds.</span></div>
        <div><b>03</b><span><strong>Skill trajectory</strong> Glicko-2 rating is tracked after every synthetic decision.</span></div>
        <div><b>04</b><span><strong>Calibration</strong> Brier-oriented confidence is visualized separately from accuracy.</span></div>
        <div><b>05</b><span><strong>Exportable data</strong> Trial-level paired results can be saved as CSV or JSON.</span></div>
      </div>
      <div className="panel-divider"></div>
      <div className="eyebrow">OPEN-SOURCE VISUALIZATION</div>
      <p className="benchmark-callout">Plotly.js adds publication-style interactive scientific plots, while Apache ECharts, Cytoscape.js, vis-timeline, Rerun and Open3D cover dashboard, network, replay and 3D views.</p>
      <div className="panel-divider"></div>
      <div className="eyebrow">REPRODUCIBILITY</div>
      <p className="panel-note">Seed {experiment.seed} · {experiment.sessions} sessions · {experiment.roundsPerSession} rounds · {experiment.totalCases} synthetic decision trials across both curricula.</p>
    </aside>
  </div>;
}
