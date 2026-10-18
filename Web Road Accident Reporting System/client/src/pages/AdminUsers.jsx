// agap-users: full user management (create, read, update, delete).
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';

const ROLES = [
  { value: 'reporter', label: 'Reporter' },
  { value: 'traffic_officer', label: 'Traffic officer' },
  { value: 'admin', label: 'Admin' }
];
const roleLabel = (role) => ROLES.find(r => r.value === role)?.label || role;
const EMPTY_FORM = { name: '', email: '', phone: '', role: 'reporter', password: '' };
const small = { padding: '0.25rem 0.6rem', fontSize: '0.875rem' };

function errorText(err, fallback) {
  const data = err.response?.data?.error;
  if (err.response?.status === 409 && data?.code === 'DUPLICATE_ENTRY') return 'That email is already registered.';
  if (data?.fields) return Object.values(data.fields).join(' ');
  return data?.message || fallback;
}

function validate(form, creating) {
  const errors = {};
  if (form.name.trim().length < 2) errors.name = 'Enter a name of at least 2 characters.';
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.';
  if (creating && form.password.length < 8) errors.password = 'Password must be at least 8 characters.';
  if (!creating && form.password && form.password.length < 8) errors.password = 'A new password must be at least 8 characters.';
  return errors;
}

function Field({ id, label, error, hint, children }) {
  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <div style={{ color: 'hsl(var(--text-3))', fontSize: '0.8125rem', marginTop: '0.25rem' }}>{hint}</div>}
      {error && <div role="alert" style={{ color: 'hsl(var(--level-severe))', fontSize: '0.8125rem', marginTop: '0.25rem' }}>{error}</div>}
    </div>
  );
}

