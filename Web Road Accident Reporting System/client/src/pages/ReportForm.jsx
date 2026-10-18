import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const initialForm = {
  title: '', description: '', accident_date: '', accident_time: '',
  location: '', latitude: '', longitude: '', vehicle_type: '',
  injury_status: 'unknown', severity: '', vehicles_involved: '',
  injuries: '', fatalities: '', accident_category_id: ''
};

export default function ReportForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const [form, setForm] = useState(initialForm);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState([]); // [{ file, url }]
  const [locating, setLocating] = useState(false);
  const photoUrls = useRef([]);
  photoUrls.current = photos.map((p) => p.url);
  useEffect(() => () => photoUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const MAX_PHOTOS = 5;
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  const addPhotos = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    const problems = [];
    const accepted = [];
    for (const f of picked) {
      if (!ALLOWED.includes(f.type)) problems.push(`${f.name}: only JPG, PNG, WebP or PDF`);
      else if (f.size > 10 * 1024 * 1024) problems.push(`${f.name}: larger than 10 MB`);
      else accepted.push({ file: f, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : '' });
    }
    const room = MAX_PHOTOS - photos.length;
    if (accepted.length > room) {
      accepted.slice(room).forEach((a) => a.url && URL.revokeObjectURL(a.url));
      problems.push(`You can attach up to ${MAX_PHOTOS} files`);
    }
    setPhotos([...photos, ...accepted.slice(0, room)]);
    setError(problems.join('. '));
  };
  const removePhoto = (i) => {
    if (photos[i].url) URL.revokeObjectURL(photos[i].url);
    setPhotos(photos.filter((_, idx) => idx !== i));
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) { setError('This browser cannot detect your location. Enter it manually.'); return; }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
        setLocating(false);
      },
      () => { setLocating(false); setError('Could not get your location. Allow location access or enter the coordinates manually.'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    api.get('/accident-categories').then(res => setCategories(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (isEdit) {
      setLoading(true);
      api.get(`/reports/${id}`)
        .then(res => {
          const r = res.data;
          setForm({
            title: r.title, description: r.description,
            accident_date: r.accident_date?.slice(0,10) || '',
            accident_time: r.accident_time?.slice(0,5) || '',
            location: r.location, latitude: r.latitude || '',
            longitude: r.longitude || '', vehicle_type: r.vehicle_type || '',
            injury_status: r.injury_status, severity: r.severity || '',
            vehicles_involved: r.vehicles_involved || '',
            injuries: r.injuries || '', fatalities: r.fatalities || '',
            accident_category_id: r.accident_category_id || ''
          });
        })
        .catch(() => setError('Failed to load report'))
        .finally(() => setLoading(false));
    }
  }, [id, isEdit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const data = { ...form };
      Object.keys(data).forEach(k => data[k] === '' && delete data[k]);
      if (isEdit) {
        await api.patch(`/reports/${id}`, data);
      } else {
        const created = await api.post('/reports', data);
        // The report exists now; attach the photos one by one and report any that fail.
        const failed = [];
        for (const p of photos) {
          const fd = new FormData();
          fd.append('file', p.file);
          try { await api.post(`/reports/${created.data.id}/evidence`, fd); } catch { failed.push(p.file.name); }
        }
        if (failed.length) {
          navigate(`/reports/${created.data.id}`, {
            state: {
              noticeKind: 'error',
              notice: `Report submitted, but these files could not be uploaded: ${failed.join(', ')}. You can add them with Upload below.`
            }
          });
          return;
        }
      }
      navigate('/reports');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="container">Loading...</div>;

  return (
    <div className="container" style={{ maxWidth: '800px' }}>
      <div className="page-title">
        <h1>{isEdit ? 'Edit Report' : 'New Accident Report'}</h1>
      </div>
      <div className="card">
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Title *</label>
              <input type="text" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>Category</label>
              <select value={form.accident_category_id} onChange={e => setForm({...form, accident_category_id: e.target.value})} required>
                <option value="">Select...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Description *</label>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={4} required></textarea>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Accident Date *</label>
              <input type="date" value={form.accident_date} onChange={e => setForm({...form, accident_date: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>Accident Time *</label>
              <input type="time" value={form.accident_time} onChange={e => setForm({...form, accident_time: e.target.value})} required />
            </div>
          </div>
          <div className="form-group">
            <label>Location *</label>
            <input type="text" value={form.location} onChange={e => setForm({...form, location: e.target.value})} required placeholder="Street, City, Landmark" />
          </div>
          <div className="form-group">
            <button type="button" className="btn btn-secondary" onClick={useMyLocation} disabled={locating}>{locating ? 'Locating...' : 'Use my current location'}</button>
            <small style={{ marginLeft: '.75rem' }}>Fills latitude and longitude. You can also type them in.</small>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Latitude</label>
              <input type="number" step="any" value={form.latitude} onChange={e => setForm({...form, latitude: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Longitude</label>
              <input type="number" step="any" value={form.longitude} onChange={e => setForm({...form, longitude: e.target.value})} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Vehicle Type</label>
              <input type="text" value={form.vehicle_type} onChange={e => setForm({...form, vehicle_type: e.target.value})} placeholder="Car, Motorcycle, Truck, etc." />
            </div>
            <div className="form-group">
              <label>Injury Status *</label>
              <select value={form.injury_status} onChange={e => setForm({...form, injury_status: e.target.value})} required>
                <option value="none">None</option>
                <option value="injuries">Injuries</option>
                <option value="fatalities">Fatalities</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Severity</label>
              <select value={form.severity} onChange={e => setForm({...form, severity: e.target.value})}>
                <option value="">Select...</option>
                <option value="minor">Minor</option>
                <option value="moderate">Moderate</option>
                <option value="major">Major</option>
                <option value="fatal">Fatal</option>
              </select>
            </div>
            <div className="form-group">
              <label>Vehicles Involved</label>
              <input type="number" min="0" value={form.vehicles_involved} onChange={e => setForm({...form, vehicles_involved: e.target.value})} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Injuries</label>
              <input type="number" min="0" value={form.injuries} onChange={e => setForm({...form, injuries: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Fatalities</label>
              <input type="number" min="0" value={form.fatalities} onChange={e => setForm({...form, fatalities: e.target.value})} />
            </div>
          </div>
          {!isEdit && (
            <div className="form-group">
              <label>Photos or documents (optional, up to {MAX_PHOTOS})</label>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={addPhotos} disabled={photos.length >= MAX_PHOTOS} />
              {photos.length > 0 && (
                <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', marginTop: '.5rem' }}>
                  {photos.map((p, i) => (
                    <div key={p.url || p.file.name + i} style={{ width: 96, fontSize: '.75rem' }}>
                      {p.url ? <img src={p.url} alt={p.file.name} style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 6 }} /> : <div style={{ width: 96, height: 72, display: 'grid', placeItems: 'center', border: '1px solid #8886', borderRadius: 6 }}>PDF</div>}
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.file.name}>{p.file.name}</div>
                      <button type="button" className="btn btn-secondary" onClick={() => removePhoto(i)}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/reports')}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
