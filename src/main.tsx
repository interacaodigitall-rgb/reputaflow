import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initConditionalPWA } from './lib/pwaManager';

// Conditionally register PWA manifest and service worker (omitted on ?b= review page)
initConditionalPWA();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
