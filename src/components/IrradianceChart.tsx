import { useEffect, useRef } from 'react';
import embed, { type VisualizationSpec } from 'vega-embed';
import * as vega from 'vega';
import { useSimStore } from '../store';
import type { Snapshot } from '../types';
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

function buildRows(snapshots: Snapshot[], divisor: number): Row[] {
  const pts = new Array<[number, number]>(snapshots.length);
  for (let i = 0; i < snapshots.length; i++) {
    pts[i] = [snapshots[i].t / divisor, snapshots[i].G];
  }
  return (LTTB(pts, DOWNSAMPLE_THRESHOLD) as [number, number][]).map(
    ([t, G]) => ({ t: +t.toFixed(4), G: +G.toFixed(1) }),
  );
}

export default function IrradianceChart({ width = 640, height = 180 }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const vegaRef       = useRef<Awaited<ReturnType<typeof embed>> | null>(null);
  const unitRef       = useRef<TimeUnit>('min');
  const lastRebuildAt = useRef<number>(0);
  const renderTick    = useSimStore((s) => s.renderTick);

  useEffect(() => {
    if (!containerRef.current) return;
    embed(containerRef.current, buildSpec(width, height, AXIS_TITLE['min']), {
      actions: false, renderer: 'canvas',
    }).then(res => { vegaRef.current = res; });

    return () => { vegaRef.current?.finalize(); vegaRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const snapshots = useSimStore.getState().snapshots;
    if (!vegaRef.current || snapshots.length === 0) return;

    const maxT    = snapshots[snapshots.length - 1].t;
    const newUnit = getTimeUnit(maxT);
    const divisor = DIVISOR[newUnit];

    if (newUnit !== unitRef.current) {
      unitRef.current       = newUnit;
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

    const sinceRebuild = snapshots.length - lastRebuildAt.current;
    if (sinceRebuild >= FULL_REBUILD_INTERVAL) {
      lastRebuildAt.current = snapshots.length;
      vegaRef.current.view.data('table', buildRows(snapshots, divisor)).run();
      return;
    }

    // Incremental insert for the hot path
    const s  = snapshots[snapshots.length - 1];
    const cs = vega.changeset().insert([{ t: +(s.t / divisor).toFixed(4), G: +s.G.toFixed(1) }]);
    vegaRef.current.view.change('table', cs).run();

  }, [renderTick, width, height]);

  return <div ref={containerRef} />;
}