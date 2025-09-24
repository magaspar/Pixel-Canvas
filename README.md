# Pixel Canvas

Simple 32x32 pixel drawing app built with React + TypeScript + Vite.

## Features
- 32x32 grid
- Click & drag to paint
- Color picker
- LocalStorage autosave
- Clear canvas
- Export to PNG (nearest-neighbor, crisp)

## Development
Install deps and start dev server:

```bash
npm install
npm run dev
```
## Minting loader overlay

During the mint process, a Win95-style overlay appears with an animated progress bar and step-by-step status text. This is controlled in `src/App.tsx` via the `isMinting` and `mintStatus` state variables. Styling is in `src/app.css` under the `.mint-overlay`, `.mint-card`, and `.mint-progress` classes.

To customize messages, adjust `setMintStatus(...)` calls throughout the `handleMintNFT` function. To change visuals, tweak the CSS for the overlay.

## Testing
```bash
npm test
```

---
MIT License
