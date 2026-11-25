// PURPOSE: Email/password (and optional SSO) sign-in screen.
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, TextField, Button, Typography, Alert, InputAdornment, IconButton, Link,
  CircularProgress, Divider,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { loginErrorMessage } from '../utils/networkError';
import { loadSsoConfig, redirectToSso } from '../utils/sso';
import { getHomeRoute } from '../utils/homeRoute';
import AuthShell, { authInputSx, AUTH_COLORS } from '../components/auth/AuthShell';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [forgotMode, setForgotMode] = useState(false);
  const [success, setSuccess] = useState('');
  const [checkingSso, setCheckingSso] = useState(true);
  const [ssoAvailable, setSsoAvailable] = useState(false);
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.state?.pendingApproval) {
      setSuccess('Registration received. Control Center must approve your account before you can sign in.');
    }
  }, [location.state]);

  useEffect(() => {
    loadSsoConfig()
      .then((config) => setSsoAvailable(!!config?.saasEnabled))
      .catch(() => {})
      .finally(() => setCheckingSso(false));
  }, []);

  const handleEmpowerSignIn = async () => {
    setError('');
    try {
      const redirected = await redirectToSso('login');
      if (!redirected) {
        setError('emPOWER sign-in is not available. Use email and password below.');
      }
    } catch {
      setError('Unable to start emPOWER sign-in. Use email and password below.');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    // UX-CHANGE UX-03: clear the sign-up success banner on submit (original only cleared the error).
    setSuccess('');
    try {
      const loggedIn = await login(email, password);
      navigate(getHomeRoute(loggedIn.role));
    } catch (err) {
      setError(loginErrorMessage(err));
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError('');
    // UX-CHANGE UX-03: clear any previous success banner on submit (original only cleared the error).
    setSuccess('');
    try {
      const { authAPI } = await import('../services/api');
      await authAPI.forgotPassword({ email });
      setSuccess('Password reset link sent to your email');
      setForgotMode(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send reset link');
    }
  };

  return (
    <AuthShell
      loading={checkingSso}
      title={forgotMode ? 'Reset password' : 'Welcome back'}
      subtitle={forgotMode ? 'Enter your email for a reset link' : 'Sign in to your account'}
    >
      {import.meta.env.DEV
        && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
          LAN access from other computers: use the host PC&apos;s network URL, not localhost.
        </Alert>
      )}

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}

      {!forgotMode && ssoAvailable && (
        <>
          <Button
            fullWidth variant="outlined" size="large" onClick={handleEmpowerSignIn}
            sx={{
              py: 1.5, borderRadius: 2, fontWeight: 600, textTransform: 'none',
              color: AUTH_COLORS.text, borderColor: AUTH_COLORS.border,
              '&:hover': { borderColor: AUTH_COLORS.accent, bgcolor: 'rgba(56,189,248,0.08)' },
            }}
          >
            Sign in with emPOWER account
          </Button>
          <Divider sx={{ my: 2.5, borderColor: AUTH_COLORS.border }}>
            <Typography variant="caption" sx={{ color: AUTH_COLORS.muted }}>or</Typography>
          </Divider>
        </>
      )}

      <form onSubmit={forgotMode ? handleForgot : handleLogin}>
        <TextField
          fullWidth label="Email" type="email" margin="normal"
          value={email} onChange={(e) => setEmail(e.target.value)} required sx={authInputSx}
        />
        {!forgotMode && (
          <TextField
            fullWidth label="Password" type={showPassword ? 'text' : 'password'} margin="normal"
            value={password} onChange={(e) => setPassword(e.target.value)} required sx={authInputSx}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" sx={{ color: AUTH_COLORS.accent }}>
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        )}
        <Button
          fullWidth type="submit" variant="contained" size="large" disabled={loading}
          sx={{ mt: 2.5, py: 1.5, borderRadius: 2, fontWeight: 700, textTransform: 'none' }}
        >
          {loading ? <CircularProgress size={24} /> : forgotMode ? 'Send Reset Link' : 'Sign In'}
        </Button>
      </form>

      <Box sx={{ mt: 2, textAlign: 'center' }}>
        <Link
          component="button" variant="body2" type="button"
          onClick={() => { setForgotMode(!forgotMode); setError(''); setSuccess(''); }}
          sx={{ color: AUTH_COLORS.accent, fontWeight: 600 }}
        >
          {forgotMode ? 'Back to Login' : 'Forgot Password?'}
        </Link>
      </Box>

      {!forgotMode && (
        <>
          <Divider sx={{ my: 2.5, borderColor: AUTH_COLORS.border }} />
          <Typography variant="body2" sx={{ textAlign: 'center', color: AUTH_COLORS.muted }}>
            Don&apos;t have an account?{' '}
            <Link component={RouterLink} to="/signup" fontWeight={700} sx={{ color: AUTH_COLORS.accent }}>
              Sign up
            </Link>
          </Typography>
        </>
      )}
    </AuthShell>
  );
}
