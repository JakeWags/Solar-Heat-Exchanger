import { useEffect, useRef } from 'react';
import embed, { type VisualizationSpec } from 'vega-embed';
import { useSimStore } from '../store';
import type { Snapshot } from '../types';

type Props = { width?: number; height?: number };

type TimeUnit = 'min' | 'h' | 'd';

function getTimeUnit(maxT_s: number): TimeUnit {
  if (maxT_s < 7_200) return 'min';     // < 2 h
  if (maxT_s < 172_800) return 'h';     // < 2 days
  return 'd';
}

const DIVISOR: Record<TimeUnit, number> = { min: 60, h: 3600, d: 86400 };
const AXIS_TITLE: Record<TimeUnit, string> = {
  min: 'Time (min)',
  h: 'Time (h)',
  d: 'Time (days)',
};

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
        field: 'series',
        type: 'nominal',
        title: 'Series',
        scale: {
          domain: ['Panel', 'Tank', 'Outlet'],
          range: ['#e63946', '#457b9d', '#2a9d8f'],
        },
      },
    },
    config: {
      background: 'transparent',
      axis: { labelColor: '#c9d1d9', titleColor: '#c9d1d9', gridColor: '#30363d' },
      legend: { labelColor: '#c9d1d9', titleColor: '#c9d1d9' },
      view: { stroke: 'transparent' },
    },
  };
}

function buildData(
  snapshots: Snapshot[],
  divisor: number,
): { t: number; Temperature: number; series: string }[] {
  const out = new Array(snapshots.length * 3);
  for (let i = 0; i < snapshots.length; i++) {
    const s = snapshots[i];
    const t = +(s.t / divisor).toFixed(4);
    out[i * 3]     = { t, Temperature: +s.T_panel.toFixed(2),     series: 'Panel' };
    out[i * 3 + 1] = { t, Temperature: +s.T_tank.toFixed(2),      series: 'Tank' };
    out[i * 3 + 2] = { t, Temperature: +s.T_out_panel.toFixed(2), series: 'Outlet' };
  }
  return out;
}

export default function TempChart({ width = 640, height = 300 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vegaRef = useRef<Awaited<ReturnType<typeof embed>> | null>(null);
  const unitRef = useRef<TimeUnit>('min');
  const renderTick = useSimStore((s) => s.renderTick);

  // Initial embed on mount
  useEffect(() => {
    if (!containerRef.current) return;
    embed(containerRef.current, buildSpec(width, height, AXIS_TITLE['min']), {
      actions: false,
      renderer: 'canvas',
    }).then((res) => { vegaRef.current = res; });
    return () => {
      vegaRef.current?.finalize();
      vegaRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data update at ~10 fps; re-embed when time unit changes
  useEffect(() => {
    const snapshots = useSimStore.getState().snapshots;
    if (!vegaRef.current || snapshots.length === 0) return;

    const maxT = snapshots[snapshots.length - 1].t;
    const newUnit = getTimeUnit(maxT);
    const data = buildData(snapshots, DIVISOR[newUnit]);

    if (newUnit !== unitRef.current) {
      unitRef.current = newUnit;
      vegaRef.current.finalize();
      vegaRef.current = null;
      if (containerRef.current) {
        embed(containerRef.current, buildSpec(width, height, AXIS_TITLE[newUnit]), {
          actions: false,
          renderer: 'canvas',
        }).then((res) => {
          vegaRef.current = res;
          res.view.data('table', data).run();
        });
      }
      return;
    }

    vegaRef.current.view.data('table', data).run();
  }, [renderTick, width, height]);

  return <div ref={containerRef} />;
}
