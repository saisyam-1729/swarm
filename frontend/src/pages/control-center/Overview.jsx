// PURPOSE: Control Center platform overview — tenants, plants, devices, and IoT health.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Table, TableBody, TableCell,
  TableHead, TableRow, Button, Stack,
} from '@mui/material';
import {
  Business, Factory, HowToReg, PrecisionManufacturing, DevicesOther, CellTower,
  Sensors, CheckCircle, WarningAmber,
} from '@mui/icons-material';
import { controlCenterAPI } from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import DashboardStatCard from '../../components/common/DashboardStatCard';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import ErrorState from '../../components/common/ErrorState';
import EmptyState from '../../components/common/EmptyState';
import StatusBadge from '../../components/common/StatusBadge';
import { relativeTime } from '../../utils/sensorPresentation';

const TENANT_TILES = [
  { key: 'companiesTotal', label: 'Tenants', path: '/companies', hint: 'Companies buying Swarm', icon: <Business fontSize="small" />, color: 'primary' },
  { key: 'tenantsReady', label: 'Ready to operate', path: '/companies?filter=READY', hint: 'Admin + at least one plant', icon: <CheckCircle fontSize="small" />, color: 'success' },
  { key: 'tenantsNeedAdmin', label: 'Need Super Admin', path: '/companies?filter=NEEDS_ADMIN', hint: 'Cannot log in to the app yet', icon: <WarningAmber fontSize="small" />, color: 'warning' },
  { key: 'tenantsNeedPlants', label: 'Need plants', path: '/companies?filter=NEEDS_PLANTS', hint: 'Tenant exists, no sites assigned', icon: <Factory fontSize="small" />, color: 'info' },
  { key: 'plantsAssigned', label: 'Assigned plants', path: '/plants?tab=assigned', hint: 'Sites live under a tenant', icon: <Factory fontSize="small" />, color: 'primary' },
  { key: 'plantsUnassigned', label: 'Unassigned pool', path: '/plants?tab=unassigned', hint: 'Create then attach to a company', icon: <Factory fontSize="small" />, color: 'secondary' },
  { key: 'pendingApprovals', label: 'User approvals', path: '/approvals', hint: 'Sign-ups waiting for a tenant', icon: <HowToReg fontSize="small" />, color: 'warning' },
  { key: 'plantsHmiEnabled', label: 'HMI enabled', path: '/hmi-access', hint: 'Sites allowed to open Plant HMI', icon: <PrecisionManufacturing fontSize="small" />, color: 'info' },
];

