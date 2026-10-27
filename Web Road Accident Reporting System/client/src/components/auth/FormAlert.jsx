import { Icon } from './AuthShell';

// Form-level message (server errors, notices). Collapses when empty.
export default function FormAlert({ text, kind }) {
  return (
    <div className={`lg-msg lg-alert${text ? ' lg-show' : ''}${kind === 'info' ? ' lg-info' : ''}`} role="alert" aria-live="assertive">
      <div>
        <div>
          <Icon size={16} sw={2}><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.01" /></Icon>
          <span>{text}</span>
        </div>
      </div>
    </div>
  );
}
