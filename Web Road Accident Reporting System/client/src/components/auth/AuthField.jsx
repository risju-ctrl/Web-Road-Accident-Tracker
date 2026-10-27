import { Icon } from './AuthShell';

// One labelled input with a leading icon, an optional trailing control (the
// show-password eye) and an animated inline error line.
export default function AuthField({ id, label, optional, icon, error, hint, delay, trailing, children, ...input }) {
  return (
    <div className="lg-field lg-rise" style={{ '--lg-d': `${delay}ms` }}>
      <label htmlFor={id}>{label}{optional && <span className="lg-opt">(optional)</span>}</label>
      <div className="lg-wrap">
        <Icon className="lg-ic">{icon}</Icon>
        <input
          id={id}
          className="lg-ic-in"
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={`${id}Err${hint ? ` ${id}Hint` : ''}`}
          style={trailing ? { paddingRight: 48 } : undefined}
          {...input}
        />
        {trailing}
      </div>
      <div className={`lg-msg${error ? ' lg-show' : ''}`}><div><p id={`${id}Err`}>{error}</p></div></div>
      {children}
    </div>
  );
}

export const icons = {
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 7.5l8.5 6 8.5-6" /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5" /></>,
  phone: <><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A15 15 0 0 1 4 5a1 1 0 0 1 1-1z" /></>
};