export default function Overview() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [iot, setIot] = useState(null);
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      controlCenterAPI.overview(),
      controlCenterAPI.iotStatus().catch(() => ({ data: { data: null } })),
      controlCenterAPI.listDevices().catch(() => ({ data: { data: [] } })),
    ])
      .then(([overviewRes, iotRes, deviceRes]) => {
        setData(overviewRes.data.data);
        setIot(iotRes.data.data);
        setDevices(deviceRes.data.data || []);
        setError('');
      })
      .catch((e) => setError(e.response?.data?.message || 'Failed to load overview'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);

  const telemetry = useMemo(() => {
    const channelCount = devices.reduce((sum, d) => sum + (Array.isArray(d.channels) ? d.channels.length : 0), 0);
    const connected = devices.filter((d) => {
      const s = String(d.connectionStatus || '').toLowerCase();
      return s === 'connected' || s === 'live';
    }).length;
    const seen = devices.filter((d) => d.lastSeenAt).length;
    return { channelCount, connected, seen, total: devices.length };
  }, [devices]);

  const recentDevices = useMemo(() => {
    return [...devices]
      .sort((a, b) => new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0))
      .slice(0, 8);
  }, [devices]);

  if (loading && !data) return <LoadingSkeleton variant="stats" stats={8} />;

  return (
    <Box>
      <PageHeader
        title="Control Center"
        subtitle="Tenant onboarding, plant inventory, and platform-wide device connectivity. Plant monitoring stays in the Swarm app."
        actions={<Button onClick={load}>Refresh</Button>}
      />
      {error && <ErrorState description={error} onRetry={load} />}

      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Tenants & plants
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {TENANT_TILES.map((tile) => (
          <Grid item xs={12} sm={6} md={3} key={tile.key}>
            <DashboardStatCard
              label={tile.label}
              value={data?.[tile.key] ?? '—'}
              hint={tile.hint}
              icon={tile.icon}
              color={tile.color}
              onClick={() => navigate(tile.path)}
            />
          </Grid>
        ))}
      </Grid>
      {data?.companiesDisabled > 0 && (
        <Chip
          sx={{ mb: 3 }}
          label={`${data.companiesDisabled} disabled tenant(s)`}
          onClick={() => navigate('/companies?filter=DISABLED')}
        />
      )}

      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Platform connectivity
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <DashboardStatCard
            label="Registered devices"
            value={telemetry.total}
            hint={`${telemetry.connected} connected · ${telemetry.seen} seen`}
            icon={<DevicesOther fontSize="small" />}
            onClick={() => navigate('/devices')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <DashboardStatCard
            label="Discovered channels"
            value={telemetry.channelCount}
            hint="Logical sensors reported by devices"
            icon={<Sensors fontSize="small" />}
            color="secondary"
            onClick={() => navigate('/devices')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <DashboardStatCard
            label="MQTT broker"
            value={iot?.connected ? 'Connected' : iot?.enabled ? 'Disconnected' : 'Disabled'}
            hint={iot?.brokerUrl || 'Not configured'}
            icon={<CellTower fontSize="small" />}
            color={iot?.connected ? 'success' : 'warning'}
            onClick={() => navigate('/iot')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <DashboardStatCard
            label="Ingest"
            value={iot?.messagesReceived ?? '—'}
            hint={`${iot?.failures ?? 0} failures`}
            icon={<CellTower fontSize="small" />}
            onClick={() => navigate('/iot')}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle1" fontWeight={700}>Recent device activity</Typography>
                <Button size="small" onClick={() => navigate('/devices')}>All devices</Button>
              </Stack>
              {recentDevices.length === 0 ? (
                <EmptyState
                  compact
                  title="No devices registered"
                  description="Register a gateway against a tenant plant, or wait for pairing from the Swarm app."
                  actionLabel="Register device"
                  onAction={() => navigate('/devices')}
                />
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Device</TableCell>
                      <TableCell>Tenant / plant</TableCell>
                      <TableCell>Channels</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Last seen</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentDevices.map((d) => (
                      <TableRow key={d.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/devices/${d.id}`)}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{d.deviceName || d.deviceUid}</Typography>
                          <Typography variant="caption" color="text.secondary" fontFamily="IBM Plex Mono, monospace">
                            {d.deviceUid}
                          </Typography>
                        </TableCell>
                        <TableCell>{[d.tenantName, d.plantName].filter(Boolean).join(' · ') || '—'}</TableCell>
                        <TableCell>{(d.channels || []).length}</TableCell>
                        <TableCell><StatusBadge status={d.connectionStatus || d.lifecycle} /></TableCell>
                        <TableCell>{relativeTime(d.lastSeenAt) || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>MQTT health</Typography>
              {!iot ? (
                <EmptyState compact title="IoT status unavailable" description="The broker status endpoint did not return data." />
              ) : (
                <>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                    <StatusBadge status={iot.enabled ? 'ENABLED' : 'DISABLED'} />
                    <StatusBadge status={iot.configured ? 'READY' : 'UNKNOWN'} label={iot.configured ? 'Configured' : 'Not configured'} />
                    <StatusBadge status={iot.connected ? 'CONNECTED' : 'DISCONNECTED'} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Protocol {iot.protocolVersion || '—'}. Last message {relativeTime(iot.lastMessageAt) || 'none yet'}.
                  </Typography>
                  {(iot.recentRejections || []).slice(0, 4).map((row, index) => (
                    <Box key={`${row.receivedAt}-${index}`} sx={{ mt: 1.5, py: 1, borderTop: 1, borderColor: 'divider' }}>
                      <Typography variant="body2" fontWeight={600}>{row.reasonCode}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {[row.deviceUid, row.reasonDetail].filter(Boolean).join(' — ')}
                      </Typography>
                    </Box>
                  ))}
                  {(iot.recentRejections || []).length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                      No rejected ingest attempts recorded.
                    </Typography>
                  )}
                  <Button size="small" sx={{ mt: 2 }} onClick={() => navigate('/iot')}>Open MQTT / IoT</Button>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
