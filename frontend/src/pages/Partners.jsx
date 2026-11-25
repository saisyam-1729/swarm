// PURPOSE: SWARM plant-app page: Partners.
import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Chip, CircularProgress, Alert,
  FormControl, InputLabel, Select, MenuItem, Checkbox, ListItemText, OutlinedInput, Divider, IconButton,
  Tooltip, Grid,
} from '@mui/material';
import { Add, ContentCopy, Delete, Edit, Link as LinkIcon, Refresh, VpnKey } from '@mui/icons-material';
import axios from 'axios';
import { partnerAPI, plantAPI, resolveApiBase } from '../services/api';
import { useFeedback } from '../context/FeedbackContext';

const apiBase = resolveApiBase();

const emptyOrgForm = { name: '', externalOrgId: '', plantIds: [] };

const ORG_ID_HELP =
  'Copy the exact id from emPOWER Settings → Swarm API: “This tenant\'s emPOWER organization ID is …”. '
  + 'Vulcan Mozambique is 001. Do not invent slugs such as org_vulcan_mozambique.';

function looksInventedOrgSlug(id) {
  const value = (id || '').trim();
  return value.toLowerCase().startsWith('org_') && value.toLowerCase() !== 'org_biopower_pilot';
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

const PARTNER_API_BASE = `${apiBase}/partner/v1`;

export default function Partners() {
  const { confirm } = useFeedback();
  const [organizations, setOrganizations] = useState([]);
  const [plants, setPlants] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [keysLoading, setKeysLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [editingOrgId, setEditingOrgId] = useState(null);
  const [orgForm, setOrgForm] = useState(emptyOrgForm);
  const [creatingOrg, setCreatingOrg] = useState(false);

  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [createdKey, setCreatedKey] = useState(null);

  const [testKey, setTestKey] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const selectedOrg = organizations.find((o) => o.id === selectedOrgId);

  const loadOrganizations = useCallback(() => {
    setLoading(true);
    setError('');
    partnerAPI.listOrganizations()
      .then(({ data }) => {
        const orgs = data.data || [];
        setOrganizations(orgs);
        if (orgs.length && !selectedOrgId) {
          setSelectedOrgId(orgs[0].id);
        }
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load organizations'))
      .finally(() => setLoading(false));
  }, [selectedOrgId]);

  const loadApiKeys = useCallback((orgId) => {
    if (!orgId) {
      setApiKeys([]);
      return;
    }
    setKeysLoading(true);
    partnerAPI.listApiKeys(orgId)
      .then(({ data }) => setApiKeys(data.data || []))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load API keys'))
      .finally(() => setKeysLoading(false));
  }, []);

  useEffect(() => {
    loadOrganizations();
    plantAPI.getAll().then(({ data }) => setPlants(data.data || [])).catch(() => {});
  }, [loadOrganizations]);

  useEffect(() => {
    loadApiKeys(selectedOrgId);
  }, [selectedOrgId, loadApiKeys]);

  const showSuccess = (message) => {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 4000);
  };

  const openCreateOrg = () => {
    setEditingOrgId(null);
    setOrgForm(emptyOrgForm);
    setOrgDialogOpen(true);
  };

  const openEditOrg = (org) => {
    setEditingOrgId(org.id);
    setOrgForm({
      name: org.name || '',
      externalOrgId: org.externalOrgId || '',
      plantIds: (org.plantIds || []).map(Number),
    });
    setOrgDialogOpen(true);
  };

  const handleSaveOrg = async () => {
    setCreatingOrg(true);
    setError('');
    try {
      const payload = {
        name: orgForm.name.trim(),
        externalOrgId: orgForm.externalOrgId.trim(),
        plantIds: orgForm.plantIds,
      };
      if (editingOrgId) {
        await partnerAPI.updateOrganization(editingOrgId, payload);
        showSuccess('Organization updated — GET /health now returns this emPOWER Org ID');
      } else {
        await partnerAPI.createOrganization(payload);
        showSuccess('Organization created');
      }
      setOrgDialogOpen(false);
      setEditingOrgId(null);
      setOrgForm(emptyOrgForm);
      loadOrganizations();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save organization');
    } finally {
      setCreatingOrg(false);
    }
  };

  const handleCreateKey = async () => {
    if (!selectedOrgId || !keyName.trim()) return;
    setCreatingKey(true);
    setError('');
    try {
      const { data } = await partnerAPI.createApiKey({
        organizationId: selectedOrgId,
        name: keyName.trim(),
      });
      setCreatedKey(data.data);
      setKeyName('');
      showSuccess('API key created — copy it now; it will not be shown again');
      loadApiKeys(selectedOrgId);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create API key');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeKey = async (keyId) => {
    // UX-CHANGE UX-01 (in-app confirm). Original: if (!window.confirm('Revoke this API key? emPOWER will lose access immediately.')) return;
    if (!(await confirm({ title: 'Revoke API key?', message: 'Revoke this API key? emPOWER will lose access immediately.', confirmText: 'Revoke key', danger: true }))) return;
    setError('');
    try {
      await partnerAPI.revokeApiKey(keyId);
      showSuccess('API key revoked');
      loadApiKeys(selectedOrgId);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to revoke API key');
    }
  };

  const handleTestConnection = async () => {
    if (!testKey.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const headers = { Authorization: `Bearer ${testKey.trim()}` };
      const { data } = await axios.get(`${apiBase}/partner/v1/health`, { headers });
      let devices = data.devices || [];
      if (!devices.length) {
        try {
          const catalog = await axios.get(`${apiBase}/partner/v1/devices`, { headers });
          devices = catalog.data || [];
        } catch {
          devices = [];
        }
      }
      setTestResult({ ok: true, data, devices });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err.response?.data?.message || err.message || 'Connection failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess('Copied to clipboard');
    } catch {
      setError('Could not copy to clipboard');
    }
  };

  const plantName = (plantId) => plants.find((p) => Number(p.plantId) === Number(plantId))?.plantName || `Plant ${plantId}`;

  if (loading) return <CircularProgress />;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
            emPOWER Partners
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Issue API keys for emPOWER to pull plant health and telemetry (read-only).
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5, fontFamily: 'monospace' }}>
            Partner API: {PARTNER_API_BASE}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            emPOWER Org ID must match Settings helper text (e.g. 001). One API key per emPOWER tenant.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<Refresh />} variant="outlined" onClick={loadOrganizations}>Refresh</Button>
          <Button startIcon={<Add />} variant="contained" onClick={openCreateOrg}>New Organization</Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Grid container spacing={3}>
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>Organizations</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>emPOWER Org ID</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {organizations.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} align="center">No organizations yet</TableCell>
                      </TableRow>
                    )}
                    {organizations.map((org) => (
                      <TableRow
                        key={org.id}
                        hover
                        selected={org.id === selectedOrgId}
                        onClick={() => setSelectedOrgId(org.id)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>{org.name}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="body2" fontFamily="monospace">{org.externalOrgId}</Typography>
                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); copyToClipboard(org.externalOrgId); }}>
                              <ContentCopy fontSize="inherit" />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={org.active ? 'Active' : 'Inactive'} color={org.active ? 'success' : 'default'} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {selectedOrg && (
                <Box sx={{ mt: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle2">Allowed plants</Typography>
                    <Button size="small" startIcon={<Edit />} onClick={() => openEditOrg(selectedOrg)}>
                      Edit org ID
                    </Button>
                  </Box>
                  {selectedOrg.plantIds?.length ? (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selectedOrg.plantIds.map((id) => (
                        <Chip key={id} size="small" label={plantName(id)} />
                      ))}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">No plants assigned</Typography>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={7}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">API Keys</Typography>
                <Button
                  startIcon={<VpnKey />}
                  variant="contained"
                  size="small"
                  disabled={!selectedOrgId}
                  onClick={() => { setCreatedKey(null); setKeyDialogOpen(true); }}
                >
                  Create Key
                </Button>
              </Box>
              {keysLoading ? (
                <CircularProgress size={24} />
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Prefix</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Last used</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {apiKeys.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} align="center">
                            {selectedOrgId ? 'No API keys for this organization' : 'Select an organization'}
                          </TableCell>
                        </TableRow>
                      )}
                      {apiKeys.map((key) => (
                        <TableRow key={key.id}>
                          <TableCell>{key.name}</TableCell>
                          <TableCell>
                            <Typography variant="body2" fontFamily="monospace">{key.keyPrefix}…</Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={key.active && !key.revokedAt ? 'Active' : 'Revoked'}
                              color={key.active && !key.revokedAt ? 'success' : 'default'}
                            />
                          </TableCell>
                          <TableCell>{formatDate(key.lastUsedAt)}</TableCell>
                          <TableCell align="right">
                            {key.active && !key.revokedAt && (
                              <Tooltip title="Revoke key">
                                <IconButton size="small" color="error" onClick={() => handleRevokeKey(key.id)}>
                                  <Delete fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Test Connection</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Paste an API key to verify emPOWER can reach SWARM Partner API.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <TextField
                  size="small"
                  fullWidth
                  label="API key"
                  type="password"
                  value={testKey}
                  onChange={(e) => setTestKey(e.target.value)}
                  sx={{ flex: 1, minWidth: 200 }}
                />
                <Button
                  variant="contained"
                  startIcon={<LinkIcon />}
                  onClick={handleTestConnection}
                  disabled={testing || !testKey.trim()}
                >
                  {testing ? 'Testing…' : 'Test'}
                </Button>
              </Box>
              {testResult && (
                testResult.ok ? (
                  <Alert severity="success">
                    Connected — org <strong>{testResult.data.organizationId}</strong> ({testResult.data.organizationName})
                    {testResult.devices?.length > 0 && (
                      <Box component="span" sx={{ display: 'block', mt: 1 }}>
                        Devices:{' '}
                        {testResult.devices.map((d) => d.name || d.device_name || d.deviceId).join(', ')}
                      </Box>
                    )}
                  </Alert>
                ) : (
                  <Alert severity="error">{testResult.message}</Alert>
                )
              )}
              <Divider sx={{ my: 2 }} />
              <Typography variant="caption" color="text.secondary" display="block">
                Partner API base: {apiBase}/partner/v1
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={orgDialogOpen} onClose={() => { setOrgDialogOpen(false); setEditingOrgId(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>{editingOrgId ? 'Edit Partner Organization' : 'New Partner Organization'}</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mt: 1 }}>{ORG_ID_HELP}</Alert>
          {looksInventedOrgSlug(orgForm.externalOrgId) && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              This looks like an invented slug. Use the emPOWER Settings helper id (Vulcan = 001), then Save.
            </Alert>
          )}
          <TextField
            fullWidth
            margin="normal"
            label="Organization name"
            value={orgForm.name}
            onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
          />
          <TextField
            fullWidth
            margin="normal"
            label="emPOWER Org ID"
            placeholder="001"
            helperText="Must match emPOWER Settings helper. GET /health returns this as organizationId."
            value={orgForm.externalOrgId}
            onChange={(e) => setOrgForm({ ...orgForm, externalOrgId: e.target.value })}
          />
          <FormControl fullWidth margin="normal">
            <InputLabel>Allowed plants</InputLabel>
            <Select
              multiple
              value={orgForm.plantIds}
              onChange={(e) => setOrgForm({ ...orgForm, plantIds: e.target.value })}
              input={<OutlinedInput label="Allowed plants" />}
              renderValue={(selected) => selected.map((id) => plantName(id)).join(', ')}
            >
              {plants.map((p) => (
                <MenuItem key={p.plantId} value={Number(p.plantId)}>
                  <Checkbox checked={orgForm.plantIds.includes(Number(p.plantId))} />
                  <ListItemText primary={p.plantName} secondary={`ID ${p.plantId}`} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOrgDialogOpen(false); setEditingOrgId(null); }}>Cancel</Button>
          <Button
            variant="contained"
            disabled={creatingOrg || !orgForm.name.trim() || !orgForm.externalOrgId.trim()}
            onClick={handleSaveOrg}
          >
            {editingOrgId ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={keyDialogOpen} onClose={() => setKeyDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create API Key</DialogTitle>
        <DialogContent>
          {createdKey ? (
            <Box>
              <Alert severity="warning" sx={{ mb: 2 }}>
                Copy this key now. It will not be shown again.
              </Alert>
              <TextField
                fullWidth
                label="API key"
                value={createdKey.apiKey}
                InputProps={{
                  readOnly: true,
                  endAdornment: (
                    <IconButton onClick={() => copyToClipboard(createdKey.apiKey)}>
                      <ContentCopy />
                    </IconButton>
                  ),
                }}
              />
            </Box>
          ) : (
            <TextField
              fullWidth
              margin="normal"
              label="Key name"
              placeholder="e.g. emPOWER production"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
            />
          )}
        </DialogContent>
        <DialogActions>
          {createdKey ? (
            <Button variant="contained" onClick={() => { setKeyDialogOpen(false); setCreatedKey(null); }}>Done</Button>
          ) : (
            <>
              <Button onClick={() => setKeyDialogOpen(false)}>Cancel</Button>
              <Button variant="contained" disabled={creatingKey || !keyName.trim()} onClick={handleCreateKey}>
                Generate
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
