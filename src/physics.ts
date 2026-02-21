import type { Params, State } from './types';

const EPS = 1e-9;

export type Derivatives = {
  dT_panel: number;
  dT_tank: number;
  Q_to_fluid: number;    // W
  T_out_panel: number;   // °C
};

export function stepDerivatives(state: State, p: Params): Derivatives {
  const { T_panel, T_tank } = state;
  const { G, alpha, A_p, U_loss_p, UA_pf, m_dot, c_w, T_env, V_tank, rho, UA_tank } = p;

  // Solar absorbed by panel
  const Q_solar = alpha * A_p * G; // W

  // Panel loss to ambient
  const Q_loss_p = U_loss_p * A_p * (T_panel - T_env); // W

  // ε–NTU style effectiveness for this time step
  const C_dot = Math.max(m_dot * c_w, EPS); // W/K
  const epsilon = m_dot > 0 ? 1 - Math.exp(-UA_pf / C_dot) : 0; // [0..1]
  const T_in_panel = T_tank; // loop returns tank temp to panel inlet (lumped)
  const T_out_panel = T_in_panel + epsilon * (T_panel - T_in_panel);

  const Q_to_fluid = m_dot * c_w * (T_out_panel - T_in_panel); // W

  // Tank energy balance (well mixed)
  const C_tank = rho * c_w * V_tank; // J/K

  const dT_panel = (Q_solar - Q_loss_p - Q_to_fluid) / Math.max(p.C_panel, EPS);

  const dT_tank = (
    m_dot * c_w * (T_out_panel - state.T_tank) - UA_tank * (state.T_tank - T_env)
  ) / Math.max(C_tank, EPS);

  return { dT_panel, dT_tank, Q_to_fluid, T_out_panel };
}
