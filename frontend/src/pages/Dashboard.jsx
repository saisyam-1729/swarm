// PURPOSE: Plant live-monitoring dashboard driven entirely by backend collections.
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Grid, Card, CardContent, Typography, Chip, Select, MenuItem,
  FormControl, InputLabel, CircularProgress, LinearProgress, Button, Alert,
} from '@mui/material';
import {
  Warning, PrecisionManufacturing, ArrowForward, Sensors as SensorsIcon,
  DevicesOther, Favorite, ShowChart, CellTower,
} from '@mui/icons-material';
import { plantAPI, dashboardAPI, alertAPI, deviceAPI, hmiAPI, sensorAPI, fieldDeviceAPI } from '../services/api';
import { fetchEspStatus } from '../utils/espClient';
import { getHealthColor } from '../utils/constants';
import useSensorCatalog from '../utils/useSensorCatalog';
import { responsiveSelect } from '../utils/responsive';
import useCollection from '../utils/useCollection';
import EmptyState from '../components/common/EmptyState';
import ErrorState from '../components/common/ErrorState';
import PageHeader from '../components/common/PageHeader';
import DashboardStatCard from '../components/common/DashboardStatCard';
import LoadingSkeleton from '../components/common/LoadingSkeleton';
import SearchAndFilter from '../components/common/SearchAndFilter';
import SensorGrid from '../components/telemetry/SensorGrid';
import SensorTable from '../components/telemetry/SensorTable';
import DeviceCard from '../components/telemetry/DeviceCard';
import AlertList from '../components/telemetry/AlertList';
import { readingFreshness } from '../utils/sensorPresentation';
import { useFeedback } from '../context/FeedbackContext';

const DASHBOARD_POLL_MS = 10000;
const LAN_ESP_SYNC_MS = 10000;
const SENSOR_PAGE_SIZE = 24;

