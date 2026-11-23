// PURPOSE: Compact, data-driven list of alerts for dashboards and notification pages.
import { Box, Button, Stack, Typography } from '@mui/material';
import StatusBadge from '../common/StatusBadge';
import EmptyState from '../common/EmptyState';
import { relativeTime } from '../../utils/sensorPresentation';
import { NotificationsNone } from '@mui/icons-material';

export default function AlertList({
  alerts = [],
  emptyTitle = 'No active alerts',
  emptyDescription = 'The plant is operating without open incidents.',
  onAcknowledge,
  onResolve,
  maxItems,
}) {
  const items = maxItems ? alerts.slice(0, maxItems) : alerts;
  if (!items.length) {
    return (
      <EmptyState
        compact
        title={emptyTitle}
        description={emptyDescription}
        icon={<NotificationsNone />}
      />
    );
  }

  return (
    <Stack divider={<Box sx={{ borderBottom: 1, borderColor: 'divider' }} />}>
      {items.map((alert) => (
        <Box
          key={alert.id}
          sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, py: 1.25 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography fontWeight={600} noWrap>{alert.title}</Typography>
            <Typography variant="body2" color="text.secondary">
              {[alert.plantName, alert.message].filter(Boolean).join(' · ')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {relativeTime(alert.createdAt) || ''}
            </Typography>
          </Box>
          <Stack alignItems="flex-end" spacing={0.75} flexShrink={0}>
            <StatusBadge status={alert.severity} />
            <Stack direction="row" spacing={0.5}>
              {alert.status === 'ACTIVE' && onAcknowledge && (
                <Button size="small" onClick={() => onAcknowledge(alert.id)}>Ack</Button>
              )}
              {alert.status !== 'RESOLVED' && onResolve && (
                <Button size="small" onClick={() => onResolve(alert.id)}>Resolve</Button>
              )}
            </Stack>
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
