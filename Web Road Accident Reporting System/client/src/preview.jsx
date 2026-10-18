// Dev-only capture harness: renders the admin console with mock data, without
// the app shell or auth, so headless screenshots can validate the layout.
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboard from './pages/AdminDashboard';
import { AuthProvider } from './context/AuthContext';
import './index.css';

const theme = new URLSearchParams(window.location.search).get('theme');
document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';

createRoot(document.getElementById('root')).render(
  <MemoryRouter>
    <AuthProvider>
      <AdminDashboard />
    </AuthProvider>
  </MemoryRouter>
);
