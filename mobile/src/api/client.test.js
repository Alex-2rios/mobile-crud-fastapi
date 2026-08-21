import { ApiError, api } from './client';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => body,
  };
}

function emptyResponse(status) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'No Content',
    json: async () => {
      throw new Error('no body');
    },
  };
}

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  delete global.fetch;
});

function lastCall() {
  return global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
}

describe('building the request', () => {
  test('a token is sent as a bearer header', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ total: 0, items: [] }));

    await api.listItems('abc123');

    const [, options] = lastCall();
    expect(options.headers.Authorization).toBe('Bearer abc123');
  });

  test('a json body sets the content type and is serialised', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ id: 1 }));

    await api.createItem('abc123', { sku: 'SW-01', name: 'Switch' });

    const [url, options] = lastCall();
    expect(url).toContain('/items');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({ sku: 'SW-01', name: 'Switch' });
  });

  test('the login uses form encoding, because that is what the oauth2 flow expects', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ access_token: 't', expires_in: 3600 }));

    await api.login('user@example.com', 'supersecret1');

    const [url, options] = lastCall();
    expect(url).toContain('/auth/token');
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(options.body).toBe('username=user%40example.com&password=supersecret1');
  });

  test('a search term is url encoded rather than pasted into the path', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ total: 0, items: [] }));

    await api.listItems('abc123', 'patch cable & reel');

    const [url] = lastCall();
    expect(url).toContain('q=patch%20cable%20%26%20reel');
  });

  test('no search term means no query string at all', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ total: 0, items: [] }));

    await api.listItems('abc123');

    expect(lastCall()[0].endsWith('/items')).toBe(true);
  });

  test('a delete returns nothing and does not try to parse a body', async () => {
    global.fetch.mockResolvedValue(emptyResponse(204));

    await expect(api.deleteItem('abc123', 7)).resolves.toBeNull();
  });
});

describe('every endpoint the app uses', () => {
  test.each([
    ['health', () => api.health(), 'GET', '/health'],
    ['register', () => api.register('a@b.com', 'supersecret1'), 'POST', '/auth/register'],
    ['login', () => api.login('a@b.com', 'supersecret1'), 'POST', '/auth/token'],
    ['me', () => api.me('t'), 'GET', '/auth/me'],
    ['listItems', () => api.listItems('t'), 'GET', '/items'],
    ['createItem', () => api.createItem('t', { sku: 'X' }), 'POST', '/items'],
    ['updateItem', () => api.updateItem('t', 7, { quantity: 2 }), 'PATCH', '/items/7'],
    ['deleteItem', () => api.deleteItem('t', 7), 'DELETE', '/items/7'],
  ])('%s hits %s %s', async (_name, call, method, path) => {
    global.fetch.mockResolvedValue(jsonResponse({}));

    await call();

    const [url, options] = lastCall();
    expect(url.endsWith(path)).toBe(true);
    expect(options.method ?? 'GET').toBe(method);
  });

  test('the registration body carries the credentials as json', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ id: 1 }));

    await api.register('new@example.com', 'supersecret1');

    expect(JSON.parse(lastCall()[1].body)).toEqual({
      email: 'new@example.com',
      password: 'supersecret1',
    });
  });

  test('a partial update only sends the fields that changed', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ id: 7 }));

    await api.updateItem('t', 7, { quantity: 5 });

    expect(JSON.parse(lastCall()[1].body)).toEqual({ quantity: 5 });
  });

  test('the base url is exposed so the login screen can show what it is talking to', () => {
    expect(api.baseUrl).toMatch(/^https?:\/\//);
  });
});

describe('when the server says no', () => {
  test('a string detail becomes the error message', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ detail: 'wrong email or password' }, 401));

    await expect(api.login('a@b.com', 'nope')).rejects.toThrow('wrong email or password');
  });

  test('a validation error with several fields is joined into one message', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse(
        { detail: [{ msg: 'sku is required' }, { msg: 'quantity must be positive' }] },
        422,
      ),
    );

    await expect(api.createItem('t', {})).rejects.toThrow(
      'sku is required, quantity must be positive',
    );
  });

  test('the status code is carried on the error so a 401 can sign the user out', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ detail: 'expired' }, 401));

    await expect(api.listItems('stale-token')).rejects.toMatchObject({
      status: 401,
      message: 'expired',
    });
  });

  test('a body that is not json still produces a usable error', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => {
        throw new Error('not json');
      },
    });

    await expect(api.listItems('t')).rejects.toThrow('Bad Gateway');
  });
});

describe('when the server is not there at all', () => {
  test('a network failure names the address instead of saying "failed to fetch"', async () => {
    global.fetch.mockRejectedValue(new TypeError('Network request failed'));

    await expect(api.health()).rejects.toThrow(/cannot reach .*check the API address/);
  });

  test('a network failure is still an ApiError, with status zero', async () => {
    global.fetch.mockRejectedValue(new TypeError('Network request failed'));

    const error = await api.health().catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
  });
});
