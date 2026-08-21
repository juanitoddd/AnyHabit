import { API_FETCH_OPTIONS, API_URL } from '../config/api';

/**
 * Turn a failed response into an Error carrying a message worth showing.
 *
 * The API answers errors as `{"detail": "..."}`. Rendering the raw body meant
 * users saw literal JSON in the UI, so the detail is unwrapped here once for
 * every caller instead of being re-implemented per service.
 */
async function toRequestError(response) {
  const body = await response.text();
  let message = body || `Request failed (${response.status})`;

  try {
    const parsed = JSON.parse(body);
    message = parsed.detail || parsed.message || message;

    // FastAPI validation failures can still arrive as an array of issues.
    if (Array.isArray(message)) {
      message = message.map((issue) => issue.msg || String(issue)).join('; ');
    }
  } catch {
    // Not JSON — keep the plain-text body.
  }

  // 401s are left alone: the backend distinguishes an expired session from a
  // wrong password, and flattening both into one message told someone who had
  // simply mistyped their password that their session had expired.
  // Gateway errors, by contrast, arrive as proxy HTML with nothing readable.
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    message = 'The AnyHabit server is not responding. Is the backend running?';
  }

  const error = new Error(message);
  error.status = response.status;
  return error;
}

async function request(path, { parse = 'json', ...options } = {}) {
  const hasBody = options.body !== undefined && !(options.body instanceof FormData);

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...API_FETCH_OPTIONS,
      ...options,
      headers: {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
  } catch (networkError) {
    // fetch only rejects when the request never reached the server.
    const error = new Error('Could not reach the AnyHabit server. Check your connection and try again.');
    error.status = 0;
    error.cause = networkError;
    throw error;
  }

  if (!response.ok) {
    throw await toRequestError(response);
  }

  if (parse === 'none' || response.status === 204) return null;
  if (parse === 'text') return response.text();
  if (parse === 'blob') return response.blob();

  return response.json();
}

export const apiClient = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) =>
    request(path, { ...options, method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
  put: (path, body, options) =>
    request(path, { ...options, method: 'PUT', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
  patch: (path, body, options) =>
    request(path, { ...options, method: 'PATCH', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  upload: (path, formData, options) => request(path, { ...options, method: 'POST', body: formData }),
  raw: request
};

export default apiClient;