function UserForm({ creating, initial, isSelf, saving, error, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const set = (key) => (event) => setForm(f => ({ ...f, [key]: event.target.value }));

  const submit = (event) => {
    event.preventDefault();
    const found = validate(form, creating);
    setErrors(found);
    if (Object.keys(found).length === 0) onSubmit(form);
  };

  return (
    <form onSubmit={submit} noValidate>
      {error && <div className="alert alert-error">{error}</div>}
      <Field id="uf-name" label="Name" error={errors.name}>
        <input id="uf-name" value={form.name} onChange={set('name')} autoFocus />
      </Field>
      <Field id="uf-email" label="Email" error={errors.email}>
        <input id="uf-email" type="email" value={form.email} onChange={set('email')} />
      </Field>
      <Field id="uf-phone" label="Phone (optional)">
        <input id="uf-phone" value={form.phone} onChange={set('phone')} />
      </Field>
      <Field id="uf-role" label="Role" hint={isSelf ? 'You cannot change your own role.' : undefined}>
        <select id="uf-role" value={form.role} onChange={set('role')} disabled={isSelf}>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </Field>
      <Field
        id="uf-password"
        label={creating ? 'Password' : 'New password (optional)'}
        error={errors.password}
        hint={creating ? 'At least 8 characters.' : 'Leave blank to keep the current password.'}
      >
        <input id="uf-password" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : creating ? 'Add user' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // { mode: 'create' | 'edit' | 'delete', user? }
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [listError, setListError] = useState('');

  const load = useCallback(async () => {
    const params = {};
    if (roleFilter) params.role = roleFilter;
    if (activeFilter !== '') params.is_active = activeFilter;
    try {
      const res = await api.get('/users', { params });
      setUsers(res.data);
      setListError('');
    } catch (err) {
      setListError(errorText(err, 'Could not load users.'));
    } finally {
      setLoading(false);
    }
  }, [roleFilter, activeFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u => [u.name, u.email, u.phone].some(v => String(v || '').toLowerCase().includes(q)));
  }, [users, search]);

  const closeModal = () => { setModal(null); setFormError(''); };

  const toggleActive = async (u) => {
    try {
      await api.patch(`/users/${u.id}`, { is_active: u.is_active ? 0 : 1 });
      setUsers(list => list.map(x => x.id === u.id ? { ...x, is_active: x.is_active ? 0 : 1 } : x));
    } catch (err) {
      setListError(errorText(err, 'Could not change the account status.'));
    }
  };

  const save = async (form) => {
    setSaving(true);
    setFormError('');
    try {
      if (modal.mode === 'create') {
        await api.post('/users', {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          phone: form.phone.trim() || undefined
        });
        setNotice('User added.');
      } else {
        const target = modal.user;
        const body = { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || null };
        if (form.password) body.password = form.password;
        await api.patch(`/users/${target.id}`, body);
        if (form.role !== target.role) await api.patch(`/users/${target.id}/role`, { role: form.role });
        setNotice('Changes saved.');
      }
      closeModal();
      await load();
    } catch (err) {
      setFormError(errorText(err, 'Could not save. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setFormError('');
    try {
      await api.delete(`/users/${modal.user.id}`);
      setNotice(`${modal.user.name} was deleted.`);
      closeModal();
      await load();
    } catch (err) {
      setFormError(errorText(err, 'Could not delete this user.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="container">Loading...</div>;

  return (
    <div className="container">
      <div className="page-title"><h1>User Management</h1></div>

      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      {listError && <div className="alert alert-error">{listError}</div>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="status-filter" style={{ marginBottom: 0 }}>
          <input
            type="search"
            placeholder="Search name, email or phone"
            aria-label="Search users"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 'auto', minWidth: '240px' }}
          />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} aria-label="Filter by role">
            <option value="">All Roles</option>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select value={activeFilter} onChange={e => setActiveFilter(e.target.value)} aria-label="Filter by status">
            <option value="">All Status</option>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
          <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setModal({ mode: 'create' })}>
            Add user
          </button>
        </div>
      </div>

      <div className="card">
        {visible.length === 0 ? <p style={{ color: 'hsl(var(--text-3))' }}>No users found.</p> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Phone</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              {visible.map(u => {
                const isSelf = u.id === me?.id;
                return (
                  <tr key={u.id}>
                    <td>{u.name}{isSelf && <span style={{ color: 'hsl(var(--text-3))' }}> (you)</span>}</td>
                    <td>{u.email}</td>
                    <td><span className={`badge badge-${u.role}`}>{roleLabel(u.role)}</span></td>
                    <td>{u.phone || '-'}</td>
                    <td><span className={`badge badge-${u.is_active ? 'resolved' : 'rejected'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>{new Date(u.created_at).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-secondary" style={small} onClick={() => setModal({ mode: 'edit', user: u })}>Edit</button>
                        <button type="button" className="btn btn-secondary" style={small} disabled={isSelf && !!u.is_active} title={isSelf ? 'You cannot deactivate your own account' : undefined} onClick={() => toggleActive(u)}>
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button type="button" className="btn btn-secondary" style={{ ...small, color: 'hsl(var(--level-severe))' }} disabled={isSelf} title={isSelf ? 'You cannot delete your own account' : undefined} onClick={() => setModal({ mode: 'delete', user: u })}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal && modal.mode !== 'delete' && (
        <Modal title={modal.mode === 'create' ? 'Add user' : `Edit ${modal.user.name}`} onClose={closeModal}>
          <UserForm
            creating={modal.mode === 'create'}
            initial={modal.mode === 'create' ? EMPTY_FORM : { name: modal.user.name, email: modal.user.email, phone: modal.user.phone || '', role: modal.user.role, password: '' }}
            isSelf={modal.mode === 'edit' && modal.user.id === me?.id}
            saving={saving}
            error={formError}
            onSubmit={save}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {modal?.mode === 'delete' && (
        <Modal title="Delete user" onClose={closeModal} width={420}>
          {formError && <div className="alert alert-error">{formError}</div>}
          <p>Delete <strong>{modal.user.name}</strong> ({modal.user.email}) permanently?</p>
          <p style={{ color: 'hsl(var(--text-3))', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Accounts that have submitted reports or taken actions on record cannot be deleted. Deactivate those instead.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
            <button type="button" className="btn btn-danger" onClick={remove} disabled={saving}>{saving ? 'Deleting...' : 'Delete user'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
