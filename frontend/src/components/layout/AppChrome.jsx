// PURPOSE: Shared premium app chrome for plant app and Control Center.
import { useMemo, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, IconButton, Drawer, List, ListItem,
  ListItemButton, ListItemIcon, ListItemText, Avatar, Menu, MenuItem, Divider,
  Tooltip, useMediaQuery, useTheme, Badge,
} from '@mui/material';
import {
  Menu as MenuIcon, Logout, Password, DarkMode, LightMode,
} from '@mui/icons-material';
import Logo from '../common/Logo';
import { useAuth } from '../../context/AuthContext';
import { useColorMode } from '../../context/ColorModeContext';
import { NAVY } from '../../theme';

const DRAWER_WIDTH = 268;

export default function AppChrome({
  menuItems = [],
  subtitle,
  extraToolbar,
  footer,
  fab,
}) {
  const { user, logout } = useAuth();
  const { mode, toggleColorMode } = useColorMode();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);

  const currentPage = useMemo(() => {
    const match = menuItems.find((item) => item.path && (
      location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
    ));
    return match?.text || 'SWARM';
  }, [menuItems, location.pathname]);

  const sections = useMemo(() => {
    const grouped = [];
    menuItems.forEach((item) => {
      const section = item.section || '';
      const last = grouped[grouped.length - 1];
      if (!last || last.section !== section) grouped.push({ section, items: [item] });
      else last.items.push(item);
    });
    return grouped;
  }, [menuItems]);

  const navList = (
    <Box sx={{ flex: 1, py: 1.5, px: 1.25, overflowY: 'auto' }}>
      {sections.map((group) => (
        <Box key={group.section || 'main'} sx={{ mb: 1.5 }}>
          {group.section && (
            <Typography
              variant="caption"
              sx={{
                px: 1.5,
                py: 0.75,
                display: 'block',
                color: 'rgba(148,163,184,0.8)',
                letterSpacing: '0.08em',
                fontWeight: 700,
                textTransform: 'uppercase',
                fontSize: '0.65rem',
              }}
            >
              {group.section}
            </Typography>
          )}
          <List disablePadding>
            {group.items.map((item) => {
              const selected = location.pathname === item.path
                || (item.path !== '/' && location.pathname.startsWith(`${item.path}/`));
              return (
                <ListItem key={item.path} disablePadding sx={{ mb: 0.25 }}>
                  <ListItemButton
                    selected={selected}
                    onClick={() => { navigate(item.path); setMobileOpen(false); }}
                    sx={{
                      borderRadius: 2,
                      py: 0.9,
                      color: selected ? '#fff' : 'rgba(226,232,240,0.82)',
                      '&.Mui-selected': {
                        bgcolor: 'primary.main',
                        '&:hover': { bgcolor: 'primary.dark' },
                        '& .MuiListItemIcon-root': { color: '#fff' },
                      },
                      '&:hover': { bgcolor: selected ? 'primary.dark' : 'rgba(255,255,255,0.06)' },
                    }}
                  >
                    <ListItemIcon sx={{ color: selected ? '#fff' : 'rgba(148,163,184,0.95)', minWidth: 36 }}>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.text}
                      primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: selected ? 600 : 500 }}
                    />
                    {item.badge ? (
                      <Badge badgeContent={item.badge} color="error" sx={{ ml: 1 }} />
                    ) : null}
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Box>
      ))}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: theme.zIndex.drawer + 1,
          bgcolor: NAVY,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 56, sm: 64 }, gap: 1 }}>
          {isMobile && (
            <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(!mobileOpen)}>
              <MenuIcon />
            </IconButton>
          )}
          <Logo height={36} sx={{ flexShrink: 0, height: { xs: 28, sm: 36 } }} />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'rgba(255,255,255,0.95)', lineHeight: 1.2 }} noWrap>
              {currentPage}
            </Typography>
            {subtitle && (
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', display: { xs: 'none', sm: 'block' } }} noWrap>
                {subtitle}
              </Typography>
            )}
          </Box>
          {extraToolbar}
          <Tooltip title={mode === 'dark' ? 'Light theme' : 'Dark theme'}>
            <IconButton color="inherit" onClick={toggleColorMode} aria-label="Toggle colour theme">
              {mode === 'dark' ? <LightMode /> : <DarkMode />}
            </IconButton>
          </Tooltip>
          <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>
            <Avatar sx={{ width: 36, height: 36, bgcolor: 'secondary.main', fontSize: '0.95rem' }}>
              {user?.name?.charAt(0)}
            </Avatar>
          </IconButton>
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
            <MenuItem disabled>
              <Typography variant="body2">{user?.name}</Typography>
            </MenuItem>
            <MenuItem disabled>
              <Typography variant="caption" color="text.secondary">
                {user?.role?.replace(/_/g, ' ')}
              </Typography>
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { setAnchorEl(null); navigate('/change-password'); }}>
              <ListItemIcon><Password fontSize="small" /></ListItemIcon> Change Password
            </MenuItem>
            <MenuItem onClick={() => { logout(); navigate('/login'); }}>
              <ListItemIcon><Logout fontSize="small" /></ListItemIcon> Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Drawer
        variant={isMobile ? 'temporary' : 'permanent'}
        open={isMobile ? mobileOpen : true}
        onClose={() => setMobileOpen(false)}
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            height: '100vh',
            top: 0,
            display: 'flex',
            flexDirection: 'column',
            pt: { xs: 0, md: '64px' },
            bgcolor: NAVY,
            color: '#E2E8F0',
          },
        }}
      >
        {isMobile && (
          <Box sx={{ p: 2, bgcolor: NAVY }}>
            <Logo height={40} />
          </Box>
        )}
        {navList}
        <Box sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <Typography variant="caption" sx={{ color: 'rgba(148,163,184,0.85)' }} display="block">
            Signed in
          </Typography>
          <Typography variant="body2" fontWeight={600} noWrap>{user?.name}</Typography>
          <Typography variant="caption" sx={{ color: 'rgba(148,163,184,0.85)' }}>
            {user?.role?.replace(/_/g, ' ')}
          </Typography>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          width: { xs: '100%', md: `calc(100% - ${DRAWER_WIDTH}px)` },
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 56, sm: 64 } }} />
        <Box sx={{ flex: 1, p: { xs: 1.5, sm: 2, md: 3 }, width: '100%', maxWidth: '100%' }} className="safe-area-padding">
          <Outlet />
        </Box>
        {footer && (
          <Box
            component="footer"
            sx={{
              py: { xs: 1.5, sm: 2 },
              px: { xs: 2, sm: 3 },
              textAlign: 'center',
              color: 'text.secondary',
              borderTop: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              mt: 'auto',
            }}
            className="safe-area-padding"
          >
            {footer}
          </Box>
        )}
      </Box>
      {fab}
    </Box>
  );
}
