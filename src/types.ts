export type Params = {
  // Environment & solar
  T_env: number;            // °C
  G: number;                // W/m² (solar irradiance)
  alpha: number;            // absorptivity [0..1]

  // Panel geometry/physics
  A_p: number;              // m²
  U_loss_p: number;         // W/(m²·K)
  UA_pf: number;            // W/K (panel→fluid conductance)
  C_panel: number;          // J/K (panel lumped heat capacity)

  // Tank physics
  V_tank: number;           // m³
  UA_tank: number;          // W/K

  // Fluid & flow
  m_dot: number;            // kg/s
  rho: number;              // kg/m³
  c_w: number;              // J/(kg·K)

  // Integrator
  dt: number;               // s (simulation step)
};

export type State = {
  T_panel: number; // °C
  T_tank: number;  // °C
  t: number;       // s simulated
  E_harvest: number; // J cumulative
};

export type Snapshot = {
  t: number;         // s
  T_panel: number;   // °C
  T_tank: number;    // °C
  T_out_panel: number; // °C
  G: number;         // W/m²
};
