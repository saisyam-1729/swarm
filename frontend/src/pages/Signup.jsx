// PURPOSE: Account signup screen.
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  TextField, Button, Typography, Alert, InputAdornment, IconButton, Link,
  CircularProgress, Divider,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { networkErrorMessage } from '../utils/networkError';
import { loadSsoConfig, redirectToSso } from '../utils/sso';
import AuthShell, { authInputSx, AUTH_COLORS } from '../components/auth/AuthShell';

export default function Signup() {
  const [form, setForm] = useState({
    name: '', email: '', mobile: '', password: '', confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [checkingSso, setCheckingSso] = useState(true);
  const [ssoAvailable, setSsoAvailable] = useState(false);
  const { signup, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadSsoConfig()
      .then((config) => setSsoAvailable(!!config?.saasEnabled))
      .catch(() => {})
      .finally(() => setCheckingSso(false));
  }, []);

  const handleEmpowerSignUp = async () => {
    setError('');
    try {
      const redirected = await redirectToSso('signup');
      if (!redirected) {
        setError('emPOWER sign-up is not available. Use the form below.');
      }
    } catch {
      setError('Unable to start emPOWER sign-up. Use the form below.');
    }
  };

  const updateField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      const result = await signup({
        name: form.name.trim(),
        email: form.email.trim(),
        mobile: form.mobile.trim() || undefined,
        password: form.password,
      });
      if (result?.pending) {
        navigate('/login', { state: { pendingApproval: true } });
        return;
      }
      navigate('/dashboard');
    } catch (err) {
      const networkMsg = networkErrorMessage(err);
      if (networkMsg) {
        setError(networkMsg);
      } else {
        const apiMessage = err.response?.data?.message;
        const fieldErrors = err.response?.data?.data;
        if (fieldErrors && typeof fieldErrors === 'object') {
          setError(Object.values(fieldErrors).join('. '));
        } else {
          setError(apiMessage || 'Unable to create account. Please try again.');
        }
      }
    }
  };

  return (
    <AuthShell
      loading={checkingSso}
      title="Create your account"
      subtitle="Join SWARM to monitor plant health, view alerts, and connect devices."
    >
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

      {ssoAvailable && (
        <>
          <Button
            fullWidth variant="outlined" size="large" onClick={handleEmpowerSignUp}
            sx={{
              py: 1.5, borderRadius: 2, fontWeight: 600, textTransform: 'none',
              color: AUTH_COLORS.text, borderColor: AUTH_COLORS.border,
              '&:hover': { borderColor: AUTH_COLORS.accent, bgcolor: 'rgba(56,189,248,0.08)' },
            }}
          >
            Sign up with emPOWER account
          </Button>
          <Divider sx={{ my: 2.5, borderColor: AUTH_COLORS.border }}>
            <Typography variant="caption" sx={{ color: AUTH_COLORS.muted }}>or</Typography>
          </Divider>
        </>
      )}

      <form onSubmit={handleSubmit}>
        <TextField fullWidth label="Full name" margin="normal" value={form.name} onChange={updateField('name')} required sx={authInputSx} />
        <TextField fullWidth label="Email" type="email" margin="normal" value={form.email} onChange={updateField('email')} required sx={authInputSx} />
        <TextField fullWidth label="Mobile (optional)" type="tel" margin="normal" value={form.mobile} onChange={updateField('mobile')} sx={authInputSx} />
        <TextField
          fullWidth label="Password" type={showPassword ? 'text' : 'password'} margin="normal"
          value={form.password} onChange={updateField('password')} required
          helperText="At least 6 characters" sx={authInputSx}
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
        <TextField
          fullWidth label="Confirm password" type={showConfirmPassword ? 'text' : 'password'} margin="normal"
          value={form.confirmPassword} onChange={updateField('confirmPassword')} required sx={authInputSx}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => setShowConfirmPassword(!showConfirmPassword)} edge="end" sx={{ color: AUTH_COLORS.accent }}>
                  {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <Button
          fullWidth type="submit" variant="contained" size="large" disabled={loading}
          sx={{ mt: 2.5, py: 1.5, borderRadius: 2, fontWeight: 700, textTransform: 'none' }}
        >
          {loading ? <CircularProgress size={24} /> : 'Create Account'}
        </Button>
      </form>

      <Divider sx={{ my: 2.5, borderColor: AUTH_COLORS.border }} />
      <Typography variant="body2" sx={{ textAlign: 'center', color: AUTH_COLORS.muted }}>
        Already have an account?{' '}
        <Link component={RouterLink} to="/login" fontWeight={700} sx={{ color: AUTH_COLORS.accent }}>
          Sign in
        </Link>
      </Typography>
    </AuthShell>
  );
}
