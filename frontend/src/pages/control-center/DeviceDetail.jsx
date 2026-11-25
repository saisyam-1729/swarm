// PURPOSE: Control Center page for device provisioning and hardware export.
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Grid, MenuItem, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { controlCenterAPI } from '../../services/api';
import CopyableId from '../../components/common/CopyableId';
import useSensorCatalog from '../../utils/useSensorCatalog';
import { useFeedback } from '../../context/FeedbackContext';

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportableConfig(provisioning) {
  if (!provisioning) return {};
  const { deviceSecret, secretShownOnce, ...rest } = provisioning;
  return {
    ...rest,
    deviceSecret: deviceSecret || undefined,
    secretShownOnce,
  };
}

export default function DeviceDetail() {
  const { confirm } = useFeedback();
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { types, labels } = useSensorCatalog();
  const [device, setDevice] = useState(null);
  const [provisioning, setProvisioning] = useState(location.state?.provisioning || null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [channelOpen, setChannelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [channelForm, setChannelForm] = useState({ channelId: '', measurementType: 'TEMPERATURE', instrumentTag: '' });
  const [tenants, setTenants] = useState([]);
  const [plants, setPlants] = useState([]);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignForm, setReassignForm] = useState({ tenantId: '', plantId: '' });
  const [audit, setAudit] = useState([]);

  const load = () => {
    setLoading(true);
    Promise.all([
      controlCenterAPI.getDevice(id),
      provisioning?.deviceSecret
        ? Promise.resolve({ data: { data: provisioning } })
        : controlCenterAPI.getProvisioning(id),
      controlCenterAPI.listCompanies().catch(() => ({ data: { data: [] } })),
      controlCenterAPI.listPlants().catch(() => ({ data: { data: [] } })),
      controlCenterAPI.deviceAudit(id).catch(() => ({ data: { data: [] } })),
    ]).then(([deviceRes, provRes, companyRes, plantRes, auditRes]) => {
      setDevice(deviceRes.data.data);
      setTenants(companyRes.data.data || []);
      setPlants(plantRes.data.data || []);
      setAudit(auditRes.data.data || []);
      setProvisioning((prev) => {
        const next = provRes.data.data;
        if (prev?.deviceSecret) {
          return { ...next, deviceSecret: prev.deviceSecret, secretShownOnce: true };
        }
        return next;
      });
      setError('');
    }).catch((e) => setError(e.response?.data?.message || 'Failed to load device'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const rotate = async () => {
    // UX-CHANGE UX-01 (in-app confirm). Original: if (!window.confirm('Rotate this device secret? The previous secret stops working immediately.')) return;
    if (!(await confirm({ title: 'Rotate device secret?', message: 'Rotate this device secret? The previous secret stops working immediately.', confirmText: 'Rotate secret', danger: true }))) return;
    setSaving(true);
    try {
      const { data } = await controlCenterAPI.rotateDeviceSecret(id);
      setProvisioning(data.data);
      setSuccess('New secret issued. Copy it now; it will not be shown again.');
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to rotate secret');
    } finally {
      setSaving(false);
    }
  };

  const saveChannel = async () => {
    setSaving(true);
    try {
      await controlCenterAPI.upsertDeviceChannel(id, channelForm);
      setChannelOpen(false);
      setSuccess('Channel saved');
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save channel');
    } finally {
      setSaving(false);
    }
  };

  const copyConfig = async () => {
    await navigator.clipboard.writeText(JSON.stringify(exportableConfig(provisioning), null, 2));
    setSuccess('Hardware configuration copied');
  };

  const setLifecycle = async (lifecycle) => {
    const labels = {
      SUSPENDED: 'Suspend this device? It will stop accepting telemetry until reactivated.',
      ACTIVE: 'Reactivate this device?',
      RETIRED: 'Retire this device permanently? Publishing will be rejected.',
    };
    // UX-CHANGE UX-01 (in-app confirm). Original: if (!window.confirm(labels[lifecycle] || `Set lifecycle to ${lifecycle}?`)) return;
    if (!(await confirm({ title: 'Change device lifecycle?', message: labels[lifecycle] || `Set lifecycle to ${lifecycle}?`, confirmText: 'Confirm', danger: lifecycle !== 'ACTIVE' }))) return;
    setSaving(true);
    try {
      const { data } = await controlCenterAPI.setDeviceLifecycle(id, { lifecycle });
      setDevice(data.data);
      setSuccess(`Device ${lifecycle.toLowerCase()}`);
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to update lifecycle');
    } finally {
      setSaving(false);
    }
  };

  const revoke = async () => {
    // UX-CHANGE UX-01 (in-app confirm). Original: if (!window.confirm('Revoke credentials? The current secret stops working immediately.')) return;
    if (!(await confirm({ title: 'Revoke credentials?', message: 'Revoke credentials? The current secret stops working immediately.', confirmText: 'Revoke', danger: true }))) return;
    setSaving(true);
    try {
      await controlCenterAPI.revokeDeviceSecret(id);
      setSuccess('Credentials revoked. Issue a new secret before the hardware can publish.');
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to revoke secret');
    } finally {
      setSaving(false);
    }
  };

  const reassign = async () => {
    // UX-CHANGE UX-01 (in-app confirm). Original: if (!window.confirm('Reassign this device? The previous tenant loses access immediately. Historical telemetry stays on the old plant.')) return;
    if (!(await confirm({ title: 'Reassign device?', message: 'Reassign this device? The previous tenant loses access immediately. Historical telemetry stays on the old plant.', confirmText: 'Reassign', danger: true }))) return;
    setSaving(true);
    try {
      const { data } = await controlCenterAPI.reassignDevice(id, {
        tenantId: reassignForm.tenantId || undefined,
        plantId: Number(reassignForm.plantId),
      });
      setDevice(data.data);
      setReassignOpen(false);
      setSuccess('Device reassigned. Historical readings remain on the previous plant.');
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to reassign device');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !device) return <CircularProgress />;
  if (!device) return <Alert severity="error">{error || 'Device not found'}</Alert>;

  return (
    <Box>
      <Button onClick={() => navigate('/devices')} sx={{ mb: 2 }}>Back to devices</Button>
      <Typography variant="h5" fontWeight={700}>{device.deviceName || device.deviceUid}</Typography>
      <Stack direction="row" spacing={1} sx={{ my: 1 }} flexWrap="wrap" useFlexGap>
        <Chip size="small" color="primary" label={device.status || device.connectionStatus || 'Unknown'} />
        <Chip size="small" label={device.provisioningStatus || device.lifecycle} />
        <Chip size="small" label={device.deviceKind} />
        <Chip size="small" variant="outlined" label={`${device.sensorCount ?? (device.channels || []).length} sensors`} />
        <Chip size="small" variant="outlined" label={`${device.nodeCount ?? 0} nodes`} />
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        {device.lifecycle !== 'SUSPENDED' && device.lifecycle !== 'RETIRED' && (
          <Button color="warning" variant="outlined" onClick={() => setLifecycle('SUSPENDED')} disabled={saving}>Suspend</Button>
        )}
        {(device.lifecycle === 'SUSPENDED' || device.lifecycle === 'RETIRED') && (
          <Button color="success" variant="outlined" onClick={() => setLifecycle('ACTIVE')} disabled={saving}>Reactivate</Button>
        )}
        <Button variant="outlined" onClick={() => {
          setReassignForm({ tenantId: device.tenantId || '', plantId: device.plantId || '' });
          setReassignOpen(true);
        }}>Reassign</Button>
        <Button color="error" variant="outlined" onClick={revoke} disabled={saving}>Revoke credentials</Button>
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {provisioning?.deviceSecret && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          One-time device secret: copy it now. SWARM stores only a hash after this page.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Identity</Typography>
              <CopyableId label="Tenant ID" value={provisioning?.tenantId || device.tenantId} />
              <CopyableId label="Plant ID" value={provisioning?.plantId || device.plantId} />
              <CopyableId label="Device UID" value={device.deviceUid} />
              <CopyableId label="Device PK" value={device.id} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {device.tenantName} · {device.plantName}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>MQTT</Typography>
              <CopyableId label="Broker" value={`${provisioning?.mqttBrokerHost}:${provisioning?.mqttBrokerPort}`} />
              <CopyableId label="Telemetry topic" value={provisioning?.mqttTelemetryTopic} />
              <CopyableId label="MQTT username" value={provisioning?.mqttAuthUsername} />
              {provisioning?.deviceSecret && <CopyableId label="MQTT password / device secret" value={provisioning.deviceSecret} />}
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {provisioning?.mqttAuthHint}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                <Button variant="outlined" onClick={copyConfig}>Copy configuration</Button>
                <Button
                  variant="outlined"
                  onClick={() => downloadJson(`${device.deviceUid}-hardware.json`, exportableConfig(provisioning))}
                >
                  Download JSON
                </Button>
                <Button color="warning" onClick={rotate} disabled={saving}>Rotate secret</Button>
                <Button color="error" onClick={revoke} disabled={saving}>Revoke</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Box>
                  <Typography variant="h6">Discovered sensors / channels</Typography>
                  <Typography variant="body2" color="text.secondary">
                    New channel IDs from authenticated telemetry appear automatically.
                  </Typography>
                </Box>
                <Button size="small" onClick={() => setChannelOpen(true)}>Optional pre-declare</Button>
              </Box>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Channel</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Unit</TableCell>
                    <TableCell>Tag</TableCell>
                    <TableCell>Node</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(device.channels || []).length === 0 && (
                    <TableRow><TableCell colSpan={6}>No sensors discovered yet. They appear after the first valid MQTT payload.</TableCell></TableRow>
                  )}
                  {(device.channels || []).map((c) => (
                    <TableRow key={c.id || c.channelId}>
                      <TableCell>{c.channelId}</TableCell>
                      <TableCell>{labels[c.measurementType] || c.measurementType}</TableCell>
                      <TableCell>{c.engineeringUnit || '—'}</TableCell>
                      <TableCell>{c.instrumentTag || '—'}</TableCell>
                      <TableCell>{c.sensorNodeId || '—'}</TableCell>
                      <TableCell>{c.active ? (c.dataStatus || 'Active') : 'Disabled'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Expected payload ({provisioning?.schemaVersion})</Typography>
              <Box
                component="pre"
                sx={{
                  p: 2,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  overflow: 'auto',
                  fontSize: 13,
                }}
              >
                {JSON.stringify(provisioning?.payloadExample || {}, null, 2)}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {(provisioning?.notes || []).join(' ')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={reassignOpen} onClose={() => setReassignOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Reassign device</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
            The previous tenant loses access immediately. Historical telemetry stays on the old plant.
          </Typography>
          <TextField
            select fullWidth label="Tenant" sx={{ mb: 2 }}
            value={reassignForm.tenantId}
            onChange={(e) => setReassignForm({ tenantId: e.target.value, plantId: '' })}
          >
            {tenants.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </TextField>
          <TextField
            select fullWidth label="Plant"
            value={reassignForm.plantId}
            onChange={(e) => setReassignForm({ ...reassignForm, plantId: e.target.value })}
          >
            {plants
              .filter((p) => !reassignForm.tenantId || String(p.companyId) === String(reassignForm.tenantId))
              .map((p) => <MenuItem key={p.plantId} value={p.plantId}>{p.plantName}</MenuItem>)}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReassignOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!reassignForm.plantId || saving} onClick={reassign}>Reassign</Button>
        </DialogActions>
      </Dialog>

      {audit.length > 0 && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>Audit</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Actor</TableCell>
                  <TableCell>Detail</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {audit.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.createdAt || '—'}</TableCell>
                    <TableCell>{row.action}</TableCell>
                    <TableCell>{row.actor || '—'}</TableCell>
                    <TableCell>{row.detail || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={channelOpen} onClose={() => setChannelOpen(false)}>
        <DialogTitle>Sensor channel</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            sx={{ mt: 1 }}
            label="Channel ID"
            value={channelForm.channelId}
            onChange={(e) => setChannelForm({ ...channelForm, channelId: e.target.value })}
          />
          <TextField
            select
            fullWidth
            sx={{ mt: 2 }}
            label="Measurement"
            value={channelForm.measurementType}
            onChange={(e) => setChannelForm({ ...channelForm, measurementType: e.target.value })}
          >
            {types.map((t) => <MenuItem key={t} value={t}>{labels[t] || t}</MenuItem>)}
          </TextField>
          <TextField
            fullWidth
            sx={{ mt: 2 }}
            label="Instrument tag"
            value={channelForm.instrumentTag}
            onChange={(e) => setChannelForm({ ...channelForm, instrumentTag: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChannelOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!channelForm.channelId || saving} onClick={saveChannel}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
