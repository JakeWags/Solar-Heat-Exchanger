import { useEffect, useRef } from 'react';
import embed, { type VisualizationSpec } from 'vega-embed';
import * as vega from 'vega';
import { useSimStore } from '../store';
import type { Snapshot } from '../types';
import { LTTB } from 'downsample';

type Props = { width?: number; height?: number };
type TimeUnit = 'min' | 'h' | 'd';
type Row = { t: number; Temperature: number; series: string };

const DOWNSAMPLE_THRESHOLD = 800; // max points per series shown in chart
// Rebuild from scratch when unit changes OR snapshot count crosses these
const FULL_REBUILD_INTERVAL = 500;

function getTimeUnit(maxT_s: number): TimeUnit {
  if (maxT_s < 7_200)   return 'min';
  if (maxT_s < 172_800) return 'h';
  return 'd';
}

const DIVISOR:    Record<TimeUnit, number> = { min: 60,         h: 3600,   d: 86400 };
const AXIS_TITLE: Record<TimeUnit, string> = { min: 'Time (min)', h: 'Time (h)', d: 'Time (days)' };

function buildSpec(width: number, height: number, xTitle: string): VisualizationSpec {
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: width - 80,
    height,
    padding: { top: 8, right: 16, bottom: 40, left: 56 },
    data: { name: 'table' },
    mark: { type: 'line', strokeWidth: 2 },
    encoding: {
      x: { field: 't', type: 'quantitative', axis: { title: xTitle } },
      y: { field: 'Temperature', type: 'quantitative', axis: { title: 'Temperature (°C)' } },
      color: {
        field: 'series', type: 'nominal', title: 'Series',
        scale: {
          domain: ['Panel', 'Tank', 'Outlet'],
          range:  ['#e63946', '#457b9d', '#2a9d8f'],
        },
      },
    },
    config: {
      background: 'transparent',
      axis:   { labelColor: '#c9d1d9', titleColor: '#c9d1d9', gridColor: '#30363d' },
      legend: { labelColor: '#c9d1d9', titleColor: '#c9d1d9' },
      view:   { stroke: 'transparent' },
    },
  };
}

/** Convert raw snapshots → interleaved Row array, then downsample per series. */
function buildRows(snapshots: Snapshot[], divisor: number): Row[] {
  const panelPts  = new Array<[number, number]>(snapshots.length);
  const tankPts    = new Array<[number, number]>(snapshots.length);
  const outletPts  = new Array<[number, number]>(snapshots.length);

  for (let i = 0; i < snapshots.length; i++) {
    const s = snapshots[i];
    const t = s.t / divisor;
    panelPts[i]  = [t, s.T_panel];
    tankPts[i]   = [t, s.T_tank];
    outletPts[i] = [t, s.T_out_panel];
  }

  const dp  = LTTB(panelPts,  DOWNSAMPLE_THRESHOLD) as [number, number][];
  const dt  = LTTB(tankPts,   DOWNSAMPLE_THRESHOLD) as [number, number][];
  const do_ = LTTB(outletPts, DOWNSAMPLE_THRESHOLD) as [number, number][];

  // Pre-allocate exact size
  const rows: Row[] = new Array(dp.length + dt.length + do_.length);
  let idx = 0;
  for (const [t, v] of dp)  rows[idx++] = { t: +t.toFixed(4), Temperature: +v.toFixed(2), series: 'Panel'  };
  for (const [t, v] of dt)  rows[idx++] = { t: +t.toFixed(4), Temperature: +v.toFixed(2), series: 'Tank'   };
  for (const [t, v] of do_) rows[idx++] = { t: +t.toFixed(4), Temperature: +v.toFixed(2), series: 'Outlet' };
  return rows;
}

export default function TempChart({ width = 640, height = 300 }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const vegaRef       = useRef<Awaited<ReturnType<typeof embed>> | null>(null);
  const unitRef       = useRef<TimeUnit>('min');
  // Track how many snapshots were in the last full rebuild
  const lastRebuildAt = useRef<number>(0);
  const renderTick    = useSimStore((s) => s.renderTick);

  // ── Mount: initial embed ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    embed(containerRef.current, buildSpec(width, height, AXIS_TITLE['min']), {
      actions: false, renderer: 'canvas',
    }).then(res => { vegaRef.current = res; });

    return () => { vegaRef.current?.finalize(); vegaRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Per-tick update ───────────────────────────────────────────────────────
  useEffect(() => {
    const snapshots = useSimStore.getState().snapshots;
    if (!vegaRef.current || snapshots.length === 0) return;

    const maxT    = snapshots[snapshots.length - 1].t;
    const newUnit = getTimeUnit(maxT);
    const divisor = DIVISOR[newUnit];

    // ── Unit changed → full re-embed ─────────────────────────────────────
    if (newUnit !== unitRef.current) {
      unitRef.current   = newUnit;
      lastRebuildAt.current = snapshots.length;
      vegaRef.current.finalize();
      vegaRef.current = null;

      if (containerRef.current) {
        embed(containerRef.current, buildSpec(width, height, AXIS_TITLE[newUnit]), {
          actions: false, renderer: 'canvas',
        }).then(res => {
          vegaRef.current = res;
          res.view.data('table', buildRows(snapshots, divisor)).run();
        });
      }
      return;
    }

    // ── Periodic full rebuild (keeps LTTB accurate over the whole dataset) ─
    const sinceRebuild = snapshots.length - lastRebuildAt.current;
    if (sinceRebuild >= FULL_REBUILD_INTERVAL) {
      lastRebuildAt.current = snapshots.length;
      vegaRef.current.view.data('table', buildRows(snapshots, divisor)).run();
      return;
    }

    // ── Hot path: incremental insert of only the new snapshot ────────────
    // Still downsamples the tail but inserts only the latest point cheaply.
    const s       = snapshots[snapshots.length - 1];
    const t       = +(s.t / divisor).toFixed(4);
    const newRows: Row[] = [
      { t, Temperature: +s.T_panel.toFixed(2),     series: 'Panel'  },
      { t, Temperature: +s.T_tank.toFixed(2),       series: 'Tank'   },
      { t, Temperature: +s.T_out_panel.toFixed(2),  series: 'Outlet' },
    ];
    const cs = vega.changeset().insert(newRows);
    vegaRef.current.view.change('table', cs).run();

  }, [renderTick, width, height]);

  return <div ref={containerRef} />;
}