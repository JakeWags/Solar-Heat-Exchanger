import { useState, useRef, useEffect } from 'react';
import { ScrollArea, Stack, Text } from '@mantine/core';
import TempChart from './TempChart';
import IrradianceChart from './IrradianceChart';

const MIN_WIDTH = 300;
const MAX_WIDTH = 1000;
const DEFAULT_WIDTH = MAX_WIDTH;

export default function ChartSidebar() {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, startWidth: 0 });

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = dragStartRef.current.x - e.clientX;
      const newWidth = Math.max(
        MIN_WIDTH,
        Math.min(MAX_WIDTH, dragStartRef.current.startWidth + deltaX)
      );
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      startWidth: width,
    };
  };

  return (
    <div
      style={{
        width: width,
        minWidth: MIN_WIDTH,
        overflow: 'hidden',
        background: 'rgba(13, 17, 23, 0.94)',
        backdropFilter: 'blur(6px)',
        borderLeft: '1px solid #30363d',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* Resize handle on the left edge */}
      <div
        onMouseDown={handleDragStart}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: 'ew-resize',
          zIndex: 20,
          background: 'transparent',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(88, 166, 255, 0.15)';
        }}
        onMouseLeave={(e) => {
          if (!isDragging) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        {/* Visual indicator */}
        <div
          style={{
            position: 'absolute',
            left: 2,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 3,
            height: 40,
            borderRadius: 2,
            background: 'rgba(88, 166, 255, 0.4)',
            opacity: 0,
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
          onMouseLeave={(e) => {
            if (!isDragging) {
              e.currentTarget.style.opacity = '0';
            }
          }}
        />
      </div>

      <ScrollArea style={{ flex: 1 }} p={0}>
        <Stack gap={6} p={8} pt={12}>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
              Live Charts
            </Text>
            <Text size="xs" fw={500} c="gray.4">
              Temperature
            </Text>
            <TempChart width={width - 120} height={220} />
            <Text size="xs" fw={500} c="gray.4">
              Irradiance
            </Text>
          <IrradianceChart width={width - 100} height={220} />
        </Stack>
      </ScrollArea>
    </div>
  );
}
