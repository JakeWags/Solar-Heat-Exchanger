import type { Params, State } from './types';

const EPS = 1e-9;

// -- Pipe heat-loss constants (fixed 22 mm OD copper, elastomeric-foam insulation) --
const PIPE_R_OUTER = 0.011;  // m   (22 mm OD copper tube -> radius 11 mm)
const K_INSULATION = 0.040;  // W/(m·K) elastomeric foam (Armaflex-class)
const H_PIPE_SURFACE = 10.0;   // W/(m²·K) natural convection on outer surface

export type Derivatives = {
  dT_panel: number;
  dT_tank: number;
  Q_to_fluid: number;    // W
  T_out_panel: number;   // °C
};

/**
 * Thermal resistance per unit length of an insulated copper pipe (K·m/W).
 *
 *   R_tot = R_insulation + R_outer_convection
 *
 *   R_ins = ln((r_pipe + t_ins) / r_pipe) / (2π · k_ins)
 *   R_conv = 1 / (2π · (r_pipe + t_ins) · h_outer)
 *
 * For a 22 mm pipe with 25 mm foam insulation at ΔT = 55 °C this gives
 * ≈ 5.2 K·m/W -> ≈ 10.6 W/m, consistent with Engineering Toolbox reference
 * values of 8–19 W/m across 22–76 mm pipe diameters.
 */
export function pipeResistancePerMeter(insulation_mm: number): number {
  const t_ins = insulation_mm / 1000;          // mm -> m
  const r_out = PIPE_R_OUTER + t_ins;
  const R_ins = Math.log(r_out / PIPE_R_OUTER) / (2 * Math.PI * K_INSULATION);
  const R_conv = 1 / (2 * Math.PI * r_out * H_PIPE_SURFACE);
  return R_ins + R_conv;
}

/**
 * Returns solar irradiance in W/m² for simulation time t (seconds).
 * Uses a half-sine bell curve centred on solar noon, zero outside daylight hours.
 *
 *   G(t) = G_peak · max(0, sin(π · (h - h_rise) / daylight_hours))
 *
 * where h = hour of day = (t_start_hour + t / 3600) % 24
 *       h_rise = 12 - daylight_hours / 2  (sunrise, noon fixed at 12:00)
 *
 * The modulo ensures the curve repeats every 24 h, enabling multi-day runs.
 */
export function computeSolarG(t: number, p: Params): number {
  const h = (p.t_start_hour + t / 3600) % 24;
  const h_rise = 12 - p.daylight_hours / 2;
  const h_set = 12 + p.daylight_hours / 2;
  if (h <= h_rise || h >= h_set) return 0;
  return p.G_peak * Math.sin(Math.PI * (h - h_rise) / p.daylight_hours);
}


export function stepDerivatives(state: State, p: Params): Derivatives {
  const { T_panel, T_tank } = state;
  const {
    alpha, A_p, U_loss_p, UA_pf,
    m_dot, c_w, T_env, V_tank, rho, UA_tank,
    pipe_length_total, pipe_insulation_mm,
  } = p;

  // Solar (diurnal)
  const G = computeSolarG(state.t, p);
  const Q_solar = alpha * A_p * G; // W

  // Panel loss to ambient
  const Q_loss_p = U_loss_p * A_p * (T_panel - T_env); // W

  // Capacity rate
  const C_dot = m_dot * c_w; // W/K

  // -- Pipe UA per leg (half the round-trip length) -------------------------
  const Rm = pipeResistancePerMeter(pipe_insulation_mm); // K·m/W
  const L_leg = pipe_length_total * 0.5;                 // m
  const UA_leg = (L_leg > 0 && Rm > 0) ? (L_leg / Rm) : 0; // W/K


  // -- Tank -> Panel leg: attenuate toward ambient only when there is flow --
  let T_in_panel: number;
  if (m_dot > 0 && UA_leg > 0) {
    const NTU_leg = UA_leg / Math.max(C_dot, EPS);
    const atten = Math.exp(-NTU_leg);                // fraction preserved
    T_in_panel = T_env + (T_tank - T_env) * atten;     // cool toward T_env
  } else {
    T_in_panel = T_tank; // no advection -> no pipe cooling
  }

  // -- Panel ε–NTU heat pickup ----------------------------------------------
  const epsilon_pf = (m_dot > 0 && UA_pf > 0)
    ? 1 - Math.exp(-UA_pf / Math.max(C_dot, EPS))
    : 0.0;

  const T_out_panel = T_in_panel + epsilon_pf * (T_panel - T_in_panel);
  const Q_to_fluid = m_dot * c_w * (T_out_panel - T_in_panel); // W (panel -> fluid)

  // -- Panel -> Tank leg: attenuate toward ambient only when there is flow --
  let T_in_tank: number;
  if (m_dot > 0 && UA_leg > 0) {
    const NTU_leg = UA_leg / Math.max(C_dot, EPS);
    const atten = Math.exp(-NTU_leg);
    T_in_tank = T_env + (T_out_panel - T_env) * atten;
  } else {
    T_in_tank = T_out_panel;
  }

  // -- Tank energy balance (well mixed) -------------------------------------
  const C_tank = rho * c_w * V_tank; // J/K

  const dT_panel = (Q_solar - Q_loss_p - Q_to_fluid) / Math.max(p.C_panel, EPS);

  const dT_tank = (
    m_dot * c_w * (T_in_tank - state.T_tank) - UA_tank * (state.T_tank - T_env)
  ) / Math.max(C_tank, EPS);

  return { dT_panel, dT_tank, Q_to_fluid, T_out_panel };
}
