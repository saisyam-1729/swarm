// PURPOSE: Control Center page for tenant onboarding and plant assignment.
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Button, TextField, Grid, Checkbox,
  CircularProgress, Alert, Divider, Chip, Table, TableBody,
  TableCell, TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, MenuItem,
} from '@mui/material';
import { controlCenterAPI } from '../../services/api';
import CopyableId from '../../components/common/CopyableId';
import { useFeedback } from '../../context/FeedbackContext';

const plantKey = (p) => Number(p?.plantId ?? p?.id);

const unwrapList = (res) => {
  const payload = res?.data?.data ?? res?.data;
  return Array.isArray(payload) ? payload : [];
};

export default function CompanyDetail() {
  const { confirm } = useFeedback();
  const { id } = useParams();
  const navigate = useNavigate();
  const companyId = id;
  const [detail, setDetail] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [adminForm, setAdminForm] = useState({ name: '', email: '', mobile: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [rename, setRename] = useState('');
  const [plantOpen, setPlantOpen] = useState(false);
  const [plantForm, setPlantForm] = useState({ plantName: '', plantType: 'BIOGAS', location: '' });
  const [devices, setDevices] = useState([]);

  const load = () => {
    setLoading(true);
    Promise.all([
      controlCenterAPI.getCompany(id),
      controlCenterAPI.listPlants(),
      controlCenterAPI.listDevices({ tenantId: id }),
    ]).then(([companyRes, plantsRes, deviceRes]) => {
      const data = companyRes.data.data;
      setDetail(data);
      setRename(data.company?.name || '');
      setInventory(unwrapList(plantsRes));
      setSelected((data.plants || []).map(plantKey).filter(Number.isFinite));
      setDevices(deviceRes.data.data || []);
    }).catch((e) => setError(e.response?.data?.message || 'Failed to load company'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const assignablePlants = inventory.filter((p) => {
    const owner = p.companyId == null ? null : String(p.companyId);
    return owner == null || owner === String(companyId);
  });

  const togglePlant = (plantId) => {
    const n = Number(plantId);
    if (!Number.isFinite(n)) return;
    setSelected((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  };

  const savePlants = async () => {
    if (selected.length === 0 && (detail?.plants || []).length > 0) {
      // UX-CHANGE UX-01 (in-app confirm). Original: const ok = window.confirm('No plants are checked. This removes every plant from the company. Continue?');
      const ok = await confirm({ title: 'Remove all plants?', message: 'No plants are checked. This removes every plant from the company. Continue?', confirmText: 'Remove all', danger: true });
      if (!ok) return;
    }
    setSaving(true);
    setError('');
    try {
      await controlCenterAPI.assignPlants(id, { plantIds: selected });
      setSuccess('Plants assigned');
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to assign plants');
    } finally {
      setSaving(false);
    }
  };

  const saveName = async () => {
    setSaving(true);
    setError('');
    try {
      await controlCenterAPI.updateCompany(id, { name: rename });
      setSuccess('Tenant name updated');
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to update tenant');
    } finally {
      setSaving(false);
    }
  };

  const createPlant = async () => {
    setSaving(true);
    setError('');
    try {
      await controlCenterAPI.createPlant({
        ...plantForm,
        companyId: id,
      });
      setPlantOpen(false);
      setPlantForm({ plantName: '', plantType: 'BIOGAS', location: '' });
      setSuccess('Plant created under this tenant');
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to create plant');
    } finally {
      setSaving(false);
    }
  };

  const setPlantStatus = async (plant, status) => {
    try {
      await controlCenterAPI.updatePlant(plant.plantId, { status });
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to update plant');
    }
  };

  const createAdmin = async () => {
    setSaving(true);
    setError('');
    try {
      await controlCenterAPI.createSuperAdmin(id, adminForm);
      setSuccess('Super Admin created — they log in at app.swarm.co.in');
      setAdminForm({ name: '', email: '', mobile: '', password: '' });
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to create Super Admin');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !detail) return <CircularProgress />;
  if (!detail) return <Alert severity="error">{error || 'Company not found'}</Alert>;

  return (
    <Box>
      <Button onClick={() => navigate('/companies')} sx={{ mb: 2 }}>Back to companies</Button>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>{detail.company.name}</Typography>
      <Chip size="small" label={detail.company.status} color={detail.company.status === 'ACTIVE' ? 'success' : 'default'} sx={{ mb: 1 }} />
      <CopyableId label="Tenant ID" value={detail.company.id} />
      <Box sx={{ display: 'flex', gap: 1, my: 2, flexWrap: 'wrap' }}>
        <TextField size="small" label="Tenant name" value={rename} onChange={(e) => setRename(e.target.value)} />
        <Button variant="outlined" disabled={!rename.trim() || saving} onClick={saveName}>Save name</Button>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Grid container spacing={3}>
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>Super Admin (company owner)</Typography>
              {detail.superAdmin ? (
                <Box>
                  <Typography>{detail.superAdmin.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{detail.superAdmin.email}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                    Logs in at app.swarm.co.in and grants Plant Admin / Operator access.
                  </Typography>
                </Box>
              ) : (
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField fullWidth label="Name" value={adminForm.name} onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })} />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth label="Email" type="email" value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth label="Mobile" value={adminForm.mobile} onChange={(e) => setAdminForm({ ...adminForm, mobile: e.target.value })} />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth label="Password" type="password" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} />
                  </Grid>
                  <Grid item xs={12}>
                    <Button variant="contained" disabled={saving || !adminForm.name || !adminForm.email || !adminForm.password} onClick={createAdmin}>
                      Create Super Admin
                    </Button>
                  </Grid>
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">Assign plants</Typography>
                <Button size="small" onClick={() => setPlantOpen(true)}>Create plant</Button>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Check every site this tenant should see in the Swarm app, then save. Plant IDs are what hardware uses in MQTT topics.
              </Typography>
              {assignablePlants.length === 0 && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  No unassigned plants.
                  <Button size="small" sx={{ ml: 1 }} onClick={() => navigate('/plants?tab=unassigned')}>
                    Open plant inventory
                  </Button>
                </Alert>
              )}
              {assignablePlants.map((p) => {
                const pid = plantKey(p);
                const checked = selected.includes(pid);
                const inputId = `assign-plant-${pid}`;
                return (
                  <Box
                    key={pid}
                    component="label"
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 1,
                      mb: 1,
                      p: 1,
                      borderRadius: 1,
                      cursor: 'pointer',
                      bgcolor: checked ? 'action.selected' : 'transparent',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Checkbox
                      id={inputId}
                      name={inputId}
                      checked={checked}
                      onChange={() => togglePlant(pid)}
                      sx={{ pt: 0 }}
                    />
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 600 }}>{p.plantName}</Typography>
                      <CopyableId label="Plant ID" value={p.plantId} />
                      {p.location && (
                        <Typography variant="body2" color="text.secondary">{p.location}</Typography>
                      )}
                      <Typography variant="caption" color="text.secondary">
                        {(p.activeNodes ?? 0)} connected sensor node{(p.activeNodes === 1) ? '' : 's'}
                        {p.status ? ` · ${p.status}` : ''}
                      </Typography>
                      {checked && (
                        <Box sx={{ mt: 0.5 }} onClick={(e) => e.preventDefault()}>
                          <Button size="small" onClick={() => setPlantStatus(p, p.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')}>
                            {p.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button size="small" onClick={() => navigate(`/devices?tenantId=${id}&plantId=${p.plantId}`)}>
                            Devices
                          </Button>
                        </Box>
                      )}
                    </Box>
                  </Box>
                );
              })}
              <Divider sx={{ my: 2 }} />
              <Button variant="contained" disabled={saving || assignablePlants.length === 0} onClick={savePlants}>
                Save plant assignment
              </Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Tenant users</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Read-only. Plant Admins and Operators are created by the Super Admin in the Swarm app.
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Sensor access</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(detail.users || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5}>No users yet. Create the Super Admin above.</TableCell>
                    </TableRow>
                  )}
                  {(detail.users || []).map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.role}</TableCell>
                      <TableCell>{u.status}</TableCell>
                      <TableCell>
                        {u.role === 'OPERATOR' && (u.nodeIds || []).length > 0
                          ? `${u.nodeIds.length} node(s)`
                          : `${(u.plantIds || []).length} plant(s)`}
                      </TableCell>
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
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="h6">Devices</Typography>
                <Button size="small" onClick={() => navigate(`/devices?tenantId=${id}`)}>Register device</Button>
              </Box>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Device UID</TableCell>
                    <TableCell>Plant</TableCell>
                    <TableCell>Kind</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {devices.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4}>No devices for this tenant yet.</TableCell>
                    </TableRow>
                  )}
                  {devices.map((d) => (
                    <TableRow key={d.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/devices/${d.id}`)}>
                      <TableCell sx={{ fontFamily: 'ui-monospace, monospace' }}>{d.deviceUid}</TableCell>
                      <TableCell>{d.plantName || d.plantId}</TableCell>
                      <TableCell>{d.deviceKind}</TableCell>
                      <TableCell>{d.connectionStatus || d.lifecycle}</TableCell>
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
              <Typography variant="h6" sx={{ mb: 1 }}>Sensors</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Connected nodes on this tenant’s plants and the unassigned pool. Access is who can see that node in the Swarm app.
                Super Admin assigns Plant Admins and Operators there — this list is read-only.
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Plant</TableCell>
                    <TableCell>Sensor</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Connection</TableCell>
                    <TableCell>Given access to</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(detail.sensors || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6}>No sensor nodes yet. Register a device and channels, or pair a hub in the Swarm app.</TableCell>
                    </TableRow>
                  )}
                  {(detail.sensors || []).map((s) => (
                    <TableRow key={s.nodeId}>
                      <TableCell>{s.plantName}</TableCell>
                      <TableCell>{s.nodeName}</TableCell>
                      <TableCell>{s.sensorType}</TableCell>
                      <TableCell>{s.status}</TableCell>
                      <TableCell>
                        {s.paired ? 'Paired' : 'Not paired'}
                        {s.hasReading ? ' · has readings' : ''}
                      </TableCell>
                      <TableCell>
                        {(s.access || []).length === 0
                          ? '—'
                          : s.access.map((g) => `${g.name} (${g.scope === 'NODE' ? 'this sensor' : 'all plant sensors'})`).join(', ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      <Dialog open={plantOpen} onClose={() => setPlantOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create plant under this tenant</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            sx={{ mt: 1 }}
            label="Plant name"
            value={plantForm.plantName}
            onChange={(e) => setPlantForm({ ...plantForm, plantName: e.target.value })}
          />
          <TextField
            select
            fullWidth
            sx={{ mt: 2 }}
            label="Type"
            value={plantForm.plantType}
            onChange={(e) => setPlantForm({ ...plantForm, plantType: e.target.value })}
          >
            <MenuItem value="BIOGAS">BIOGAS</MenuItem>
            <MenuItem value="BIO_CNG">BIO CNG</MenuItem>
            <MenuItem value="ORGANIC_WASTE">ORGANIC WASTE</MenuItem>
            <MenuItem value="WASTE_TO_ENERGY">WASTE TO ENERGY</MenuItem>
          </TextField>
          <TextField
            fullWidth
            sx={{ mt: 2 }}
            label="Location"
            value={plantForm.location}
            onChange={(e) => setPlantForm({ ...plantForm, location: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlantOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!plantForm.plantName.trim() || saving} onClick={createPlant}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
