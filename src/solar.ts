/**
 * solar.ts — Unified diurnal solar model.
 *
 * Produces both the irradiance G (W/m²) needed by the physics engine and
 * a sun-direction vector suitable for Three.js lighting, from a single set
 * of time / daylight-hour parameters.
 *
 * Sun-path geometry
 * -----------------
 * The sun traces a **tilted semicircular arc** from east (−X) to west (+X).
 * The arc plane is tilted toward the south (+Z in our Y-up convention) by
 * PEAK_ELEV radians, which corresponds roughly to a latitude of ~40 °N near
 * the summer solstice.
 *
 * Parametric angle `θ = π · dayFrac` sweeps [0, π] during daylight:
 *
 *   x = −cos θ                       east (−) -> west (+)
 *   y = sin θ · sin(PEAK_ELEV)      height above horizon
 *   z = sin θ · cos(PEAK_ELEV)      southward offset
 *
 * Irradiance
 * ----------
 * G(t) = G_peak · sin(π · dayFrac)  — half-sine bell curve,
 */

import type { Params } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PEAK_ELEV = 65 * (Math.PI / 180); //Peak solar elevation angle (radians).
const SIN_PEAK = Math.sin(PEAK_ELEV);
const COS_PEAK = Math.cos(PEAK_ELEV);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SolarInfo {
  /** Irradiance on a tilted surface (W/m²). */
  G: number;
  /** True when the current hour falls between sunrise and sunset. */
  isDaylight: boolean;
  /** Sine of the solar elevation angle (0 at horizon, max ≈ sin 62° at noon). */
  elevSin: number;
  /**
   * Solar azimuth (radians), measured from south (+Z):
   *   −π/2 = east, 0 = south, +π/2 = west.
   */
  azimuth: number;
  /** Unit sun-direction X component (east/west). */
  sunDirX: number;
  /** Unit sun-direction Y component (vertical). */
  sunDirY: number;
  /** Unit sun-direction Z component (south/north). */
  sunDirZ: number;
}

// Reusable night-time result
const NIGHT: SolarInfo = Object.freeze({
  G: 0,
  isDaylight: false,
  elevSin: 0,
  azimuth: 0,
  sunDirX: 0,
  sunDirY: -1,
  sunDirZ: 0,
});

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Compute solar irradiance **and** sun-direction for simulation time `t` (s).
 *
 * The returned unit direction vector points **from** the scene origin
 * **toward** the sun (i.e. suitable for `DirectionalLight.position`).
 */
export function computeSolar(t: number, p: Params): SolarInfo {
  const h = (p.t_start_hour + t / 3600) % 24;
  const h_rise = 12 - p.daylight_hours / 2;
  const h_set  = 12 + p.daylight_hours / 2;

  if (h <= h_rise || h >= h_set) return NIGHT;

  const dayFrac = (h - h_rise) / p.daylight_hours; // [0, 1]
  const angle   = Math.PI * dayFrac;                // [0, π]

  // Irradiance: half-sine bell
  const G = p.G_peak * Math.sin(angle);

  // Tilted-arc sun position (unit vector, Y-up, Z = south).
  const sinA = Math.sin(angle);
  const cosA = Math.cos(angle);

  const sunDirX = -cosA;              // east (−) -> west (+)
  const sunDirY = sinA * SIN_PEAK;   // height
  const sunDirZ = sinA * COS_PEAK;   // south offset

  const elevSin = sunDirY;                        // sin(elevation)
  const azimuth = Math.atan2(sunDirX, sunDirZ);   // from south (Z+)

  return { G, isDaylight: true, elevSin, azimuth, sunDirX, sunDirY, sunDirZ };
}

// ---------------------------------------------------------------------------
// Convenience wrapper for physics engine (irradiance only)
// ---------------------------------------------------------------------------

/** Returns solar irradiance in W/m² (shorthand for `computeSolar(t, p).G`). */
export function computeSolarG(t: number, p: Params): number {
  const h = (p.t_start_hour + t / 3600) % 24;
  const h_rise = 12 - p.daylight_hours / 2;
  const h_set  = 12 + p.daylight_hours / 2;
  if (h <= h_rise || h >= h_set) return 0;
  return p.G_peak * Math.sin(Math.PI * (h - h_rise) / p.daylight_hours);
}
