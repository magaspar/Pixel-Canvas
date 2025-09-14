import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelGrid } from './components/PixelGrid.tsx';
import { Toolbar } from './components/Toolbar.tsx';

import './app.css';
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import {
  WalletModalProvider,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import "./App.css";
import "@solana/wallet-adapter-react-ui/styles.css";

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

export const AppContent: React.FC = () => {
  const walletCtx = useWallet();
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
    const SCALE = 20;
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH * SCALE;
    canvas.height = HEIGHT * SCALE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const i = y * WIDTH + x;
        ctx.fillStyle = data.pixels[i];
        ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
      }
    }
    const link = document.createElement('a');
    link.download = 'pixel-art.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [data]);

  // Mint NFT handler
  const handleMintNFT = async () => {
    try {
      if (!walletCtx.connected || !walletCtx.publicKey) throw new Error('Wallet not connected');
      // 1. Convert pixel grid to PNG
      const SCALE = 20;
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH * SCALE;
      canvas.height = HEIGHT * SCALE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas context');
      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const i = y * WIDTH + x;
          ctx.fillStyle = data.pixels[i];
          ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
        }
      }
      const dataUrl = canvas.toDataURL('image/png');

      // 2. Generate random 5-letter name
      const randomName = Array.from({length: 5}, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('').toUpperCase();

      // 3. Upload PNG to Arweave/IPFS via Metaplex
      const { Metaplex, walletAdapterIdentity, irysStorage } = await import('@metaplex-foundation/js');
      const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=92f5ec77-69d5-4c15-b27f-f70fce0cc595');
      const metaplex = Metaplex.make(connection)
        .use(walletAdapterIdentity(walletCtx))
        .use(irysStorage());

  
      const { uri: imageUri } = await metaplex.nfts().uploadMetadata({
        name: randomName,
        image: dataUrl,
        description: 'Pixel art NFT from Pixel Canvas',
        seller_fee_basis_points: 0,
      });

      // Check if Arweave URL is accessible before minting
      //TODO
      const checkUrl = async (url: string) => {
        try {
          const res = await fetch(url, { method: 'HEAD' });
          return res.ok;
        } catch {
          return false;
        }
      };
      const isAccessible = await checkUrl(imageUri);
      if (!isAccessible) {
        throw new Error('Metadata upload failed or not yet available on Arweave. Please retry in a few moments.');
      }

      // Mint NFT
      const mintResult = await metaplex.nfts().create({
        uri: imageUri,
        name: randomName,
        sellerFeeBasisPoints: 0,
        symbol: 'PXCAN',
        creators: [{ address: walletCtx.publicKey, share: 100 }],
      });

      alert(`NFT minted! Name: ${randomName}`);
    } catch (e) {
      alert('Mint failed: ' + (e as Error).message);
    }
  };

  return (
    <div className="app" ref={containerRef}>
      <h1>Pixel Canvas 32x32</h1>
      <WalletMultiButton style={{ marginBottom: 16 }} />
      <button style={{ marginBottom: 16 }} onClick={handleMintNFT}>
        Mint NFT
      </button>
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

function App() {
  const network = WalletAdapterNetwork.Mainnet;
  const endpoint = useMemo(() => 'https://mainnet.helius-rpc.com/?api-key=92f5ec77-69d5-4c15-b27f-f70fce0cc595', []);
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div className="content-container">
            <AppContent />
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
export { App };