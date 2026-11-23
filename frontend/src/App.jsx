// PURPOSE: React router for Control Center and plant-app pages (NOVA routes unchanged).
import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import MainLayout from './components/layout/MainLayout';
import ControlCenterLayout from './components/control-center/ControlCenterLayout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import Plants from './pages/Plants';
import Sensors from './pages/Sensors';
import FieldDeviceDetail from './pages/FieldDeviceDetail';
import Analytics from './pages/Analytics';
import Alerts from './pages/Alerts';
import AIRecommendations from './pages/AIRecommendations';
import Maintenance from './pages/Maintenance';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Partners from './pages/Partners';
import Notifications from './pages/Notifications';
import ChangePassword from './pages/ChangePassword';
import Help from './pages/Help';
import NovaSpaceOp from './pages/NovaSpaceOp';
import PlantHmi from './pages/PlantHmi';
import Companies from './pages/control-center/Companies';
import CompanyDetail from './pages/control-center/CompanyDetail';
import PlantInventory from './pages/control-center/PlantInventory';
import Overview from './pages/control-center/Overview';
import Approvals from './pages/control-center/Approvals';
import HmiAccess from './pages/control-center/HmiAccess';
import Devices from './pages/control-center/Devices';
import DeviceDetail from './pages/control-center/DeviceDetail';
import IotStatus from './pages/control-center/IotStatus';
import { isNativeApp } from './utils/networkError';
import { getHomeRoute, shouldShowControlCenter } from './utils/homeRoute';

const ProtectedRoute = ({ children, roles }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={getHomeRoute(user.role)} replace />;
  return children;
};

function App() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const home = user ? getHomeRoute(user.role) : '/dashboard';
  const controlUi = shouldShowControlCenter(user);

  useEffect(() => {
    if (!isNativeApp()) return undefined;

    let backHandle;
    let urlHandle;

    (async () => {
      const { App: CapApp } = await import('@capacitor/app');

      backHandle = await CapApp.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack || window.history.length > 1) {
          window.history.back();
        } else {
          CapApp.exitApp();
        }
      });

      urlHandle = await CapApp.addListener('appUrlOpen', async ({ url }) => {
        try {
          const { Browser } = await import('@capacitor/browser');
          await Browser.close().catch(() => {});
        } catch {
          /* Browser plugin may be unavailable */
        }

        try {
          const parsed = new URL(url);
          const isSsoCallback =
            parsed.protocol === 'com.nanofarm.swarm:'
            && parsed.hostname === 'auth'
            && parsed.pathname.startsWith('/callback');
          if (!isSsoCallback) return;

          const code = parsed.searchParams.get('code');
          const error = parsed.searchParams.get('error');
          const qs = new URLSearchParams();
          if (code) qs.set('code', code);
          if (error) qs.set('error', error);
          navigate(`/auth/callback?${qs.toString()}`, { replace: true });
        } catch {
          /* ignore malformed deep links */
        }
      });
    })();

    return () => {
      backHandle?.remove();
      urlHandle?.remove();
    };
  }, [navigate]);

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={home} /> : <Login />} />
      <Route path="/signup" element={user ? <Navigate to={home} /> : <Signup />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {controlUi ? (
        <Route path="/" element={<ProtectedRoute roles={['CONTROL_CENTER_ADMIN']}><ControlCenterLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="companies" element={<Companies />} />
          <Route path="companies/:id" element={<CompanyDetail />} />
          <Route path="plants" element={<PlantInventory />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="hmi-access" element={<HmiAccess />} />
          <Route path="devices" element={<Devices />} />
          <Route path="devices/:id" element={<DeviceDetail />} />
          <Route path="iot" element={<IotStatus />} />
          <Route path="change-password" element={<ChangePassword />} />
        </Route>
      ) : (
        <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to={home} replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="plant-hmi" element={<PlantHmi />} />
          <Route path="plants" element={<ProtectedRoute roles={['SUPER_ADMIN', 'PLANT_ADMIN']}><Plants /></ProtectedRoute>} />
          <Route path="sensors" element={<ProtectedRoute roles={['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR']}><Sensors /></ProtectedRoute>} />
          <Route path="sensors/:id" element={<ProtectedRoute roles={['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR']}><FieldDeviceDetail /></ProtectedRoute>} />
          <Route path="connect-device" element={<Navigate to="/sensors?tab=pair" replace />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="ai" element={<AIRecommendations />} />
          <Route path="maintenance" element={<Maintenance />} />
          <Route path="reports" element={<Reports />} />
          <Route path="users" element={<ProtectedRoute roles={['SUPER_ADMIN', 'PLANT_ADMIN']}><Users /></ProtectedRoute>} />
          <Route path="partners" element={<ProtectedRoute roles={['SUPER_ADMIN']}><Partners /></ProtectedRoute>} />
          <Route path="settings" element={<ProtectedRoute roles={['SUPER_ADMIN']}><Settings /></ProtectedRoute>} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="help" element={<ProtectedRoute roles={['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR']}><Help /></ProtectedRoute>} />
          <Route path="nova-space-op" element={<NovaSpaceOp />} />
        </Route>
      )}
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
}

export default App;
