const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.100:8000';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function parseError(response) {
  try {
    const body = await response.json();
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body.detail)) return body.detail.map((d) => d.msg).join(', ');
  } catch (e) {
    return response.statusText || 'request failed';
  }
  return 'request failed';
}

async function request(path, { method = 'GET', body, token, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(form).toString();
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { method, headers, body: payload });
  } catch (e) {
    throw new ApiError(0, `cannot reach ${BASE_URL}, check the API address`);
  }

  if (response.status === 204) return null;
  if (!response.ok) throw new ApiError(response.status, await parseError(response));
  return response.json();
}

export const api = {
  baseUrl: BASE_URL,
  health: () => request('/health'),
  register: (email, password) => request('/auth/register', { method: 'POST', body: { email, password } }),
  login: (email, password) =>
    request('/auth/token', { method: 'POST', form: { username: email, password } }),
  me: (token) => request('/auth/me', { token }),
  listItems: (token, query) =>
    request(`/items${query ? `?q=${encodeURIComponent(query)}` : ''}`, { token }),
  createItem: (token, item) => request('/items', { method: 'POST', body: item, token }),
  updateItem: (token, id, changes) =>
    request(`/items/${id}`, { method: 'PATCH', body: changes, token }),
  deleteItem: (token, id) => request(`/items/${id}`, { method: 'DELETE', token }),
};
