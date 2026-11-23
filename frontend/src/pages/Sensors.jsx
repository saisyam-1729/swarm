// PURPOSE: Dynamic field-device inventory: hubs, discovered sensors, and pairing.
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Button, Card, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Grid, FormControl, InputLabel, Select,
  Alert, Tabs, Tab, CardContent,
} from '@mui/material';
import { Edit, PowerSettingsNew, Delete } from '@mui/icons-material';
import { sensorAPI, plantAPI, fieldDeviceAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getSensorTypesForPlant } from '../utils/constants';
import useSensorCatalog from '../utils/useSensorCatalog';
import { responsiveSelect } from '../utils/responsive';
import useCollection from '../utils/useCollection';
import ConnectDevice from './ConnectDevice';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';
import ErrorState from '../components/common/ErrorState';
import LoadingSkeleton from '../components/common/LoadingSkeleton';
import SearchAndFilter from '../components/common/SearchAndFilter';
import CollectionPager from '../components/common/CollectionPager';
import StatusBadge from '../components/common/StatusBadge';
import SensorGrid from '../components/telemetry/SensorGrid';
import SensorTable from '../components/telemetry/SensorTable';
import DeviceCard from '../components/telemetry/DeviceCard';
import { formatReading, readingFreshness } from '../utils/sensorPresentation';

const emptyForm = {
  plantId: '',
  nodeName: '',
  sensorType: 'TEMPERATURE',
  status: 'ACTIVE',
};

function tabFromParams(searchParams) {
  const t = searchParams.get('tab');
  if (t === 'pair' || t === 'inventory') return t;
  return 'hubs';
}

const PAGE_SIZE = 24;

