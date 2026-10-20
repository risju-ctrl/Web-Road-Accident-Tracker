import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';
import UserMenu from './UserMenu';
import DesktopWindow from './DesktopWindow';
import OfficerDutyToggle from './OfficerDutyToggle';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', roles: ['reporter', 'admin', 'traffic_officer'] },
  { to: '/reports', label: 'Reports', roles: ['reporter', 'admin', 'traffic_officer'], end: true },
  { to: '/map', label: 'Map', roles: ['reporter', 'admin', 'traffic_officer'] },
  { to: '/notifications', label: 'Notifications', roles: ['reporter', 'admin', 'traffic_officer'] },
  { to: '/officer', label: 'Officer', roles: ['traffic_officer', 'admin'] },
  { to: '/admin', label: 'Analytics', roles: ['admin'], end: true },
  { to: '/admin/users', label: 'Users', roles: ['admin'] },
  { to: '/admin/audit-logs', label: 'Audit logs', roles: ['admin'] }
];

export default function Layout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(user?.role));

  // Reports/new and report details belong to the Reports tab.
  const isReports = pathname.startsWith('/reports');

  const toolbar = (
    <>
      <nav aria-label="Main" className="rw-nav">
        {visibleNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive || (item.to === '/reports' && isReports) ? 'active' : '')}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="rw-tools">
        {user?.role === 'traffic_officer' && <OfficerDutyToggle />}
        <ThemeToggle />
        <NotificationBell />
        <UserMenu />
      </div>
    </>
  );

  return (
    <DesktopWindow toolbar={toolbar}>
      <Outlet />
    </DesktopWindow>
  );
}
