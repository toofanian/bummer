const API = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

export function apiFetch(path, options = {}, session = null) {
  const headers = {
    'Content-Type': 'application/json',
    ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...(options.headers ?? {}),
  }
  return fetch(`${API}${path}`, { ...options, headers })
}