export default function Sensors({ fixedPlantId, embedded = false, hidePlantSelector = false }) {
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabFromParams(searchParams);

  const [nodes, setNodes] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ ...emptyForm, plantId: fixedPlantId || '' });
  const [filterPlant, setFilterPlant] = useState(fixedPlantId || '');
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState('grid');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const setTab = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'pair' || next === 'inventory') params.set('tab', next);
    else params.delete('tab');
    setSearchParams(params, { replace: true });
  };

  const loadData = () => {
    const plantId = fixedPlantId || filterPlant || undefined;
    Promise.all([
      sensorAPI.getAll(),
      plantAPI.getAll(),
      fieldDeviceAPI.list(plantId || undefined).catch(() => ({ data: { data: [] } })),
    ])
      .then(([nodesRes, plantsRes, hubsRes]) => {
        setNodes(nodesRes.data.data || []);
        setHubs(hubsRes.data.data || []);
        const list = plantsRes.data.data || [];
        setPlants(fixedPlantId ? list.filter((p) => p.plantId === Number(fixedPlantId)) : list);
        if (fixedPlantId) setFilterPlant(Number(fixedPlantId));
        setLoadError('');
      })
      .catch(() => setLoadError('Unable to load sensor inventory. The API is reachable if you can open other pages.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [fixedPlantId, filterPlant]);

  const { types, labels, units } = useSensorCatalog();
  const plantFiltered = filterPlant ? nodes.filter((n) => n.plantId === Number(filterPlant)) : nodes;
  const selectedPlant = plants.find((p) => p.plantId === Number(form.plantId));
  const installedTypes = [...new Set(plantFiltered.map((n) => n.sensorType).filter(Boolean))];
  const sensorTypeOptions = installedTypes.length
    ? [...new Set([...getSensorTypesForPlant(selectedPlant, types), ...installedTypes])]
    : getSensorTypesForPlant(selectedPlant, types);

  const statusAware = useMemo(() => {
    if (statusFilter === 'ALL') return plantFiltered;
    return plantFiltered.filter((n) => {
      const freshness = readingFreshness(n.lastReadingAt);
      if (statusFilter === 'LIVE') return freshness === 'LIVE';
      if (statusFilter === 'STALE') return freshness === 'STALE';
      if (statusFilter === 'NO_DATA') return freshness === 'NO_DATA';
      return String(n.status) === statusFilter;
    });
  }, [plantFiltered, statusFilter]);

  const collection = useCollection(statusAware, {
    searchKeys: ['nodeName', 'sensorType', 'deviceChipId', 'plantName', 'deviceIp'],
    initialSortKey: 'nodeName',
    pageSize: PAGE_SIZE,
    filters: typeFilter === 'ALL' ? {} : { sensorType: typeFilter },
  });

  const hubCollection = useCollection(hubs, {
    searchKeys: ['deviceName', 'deviceUid', 'chipId', 'plantName', 'status', 'lifecycle'],
    initialSortKey: 'deviceName',
    pageSize: PAGE_SIZE,
  });

  const handleSave = async () => {
    const payload = {
      plantId: Number(form.plantId),
      nodeName: form.nodeName,
      sensorType: form.sensorType,
      status: form.status || 'ACTIVE',
    };
    if (editId) await sensorAPI.update(editId, payload);
    else await sensorAPI.create(payload);
    setDialogOpen(false);
    loadData();
  };

  const handleToggle = async (id, currentStatus) => {
    await sensorAPI.toggle(id, currentStatus !== 'ACTIVE');
    loadData();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this instrument from the plant inventory?')) return;
    await sensorAPI.delete(id);
    loadData();
  };

  if (loading) return <LoadingSkeleton variant="cards" count={8} />;

  return (
    <Box>
      <PageHeader
        hidden={embedded}
        title="Field devices"
        subtitle="Devices assigned to your plants by Control Center. Nodes and sensors appear automatically from authenticated telemetry."
        actions={(
          <>
            {!hidePlantSelector && tab !== 'pair' && (
              <FormControl size="small" sx={responsiveSelect}>
                <InputLabel>Plant</InputLabel>
                <Select value={filterPlant} label="Plant" onChange={(e) => setFilterPlant(e.target.value)}>
                  <MenuItem value="">All plants</MenuItem>
                  {plants.map((p) => <MenuItem key={p.plantId} value={p.plantId}>{p.plantName}</MenuItem>)}
                </Select>
              </FormControl>
            )}
          </>
        )}
      />

      <Tabs
        value={tab}
        onChange={(_e, value) => setTab(value)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="hubs" label={`Devices (${hubs.length})`} />
        <Tab value="inventory" label={`Sensors (${plantFiltered.length})`} />
        <Tab value="pair" label="Legacy ESP pair" />
      </Tabs>

      {loadError && <ErrorState severity="warning" description={loadError} onRetry={loadData} />}

      {tab === 'hubs' && (
        hubs.length === 0 ? (
          <Card>
            <EmptyState
              title="No devices assigned yet"
              description="Control Center registers and assigns devices to your tenant and plants. After the hardware publishes telemetry, they appear here automatically — there is no second pairing step."
            />
          </Card>
        ) : (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <SearchAndFilter
                search={hubCollection.search}
                onSearch={hubCollection.setSearch}
                searchPlaceholder="Search device UID, name, plant…"
                sortKey={hubCollection.sortKey}
                sortDir={hubCollection.sortDir}
                onSortKey={hubCollection.toggleSort}
                sortOptions={[
                  { value: 'deviceName', label: 'Name' },
                  { value: 'deviceUid', label: 'UID' },
                  { value: 'status', label: 'Status' },
                  { value: 'lastSeenAt', label: 'Last seen' },
                ]}
                countLabel={`${hubCollection.filteredCount} of ${hubCollection.total}`}
              />
            </Grid>
            {hubCollection.items.map((h) => (
              <Grid item xs={12} md={6} lg={4} key={h.id}>
                <DeviceCard
                  device={h}
                  labels={labels}
                  units={units}
                  onOpen={(d) => navigate(`/sensors/${d.id}`)}
                />
              </Grid>
            ))}
            <Grid item xs={12}>
              <CollectionPager
                page={hubCollection.page}
                pageCount={hubCollection.pageCount}
                total={hubCollection.total}
                filteredCount={hubCollection.filteredCount}
                onPage={hubCollection.setPage}
                pageSize={PAGE_SIZE}
              />
            </Grid>
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Channel detail</Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Device</TableCell>
                          <TableCell>Plant</TableCell>
                          <TableCell>UID</TableCell>
                          <TableCell>Channel</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Reading</TableCell>
                          <TableCell>Data</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {hubs.flatMap((h) => (h.channels?.length ? h.channels : [{ _empty: true }]).map((c) => (
                          <TableRow key={`${h.id}-${c.channelId || 'none'}`}>
                            <TableCell>{h.deviceName}</TableCell>
                            <TableCell>{h.plantName || h.plantId}</TableCell>
                            <TableCell>
                              <Typography variant="body2" fontFamily="IBM Plex Mono, monospace">{h.deviceUid}</Typography>
                            </TableCell>
                            {c._empty ? (
                              <TableCell colSpan={4}>
                                <Typography variant="body2" color="text.secondary">No channels reported yet</Typography>
                              </TableCell>
                            ) : (
                              <>
                                <TableCell>{c.instrumentTag || `ch ${c.channelId}`}</TableCell>
                                <TableCell>{labels[c.measurementType] || c.measurementType}</TableCell>
                                <TableCell>
                                  {c.lastValue != null
                                    ? `${formatReading(c.lastValue)}${c.engineeringUnit ? ` ${c.engineeringUnit}` : ''}`
                                    : '—'}
                                </TableCell>
                                <TableCell>
                                  <StatusBadge status={c.dataStatus || (c.active ? 'ACTIVE' : 'INACTIVE')} />
                                </TableCell>
                              </>
                            )}
                          </TableRow>
                        )))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )
      )}

      {tab === 'pair' && (
        <ConnectDevice
          embedded
          fixedPlantId={fixedPlantId || filterPlant || undefined}
          hidePlantSelector={hidePlantSelector || Boolean(fixedPlantId || filterPlant)}
          onPaired={() => {
            loadData();
            setTab('hubs');
          }}
        />
      )}

      {tab === 'inventory' && (
        <>
          <Alert severity="info" sx={{ mb: 2 }}>
            Sensors are discovered from authenticated telemetry on devices Control Center assigned to your plants.
            Physical nodes are not created here.
          </Alert>

          <SearchAndFilter
            search={collection.search}
            onSearch={collection.setSearch}
            searchPlaceholder="Search tags, types, chip IDs…"
            view={view}
            onViewChange={setView}
            sortKey={collection.sortKey}
            sortDir={collection.sortDir}
            onSortKey={collection.toggleSort}
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
                  ...installedTypes.map((t) => ({ value: t, label: labels[t] || t })),
                ],
              },
              {
                key: 'status',
                label: 'Data',
                value: statusFilter,
                onChange: setStatusFilter,
                options: [
                  { value: 'ALL', label: 'All' },
                  { value: 'LIVE', label: 'Live' },
                  { value: 'STALE', label: 'Stale' },
                  { value: 'NO_DATA', label: 'No data' },
                ],
              },
            ]}
            countLabel={`${collection.filteredCount} of ${collection.total}`}
          />

          {view === 'grid' ? (
            <SensorGrid
              sensors={collection.items}
              labels={labels}
              units={units}
              page={collection.page}
              pageCount={collection.pageCount}
              total={collection.total}
              filteredCount={collection.filteredCount}
              onPage={collection.setPage}
              pageSize={PAGE_SIZE}
              emptyTitle="No sensors discovered yet"
              emptyDescription="When assigned devices publish telemetry, nodes and channels appear here automatically."
            />
          ) : (
            <Card>
              <SensorTable
                sensors={collection.items}
                labels={labels}
                units={units}
                sortKey={collection.sortKey}
                sortDir={collection.sortDir}
                onSort={collection.toggleSort}
                page={collection.page}
                pageCount={collection.pageCount}
                total={collection.total}
                filteredCount={collection.filteredCount}
                onPage={collection.setPage}
                pageSize={PAGE_SIZE}
                emptyTitle="No sensors discovered yet"
                emptyDescription="When assigned devices publish telemetry, nodes and channels appear here automatically."
                actions={isSuperAdmin ? (n) => (
                  <>
                    <IconButton size="small" onClick={() => handleToggle(n.nodeId, n.status)} title="Enable or disable">
                      <PowerSettingsNew />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => {
                        setEditId(n.nodeId);
                        setForm({ ...n, plantId: n.plantId });
                        setDialogOpen(true);
                      }}
                    >
                      <Edit />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(n.nodeId)}>
                      <Delete />
                    </IconButton>
                  </>
                ) : undefined}
              />
            </Card>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit sensor tag</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 1 }}>
            Rename or retag a discovered sensor. Physical nodes are created only from authenticated telemetry.
          </Typography>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={12}>
              <TextField fullWidth select label="Plant" value={form.plantId} onChange={(e) => setForm({ ...form, plantId: e.target.value })}>
                {plants.map((p) => <MenuItem key={p.plantId} value={p.plantId}>{p.plantName}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Tag / name"
                value={form.nodeName}
                onChange={(e) => setForm({ ...form, nodeName: e.target.value })}
                placeholder="e.g. TIT-103 Digester temperature"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth select label="Measurement" value={form.sensorType} onChange={(e) => setForm({ ...form, sensorType: e.target.value })}>
                {sensorTypeOptions.map((t) => <MenuItem key={t} value={t}>{labels[t] || t}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="caption" color="text.secondary">
                Firmware, battery, and signal appear only when a hub reports them. They are never invented here.
              </Typography>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.plantId || !form.nodeName}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
