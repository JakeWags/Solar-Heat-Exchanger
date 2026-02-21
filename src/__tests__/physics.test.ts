/**
 * Unit tests for src/physics.ts
 *
 * Each describe block targets one self-contained formula or physical behaviour.
 * Expected values are computed independently from the implementation so that
 * tests detect regressions, not just circular self-agreement.
 */

import { describe, it, expect } from 'vitest';
import {
  pipeResistancePerMeter,
  computeSolarG,
  stepDerivatives,
} from '../physics';
import type { Params, State } from '../types';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

/** Minimal valid Params. Override individual fields per test. */
function makeParams(overrides: Partial<Params> = {}): Params {
  return {
    // Environment
    T_env: 20,
    G_peak: 1000,
    alpha: 0.9,
    // Solar time (default: sim starts at midnight, 12 h day → G=0 before 6 am)
    t_start_hour: 0,
    daylight_hours: 12,
    // Panel
    A_p: 2.0,
    U_loss_p: 5.0,
    UA_pf: 120.0,
    C_panel: 20_000,
    // Tank
    V_tank: 0.2,
    UA_tank: 8.0,
    // Fluid
    m_dot: 0.05,
    rho: 997,
    c_w: 4181,
    // Pipe
    pipe_length_total: 0,      // zero by default → no pipe loss
    pipe_insulation_mm: 25,
    // Integrator
    dt: 0.25,
    ...overrides,
  };
}

/** State whose time gives G = 0 (h = 0, before sunrise at h_rise = 6). */
function nightState(overrides: Partial<State> = {}): State {
  return { T_panel: 50, T_tank: 40, t: 0, E_harvest: 0, ...overrides };
}

// ---------------------------------------------------------------------------
// 1. pipeResistancePerMeter — cylindrical-shell thermal resistance
// ---------------------------------------------------------------------------

