// PURPOSE: Control Center page for tenant onboarding and plant assignment.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Button, Table, TableBody, TableCell,
  TableHead, TableRow, Chip, CircularProgress, Alert, TextField, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { Add, ChevronRight } from '@mui/icons-material';
import { controlCenterAPI } from '../../services/api';
import { useFeedback } from '../../context/FeedbackContext';

const FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'READY', label: 'Ready' },
  { id: 'NEEDS_ADMIN', label: 'Need admin' },
  { id: 'NEEDS_PLANTS', label: 'Need plants' },
  { id: 'DISABLED', label: 'Disabled' },
];

const stateChip = (state) => {
  if (state === 'READY') return { label: 'Ready', color: 'success' };
  if (state === 'NEEDS_ADMIN') return { label: 'Need Super Admin', color: 'warning' };
  if (state === 'NEEDS_PLANTS') return { label: 'Need plants', color: 'info' };
  if (state === 'DISABLED') return { label: 'Disabled', color: 'default' };
  return { label: state || '—', color: 'default' };
};

export default function Companies() {
  const { confirm } = useFeedback();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const filter = searchParams.get('filter') || 'ALL';

  const load = () => {
    setLoading(true);
    controlCenterAPI.listCompanies()
      .then(({ data }) => setCompanies(data.data || []))
      .catch((e) => setError(e.response?.data?.message || 'Failed to load companies'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    setSaving(true);
    setError('');
    try {
      const { data } = await controlCenterAPI.createCompany({ name });
      setOpen(false);
      setName('');
      const id = data.data?.id;
      if (id) navigate(`/companies/${id}`);
      else load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to create company');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (c) => {
    try {
      if (c.status === 'ACTIVE') await controlCenterAPI.disableCompany(c.id);
      else await controlCenterAPI.enableCompany(c.id);
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to update company');
    }
  };

  const removeCompany = async (c) => {
    // UX-CHANGE UX-01 (in-app confirm). Original: if (!window.confirm(`Delete tenant "${c.name}"? Plants stay in inventory; users are unlinked.`)) return;
    if (!(await confirm({ title: 'Delete tenant?', message: `Delete tenant "${c.name}"? Plants stay in inventory; users are unlinked.`, confirmText: 'Delete tenant', danger: true }))) return;
    try {
      await controlCenterAPI.deleteCompany(c.id);
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to delete company');
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      if (filter !== 'ALL' && c.onboardingState !== filter) return false;
      if (!q) return true;
      return [c.name, c.superAdminEmail, c.superAdminName].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [companies, filter, query]);

  if (loading) return <CircularProgress />;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Tenants</Typography>
          <Typography variant="body2" color="text.secondary">Each company is an isolated Swarm customer.</Typography>
        </Box>
        <Button startIcon={<Add />} variant="contained" onClick={() => setOpen(true)}>New tenant</Button>
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }} alignItems={{ sm: 'center' }}>
        <TextField size="small" placeholder="Search name or admin email" value={query} onChange={(e) => setQuery(e.target.value)} sx={{ minWidth: 260 }} />
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {FILTERS.map((f) => (
            <Chip
              key={f.id}
              label={f.label}
              color={filter === f.id ? 'primary' : 'default'}
              variant={filter === f.id ? 'filled' : 'outlined'}
              onClick={() => setSearchParams(f.id === 'ALL' ? {} : { filter: f.id })}
            />
          ))}
        </Stack>
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      <Card>
        <CardContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Company</TableCell>
                <TableCell>Tenant ID</TableCell>
                <TableCell>Onboarding</TableCell>
                <TableCell>Super Admin</TableCell>
                <TableCell>Plants</TableCell>
                <TableCell>Users</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>No tenants match. Create one to start selling Swarm to a customer.</TableCell>
                </TableRow>
              )}
              {filtered.map((c) => {
                const chip = stateChip(c.onboardingState);
                return (
                  <TableRow key={c.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/companies/${c.id}`)}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()} sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                      {c.id}
                    </TableCell>
                    <TableCell><Chip size="small" label={chip.label} color={chip.color} /></TableCell>
                    <TableCell>{c.superAdminEmail || '—'}</TableCell>
                    <TableCell>{c.plantCount}</TableCell>
                    <TableCell>{c.userCount ?? '—'}</TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Button size="small" onClick={() => toggleStatus(c)}>
                        {c.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                      </Button>
                      <Button size="small" color="error" onClick={() => removeCompany(c)}>Delete</Button>
                      <Button size="small" endIcon={<ChevronRight />} onClick={() => navigate(`/companies/${c.id}`)}>Open</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>New tenant</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Company name" sx={{ mt: 1 }} value={name} onChange={(e) => setName(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!name.trim() || saving} onClick={create}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
