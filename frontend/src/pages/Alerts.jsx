// PURPOSE: SWARM plant-app page: Alerts.
import { useState, useEffect } from 'react';
import {
  Box, Card, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button, Tabs, Tab, CircularProgress, FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import { CheckCircle, DoneAll } from '@mui/icons-material';
import { alertAPI, plantAPI } from '../services/api';
import { formatDate } from '../utils/constants';
import { responsiveSelect } from '../utils/responsive';
import EmptyState from '../components/common/EmptyState';
import PageHeader from '../components/common/PageHeader';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSkeleton from '../components/common/LoadingSkeleton';
import ErrorState from '../components/common/ErrorState';
import CollectionPager from '../components/common/CollectionPager';
import useCollection from '../utils/useCollection';

export default function Alerts({ fixedPlantId, embedded = false, hidePlantSelector = false }) {
  const [plants, setPlants] = useState([]);
  const [selectedPlant, setSelectedPlant] = useState(fixedPlantId || '');
  const [alerts, setAlerts] = useState([]);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [plantsLoaded, setPlantsLoaded] = useState(!!fixedPlantId);

  const statuses = ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'];

  useEffect(() => {
    if (fixedPlantId) {
      setSelectedPlant(Number(fixedPlantId));
      setPlantsLoaded(true);
      return;
    }
    plantAPI.getAll()
      .then(({ data }) => {
        const list = data.data || [];
        setPlants(list);
        const pairedPlant = sessionStorage.getItem('dashboardPlantId');
        if (pairedPlant && list.some((p) => p.plantId === Number(pairedPlant))) {
          setSelectedPlant(Number(pairedPlant));
          sessionStorage.removeItem('dashboardPlantId');
        } else if (list.length > 0) {
          setSelectedPlant(list[0].plantId);
        }
      })
      .catch(() => setLoadError('Unable to load plants.'))
      .finally(() => setPlantsLoaded(true));
  }, [fixedPlantId]);

  const loadAlerts = () => {
    if (!selectedPlant) {
      setAlerts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    alertAPI.getAll({ plantId: selectedPlant, status: statuses[tab] })
      .then(({ data }) => {
        setAlerts(data.data || []);
        setLoadError('');
      })
      .catch(() => {
        setAlerts([]);
        setLoadError('Unable to load alerts.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAlerts(); }, [tab, selectedPlant]);

  const handleAcknowledge = async (id) => {
    await alertAPI.acknowledge(id);
    loadAlerts();
  };

  const handleResolve = async (id) => {
    await alertAPI.resolve(id);
    loadAlerts();
  };

  const collection = useCollection(alerts, {
    searchKeys: ['title', 'message', 'plantName', 'severity'],
    initialSortKey: 'createdAt',
    initialSortDir: 'desc',
    pageSize: 25,
  });

  return (
    <Box>
      <PageHeader
        hidden={embedded}
        title="Alert management"
        subtitle="Incidents for the selected plant. Counts and rows come from the alerts API."
      />

      {!plantsLoaded ? (
        <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
      ) : !selectedPlant && (
        <EmptyState
          title="No plants to show alerts for"
          description="Alerts appear after a plant is assigned to your account."
        />
      )}

      {!hidePlantSelector && plants.length > 0 && (
        <FormControl sx={{ ...responsiveSelect, mb: 2 }} size="small">
          <InputLabel>Plant</InputLabel>
          <Select
            value={selectedPlant}
            label="Plant"
            onChange={(e) => setSelectedPlant(e.target.value)}
          >
            {plants.map((p) => (
              <MenuItem key={p.plantId} value={p.plantId}>{p.plantName}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Active" /><Tab label="Acknowledged" /><Tab label="Resolved" />
      </Tabs>

      {loadError && <ErrorState description={loadError} onRetry={loadAlerts} />}

      <Card>
        {loading ? <LoadingSkeleton variant="table" count={6} /> : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Plant</TableCell><TableCell>Title</TableCell><TableCell>Message</TableCell>
                  <TableCell>Severity</TableCell><TableCell>Time</TableCell><TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {collection.items.length === 0 ? (
                  <TableRow><TableCell colSpan={6}>
                    <EmptyState compact title="No alerts in this state" description="The plant is operating without open incidents." />
                  </TableCell></TableRow>
                ) : collection.items.map((a) => (
                  <TableRow key={a.id} hover>
                    <TableCell>{a.plantName}</TableCell>
                    <TableCell>{a.title}</TableCell>
                    <TableCell sx={{ maxWidth: 300 }}>{a.message}</TableCell>
                    <TableCell><StatusBadge status={a.severity} /></TableCell>
                    <TableCell>{formatDate(a.createdAt)}</TableCell>
                    <TableCell>
                      {a.status === 'ACTIVE' && (
                        <Button size="small" startIcon={<CheckCircle />} onClick={() => handleAcknowledge(a.id)}>Acknowledge</Button>
                      )}
                      {a.status !== 'RESOLVED' && (
                        <Button size="small" startIcon={<DoneAll />} onClick={() => handleResolve(a.id)}>Resolve</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {!loading && (
          <Box sx={{ px: 2, pb: 1 }}>
            <CollectionPager
              page={collection.page}
              pageCount={collection.pageCount}
              total={collection.total}
              filteredCount={collection.filteredCount}
              onPage={collection.setPage}
              pageSize={25}
            />
          </Box>
        )}
      </Card>
    </Box>
  );
}
