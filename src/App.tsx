import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelGrid } from './components/PixelGrid.tsx';

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
import { Connection } from "@solana/web3.js";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import "./App.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { isNull } from 'util';

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
  const [isMinting, setIsMinting] = useState(false);
  const [mintStatus, setMintStatus] = useState<string>("");
  const [successInfo, setSuccessInfo] = useState<null | { name: string; mint: string; image: string; metadata: string }>(null);
  const [errorInfo, setErrorInfo] = useState<null | { message: string }>(null);
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

  // Mint NFT handler (robust pipeline: draw -> image upload -> metadata upload -> availability check -> mint)
  const handleMintNFT = async () => {
    const PHASE_PREFIX = '[mint]';
    const log = (...args: any[]) => console.info(PHASE_PREFIX, ...args);
    const warn = (...args: any[]) => console.warn(PHASE_PREFIX, ...args);
    const fail = (msg: string) => { throw new Error(msg); };
    try {
      setIsMinting(true);
      setMintStatus('Starting mint...');
      log('start');
      if (!walletCtx.connected || !walletCtx.publicKey) fail('Wallet not connected');

      // 1. Draw current pixel data to an offscreen canvas with better quality
      log('phase=draw-canvas');
      setMintStatus('Rendering your pixel art...');
      const SCALE = 20;
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH * SCALE;
      canvas.height = HEIGHT * SCALE;
      const ctx = canvas.getContext('2d');
      if (!ctx) fail('No canvas context');
      
      // Ensure crisp pixel art rendering
      ctx!.imageSmoothingEnabled = false;
      (ctx as any).webkitImageSmoothingEnabled = false;
      
      // Fill background with white to ensure visibility
      ctx!.fillStyle = '#FFFFFF';
      ctx!.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw pixels
      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const i = y * WIDTH + x;
          const color = data.pixels[i];
          // Skip transparent/empty pixels, keep white background
          if (color && color !== 'transparent' && color !== 'rgba(0,0,0,0)') {
            ctx!.fillStyle = color;
            ctx!.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
          }
        }
      }
      
      // Generate high-quality PNG
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      log('phase=draw-canvas complete, dataUrl length=%d', dataUrl.length);

      // 2. Random name
      const randomName = Array.from({ length: 5 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
      log('phase=prepare name=%s', randomName);

      // 3. Setup Metaplex
      log('phase=setup-metaplex');
      setMintStatus('Connecting to network...');
      const { Metaplex, walletAdapterIdentity, irysStorage, toMetaplexFile } = await import('@metaplex-foundation/js');
      const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=92f5ec77-69d5-4c15-b27f-f70fce0cc595');
      const metaplex = Metaplex.make(connection)
        .use(walletAdapterIdentity(walletCtx))
        .use(irysStorage());

      // 4. Convert data URL -> Metaplex file & upload (image first)
      log('phase=upload-image start');
      setMintStatus('Uploading image to Arweave...');
      const dataUrlToBytes = (url: string) => {
        const [meta, b64] = url.split(',');
        if (!b64) throw new Error('Invalid data URL');
        const mimeMatch = /data:(.*);base64/.exec(meta);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        
        // Validate it's a PNG
        if (mime !== 'image/png') {
          throw new Error(`Expected PNG format, got: ${mime}`);
        }
        
        const binary = atob(b64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
        
        // Validate PNG magic bytes
        if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4E || bytes[3] !== 0x47) {
          throw new Error('Invalid PNG format - missing PNG signature');
        }
        
        log('PNG validation passed, size=%d bytes', bytes.length);
        return { bytes, mime };
      };
      
      const { bytes, mime } = dataUrlToBytes(dataUrl);
      const imageFile = toMetaplexFile(bytes, `${randomName}.png`, { 
        contentType: 'image/png',
        displayName: `${randomName}.png`
      });
      
      log('uploading image file: %s (%d bytes)', imageFile.displayName, bytes.length);
      const imageUri = await metaplex.storage().upload(imageFile);
      log('phase=upload-image success uri=%s', imageUri);
      
      // 4.5. Give Arweave time to propagate the image (avoid CORS issues with direct checks)
      log('phase=image-propagation-delay start');
      setMintStatus('Waiting for image propagation...');
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
      log('phase=image-propagation-delay complete');

      // 5. Upload metadata referencing the image URI with retry logic
      log('phase=upload-metadata start');
      setMintStatus('Preparing metadata...');
      let metadataUri: string = '';
      const maxMetadataRetries = 3;
      
      for (let attempt = 1; attempt <= maxMetadataRetries; attempt++) {
        try {
          log(`metadata upload attempt ${attempt}/${maxMetadataRetries}`);
          setMintStatus(`Uploading metadata (${attempt}/${maxMetadataRetries})...`);
          
          const metadataObject = {
            name: randomName,
            symbol: 'PXCAN',
            description: 'Pixel art NFT from Pixel Canvas',
            image: imageUri + '?ext=png',
            seller_fee_basis_points: 0,
            properties: {
              files: [
                { uri: imageUri + '?ext=png', type: mime }
              ],
              category: null
            }
          };
          
          log('metadata object:', JSON.stringify(metadataObject, null, 2));
          
          const result = await metaplex.nfts().uploadMetadata(metadataObject);
          metadataUri = result.uri;
          log('phase=upload-metadata success uri=%s', metadataUri);
          break;
        } catch (e) {
          warn(`metadata upload attempt ${attempt} failed:`, e);
          if (attempt === maxMetadataRetries) {
            throw new Error(`Metadata upload failed after ${maxMetadataRetries} attempts: ${(e as Error).message}`);
          }
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Increasing delay
        }
      }

      // 6. Give Arweave more time to propagate the metadata
      log('phase=metadata-propagation-delay start');
      setMintStatus('Waiting for metadata propagation...');
      await new Promise(resolve => setTimeout(resolve, 8000)); // 8 second delay for metadata
      log('phase=metadata-propagation-delay complete');

      // 7. Mint NFT using metadata URI (NOT image URI)
      log('phase=mint start');
      setMintStatus('Sending mint transaction... Approve in your wallet');
      const mintResult = await metaplex.nfts().create({
        uri: metadataUri,
        name: randomName,
        sellerFeeBasisPoints: 0,
        symbol: 'PXCAN',
        creators: [{ address: walletCtx.publicKey!, share: 100 }],
        isMutable: true,
        tokenStandard: 4,
      });
      log('phase=mint success mint=%s', mintResult.mintAddress.toBase58());
      setMintStatus('Finalizing...');
      setSuccessInfo({
        name: randomName,
        mint: mintResult.mintAddress.toBase58(),
        image: imageUri,
        metadata: metadataUri,
      });
    } catch (e) {
      warn('error', e);
      const error = e as Error;
      let errorMessage = 'Mint failed: ' + error.message;
      
      // Check for common Arweave/upload related errors
      if (error.message.includes('upload') || error.message.includes('storage') || error.message.includes('Arweave')) {
        errorMessage += '\n\nThis appears to be a storage/upload issue. Please check your internet connection and try again.';
      } else if (error.message.includes('wallet') || error.message.includes('signature')) {
        errorMessage += '\n\nThis appears to be a wallet issue. Please check your wallet connection and try again.';
      }
      
      setErrorInfo({ message: errorMessage });
    }
    finally {
      setIsMinting(false);
      setMintStatus('');
    }
  };


  return (
    <div className="win95-window" ref={containerRef}>
      <div className="win95-titlebar">
        <span className="title">Pixel Canvas 32x32</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <WalletMultiButton
            style={{
              background: '#dcdfe3',
              border: '2px solid #7b7b7b',
              borderRightColor: '#fff',
              borderBottomColor: '#fff',
              padding: '4px 14px',
              fontSize: 13,
              fontFamily: 'inherit',
              boxShadow: 'none',
              height: 32,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer'
            }}
          />
        </div>
      </div>
      <div className="win95-toolbar">
        <div className="win95-toolbar-group" style={{ flex: '1 1 auto' }}>
          <button className="win95-btn" onClick={handleMintNFT} disabled={isMinting} aria-busy={isMinting}>
            {isMinting ? 'Minting…' : 'Mint NFT'}
          </button>
          <button className="win95-btn" onClick={handleClear}>Clear</button>
          <button className="win95-btn" onClick={exportPNG}>Export PNG</button>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12 }}>Color</span>
            <input className="win95-color" type="color" value={currentColor} onChange={e => setCurrentColor(e.target.value)} />
          </label>
        </div>
      </div>
      <div className="canvas-wrapper">
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
      <div className="status-bar">
        <div>{data.width}x{data.height} pixels</div>
        <div>Color: {currentColor.toUpperCase()}</div>
      </div>
      {isMinting && (
        <div className="mint-overlay" role="alert" aria-live="assertive">
          <div className="mint-card">
            <div className="mint-title">Minting in progress</div>
            <div className="mint-progress">
              <div className="bar" />
            </div>
            <div className="mint-subtext">{mintStatus || 'Please wait…'}</div>
          </div>
        </div>
      )}
      {/* Success Modal */}
      {successInfo && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-title">NFT Minted Successfully</div>
            <div className="modal-body">
              <div><strong>Name:</strong> {successInfo.name}</div>
              <div><strong>Mint:</strong> <a href={`https://solscan.io/address/${successInfo.mint}`} target="_blank" rel="noreferrer">{successInfo.mint}</a></div>
              <div><strong>Image:</strong> <a href={successInfo.image} target="_blank" rel="noreferrer">Open image</a></div>
              <div><strong>Metadata:</strong> <a href={successInfo.metadata} target="_blank" rel="noreferrer">Open metadata</a></div>
            </div>
            <div className="modal-actions">
              <button className="win95-btn" onClick={() => setSuccessInfo(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {/* Error Modal */}
      {errorInfo && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-title">Mint Failed</div>
            <div className="modal-body">
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{errorInfo.message}</pre>
            </div>
            <div className="modal-actions">
              <button className="win95-btn" onClick={() => setErrorInfo(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function App() {
  // const network = WalletAdapterNetwork.Mainnet;
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