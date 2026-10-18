import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import 'leaflet/dist/leaflet.css';
import './index.css';
import './window.css';

// The site is always dark; this also drops any light theme saved by older builds.
document.documentElement.dataset.theme = 'dark';
try { localStorage.removeItem('theme'); } catch (e) { /* storage unavailable */ }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
