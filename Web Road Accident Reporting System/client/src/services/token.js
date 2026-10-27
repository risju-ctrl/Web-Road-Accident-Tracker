// The session token lives in localStorage when the user asks to stay signed in,
// and in sessionStorage otherwise, so an unticked "keep me signed in" really
// ends when the browser closes.
const KEY = 'token';

export function getToken() {
  return localStorage.getItem(KEY) || sessionStorage.getItem(KEY);
}

export function saveToken(token, remember) {
  clearToken();
  (remember ? localStorage : sessionStorage).setItem(KEY, token);
}

export function clearToken() {
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
}
