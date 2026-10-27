import { Icon } from './AuthShell';

// Primary action: spinner while busy, check mark once done.
export default function SubmitButton({ busy, done, idle, working, finished, delay }) {
  return (
    <button className="lg-go lg-rise" style={{ '--lg-d': `${delay}ms` }} type="submit"
      disabled={busy || done} aria-busy={busy} {...(done ? { 'data-ok': '' } : {})}>
      <span className="lg-spin" aria-hidden="true" />
      <Icon className="lg-chk" sw={2.4}><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>
      <span>{done ? finished : busy ? working : idle}</span>
      <Icon className="lg-arr" sw={2.2}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>
    </button>
  );
}
