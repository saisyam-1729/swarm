// PURPOSE: Historical analytics for whatever sensors the plant actually has.
import { useState, useEffect, useMemo } from 'react';
import {
  Box, Card, CardContent, FormControl, InputLabel, Select, MenuItem,
  ToggleButtonGroup, ToggleButton, Grid,
} from '@mui/material';
import { plantAPI, dashboardAPI, sensorAPI } from '../services/api';
import { getSensorTypesForPlant } from '../utils/constants';
import useSensorCatalog from '../utils/useSensorCatalog';
import EmptyState from '../components/common/EmptyState';
import PageHeader from '../components/common/PageHeader';
import ErrorState from '../components/common/ErrorState';
import LoadingSkeleton from '../components/common/LoadingSkeleton';
import TelemetryChart from '../components/telemetry/TelemetryChart';
import { subHours, subDays, subWeeks, subMonths, format } from 'date-fns';

const ANALYTICS_POLL_MS = 15000;

export default function Analytics({ fixedPlantId, embedded = false, hidePlantSelector = false }) {
  const [plants, setPlants] = useState([]);
  const [selectedPlant, setSelectedPlant] = useState(fixedPlantId || '');
  const [range, setRange] = useState('day');
  const [sensorType, setSensorType] = useState('');
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [plantSensorTypes, setPlantSensorTypes] = useState([]);
  const { types, labels, units } = useSensorCatalog();

  useEffect(() => {
    if (fixedPlantId) {
      setSelectedPlant(Number(fixedPlantId));
      plantAPI.getById(fixedPlantId).then(({ data }) => setPlants([data.data])).catch(() => {});
      return;
    }
    plantAPI.getAll().then(({ data }) => {
      const list = data.data || [];
      setPlants(list);
      if (list.length > 0) setSelectedPlant(list[0].plantId);
    });
  }, [fixedPlantId]);

  useEffect(() => {
    if (!selectedPlant) {
      setPlantSensorTypes([]);
      return undefined;
    }
    let cancelled = false;
    sensorAPI.getByPlant(selectedPlant)
      .then(({ data }) => {
        if (cancelled) return;
        const discovered = [...new Set((data.data || []).map((n) => n.sensorType).filter(Boolean))];
        setPlantSensorTypes(discovered);
      })
      .catch(() => {
        if (!cancelled) setPlantSensorTypes([]);
      });
    return () => { cancelled = true; };
  }, [selectedPlant]);

  const sensorOptions = useMemo(() => {
    if (plantSensorTypes.length > 0) return plantSensorTypes;
    return getSensorTypesForPlant(plants.find((p) => p.plantId === Number(selectedPlant)), types);
  }, [plants, selectedPlant, plantSensorTypes, types]);

  useEffect(() => {
    if (sensorOptions.length > 0 && !sensorOptions.includes(sensorType)) {
      setSensorType(sensorOptions[0]);
    }
  }, [sensorOptions, sensorType]);

  useEffect(() => {
    if (!selectedPlant || !sensorType) return undefined;
    let first = true;
    const load = () => {
      if (first) setLoading(true);
      const now = new Date();
      const ranges = { hour: subHours(now, 1), day: subDays(now, 1), week: subWeeks(now, 1), month: subMonths(now, 1) };
      const start = ranges[range] || subDays(now, 1);
      return dashboardAPI.getAnalytics(selectedPlant, {
        sensorType,
        start: start.toISOString(),
        end: now.toISOString(),
      }).then(({ data }) => {
        const formatted = (data.data || []).map((r) => ({
          time: format(new Date(r.recordedAt), range === 'hour' ? 'HH:mm' : 'MMM dd HH:mm'),
          value: r.value,
          unit: r.unit,
        }));
        setChartData(formatted);
        setLoadError('');
      }).catch((err) => {
        setChartData([]);
        const status = err.response?.status;
        const message = err.response?.data?.message;
        if (status === 403) {
          setLoadError('You do not have access to this plant.');
        } else {
          setLoadError(message || 'Unable to load analytics for this plant.');
        }
      }).finally(() => {
        first = false;
        setLoading(false);
      });
    };

    load();
    const interval = setInterval(load, ANALYTICS_POLL_MS);
    return () => clearInterval(interval);
  }, [selectedPlant, range, sensorType]);

  return (
    <Box>
      <PageHeader
        hidden={embedded}
        title="Historical analytics"
        subtitle="Trends use actual ingested readings. The sensor list is whatever the plant currently reports."
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {!hidePlantSelector && (
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Plant</InputLabel>
              <Select value={selectedPlant} label="Plant" onChange={(e) => setSelectedPlant(e.target.value)}>
                {plants.map((p) => <MenuItem key={p.plantId} value={p.plantId}>{p.plantName}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
        )}
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth size="small">
            <InputLabel>Sensor</InputLabel>
            <Select value={sensorType} label="Sensor" onChange={(e) => setSensorType(e.target.value)}>
              {sensorOptions.map((s) => <MenuItem key={s} value={s}>{labels[s] || s}</MenuItem>)}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={4}>
          <ToggleButtonGroup value={range} exclusive onChange={(_, v) => v && setRange(v)} size="small" fullWidth>
            <ToggleButton value="hour">Hour</ToggleButton>
            <ToggleButton value="day">Day</ToggleButton>
            <ToggleButton value="week">Week</ToggleButton>
            <ToggleButton value="month">Month</ToggleButton>
          </ToggleButtonGroup>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          {!selectedPlant ? (
            <EmptyState title="No plant selected" description="Assign a plant to view sensor trends." />
          ) : loading ? (
            <LoadingSkeleton variant="table" count={6} />
          ) : loadError ? (
            <ErrorState description={loadError} />
          ) : (
            <TelemetryChart
              data={chartData}
              name={labels[sensorType] || sensorType || 'Sensor'}
              unit={chartData[0]?.unit || units[sensorType]}
              height={400}
            />
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
