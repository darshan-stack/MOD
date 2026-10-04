import React, { useEffect, useMemo, useRef } from 'react';
import { experimentCsv } from '../engine/experimentLab.js';
import { ablationCsv } from '../engine/ablationLab.js';
import { degradationSurfaceCsv } from '../engine/degradationSurfaceLab.js';

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

const formatP = function(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const p = Number(value);
  return p < 0.001 ? '<0.001' : p.toFixed(3);
};

const formatEffect = function(row) {
  if (!row || !row.effectSize) return '—';
  return row.effectSize.value === null || row.effectSize.value === undefined
    ? '—'
    : Number(row.effectSize.value).toFixed(3);
};

function AblationPanel({ study, onRerun }) {
  const variants = study?.variants || [];
  return <div className="ablation-panel">
    <div className="experiment-stats-head">
      <div>
        <div className="eyebrow">COMPONENT ABLATION · SAME CASE STREAM</div>
        <h3>Which mechanisms matter?</h3>
      </div>
      <div className="export-actions">
        <button className="ghost-btn" onClick={function() {
          const blob = new Blob([ablationCsv(study)], { type: 'text/csv;charset=utf-8' });
          downloadBlob(blob, 'sentinel-grid-ablation.csv');
        }}>EXPORT CSV</button>
        <button className="primary-btn" onClick={onRerun}>RERUN ×{study?.runs || 0}</button>
      </div>
    </div>

    <div className="ablation-hero">
      <div><small>FULL SENTINEL ACCURACY</small><strong>{study?.headline?.productionAccuracy ?? '—'}%</strong><span>Production configuration</span></div>
      <div><small>LARGEST ACCURACY DROP</small><strong>{study?.headline?.largestAccuracyDrop > 0 ? '+' : ''}{study?.headline?.largestAccuracyDrop ?? '—'} pts</strong><span>{study?.headline?.mostAccuracySensitive || '—'}</span></div>
      <div><small>FALSE-CONFIDENCE SENSITIVITY</small><strong>{study?.headline?.largestFalseConfidenceChange > 0 ? '+' : ''}{study?.headline?.largestFalseConfidenceChange ?? '—'} pts</strong><span>{study?.headline?.mostFalseConfidenceSensitive || '—'}</span></div>
    </div>

    <div className="ablation-table">
      <div className="ablation-row ablation-head"><span>VARIANT</span><span>ACCURACY</span><span>Δ ACC</span><span>FALSE CONF</span><span>Δ FC</span><span>ABSTAIN</span><span>BRIER</span></div>
      {variants.map(function(row) {
        const full = row.key === 'FULL';
        return <div className="ablation-row" key={row.key}>
          <span><strong>{row.label}</strong><small>{row.description}</small></span>
          <span className={full ? 'stat-positive' : ''}>{row.accuracy}%</span>
          <span className={row.accuracyDeltaVsFull >= 0 ? 'stat-positive' : 'stat-negative'}>{row.accuracyDeltaVsFull >= 0 ? '+' : ''}{row.accuracyDeltaVsFull} pts</span>
          <span>{row.falseConfidenceRate}%</span>
          <span className={row.falseConfidenceDeltaVsFull <= 0 ? 'stat-positive' : 'stat-negative'}>{row.falseConfidenceDeltaVsFull >= 0 ? '+' : ''}{row.falseConfidenceDeltaVsFull} pts</span>
          <span>{row.abstentionRate}%</span>
          <span>{row.brier}</span>
        </div>;
      })}
    </div>

    <div className="ablation-viz-grid">
      <div className="experiment-chart-card">
        <div className="experiment-chart-head"><div><div className="eyebrow">ABLATION PANEL A</div><h3>Accuracy sensitivity</h3></div><span>Δ vs full</span></div>
        <PlotlyFigure
          data={[{
            x: variants.filter(row => row.key !== 'FULL').map(row => row.label),
            y: variants.filter(row => row.key !== 'FULL').map(row => row.accuracyDeltaVsFull),
            type: 'bar',
            text: variants.filter(row => row.key !== 'FULL').map(row => (row.accuracyDeltaVsFull >= 0 ? '+' : '') + row.accuracyDeltaVsFull + ' pts'),
            textposition: 'outside',
            hovertemplate: '%{x}<br>Accuracy delta %{y:.1f} pts<extra></extra>'
          }]}
          layout={{
            margin: { l: 48, r: 18, t: 35, b: 95 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(8,19,27,.55)',
            font: { family: 'Manrope', color: '#91a8b3', size: 9 },
            xaxis: { tickangle: -22, tickfont: { family: 'DM Mono', size: 8 }, gridcolor: '#19323e' },
            yaxis: { title: 'Δ accuracy (pts)', zeroline: true, zerolinecolor: '#5c6f77', gridcolor: '#19323e' }
          }}
        />
      </div>
      <div className="experiment-chart-card">
        <div className="experiment-chart-head"><div><div className="eyebrow">ABLATION PANEL B</div><h3>Safety / calibration trade-off</h3></div><span>Lower is better for FC + Brier</span></div>
        <PlotlyFigure
          data={[
            {
              x: variants.map(row => row.label),
              y: variants.map(row => row.falseConfidenceRate),
              name: 'False confidence',
              type: 'bar',
              hovertemplate: '%{x}<br>False confidence %{y:.1f}%<extra></extra>'
            },
            {
              x: variants.map(row => row.label),
              y: variants.map(row => row.brier * 100),
              name: 'Brier ×100',
              type: 'bar',
              hovertemplate: '%{x}<br>Brier ×100 %{y:.2f}<extra></extra>'
            }
          ]}
          layout={{
            barmode: 'group',
            margin: { l: 48, r: 18, t: 35, b: 95 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(8,19,27,.55)',
            font: { family: 'Manrope', color: '#91a8b3', size: 9 },
            xaxis: { tickangle: -22, tickfont: { family: 'DM Mono', size: 8 }, gridcolor: '#19323e' },
            yaxis: { title: 'Metric value', gridcolor: '#19323e' },
            legend: { orientation: 'h', y: 1.12, font: { family: 'DM Mono', size: 8 } }
          }}
        />
      </div>
    </div>

        <div className="ablation-note">
      <strong>How to read this.</strong> Every variant receives the same procedurally generated scenario stream. The FULL row is the production decision path. The other rows remove or constrain one mechanism, so a large delta is evidence that the simulator is sensitive to that mechanism. This is an ablation/sensitivity study, not a human-subject causal claim.
    </div>
  </div>;
}


function DegradationSurfacePanel({ study, onRerun }) {
  const levelsX = study?.networkHealthLevels || [];
  const levelsY = study?.conflictLevels || [];
  const matrices = study?.matrices || {};

  const phaseText = (matrices.phaseLabel || []).map(row => row.map(value => value || '—'));
  const phaseTicks = [
    { value: 0, label: 'COMMIT' },
    { value: 1, label: 'UNCERTAIN' },
    { value: 2, label: 'ABSTAIN' }
  ];

  const heatLayout = function(title, xTitle, yTitle) {
    return {
      margin: { l: 55, r: 28, t: 38, b: 48 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(8,19,27,.55)',
      font: { family: 'Manrope', color: '#91a8b3', size: 9 },
      title: { text: title, font: { size: 11 } },
      xaxis: { title: xTitle, tickfont: { family: 'DM Mono', size: 8 }, gridcolor: '#19323e' },
      yaxis: { title: yTitle, tickfont: { family: 'DM Mono', size: 8 }, gridcolor: '#19323e' }
    };
  };

  return <div className="surface-panel">
    <div className="experiment-stats-head">
      <div>
        <div className="eyebrow">DEGRADATION RESPONSE SURFACE · CONTROLLED SWEEP</div>
        <h3>When certainty should give way to abstention</h3>
      </div>
      <div className="export-actions">
        <button className="ghost-btn" onClick={function() {
          const blob = new Blob([JSON.stringify(study, null, 2)], { type: 'application/json' });
          downloadBlob(blob, 'sentinel-grid-degradation-surface.json');
        }}>JSON</button>
        <button className="ghost-btn" onClick={function() {
          const blob = new Blob([degradationSurfaceCsv(study)], { type: 'text/csv;charset=utf-8' });
          downloadBlob(blob, 'sentinel-grid-degradation-surface.csv');
        }}>CSV</button>
        <button className="primary-btn" onClick={onRerun}>RERUN ×{study?.cells?.length || 0}</button>
      </div>
    </div>

    <div className="surface-hero">
      <div><small>BASELINE CONFIDENCE</small><strong>{study?.headline?.baselineCommitProbability ?? '—'}%</strong><span>High communication quality / low conflict</span></div>
      <div><small>STRESS UNCERTAINTY</small><strong>{study?.headline?.stressUncertainty ?? '—'}%</strong><span>Low quality / high contradiction</span></div>
      <div><small>STRESS ABSTENTION</small><strong>{study?.headline?.stressAbstentionRate ?? '—'}%</strong><span>Production output at stress corner</span></div>
      <div><small>MAX FC DELTA</small><strong>{study?.headline?.maxFalseConfidenceDelta > 0 ? '+' : ''}{study?.headline?.maxFalseConfidenceDelta ?? '—'} pts</strong><span>Sentinel − confidence-only</span></div>
    </div>

    <div className="surface-note"><strong>Read the surface.</strong> X-axis is network health; Y-axis is contradiction pressure. The same seeded base cases are stressed at every cell, so the plots isolate how the decision engine responds as information quality deteriorates.</div>

    <div className="surface-viz-grid">
      <div className="experiment-chart-card">
        <div className="experiment-chart-head"><div><div className="eyebrow">SURFACE A</div><h3>Committed probability</h3></div><span>Mean winning probability</span></div>
        <PlotlyFigure
          data={[{
            z: matrices.probability,
            x: levelsX,
            y: levelsY,
            type: 'heatmap',
            colorbar: { title: '%', tickfont: { size: 8 }, titlefont: { size: 8 } },
            hovertemplate: 'Health %{x}<br>Conflict %{y}<br>Probability %{z:.1f}%<extra></extra>'
          }]}
          layout={heatLayout('Probability surface', 'Network health (%)', 'Conflict pressure (%)')}
        />
      </div>

      <div className="experiment-chart-card">
        <div className="experiment-chart-head"><div><div className="eyebrow">SURFACE B</div><h3>Epistemic uncertainty</h3></div><span>Higher = less committed evidence</span></div>
        <PlotlyFigure
          data={[{
            z: matrices.uncertainty,
            x: levelsX,
            y: levelsY,
            type: 'heatmap',
            colorbar: { title: '%', tickfont: { size: 8 }, titlefont: { size: 8 } },
            hovertemplate: 'Health %{x}<br>Conflict %{y}<br>Uncertainty %{z:.1f}%<extra></extra>'
          }]}
          layout={heatLayout('Uncertainty surface', 'Network health (%)', 'Conflict pressure (%)')}
        />
      </div>

      <div className="experiment-chart-card">
        <div className="experiment-chart-head"><div><div className="eyebrow">SURFACE C</div><h3>Decision phase boundary</h3></div><span>0 commit · 1 uncertain · 2 abstain</span></div>
        <PlotlyFigure
          data={[{
            z: matrices.phaseCode,
            text: phaseText,
            x: levelsX,
            y: levelsY,
            type: 'heatmap',
            zmin: 0,
            zmax: 2,
            colorbar: {
              title: 'Phase',
              tickmode: 'array',
              tickvals: phaseTicks.map(item => item.value),
              ticktext: phaseTicks.map(item => item.label),
              tickfont: { size: 8 },
              titlefont: { size: 8 }
            },
            texttemplate: '%{text}',
            hovertemplate: 'Health %{x}<br>Conflict %{y}<br>%{text}<extra></extra>'
          }]}
          layout={heatLayout('Commit → uncertainty → abstain', 'Network health (%)', 'Conflict pressure (%)')}
        />
      </div>

      <div className="experiment-chart-card">
        <div className="experiment-chart-head"><div><div className="eyebrow">SURFACE D</div><h3>False-confidence sensitivity</h3></div><span>Sentinel − confidence-only</span></div>
        <PlotlyFigure
          data={[{
            z: matrices.falseConfidenceDelta,
            x: levelsX,
            y: levelsY,
            type: 'heatmap',
            zmid: 0,
            colorbar: { title: 'pts', tickfont: { size: 8 }, titlefont: { size: 8 } },
            hovertemplate: 'Health %{x}<br>Conflict %{y}<br>Δ false confidence %{z:.1f} pts<extra></extra>'
          }]}
          layout={heatLayout('Calibration / safety delta', 'Network health (%)', 'Conflict pressure (%)')}
        />
      </div>
    </div>

    <div className="surface-table">
      <div className="surface-table-head"><span>Grid</span><span>Probability</span><span>Uncertainty</span><span>Abstain</span><span>False conf.</span><span>Phase</span></div>
      {(study?.cells || []).filter(function(cell) {
        return cell.networkHealth === 100 ||
          cell.networkHealth === 10 ||
          cell.conflictPressure === 0 ||
          cell.conflictPressure === 90;
      }).slice(0, 28).map(function(cell) {
        return <div className="surface-table-row" key={cell.networkHealth + '-' + cell.conflictPressure}>
          <span><b>H{cell.networkHealth}</b> / C{cell.conflictPressure}</span>
          <span>{cell.probability}%</span>
          <span>{cell.uncertainty}%</span>
          <span>{cell.abstentionRate}%</span>
          <span>{cell.falseConfidenceRate}%</span>
          <span className={'phase-badge phase-' + cell.phase.toLowerCase()}>{cell.phase}</span>
        </div>;
      })}
    </div>

    <div className="surface-note"><strong>Method boundary.</strong> The phase map is a visualization of the production fusion output, not an operational rule. Ground truth exists only inside the synthetic scorer after the decision is formed.</div>
  </div>;
}


function researchSnapshotCsv(snapshot) {
  const rows = [
    ['layer', 'metric', 'value', 'unit', 'interpretation'],
    ['benchmark', 'sentinelAccuracy', snapshot.benchmark?.accuracy ?? '', 'percent', 'Overall synthetic benchmark accuracy'],
    ['benchmark', 'sentinelFalseConfidence', snapshot.benchmark?.falseConfidenceRate ?? '', 'percent', 'Wrong high-confidence commitments'],
    ['benchmark', 'sentinelCoverage', snapshot.benchmark?.coverage ?? '', 'percent', 'Cases receiving a committed prediction'],
    ['benchmark', 'sentinelECE', snapshot.benchmark?.ece ?? '', 'ratio', 'Covered calibration error'],
    ['resilience', 'attackStoppedRate', snapshot.resilience?.headline?.attackStoppedRate ?? '', 'percent', 'Synthetic attack cases correctly handled or deferred'],
    ['resilience', 'falseConfidenceReduction', snapshot.resilience?.headline?.falseConfidenceReduction ?? '', 'points', 'Reduction vs confidence-only resilience baseline'],
    ['experiment', 'finalAccuracyGain', snapshot.experiment?.headline?.finalAccuracyGain ?? '', 'points', 'Adaptive vs fixed, final four rounds'],
    ['experiment', 'finalRatingGain', snapshot.experiment?.headline?.finalRatingGain ?? '', 'rating', 'Adaptive vs fixed final Glicko-2 rating'],
    ['experiment', 'accuracyP', snapshot.experiment?.statistics?.comparisons?.accuracy?.pValueRandomization ?? '', 'p-value', 'Paired synthetic session comparison'],
    ['ablation', 'largestAccuracyDrop', snapshot.ablation?.headline?.largestAccuracyDrop ?? '', 'points', 'Largest accuracy delta observed after mechanism removal'],
    ['ablation', 'largestFalseConfidenceChange', snapshot.ablation?.headline?.largestFalseConfidenceChange ?? '', 'points', 'Largest absolute false-confidence sensitivity'],
    ['surface', 'stressUncertainty', snapshot.surface?.headline?.stressUncertainty ?? '', 'percent', 'Winning probability uncertainty at the stress corner'],
    ['surface', 'stressAbstentionRate', snapshot.surface?.headline?.stressAbstentionRate ?? '', 'percent', 'Abstention at the stress corner']
  ];
  return rows.map(row => row.map(value => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(',')).join('\\n');
}

function ResearchEvidenceDashboard({ benchmark, resilience, experiment, ablation, surface }) {
  const sentinel = benchmark?.methods?.sentinel || {};
  const reliability = benchmark?.methods?.reliability || {};
  const naive = benchmark?.methods?.naive || {};
  const accuracyStats = experiment?.statistics?.comparisons?.accuracy;
  const finalStats = experiment?.statistics?.comparisons?.finalAccuracy;
  const snapshot = { benchmark: sentinel, resilience, experiment, ablation, surface };

  const accuracyStats = experiment?.statistics?.comparisons?.accuracy;
  const finalStats = experiment?.statistics?.comparisons?.finalAccuracy;

  const safetyRows = [
    { label: 'Benchmark accuracy', sentinel: sentinel.accuracy, baseline: reliability.accuracy, suffix: '%' },
    { label: 'False confidence', sentinel: sentinel.falseConfidenceRate, baseline: reliability.falseConfidenceRate, suffix: '%' },
    { label: 'Coverage', sentinel: sentinel.coverage, baseline: reliability.coverage, suffix: '%' }
  ];

  const attackRows = Object.values(resilience?.byAttack || {});

  return <section className="research-dashboard">
    <div className="section-head">
      <div>
        <div className="eyebrow">RESEARCH EVIDENCE DASHBOARD · SYNTHETIC</div>
        <h2>One evidence chain, five validation layers <span className="badge live">AUDITABLE</span></h2>
      </div>
      <div className="export-actions">
        <button className="ghost-btn" onClick={function() {
          const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
          downloadBlob(blob, 'sentinel-grid-research-snapshot.json');
        }}>SNAPSHOT JSON</button>
        <button className="ghost-btn" onClick={function() {
          const blob = new Blob([researchSnapshotCsv(snapshot)], { type: 'text/csv;charset=utf-8' });
          downloadBlob(blob, 'sentinel-grid-research-snapshot.csv');
        }}>SNAPSHOT CSV</button>
      </div>
    </div>

    <div className="research-chain">
      <div><small>01 · BENCHMARK</small><strong>{sentinel.accuracy ?? '—'}%</strong><span>{benchmark?.totalRuns ?? '—'} cases · {sentinel.falseConfidenceRate ?? '—'}% false confidence</span></div>
      <div><small>02 · RESILIENCE</small><strong>{resilience?.headline?.attackStoppedRate ?? '—'}%</strong><span>{resilience?.totalRuns ?? '—'} attack cases handled or deferred</span></div>
      <div><small>03 · CURRICULUM</small><strong>{experiment?.headline?.finalAccuracyGain > 0 ? '+' : ''}{experiment?.headline?.finalAccuracyGain ?? '—'} pts</strong><span>{experiment?.sessions ?? '—'} virtual trainees · paired inference</span></div>
      <div><small>04 · ABLATION</small><strong>{ablation?.headline?.largestAccuracyDrop > 0 ? '+' : ''}{ablation?.headline?.largestAccuracyDrop ?? '—'} pts</strong><span>{ablation?.runs ?? '—'} shared cases · mechanism sensitivity</span></div>
      <div><small>05 · DEGRADATION</small><strong>{surface?.headline?.stressAbstentionRate ?? '—'}%</strong><span>Stress-corner abstention · {surface?.headline?.stressUncertainty ?? '—'}% uncertainty</span></div>
    </div>

    <div className="research-evidence-grid">
      <div className="research-card">
        <div className="experiment-chart-head"><div><div className="eyebrow">EVIDENCE PANEL A</div><h3>Baseline → Sentinel safety profile</h3></div><span>Benchmark suite</span></div>
        <PlotlyFigure
          data={[
            {
              x: safetyRows.map(row => row.label),
              y: safetyRows.map(row => row.baseline),
              name: 'Reliability × freshness',
              type: 'bar',
              hovertemplate: '%{x}<br>Baseline %{y:.1f}%<extra></extra>'
            },
            {
              x: safetyRows.map(row => row.label),
              y: safetyRows.map(row => row.sentinel),
              name: 'Sentinel Ω',
              type: 'bar',
              hovertemplate: '%{x}<br>Sentinel %{y:.1f}%<extra></extra>'
            }
          ]}
          layout={{
            barmode: 'group',
            margin: { l: 48, r: 18, t: 35, b: 65 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(8,19,27,.55)',
            font: { family: 'Manrope', color: '#91a8b3', size: 9 },
            xaxis: { tickfont: { family: 'DM Mono', size: 8 }, gridcolor: '#19323e' },
            yaxis: { title: 'Percent', range: [0,100], gridcolor: '#19323e' },
            legend: { orientation: 'h', y: 1.12, font: { family: 'DM Mono', size: 8 } }
          }}
        />
      </div>

      <div className="research-card">
        <div className="experiment-chart-head"><div><div className="eyebrow">EVIDENCE PANEL B</div><h3>Red-team attack containment</h3></div><span>Higher = more attacks stopped</span></div>
        <PlotlyFigure
          data={[{
            x: attackRows.map(row => row.label),
            y: attackRows.map(row => row.attackStoppedRate),
            type: 'bar',
            text: attackRows.map(row => row.attackStoppedRate + '%'),
            textposition: 'outside',
            hovertemplate: '%{x}<br>Stopped %{y:.1f}%<br>False-confidence reduction %{customdata:.1f} pts<extra></extra>',
            customdata: attackRows.map(row => row.falseConfidenceReduction)
          }]}
          layout={{
            margin: { l: 48, r: 18, t: 35, b: 105 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(8,19,27,.55)',
            font: { family: 'Manrope', color: '#91a8b3', size: 9 },
            xaxis: { tickangle: -22, tickfont: { family: 'DM Mono', size: 8 }, gridcolor: '#19323e' },
            yaxis: { title: 'Stopped (%)', range: [0,100], gridcolor: '#19323e' }
          }}
        />
      </div>
    </div>

    <div className="research-ledger">
      <div className="research-ledger-head">
        <div><div className="eyebrow">EVIDENCE LEDGER</div><h3>What each layer demonstrates</h3></div>
        <span>Do not read synthetic statistics as human evidence</span>
      </div>
      {[
        ['Benchmark', 'Compares fusion families under baseline, delay, loss and conflict conditions.', 'algorithmic comparison'],
        ['Red-team', 'Falsification harness measures whether stale, duplicated, contradictory or missing evidence produces false confidence.', 'resilience / safety sensitivity'],
        ['Curriculum', 'Tests fixed vs adaptive exercise policies over seeded virtual trainees with paired uncertainty estimates.', 'simulator behavior'],
        ['Ablation', 'Removes mechanisms from the same generated case stream to expose sensitivity to freshness, learning, abstention and fusion.', 'mechanism sensitivity'],
        ['Degradation surface', 'Maps communication quality and contradiction pressure to probability, uncertainty and abstention phase.', 'response boundary']
      ].map(function(row) {
        return <div className="research-ledger-row" key={row[0]}>
          <b>{row[0]}</b><span>{row[1]}</span><em>{row[2]}</em>
        </div>;
      })}
    </div>

    <div className="research-claim">
      <div><span className="claim-icon">◎</span><div><strong>Current defensible claim</strong><p>The prototype demonstrates an auditable, reproducible decision-intelligence pipeline whose uncertainty, abstention and mechanism sensitivity can be stress-tested in a synthetic environment.</p></div></div>
      <div><span className="claim-icon">!</span><div><strong>Explicit boundary</strong><p>{accuracyStats ? 'Adaptive/fixed accuracy difference: ' + accuracyStats.difference.toFixed(1) + ' pts; paired p=' + formatP(accuracyStats.pValueRandomization) + '. ' : ''}{finalStats ? 'Final-period difference: ' + finalStats.difference.toFixed(1) + ' pts with 95% CI [' + finalStats.confidenceInterval95.lower.toFixed(1) + ', ' + finalStats.confidenceInterval95.upper.toFixed(1) + ']. ' : ''}These are simulator uncertainty estimates, not participant-study conclusions.</p></div></div>
    </div>
  </section>;
}

export default function ExperimentPanel({ experiment, onRerun, ablationStudy, onAblationRerun, degradationSurface, onDegradationRerun, benchmark, resilience }) {
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
  const statistics = experiment.statistics;
  const publicationRows = statistics?.publicationTable || [];
  const accuracyStats = statistics?.comparisons?.accuracy;
  const finalAccuracyStats = statistics?.comparisons?.finalAccuracy;

  const learningTraces = [
    {
      x: learning.map(x => x.round),
      y: learning.map(x => x.fixedAccuracyCI95?.[0] ?? x.fixedAccuracy),
      showlegend: false,
      line: { width: 0 },
      hoverinfo: 'skip'
    },
    {
      x: learning.map(x => x.round),
      y: learning.map(x => x.fixedAccuracyCI95?.[1] ?? x.fixedAccuracy),
      name: 'Fixed 95% CI',
      mode: 'lines',
      fill: 'tonexty',
      fillcolor: 'rgba(109,191,224,.10)',
      line: { width: 0 },
      hoverinfo: 'skip'
    },
    {
      x: learning.map(x => x.round),
      y: learning.map(x => x.adaptiveAccuracyCI95?.[0] ?? x.adaptiveAccuracy),
      showlegend: false,
      line: { width: 0 },
      hoverinfo: 'skip'
    },
    {
      x: learning.map(x => x.round),
      y: learning.map(x => x.adaptiveAccuracyCI95?.[1] ?? x.adaptiveAccuracy),
      name: 'Adaptive 95% CI',
      mode: 'lines',
      fill: 'tonexty',
      fillcolor: 'rgba(111,215,180,.10)',
      line: { width: 0 },
      hoverinfo: 'skip'
    },
    {
      x: learning.map(x => x.round),
      y: learning.map(x => x.fixedAccuracy),
      name: 'Fixed accuracy',
      mode: 'lines+markers',
      line: { width: 2 },
      marker: { size: 5 }
    },
    {
      x: learning.map(x => x.round),
      y: learning.map(x => x.adaptiveAccuracy),
      name: 'Adaptive accuracy',
      mode: 'lines+markers',
      line: { width: 2 },
      marker: { size: 5 }
    }
  ];

  return <div className="experiment-layout">
    <section className="experiment-main">
      <ResearchEvidenceDashboard benchmark={benchmark} resilience={resilience} experiment={experiment} ablation={ablationStudy} surface={degradationSurface} />
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
          <div className="experiment-chart-head"><div><div className="eyebrow">PANEL A</div><h3>Learning curve</h3></div><span>Accuracy · 95% CI</span></div>
          <PlotlyFigure
            data={learningTraces}
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

      <div className="experiment-stats">
        <div className="experiment-stats-head">
          <div>
            <div className="eyebrow">STATISTICAL INFERENCE</div>
            <h3>Paired effect estimates</h3>
          </div>
          <span>95% percentile bootstrap · session-level</span>
        </div>
        <div className="experiment-stats-grid">
          <div><small>OVERALL ACCURACY Δ</small><strong>{accuracyStats ? (accuracyStats.difference >= 0 ? '+' : '') + accuracyStats.difference.toFixed(1) + ' pts' : '—'}</strong><span>95% CI {accuracyStats ? accuracyStats.confidenceInterval95.lower.toFixed(1) + ' to ' + accuracyStats.confidenceInterval95.upper.toFixed(1) + ' pts' : '—'}</span></div>
          <div><small>FINAL 4-ROUND Δ</small><strong>{finalAccuracyStats ? (finalAccuracyStats.difference >= 0 ? '+' : '') + finalAccuracyStats.difference.toFixed(1) + ' pts' : '—'}</strong><span>95% CI {finalAccuracyStats ? finalAccuracyStats.confidenceInterval95.lower.toFixed(1) + ' to ' + finalAccuracyStats.confidenceInterval95.upper.toFixed(1) + ' pts' : '—'}</span></div>
          <div><small>RANDOMIZATION p</small><strong>{accuracyStats ? formatP(accuracyStats.pValueRandomization) : '—'}</strong><span>Paired session sign-randomization</span></div>
        </div>
        <div className="experiment-stats-table">
          <div className="experiment-stats-row experiment-stats-head-row">
            <span>Metric</span><span>Fixed</span><span>Adaptive</span><span>Δ</span><span>95% CI</span><span>p</span><span>Effect</span>
          </div>
          {publicationRows.map(function(row) {
            const ci = row.confidenceInterval95 || {};
            const isBrier = row.label.includes('Brier');
            const digits = isBrier ? 3 : 1;
            return <div className="experiment-stats-row" key={row.label}>
              <span><strong>{row.label}</strong><small>{row.effectSize?.type || 'paired comparison'}</small></span>
              <span>{row.fixed === null ? '—' : Number(row.fixed).toFixed(digits)}</span>
              <span>{row.adaptive === null ? '—' : Number(row.adaptive).toFixed(digits)}</span>
              <span className={Number(row.difference) >= 0 ? 'stat-positive' : 'stat-negative'}>{Number(row.difference) >= 0 ? '+' : ''}{Number(row.difference).toFixed(digits)}</span>
              <span>[{Number(ci.lower).toFixed(digits)}, {Number(ci.upper).toFixed(digits)}]</span>
              <span>{formatP(row.pValueRandomization)}</span>
              <span>{formatEffect(row)}</span>
            </div>;
          })}
        </div>
        <div className="experiment-method-note">
          <strong>{statistics?.method || 'Paired statistical comparison'}</strong>.
          Resampling unit: <b>{statistics?.bootstrapUnit || 'virtual trainee/session'}</b>.
          Bootstrap repetitions: <b>{statistics?.bootstrapRepetitions?.toLocaleString() || '—'}</b>; paired sign-randomization repetitions: <b>{statistics?.permutationRepetitions?.toLocaleString() || '—'}</b>.
          These intervals quantify uncertainty in the synthetic simulator and do not establish human-learning effects.
        </div>
      </div>

      <DegradationSurfacePanel study={degradationSurface} onRerun={onDegradationRerun} />

      <AblationPanel study={ablationStudy} onRerun={onAblationRerun} />

      <div className="experiment-note"><strong>Interpretation.</strong> This is a controlled synthetic experiment. The virtual trainee is simulated, so the plots do not establish real human-learning effects. The confidence bands, bootstrap intervals, paired randomization tests and effect sizes are included to make the simulator's behavior auditable rather than to substitute for a participant study.</div>
    </section>

    <aside className="experiment-side">
      <div className="eyebrow">EXPERIMENT DESIGN</div>
      <h3>What the lab measures</h3>
      <div className="benchmark-points">
        <div><b>01</b><span><strong>Procedural scenarios</strong> Fixed and adaptive curricula draw from the same seeded generator family.</span></div>
        <div><b>02</b><span><strong>Repeated exposure</strong> Each virtual trainee completes the same number of rounds.</span></div>
        <div><b>03</b><span><strong>Skill trajectory</strong> Glicko-2 rating is tracked after every synthetic decision.</span></div>
        <div><b>04</b><span><strong>Calibration</strong> Brier-oriented confidence is visualized separately from accuracy.</span></div>
        <div><b>05</b><span><strong>Paired inference</strong> Sessions are resampled as intact units to respect repeated-measures structure.</span></div>
        <div><b>06</b><span><strong>Exportable data</strong> Trial-level paired results and full statistical outputs can be saved.</span></div>
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
