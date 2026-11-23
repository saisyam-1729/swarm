// PURPOSE: Consistent status chip for devices, nodes, sensors, and alerts.
import { Chip } from '@mui/material';

const STATUS_MAP = {
  ACTIVE: { label: 'Active', color: 'success' },
  LIVE: { label: 'Live', color: 'success' },
  CONNECTED: { label: 'Connected', color: 'success' },
  READY: { label: 'Ready', color: 'success' },
  ENABLED: { label: 'Enabled', color: 'success' },
  RESOLVED: { label: 'Resolved', color: 'success' },
  SUCCESS: { label: 'Success', color: 'success' },
  INACTIVE: { label: 'Inactive', color: 'default' },
  DISABLED: { label: 'Disabled', color: 'default' },
  UNKNOWN: { label: 'Unknown', color: 'default' },
  NO_DATA: { label: 'No data', color: 'default' },
  OFFLINE: { label: 'Offline', color: 'error' },
  FAULTY: { label: 'Faulty', color: 'error' },
  CRITICAL: { label: 'Critical', color: 'error' },
  ERROR: { label: 'Error', color: 'error' },
  DISCONNECTED: { label: 'Disconnected', color: 'warning' },
  STALE: { label: 'Stale', color: 'warning' },
  WARNING: { label: 'Warning', color: 'warning' },
  ACKNOWLEDGED: { label: 'Acknowledged', color: 'warning' },
  PENDING: { label: 'Pending', color: 'warning' },
  MAINTENANCE: { label: 'Maintenance', color: 'info' },
  INFO: { label: 'Info', color: 'info' },
  NEEDS_ADMIN: { label: 'Need Super Admin', color: 'warning' },
  NEEDS_PLANTS: { label: 'Need plants', color: 'info' },
  REGISTERED: { label: 'Registered', color: 'info' },
  PROVISIONED: { label: 'Provisioned', color: 'info' },
  AWAITING_TELEMETRY: { label: 'Awaiting telemetry', color: 'warning' },
  ONLINE: { label: 'Online', color: 'success' },
  SUSPENDED: { label: 'Suspended', color: 'error' },
  RETIRED: { label: 'Retired', color: 'default' },
};

function normalize(status) {
  return String(status || '').trim().toUpperCase().replace(/\s+/g, '_');
}

export default function StatusBadge({
  status,
  label,
  size = 'small',
  variant = 'filled',
  ...props
}) {
  const key = normalize(status);
  const mapped = STATUS_MAP[key];
  const display = label
    || mapped?.label
    || (status ? String(status).replace(/_/g, ' ') : 'Unknown');
  return (
    <Chip
      size={size}
      color={mapped?.color || 'default'}
      variant={mapped ? variant : 'outlined'}
      label={display}
      {...props}
    />
  );
}
