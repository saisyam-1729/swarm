// PURPOSE: Plant-app shell with role-filtered navigation.
import { useState, useEffect, useMemo } from 'react';
import { Badge, IconButton, Typography } from '@mui/material';
import {
  Dashboard, Factory, Sensors, ShowChart, Notifications as NotifIcon,
  Psychology, Build, Assessment, People, Settings, MenuBook,
  PrecisionManufacturing, SmartToy, VpnKey,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { notificationAPI, plantAPI } from '../../services/api';
import NovaOpFab from '../nova/NovaOpFab';
import AppChrome from './AppChrome';

const ALL_ITEMS = [
  { text: 'Dashboard', icon: <Dashboard />, path: '/dashboard', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'], section: 'Monitor' },
  { text: 'Plant HMI', icon: <PrecisionManufacturing />, path: '/plant-hmi', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'], requireHmi: true, section: 'Monitor' },
  { text: 'Field Devices', icon: <Sensors />, path: '/sensors', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'], section: 'Monitor' },
  { text: 'Analytics', icon: <ShowChart />, path: '/analytics', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'], section: 'Monitor' },
  { text: 'Alerts', icon: <NotifIcon />, path: '/alerts', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'], section: 'Monitor' },
  { text: 'NOVA OP', icon: <SmartToy />, path: '/nova-space-op', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'], section: 'Intelligence' },
  { text: 'AI Recommendations', icon: <Psychology />, path: '/ai', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'], section: 'Intelligence' },
  { text: 'Maintenance', icon: <Build />, path: '/maintenance', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'], section: 'Intelligence' },
  { text: 'Reports', icon: <Assessment />, path: '/reports', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'], section: 'Intelligence' },
  { text: 'Plants', icon: <Factory />, path: '/plants', roles: ['SUPER_ADMIN', 'PLANT_ADMIN'], section: 'Admin' },
  { text: 'Users', icon: <People />, path: '/users', roles: ['SUPER_ADMIN', 'PLANT_ADMIN'], section: 'Admin' },
  { text: 'emPOWER Partners', icon: <VpnKey />, path: '/partners', roles: ['SUPER_ADMIN'], section: 'Admin' },
  { text: 'Settings', icon: <Settings />, path: '/settings', roles: ['SUPER_ADMIN'], section: 'Admin' },
  { text: 'User Manual', icon: <MenuBook />, path: '/help', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'], section: 'Help' },
];

export default function MainLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [alertCount, setAlertCount] = useState(0);
  const [hmiAllowed, setHmiAllowed] = useState(false);

  useEffect(() => {
    if (user?.role === 'CONTROL_CENTER_ADMIN') return undefined;
    plantAPI.getAll()
      .then(({ data }) => setHmiAllowed((data.data || []).some((p) => p.hmiEnabled)))
      .catch(() => setHmiAllowed(false));
    return undefined;
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (user?.role === 'CONTROL_CENTER_ADMIN') return undefined;
    const loadCount = () => notificationAPI.getAll()
      .then(({ data }) => setAlertCount(data.data?.counts?.active || 0))
      .catch(() => {});
    loadCount();
    const interval = setInterval(loadCount, 60000);
    return () => clearInterval(interval);
  }, [user?.role]);

  const menuItems = useMemo(() => ALL_ITEMS.filter((item) => {
    if (!item.roles.includes(user?.role)) return false;
    if (item.requireHmi && !hmiAllowed) return false;
    return true;
  }).map((item) => (
    item.path === '/alerts' ? { ...item, badge: alertCount || undefined } : item
  )), [user?.role, hmiAllowed, alertCount]);

  return (
    <AppChrome
      menuItems={menuItems}
      subtitle="Plant health monitoring"
      extraToolbar={(
        <IconButton color="inherit" onClick={() => navigate('/notifications')}>
          <Badge badgeContent={alertCount} color="error">
            <NotifIcon />
          </Badge>
        </IconButton>
      )}
      footer={(
        <Typography variant="caption">
          © 2026 SWARM by nanoFarm — AI-IoT Plant Health Monitoring System
        </Typography>
      )}
      fab={<NovaOpFab userRole={user?.role} firstName={user?.name} />}
    />
  );
}
