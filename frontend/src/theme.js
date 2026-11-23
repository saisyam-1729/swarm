// PURPOSE: MUI light/dark theme tokens for the SWARM industrial IoT identity.
import { createTheme, alpha } from '@mui/material/styles';

const NAVY = '#0B1220';
const SLATE = '#151C2C';
const PRIMARY = '#0B6E99';
const PRIMARY_DARK = '#38BDF8';
const SECONDARY = '#0F9D8A';
const FONT = '"Inter", "Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif';
const MONO = '"IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", monospace';

function sharedComponents(mode) {
  const isDark = mode === 'dark';
  return {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11"',
        },
        code: { fontFamily: MONO },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: `1px solid ${isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)'}`,
          boxShadow: isDark
            ? '0 1px 2px rgba(0,0,0,0.35)'
            : '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.04)',
          backgroundImage: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 6 },
        sizeSmall: { height: 22, fontSize: '0.7rem' },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          fontSize: '0.75rem',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: isDark ? '#94A3B8' : '#64748B',
          backgroundColor: isDark ? alpha('#fff', 0.02) : '#F8FAFC',
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          maxWidth: '100%',
        },
      },
    },
    MuiTabs: {
      defaultProps: {
        variant: 'scrollable',
        scrollButtons: 'auto',
        allowScrollButtonsMobile: true,
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme: t }) => ({
          margin: t.spacing(2),
          width: 'calc(100% - 32px)',
          maxWidth: '100%',
          [t.breakpoints.up('sm')]: {
            margin: t.spacing(4),
            width: 'auto',
            maxWidth: 600,
          },
        }),
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          padding: t.spacing(2),
          '&:last-child': { paddingBottom: t.spacing(2) },
          [t.breakpoints.up('sm')]: {
            padding: t.spacing(2.5),
            '&:last-child': { paddingBottom: t.spacing(2.5) },
          },
        }),
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { fontSize: '0.75rem', fontWeight: 500 },
      },
    },
  };
}

export function createSwarmTheme(mode = 'light') {
  const isDark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: {
        main: isDark ? PRIMARY_DARK : PRIMARY,
        light: isDark ? '#7DD3FC' : '#3B9BC4',
        dark: isDark ? '#0284C7' : '#085A7A',
        contrastText: isDark ? NAVY : '#FFFFFF',
      },
      secondary: {
        main: isDark ? '#2DD4BF' : SECONDARY,
        contrastText: isDark ? NAVY : '#FFFFFF',
      },
      error: { main: isDark ? '#F87171' : '#DC2626' },
      warning: { main: isDark ? '#FBBF24' : '#D97706' },
      success: { main: isDark ? '#34D399' : '#059669' },
      info: { main: isDark ? '#38BDF8' : PRIMARY },
      background: {
        default: isDark ? NAVY : '#F4F6F9',
        paper: isDark ? SLATE : '#FFFFFF',
      },
      text: {
        primary: isDark ? '#E2E8F0' : '#0F172A',
        secondary: isDark ? '#94A3B8' : '#64748B',
      },
      divider: isDark ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.08)',
      navy: NAVY,
    },
    typography: {
      fontFamily: FONT,
      h4: { fontWeight: 700, letterSpacing: '-0.02em' },
      h5: { fontWeight: 700, letterSpacing: '-0.02em' },
      h6: { fontWeight: 600, letterSpacing: '-0.015em' },
      subtitle1: { fontWeight: 600 },
      subtitle2: { fontWeight: 600 },
      button: { fontWeight: 600 },
      overline: { letterSpacing: '0.12em', fontWeight: 700 },
    },
    shape: { borderRadius: 12 },
    components: sharedComponents(mode),
  });
}

const theme = createSwarmTheme('light');
export default theme;
export { FONT, MONO, NAVY, SLATE };
