// PURPOSE: Light/dark colour mode for the SWARM MUI theme.
import { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { createSwarmTheme } from '../theme';

const STORAGE_KEY = 'swarm-color-mode';
const ColorModeContext = createContext(null);

export function useColorMode() {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error('useColorMode must be used within ColorModeProvider');
  return ctx;
}

export function ColorModeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      /* ignore */
    }
    return 'light';
  });

  const toggleColorMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const theme = useMemo(() => createSwarmTheme(mode), [mode]);

  return (
    <ColorModeContext.Provider value={{ mode, toggleColorMode }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
