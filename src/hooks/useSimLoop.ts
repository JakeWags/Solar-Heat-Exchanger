import { useEffect, useRef } from 'react';
import { useSimStore } from '../store';
import { rk4Step } from '../simulate';
import { computeSolarG } from '../physics';

/** Chart redraws are throttled to this interval (ms) to avoid Vega flooding. */
const CHART_FPS_MS = 100; // ~10 fps

/**
 * Drives the simulation forward using requestAnimationFrame.
 * Physics runs every frame; React state is only touched for the lightweight
 * state object. Charts redraw at ~10 fps via a renderTick counter.
 */
export function useSimLoop() {
  const rafId = useRef<number>(0);
  const lastChartUpdate = useRef<number>(0);

  useEffect(() => {
    let mounted = true;

    const tick = (wallTime: number) => {
      if (!mounted) return;

      // Read store state without subscribing — no React re-render triggered here
      const store = useSimStore.getState();
      const { running, speed, params, snapshots } = store;

      if (running) {
        // -- Physics: pure computation, touches no React state ------------------
        let s = store.state;
        let lastTOut = s.T_panel;
        for (let i = 0; i < speed; i++) {
          const { next, T_out_panel } = rk4Step(s, params);
          s = next;
          lastTOut = T_out_panel;
        }

        // Lightweight state update — only 4 numbers, minimal subscriber cost
        store.setState(() => s);

        // -- Chart throttle: push one snapshot + trigger Vega redraw at ~10 fps -
        if (wallTime - lastChartUpdate.current >= CHART_FPS_MS) {
          lastChartUpdate.current = wallTime;
          // SoA push — 5 scalar writes, zero object allocation
          snapshots.push(s.t, s.T_panel, s.T_tank, lastTOut, computeSolarG(s.t, params));
          store.bumpRenderTick();
        }
      }

      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      cancelAnimationFrame(rafId.current);
    };
  }, []);
}
