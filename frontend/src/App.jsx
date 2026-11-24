import { BrowserRouter } from 'react-router-dom';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import AppRoutes from './AppRoutes.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import NotificationProvider from './notifications/NotificationProvider.jsx';
import theme from './theme.js';

/**
 * Application root: theme, CSS baseline, router, snackbar notifications and auth.
 * @returns {JSX.Element} The app.
 */
export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <NotificationProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </NotificationProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
