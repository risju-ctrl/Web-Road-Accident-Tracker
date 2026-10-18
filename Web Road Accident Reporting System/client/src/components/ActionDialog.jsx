import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';

// An in-app replacement for window.prompt(): a titled dialog with one text box,
// optional/required validation, an inline error line and a busy state.
// onSubmit receives the trimmed text. The parent decides when to close it.
export default function ActionDialog({
  title,
  intro,
  label = 'Note',
  placeholder = '',
  required = false,
  submitLabel = 'Save',
  busyLabel = 'Saving…',
  tone = 'primary', // 'primary' | 'danger'
  maxLength = 500,
  rows = 4,
  busy = false,
  error = '',
  onSubmit,
  onCancel,
  children
}) {
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const text = value.trim();
  const missing = required && !text;

  const submit = (event) => {
    event.preventDefault();
    setTouched(true);
    if (missing || busy) return;
    onSubmit(text);
  };

  const onKeyDown = (event) => {
    // Ctrl/Cmd + Enter sends, plain Enter adds a new line.
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit(event);
  };

  const btnTone = tone === 'danger' ? 'rd-btn rd-btn--danger' : 'rd-btn rd-btn--primary';

  return (
    <Modal title={title} onClose={() => { if (!busy) onCancel(); }}>
      <form onSubmit={submit} noValidate>
        {intro && <p className="rd-muted" style={{ marginBottom: 12 }}>{intro}</p>}
        {children}
        <label className="rd-field">
          <span>{label}{required ? '' : ' (optional)'}</span>
          <textarea
            ref={inputRef}
            value={value}
            rows={rows}
            maxLength={maxLength}
            placeholder={placeholder}
            disabled={busy}
            aria-required={required}
            aria-invalid={touched && missing}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <small className="rd-field-foot">
            <em className={touched && missing ? 'is-bad' : ''}>
              {touched && missing ? 'This is required.' : required ? 'Required' : ''}
            </em>
            <span>{value.length}/{maxLength}</span>
          </small>
        </label>
        {error && <p className="rd-assign-err" role="alert">{error}</p>}
        <div className="rd-modal-actions">
          <button type="button" className="rd-btn" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="submit" className={btnTone} disabled={busy}>{busy ? busyLabel : submitLabel}</button>
        </div>
      </form>
    </Modal>
  );
}
