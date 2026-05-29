import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');

if (container) {
  console.log("Mounting Eco-Smart Poultry Portal...");
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log("Portal Initialized.");
} else {
  console.error("Fatal Error: Root container 'root' not found in HTML.");
}