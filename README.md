# Solar Thermal Panel Simulator

A real-time, browser-based simulation of a **flat-plate solar thermal collector** coupled to a **well-mixed storage tank** via a forced-circulation loop. The physics is solved with a fourth-order Runge–Kutta (RK4) integrator; the UI is built with React, Mantine, and Vega-Lite (via vega-embed).

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Physical System Overview](#physical-system-overview)
3. [Governing Equations](#governing-equations)
4. [Heat-Exchanger Effectiveness (ε–NTU)](#heat-exchanger-effectiveness-ε-ntu)
5. [Numerical Method — RK4](#numerical-method--rk4)
6. [Parameter Reference](#parameter-reference)
7. [Project Structure](#project-structure)
8. [License](#license)

---

## Quick Start

```bash
npm install
npm run dev        # opens on http://localhost:5173
```

The simulation starts automatically. Use the sidebar controls to adjust parameters in real time; charts and readouts update every animation frame.

---

## Physical System Overview

The model tracks **two lumped thermal capacitances** connected by a fluid loop:

```
                    Solar irradiance G (W/m²)
                          │
                          ▼
               ┌─────────────────────┐
               │   Absorber Panel    │
               │   T_panel, C_panel  │──── Q_loss → ambient (T_env)
               └────────┬───────────┘
                    fluid out ↓  T_out
                         │
                  ┌──────▼──────┐
                  │  Storage    │
                  │  Tank       │──── Q_tank_loss → ambient (T_env)
                  │  T_tank     │
                  └──────┬──────┘
                    fluid in ↑  T_in = T_tank
                         │
                    (pump, ṁ) ◄──── loops back to panel inlet
```

### Key simplifications (the "lumped-capacitance" approach)

| Assumption | What it means |
|---|---|
| **Lumped panel** | The entire absorber plate is at a single, uniform temperature *T*\_panel at any instant. No spatial temperature gradient across the plate. This is valid when the Biot number Bi = *hL*/*k* ≪ 1 (thin, high-conductivity metal). |
| **Lumped (well-mixed) tank** | The tank water is perfectly stirred, so a single temperature *T*\_tank describes the whole volume. In practice, tanks stratify; this model captures the average behavior. |
| **Steady-state fluid pass** | Fluid transit time through the collector is much shorter than the thermal time constants of the panel and tank, so we treat the fluid pass as quasi-static each time step. |
| **No phase change** | The working fluid (water) remains liquid throughout. |
| **No piping losses** | Heat loss in connecting pipes is neglected (equivalently, it is lumped into *UA*\_tank). |

---

## Governing Equations

### 1. Panel energy balance

The absorber plate accumulates energy from solar radiation, loses heat to the environment, and transfers heat to the circulating fluid:

$$
C_\text{panel} \, \frac{dT_\text{panel}}{dt}
  = \underbrace{\alpha \, A_p \, G}_{\text{solar absorbed}}
  \;-\; \underbrace{U_{\text{loss},p} \, A_p \,(T_\text{panel} - T_\text{env})}_{\text{convective + radiative loss}}
  \;-\; \underbrace{Q_\text{to fluid}}_{\text{heat extracted by fluid}}
$$

where

| Symbol | Meaning |
|--------|---------|
| $C_\text{panel}$ | lumped heat capacity of the absorber (J/K) |
| $\alpha$ | short-wave absorptivity of the selective coating (0–1) |
| $A_p$ | collector aperture area (m²) |
| $G$ | global solar irradiance on the tilted surface (W/m²) |
| $U_{\text{loss},p}$ | overall heat-loss coefficient, panel → ambient (W/(m²·K)) |
| $T_\text{env}$ | ambient air temperature (°C) |

### 2. Fluid heat pickup

The fluid enters the panel at $T_\text{in} = T_\text{tank}$ (tank return) and exits at $T_\text{out}$. The heat transferred is:

$$
Q_\text{to fluid} = \dot{m} \, c_w \, (T_\text{out} - T_\text{in})
$$

The outlet temperature is found via the **effectiveness–NTU method** (described in the next section).

### 3. Tank energy balance

The storage tank receives energy from the hot fluid return and loses heat to the surroundings:

$$
C_\text{tank} \, \frac{dT_\text{tank}}{dt}
  = \dot{m} \, c_w \,(T_\text{out} - T_\text{tank})
  \;-\; UA_\text{tank}\,(T_\text{tank} - T_\text{env})
$$

where $C_\text{tank} = \rho \, c_w \, V_\text{tank}$ is the thermal mass of the water in the tank.

---

## Heat-Exchanger Effectiveness (ε–NTU)

Rather than solving the spatial temperature profile inside the collector tubes, we treat the panel–fluid interface as a single-stream heat exchanger. Only one fluid stream is present (the water), exchanging heat with a surface at $T_\text{panel}$.

### Why ε–NTU?

When fluid flows through a heat exchanger of known conductance $UA_\text{pf}$ (W/K), the maximum possible heat transfer is:

$$
Q_\text{max} = \dot{C} \,(T_\text{panel} - T_\text{in})
\qquad\text{where}\quad
\dot{C} = \dot{m}\,c_w
$$

The **effectiveness** $\varepsilon$ is the fraction of that maximum actually achieved:

$$
\varepsilon
  = 1 - \exp\!\Bigl(-\frac{UA_\text{pf}}{\dot{C}}\Bigr)
$$

This is the standard expression for a single-stream exchanger with a constant wall temperature (the lumped panel). The **Number of Transfer Units** is $\text{NTU} = UA_\text{pf}/\dot{C}$.

### Outlet temperature

$$
T_\text{out}
  = T_\text{in} + \varepsilon\,(T_\text{panel} - T_\text{in})
$$

So $Q_\text{to fluid} = \dot{C}\,\varepsilon\,(T_\text{panel} - T_\text{in})$.

**Physical intuition:**
- When $UA_\text{pf} \gg \dot{C}$ (very good contact or slow flow), $\varepsilon \to 1$ and the fluid exits at the panel temperature — perfect heat exchange.
- When $UA_\text{pf} \ll \dot{C}$ (poor contact or fast flow), $\varepsilon \to 0$ and the fluid passes through almost unheated.
- When $\dot{m} = 0$, $\varepsilon = 0$ and no fluid heat transfer occurs; the panel simply heats up and loses energy to the environment.

---

## Numerical Method — RK4

The two coupled ODEs form the state vector $\mathbf{y} = [T_\text{panel},\; T_\text{tank}]$. We advance them in time with the classical **fourth-order Runge–Kutta** scheme:

$$
\mathbf{y}_{n+1} = \mathbf{y}_n + \frac{\Delta t}{6}\bigl(\mathbf{k}_1 + 2\mathbf{k}_2 + 2\mathbf{k}_3 + \mathbf{k}_4\bigr)
$$

where each $\mathbf{k}_i$ is the derivative vector evaluated at a trial point:

| Stage | Evaluation point |
|-------|-----------------|
| $\mathbf{k}_1$ | $f(\mathbf{y}_n)$ |
| $\mathbf{k}_2$ | $f(\mathbf{y}_n + \tfrac{\Delta t}{2}\,\mathbf{k}_1)$ |
| $\mathbf{k}_3$ | $f(\mathbf{y}_n + \tfrac{\Delta t}{2}\,\mathbf{k}_2)$ |
| $\mathbf{k}_4$ | $f(\mathbf{y}_n + \Delta t\,\mathbf{k}_3)$ |

RK4 has **local truncation error** $\mathcal{O}(\Delta t^5)$ and **global error** $\mathcal{O}(\Delta t^4)$. With the default time step of 0.25 s and thermal time constants on the order of minutes, the integration is comfortably stable and accurate.

The cumulative harvested energy is also integrated with the same RK4 weights:

$$
E_{n+1} = E_n + \frac{\Delta t}{6}\bigl(Q_1 + 2Q_2 + 2Q_3 + Q_4\bigr)
$$

where $Q_i$ is the instantaneous $Q_\text{to fluid}$ at RK4 stage $i$.

---

## Parameter Reference

| Parameter | Symbol | Default | Units | Description |
|-----------|--------|---------|-------|-------------|
| Ambient temperature | $T_\text{env}$ | 20 | °C | Surrounding air temperature |
| Solar irradiance | $G$ | 800 | W/m² | Incident radiation on tilted panel |
| Absorptivity | $\alpha$ | 0.9 | — | Fraction of incident solar radiation absorbed |
| Panel area | $A_p$ | 2.0 | m² | Collector aperture area |
| Panel loss coeff | $U_{\text{loss},p}$ | 5.0 | W/(m²·K) | Combined convective + radiative loss |
| Panel–fluid conductance | $UA_\text{pf}$ | 120 | W/K | Thermal coupling between plate and fluid |
| Panel heat capacity | $C_\text{panel}$ | 20 000 | J/K | Lumped thermal mass (~5 kg copper × 380 J/kg·K) |
| Tank volume | $V_\text{tank}$ | 0.2 | m³ | 200 L storage tank |
| Tank loss coeff | $UA_\text{tank}$ | 8.0 | W/K | Heat loss from tank to ambient |
| Mass flow rate | $\dot{m}$ | 0.05 | kg/s | Circulating pump flow (~3 L/min) |
| Water density | $\rho$ | 997 | kg/m³ | At ~25 °C |
| Specific heat | $c_w$ | 4181 | J/(kg·K) | Water at ~25 °C |
| Time step | $\Delta t$ | 0.25 | s | RK4 integration step |

---

## Project Structure

```
src/
├── types.ts              # Params, State, Snapshot type definitions
├── physics.ts            # stepDerivatives(): the ODE right-hand side (energy balances + ε–NTU)
├── simulate.ts           # rk4Step(): classical RK4 integrator wrapping physics.ts
├── store.ts              # Zustand store (params, state, history, controls)
├── hooks/
│   └── useSimLoop.ts     # requestAnimationFrame loop driving the simulation
├── components/
│   ├── Controls.tsx      # Mantine sliders/inputs for all parameters
│   ├── StatusBar.tsx     # Live readouts (time, temperatures, energy)
│   ├── TempChart.tsx     # Vega-Lite line chart (T_panel, T_tank, T_out)
│   └── IrradianceChart.tsx # Vega-Lite area chart (solar irradiance)
├── App.tsx               # Main layout (AppShell with sidebar + charts)
└── main.tsx              # Entry point with MantineProvider
```

### Key design decisions

- **Zustand** for state management — lightweight, no boilerplate, easy to read from outside React (inside `requestAnimationFrame`).
- **RK4** over Euler — virtually no additional cost but dramatically better accuracy for the same step size.
- **ε–NTU** over finite-difference pipe model — gives an analytical outlet temperature with a single exponential, appropriate for the lumped-capacitance abstraction.
- **vega-embed** over a React charting library — Vega-Lite specs are declarative and portable; data is swapped in-place each frame for performance.

---

## License

MIT
