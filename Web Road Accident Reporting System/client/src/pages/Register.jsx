import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import AuthShell from '../components/auth/AuthShell';
import AuthField, { icons } from '../components/auth/AuthField';
import PasswordField from '../components/auth/PasswordField';
import SubmitButton from '../components/auth/SubmitButton';
import FormAlert from '../components/auth/FormAlert';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const validate = () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = 'Enter your full name.';
    if (!form.email.trim()) e.email = 'Enter your email address.';
    else if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email address.';
    if (form.password.length < 8) e.password = 'Use at least 8 characters.';
    setErrors(e);
    const first = ['name', 'email', 'password'].find(k => e[k]);
    if (first) document.getElementById(first === 'password' ? 'pw' : first)?.focus();
    return !first;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (busy || done) return;
    setAlert(null);
    if (!validate()) return;
    setBusy(true);
    try {
      await api.post('/auth/register', {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined
      });
      // Sign in right away so the new reporter lands straight in the app.
      await login(form.email.trim(), form.password);
      setDone(true);
      navigate('/dashboard');
    } catch (err) {
      setBusy(false);
      const fields = err.response?.data?.error?.fields;
      if (fields) setErrors(fields);
      setAlert({
        text: fields
          ? 'Check the highlighted fields and try again.'
          : err.response
            ? err.response.data?.error?.message || 'Registration failed. Try again shortly.'
            : 'Unable to register. Check your connection and try again.'
      });
    }
  };

  const edit = (field) => (ev) => {
    setForm(prev => ({ ...prev, [field]: ev.target.value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
    if (alert) setAlert(null);
  };

  return (
    <AuthShell
      eyebrow="Reporter sign-up"
      title="Create your account"
      lead="Register to report road incidents and follow how they are handled."
      footer="Officer and administrator accounts are issued by a system administrator."
    >
      <FormAlert text={alert?.text} kind={alert?.kind} />
      <form onSubmit={handleSubmit} noValidate>
        <AuthField id="name" name="name" label="Full name" icon={icons.user} delay={560}
          type="text" autoComplete="name" placeholder="Juan Dela Cruz"
          value={form.name} onChange={edit('name')} error={errors.name} readOnly={busy} />
        <AuthField id="email" name="email" label="Email" icon={icons.mail} delay={620}
          type="email" autoComplete="username" inputMode="email" placeholder="name@example.com"
          value={form.email} onChange={edit('email')} error={errors.email} readOnly={busy} />
        <PasswordField id="pw" name="password" label="Password (at least 8 characters)" delay={680}
          autoComplete="new-password"
          value={form.password} onChange={edit('password')} error={errors.password} readOnly={busy} />
        <AuthField id="phone" name="phone" label="Phone" optional icon={icons.phone} delay={740}
          type="tel" autoComplete="tel" inputMode="tel"
          value={form.phone} onChange={edit('phone')} error={errors.phone} readOnly={busy} />
        <SubmitButton busy={busy} done={done} delay={800}
          idle="Create account" working="Creating account…" finished="Account created" />
      </form>
      <p className="lg-alt lg-rise" style={{ '--lg-d': '840ms' }}>
        Already have an account?<Link className="lg-lnk" to="/login">Log in</Link>
      </p>
    </AuthShell>
  );
}
