import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import theme from './styles/theme.js';

// CssBaseline replaces the Vite starter's index.css -- that stylesheet centres
// the body with flex, which fights every page layout in the app.
//
// BrowserRouter gives clean URLs (/login, /dashboard). Deep links and refreshes
// survive because CloudFront runs a viewer-request function (see
// infra/cloudfront.tf) that rewrites extensionless paths to /index.html, so S3
// never 403s on a client route.
//
// Provider order matters: the router must wrap AuthProvider, because the auth
// flow navigates; AuthProvider must wrap App, because every route guard reads
// the session.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
