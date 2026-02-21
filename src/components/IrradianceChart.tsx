import { useEffect, useRef } from 'react';
import embed, { type VisualizationSpec } from 'vega-embed';
import type { Snapshot } from '../types';

type Props = {
  history: Snapshot[];
  width?: number;
  height?: number;
};

export default function IrradianceChart({ history, width = 640, height = 180 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vegaRef = useRef<Awaited<ReturnType<typeof embed>> | null>(null);

  const data = history.map((s) => ({
    t: +(s.t / 60).toFixed(2),
    G: +s.G.toFixed(1),
  }));

  const spec: VisualizationSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: width - 80,
    height,
    data: { name: 'table' },
    mark: { type: 'area', color: '#f4a261', opacity: 0.6, line: { color: '#e76f51' } },
    encoding: {
      x: { field: 't', type: 'quantitative', title: 'Time (min)' },
      y: { field: 'G', type: 'quantitative', title: 'Irradiance (W/m²)', scale: { domain: [0, 1200] } },
    },
    config: {
      background: 'transparent',
      axis: { labelColor: '#c9d1d9', titleColor: '#c9d1d9', gridColor: '#30363d' },
      view: { stroke: 'transparent' },
    },
  };

  useEffect(() => {
    if (!containerRef.current) return;
    if (!vegaRef.current) {
      embed(containerRef.current, spec, { actions: false, renderer: 'canvas' }).then((res) => {
        vegaRef.current = res;
        res.view.insert('table', data).run();
      });
    } else {
      vegaRef.current.view.data('table', data).run();
    }
  });

  useEffect(() => {
    return () => {
      vegaRef.current?.finalize();
      vegaRef.current = null;
    };
  }, []);

  return <div ref={containerRef} />;
}
