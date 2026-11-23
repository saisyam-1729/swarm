// PURPOSE: Plant Super Admin view of an assigned device, discovered sensors, and telemetry.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, FormControl, Grid, InputLabel,
  MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { dashboardAPI, fieldDeviceAPI } from '../services/api';
import useSensorCatalog from '../utils/useSensorCatalog';
import PageHeader from '../components/common/PageHeader';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSkeleton from '../components/common/LoadingSkeleton';
import ErrorState from '../components/common/ErrorState';
import EmptyState from '../components/common/EmptyState';
import TelemetryChart from '../components/telemetry/TelemetryChart';
import { formatReading, relativeTime } from '../utils/sensorPresentation';
import { format, subDays, subHours, subMonths, subWeeks } from 'date-fns';

export default function FieldDeviceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { labels, units } = useSensorCatalog();
  const [device, setDevice] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('day');
  const [sensorType, setSensorType] = useState('');
  const [chartData, setChartData] = useState([]);
  const [chartError, setChartError] = useState('');
  const [chartLoading, setChartLoading] = useState(false);

  const load = () => {
    setLoading(true);
    fieldDeviceAPI.get(id)
      .then(({ data }) => {
        setDevice(data.data);
        setError('');
      })
      .catch((e) => {
        const status = e.response?.status;
        setDevice(null);
        setError(status === 403
          ? 'You do not have access to this device.'
          : (e.response?.data?.message || 'Device not found'));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const channels = device?.channels || [];
  const sensorTypes = useMemo(
    () => [...new Set(channels.map((c) => c.measurementType).filter(Boolean))],
    [channels],
  );

  useEffect(() => {
    if (sensorTypes.length && !sensorTypes.includes(sensorType)) {
      setSensorType(sensorTypes[0]);
    }
  }, [sensorTypes, sensorType]);

  useEffect(() => {
    if (!device?.plantId || !sensorType) {
      setChartData([]);
      return undefined;
    }
    let first = true;
    const loadChart = () => {
      if (first) setChartLoading(true);
      const now = new Date();
      const ranges = { hour: subHours(now, 1), day: subDays(now, 1), week: subWeeks(now, 1), month: subMonths(now, 1) };
      const start = ranges[range] || subDays(now, 1);
      return dashboardAPI.getAnalytics(device.plantId, {
        sensorType,
        start: start.toISOString(),
        end: now.toISOString(),
      }).then(({ data }) => {
        setChartData((data.data || []).map((r) => ({
          time: format(new Date(r.recordedAt), range === 'hour' ? 'HH:mm' : 'MMM dd HH:mm'),
          value: r.value,
          unit: r.unit,
        })));
        setChartError('');
      }).catch((e) => {
        setChartData([]);
        setChartError(e.response?.status === 403
          ? 'You do not have access to this plant telemetry.'
          : (e.response?.data?.message || 'Unable to load telemetry history.'));
      }).finally(() => {
        first = false;
        setChartLoading(false);
      });
    };
    loadChart();
    const interval = setInterval(loadChart, 15000);
    return () => clearInterval(interval);
  }, [device?.plantId, sensorType, range]);

  if (loading && !device) return <LoadingSkeleton variant="cards" count={3} />;
  if (!device) {
    return (
      <Box>
        <Button onClick={() => navigate('/sensors')} sx={{ mb: 2 }}>Back to devices</Button>
        <ErrorState description={error || 'Device not found'} onRetry={load} />
      </Box>
    );
  }

  const nodeIds = [...new Set(channels.map((c) => c.sensorNodeId).filter(Boolean))];

  return (
    <Box>
      <Button onClick={() => navigate('/sensors')} sx={{ mb: 2 }}>Back to devices</Button>
      <PageHeader
        title={device.deviceName || device.deviceUid}
        subtitle={`${device.plantName || `Plant ${device.plantId}`} · assigned by Control Center. Nodes and sensors appear from authenticated telemetry.`}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <StatusBadge status={device.status || device.connectionStatus} />
        <StatusBadge status={device.provisioningStatus || device.lifecycle} variant="outlined" />
        <StatusBadge status={`${device.sensorCount ?? channels.length} sensors`} variant="outlined" />
        <StatusBadge status={`${device.nodeCount ?? nodeIds.length} nodes`} variant="outlined" />
      </Stack>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Identity</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>UID {device.deviceUid}</Typography>
              <Typography variant="body2" color="text.secondary">Plant ID {device.plantId}</Typography>
              {device.tenantId && (
                <Typography variant="body2" color="text.secondary">Tenant {device.tenantId}</Typography>
              )}
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Last telemetry: {relativeTime(device.lastSeenAt) || 'None yet'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Connection</Typography>
              <Typography variant="body2">{device.deviceKind?.replaceAll('_', ' ')}</Typography>
              <Typography variant="body2" color="text.secondary">
                Firmware {device.firmwareVersion || '—'} · config v{device.configVersion ?? '—'}
              </Typography>
              {device.lastIp && (
                <Typography variant="body2" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>{device.lastIp}</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6">Discovered nodes and sensors</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Physical GPIO mapping is not configured in SWARM. New channel IDs appear automatically.
              </Typography>
              {channels.length === 0 ? (
                <EmptyState
                  title="Awaiting first telemetry"
                  description="When the hardware publishes an authenticated payload, sensors appear here without a second pairing step."
                  compact
                />
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Channel</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Tag</TableCell>
                      <TableCell>Node</TableCell>
                      <TableCell>Reading</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {channels.map((c) => (
                      <TableRow key={c.id || c.channelId}>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>{c.channelId}</TableCell>
                        <TableCell>{labels[c.measurementType] || c.measurementType}</TableCell>
                        <TableCell>{c.instrumentTag || '—'}</TableCell>
                        <TableCell>{c.sensorNodeId || '—'}</TableCell>
                        <TableCell>
                          {c.lastValue != null
                            ? `${formatReading(c.lastValue)}${c.engineeringUnit || units[c.measurementType] ? ` ${c.engineeringUnit || units[c.measurementType]}` : ''}`
                            : '—'}
                        </TableCell>
                        <TableCell><StatusBadge status={c.dataStatus || (c.active ? 'ACTIVE' : 'INACTIVE')} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems={{ sm: 'center' }}>
                <Typography variant="h6" sx={{ flex: 1 }}>Telemetry history</Typography>
                {sensorTypes.length > 0 && (
                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel>Sensor</InputLabel>
                    <Select value={sensorType} label="Sensor" onChange={(e) => setSensorType(e.target.value)}>
                      {sensorTypes.map((t) => <MenuItem key={t} value={t}>{labels[t] || t}</MenuItem>)}
                    </Select>
                  </FormControl>
                )}
                <ToggleButtonGroup value={range} exclusive onChange={(_, v) => v && setRange(v)} size="small">
                  <ToggleButton value="hour">Hour</ToggleButton>
                  <ToggleButton value="day">Day</ToggleButton>
                  <ToggleButton value="week">Week</ToggleButton>
                  <ToggleButton value="month">Month</ToggleButton>
                </ToggleButtonGroup>
                <Button size="small" onClick={() => navigate('/analytics')}>Open analytics</Button>
              </Stack>
              {chartLoading ? (
                <LoadingSkeleton variant="table" count={4} />
              ) : chartError ? (
                <ErrorState description={chartError} />
              ) : (
                <TelemetryChart
                  data={chartData}
                  name={labels[sensorType] || sensorType || 'Reading'}
                  unit={chartData[0]?.unit || units[sensorType]}
                />
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
