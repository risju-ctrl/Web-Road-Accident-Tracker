import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// A dialog drawn straight into <body>. The window toolbar uses backdrop-filter,
// which makes it the containing block for any position:fixed child, so a modal
// rendered inside the toolbar (like the bell's) gets clipped to the toolbar.
// Rendering at the body keeps it centred on the whole screen.
export default function Modal({ title, onClose, children, width = 440 }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="modal-overlay"
      style={{ zIndex: 5000 }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button type="button" className="btn btn-secondary" aria-label="Close" onClick={onClose} style={{ padding: '0.15rem 0.6rem', fontSize: '1.125rem', lineHeight: 1.2 }}>×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
