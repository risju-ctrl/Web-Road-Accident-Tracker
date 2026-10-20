import { useEffect, useRef, useState } from 'react';
import api from '../services/api';

// Lets a traffic officer say they are on duty and, while they are, shares where they are
// so the admin can be shown the nearest officer for a new report. It lives in the app
// toolbar so sharing keeps going on every page, not just one.
//
// The browser only reports a position while the app is open, and only over https (or
// localhost) after the officer allows it.

// The position is re-sent this often even when the officer is standing still, so the admin's
// live map can tell "parked and online" from "closed the app".
const SEND_EVERY_MS = 30 * 1000;

export default function OfficerDutyToggle() {
  const [onDuty, setOnDuty] = useState(null); // null until the saved state loads
  const [problem, setProblem] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  // Latest position the browser reported. A desktop browser may report only once while the
  // officer stays put, so a timer re-sends this instead of waiting for the next fix.
  const latest = useRef(null);

  useEffect(() => {
    api.get('/traffic-officer/location')
      .then((res) => { setOnDuty(res.data.on_duty !== false); setUpdatedAt(res.data.location_updated_at); })
      .catch(() => setOnDuty(true));
  }, []);

  useEffect(() => {
    if (!onDuty) return undefined;
    if (!navigator.geolocation) { setProblem('This browser cannot share a location.'); return undefined; }

    latest.current = null;
    const send = () => {
      if (!latest.current) return;
      api.put('/traffic-officer/location', latest.current)
        .then((res) => setUpdatedAt(res.data.location_updated_at))
        .catch(() => {});
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setProblem('');
        const first = latest.current === null;
        latest.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        if (first) send(); // do not make the officer wait 30 s to appear on the map
      },
      (err) => setProblem(err.code === 1 ? 'Location is blocked in this browser.' : 'Could not get your location.'),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 }
    );
    const timer = setInterval(send, SEND_EVERY_MS);
    return () => { navigator.geolocation.clearWatch(watchId); clearInterval(timer); };
  }, [onDuty]);

  const toggle = async () => {
    const next = !onDuty;
    setOnDuty(next);
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
