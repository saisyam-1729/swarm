// PURPOSE: Data-driven card for a hub/gateway and its discovered channels.
import {
  Box, Card, CardContent, Chip, IconButton, Stack, Tooltip, Typography,
} from '@mui/material';
import { ArrowForward, ContentCopy, Refresh } from '@mui/icons-material';
import StatusBadge from '../common/StatusBadge';
import {
  channelLabel, channelUnit, effectiveDeviceStatus, formatReading, relativeTime,
} from '../../utils/sensorPresentation';

export default function DeviceCard({
  device,
  labels = {},
  units = {},
  onOpen,
  onSync,
  syncing = false,
}) {
  const channels = Array.isArray(device?.channels) ? device.channels : [];
  const status = effectiveDeviceStatus(device);
  const ip = device.deviceIp || device.lastIp;
  const last = device.lastReadingAt || device.lastSeenAt;
  const shownChannels = channels.slice(0, 8);
  const extra = Math.max(0, channels.length - shownChannels.length);

  const copyIp = async (event) => {
    event.stopPropagation();
    if (!ip) return;
    try { await navigator.clipboard.writeText(ip); } catch { /* ignore */ }
  };

  return (
    <Card
      sx={{ height: '100%', cursor: onOpen ? 'pointer' : 'default' }}
      onClick={onOpen ? () => onOpen(device) : undefined}
    >
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={700} noWrap>
              {device.deviceName || device.deviceUid || device.chipId || 'Device'}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" noWrap>
              {device.plantName || device.plantId || 'Unassigned plant'}
              {device.deviceKind ? ` · ${String(device.deviceKind).replace(/_/g, ' ')}` : ''}
            </Typography>
          </Box>
          <StatusBadge status={status} />
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'IBM Plex Mono, monospace', display: 'block', mt: 1 }} noWrap>
          {device.deviceUid || device.chipId || '—'}
        </Typography>
        {ip && (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Typography variant="caption" fontFamily="IBM Plex Mono, monospace">{ip}</Typography>
            <Tooltip title="Copy IP">
              <IconButton size="small" onClick={copyIp}><ContentCopy sx={{ fontSize: 14 }} /></IconButton>
            </Tooltip>
            <Tooltip title="Open hub">
              <IconButton size="small" component="a" href={`http://${ip}/info`} target="_blank" rel="noreferrer">
                <ArrowForward sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </Stack>
        )}

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          {channels.length} {channels.length === 1 ? 'channel' : 'channels'}
          {device.sensorCount != null && !channels.length ? ` · ${device.sensorCount} sensors` : ''}
          {last ? ` · ${relativeTime(last)}` : ''}
        </Typography>

        <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 1.25 }}>
          {shownChannels.length === 0 && device.temperature == null && device.humidity == null && device.gas == null && (
            <Typography variant="caption" color="text.secondary">No channels reported yet</Typography>
          )}
          {shownChannels.map((ch) => {
            const type = ch.measurementType || ch.sensorType;
            const value = formatReading(ch.lastValue);
            const unit = channelUnit(ch, units);
            return (
              <Chip
                key={ch.id || ch.channelId || ch.nodeId}
                size="small"
                variant="outlined"
                label={`${channelLabel(ch, labels)}: ${value ?? '—'}${value != null && unit ? ` ${unit}` : ''}`}
                title={labels[type] || type}
              />
            );
          })}
          {extra > 0 && <Chip size="small" label={`+${extra} more`} />}
          {channels.length === 0 && device.temperature != null && (
            <Chip size="small" variant="outlined" label={`Temp ${formatReading(device.temperature)} °C`} />
          )}
          {channels.length === 0 && device.humidity != null && (
            <Chip size="small" variant="outlined" label={`Humidity ${formatReading(device.humidity)} %`} />
          )}
          {channels.length === 0 && device.gas != null && (
            <Chip size="small" variant="outlined" label={`Gas ${formatReading(device.gas, 0)}`} />
          )}
        </Stack>

        {(onOpen || onSync) && (
          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
            {onSync && (
              <Tooltip title="Pull latest readings">
                <span>
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); onSync(device); }} disabled={syncing}>
                    <Refresh fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
            {onOpen && (
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onOpen(device); }}>
                <ArrowForward fontSize="small" />
              </IconButton>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
