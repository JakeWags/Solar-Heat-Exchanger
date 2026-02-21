import type { Params, State } from './types';

const EPS = 1e-9;

export type Derivatives = {
  dT_panel: number;
  dT_tank: number;
  Q_to_fluid: number;    // W
  T_out_panel: number;   // °C
};

/**
 * Returns solar irradiance in W/m² for simulation time t (seconds).
 * Uses a half-sine bell curve centred on solar noon, zero outside daylight hours.
 *
 *   G(t) = G_peak · max(0, sin(π · (h - h_rise) / daylight_hours))
 *
 * where h         = hour of day  = (t_start_hour + t / 3600) % 24
 *       h_rise    = 12 - daylight_hours / 2  (sunrise, noon fixed at 12:00)
 *
 * The modulo ensures the curve repeats every 24 h, enabling multi-day runs.
 */
export function computeSolarG(t: number, p: Params): number {
  const h = (p.t_start_hour + t / 3600) % 24;
  const h_rise = 12 - p.daylight_hours / 2;
  const h_set  = 12 + p.daylight_hours / 2;
  if (h <= h_rise || h >= h_set) return 0;
  return p.G_peak * Math.sin(Math.PI * (h - h_rise) / p.daylight_hours);
}

export function stepDerivatives(state: State, p: Params): Derivatives {
  const { T_panel, T_tank } = state;
  const { alpha, A_p, U_loss_p, UA_pf, m_dot, c_w, T_env, V_tank, rho, UA_tank } = p;

  // Solar absorbed by panel (irradiance varies with time of day)
  const G = computeSolarG(state.t, p);
  const Q_solar = alpha * A_p * G; // W

  // Panel loss to ambient
  const Q_loss_p = U_loss_p * A_p * (T_panel - T_env); // W

  // ε–NTU style effectiveness for this time step
  const C_dot = Math.max(m_dot * c_w, EPS); // W/C
  const epsilon = m_dot > 0 ? 1 - Math.exp(-UA_pf / C_dot) : 0; // [0..1]
  const T_in_panel = T_tank; // loop returns tank temp to panel inlet (lumped)
  const T_out_panel = T_in_panel + epsilon * (T_panel - T_in_panel);

  const Q_to_fluid = m_dot * c_w * (T_out_panel - T_in_panel); // W

  // Tank energy balance (well mixed)
  const C_tank = rho * c_w * V_tank; // J/C

  const dT_panel = (Q_solar - Q_loss_p - Q_to_fluid) / Math.max(p.C_panel, EPS);

  const dT_tank = (
    m_dot * c_w * (T_out_panel - state.T_tank) - UA_tank * (state.T_tank - T_env)
  ) / Math.max(C_tank, EPS);

  return { dT_panel, dT_tank, Q_to_fluid, T_out_panel };
}
