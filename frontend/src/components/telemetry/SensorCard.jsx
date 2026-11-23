// PURPOSE: Data-driven card for one sensor/channel of any type.
import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import StatusBadge from '../common/StatusBadge';
import {
  channelLabel, channelUnit, effectiveNodeStatus, formatReading,
  relativeTime, sensorTypeIcon,
} from '../../utils/sensorPresentation';

export default function SensorCard({
  sensor,
  labels = {},
  units = {},
  compact = false,
}) {
  const type = sensor?.sensorType || sensor?.measurementType;
  const Icon = sensorTypeIcon(type);
  const unit = channelUnit(sensor, units);
  const name = channelLabel(sensor, labels);
  const status = effectiveNodeStatus(sensor);
  const value = formatReading(sensor?.lastValue ?? sensor?.value);
  const updated = relativeTime(sensor?.lastReadingAt);
  const association = [sensor?.plantName, sensor?.deviceChipId, sensor?.deviceName]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ py: compact ? 1.5 : 2, '&:last-child': { pb: compact ? 1.5 : 2 } }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Box
            sx={{
              width: compact ? 36 : 40,
              height: compact ? 36 : 40,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
              color: 'primary.main',
              flexShrink: 0,
            }}
          >
            <Icon fontSize={compact ? 'small' : 'medium'} />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap title={name}>
                  {name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap display="block">
                  {labels[type] || type || 'Sensor'}
                </Typography>
              </Box>
              <StatusBadge status={status} />
            </Stack>
            <Typography variant="h5" fontWeight={700} sx={{ mt: 0.75, lineHeight: 1.1 }}>
              {value ?? '—'}
              {value != null && unit && (
                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                  {unit}
                </Typography>
              )}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }} noWrap>
              {association || 'Unassigned'}
              {updated ? ` · ${updated}` : ''}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
