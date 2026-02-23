import {
  Stack,
  Text,
  Slider,
  NumberInput,
  Group,
  Badge,
  Accordion,
} from '@mantine/core';
import { useSimStore } from '../store';
import type { Params } from '../types';

/** Helper – makes a labeled slider bound to one param key. */
function ParamSlider({
  label,
  paramKey,
  min,
  max,
  step,
  unit,
}: {
  label: string;
  paramKey: keyof Params;
  min: number;
  max: number;
  step: number;
  unit: string;
}) {
  const value = useSimStore((s) => s.params[paramKey]);
  const setParams = useSimStore((s) => s.setParams);

  return (
    <div>
      <Group justify="space-between" mb={2}>
        <Text size="xs" fw={500}>
          {label}
        </Text>
        <Badge size="sm" variant="light">
          {typeof value === 'number' ? value.toFixed(step < 1 ? 2 : 0) : value} {unit}
        </Badge>
      </Group>
      <Slider
        value={value as number}
        onChange={(v) => setParams((p) => ({ ...p, [paramKey]: v }))}
        min={min}
        max={max}
        step={step}
        size="sm"
        label={(v) => `${v} ${unit}`}
      />
    </div>
  );
}

export default function Controls() {
  const speed = useSimStore((s) => s.speed);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const dt = useSimStore((s) => s.params.dt);
  const setParams = useSimStore((s) => s.setParams);

  return (
    <Accordion multiple defaultValue={['environment', 'simulation']} variant="separated">
      <Accordion.Item value="environment">
        <Accordion.Control>
          <Text fw={700} size="sm" tt="uppercase">
            Environment
          </Text>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm">
            <ParamSlider label="Ambient Temp" paramKey="T_env" min={-10} max={45} step={0.5} unit="°C" />
            <ParamSlider label="Peak Irradiance" paramKey="G_peak" min={0} max={1400} step={10} unit="W/m²" />
            <ParamSlider label="Absorptivity α" paramKey="alpha" min={0} max={1} step={0.01} unit="" />
            <ParamSlider label="Start Hour" paramKey="t_start_hour" min={0} max={12} step={0.25} unit="h" />
            <ParamSlider label="Daylight Hours" paramKey="daylight_hours" min={4} max={18} step={0.25} unit="h" />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item value="panel">
        <Accordion.Control>
          <Text fw={700} size="sm" tt="uppercase">
            Panel
          </Text>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm">
            <ParamSlider label="Panel Area" paramKey="A_p" min={0.5} max={10} step={0.1} unit="m²" />
            <ParamSlider label="U_loss (panel->env)" paramKey="U_loss_p" min={0.5} max={20} step={0.5} unit="W/(m²·C)" />
            <ParamSlider label="UA panel->fluid" paramKey="UA_pf" min={10} max={500} step={5} unit="W/C" />
            <ParamSlider label="Panel Heat Capacity" paramKey="C_panel" min={1000} max={100000} step={500} unit="J/C" />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item value="tank">
        <Accordion.Control>
          <Text fw={700} size="sm" tt="uppercase">
            Tank
          </Text>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm">
            <ParamSlider label="Tank Volume" paramKey="V_tank" min={0.02} max={1.0} step={0.01} unit="m³" />
            <ParamSlider label="UA tank->env" paramKey="UA_tank" min={0.5} max={30} step={0.5} unit="W/C" />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item value="flow">
        <Accordion.Control>
          <Text fw={700} size="sm" tt="uppercase">
            Flow
          </Text>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm">
            <ParamSlider label="Mass flow rate" paramKey="m_dot" min={0} max={0.3} step={0.005} unit="kg/s" />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item value="pipe">
        <Accordion.Control>
          <Text fw={700} size="sm" tt="uppercase">
            Pipe Losses
          </Text>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm">
            <ParamSlider label="Total pipe length" paramKey="pipe_length_total" min={0} max={50} step={1} unit="m" />
            <ParamSlider label="Insulation thickness" paramKey="pipe_insulation_mm" min={10} max={100} step={5} unit="mm" />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item value="simulation">
        <Accordion.Control>
          <Text fw={700} size="sm" tt="uppercase">
            Simulation
          </Text>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm">
            <div>
              <Group justify="space-between" mb={2}>
                <Text size="xs" fw={500}>
                  Speed (steps/frame)
                </Text>
                <Badge size="sm" variant="light">
                  {speed}
                </Badge>
              </Group>
              <Slider
                value={speed}
                onChange={setSpeed}
                min={1}
                max={64}
                step={1}
                size="sm"
              />
            </div>

            <NumberInput
              label="Time step (dt)"
              size="xs"
              value={dt}
              onChange={(v) => {
                const newDt = typeof v === 'number' ? v : parseFloat(v as string) || 0.25;
                setParams((p) => ({ ...p, dt: newDt }));
              }}
              min={0.01}
              max={12}
              step={1}
              decimalScale={2}
              suffix=" s"
            />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
