// PURPOSE: Shared premium dark shell for login and signup.
import { Box, Card, CardContent, CircularProgress, Typography } from '@mui/material';
import Logo from '../common/Logo';
import { NAVY } from '../../theme';

const CARD = '#151C2C';
const BORDER = 'rgba(148,163,184,0.16)';
const MUTED = '#94A3B8';
const TEXT = '#E2E8F0';

export const authInputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2,
    bgcolor: 'rgba(11,18,32,0.7)',
    color: TEXT,
    '& fieldset': { borderColor: BORDER },
    '&:hover fieldset': { borderColor: 'rgba(56,189,248,0.45)' },
    '&.Mui-focused fieldset': { borderColor: '#38BDF8', borderWidth: 2 },
    '&.Mui-focused': { boxShadow: '0 0 0 3px rgba(56,189,248,0.16)' },
  },
  '& .MuiInputLabel-root': { color: MUTED },
  '& .MuiInputLabel-root.Mui-focused': { color: '#38BDF8' },
  '& .MuiFormHelperText-root': { color: MUTED },
};

export default function AuthShell({ title, subtitle, loading, children }) {
  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: NAVY }}>
        <CircularProgress sx={{ color: '#38BDF8' }} />
      </Box>
    );
  }

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      p: 2,
      bgcolor: NAVY,
      backgroundImage: `
        radial-gradient(ellipse 70% 50% at 50% -10%, rgba(11,110,153,0.28) 0%, transparent 55%),
        radial-gradient(ellipse 40% 35% at 90% 100%, rgba(15,157,138,0.12) 0%, transparent 50%)
      `,
    }}>
      <Card sx={{
        maxWidth: 420,
        width: '100%',
        borderRadius: 3,
        bgcolor: CARD,
        border: `1px solid ${BORDER}`,
        boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
      }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Logo height={48} sx={{ mx: 'auto', mb: 2 }} />
            <Typography variant="overline" sx={{ color: '#38BDF8', letterSpacing: '0.12em', fontWeight: 700 }}>
              SWARM by nanoFarm
            </Typography>
            <Typography variant="body2" sx={{ color: MUTED, mt: 0.5 }}>
              Industrial IoT plant monitoring
            </Typography>
          </Box>
          {title && (
            <Typography variant="h6" fontWeight={700} sx={{ color: TEXT, textAlign: 'center', mb: 0.5 }}>
              {title}
            </Typography>
          )}
          {subtitle && (
            <Typography variant="body2" sx={{ color: MUTED, textAlign: 'center', mb: 3 }}>
              {subtitle}
            </Typography>
          )}
          {children}
        </CardContent>
      </Card>
    </Box>
  );
}

export const AUTH_COLORS = { muted: MUTED, text: TEXT, border: BORDER, accent: '#38BDF8' };
