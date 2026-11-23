// PURPOSE: Sortable table of sensors for large collections.
import {
  Box, IconButton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { ArrowDownward, ArrowUpward } from '@mui/icons-material';
import StatusBadge from '../common/StatusBadge';
import EmptyState from '../common/EmptyState';
import CollectionPager from '../common/CollectionPager';
import {
  channelLabel, channelUnit, effectiveNodeStatus, formatReading, relativeTime,
} from '../../utils/sensorPresentation';
import { formatDate } from '../../utils/constants';

function SortHeader({ label, field, sortKey, sortDir, onSort }) {
  const active = sortKey === field;
  return (
    <TableCell
      sx={{ cursor: onSort ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
      onClick={() => onSort?.(field)}
    >
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        {label}
        {active && (
          sortDir === 'desc'
            ? <ArrowDownward sx={{ fontSize: 14 }} />
            : <ArrowUpward sx={{ fontSize: 14 }} />
        )}
      </Box>
    </TableCell>
  );
}

export default function SensorTable({
  sensors = [],
  labels = {},
  units = {},
  sortKey,
  sortDir,
  onSort,
  page = 0,
  pageCount = 1,
  total,
  filteredCount,
  onPage,
  pageSize = 25,
  actions,
  emptyTitle = 'No sensors yet',
  emptyDescription = 'Sensors appear automatically when telemetry is ingested, or when a hub is paired.',
}) {
  return (
    <>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortHeader label="Sensor" field="nodeName" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Type" field="sensorType" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <TableCell>Plant / device</TableCell>
              <SortHeader label="Reading" field="lastValue" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <TableCell>Status</TableCell>
              <SortHeader label="Updated" field="lastReadingAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              {actions && <TableCell align="right">Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {sensors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={actions ? 7 : 6}>
                  <EmptyState compact title={emptyTitle} description={emptyDescription} />
                </TableCell>
              </TableRow>
            ) : sensors.map((sensor) => {
              const type = sensor.sensorType || sensor.measurementType;
              const unit = channelUnit(sensor, units);
              const value = formatReading(sensor.lastValue ?? sensor.value);
              return (
                <TableRow key={sensor.nodeId || sensor.id || `${sensor.deviceChipId}-${sensor.channelId}`} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{channelLabel(sensor, labels)}</Typography>
                    {sensor.channelId != null && (
                      <Typography variant="caption" color="text.secondary">ch {sensor.channelId}</Typography>
                    )}
                  </TableCell>
                  <TableCell>{labels[type] || type || '—'}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{sensor.plantName || '—'}</Typography>
                    <Typography variant="caption" color="text.secondary" fontFamily="IBM Plex Mono, monospace">
                      {sensor.deviceChipId || sensor.deviceName || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {value ?? '—'}{value != null && unit ? ` ${unit}` : ''}
                    </Typography>
                  </TableCell>
                  <TableCell><StatusBadge status={effectiveNodeStatus(sensor)} /></TableCell>
                  <TableCell>
                    <Typography variant="body2">{relativeTime(sensor.lastReadingAt) || '—'}</Typography>
                    {sensor.lastReadingAt && (
                      <Typography variant="caption" color="text.secondary">{formatDate(sensor.lastReadingAt)}</Typography>
                    )}
                  </TableCell>
                  {actions && (
                    <TableCell align="right">
                      {actions(sensor)}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {onPage && (
        <Box sx={{ px: 2, pb: 1 }}>
          <CollectionPager
            page={page}
            pageCount={pageCount}
            total={total ?? sensors.length}
            filteredCount={filteredCount ?? sensors.length}
            onPage={onPage}
            pageSize={pageSize}
          />
        </Box>
      )}
    </>
  );
}
