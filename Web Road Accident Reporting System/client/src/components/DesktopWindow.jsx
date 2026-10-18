import { Link } from 'react-router-dom';

// The macOS-style window every screen lives in: a wallpaper desktop, one large
// rounded window, and a unified toolbar that carries the traffic lights. The
// lights are decoration only; the app has no window to close or minimise.

export function Logo() {
  return (
    <Link to="/dashboard" className="rw-brand">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M8 3 4 21M16 3l4 18" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <path d="M12 5v3M12 11v3M12 17v3" stroke="#E8DFB5" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      Roadwatch.
    </Link>
  );
}

export default function DesktopWindow({ toolbar, children, contentClassName = '', contentProps = {} }) {
  return (
    <div className="rw-desktop">
      <div className="rw-window">
        <header className="rw-toolbar">
          <div className="rw-lights" aria-hidden="true"><i /><i /><i /></div>
          <Logo />
          {toolbar}
        </header>
        <main className={`rw-content ${contentClassName}`} {...contentProps}>
          {children}
        </main>
      </div>
    </div>
  );
}
