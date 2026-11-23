// PURPOSE: Control Center shell for tenant, plant, and device operations.
import {
  Business, Factory, Dashboard, HowToReg, PrecisionManufacturing,
  DevicesOther, CellTower,
} from '@mui/icons-material';
import AppChrome from '../layout/AppChrome';

const menuItems = [
  { text: 'Overview', icon: <Dashboard />, path: '/overview', section: 'Operations' },
  { text: 'MQTT / IoT', icon: <CellTower />, path: '/iot', section: 'Operations' },
  { text: 'Tenants', icon: <Business />, path: '/companies', section: 'Tenants' },
  { text: 'Approvals', icon: <HowToReg />, path: '/approvals', section: 'Tenants' },
  { text: 'Plant inventory', icon: <Factory />, path: '/plants', section: 'Sites' },
  { text: 'HMI', icon: <PrecisionManufacturing />, path: '/hmi-access', section: 'Sites' },
  { text: 'Devices', icon: <DevicesOther />, path: '/devices', section: 'Hardware' },
];

export default function ControlCenterLayout() {
  return (
    <AppChrome
      menuItems={menuItems}
      subtitle="Platform operations and onboarding"
    />
  );
}
