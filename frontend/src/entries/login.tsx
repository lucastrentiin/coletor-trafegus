import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/globals.css';
import { applyTheme } from '@/hooks/useTheme';
import { LoginPage } from '@/screens/LoginPage';

applyTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LoginPage />
  </StrictMode>,
);
