import type { Params, State } from './types';
import { stepDerivatives } from './physics';

// -- Module-level scratch objects — allocated once, mutated in-place each step.
// Eliminates ~3 short-lived heap objects per rk4Step call; at speed=64 that is
// 192 objects/frame saved from GC, removing measurable pauses on long runs.
const _s2: State = { T_panel: 0, T_tank: 0, t: 0, E_harvest: 0 };
const _s3: State = { T_panel: 0, T_tank: 0, t: 0, E_harvest: 0 };
const _s4: State = { T_panel: 0, T_tank: 0, t: 0, E_harvest: 0 };

export function rk4Step(state: State, p: Params): { next: State; T_out_panel: number; Q_to_fluid: number } {
  const dt = p.dt;
  const { T_panel, T_tank, t, E_harvest } = state;

  const k1 = stepDerivatives(state, p);

  _s2.T_panel   = T_panel + 0.5 * dt * k1.dT_panel;
  _s2.T_tank    = T_tank  + 0.5 * dt * k1.dT_tank;
  _s2.t         = t;
  _s2.E_harvest = E_harvest;
  const k2 = stepDerivatives(_s2, p);

  _s3.T_panel   = T_panel + 0.5 * dt * k2.dT_panel;
  _s3.T_tank    = T_tank  + 0.5 * dt * k2.dT_tank;
  _s3.t         = t;
  _s3.E_harvest = E_harvest;
  const k3 = stepDerivatives(_s3, p);

  _s4.T_panel   = T_panel + dt * k3.dT_panel;
  _s4.T_tank    = T_tank  + dt * k3.dT_tank;
  _s4.t         = t;
  _s4.E_harvest = E_harvest;
  const k4 = stepDerivatives(_s4, p);

  const next: State = {
    T_panel:   T_panel   + (dt / 6) * (k1.dT_panel    + 2 * k2.dT_panel    + 2 * k3.dT_panel    + k4.dT_panel),
    T_tank:    T_tank    + (dt / 6) * (k1.dT_tank     + 2 * k2.dT_tank     + 2 * k3.dT_tank     + k4.dT_tank),
    t:         t + dt,
    E_harvest: E_harvest + (dt / 6) * (k1.Q_to_fluid  + 2 * k2.Q_to_fluid  + 2 * k3.Q_to_fluid  + k4.Q_to_fluid),
  };

  return { next, T_out_panel: k4.T_out_panel, Q_to_fluid: k4.Q_to_fluid };
}
