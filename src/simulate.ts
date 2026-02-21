import type { Params, State } from './types';
import { stepDerivatives } from './physics';

export function rk4Step(state: State, p: Params): { next: State; T_out_panel: number; Q_to_fluid: number } {
  const dt = p.dt;

  const k1 = stepDerivatives(state, p);

  const s2: State = {
    ...state,
    T_panel: state.T_panel + 0.5 * dt * k1.dT_panel,
    T_tank: state.T_tank + 0.5 * dt * k1.dT_tank,
  };
  const k2 = stepDerivatives(s2, p);

  const s3: State = {
    ...state,
    T_panel: state.T_panel + 0.5 * dt * k2.dT_panel,
    T_tank: state.T_tank + 0.5 * dt * k2.dT_tank,
  };
  const k3 = stepDerivatives(s3, p);

  const s4: State = {
    ...state,
    T_panel: state.T_panel + dt * k3.dT_panel,
    T_tank: state.T_tank + dt * k3.dT_tank,
  };
  const k4 = stepDerivatives(s4, p);

  const next: State = {
    T_panel: state.T_panel + (dt / 6) * (k1.dT_panel + 2 * k2.dT_panel + 2 * k3.dT_panel + k4.dT_panel),
    T_tank: state.T_tank + (dt / 6) * (k1.dT_tank + 2 * k2.dT_tank + 2 * k3.dT_tank + k4.dT_tank),
    t: state.t + dt,
    E_harvest: state.E_harvest + ((k1.Q_to_fluid + 2 * k2.Q_to_fluid + 2 * k3.Q_to_fluid + k4.Q_to_fluid) / 6) * dt,
  };

  // Use k4's outlet for plotting (end-of-step estimate). Could also average.
  return { next, T_out_panel: k4.T_out_panel, Q_to_fluid: k4.Q_to_fluid };
}
