import { useEffect, useRef } from 'react';
import { useSimStore } from '../store';
import { rk4Step } from '../simulate';

/**
 * Drives the simulation forward using requestAnimationFrame.
 * Each animation frame advances `speed` RK4 steps and pushes one snapshot.
 */
export function useSimLoop() {
  const rafId = useRef<number>(0);

  useEffect(() => {
    let mounted = true;

    const tick = () => {
      if (!mounted) return;

      const { running, speed, params, state, setState, pushSnapshot } =
        useSimStore.getState();

      if (running) {
        let s = state;
        let lastTOut = s.T_panel;
        for (let i = 0; i < speed; i++) {
          const { next, T_out_panel } = rk4Step(s, params);
          s = next;
          lastTOut = T_out_panel;
        }
        setState(() => s);
        pushSnapshot({
          t: s.t,
          T_panel: s.T_panel,
          T_tank: s.T_tank,
          T_out_panel: lastTOut,
          G: params.G,
        });
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
