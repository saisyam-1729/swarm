// PURPOSE: Responsive grid of sensors that scales with backend collection size.
import { Grid } from '@mui/material';
import SensorCard from './SensorCard';
import EmptyState from '../common/EmptyState';
import CollectionPager from '../common/CollectionPager';
import { SensorsOutlined } from '@mui/icons-material';

export default function SensorGrid({
  sensors = [],
  labels = {},
  units = {},
  page = 0,
  pageCount = 1,
  total,
  filteredCount,
  onPage,
  pageSize = 24,
  emptyTitle = 'No sensors yet',
  emptyDescription = 'Sensors appear automatically when telemetry is ingested, or when a hub is paired.',
  emptyActionLabel,
  onEmptyAction,
}) {
  if (!sensors.length && !(filteredCount > 0)) {
    const noMatches = (total || 0) > 0;
    return (
      <EmptyState
        title={noMatches ? 'No matching sensors' : emptyTitle}
        description={noMatches
          ? 'Try a different search or filter. New telemetry will appear here automatically.'
          : emptyDescription}
        icon={<SensorsOutlined />}
        actionLabel={!noMatches ? emptyActionLabel : undefined}
        onAction={!noMatches ? onEmptyAction : undefined}
      />
    );
  }

  return (
    <>
      <Grid container spacing={2}>
        {sensors.map((sensor) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={sensor.nodeId || sensor.id || `${sensor.deviceChipId}-${sensor.channelId}-${sensor.sensorType}`}>
            <SensorCard sensor={sensor} labels={labels} units={units} />
          </Grid>
        ))}
      </Grid>
      {onPage && (
        <CollectionPager
          page={page}
          pageCount={pageCount}
          total={total ?? sensors.length}
          filteredCount={filteredCount ?? sensors.length}
          onPage={onPage}
          pageSize={pageSize}
        />
      )}
    </>
  );
}
