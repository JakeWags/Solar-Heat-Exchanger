import { Group, Paper, Stack, Text } from '@mantine/core';
import { useSimStore } from '../store';
import { computeSolarG } from '../solar';

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <Paper p="xs" radius="md" withBorder style={{ flex: 1, minWidth: 120 }}>
      <Text size="xs" c="dimmed" tt="uppercase">
        {label}
      </Text>
      <Group gap={4} align="baseline">
        <Text size="lg" fw={700}>
          {value}
        </Text>
        <Text size="xs" c="dimmed">
          {unit}
        </Text>
      </Group>
    </Paper>
  );
}

export default function StatusBar() {
  const state = useSimStore((s) => s.state);
  const params = useSimStore((s) => s.params);

  const kJ = (state.E_harvest / 1000).toFixed(1);
  const kWh = (state.E_harvest / 3.6e6).toFixed(3);
  const G = computeSolarG(state.t, params);

  // Adaptive sim-time display: min -> h -> days
  let simTimeValue: string;
  let simTimeUnit: string;
  if (state.t < 7_200) {
    simTimeValue = (state.t / 60).toFixed(1);
    simTimeUnit = 'min';
  } else if (state.t < 172_800) {
    simTimeValue = (state.t / 3600).toFixed(2);
    simTimeUnit = 'h';
  } else {
    simTimeValue = (state.t / 86400).toFixed(2);
    simTimeUnit = 'days';
  }

  // Hour of day for display
  const hourOfDay = params.t_start_hour + state.t / 3600;
  const hh = Math.floor(hourOfDay % 24).toString().padStart(2, '0');
  const mm = Math.floor((hourOfDay % 1) * 60).toString().padStart(2, '0');
  const timeOfDay = `${hh}:${mm}`;

  return (
    <Stack gap={4}>
      <Group gap="xs" grow>
        <Stat label="Sim time" value={simTimeValue} unit={simTimeUnit} />
        <Stat label="Time of Day" value={timeOfDay} unit="" />
        <Stat label="T_panel" value={state.T_panel.toFixed(1)} unit="°C" />
        <Stat label="T_tank" value={state.T_tank.toFixed(1)} unit="°C" />
        <Stat label="Harvested" value={kJ} unit="kJ" />
        <Stat label="Energy" value={kWh} unit="kWh" />
        <Stat label="Irradiance" value={G.toFixed(0)} unit="W/m²" />
      </Group>
    </Stack>
  );
}