export default function Dashboard({ fixedPlantId, embedded = false, hidePlantSelector = false }) {
  const { notify } = useFeedback();
  const navigate = useNavigate();
  const [plants, setPlants] = useState([]);
  const [selectedPlant, setSelectedPlant] = useState(fixedPlantId || '');
  const [dashboard, setDashboard] = useState(null);
  const [hmiState, setHmiState] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncingChip, setSyncingChip] = useState('');
  const [loadError, setLoadError] = useState('');
  const [sensorView, setSensorView] = useState('grid');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const { labels, units } = useSensorCatalog();

  const fetchData = () => {
    if (!selectedPlant) return;
    setLoadError('');
    Promise.all([
      dashboardAPI.getDashboard(selectedPlant).then(({ data }) => setDashboard(data.data)).catch(() => {
        setLoadError('Unable to load dashboard data. Retrying…');
      }),
      alertAPI.getAll({ plantId: selectedPlant, status: 'ACTIVE' })
        .then(({ data }) => setAlerts(data.data || []))
        .catch(() => {}),
      sensorAPI.getByPlant(selectedPlant)
        .then(({ data }) => setNodes(data.data || []))
        .catch(() => setNodes([])),
      fieldDeviceAPI.list(selectedPlant)
        .then(({ data }) => setHubs(data.data || []))
        .catch(() => setHubs([])),
    ]);
    const plant = plants.find((p) => Number(p.plantId) === Number(selectedPlant));
    if (plant?.hmiEnabled) {
      hmiAPI.getState(selectedPlant).then(({ data }) => setHmiState(data.data)).catch(() => setHmiState(null));
    } else {
      setHmiState(null);
    }
  };

  useEffect(() => {
    if (fixedPlantId) {
      setSelectedPlant(Number(fixedPlantId));
      setLoading(false);
      return;
    }
    plantAPI.getAll().then(({ data }) => {
      const list = data.data || [];
      setPlants(list);
      const pairedPlant = sessionStorage.getItem('dashboardPlantId');
      if (pairedPlant && list.some((p) => p.plantId === Number(pairedPlant))) {
        setSelectedPlant(Number(pairedPlant));
        sessionStorage.removeItem('dashboardPlantId');
      } else if (list.length > 0) {
        setSelectedPlant(list[0].plantId);
      }
    }).finally(() => setLoading(false));
  }, [fixedPlantId]);

  useEffect(() => {
    if (!selectedPlant) return undefined;
    fetchData();
    const interval = setInterval(fetchData, DASHBOARD_POLL_MS);
    return () => clearInterval(interval);
  }, [selectedPlant, plants]);

  useEffect(() => {
    if (!selectedPlant) return undefined;
    const creds = JSON.parse(sessionStorage.getItem('espCreds') || '{}');
    if (!creds.password) return undefined;

    const syncFromLan = async () => {
      const ip = creds.ip;
      if (!ip || !creds.chipId) return;
      try {
        const status = await fetchEspStatus(ip, creds.password);
        await deviceAPI.syncReadings({
          ip,
          password: creds.password,
          plantId: selectedPlant,
          chipId: creds.chipId,
          status: { dht: status.dht, mq5: status.mq5, rssi: status.rssi },
        });
        fetchData();
      } catch {
        /* ESP unreachable from this browser — cloud ingest still applies */
      }
    };

    syncFromLan();
    const interval = setInterval(syncFromLan, LAN_ESP_SYNC_MS);
    return () => clearInterval(interval);
  }, [selectedPlant]);

  const handleSyncDevice = async (device) => {
    const creds = JSON.parse(sessionStorage.getItem('espCreds') || '{}');
    const ip = device.deviceIp || device.lastIp || creds.ip;
    const password = creds.password;
    if (!ip || !password) {
      // UX-CHANGE UX-02 (toast instead of browser alert). Original: window.alert('Re-pair the hub from Field Devices → Pair Sensor Hub to refresh readings (device password required).');
      notify('Re-pair the hub from Field Devices → Pair Sensor Hub to refresh readings (device password required).', 'warning');
      return;
    }
    const chip = device.chipId || device.deviceUid;
    setSyncingChip(chip);
    try {
      const status = await fetchEspStatus(ip, password);
      await deviceAPI.syncReadings({
        ip,
        password,
        plantId: device.plantId || selectedPlant,
        chipId: device.chipId,
        status: { dht: status.dht, mq5: status.mq5, rssi: status.rssi },
      });
      fetchData();
    } catch (e) {
      // UX-CHANGE UX-02 (toast instead of browser alert). Original: window.alert(e.response?.data?.message || e.message || 'Failed to sync readings from ESP');
      notify(e.response?.data?.message || e.message || 'Failed to sync readings from ESP', 'error');
    } finally {
      setSyncingChip('');
    }
  };

  const devices = useMemo(() => {
    if (hubs.length > 0) return hubs;
    return (dashboard?.pairedDevices || []).map((d) => ({
      ...d,
      channels: [],
      lastIp: d.deviceIp,
      connectionStatus: d.status,
    }));
  }, [hubs, dashboard]);

  const sensorTypes = useMemo(
    () => [...new Set(nodes.map((n) => n.sensorType).filter(Boolean))].sort(),
    [nodes],
  );

  const nodeFilters = useMemo(() => {
    const next = {};
    if (typeFilter !== 'ALL') next.sensorType = typeFilter;
    return next;
  }, [typeFilter]);

  const statusAwareNodes = useMemo(() => {
    if (statusFilter === 'ALL') return nodes;
    return nodes.filter((n) => {
      const freshness = readingFreshness(n.lastReadingAt);
      if (statusFilter === 'LIVE') return freshness === 'LIVE';
      if (statusFilter === 'STALE') return freshness === 'STALE';
      if (statusFilter === 'NO_DATA') return freshness === 'NO_DATA';
      if (statusFilter === 'OFFLINE') return n.status === 'OFFLINE' || freshness === 'STALE';
      return String(n.status) === statusFilter;
    });
  }, [nodes, statusFilter]);

  const sensors = useCollection(statusAwareNodes, {
    searchKeys: ['nodeName', 'sensorType', 'deviceChipId', 'plantName'],
    initialSortKey: 'nodeName',
    pageSize: SENSOR_PAGE_SIZE,
    filters: nodeFilters,
  });

  const liveCount = nodes.filter((n) => readingFreshness(n.lastReadingAt) === 'LIVE').length;
  const selectedPlantMeta = plants.find((p) => Number(p.plantId) === Number(selectedPlant));
  const hasHealthScore = dashboard?.healthScore != null;
  const healthScore = hasHealthScore ? dashboard.healthScore : 0;
  const healthStatus = dashboard?.healthStatus || null;
  const showGas = dashboard?.gasProduction != null;

  if (loading) {
    return (
      <Box>
        <LoadingSkeleton variant="stats" stats={4} />
        <Box sx={{ mt: 3 }}><LoadingSkeleton variant="cards" count={8} /></Box>
      </Box>
    );
  }

  if (!selectedPlant) {
    return (
      <Box>
        {!embedded && (
          <PageHeader
            title="Live monitoring"
            subtitle="Tenant plants, devices, and discovered sensors appear here after Control Center assigns a site."
          />
        )}
        <EmptyState
          title="No plants assigned"
          description="Control Center needs to create a tenant, Super Admin, and plant before live readings appear here."
        />
      </Box>
    );
  }

  return (
    <Box>
      {(!embedded || !hidePlantSelector) && (
        <PageHeader
          hidden={embedded}
          title="Live monitoring"
          subtitle="Readings, nodes, and devices update from backend telemetry. New sensors appear automatically after ingest."
          actions={!hidePlantSelector && (
            <FormControl size="small" sx={responsiveSelect}>
              <InputLabel>Plant</InputLabel>
              <Select value={selectedPlant} label="Plant" onChange={(e) => setSelectedPlant(e.target.value)}>
                {plants.map((p) => (
                  <MenuItem key={p.plantId} value={p.plantId}>{p.plantName}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        />
      )}

      {loadError && <ErrorState severity="warning" description={loadError} onRetry={fetchData} />}

      {hmiState && (
        <Card sx={{ mb: 3, bgcolor: 'navy', color: 'white', backgroundImage: 'linear-gradient(135deg, #0B1220 0%, #0B6E99 100%)' }}>
          <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <PrecisionManufacturing sx={{ fontSize: 40, opacity: 0.9 }} />
              <Box>
                <Typography variant="h6" fontWeight={700}>Plant HMI</Typography>
                <Typography variant="body2" sx={{ opacity: 0.85 }}>
                  Interactive process view for this site
                </Typography>
                <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Chip
                    size="small"
                    label={hmiState.plantPowered ? 'Plant power ON' : 'Plant power OFF'}
                    sx={{ bgcolor: hmiState.plantPowered ? 'success.dark' : 'rgba(255,255,255,0.15)', color: 'white' }}
                  />
                  <Chip
                    size="small"
                    label={`${hmiState.runningCount ?? 0} equipment running`}
                    sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: 'white' }}
                  />
                </Box>
              </Box>
            </Box>
            <Button
              variant="contained"
              endIcon={<ArrowForward />}
              onClick={() => navigate(`/plant-hmi?plantId=${selectedPlant}`)}
              sx={{ bgcolor: 'white', color: 'primary.main', '&:hover': { bgcolor: '#f0f0f0' } }}
            >
              Open HMI
            </Button>
          </CardContent>
        </Card>
      )}

      {!hmiState && selectedPlantMeta?.hmiEnabled === false && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Plant HMI is off for this site until Control Center enables it.
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={showGas ? 2.4 : 3}>
          <Card sx={{ height: '100%', bgcolor: hasHealthScore ? getHealthColor(healthStatus) : 'action.hover', color: hasHealthScore ? 'white' : 'text.primary' }}>
            <CardContent>
              <Typography variant="caption" sx={{ opacity: 0.85, fontWeight: 600 }}>Plant health</Typography>
              <Typography variant="h4" fontWeight={700}>
                {hasHealthScore ? `${healthScore}` : '—'}
                {hasHealthScore && <Typography component="span" variant="body2"> / 100</Typography>}
              </Typography>
              <Chip
                size="small"
                label={hasHealthScore ? healthStatus : 'No score yet'}
                sx={{ mt: 1, bgcolor: hasHealthScore ? 'rgba(255,255,255,0.2)' : undefined, color: hasHealthScore ? 'white' : undefined }}
              />
              <LinearProgress
                variant="determinate"
                value={hasHealthScore ? healthScore : 0}
                sx={{
                  mt: 1.5, height: 6, borderRadius: 3,
                  bgcolor: hasHealthScore ? 'rgba(255,255,255,0.3)' : undefined,
                  '& .MuiLinearProgress-bar': { bgcolor: hasHealthScore ? 'white' : undefined },
                }}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3} md={showGas ? 2.4 : 3}>
          <DashboardStatCard
            label="Active alerts"
            value={dashboard?.activeAlerts ?? alerts.length}
            icon={<Warning fontSize="small" />}
            color="error"
            onClick={() => navigate('/alerts')}
            hint="Open incidents"
          />
        </Grid>
        <Grid item xs={6} sm={3} md={showGas ? 2.4 : 3}>
          <DashboardStatCard
            label="Nodes"
            value={`${dashboard?.activeNodes ?? liveCount}/${dashboard?.totalNodes ?? nodes.length}`}
            icon={<SensorsIcon fontSize="small" />}
            color="primary"
            hint={`${liveCount} live now`}
          />
        </Grid>
        <Grid item xs={6} sm={3} md={showGas ? 2.4 : 3}>
          <DashboardStatCard
            label="Devices"
            value={devices.length}
            icon={<DevicesOther fontSize="small" />}
            color="secondary"
            hint="Registered hubs and gateways"
            onClick={() => navigate('/sensors?tab=hubs')}
          />
        </Grid>
        {showGas && (
          <Grid item xs={6} sm={3} md={2.4}>
            <DashboardStatCard
              label="Gas production"
              value={Number(dashboard.gasProduction).toFixed(1)}
              suffix="m³/h"
              icon={<ShowChart fontSize="small" />}
              color="success"
            />
          </Grid>
        )}
      </Grid>

      <PageHeader
        title="Registered devices"
        subtitle="Hubs and gateways reported by the backend for this plant."
        actions={(
          <Button size="small" startIcon={<CellTower />} onClick={() => navigate('/sensors')}>
            View devices
          </Button>
        )}
      />
      {devices.length === 0 ? (
        <Card sx={{ mb: 3 }}>
          <EmptyState
            title="No devices on this plant"
            description="Control Center assigns devices to this plant. After the hardware publishes telemetry, they appear here automatically."
            actionLabel="View devices"
            onAction={() => navigate('/sensors')}
            compact
          />
        </Card>
      ) : (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {devices.map((device) => (
            <Grid item xs={12} md={6} lg={4} key={device.id || device.chipId || device.deviceUid}>
              <DeviceCard
                device={device}
                labels={labels}
                units={units}
                onOpen={(d) => d.id && navigate(`/sensors/${d.id}`)}
                onSync={handleSyncDevice}
                syncing={syncingChip === (device.chipId || device.deviceUid)}
              />
            </Grid>
          ))}
        </Grid>
      )}

      <PageHeader
        title="Discovered sensors"
        subtitle="Every node and channel returned by the backend is listed. Counts update as telemetry arrives."
      />
      <SearchAndFilter
        search={sensors.search}
        onSearch={sensors.setSearch}
        searchPlaceholder="Search sensors, tags, chip IDs…"
        view={sensorView}
        onViewChange={setSensorView}
        sortKey={sensors.sortKey}
        sortDir={sensors.sortDir}
        onSortKey={sensors.toggleSort}
        sortOptions={[
          { value: 'nodeName', label: 'Name' },
          { value: 'sensorType', label: 'Type' },
          { value: 'lastValue', label: 'Reading' },
          { value: 'lastReadingAt', label: 'Updated' },
        ]}
        filters={[
          {
            key: 'sensorType',
            label: 'Type',
            value: typeFilter,
            onChange: setTypeFilter,
            options: [
              { value: 'ALL', label: 'All types' },
              ...sensorTypes.map((t) => ({ value: t, label: labels[t] || t })),
            ],
          },
          {
            key: 'status',
            label: 'Status',
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: 'ALL', label: 'All statuses' },
              { value: 'LIVE', label: 'Live' },
              { value: 'STALE', label: 'Stale' },
              { value: 'NO_DATA', label: 'No data' },
              { value: 'OFFLINE', label: 'Offline' },
            ],
          },
        ]}
        countLabel={`${sensors.filteredCount} of ${sensors.total}`}
      />

      {nodes.length === 0 && !loadError ? (
        <Card sx={{ mb: 3 }}>
          <EmptyState
            title="No sensors discovered yet"
            description="When authenticated telemetry introduces a new channel, it appears here without a manual sensor form."
            icon={<Favorite />}
            compact
          />
        </Card>
      ) : sensorView === 'grid' ? (
        <Box sx={{ mb: 3 }}>
          <SensorGrid
            sensors={sensors.items}
            labels={labels}
            units={units}
            page={sensors.page}
            pageCount={sensors.pageCount}
            total={sensors.total}
            filteredCount={sensors.filteredCount}
            onPage={sensors.setPage}
            pageSize={SENSOR_PAGE_SIZE}
          />
        </Box>
      ) : (
        <Card sx={{ mb: 3 }}>
          <SensorTable
            sensors={sensors.items}
            labels={labels}
            units={units}
            sortKey={sensors.sortKey}
            sortDir={sensors.sortDir}
            onSort={sensors.toggleSort}
            page={sensors.page}
            pageCount={sensors.pageCount}
            total={sensors.total}
            filteredCount={sensors.filteredCount}
            onPage={sensors.setPage}
            pageSize={SENSOR_PAGE_SIZE}
          />
        </Card>
      )}

      <PageHeader title="Active alerts" />
      <Card>
        <CardContent>
          <AlertList
            alerts={alerts}
            maxItems={8}
            emptyTitle="No active alerts"
            emptyDescription="Plant operating without open incidents."
          />
          {alerts.length > 0 && (
            <Button size="small" sx={{ mt: 1 }} onClick={() => navigate('/alerts')}>
              View all alerts
            </Button>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
