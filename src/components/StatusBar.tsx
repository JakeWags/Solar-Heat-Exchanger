import { Group, Paper, Stack, Text } from '@mantine/core';
import { useSimStore } from '../store';

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

  const minutes = (state.t / 60).toFixed(1);
  const kJ = (state.E_harvest / 1000).toFixed(1);
  const kWh = (state.E_harvest / 3.6e6).toFixed(3);

  return (
    <Stack gap={4}>
      <Group gap="xs" grow>
        <Stat label="Sim time" value={minutes} unit="min" />
        <Stat label="T_panel" value={state.T_panel.toFixed(1)} unit="°C" />
        <Stat label="T_tank" value={state.T_tank.toFixed(1)} unit="°C" />
        <Stat label="Harvested" value={kJ} unit="kJ" />
        <Stat label="Energy" value={kWh} unit="kWh" />
        <Stat label="Irradiance" value={params.G.toFixed(0)} unit="W/m²" />
      </Group>
    </Stack>
  );
}
