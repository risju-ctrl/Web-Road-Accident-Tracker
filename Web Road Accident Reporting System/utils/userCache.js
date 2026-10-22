// Short-lived in-memory cache of the user row that requireAuth loads on every request.
// Without it each API call pays one extra database round trip just to learn who is
// calling. Anything that changes a user's role, active flag or details must call
// invalidateUser(id) so the change takes effect on the next request (User.update and
// User.remove do). Changes made directly in the Supabase dashboard are picked up when
// the entry expires (AUTH_CACHE_TTL_MS, default 30 s; set 0 to turn the cache off).
// Like the logout block-list in middleware/auth.js this is per process.
const TTL_MS = process.env.AUTH_CACHE_TTL_MS !== undefined ? Number(process.env.AUTH_CACHE_TTL_MS) : 30 * 1000;
const MAX_ENTRIES = 1000;
const entries = new Map();

export function getCachedUser(id) {
  if (!(TTL_MS > 0)) return null;
  const hit = entries.get(id);
  if (!hit) return null;
  if (hit.expires < Date.now()) { entries.delete(id); return null; }
  return hit.user;
}

export function cacheUser(id, user) {
  if (!(TTL_MS > 0)) return;
  if (entries.size >= MAX_ENTRIES) entries.clear();
  entries.set(id, { user, expires: Date.now() + TTL_MS });
}

export function invalidateUser(id) {
  entries.delete(Number(id));
  entries.delete(String(id));
}
