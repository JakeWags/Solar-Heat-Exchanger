import { useEffect, useRef } from 'react';
import embed, { type VisualizationSpec } from 'vega-embed';
import * as vega from 'vega';
import { useSimStore } from '../store';
import { LTTB } from 'downsample';

type Props = { width?: number; height?: number };
type TimeUnit = 'min' | 'h' | 'd';
type Row = { t: number; Energy: number; series: string };

const DOWNSAMPLE_THRESHOLD = 800;
const FULL_REBUILD_INTERVAL = 500;

function getTimeUnit(maxT_s: number): TimeUnit {
  if (maxT_s < 7_200)   return 'min';
  if (maxT_s < 172_800) return 'h';
  return 'd';
}

const DIVISOR:    Record<TimeUnit, number> = { min: 60,          h: 3600,    d: 86400   };
const AXIS_TITLE: Record<TimeUnit, string> = { min: 'Time (min)', h: 'Time (h)', d: 'Time (days)' };

/**
 * Calculate thermal energy stored in system above ambient temperature.
 * Returns energy in Joules.
 */
function computeThermalEnergy(
  T_panel: number,
  T_tank: number,
  T_env: number,
  C_panel: number,
  V_tank: number,
  rho: number,
  c_w: number,
): number {
  const E_panel = C_panel * (T_panel - T_env);
  const E_tank = rho * c_w * V_tank * (T_tank - T_env);
  return Math.max(0, E_panel + E_tank);
}

function buildSpec(width: number, height: number, xTitle: string): VisualizationSpec {
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: width - 80,
    height,
    padding: { top: 8, right: 16, bottom: 40, left: 56 },
    layer: [
      // Loss area (between Harvested and Stored)
      {
        data: { name: 'table' },
        transform: [
          { pivot: 'series', value: 'Energy', groupby: ['t'] },
          { calculate: 'datum.Harvested - datum.Stored', as: 'Loss' },
          { calculate: 'datum.Stored', as: 'Base' }
        ],
        mark: { type: 'area', opacity: 0.3, color: '#dc2626' },
        encoding: {
          x: { field: 't', type: 'quantitative', axis: { title: xTitle } },
          y: { field: 'Base', type: 'quantitative' },
          y2: { field: 'Harvested' }
        }
      },
      // Lines for both series
      {
        data: { name: 'table' },
        mark: { type: 'line', strokeWidth: 2 },
        encoding: {
          x: { field: 't', type: 'quantitative' },
          y: { field: 'Energy', type: 'quantitative', axis: { title: 'Energy (MJ)' } },
          color: {
            field: 'series', type: 'nominal', title: 'Series',
            scale: {
              domain: ['Harvested', 'Stored'],
              range:  ['#2a9d8f', '#e76f51'],
            },
          },
        },
      }
    ],
    config: {
      background: 'transparent',
      axis: { labelColor: '#c9d1d9', titleColor: '#c9d1d9', gridColor: '#30363d' },
      legend: { labelColor: '#c9d1d9', titleColor: '#c9d1d9' },
      view: { stroke: 'transparent' },
    },
  };
}

function buildRows(
  t_arr: Float32Array,
  E_harvest_arr: Float32Array,
  snapshots: any,
  params: any,
  divisor: number,
): Row[] {
  const n = t_arr.length;
  const harvestPts = new Array<[number, number]>(n);
  const storedPts = new Array<[number, number]>(n);

  for (let i = 0; i < n; i++) {
    const t = t_arr[i] / divisor;
    // E_harvest is already in Joules, convert to MJ
    harvestPts[i] = [t, E_harvest_arr[i] / 1e6];
    
    // Calculate stored thermal energy
    const thermalEnergy = computeThermalEnergy(
      snapshots.T_panel[i],
      snapshots.T_tank[i],
      params.T_env,
      params.C_panel,
      params.V_tank,
      params.rho,
      params.c_w,
    );
    storedPts[i] = [t, thermalEnergy / 1e6];
  }

  const dh = LTTB(harvestPts, DOWNSAMPLE_THRESHOLD) as [number, number][];
  const ds = LTTB(storedPts, DOWNSAMPLE_THRESHOLD) as [number, number][];

  const rows: Row[] = new Array(dh.length + ds.length);
  let idx = 0;
  for (const [t, v] of dh) rows[idx++] = { t: +t.toFixed(4), Energy: +v.toFixed(4), series: 'Harvested' };
  for (const [t, v] of ds) rows[idx++] = { t: +t.toFixed(4), Energy: +v.toFixed(4), series: 'Stored' };
  return rows;
}

export default function EnergyChart({ width = 640, height = 220 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vegaRef = useRef<Awaited<ReturnType<typeof embed>> | null>(null);
  const unitRef = useRef<TimeUnit>('min');
  const lastRebuildAt = useRef<number>(0);
  const renderTick = useSimStore((s) => s.renderTick);

  useEffect(() => {
    if (!containerRef.current) return;
    embed(containerRef.current, buildSpec(width, height, AXIS_TITLE['min']), {
      actions: false, renderer: 'canvas',
    }).then(res => { vegaRef.current = res; });

    return () => { vegaRef.current?.finalize(); vegaRef.current = null; };
  }, [width, height]);

  useEffect(() => {
    const ss = useSimStore.getState().snapshots;
    const params = useSimStore.getState().params;
    if (!vegaRef.current || ss.length === 0) return;

    const t_arr = ss.t;
    const maxT = t_arr[ss.length - 1];
    const newUnit = getTimeUnit(maxT);
    const divisor = DIVISOR[newUnit];

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
          res.view.data('table', buildRows(t_arr, ss.E_harvest, ss, params, divisor)).run();
        });
      }
      return;
    }

    if (ss.length - lastRebuildAt.current >= FULL_REBUILD_INTERVAL) {
      lastRebuildAt.current = ss.length;
      vegaRef.current.view.data('table', buildRows(t_arr, ss.E_harvest, ss, params, divisor)).run();
      return;
    }

    const i = ss.length - 1;
    const t = +(t_arr[i] / divisor).toFixed(4);
    const thermalEnergy = computeThermalEnergy(
      ss.T_panel[i],
      ss.T_tank[i],
      params.T_env,
      params.C_panel,
      params.V_tank,
      params.rho,
      params.c_w,
    );
    const cs = vega.changeset().insert([
      { t, Energy: +(ss.E_harvest[i] / 1e6).toFixed(4), series: 'Harvested' },
      { t, Energy: +(thermalEnergy / 1e6).toFixed(4), series: 'Stored' },
    ]);
    vegaRef.current.view.change('table', cs).run();

  }, [renderTick, width, height]);

  return <div ref={containerRef} />;
}
