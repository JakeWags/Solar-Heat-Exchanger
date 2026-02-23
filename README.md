# Solar Thermal Panel Simulator

A real-time, browser-based simulation of a **flat-plate solar thermal collector** coupled to a **well-mixed storage tank** via a forced-circulation loop. The physics is solved with a fourth-order Runge–Kutta (RK4) integrator the UI is built with React, Mantine, and Vega-Lite (via vega-embed).

---

## Table of Contents

- [Solar Thermal Panel Simulator](#solar-thermal-panel-simulator)
  - [Table of Contents](#table-of-contents)
  - [Quick Start](#quick-start)
  - [Physical System Overview](#physical-system-overview)
    - [Key simplifications (the "lumped-capacitance" approach)](#key-simplifications-the-lumped-capacitance-approach)
  - [Solar Irradiance Model](#solar-irradiance-model)
  - [Governing Equations](#governing-equations)
    - [1. Panel energy balance](#1-panel-energy-balance)
    - [2. Pipe heat losses](#2-pipe-heat-losses)
    - [3. Fluid heat pickup](#3-fluid-heat-pickup)
    - [4. Tank energy balance](#4-tank-energy-balance)
  - [Pipe Insulation — Cylindrical-Shell Resistance](#pipe-insulation--cylindrical-shell-resistance)
  - [Heat-Exchanger Effectiveness (ε–NTU) — Panel Heat Pickup](#heat-exchanger-effectiveness-εntu--panel-heat-pickup)
  - [Numerical Method — RK4](#numerical-method--rk4)
  - [Parameter Reference](#parameter-reference)
  - [Project Structure](#project-structure)
    - [Key design decisions](#key-design-decisions)
  - [Future Work](#future-work)
  - [AI Usage Disclosure](#ai-usage-disclosure)
  - [License](#license)

---

## Quick Start

```bash
npm install
npm run dev        # opens on http://localhost:5173
```

The simulation starts automatically. Use the sidebar controls to adjust parameters in real time charts and readouts update every animation frame.

---

## Physical System Overview

The model tracks **two lumped thermal capacitances** connected by a fluid loop:

```
  sun -> panel -> pump/pipes -> tank -\     
           \--------------------------/
```
### Key simplifications (the "lumped-capacitance" approach)

| Assumption | What it means |
|---|---|
| **Lumped panel** | The entire absorber plate is at a single, uniform temperature *T*\_panel at any instant. No spatial temperature gradient across the plate. This is valid when the Biot number Bi = *hL*/*k* ≪ 1 (thin, high-conductivity metal). |
| **Lumped (well-mixed) tank** | The tank water is perfectly stirred, so a single temperature *T*\_tank describes the whole volume. In practice, tanks stratify this model captures the average behavior. |
| **Steady-state fluid pass** | Fluid transit time through the collector is much shorter than the thermal time constants of the panel and tank, so we treat the fluid pass as quasi-static each time step. |
| **No phase change** | The working fluid (water) remains liquid throughout. |
| **Insulated pipe losses** | Heat loss from the two connecting pipe legs (panel->tank, tank->panel) is modelled via the cylindrical-shell resistance formula and an ε–NTU effectiveness per leg. Copper tube diameter is fixed at 22 mm OD; insulation thickness and total pipe length are user-adjustable. |

---

## Solar Irradiance Model

Rather than a fixed irradiance, $G$ is computed from the simulated time of day using a **half-sine bell curve** centred on solar noon:

$$
G(t) = G_\text{peak} \cdot \max\\Bigl(0,\\sin\\Bigl(\pi\,\frac{h(t) - h_\text{rise}}{h_\text{day}}\Bigr)\Bigr)
$$

where the hour of day $h(t)$ and derived quantities are:

$$
h(t) = h_\text{start} + \frac{t}{3600}
\qquad
h_\text{rise} = 12 - \frac{h_\text{day}}{2}
\qquad
h_\text{set} = 12 + \frac{h_\text{day}}{2}
$$

$G = 0$ outside $[h_\text{rise},\, h_\text{set}]$. Solar noon is always at 12:00. This gives a symmetric peak that qualitatively matches measured global horizontal irradiance on a clear day.

| Parameter | Symbol | Default | Meaning |
|-----------|--------|---------|--------|
| Peak irradiance | $G_\text{peak}$ | 1000 W/m² | Clear-sky AM1.5 |
| Start hour | $h_\text{start}$ | 6 | 6 am |
| Daylight hours | $h_\text{day}$ | 12 | 6 am – 6 pm |

You can drag the **Start Hour** slider to position the simulation at any time of day (e.g. start at 10:00 to see the panel ramp up quickly toward noon).

---

## Governing Equations

### 1. Panel energy balance

The absorber plate accumulates energy from solar radiation, loses heat to the environment, and transfers heat to the circulating fluid:

$$
C_\text{panel} \, \frac{dT_\text{panel}}{dt}
 = \underbrace{\alpha \, A_p \, G}_{\text{solar absorbed}}
  \-\ \underbrace{U_{\text{loss},p} \, A_p \,(T_\text{panel} - T_\text{env})}_{\text{convective + radiative loss}}
  \-\ \underbrace{Q_\text{to fluid}}_{\text{heat extracted by fluid}}
$$

where

| Symbol | Meaning |
|--------|---------|
| $C_\text{panel}$ | lumped heat capacity of the absorber (J/C) |
| $\alpha$ | short-wave absorptivity of the selective coating (0–1) |
| $A_p$ | collector aperture area (m²) |
| $G$ | global solar irradiance on the tilted surface (W/m²) |
| $U_{\text{loss},p}$ | overall heat-loss coefficient, panel -> ambient (W/(m²·C)) |
| $T_\text{env}$ | ambient air temperature (°C) |

### 2. Pipe heat losses

Each of the two connecting legs (tank→panel and panel→tank) is treated as a **plug-flow pipe** losing heat through a distributed cylindrical resistance to the surrounding air. The 1-D steady-state energy balance on the fluid element is:

$$
\dot{C} \, \frac{dT}{dx} = -\frac{T(x) - T_\text{env}}{R_m}
$$

where $x$ is distance along the pipe, $\dot{C} = \dot{m}\,c_w$ (W/K) is the fluid heat capacity rate, and $R_m$ (K·m/W) is the thermal resistance per unit length of the insulated pipe (see derivation in the next section). This ODE has the exact analytical solution:

$$
T_\text{out} = T_\text{env} + \bigl(T_\text{in} - T_\text{env}\bigr)\,e^{-UA_\text{leg}\,/\,\dot{C}}
$$

where $UA_\text{leg} = (L/2)\,/\,R_m$ (W/K) is the overall thermal conductance of the half-leg.

Applied to the two legs:

$$
T_\text{in,panel} = T_\text{env} + \bigl(T_\text{tank} - T_\text{env}\bigr)\,e^{-UA_\text{leg}\,/\,\dot{C}}
$$

$$
T_\text{in,tank} = T_\text{env} + \bigl(T_\text{out,panel} - T_\text{env}\bigr)\,e^{-UA_\text{leg}\,/\,\dot{C}}
$$

The exponential factor is the **attenuation** of the difference between the fluid entry temperature and ambient: at 0 it means all heat is lost before the other end; at 1 it means no loss.

### 3. Fluid heat pickup

The fluid enters the panel at $T_\text{in,panel}$ (as adjusted for pipe loss above) and exits at $T_\text{out,panel}$. The heat transferred to the fluid at the panel is:

$$
Q_\text{to fluid} = \dot{m} \, c_w \, (T_\text{out,panel} - T_\text{in,panel})
$$

The outlet temperature is found via the **effectiveness–NTU method** (described in the next section).

### 4. Tank energy balance

The storage tank receives energy from the hot fluid return (at $T_\text{in,tank}$, reduced from $T_\text{out,panel}$ by the return-leg pipe loss) and loses heat to the surroundings:

$$
C_\text{tank} \, \frac{dT_\text{tank}}{dt}
 = \dot{m} \, c_w \,(T_\text{in,tank} - T_\text{tank})
  \-\ UA_\text{tank}\,(T_\text{tank} - T_\text{env})
$$

where $C_\text{tank} = \rho \, c_w \, V_\text{tank}$ is the thermal mass of the water in the tank.

---

## Pipe Insulation — Cylindrical-Shell Resistance

$R_m$ (K·m/W) is the thermal resistance per unit length of the insulated pipe, composed of a cylindrical insulation layer and outer surface convection:

$$
R_m = \underbrace{\frac{\ln\bigl((r+t_\text{ins})/r\bigr)}{2\pi\,k_\text{ins}}}_{\text{insulation}} + \underbrace{\frac{1}{2\pi\,(r+t_\text{ins})\,h_\text{out}}}_{\text{outer convection}}
$$

where $r = 0.011$ m (22 mm OD copper), $k_\text{ins} = 0.040$ W/(m·K) (elastomeric foam), $h_\text{out} = 10$ W/(m²·K) (natural convection on the outer surface). At 25 mm insulation this gives $R_m \approx 5.2$ K·m/W, i.e. **≈ 10.6 W/m** at $\Delta T = 55$ °C — consistent with the Engineering Toolbox reference range of 8–19 W/m for 22–76 mm pipe sizes.

With $UA_\text{leg} = (L/2)\,/\,R_m$ (W/K), the attenuation factor along one leg is $e^{-UA_\text{leg}/\dot{C}}$. At typical conditions (10 m total pipe, 25 mm insulation, $\dot{m}=0.05$ kg/s) this is $\approx 0.998$, corresponding to **≈ 0.2 °C** temperature drop per leg — small but physically real, and it grows significantly with longer or poorly insulated pipe runs.

---

## Heat-Exchanger Effectiveness (ε–NTU) — Panel Heat Pickup

Rather than solving the spatial temperature profile inside the collector tubes, we treat the panel–fluid interface as a single-stream heat exchanger with a constant wall temperature (the lumped panel). Given total conductance $UA_\text{pf}$ (W/K) and heat capacity rate $\dot{C} = \dot{m}\,c_w$, the **Number of Transfer Units** and **effectiveness** are:

$$
\text{NTU} = \frac{UA_\text{pf}}{\dot{C}}
\qquad
\varepsilon = 1 - e^{-\text{NTU}}
$$

$$
T_\text{out,panel} = T_\text{in,panel} + \varepsilon\,(T_\text{panel} - T_\text{in,panel})
$$

**Physical intuition:**
- When $UA_\text{pf} \gg \dot{C}$ (very good contact or slow flow), $\varepsilon \to 1$ and the fluid exits at the panel temperature — perfect heat exchange.
- When $UA_\text{pf} \ll \dot{C}$ (poor contact or fast flow), $\varepsilon \to 0$ and the fluid passes through almost unheated.
- When $\dot{m} = 0$, $\varepsilon = 0$ and no fluid heat transfer occurs; the panel simply heats up and loses energy to the environment.

---

## Numerical Method — RK4

The two coupled ODEs form the state vector $\mathbf{y} = [T_\text{panel},\ T_\text{tank}]$. We advance them in time with the classical **fourth-order Runge–Kutta** scheme:

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
| Solar irradiance | $G$ | computed | W/m² | Instantaneous irradiance from solar curve |
| Peak irradiance | $G_\text{peak}$ | 1000 | W/m² | Irradiance at solar noon |
| Sim start hour | $h_\text{start}$ | 6.0 | h | Hour of day when t = 0 (e.g. 6 = 6 am) |
| Daylight hours | $h_\text{day}$ | 12.0 | h | Total hours from sunrise to sunset |
| Absorptivity | $\alpha$ | 0.9 | — | Fraction of incident solar radiation absorbed |
| Panel area | $A_p$ | 2.0 | m² | Collector aperture area |
| Panel loss coeff | $U_{\text{loss},p}$ | 5.0 | W/(m²·C) | Combined convective + radiative loss |
| Panel–fluid conductance | $UA_\text{pf}$ | 120 | W/C | Thermal coupling between plate and fluid |
| Panel heat capacity | $C_\text{panel}$ | 20 000 | J/C | Lumped thermal mass (~5 kg copper × 380 J/kg·C) |
| Tank volume | $V_\text{tank}$ | 0.2 | m³ | 200 L storage tank |
| Tank loss coeff | $UA_\text{tank}$ | 8.0 | W/C | Heat loss from tank to ambient |
| Mass flow rate | $\dot{m}$ | 0.05 | kg/s | Circulating pump flow (~3 L/min) |
| Water density | $\rho$ | 997 | kg/m³ | At ~25 °C |
| Specific heat | $c_w$ | 4181 | J/(kg·C) | Water at ~25 °C |
| Total pipe length | $L$ | 10.0 | m | Combined length of both loop legs (panel->tank + tank->panel) |
| Insulation thickness | $t_\text{ins}$ | 25 | mm | Foam insulation around 22 mm OD copper tube (25 mm = standard 1 inch) |
| Time step | $\Delta t$ | 0.25 | s | RK4 integration step |

---

## Project Structure

```
src/
├-- types.ts              # Params, State, Snapshot type definitions
├-- physics.ts            # stepDerivatives(): ODE RHS — panel balance (ε–NTU), pipe decay, tank balance
├-- simulate.ts           # rk4Step(): classical RK4 integrator wrapping physics.ts
├-- store.ts              # Zustand store (params, state, history, controls)
├-- hooks/
│   └-- useSimLoop.ts     # requestAnimationFrame loop driving the simulation
├-- components/
│   ├-- Controls.tsx      # Mantine sliders/inputs for all parameters
│   ├-- StatusBar.tsx     # Live readouts (time, temperatures, energy)
│   ├-- TempChart.tsx     # Vega-Lite line chart (T_panel, T_tank, T_out)
│   └-- IrradianceChart.tsx # Vega-Lite area chart (solar irradiance)
├-- App.tsx               # Main layout (AppShell with sidebar + charts)
└-- main.tsx              # Entry point with MantineProvider
```

### Key design decisions

- **Zustand** for state management — lightweight, no boilerplate, easy to read from outside React (inside `requestAnimationFrame`).
- **RK4** over Euler — virtually no additional cost but dramatically better accuracy for the same step size.
- **ε–NTU** for the panel–fluid heat pickup — gives an analytical outlet temperature with a single exponential, appropriate for the lumped-capacitance abstraction.
- **Plug-flow exponential decay** for pipe legs — derived from the 1-D steady-state pipe ODE, giving $T_\text{out} = T_\text{env} + (T_\text{in} - T_\text{env})\,e^{-UA_\text{leg}/\dot{C}}$. This correctly captures temperature decay along a pipe carrying fluid past an insulated wall, without introducing a heat-exchanger effectiveness that would imply a second fluid stream.
- **vega-embed** over a React charting library — Vega-Lite specs are declarative and portable data is swapped in-place each frame for performance.

---

## Future Work

While this MVP performs well as a simplified physical model with basic data visualization, there are many things that could be added to enhance the overall system and experience.

- **Chart Interactivity**: This would add a nice dimension to the data exploration, although this is notoriously difficult for real-time timeseries updating charts.
- **2D Schematic Visualization**: This would add a good visual component to better understand the system.
- **3D Schematic Vsiualization**: Even better, a WebGL integration showcasing a three dimensional, interactive view of the system would be very cool. This would allow for many dynamic updates that sync with the user inputs. For example, increasing the pipe length could actually change the structure of the system in real time. Also, the diurnal function for solar irradiance could theoretically be used to calculate the lighting cosine angle for diffuse and specular lighting.
- **Segmented capacitance models**: Currently, the lumped-capacitance model is a vast simplification of a real solar panel and water storage tank. By using a segmented model, the panel could be split into sub-nodes with their own heat transfer and accumulation. This would allow for much better approximation of a system where the water could be heating up as it passes through each node, rather than simply heating once from the entire panel. Similarly, a segmented tank could allow for a better approximation of convection currents, although this solution is still vastly simplified.
- **Diurnal ambient temperature**: A function to adjust the ambient temperature similarly to the solar irradiance would be interesting, as it would better showcase how the system reacts to cooling at night times versus loss during the day.
- **"Smart" Pump**: A "smart" pump could turn off when the panel is cooler than the tank, for example. This would allow for a more customizable system that could lead to overall more efficient system design and data exploration.
- **Pump Loss**: A real-world heat pump is never lossless, simulating this loss would further contribute to the improvement of the system.
- **Material selection**: Currently, we assume copper material values for panel thermal mass/conductivity and the pipe insulation properties. It would be very cool to implement dynamic material selection, allowing for more physics real properties.

## AI Usage Disclosure

Generative AI was used in this project for the creation of this README.md ([Future Work](#future-work) and this section had no AI usage), code documentation, and portions of the code, particularly in the physics simulation engine. To be specific, gen. AI was most utilized in the ε–NTU heat transfer formulation. All code, documentation, and this README.md has been verified and tested by a human (me). AI did NOT make architecture decisions for the code or project structure, nor did it make choices about dependencies, tools, or frameworks being used.

## License

MIT
