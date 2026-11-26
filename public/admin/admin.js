const Admin = (() => {
  const TOKEN_KEY = 'kitaab_admin_token';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    location.href = './index.html';
  }

  function requireAuth() {
    if (!getToken()) location.href = './index.html';
  }

  function escape(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function api(method, path, body, auth = true) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const token = getToken();
      if (!token) {
        logout();
        throw new Error('Not logged in');
      }
      headers.Authorization = 'Bearer ' + token;
    }
    const res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && auth) {
      logout();
      throw new Error(data.message || 'Session expired');
    }
    if (!res.ok || data.status === 'error') {
      throw new Error(data.message || 'Request failed');
    }
    return data;
  }

  return { getToken, setToken, logout, requireAuth, escape, api };
})();
