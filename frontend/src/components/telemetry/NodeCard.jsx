// PURPOSE: Data-driven card for a discovered or commissioned node.
import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import StatusBadge from '../common/StatusBadge';
import { effectiveNodeStatus, formatReadingWithUnit, relativeTime } from '../../utils/sensorPresentation';

export default function NodeCard({ node, labels = {}, units = {}, onClick }) {
  const status = effectiveNodeStatus(node);
  const type = node?.sensorType;
  return (
    <Card
      sx={{ height: '100%', cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={700} noWrap>{node?.nodeName || 'Node'}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap display="block">
              {labels[type] || type || 'Unknown type'}
            </Typography>
          </Box>
          <StatusBadge status={status} />
        </Stack>
        <Typography variant="h6" fontWeight={700} sx={{ mt: 1.5 }}>
          {formatReadingWithUnit(node?.lastValue, units[type])}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          {[node?.plantName, node?.deviceChipId].filter(Boolean).join(' · ') || 'No device association'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {relativeTime(node?.lastReadingAt) || 'No readings yet'}
        </Typography>
      </CardContent>
    </Card>
  );
}
