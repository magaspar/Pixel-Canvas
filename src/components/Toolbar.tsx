import React from 'react';

interface ToolbarProps {
  color: string;
  onColorChange: (c: string) => void;
  onClear: () => void;
  onExport: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ color, onColorChange, onClear, onExport }) => {
  return (
    <div className="toolbar">
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Color:</span>
        <input
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          aria-label="current-color"
        />
      </label>
      <button onClick={onClear}>Clear</button>
      <button onClick={onExport}>Export PNG</button>
    </div>
  );
};
