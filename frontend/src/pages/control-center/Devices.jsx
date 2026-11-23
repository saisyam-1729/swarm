// PURPOSE: Control Center page for hardware device registration.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Grid, MenuItem, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Typography,
} from '@mui/material';
import { Add } from '@mui/icons-material';
import { controlCenterAPI } from '../../services/api';
import useSensorCatalog from '../../utils/useSensorCatalog';

const emptyChannel = { channelId: '', measurementType: 'TEMPERATURE', instrumentTag: '' };

export default function Devices() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { types, labels } = useSensorCatalog();
  const [tenants, setTenants] = useState([]);
  const [plants, setPlants] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    tenantId: searchParams.get('tenantId') || '',
    plantId: searchParams.get('plantId') || '',
    deviceName: '',
    deviceUid: '',
    deviceKind: 'MQTT_GATEWAY',
    channels: [],
  });

  const tenantId = searchParams.get('tenantId') || '';
  const plantId = searchParams.get('plantId') || '';

  const load = () => {
    setLoading(true);
    Promise.all([
      controlCenterAPI.listCompanies(),
      controlCenterAPI.listPlants(),
      controlCenterAPI.listDevices({ tenantId: tenantId || undefined, plantId: plantId || undefined }),
    ]).then(([companyRes, plantRes, deviceRes]) => {
      setTenants(companyRes.data.data || []);
      setPlants(plantRes.data.data || []);
      setDevices(deviceRes.data.data || []);
      setError('');
    }).catch((e) => setError(e.response?.data?.message || 'Failed to load devices'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenantId, plantId]);

  const plantsForTenant = useMemo(
    () => plants.filter((p) => !form.tenantId || String(p.companyId) === String(form.tenantId)),
    [plants, form.tenantId],
  );

  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'tenantId') next.delete('plantId');
    setSearchParams(next);
  };

  const addChannel = () => {
    setForm((prev) => ({
      ...prev,
      channels: [...prev.channels, { ...emptyChannel, channelId: String(prev.channels.length + 1) }],
    }));
  };

  const register = async () => {
    setSaving(true);
    setError('');
    try {
      const { data } = await controlCenterAPI.registerDevice({
        tenantId: form.tenantId || undefined,
        plantId: Number(form.plantId),
        deviceName: form.deviceName || undefined,
        deviceUid: form.deviceUid || undefined,
        deviceKind: form.deviceKind,
        channels: form.channels
          .filter((c) => (c.channelId || '').trim() || (c.instrumentTag || '').trim())
          .map((c) => ({
            channelId: c.channelId || undefined,
            measurementType: c.measurementType,
            instrumentTag: c.instrumentTag || undefined,
          })),
      });
      const created = data.data;
      setOpen(false);
      if (created?.devicePk) {
        navigate(`/devices/${created.devicePk}`, { state: { provisioning: created } });
      } else {
        load();
      }
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to register device');
    } finally {
      setSaving(false);
    }
  };

  if (loading && devices.length === 0) return <CircularProgress />;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Devices</Typography>
          <Typography variant="body2" color="text.secondary">
            Register a device once, assign tenant and plant, then give the hardware engineer the provisioning file.
            Nodes and sensors appear automatically from authenticated telemetry.
          </Typography>
        </Box>
        <Button startIcon={<Add />} variant="contained" onClick={() => setOpen(true)}>Register device</Button>
      </Box>
      <Grid container spacing={1} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={4}>
          <TextField
            select
            fullWidth
            size="small"
            label="Tenant"
            value={tenantId}
            onChange={(e) => setFilter('tenantId', e.target.value)}
          >
            <MenuItem value="">All tenants</MenuItem>
            {tenants.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <TextField
            select
            fullWidth
            size="small"
            label="Plant"
            value={plantId}
            onChange={(e) => setFilter('plantId', e.target.value)}
          >
            <MenuItem value="">All plants</MenuItem>
            {plants
              .filter((p) => !tenantId || String(p.companyId) === String(tenantId))
              .map((p) => <MenuItem key={p.plantId} value={p.plantId}>{p.plantName}</MenuItem>)}
          </TextField>
        </Grid>
      </Grid>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      <Card>
        <CardContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Device UID</TableCell>
                <TableCell>Tenant</TableCell>
                <TableCell>Plant</TableCell>
                <TableCell>Kind</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Sensors</TableCell>
                <TableCell>Last seen</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {devices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>No devices yet. Register a gateway after the plant belongs to a tenant.</TableCell>
                </TableRow>
              )}
              {devices.map((d) => (
                <TableRow key={d.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/devices/${d.id}`)}>
                  <TableCell sx={{ fontFamily: 'ui-monospace, monospace' }}>{d.deviceUid}</TableCell>
                  <TableCell>{d.tenantName || '—'}</TableCell>
                  <TableCell>{d.plantName || d.plantId}</TableCell>
                  <TableCell>{d.deviceKind}</TableCell>
                  <TableCell><Chip size="small" label={d.status || d.connectionStatus || d.lifecycle} color={d.status === 'ONLINE' ? 'success' : d.status === 'SUSPENDED' ? 'error' : 'default'} /></TableCell>
                  <TableCell>{d.sensorCount ?? (d.channels || []).length}</TableCell>
                  <TableCell>{d.lastSeenAt || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Register hardware device</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                label="Tenant"
                value={form.tenantId}
                onChange={(e) => setForm({ ...form, tenantId: e.target.value, plantId: '' })}
              >
                {tenants.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                label="Plant"
                value={form.plantId}
                onChange={(e) => setForm({ ...form, plantId: e.target.value })}
              >
                {plantsForTenant.filter((p) => p.companyId).map((p) => (
                  <MenuItem key={p.plantId} value={p.plantId}>{p.plantName} (ID {p.plantId})</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Device name" value={form.deviceName} onChange={(e) => setForm({ ...form, deviceName: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Device UID (optional)"
                helperText="Leave blank to generate a unique UID"
                value={form.deviceUid}
                onChange={(e) => setForm({ ...form, deviceUid: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField select fullWidth label="Device type" value={form.deviceKind} onChange={(e) => setForm({ ...form, deviceKind: e.target.value })}>
                <MenuItem value="MQTT_GATEWAY">MQTT gateway</MenuItem>
                <MenuItem value="ESP_HUB">ESP hub</MenuItem>
                <MenuItem value="REST_GATEWAY">REST gateway</MenuItem>
                <MenuItem value="PLC_GATEWAY">PLC gateway</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Optional channel pre-declaration</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Leave empty to let SWARM discover sensors from MQTT. Hardware GPIO mapping is not configured here.
              </Typography>
              {form.channels.map((channel, index) => (
                <Grid container spacing={1} key={index} sx={{ mb: 1 }}>
                  <Grid item xs={3}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Channel ID"
                      value={channel.channelId}
                      onChange={(e) => {
                        const channels = [...form.channels];
                        channels[index] = { ...channel, channelId: e.target.value };
                        setForm({ ...form, channels });
                      }}
                    />
                  </Grid>
                  <Grid item xs={5}>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      label="Measurement"
                      value={channel.measurementType}
                      onChange={(e) => {
                        const channels = [...form.channels];
                        channels[index] = { ...channel, measurementType: e.target.value };
                        setForm({ ...form, channels });
                      }}
                    >
                      {types.map((t) => <MenuItem key={t} value={t}>{labels[t] || t}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid item xs={4}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Tag / name"
                      value={channel.instrumentTag}
                      onChange={(e) => {
                        const channels = [...form.channels];
                        channels[index] = { ...channel, instrumentTag: e.target.value };
                        setForm({ ...form, channels });
                      }}
                    />
                  </Grid>
                </Grid>
              ))}
              <Button size="small" onClick={addChannel}>Add channel</Button>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!form.plantId || saving} onClick={register}>Register</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
