import { useEffect, useRef } from 'react';
import { useThemeName } from '../../theme';
import '../../auth.css';

// Two-panel layout shared by the sign-in and sign-up screens: an animated road
// scene on the left, the form on the right. Theme follows the app-wide
// data-theme attribute (key "theme" in localStorage), same as ThemeToggle.

const Icon = ({ children, size = 18, sw = 1.8, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {children}
  </svg>
);
export { Icon };

function ThemeButton() {
  const theme = useThemeName();
  const next = theme === 'light' ? 'dark' : 'light';

  // Follow a theme change made in another tab.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'theme' && (e.newValue === 'light' || e.newValue === 'dark')) {
        document.documentElement.dataset.theme = e.newValue;
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = () => {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* storage unavailable */ }
  };

  return (
    <button className="lg-theme" type="button" onClick={toggle} aria-label={`Switch to ${next} mode`}>
      <Icon className="lg-sun" strokeWidth={1.8}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
      </Icon>
      <Icon className="lg-moon">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      </Icon>
    </button>
  );
}

export default function AuthShell({ eyebrow, title, lead, children, footer }) {
  const visualRef = useRef(null);
  const labelRef = useRef(null);
  const sceneRef = useRef(null);
  const theme = useThemeName();
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // Let the page behind the overscroll area match the screen.
  useEffect(() => {
    document.documentElement.classList.add('lg-auth');
    return () => document.documentElement.classList.remove('lg-auth');
  }, []);

  // three.js is loaded on demand so it stays out of the main bundle. The scene
  // creates and removes its own canvas, so React StrictMode's mount/unmount/mount
  // in development never reuses a lost WebGL context.
  useEffect(() => {
    let cancelled = false;
    import('../../authScene').then(({ createAuthScene }) => {
      if (cancelled || !visualRef.current) return;
      sceneRef.current = createAuthScene({
        host: visualRef.current,
        label: labelRef.current,
        isLight: themeRef.current === 'light'
      });
    }).catch(() => visualRef.current?.classList.add('lg-no3d'));
    return () => {
      cancelled = true;
      sceneRef.current?.destroy();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => { sceneRef.current?.setTheme(theme === 'light', true); }, [theme]);

  return (
    <div className="lg">
      <section className="lg-visual" ref={visualRef}>
        <div className="lg-fb" aria-hidden="true"><i /></div>
        <div className="lg-plabel" ref={labelRef} aria-hidden="true">Sample incident</div>
        <div className="lg-brand lg-rise" style={{ '--lg-d': '300ms' }}>
          <div className="lg-logo" role="img" aria-label="AGAP Road Incident Reporting" />
        </div>
        <div className="lg-tag">
          <h2>
            <span className="lg-rise" style={{ '--lg-d': '900ms' }}>Report incidents.</span>
            <span className="lg-rise" style={{ '--lg-d': '1030ms' }}>Track responses.</span>
            <span className="lg-rise lg-g" style={{ '--lg-d': '1160ms' }}>Improve road safety.</span>
          </h2>
        </div>
      </section>

      <main className="lg-panel">
        <div className="lg-box">
          <div className="lg-top lg-rise" style={{ '--lg-d': '380ms' }}>
            <span className="lg-eyebrow">
              <Icon size={14} sw={2}><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></Icon>
              {eyebrow}
            </span>
            <ThemeButton />
          </div>
          <h1 className="lg-rise" style={{ '--lg-d': '450ms' }}>{title}</h1>
          <p className="lg-lead lg-rise" style={{ '--lg-d': '520ms' }}>{lead}</p>
          {children}
          <p className="lg-foot lg-rise" style={{ '--lg-d': '870ms' }}>
            <Icon size={15} sw={2}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.01" /></Icon>
            <span>{footer}</span>
          </p>
        </div>
      </main>
    </div>
  );
}
