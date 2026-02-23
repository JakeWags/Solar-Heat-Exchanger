import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { ActionIcon, Box, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import { useSimStore } from '../store';
import { computeSolar } from '../solar';
import type { Params, State } from '../types';
import TempChart from './TempChart';
import IrradianceChart from './IrradianceChart';

// --- Temperature -> diffuse colour ---------------------------------------------
// Gradient: cold (15 °C) steel-blue -> warm (52 °C) amber -> hot (90 °C) crimson
// Pre-allocated colour stops to avoid per-frame allocations.
const _COLD = new THREE.Color(0.25, 0.42, 0.92);
const _WARM = new THREE.Color(0.95, 0.55, 0.05);
const _HOT = new THREE.Color(0.88, 0.06, 0.06);
const T_COLD = 15;
const T_HOT = 90;

/** Convert a THREE.Color to a CSS rgb() string. */
function toCssRgb(c: THREE.Color): string {
  return `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
}

/** Map a temperature in C to a THREE.Color. Writes into 'out' */
function tempToColor(T: number, out: THREE.Color): void {
  const t = Math.max(0, Math.min(1, (T - T_COLD) / (T_HOT - T_COLD)));
  if (t < 0.5) {
    out.copy(_COLD).lerp(_WARM, t * 2);
  } else {
    out.copy(_WARM).lerp(_HOT, (t - 0.5) * 2);
  }
}

// --- Sky background colour ----------------------------------------------------
const _SKY_NIGHT = new THREE.Color(0x0c111d);
const _SKY_DAWN = new THREE.Color(0xc84010);
const _SKY_DAY = new THREE.Color(0x4d8fbf);

function setSkyColor(elevSin: number, isDaylight: boolean, out: THREE.Color): void {
  if (!isDaylight || elevSin <= 0) {
    out.copy(_SKY_NIGHT);
  } else if (elevSin < 0.15) {
    out.copy(_SKY_NIGHT).lerp(_SKY_DAWN, elevSin / 0.15);
  } else if (elevSin < 0.35) {
    out.copy(_SKY_DAWN).lerp(_SKY_DAY, (elevSin - 0.15) / 0.20);
  } else {
    out.copy(_SKY_DAY);
  }
}

// --- Sun position scratch vector (reused every frame) -----------------------
const _sunPos = new THREE.Vector3();

// --- Cylinder between two world-space points ----------------------------------
function makeCylinder(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  mat: THREE.Material,
  castShadow = true,
): THREE.Mesh {
  const dir = b.clone().sub(a);
  const length = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius, length, 16, 1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

// --- Scene geometry constants -------------------------------------------------
const TILT_RAD = 35 * (Math.PI / 180);   // panel tilt from horizontal
const PANEL_CTR = new THREE.Vector3(-1.8, 1.52, 0);

// Panel local z = ±0.5 edges after rotation.x = −TILT_RAD
// R_x(−θ) on (0, 0, ±0.5): y_new = ∓(−sin(−θ))·0.5 = ±0.5·sin(θ),  z_new = ±0.5·cos(θ)
const _s = Math.sin(TILT_RAD);
const _c = Math.cos(TILT_RAD);
const PANEL_OUTLET = new THREE.Vector3(PANEL_CTR.x, PANEL_CTR.y + 0.5 * _s,  0.5 * _c); // hot, top edge
const PANEL_INLET = new THREE.Vector3(PANEL_CTR.x, PANEL_CTR.y - 0.5 * _s, -0.5 * _c); // cold, bottom edge

const TANK_CTR = new THREE.Vector3(1.85, 0.75, 0);
const TANK_TOP = new THREE.Vector3(TANK_CTR.x, 1.5,  0);
const TANK_BTM = new THREE.Vector3(TANK_CTR.x, 0.0,  0);
const TANK_R = 0.36;
const TANK_H = 1.5;

// Reference panel area that matches the built geometry (1.65 × 1.06 m ≈ 1.75 m²,
// rounded to the store default so the panel looks right out of the box).
const A_P_REF = 2.0; // m²

// --- Scene factory ------------------------------------------------------------

interface SceneHandle {
  resize:  (w: number, h: number) => void;
  dispose: () => void;
}

function buildScene(canvas: HTMLCanvasElement, container: HTMLDivElement, w: number, h: number): SceneHandle {
  // -- Renderer ----------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, /* updateStyle */ false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  // -- CSS2D label renderer (positioned as an absolute overlay) ---------------
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w, h);
  Object.assign(labelRenderer.domElement.style, {
    position: 'absolute', top: '0', left: '0',
    width: '100%', height: '100%',
    pointerEvents: 'none',
  });
  container.appendChild(labelRenderer.domElement);

  // -- Scene -------------------------------------------------------------------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(_SKY_NIGHT);
  scene.fog = new THREE.FogExp2(0x0c111d, 0.028);

  // -- Camera ------------------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
  camera.position.set(-5.5, 4.2, -7.5);
  camera.lookAt(0, 1, 0);

  // -- Orbit controls ----------------------------------------------------------
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 2;
  controls.maxDistance = 22;
  controls.update();

  // -- Lights ------------------------------------------------------------------
  // Hemisphere provides a plausible sky/ground ambient even at night.
  const hemi = new THREE.HemisphereLight(0x6699cc, 0x2a3e14, 0.35);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambient);

  // Primary Directional light = sun. Position updated every frame.
  const sunLight = new THREE.DirectionalLight(0xfff0cc, 0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  const sc = sunLight.shadow.camera as THREE.OrthographicCamera;
  sc.near = 1; sc.far = 50;
  sc.left = sc.bottom = -6;
  sc.right = sc.top = 6;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);
  scene.add(sunLight.target); // target stays at origin

  // Soft fill from the opposite (north / sky-fill) direction.
  const fillLight = new THREE.DirectionalLight(0x8899cc, 0.15);
  fillLight.position.set(-4, 3, -5);
  scene.add(fillLight);

  // -- Ground ------------------------------------------------------------------
  const groundMat = new THREE.MeshPhongMaterial({
    color:     new THREE.Color(0x2a3e14),
    shininess: 4,
    // map: null,  // TODO: grass texture here
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // -- Solar panel -------------------------------------------------------------
  // Aluminium frame
  const frameMat = new THREE.MeshPhongMaterial({
    color:     new THREE.Color(0x545f6a),
    specular:  new THREE.Color(0.3, 0.3, 0.3),
    shininess: 65,
    // map: null,  // <- anodised-aluminium texture
  });

  // Absorber surface — colour is driven by T_panel every frame.
  const panelMat = new THREE.MeshPhongMaterial({
    color:     new THREE.Color(1.0, 1.0, 1.0),   // white so texture tint from tempToColor shows through
    specular:  new THREE.Color(0.25, 0.25, 0.25),
    shininess: 85,
  });

  // Load solar-cell texture onto the absorber front face.
  new THREE.TextureLoader().load('/textures/solarpanel.png', (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    panelMat.map = tex;
    panelMat.needsUpdate = true;
  });

  const panelFrame = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.07, 1.06), frameMat);
  panelFrame.castShadow = panelFrame.receiveShadow = true;

  const panelAbsorber = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.025, 0.97), panelMat);
  panelAbsorber.position.set(0, 0.047, 0);
  panelAbsorber.castShadow = panelAbsorber.receiveShadow = true;

  const panelGroup = new THREE.Group();
  panelGroup.add(panelFrame, panelAbsorber);
  panelGroup.rotation.x = -TILT_RAD;
  panelGroup.position.copy(PANEL_CTR);
  scene.add(panelGroup);

  // Support legs (two diagonal cylinders, from the forward/lower edge to the ground)
  const legMat = new THREE.MeshPhongMaterial({ color: 0x404a52, shininess: 28 });
  const LEG_R = 0.028;
  const LEG_OFFSETS = [-0.65, 0.65];
  for (const lx of LEG_OFFSETS) {
    const top = new THREE.Vector3(PANEL_CTR.x + lx, PANEL_OUTLET.y + 0.04, PANEL_OUTLET.z);
    const bot = new THREE.Vector3(PANEL_CTR.x + lx, 0.02, PANEL_OUTLET.z - 0.25);
    scene.add(makeCylinder(top, bot, LEG_R, legMat));
  }
  // Cross-brace at the bottom
  const braceL = new THREE.Vector3(PANEL_CTR.x - 0.65, 0.04, PANEL_OUTLET.z - 0.25);
  const braceR = new THREE.Vector3(PANEL_CTR.x + 0.65, 0.04, PANEL_OUTLET.z - 0.25);
  scene.add(makeCylinder(braceL, braceR, LEG_R * 0.8, legMat));

  // -- Pipes -------------------------------------------------------------------
  const PIPE_R = 0.038;

  // Hot supply pipe: panel outlet (top/forward edge) -> tank top inlet
  const hotPipeMat = new THREE.MeshPhongMaterial({
    color:     new THREE.Color(0.25, 0.42, 0.92),
    specular:  new THREE.Color(0.2, 0.2, 0.2),
    shininess: 50,
  });
  const hotPipe = makeCylinder(PANEL_OUTLET, TANK_TOP, PIPE_R, hotPipeMat);
  scene.add(hotPipe);

  // Cold return pipe: tank bottom outlet -> panel inlet (bottom/rear edge)
  const coldPipeMat = new THREE.MeshPhongMaterial({
    color:     new THREE.Color(0.25, 0.42, 0.92),
    specular:  new THREE.Color(0.2, 0.2, 0.2),
    shininess: 50,
  });
  const coldPipe = makeCylinder(TANK_BTM, PANEL_INLET, PIPE_R, coldPipeMat);
  scene.add(coldPipe);

  // -- Storage tank ------------------------------------------------------------
  // Main insulated body — colour driven by T_tank every frame.
  const tankMat = new THREE.MeshPhongMaterial({
    color:     new THREE.Color(0.25, 0.42, 0.92),
    specular:  new THREE.Color(0.18, 0.18, 0.18),
    shininess: 28,
  });
  const tankBody = new THREE.Mesh(new THREE.CylinderGeometry(TANK_R, TANK_R, TANK_H, 32), tankMat);
  tankBody.position.copy(TANK_CTR);
  tankBody.castShadow = tankBody.receiveShadow = true;
  scene.add(tankBody);

  // End-cap flanges
  const capMat = new THREE.MeshPhongMaterial({ color: 0x42525e, shininess: 60 });
  for (const y of [TANK_BTM.y + 0.022, TANK_TOP.y - 0.022]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(TANK_R + 0.02, TANK_R + 0.02, 0.045, 32), capMat);
    cap.position.set(TANK_CTR.x, y, TANK_CTR.z);
    cap.castShadow = true;
    scene.add(cap);
  }

  // Base plinth
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(TANK_R + 0.10, TANK_R + 0.10, 0.06, 32),
    capMat,
  );
  plinth.position.set(TANK_CTR.x, 0.03, TANK_CTR.z);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  scene.add(plinth);

  // -- Temperature labels (CSS2D) --------------------------------------------
  function makeLabelDiv(): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      padding: '2px 8px',
      background: 'rgba(10, 14, 20, 0.80)',
      border: '1px solid rgba(255,255,255,0.14)',
      borderRadius: '4px',
      color: '#e6edf3',
      font: '600 11px/1.5 ui-monospace, monospace',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      userSelect: 'none',
    });
    return el;
  }

  const panelLabelEl = makeLabelDiv();
  const panelLabel = new CSS2DObject(panelLabelEl);
  panelLabel.position.set(PANEL_CTR.x, PANEL_CTR.y + 0.68, 0);
  scene.add(panelLabel);

  const tankLabelEl = makeLabelDiv();
  const tankLabel = new CSS2DObject(tankLabelEl);
  tankLabel.position.set(TANK_CTR.x, TANK_TOP.y + 0.22, 0);
  scene.add(tankLabel);

  // -- Per-frame scratch objects (no heap allocations in the hot path) --------
  const _col = new THREE.Color();
  const _bgCol = new THREE.Color();

  // -- rAF loop — reads store directly, no React state involvement -----------
  let rafId = 0;

  function tick() {
    rafId = requestAnimationFrame(tick);

    const { state, params } = useSimStore.getState() as { state: State; params: Params };

    // --- Solar lighting ---------------------------
    const sun = computeSolar(state.t, params);
    const { elevSin, isDaylight } = sun;
    _sunPos.set(sun.sunDirX, sun.sunDirY, sun.sunDirZ).multiplyScalar(20);
    sunLight.position.copy(_sunPos);
    sunLight.intensity = isDaylight ? elevSin * 2.8 : 0;
    ambient.intensity = isDaylight ? 0.2 + elevSin * 0.35 : 0.10;
    hemi.intensity = isDaylight ? 0.35 + elevSin * 0.2  : 0.20;

    // Sky background tracks solar elevation
    setSkyColor(elevSin, isDaylight, _bgCol);
    (scene.background as THREE.Color).copy(_bgCol);
    (scene.fog as THREE.FogExp2).color.copy(_bgCol);

    // --- Panel area scale (XZ only — keep thickness constant) ----------------
    const panelScale = Math.sqrt(params.A_p / A_P_REF);
    panelGroup.scale.set(panelScale, 1, panelScale);

    // --- Temperature gradient colours ----------------------------------------
    // Panel absorber and hot supply pipe <- T_panel
    tempToColor(state.T_panel, _col);
    panelMat.color.copy(_col);
    hotPipeMat.color.copy(_col);
    panelLabelEl.textContent = `Panel  ${state.T_panel.toFixed(1)} °C`;
    panelLabelEl.style.color = toCssRgb(_col);

    // Tank body and cold return pipe <- T_tank
    tempToColor(state.T_tank, _col);
    tankMat.color.copy(_col);
    coldPipeMat.color.copy(_col);
    tankLabelEl.textContent = `Tank  ${state.T_tank.toFixed(1)} °C`;
    tankLabelEl.style.color = toCssRgb(_col);

    // --- Render --------------------------------------------------------------
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  tick();

  // -- Resize -----------------------------------------------------------------
  function resize(newW: number, newH: number) {
    camera.aspect = newW / newH;
    camera.updateProjectionMatrix();
    renderer.setSize(newW, newH, false);
    labelRenderer.setSize(newW, newH);
  }

  // -- Dispose — clean up GPU resources and cancel the loop ------------------
  function dispose() {
    cancelAnimationFrame(rafId);
    controls.dispose();

    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const pm = m as THREE.MeshPhongMaterial;
        pm.map?.dispose();          // dispose any loaded texture
        pm.dispose();
      }
    });

    renderer.dispose();
    container.removeChild(labelRenderer.domElement);
  }

  return { resize, dispose };
}

// --- React component ----------------------------------------------------------

const SIDEBAR_WIDTH = 500;

export default function SceneView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const { width, height } = container.getBoundingClientRect();
    const w = Math.max(width,  320);
    const h = Math.max(height, 200);

    handleRef.current = buildScene(canvas, container, w, h);

    // Keep the renderer in sync with the container size.
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) handleRef.current?.resize(rect.width, rect.height);
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, []); // intentionally empty — build once on mount

  return (
    <Box
      style={{
        width:        '100%',
        aspectRatio:  '16 / 9',
        display:      'flex',
        overflow:     'hidden',
        borderRadius: 8,
        background:   '#0c111d',
      }}
    >
      {/* ── Three.js canvas (flex-grows to fill remaining width) ── */}
      <div
        ref={containerRef}
        style={{ flex: 1, position: 'relative', minWidth: 0 }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />

        {/* Toggle button pinned to the right edge of the canvas */}
        <Tooltip label={open ? 'Hide charts' : 'Show charts'} position="left" withArrow>
          <ActionIcon
            onClick={() => setOpen((v) => !v)}
            variant="filled"
            color="dark"
            radius="xl"
            size="lg"
            style={{
              position:  'absolute',
              right:     8,
              top:       '50%',
              transform: 'translateY(-50%)',
              zIndex:    10,
              opacity:   0.82,
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>{open ? '▶' : '◀'}</span>
          </ActionIcon>
        </Tooltip>
      </div>

      {/* ── Sliding chart panel ── */}
      <div
        style={{
          width:      open ? SIDEBAR_WIDTH : 0,
          minWidth:   0,
          overflow:   'hidden',
          transition: 'width 0.25s ease',
          background: 'rgba(13, 17, 23, 0.94)',
          backdropFilter: 'blur(6px)',
          borderLeft: open ? '1px solid #30363d' : 'none',
          display:    'flex',
          flexDirection: 'column',
        }}
      >
        <ScrollArea style={{ flex: 1 }} p={0}>
          <Stack gap={6} p={8} style={{ width: SIDEBAR_WIDTH }}>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
              Live Charts
            </Text>
            <Text size="xs" fw={500} c="gray.4">Temperature</Text>
            <TempChart width={SIDEBAR_WIDTH - 120} height={220} />
            <Text size="xs" fw={500} c="gray.4">Irradiance</Text>
            <IrradianceChart width={SIDEBAR_WIDTH - 100} height={220} />
          </Stack>
        </ScrollArea>
      </div>
    </Box>
  );
}
