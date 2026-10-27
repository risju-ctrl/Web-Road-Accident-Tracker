import { useState } from 'react';
import { Icon } from './AuthShell';
import AuthField, { icons } from './AuthField';

// Password input with a show/hide toggle and a Caps Lock hint.
export default function PasswordField({ id = 'pw', autoComplete, onKeyDown, onKeyUp, onBlur, ...props }) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const track = (e) => setCaps(!!e.getModifierState?.('CapsLock'));

  const eye = (
    <button className="lg-eye" type="button" aria-label={show ? 'Hide password' : 'Show password'}
      aria-pressed={show} onClick={() => setShow(s => !s)}>
      <Icon size={20} className="lg-on"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Icon>
      <Icon size={20} className="lg-off"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.5A17 17 0 0 0 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2" /></Icon>
    </button>
  );

  return (
    <AuthField
      id={id}
      icon={icons.lock}
      type={show ? 'text' : 'password'}
      autoComplete={autoComplete}
      trailing={eye}
      hint
      onKeyDown={(e) => { track(e); onKeyDown?.(e); }}
      onKeyUp={(e) => { track(e); onKeyUp?.(e); }}
      onBlur={(e) => { setCaps(false); onBlur?.(e); }}
      {...props}
    >
      <div className={`lg-msg${caps ? ' lg-show' : ''}`}>
        <div>
          <p className="lg-hint" id={`${id}Hint`}>
            <Icon size={14} sw={2}><path d="M12 4l8 9h-5v4H9v-4H4l8-9zM9 20.5h6" /></Icon>Caps Lock is on
          </p>
        </div>
      </div>
    </AuthField>
  );
}
