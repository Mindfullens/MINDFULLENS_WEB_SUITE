import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import './index.css';
import { installAntiCopyGuards } from './security/antiCopyGuard';

const removeAntiCopyGuards = installAntiCopyGuards();

// --- INJECTED ERROR LOGGER FOR DIAGNOSTICS ---
const errorDiv = document.createElement('div');
errorDiv.style.cssText = 'position:fixed;top:12px;left:12px;z-index:999999;background:rgba(255,0,0,0.85);color:white;font-family:monospace;font-size:14px;line-height:1.4;pointer-events:none;white-space:pre-wrap;padding:12px;border-radius:8px;max-width:min(92vw,820px);display:none;';
document.body.appendChild(errorDiv);
let recentErrors = [];

function shouldIgnoreDiagnosticNoise(message) {
  const safe = String(message || '').toLowerCase();
  return (
    safe.includes('chext_driver') ||
    safe.includes('content security policy') ||
    safe.includes('lockdown-install.js') ||
    safe.includes('ses removing unpermitted intrinsics') ||
    safe.includes('permissions policy violation') ||
    safe.includes('download the react devtools')
  );
}

function logError(msg) {
  const safeMsg = msg && typeof msg === 'object' ? (msg.message || JSON.stringify(msg)) : String(msg);
  if (shouldIgnoreDiagnosticNoise(safeMsg)) return; // Ignore extension/Vite/devtools noise
  recentErrors.unshift(safeMsg);
  if (recentErrors.length > 5) recentErrors.pop();
  errorDiv.style.display = recentErrors.length > 0 ? 'block' : 'none';
  errorDiv.innerText = recentErrors.join('\n\n');
}
window.addEventListener('error', (e) => logError(`[Window Error]: ${e.message} \n at ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => logError(`[Promise Error]: ${e.reason}`));
const origError = console.error;
console.error = (...args) => {
  logError(`[Console Error]: ${args.map(a => typeof a === 'object' && a !== null ? (a.message || JSON.stringify(a)) : a).join(' ')}`);
  origError(...args);
};
// ------------------------------------------

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    removeAntiCopyGuards();
  });
}
