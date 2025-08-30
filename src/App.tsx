import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelGrid } from './components/PixelGrid.tsx';
import { Toolbar } from './components/Toolbar.tsx';
import './app.css';

export const APP_STORAGE_KEY = 'pixel-canvas-v1';

export type PixelColor = string;

export interface PixelCanvasData {
  width: number;
  height: number;
  pixels: PixelColor[]; // length = width*height
}

const WIDTH = 32;
const HEIGHT = 32;
const DEFAULT_COLOR = '#ffffff';

function createBlank(): PixelCanvasData {
  return {
    width: WIDTH,
    height: HEIGHT,
    pixels: Array(WIDTH * HEIGHT).fill(DEFAULT_COLOR),
  };
}

function load(): PixelCanvasData {
  try {
    const raw = localStorage.getItem(APP_STORAGE_KEY);
    if (!raw) return createBlank();
    const parsed: PixelCanvasData = JSON.parse(raw);
    if (
      parsed.width !== WIDTH ||
      parsed.height !== HEIGHT ||
      !Array.isArray(parsed.pixels) ||
      parsed.pixels.length !== WIDTH * HEIGHT
    ) {
      return createBlank();
    }
    return parsed;
  } catch {
    return createBlank();
  }
}

function save(data: PixelCanvasData) {
  try {
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // ignore quota errors
  }
}

export const App: React.FC = () => {
  const [data, setData] = useState<PixelCanvasData>(() => load());
  const [currentColor, setCurrentColor] = useState('#000000');
  const [isMouseDown, setIsMouseDown] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    save(data);
  }, [data]);

  useEffect(() => {
    const up = () => setIsMouseDown(false);
    window.addEventListener('mouseup', up);
    window.addEventListener('mouseleave', up);
    return () => {
      window.removeEventListener('mouseup', up);
      window.removeEventListener('mouseleave', up);
    };
  }, []);

  const setPixel = useCallback(
    (index: number, color: string) => {
      setData((prev) => {
        if (prev.pixels[index] === color) return prev;
        const next = { ...prev, pixels: [...prev.pixels] };
        next.pixels[index] = color;
        return next;
      });
    },
    []
  );

  const handlePixelAction = useCallback(
    (index: number) => {
      setPixel(index, currentColor);
    },
    [currentColor, setPixel]
  );

  const handleClear = useCallback(() => {
    setData(createBlank());
  }, []);

  const exportPNG = useCallback(() => {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const i = y * WIDTH + x;
        ctx.fillStyle = data.pixels[i];
        ctx.fillRect(x, y, 1, 1);
      }
    }

    const link = document.createElement('a');
    link.download = 'pixel-art.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [data]);

  return (
    <div className="app" ref={containerRef}>
      <h1>Pixel Canvas 32x32</h1>
      <Toolbar
        color={currentColor}
        onColorChange={setCurrentColor}
        onClear={handleClear}
        onExport={exportPNG}
      />
      <PixelGrid
        width={data.width}
        height={data.height}
        pixels={data.pixels}
        currentColor={currentColor}
        onPaint={handlePixelAction}
        isMouseDown={isMouseDown}
        setIsMouseDown={setIsMouseDown}
      />
    </div>
  );
};
