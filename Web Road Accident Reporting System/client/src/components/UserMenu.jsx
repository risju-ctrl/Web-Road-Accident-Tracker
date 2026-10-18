import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ROLE_LABELS = { admin: 'Administrator', traffic_officer: 'Traffic officer', reporter: 'Reporter' };

export default function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!e.target.closest?.('.rw-user')) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!user) return null;
  const initials = String(user.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="rw-user">
      <button type="button" className="rw-chip" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="rw-avatar" aria-hidden="true">{initials}</span>
        <span className="rw-who"><b>{user.name}</b><small>{ROLE_LABELS[user.role] || user.role}</small></span>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m7 10 5 5 5-5" /></svg>
      </button>
      {open && (
        <div className="rw-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { logout(); navigate('/login'); }}>Log out</button>
        </div>
      )}
    </div>
  );
}
