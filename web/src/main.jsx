import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles.css';
import { App } from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { MetaProvider } from './context/MetaContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { RealtimeProvider } from './context/RealtimeContext.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <MetaProvider>
          <ToastProvider>
            <RealtimeProvider>
              <App />
            </RealtimeProvider>
          </ToastProvider>
        </MetaProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
