import { useEffect, useRef } from 'react';
import embed, { type VisualizationSpec } from 'vega-embed';
import * as vega from 'vega';
import { useSimStore } from '../store';
import { LTTB } from 'downsample';

type Props = { width?: number; height?: number };
type TimeUnit = 'min' | 'h' | 'd';
type Row = { t: number; G: number };

const DOWNSAMPLE_THRESHOLD = 600;
const FULL_REBUILD_INTERVAL = 500;

function getTimeUnit(maxT_s: number): TimeUnit {
  if (maxT_s < 7_200)   return 'min';
  if (maxT_s < 172_800) return 'h';
  return 'd';
}

const DIVISOR:    Record<TimeUnit, number> = { min: 60,          h: 3600,    d: 86400   };
const AXIS_TITLE: Record<TimeUnit, string> = { min: 'Time (min)', h: 'Time (h)', d: 'Time (days)' };

function buildSpec(width: number, height: number, xTitle: string): VisualizationSpec {
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: width - 80,
    height,
    padding: { top: 8, right: 16, bottom: 40, left: 56 },
    data: { name: 'table' },
    mark: { type: 'area', color: '#f4a261', opacity: 0.6, line: { color: '#e76f51' } },
    encoding: {
      x: { field: 't', type: 'quantitative', axis: { title: xTitle } },
      y: {
        field: 'G', type: 'quantitative',
        axis:  { title: 'Irradiance (W/m²)' },
        scale: { domain: [0, 1400] },
      },
    },
    config: {
      background: 'transparent',
      axis: { labelColor: '#c9d1d9', titleColor: '#c9d1d9', gridColor: '#30363d' },
      view: { stroke: 'transparent' },
    },
  };
}

function buildRows(t_arr: Float32Array, G_arr: Float32Array, divisor: number): Row[] {
  const n = t_arr.length;
  const pts = new Array<[number, number]>(n);
  for (let i = 0; i < n; i++) pts[i] = [t_arr[i] / divisor, G_arr[i]];
  return (LTTB(pts, DOWNSAMPLE_THRESHOLD) as [number, number][]).map(
    ([t, G]) => ({ t: +t.toFixed(4), G: +G.toFixed(1) }),
  );
}

export default function IrradianceChart({ width = 640, height = 180 }: Props) {
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
          res.view.data('table', buildRows(t_arr, ss.G, divisor)).run();
        });
      }
      return;
    }

    if (ss.length - lastRebuildAt.current >= FULL_REBUILD_INTERVAL) {
      lastRebuildAt.current = ss.length;
      vegaRef.current.view.data('table', buildRows(t_arr, ss.G, divisor)).run();
      return;
    }

    const i = ss.length - 1;
    const cs = vega.changeset().insert([{ t: +(t_arr[i] / divisor).toFixed(4), G: +ss.G[i].toFixed(1) }]);
    vegaRef.current.view.change('table', cs).run();

  }, [renderTick, width, height]);

  return <div ref={containerRef} />;
}