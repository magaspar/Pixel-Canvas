

// Polyfill global for browser
if (typeof global === 'undefined') {
  // @ts-ignore
  window.global = window;
}
// Polyfill process for browser
// Polyfill process for browser and Metaplex/crypto-browserify
if (typeof window.process === 'undefined' || typeof window.process.version === 'undefined') {
  // @ts-ignore
  window.process = { env: {}, version: 'v18.0.0' };
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.tsx';
import './global.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
