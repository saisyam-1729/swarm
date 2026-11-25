// PURPOSE: Control Center page for tenant onboarding and plant assignment.
import { useEffect, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Table, TableBody, TableCell,
  TableHead, TableRow, Chip, CircularProgress, Alert, Tabs, Tab, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
} from '@mui/material';
import { controlCenterAPI } from '../../services/api';
import { useFeedback } from '../../context/FeedbackContext';

const reasonLabel = (reason) => {
  if (reason === 'PENDING_SIGNUP') return 'Signed up — awaiting approval';
  if (reason === 'NO_TENANT') return 'No tenant assigned';
  return reason || '—';
};

export default function Approvals() {
  const { confirm } = useFeedback();
  const [tab, setTab] = useState('pending');
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [target, setTarget] = useState(null);
  const [companyId, setCompanyId] = useState('');
  const [role, setRole] = useState('OPERATOR');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      controlCenterAPI.listUsers(tab === 'pending' ? 'pending' : 'all'),
      controlCenterAPI.listCompanies(),
    ]).then(([userRes, companyRes]) => {
      setUsers(userRes.data.data || []);
      setCompanies(companyRes.data.data || []);
    }).catch((e) => setError(e.response?.data?.message || 'Failed to load users'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tab]);

  const openApprove = (user) => {
    setError('');
    setTarget(user);
    const first = companies[0];
    setCompanyId(user.companyId || first?.id || '');
    const company = companies.find((c) => String(c.id) === String(user.companyId || first?.id));
    const hasAdmin = Boolean(company?.superAdminEmail);
    let nextRole = user.role || 'OPERATOR';
    if (nextRole === 'CONTROL_CENTER_ADMIN' || (nextRole === 'SUPER_ADMIN' && hasAdmin)) {
      nextRole = 'OPERATOR';
    }
    setRole(nextRole);
  };

  const selectedCompany = companies.find((c) => String(c.id) === String(companyId));
  const tenantHasSuperAdmin = Boolean(selectedCompany?.superAdminEmail);

  const approve = async () => {
    setSaving(true);
    setError('');
    try {
      await controlCenterAPI.approveUser(target.id, {
        companyId,
        role,
      });
      setSuccess(`${target.email} approved`);
      setTarget(null);
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Approve failed');
    } finally {
      setSaving(false);
    }
  };

  const reject = async (user) => {
    // UX-CHANGE UX-01 (in-app confirm). Original: if (!window.confirm(`Reject and disable ${user.email}?`)) return;
    if (!(await confirm({ title: 'Reject sign-up?', message: `Reject and disable ${user.email}?`, confirmText: 'Reject', danger: true }))) return;
    try {
      await controlCenterAPI.rejectUser(user.id);
      setSuccess(`${user.email} rejected`);
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Reject failed');
    }
  };

  const removeUser = async (user) => {
    // UX-CHANGE UX-01 (in-app confirm). Original: if (!window.confirm(`Permanently delete ${user.email}? This cannot be undone.`)) return;
    if (!(await confirm({ title: 'Delete user permanently?', message: `Permanently delete ${user.email}? This cannot be undone.`, confirmText: 'Delete', danger: true }))) return;
    try {
      await controlCenterAPI.deleteUser(user.id);
      setSuccess(`${user.email} deleted`);
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Delete failed');
    }
  };

  if (loading && users.length === 0) return <CircularProgress />;

  return (
    <Box>
      <Typography variant="h5" fontWeight={700}>User approvals</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 720 }}>
        Public sign-ups wait here until you assign a tenant. Existing plant logins with no company are on All users.
      </Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="pending" label="Needs approval" />
        <Tab value="all" label="All users" />
      </Tabs>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      <Card>
        <CardContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Tenant</TableCell>
                <TableCell>Queue</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    {tab === 'pending' ? 'No users waiting. New sign-ups appear here.' : 'No users yet.'}
                  </TableCell>
                </TableRow>
              )}
              {users.map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell><Chip size="small" color={u.status === 'PENDING' ? 'warning' : 'default'} label={u.status} /></TableCell>
                  <TableCell>{u.companyName || '—'}</TableCell>
                  <TableCell>{reasonLabel(u.queueReason)}</TableCell>
                  <TableCell align="right">
                    {(u.status === 'PENDING' || !u.companyId) && u.status !== 'DISABLED' && (
                      <>
                        <Button size="small" onClick={() => openApprove(u)}>Approve</Button>
                        <Button size="small" color="inherit" onClick={() => reject(u)}>Reject</Button>
                      </>
                    )}
                    <Button size="small" color="error" onClick={() => removeUser(u)}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(target)} onClose={() => setTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Approve {target?.email}</DialogTitle>
        <DialogContent>
          {error && target && (
            <Alert severity="error" sx={{ mt: 1, mb: 1 }} onClose={() => setError('')}>{error}</Alert>
          )}
          {selectedCompany?.status === 'DISABLED' && (
            <Alert severity="info" sx={{ mt: 1, mb: 1 }}>
              {selectedCompany.name} is disabled. Approving this user will enable the tenant.
            </Alert>
          )}
          {tenantHasSuperAdmin && (
            <Alert severity="info" sx={{ mb: 1 }}>
              {selectedCompany?.name} already has Super Admin {selectedCompany?.superAdminEmail}. Use Plant Admin or Operator.
            </Alert>
          )}
          <TextField
            select fullWidth label="Tenant" sx={{ mt: 1, mb: 2 }}
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              const next = companies.find((c) => String(c.id) === String(e.target.value));
              if (next?.superAdminEmail && role === 'SUPER_ADMIN') setRole('OPERATOR');
            }}
          >
            {companies.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}{c.status === 'DISABLED' ? ' (disabled — will enable)' : ''}
              </MenuItem>
            ))}
          </TextField>
          <TextField select fullWidth label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
            <MenuItem value="OPERATOR">Operator</MenuItem>
            <MenuItem value="PLANT_ADMIN">Plant Admin</MenuItem>
            <MenuItem value="SUPER_ADMIN" disabled={tenantHasSuperAdmin}>
              Super Admin (only if tenant has none)
            </MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTarget(null)}>Cancel</Button>
          <Button variant="contained" disabled={saving || !companyId} onClick={approve}>Approve</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
