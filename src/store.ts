import { create } from 'zustand';
import type { Params, State, Snapshot } from './types';

export type SimStore = {
  params: Params;
  state: State;
  running: boolean;
  speed: number; // sim steps per render tick multiplier
  history: Snapshot[];
  setParams: (fn: (p: Params) => Params) => void;
  setState: (fn: (s: State) => State) => void;
  toggle: () => void;
  reset: () => void;
  pushSnapshot: (snap: Snapshot) => void;
  setSpeed: (v: number) => void;
};

const DEG_C = 20;

export const useSimStore = create<SimStore>((set) => ({
  params: {
    // Environment
    T_env: DEG_C,            // °C
    G: 800,                  // W/m²
    alpha: 0.9,

    // Panel
    A_p: 2.0,                // m²
    U_loss_p: 5.0,           // W/(m²·K)
    UA_pf: 120.0,            // W/K
    C_panel: 20_000.0,       // J/K (approx metal mass ~5 kg * 380 J/kgK)

    // Tank
    V_tank: 0.2,             // m³ (200 L)
    UA_tank: 8.0,            // W/K

    // Fluid
    m_dot: 0.05,             // kg/s (~3 L/min)
    rho: 997.0,              // kg/m³
    c_w: 4181.0,             // J/(kg·K)

    // Integrator
    dt: 0.25,                // s
  },
  state: {
    T_panel: 20,             // °C initial
    T_tank: 20,              // °C initial
    t: 0,
    E_harvest: 0,
  },
  running: true,
  speed: 8,
  history: [],
  setParams: (fn) => set((st) => ({ params: fn(st.params) })),
  setState: (fn) => set((st) => ({ state: fn(st.state) })),
  toggle: () => set((st) => ({ running: !st.running })),
  setSpeed: (v) => set({ speed: v }),
  reset: () => set({
    state: { T_panel: 20, T_tank: 20, t: 0, E_harvest: 0 },
    history: [],
  }),
  pushSnapshot: (snap) => set((st) => ({ history: [...st.history, snap].slice(-2000) })),
}));
