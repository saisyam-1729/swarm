// PURPOSE: Vite entry that mounts the SWARM React application.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ColorModeProvider } from './context/ColorModeContext';
// UX-CHANGE UX-01/02: in-app confirm dialog + toasts (replaces window.confirm / window.alert).
import { FeedbackProvider } from './context/FeedbackContext';
import './styles/responsive.css';
import './styles/nova-keyframes.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ColorModeProvider>
        <AuthProvider>
          <FeedbackProvider>
            <App />
          </FeedbackProvider>
        </AuthProvider>
      </ColorModeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
