import React, { useCallback } from 'react';

interface PixelGridProps {
  width: number;
  height: number;
  pixels: string[];
  currentColor: string;
  onPaint: (index: number) => void;
  isMouseDown: boolean;
  setIsMouseDown: (v: boolean) => void;
}

export const PixelGrid: React.FC<PixelGridProps> = ({
  width,
  height,
  pixels,
  currentColor,
  onPaint,
  isMouseDown,
  setIsMouseDown,
}) => {
  const handleDown = useCallback(
    (index: number) => {
      setIsMouseDown(true);
      onPaint(index);
    },
    [onPaint, setIsMouseDown]
  );

  const handleEnter = useCallback(
    (index: number) => {
      if (isMouseDown) {
        onPaint(index);
      }
    },
    [isMouseDown, onPaint]
  );

  return (
    <div
      className="pixel-grid"
      style={{
        gridTemplateColumns: `repeat(${width}, 1fr)`,
        gridTemplateRows: `repeat(${height}, 1fr)`,
      }}
      onMouseLeave={() => setIsMouseDown(false)}
    >
      {pixels.map((color, i) => (
        <button
          key={i}
            className="pixel"
            style={{ backgroundColor: color }}
            onMouseDown={() => handleDown(i)}
            onMouseEnter={() => handleEnter(i)}
            aria-label={`pixel-${i}`}
        />
      ))}
    </div>
  );
};
