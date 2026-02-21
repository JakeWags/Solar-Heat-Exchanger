import {
  AppShell,
  Title,
  Group,
  Button,
  ScrollArea,
  Stack,
  Paper,
  Text,
} from '@mantine/core';
import { useSimStore } from './store';
import { useSimLoop } from './hooks/useSimLoop';
import TempChart from './components/TempChart';
import IrradianceChart from './components/IrradianceChart';
import Controls from './components/Controls';
import StatusBar from './components/StatusBar';

export default function App() {
  useSimLoop();

  const running = useSimStore((s) => s.running);
  const toggle = useSimStore((s) => s.toggle);
  const reset = useSimStore((s) => s.reset);

  return (
    <AppShell
      navbar={{ width: 320, breakpoint: 'sm' }}
      padding="md"
    >
      {/* ─── Sidebar ─── */}
      <AppShell.Navbar p="md">
        <AppShell.Section>
          <Title order={4} mb="sm">
            Solar Thermal Sim
          </Title>
          <Group mb="md">
            <Button
              size="xs"
              variant={running ? 'filled' : 'light'}
              color={running ? 'green' : 'gray'}
              onClick={toggle}
            >
              {running ? 'Pause' : 'Resume'}
            </Button>
            <Button size="xs" variant="light" color="red" onClick={reset}>
              Reset
            </Button>
          </Group>
        </AppShell.Section>

        <AppShell.Section grow component={ScrollArea} type="auto">
          <Controls />
        </AppShell.Section>
      </AppShell.Navbar>

      {/* ─── Main content ─── */}
      <AppShell.Main>
        <Stack gap="md">
          <StatusBar />

          <Paper p="md" radius="md" withBorder>
            <Text size="sm" fw={600} mb="xs">
              Temperature Traces
            </Text>
            <TempChart />
          </Paper>

          <Paper p="md" radius="md" withBorder>
            <Text size="sm" fw={600} mb="xs">
              Solar Irradiance
            </Text>
            <IrradianceChart />
          </Paper>
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
