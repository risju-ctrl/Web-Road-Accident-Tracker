import { Link } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

// The macOS-style window every screen lives in: a wallpaper desktop, one large
// rounded window, and a unified toolbar that carries the traffic lights. The
// lights are decoration only; the app has no window to close or minimise.

export function Logo() {
  return (
    <Link to="/dashboard" className="rw-brand" aria-label="AGAP, road incident reporting">
      <img className="agap-mark" src="/agap-mark.png" alt="" width="32" height="32" />
      <span className="agap-name">
        <strong>AGAP</strong>
        <small>Road incident reporting</small>
      </span>
    </Link>
  );
}

export default function DesktopWindow({ toolbar, children, contentClassName = '', contentProps = {} }) {
  return (
    <div className="rw-desktop">
      <div className="rw-window">
        <header className="rw-toolbar">
          <Logo />
          {toolbar ?? <div className="rw-tools"><ThemeToggle /></div>}
        </header>
        <main className={`rw-content ${contentClassName}`} {...contentProps}>
          {children}
        </main>
      </div>
    </div>
  );
}
