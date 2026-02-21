import { useEffect, useRef } from 'react';
import embed, { type VisualizationSpec } from 'vega-embed';
import type { Snapshot } from '../types';

type Props = {
  history: Snapshot[];
  width?: number;
  height?: number;
};

export default function TempChart({ history, width = 640, height = 300 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vegaRef = useRef<Awaited<ReturnType<typeof embed>> | null>(null);

  // Build a flat table from snapshots
  const data = history.flatMap((s) => [
    { t: +(s.t / 60).toFixed(2), Temperature: +s.T_panel.toFixed(2), series: 'Panel' },
    { t: +(s.t / 60).toFixed(2), Temperature: +s.T_tank.toFixed(2), series: 'Tank' },
    { t: +(s.t / 60).toFixed(2), Temperature: +s.T_out_panel.toFixed(2), series: 'Outlet' },
  ]);

  const spec: VisualizationSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: width - 80,
    height,
    data: { name: 'table' },
    mark: { type: 'line', strokeWidth: 2 },
    encoding: {
      x: { field: 't', type: 'quantitative', title: 'Time (min)' },
      y: { field: 'Temperature', type: 'quantitative', title: 'Temperature (°C)' },
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

  useEffect(() => {
    if (!containerRef.current) return;

    // First render: embed the chart
    if (!vegaRef.current) {
      embed(containerRef.current, spec, {
        actions: false,
        renderer: 'canvas',
      }).then((res) => {
        vegaRef.current = res;
        res.view.insert('table', data).run();
      });
    } else {
      // Subsequent renders: swap data in place
      const view = vegaRef.current.view;
      view.data('table', data).run();
    }
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      vegaRef.current?.finalize();
      vegaRef.current = null;
    };
  }, []);

  return <div ref={containerRef} />;
}
