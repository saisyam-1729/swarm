// PURPOSE: Shared presentation helpers for dynamic sensors, nodes, and devices.
import {
  Air, Bolt, Co2, GraphicEq, LocalFireDepartment, Opacity, Science,
  SensorsOutlined, Speed, Thermostat, WaterDrop, Warning,
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';

export const STALE_MS = 10 * 60 * 1000;

const TYPE_ICONS = {
  PH: Opacity,
  TEMPERATURE: Thermostat,
  TEMPERATURE_TRANSMITTER: Thermostat,
  HUMIDITY: WaterDrop,
  PRESSURE: Speed,
  PRESSURE_TRANSMITTER: Speed,
  GAS_FLOW: Air,
  FLOW_TRANSMITTER: Air,
  METHANE: LocalFireDepartment,
  CARBON_DIOXIDE: Co2,
  HYDROGEN_SULFIDE: Warning,
  AMMONIA: Science,
  LIQUID_LEVEL: Opacity,
  VOLTAGE: Bolt,
  CURRENT: Bolt,
  VIBRATION: GraphicEq,
};

export function sensorTypeIcon(type) {
  const key = String(type || '').toUpperCase();
  if (TYPE_ICONS[key]) return TYPE_ICONS[key];
  if (key.includes('TEMP')) return Thermostat;
  if (key.includes('HUMID')) return WaterDrop;
  if (key.includes('PRESS')) return Speed;
  if (key.includes('FLOW')) return Air;
  if (key.includes('LEVEL')) return Opacity;
  if (key.includes('VOLT') || key.includes('CURR')) return Bolt;
  if (key.includes('VIB')) return GraphicEq;
  if (key.includes('CO2') || key.includes('CARBON')) return Co2;
  if (key.includes('METHANE') || key.includes('GAS')) return LocalFireDepartment;
  return SensorsOutlined;
}

export function readingFreshness(lastReadingAt) {
  if (!lastReadingAt) return 'NO_DATA';
  const age = Date.now() - new Date(lastReadingAt).getTime();
  if (Number.isNaN(age)) return 'UNKNOWN';
  if (age > STALE_MS) return 'STALE';
  return 'LIVE';
}

export function formatReading(value, digits) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return null;
  const n = Number(value);
  if (digits != null) return n.toFixed(digits);
  const abs = Math.abs(n);
  if (abs >= 100) return n.toFixed(0);
  if (abs >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

export function formatReadingWithUnit(value, unit) {
  const formatted = formatReading(value);
  if (formatted == null) return '—';
  return unit ? `${formatted} ${unit}` : formatted;
}

export function relativeTime(date) {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  try {
    return formatDistanceToNow(parsed, { addSuffix: true });
  } catch {
    return parsed.toLocaleString();
  }
}

export function effectiveNodeStatus(node) {
  const status = String(node?.status || '').toUpperCase();
  if (status === 'INACTIVE' || status === 'FAULTY') return status;
  const freshness = readingFreshness(node?.lastReadingAt);
  if (freshness === 'STALE') return 'STALE';
  if (freshness === 'NO_DATA') return status === 'ACTIVE' ? 'NO_DATA' : (status || 'UNKNOWN');
  if (freshness === 'LIVE') return status === 'ACTIVE' ? 'LIVE' : (status || 'LIVE');
  return status || 'UNKNOWN';
}

const OPERATIONAL_DEVICE_STATUSES = new Set([
  'REGISTERED', 'PROVISIONED', 'AWAITING_TELEMETRY', 'ONLINE', 'OFFLINE', 'SUSPENDED', 'RETIRED',
]);

export function effectiveDeviceStatus(device) {
  const status = String(device?.status || device?.connectionStatus || device?.lifecycle || '').toUpperCase();
  if (OPERATIONAL_DEVICE_STATUSES.has(status)) return status;
  if (status === 'INACTIVE' || status === 'FAULTY' || status === 'DISABLED') return status;
  if (status === 'CONNECTED') return 'CONNECTED';
  const last = device?.lastReadingAt || device?.lastSeenAt;
  const freshness = readingFreshness(last);
  if (freshness === 'STALE') return 'OFFLINE';
  if (freshness === 'LIVE') return status === 'ACTIVE' || status === 'CONNECTED' ? 'CONNECTED' : (status || 'CONNECTED');
  if (status === 'ACTIVE') return freshness === 'NO_DATA' ? 'NO_DATA' : status;
  return status || 'UNKNOWN';
}

export function channelUnit(channel, unitsByType = {}) {
  return channel?.engineeringUnit
    || channel?.unit
    || unitsByType[channel?.measurementType || channel?.sensorType]
    || '';
}

export function channelLabel(channel, labelsByType = {}) {
  return channel?.instrumentTag
    || channel?.nodeName
    || labelsByType[channel?.measurementType || channel?.sensorType]
    || channel?.measurementType
    || channel?.sensorType
    || `Channel ${channel?.channelId ?? ''}`.trim();
}

export function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.content)) return payload.content;
  return [];
}
