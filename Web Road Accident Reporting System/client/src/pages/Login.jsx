import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthShell from '../components/auth/AuthShell';
import AuthField, { icons } from '../components/auth/AuthField';
import PasswordField from '../components/auth/PasswordField';
import SubmitButton from '../components/auth/SubmitButton';
import FormAlert from '../components/auth/FormAlert';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState(null); // { text, kind }
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const validate = () => {
    const e = {};
    const addr = email.trim();
    if (!addr) e.email = 'Enter your email address.';
    else if (!EMAIL_RE.test(addr)) e.email = 'Enter a valid email address.';
    if (!password) e.password = 'Enter your password.';
    setErrors(e);
    if (e.email) document.getElementById('email')?.focus();
    else if (e.password) document.getElementById('pw')?.focus();
    return !e.email && !e.password;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (busy || done) return;
    setAlert(null);
    if (!validate()) return;
    setBusy(true);
    try {
      await login(email.trim(), password);
      setDone(true);
      navigate('/dashboard');
    } catch (err) {
      setBusy(false);
      setAlert({
        text: err.response
          ? err.response.data?.error?.message || 'The server could not process your request. Try again shortly.'
          : 'Unable to sign in. Check your connection and try again.'
      });
    }
  };

  // Clear a field's error and the form alert as soon as the person edits.
  const edit = (field, set) => (ev) => {
    set(ev.target.value);
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
    if (alert) setAlert(null);
  };

  return (
    <AuthShell
      eyebrow="Authorized access"
      title="Welcome back"
      lead="Sign in to the Road Accident Tracker to report incidents and follow their status."
      footer="Need help signing in? Contact your system administrator."
    >
      <FormAlert text={alert?.text} kind={alert?.kind} />
      <form onSubmit={handleSubmit} noValidate>
        <AuthField id="email" name="email" label="Email" icon={icons.mail} delay={600}
          type="email" autoComplete="username" inputMode="email" placeholder="name@example.com"
          value={email} onChange={edit('email', setEmail)} error={errors.email} readOnly={busy} />
        <PasswordField id="pw" name="password" label="Password" delay={680} autoComplete="current-password"
          value={password} onChange={edit('password', setPassword)} error={errors.password} readOnly={busy} />
        <div className="lg-row lg-rise" style={{ '--lg-d': '730ms' }}>
          <button className="lg-lnk" type="button"
            onClick={() => setAlert({ text: 'To reset your password, contact your system administrator.', kind: 'info' })}>
            Forgot password?
          </button>
        </div>
        <SubmitButton busy={busy} done={done} delay={790}
          idle="Sign in" working="Signing in…" finished="Signed in" />
      </form>
      <p className="lg-alt lg-rise" style={{ '--lg-d': '830ms' }}>
        No account yet?<Link className="lg-lnk" to="/register">Create one</Link>
      </p>
    </AuthShell>
  );
}