describe('pipeResistancePerMeter', () => {
  // Physical constants used in the implementation (must match physics.ts)
  const R = 0.011;   // m  (22 mm OD copper, radius 11 mm)
  const k = 0.040;   // W/(m·K) elastomeric foam
  const h = 10.0;    // W/(m²·K) outer natural convection

  function expectedR(ins_mm: number): number {
    const t = ins_mm / 1000;
    const r_out = R + t;
    return (
      Math.log(r_out / R) / (2 * Math.PI * k) +
      1 / (2 * Math.PI * r_out * h)
    );
  }

  it('matches the cylindrical-shell formula for 0 mm insulation', () => {
    // With zero insulation the log term vanishes; only outer convection remains
    const expected = 1 / (2 * Math.PI * R * h); // ≈ 1.447 K·m/W
    expect(pipeResistancePerMeter(0)).toBeCloseTo(expected, 6);
  });

  it('matches the cylindrical-shell formula for 25 mm insulation', () => {
    // R_m ≈ 5.157 K·m/W  →  heat-loss ≈ 10.66 W/m at ΔT = 55 °C
    expect(pipeResistancePerMeter(25)).toBeCloseTo(expectedR(25), 6);
  });

  it('matches the cylindrical-shell formula for 50 mm insulation', () => {
    expect(pipeResistancePerMeter(50)).toBeCloseTo(expectedR(50), 6);
  });

  it('at 25 mm insulation: heat-loss ≈ 10.66 W/m at ΔT = 55 °C (Engineering Toolbox range 8–19 W/m)', () => {
    const heatLossPerMetre = 55 / pipeResistancePerMeter(25);
    expect(heatLossPerMetre).toBeGreaterThan(8);
    expect(heatLossPerMetre).toBeLessThan(19);
    expect(heatLossPerMetre).toBeCloseTo(10.66, 1);
  });

  it('is strictly monotonically increasing with insulation thickness', () => {
    // More insulation = higher total resistance = lower heat loss per degree
    expect(pipeResistancePerMeter(10)).toBeLessThan(pipeResistancePerMeter(25));
    expect(pipeResistancePerMeter(25)).toBeLessThan(pipeResistancePerMeter(50));
    expect(pipeResistancePerMeter(50)).toBeLessThan(pipeResistancePerMeter(100));
  });

  it('is always positive', () => {
    for (const mm of [0, 5, 25, 50, 100]) {
      expect(pipeResistancePerMeter(mm)).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. computeSolarG — half-sine diurnal irradiance with multi-day wrap
// ---------------------------------------------------------------------------

describe('computeSolarG', () => {
  // Base: t_start_hour=6 so sunrise falls at t=0, noon at t=21600 s
  const solar = (overrides: Partial<Params> = {}) =>
    makeParams({ t_start_hour: 6, daylight_hours: 12, G_peak: 1000, ...overrides });

  it('returns 0 at exactly sunrise (h = h_rise)', () => {
    // h(0) = 6 = h_rise → sin(0) = 0
    expect(computeSolarG(0, solar())).toBeCloseTo(0, 10);
  });

  it('returns 0 strictly before sunrise', () => {
    // t_start_hour=4 → h(0)=4 < h_rise(6)
    expect(computeSolarG(0, solar({ t_start_hour: 4 }))).toBe(0);
  });

  it('returns G_peak at solar noon (h = 12)', () => {
    const t_noon = (12 - 6) * 3600; // 21600 s after start
    expect(computeSolarG(t_noon, solar())).toBeCloseTo(1000, 6);
  });

  it('returns G_peak · sin(π/4) at quarter-daylight', () => {
    // h = h_rise + daylight_hours/4 = 6 + 3 = 9
    const t_quarter = 3 * 3600; // 10800 s
    expect(computeSolarG(t_quarter, solar())).toBeCloseTo(1000 / Math.SQRT2, 4);
  });

  it('returns 0 at exactly sunset (h = h_set)', () => {
    // h(43200) = 6 + 12 = 18 = h_set → condition h >= h_set is true
    const t_sunset = 12 * 3600;
    expect(computeSolarG(t_sunset, solar())).toBe(0);
  });

  it('returns 0 after sunset', () => {
    const t_after = 12 * 3600 + 1;
    expect(computeSolarG(t_after, solar())).toBe(0);
  });

  it('repeats correctly on day 2 (multi-day modulo)', () => {
    const t_noon_day1 = (12 - 6) * 3600;
    const t_noon_day2 = 86400 + t_noon_day1;
    expect(computeSolarG(t_noon_day2, solar())).toBeCloseTo(
      computeSolarG(t_noon_day1, solar()),
      6
    );
  });

  it('repeats correctly on day 3 (multi-day modulo)', () => {
    const t_noon_day1 = (12 - 6) * 3600;
    const t_noon_day3 = 2 * 86400 + t_noon_day1;
    expect(computeSolarG(t_noon_day3, solar())).toBeCloseTo(
      computeSolarG(t_noon_day1, solar()),
      6
    );
  });

  it('is symmetric around solar noon', () => {
    const t_noon = (12 - 6) * 3600;
    const delta = 2 * 3600; // 2 h either side of noon
    const G_before = computeSolarG(t_noon - delta, solar());
    const G_after  = computeSolarG(t_noon + delta, solar());
    expect(G_before).toBeCloseTo(G_after, 8);
  });

  it('is non-negative at all times', () => {
    const p = solar();
    for (let t = 0; t <= 86400; t += 900) {
      expect(computeSolarG(t, p)).toBeGreaterThanOrEqual(0);
    }
  });

  it('honours different daylight_hours settings', () => {
    // 8-hour day: noon is still 12:00, h_rise=8, h_set=16
    const p8 = solar({ t_start_hour: 8, daylight_hours: 8, G_peak: 800 });
    const t_noon8 = (12 - 8) * 3600; // 4 h after start
    expect(computeSolarG(t_noon8, p8)).toBeCloseTo(800, 6);
    // Before sunrise: t=0, h=8=h_rise → G=0
    expect(computeSolarG(0, p8)).toBeCloseTo(0, 10);
  });
});

// ---------------------------------------------------------------------------
// 3. ε–NTU panel heat pickup
// ---------------------------------------------------------------------------
// Tested through stepDerivatives with pipe_length_total=0 (no pipe loss) and
// t=0 with t_start_hour=0, daylight_hours=12 (h=0 < h_rise=6 → G=0).
// With these conditions T_in_panel = T_tank and the only active formula is:
//   ε = 1 – exp(–UA_pf / C_dot)
//   T_out_panel = T_in + ε·(T_panel – T_in)

describe('ε–NTU panel heat pickup', () => {
  const T_panel = 70;
  const T_tank  = 30;

  const p = makeParams({
    T_panel: undefined as never,   // unused — comes from State
    T_env: 20,
    m_dot: 0.05,
    c_w: 4181,
    UA_pf: 120,
    pipe_length_total: 0,  // isolates ε–NTU from pipe attenuation
    t_start_hour: 0,       // h(t=0)=0 < h_rise=6 → G=0
    daylight_hours: 12,
  });

  const state: State = nightState({ T_panel, T_tank });

  it('computes T_out_panel correctly via ε = 1–exp(–NTU)', () => {
    const C_dot = p.m_dot * p.c_w;
    const eps   = 1 - Math.exp(-p.UA_pf / C_dot);
    const T_out_expected = T_tank + eps * (T_panel - T_tank);

    const { T_out_panel } = stepDerivatives(state, p);
    expect(T_out_panel).toBeCloseTo(T_out_expected, 8);
  });

  it('Q_to_fluid equals ṁ·cw·(T_out – T_in)', () => {
    const { T_out_panel, Q_to_fluid } = stepDerivatives(state, p);
    const Q_expected = p.m_dot * p.c_w * (T_out_panel - T_tank);
    expect(Q_to_fluid).toBeCloseTo(Q_expected, 6);
  });

  it('T_out_panel is strictly between T_tank and T_panel for 0 < ε < 1', () => {
    const { T_out_panel } = stepDerivatives(state, p);
    expect(T_out_panel).toBeGreaterThan(T_tank);
    expect(T_out_panel).toBeLessThan(T_panel);
  });

  it('approaches T_panel when UA_pf is very large (ε → 1)', () => {
    const { T_out_panel } = stepDerivatives(state, makeParams({ UA_pf: 1e9, pipe_length_total: 0 }));
    expect(T_out_panel).toBeCloseTo(T_panel, 4);
  });

  it('stays at T_tank when UA_pf = 0 (no panel–fluid coupling)', () => {
    const { T_out_panel, Q_to_fluid } = stepDerivatives(
      state,
      makeParams({ UA_pf: 0, pipe_length_total: 0 }),
    );
    expect(T_out_panel).toBeCloseTo(T_tank, 10);
    expect(Q_to_fluid).toBeCloseTo(0, 10);
  });

  it('Q_to_fluid = 0 when T_panel = T_tank (no thermal gradient)', () => {
    const iso = nightState({ T_panel: T_tank, T_tank });
    const { Q_to_fluid } = stepDerivatives(iso, makeParams({ pipe_length_total: 0 }));
    expect(Q_to_fluid).toBeCloseTo(0, 8);
  });

  it('Q_to_fluid is always ≥ 0 when T_panel ≥ T_tank', () => {
    for (const UA_pf of [20, 120, 500]) {
      const { Q_to_fluid } = stepDerivatives(state, makeParams({ UA_pf, pipe_length_total: 0 }));
      expect(Q_to_fluid).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Plug-flow pipe attenuation  T_out = T_env + (T_in – T_env)·exp(–UA/C_dot)
// ---------------------------------------------------------------------------
// Isolate the pipe formula by setting UA_pf = 0 (no panel ε–NTU pickup) so
// T_out_panel = T_in_panel, making it a direct read-back of the pipe result.

describe('plug-flow pipe attenuation', () => {
  it('T_in_panel equals T_tank when pipe_length_total = 0', () => {
    const p = makeParams({ pipe_length_total: 0, UA_pf: 0 });
    const s = nightState({ T_tank: 60 });
    const { T_out_panel } = stepDerivatives(s, p);
    expect(T_out_panel).toBeCloseTo(60, 10);
  });

  it('attenuates fluid temperature toward T_env along the tank→panel leg', () => {
    const T_tank = 60, T_env = 20;
    // Use zero insulation to maximise the effect (lowest R_m = convection only)
    const p = makeParams({
      T_env,
      m_dot: 0.05,
      c_w: 4181,
      UA_pf: 0,                // no panel pickup → T_out_panel = T_in_panel
      pipe_length_total: 10,   // L_leg = 5 m
      pipe_insulation_mm: 0,   // maximum heat loss (convection-only insulation)
    });
    const s = nightState({ T_panel: T_tank, T_tank });

    const Rm    = pipeResistancePerMeter(0);
    const UA_leg = (10 / 2) / Rm;
    const C_dot  = 0.05 * 4181;
    const T_in_expected = T_env + (T_tank - T_env) * Math.exp(-UA_leg / C_dot);

    const { T_out_panel } = stepDerivatives(s, p);
    expect(T_out_panel).toBeCloseTo(T_in_expected, 8);
  });

  it('T_in_panel approaches T_env for an extremely long uninsulated pipe', () => {
    const p = makeParams({
      T_env: 20, m_dot: 0.05, c_w: 4181,
      UA_pf: 0,
      pipe_length_total: 1e6,   // extremely long
      pipe_insulation_mm: 0,    // no insulation
    });
    const { T_out_panel } = stepDerivatives(nightState({ T_panel: 80, T_tank: 80 }), p);
    expect(T_out_panel).toBeCloseTo(20, 3); // approaches T_env
  });

  it('T_in_panel ≈ T_tank for a very well-insulated short pipe', () => {
    const T_tank = 60;
    const p = makeParams({
      T_env: 20, m_dot: 0.05, c_w: 4181,
      UA_pf: 0,
      pipe_length_total: 2,     // short
      pipe_insulation_mm: 200,  // very thick foam
    });
    const { T_out_panel } = stepDerivatives(nightState({ T_panel: T_tank, T_tank }), p);
    // Should be very close to T_tank (minimal heat loss)
    expect(Math.abs(T_out_panel - T_tank)).toBeLessThan(0.05);
  });

  it('no pipe cooling when flow stops (m_dot = 0)', () => {
    // The code falls back to T_in_panel = T_tank when m_dot = 0
    const p = makeParams({
      T_env: 20, m_dot: 0,
      UA_pf: 0,
      pipe_length_total: 100,
      pipe_insulation_mm: 0,
    });
    const { T_out_panel } = stepDerivatives(nightState({ T_panel: 60, T_tank: 60 }), p);
    expect(T_out_panel).toBeCloseTo(60, 10);
  });
});

// ---------------------------------------------------------------------------
// 5. Panel energy balance  dT_panel = (Q_solar – Q_loss – Q_to_fluid) / C_panel
// ---------------------------------------------------------------------------

describe('panel energy balance (dT_panel)', () => {
  it('dT_panel = 0 when panel is at ambient with no solar and no flow', () => {
    const p = makeParams({ T_env: 20, m_dot: 0 });
    // G=0 (h=0 < h_rise=6), T_panel=T_env → Q_solar=Q_loss=Q_fluid=0
    const { dT_panel } = stepDerivatives(nightState({ T_panel: 20, T_tank: 20 }), p);
    expect(dT_panel).toBeCloseTo(0, 10);
  });

  it('dT_panel < 0 (panel cools) when T_panel > T_env with no solar and no flow', () => {
    const p = makeParams({ T_env: 20, m_dot: 0 });
    const { dT_panel } = stepDerivatives(nightState({ T_panel: 70, T_tank: 20 }), p);
    expect(dT_panel).toBeLessThan(0);
  });

  it('matches Q_solar – Q_loss – Q_to_fluid analytically (no pipe loss)', () => {
    // G = 0 (before sunrise), no pipe loss
    const T_panel = 70, T_tank = 30;
    const p = makeParams({
      T_env: 20, U_loss_p: 5, A_p: 2, m_dot: 0.05, c_w: 4181,
      UA_pf: 120, C_panel: 20_000, pipe_length_total: 0,
    });
    const s = nightState({ T_panel, T_tank });
    const d = stepDerivatives(s, p);

    const Q_solar  = 0; // G=0
    const Q_loss   = p.U_loss_p * p.A_p * (T_panel - p.T_env);
    const dT_expected = (Q_solar - Q_loss - d.Q_to_fluid) / p.C_panel;

    expect(d.dT_panel).toBeCloseTo(dT_expected, 8);
  });

  it('panel heats up when solar power exceeds all losses', () => {
    // Solar noon with maximum irradiance, cool panel
    const p = makeParams({
      t_start_hour: 6,
      daylight_hours: 12,
      G_peak: 1000,
      alpha: 0.9,
      T_env: 20,
      m_dot: 0,          // no fluid → all solar goes into panel
      pipe_length_total: 0,
    });
    const t_noon = (12 - 6) * 3600;
    const { dT_panel } = stepDerivatives({ T_panel: 21, T_tank: 21, t: t_noon, E_harvest: 0 }, p);
    expect(dT_panel).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Tank energy balance  dT_tank = (ṁ·cw·(T_in_tank – T_tank) – UA_tank·ΔT) / C_tank
// ---------------------------------------------------------------------------

describe('tank energy balance (dT_tank)', () => {
  it('tank cools at the correct rate with no flow (pure UA_tank loss)', () => {
    const T_tank = 60, T_env = 20;
    const p = makeParams({ T_env, m_dot: 0, UA_tank: 8, V_tank: 0.2, rho: 997, c_w: 4181 });
    const C_tank = p.rho * p.c_w * p.V_tank; // 834 413 J/K
    const dT_expected = -(p.UA_tank * (T_tank - T_env)) / C_tank; // ≈ –3.84e-4 °C/s

    const { dT_tank } = stepDerivatives(nightState({ T_tank }), p);
    expect(dT_tank).toBeCloseTo(dT_expected, 10);
  });

  it('dT_tank = 0 when tank is at ambient with no flow', () => {
    const p = makeParams({ T_env: 30, m_dot: 0 });
    const { dT_tank } = stepDerivatives(nightState({ T_panel: 30, T_tank: 30 }), p);
    expect(dT_tank).toBeCloseTo(0, 10);
  });

  it('matches the full balance formula analytically (no pipe loss)', () => {
    const T_panel = 70, T_tank = 30;
    const p = makeParams({
      T_env: 20, m_dot: 0.05, c_w: 4181,
      UA_pf: 120, UA_tank: 8,
      V_tank: 0.2, rho: 997,
      pipe_length_total: 0,   // T_in_tank = T_out_panel
    });
    const s = nightState({ T_panel, T_tank });
    const d = stepDerivatives(s, p);

    const C_tank = p.rho * p.c_w * p.V_tank;
    // With pipe_length_total=0, T_in_tank = T_out_panel
    const dT_expected =
      (p.m_dot * p.c_w * (d.T_out_panel - T_tank) - p.UA_tank * (T_tank - p.T_env)) /
      C_tank;

    expect(d.dT_tank).toBeCloseTo(dT_expected, 8);
  });

  it('tank heats up when hot fluid arrives from the panel', () => {
    const p = makeParams({
      T_env: 20, m_dot: 0.05, c_w: 4181,
      UA_pf: 120, UA_tank: 1,
      pipe_length_total: 0,
    });
    const s = nightState({ T_panel: 80, T_tank: 21 });
    const { dT_tank } = stepDerivatives(s, p);
    expect(dT_tank).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Zero-flow boundary conditions
// ---------------------------------------------------------------------------

describe('zero flow boundary conditions', () => {
  const p_no_flow = makeParams({ m_dot: 0, pipe_length_total: 0 });

  it('Q_to_fluid = 0 when m_dot = 0', () => {
    const { Q_to_fluid } = stepDerivatives(nightState({ T_panel: 80, T_tank: 30 }), p_no_flow);
    expect(Q_to_fluid).toBeCloseTo(0, 10);
  });

  it('T_out_panel = T_tank when m_dot = 0 (no advection)', () => {
    const T_tank = 35;
    const { T_out_panel } = stepDerivatives(nightState({ T_panel: 80, T_tank }), p_no_flow);
    expect(T_out_panel).toBeCloseTo(T_tank, 10);
  });

  it('dT_tank is unaffected by panel temperature when m_dot = 0', () => {
    const T_tank = 50;
    const dTa = stepDerivatives(nightState({ T_panel: 80, T_tank }), p_no_flow).dT_tank;
    const dTb = stepDerivatives(nightState({ T_panel: 20, T_tank }), p_no_flow).dT_tank;
    // Only UA_tank * (T_tank – T_env) drives dT_tank; panel temp irrelevant
    expect(dTa).toBeCloseTo(dTb, 10);
  });
});

// ---------------------------------------------------------------------------
// 8. Energy accounting consistency (no pipe loss)
// ---------------------------------------------------------------------------

describe('energy accounting consistency (pipe_length_total = 0)', () => {
  it('dT_panel · C_panel + Q_to_fluid + Q_loss_panel = Q_solar (panel power balance)', () => {
    // With G=0 before sunrise, Q_solar=0 so: dT_panel·C + Q_fluid + Q_loss = 0
    const T_panel = 70, T_tank = 30;
    const p = makeParams({
      T_env: 20, U_loss_p: 5, A_p: 2, m_dot: 0.05, c_w: 4181,
      UA_pf: 120, C_panel: 20_000, pipe_length_total: 0,
    });
    const s = nightState({ T_panel, T_tank });
    const d = stepDerivatives(s, p);

    const Q_loss = p.U_loss_p * p.A_p * (T_panel - p.T_env);
    const residual = d.dT_panel * p.C_panel + d.Q_to_fluid + Q_loss; // should = Q_solar = 0
    expect(residual).toBeCloseTo(0, 6);
  });

  it('dT_tank · C_tank = Q_to_fluid – UA_tank · (T_tank – T_env) (tank power balance)', () => {
    const T_panel = 70, T_tank = 30;
    const p = makeParams({
      T_env: 20, m_dot: 0.05, c_w: 4181,
      UA_pf: 120, UA_tank: 8, V_tank: 0.2, rho: 997,
      pipe_length_total: 0,
    });
    const s = nightState({ T_panel, T_tank });
    const d = stepDerivatives(s, p);

    const C_tank = p.rho * p.c_w * p.V_tank;
    // With no pipe loss: Q delivered to tank = Q_to_fluid
    const Q_tank_in  = p.m_dot * p.c_w * (d.T_out_panel - T_tank); // = Q_to_fluid
    const Q_tank_out = p.UA_tank * (T_tank - p.T_env);
    const dT_tank_expected = (Q_tank_in - Q_tank_out) / C_tank;

    expect(d.dT_tank).toBeCloseTo(dT_tank_expected, 8);
  });
});
