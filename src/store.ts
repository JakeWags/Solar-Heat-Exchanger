import { create } from 'zustand';
import type { Params, State } from './types';
import { SnapshotStore } from './snapshotStore';

export type SimStore = {
  params: Params;
  state: State;
  running: boolean;
  speed: number;
  /**
   * SoA snapshot store backed by Float32Arrays.
   * Lives outside Zustand reactive state — mutations never trigger re-renders.
   * Pushed once per chart tick (~10 fps);
   */
  snapshots: SnapshotStore;
  /** Incremented at ~10 fps to signal charts to redraw. */
  renderTick: number;
  bumpRenderTick: () => void;
  setParams: (fn: (p: Params) => Params) => void;
  setState: (fn: (s: State) => State) => void;
  toggle: () => void;
  reset: () => void;
  setSpeed: (v: number) => void;
};

const DEG_C = 20;

export const useSimStore = create<SimStore>((set) => ({
  params: {
    // Environment
    T_env: DEG_C,            // °C
    G_peak: 1000,            // W/m² (peak irradiance at solar noon)
    alpha: 0.9,

    // Solar time
    t_start_hour: 6.0,       // sim starts at 6:00 am
    daylight_hours: 12.0,    // sunrise 06:00, sunset 18:00

    // Panel
    A_p: 2.0,                // m²
    U_loss_p: 5.0,           // W/(m²·C)
    UA_pf: 120.0,            // W/C
    C_panel: 20_000.0,       // J/C (approx metal mass ~5 kg * 380 J/kgC)

    // Tank
    V_tank: 0.2,             // m³ (200 L)
    UA_tank: 8.0,            // W/C

    // Fluid
    m_dot: 0.05,             // kg/s (~3 L/min)
    rho: 997.0,              // kg/m³
    c_w: 4181.0,             // J/(kg·C)

    // Pipe heat loss
    pipe_length_total: 10.0, // m  (5 m panel->tank + 5 m tank->panel)
    pipe_insulation_mm: 25,  // mm (25 mm = 1 inch, standard elastomeric foam)

    // Integrator
    dt: 5.0,                // s
  },
  state: {
    T_panel: 20,             // °C initial
    T_tank: 20,              // °C initial
    t: 0,
    E_harvest: 0,
  },
  running: false,
  speed: 64,
  // SoA store — mutations do NOT trigger Zustand re-renders
  snapshots: new SnapshotStore(),
  renderTick: 0,
  bumpRenderTick: () => set((st) => ({ renderTick: st.renderTick + 1 })),
  setParams: (fn) => set((st) => ({ params: fn(st.params) })),
  setState: (fn) => set((st) => ({ state: fn(st.state) })),
  toggle: () => set((st) => ({ running: !st.running })),
  setSpeed: (v) => set({ speed: v }),
  reset: () => {
    useSimStore.getState().snapshots.clear();
    set({ state: { T_panel: 20, T_tank: 20, t: 0, E_harvest: 0 }, renderTick: 0 });
  },
}));
