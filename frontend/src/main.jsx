// PURPOSE: Vite entry that mounts the SWARM React application.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ColorModeProvider } from './context/ColorModeContext';
import './styles/responsive.css';
import './styles/nova-keyframes.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ColorModeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ColorModeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
