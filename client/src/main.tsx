import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Auto-recover from deployment chunk / MIME type mismatches
window.addEventListener('error', (event) => {
  const msg = event.message || '';
  if (
    msg.includes('text/html') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('dynamically imported module') ||
    msg.includes('Loading chunk')
  ) {
    const reloaded = sessionStorage.getItem('chunk_auto_reload');
    if (!reloaded) {
      sessionStorage.setItem('chunk_auto_reload', 'true');
      window.location.reload();
    }
  }
});

// Clear auto-reload lock once successfully loaded
window.addEventListener('load', () => {
  sessionStorage.removeItem('chunk_auto_reload');
});

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
