import { useEffect, useState } from 'react';

// Dark is the default. The inline script in index.html applies the saved choice
// before first paint, so this component only has to keep the button in step.
const readTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

export default function ThemeToggle() {
  const [theme, setTheme] = useState(readTheme);

  // Follow a change made in another tab.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === 'theme' && (event.newValue === 'light' || event.newValue === 'dark')) {
        document.documentElement.dataset.theme = event.newValue;
        setTheme(event.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const next = theme === 'dark' ? 'light' : 'dark';

  const switchTheme = () => {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) { /* storage unavailable */ }
    setTheme(next);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={switchTheme}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      <svg className="ti-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
      <svg className="ti-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    </button>
  );
}
