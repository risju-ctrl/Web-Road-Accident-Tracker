import { useEffect, useRef, useState } from 'react';
import api from '../services/api';

// Lets a traffic officer say they are on duty and, while they are, shares where they are
// so the admin can be shown the nearest officer for a new report. It lives in the app
// toolbar so sharing keeps going on every page, not just one.
//
// The browser only reports a position while the app is open, and only over https (or
// localhost) after the officer allows it.

const SEND_EVERY_MS = 60 * 1000;
// About 50 m. A smaller move than this is not worth a request.
const MOVED_DEGREES = 0.0005;

export default function OfficerDutyToggle() {
  const [onDuty, setOnDuty] = useState(null); // null until the saved state loads
  const [problem, setProblem] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const lastSent = useRef({ at: 0, lat: null, lng: null });

  useEffect(() => {
    api.get('/traffic-officer/location')
      .then((res) => { setOnDuty(res.data.on_duty !== false); setUpdatedAt(res.data.location_updated_at); })
      .catch(() => setOnDuty(true));
  }, []);

  useEffect(() => {
    if (!onDuty) return undefined;
    if (!navigator.geolocation) { setProblem('This browser cannot share a location.'); return undefined; }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setProblem('');
        const { latitude, longitude } = pos.coords;
        const last = lastSent.current;
        const due = Date.now() - last.at >= SEND_EVERY_MS;
        const moved = last.lat === null
          || Math.abs(latitude - last.lat) > MOVED_DEGREES
          || Math.abs(longitude - last.lng) > MOVED_DEGREES;
        // Send on the first fix, then when a minute has passed and the officer has moved.
        if (last.lat !== null && !(due && moved)) return;
        lastSent.current = { at: Date.now(), lat: latitude, lng: longitude };
        api.put('/traffic-officer/location', { latitude, longitude })
          .then((res) => setUpdatedAt(res.data.location_updated_at))
          .catch(() => { lastSent.current.at = 0; });
      },
      (err) => setProblem(err.code === 1 ? 'Location is blocked in this browser.' : 'Could not get your location.'),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [onDuty]);

  const toggle = async () => {
    const next = !onDuty;
    setOnDuty(next);
    if (next) lastSent.current = { at: 0, lat: null, lng: null };
    try {
      await api.put('/traffic-officer/location', { on_duty: next });
    } catch {
      setOnDuty(!next);
    }
  };

  if (onDuty === null) return null;

  const title = !onDuty
    ? 'You are off duty and will not be suggested for new reports. Click to go on duty.'
    : problem
      ? `${problem} The admin cannot see where you are. Click to go off duty.`
      : updatedAt
        ? `On duty and sharing your location. Last shared ${new Date(updatedAt).toLocaleTimeString()}. Click to go off duty.`
        : 'On duty. Waiting for your location. Click to go off duty.';

  return (
    <button
      type="button"
      className={`duty-toggle${onDuty ? ' is-on' : ''}${onDuty && problem ? ' has-problem' : ''}`}
      onClick={toggle}
      title={title}
      aria-pressed={onDuty}
    >
      <i aria-hidden="true" />
      {onDuty ? (problem ? 'On duty, no location' : 'On duty') : 'Off duty'}
    </button>
  );
}
