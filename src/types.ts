export type Params = {
  // Environment & solar
  T_env: number;            // °C
  G_peak: number;           // W/m² (peak solar irradiance at solar noon)
  alpha: number;            // absorptivity [0..1]

  // Solar time
  t_start_hour: number;     // hour of day at t=0 (e.g. 6 = 6 am)
  daylight_hours: number;   // total hours of daylight (symmetric around noon)

  // Panel geometry/physics
  A_p: number;              // m²
  U_loss_p: number;         // W/(m²·C)
  UA_pf: number;            // W/C (panel->fluid conductance)
  C_panel: number;          // J/C (panel lumped heat capacity)

  // Tank physics
  V_tank: number;           // m³
  UA_tank: number;          // W/C

  // Fluid & flow
  m_dot: number;            // kg/s
  rho: number;              // kg/m³
  c_w: number;              // J/(kg·C)

  // Pipe heat loss (22 mm OD copper, elastomeric-foam insulation)
  pipe_length_total: number; // m  (both legs: panel->tank + tank->panel)
  pipe_insulation_mm: number; // mm (insulation thickness; 25 mm = 1 inch standard)

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
