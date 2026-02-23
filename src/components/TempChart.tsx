import { useEffect, useRef } from 'react';
import embed, { type VisualizationSpec } from 'vega-embed';
import * as vega from 'vega';
import { useSimStore } from '../store';
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
    resolve: { scale: { y: 'shared' } },
    layer: [
      {
        data: { name: 'table' },
        mark: { type: 'line', strokeWidth: 2 },
        encoding: {
          x: { field: 't', type: 'quantitative', axis: { title: xTitle } },
          y: { field: 'Temperature', type: 'quantitative', axis: { title: 'Temperature (°C)' } },
          color: {
            field: 'series', type: 'nominal', title: 'Series',
            scale: {
              domain: ['Panel', 'Tank'],
              range:  ['#e63946', '#457b9d'],
            },
          },
        },
      },
      {
        // Dotted horizontal rule at the current ambient temperature
        data: { name: 'ambient' },
        mark: {
          type: 'rule',
          strokeDash: [6, 4],
          strokeWidth: 1.5,
          color: '#8b949e',
        },
        encoding: {
          y: { field: 'T_env', type: 'quantitative' },
        },
      },
    ],
    config: {
      background: 'transparent',
      axis:   { labelColor: '#c9d1d9', titleColor: '#c9d1d9', gridColor: '#30363d' },
      legend: { labelColor: '#c9d1d9', titleColor: '#c9d1d9' },
      view:   { stroke: 'transparent' },
    },
  };
}

/**
 * Reads directly from SoA Float32Array views — no intermediate Snapshot[]
 * allocation. Builds LTTB tuples in one pass per series, then interleaves.
 */
function buildRows(
  t_arr: Float32Array, panel: Float32Array, tank: Float32Array, out: Float32Array,
  divisor: number,
): Row[] {
  const n = t_arr.length;
  const panelPts = new Array<[number, number]>(n);
  const tankPts = new Array<[number, number]>(n);
  const outletPts = new Array<[number, number]>(n);

  for (let i = 0; i < n; i++) {
    const t = t_arr[i] / divisor;
    panelPts[i] = [t, panel[i]];
    tankPts[i] = [t, tank[i]];
    outletPts[i] = [t, out[i]];
  }

  const dp = LTTB(panelPts,  DOWNSAMPLE_THRESHOLD) as [number, number][];
  const dt = LTTB(tankPts,   DOWNSAMPLE_THRESHOLD) as [number, number][];
  const do_ = LTTB(outletPts, DOWNSAMPLE_THRESHOLD) as [number, number][];

  const rows: Row[] = new Array(dp.length + dt.length + do_.length);
  let idx = 0;
  for (const [t, v] of dp)  rows[idx++] = { t: +t.toFixed(4), Temperature: +v.toFixed(2), series: 'Panel'  };
  for (const [t, v] of dt)  rows[idx++] = { t: +t.toFixed(4), Temperature: +v.toFixed(2), series: 'Tank'   };
  for (const [t, v] of do_) rows[idx++] = { t: +t.toFixed(4), Temperature: +v.toFixed(2), series: 'Outlet' };
  return rows;
}

export default function TempChart({ width = 640, height = 300 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vegaRef = useRef<Awaited<ReturnType<typeof embed>> | null>(null);
  const unitRef = useRef<TimeUnit>('min');
  // Track how many snapshots were in the last full rebuild
  const lastRebuildAt = useRef<number>(0);
  const renderTick = useSimStore((s) => s.renderTick);
  const T_env = useSimStore((s) => s.params.T_env);

  // -- Mount: initial embed --------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    embed(containerRef.current, buildSpec(width, height, AXIS_TITLE['min']), {
      actions: false, renderer: 'canvas',
    }).then(res => {
      vegaRef.current = res;
      res.view.data('ambient', [{ T_env: useSimStore.getState().params.T_env }]).run();
    });

    return () => { vegaRef.current?.finalize(); vegaRef.current = null; };
  }, [width, height]);

  // -- Update ambient line immediately when T_env slider changes -------------
  useEffect(() => {
    vegaRef.current?.view.data('ambient', [{ T_env }]).run();
  }, [T_env]);

  // -- Per-tick update -------------------------------------------------------
  useEffect(() => {
    const ss = useSimStore.getState().snapshots;
    if (!vegaRef.current || ss.length === 0) return;

    const t_arr = ss.t;
    const maxT = t_arr[ss.length - 1];
    const newUnit = getTimeUnit(maxT);
    const divisor = DIVISOR[newUnit];

    const doFullRebuild = () => {
      lastRebuildAt.current = ss.length;
      vegaRef.current!.view
        .data('table', buildRows(t_arr, ss.T_panel, ss.T_tank, ss.T_out, divisor))
        .run();
    };

    if (newUnit !== unitRef.current) {
      unitRef.current = newUnit;
      vegaRef.current.finalize();
      vegaRef.current = null;
      if (containerRef.current) {
        embed(containerRef.current, buildSpec(width, height, AXIS_TITLE[newUnit]), {
          actions: false, renderer: 'canvas',
        }).then(res => {
          vegaRef.current = res;
          lastRebuildAt.current = ss.length;
          const T_env = useSimStore.getState().params.T_env;
          res.view
            .data('table', buildRows(t_arr, ss.T_panel, ss.T_tank, ss.T_out, divisor))
            .data('ambient', [{ T_env }])
            .run();
        });
      }
      return;
    }

    // -- Periodic full rebuild (keeps LTTB accurate over the whole dataset) -
    if (ss.length - lastRebuildAt.current >= FULL_REBUILD_INTERVAL) {
      doFullRebuild();
      return;
    }

    const i = ss.length - 1;
    const t = +(t_arr[i] / divisor).toFixed(4);
    const cs = vega.changeset().insert([
      { t, Temperature: +ss.T_panel[i].toFixed(2), series: 'Panel'  },
      { t, Temperature: +ss.T_tank[i].toFixed(2),  series: 'Tank'   },
    ]);
    vegaRef.current.view.change('table', cs).run();

  }, [renderTick, width, height]);

  return <div ref={containerRef} />;
}