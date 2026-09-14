import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../app.js';
import { challengeById } from '../content.js';
export async function fixture(t, options = {}) {
  const clock = { time: Date.parse('2026-01-05T12:00:00Z') };
  const api = createApp({ databasePath: ':memory:', now: () => clock.time, ...options });
  api.server.listen(0, '127.0.0.1');
  await once(api.server, 'listening');
  const base = `http://127.0.0.1:${api.server.address().port}`;
  t.after(() => api.close());
  function client(initialCookie = '') {
    let cookie = initialCookie;
    return {
      get cookie() { return cookie; },
      async request(route, { method = 'GET', body, headers = {} } = {}) {
        const response = await fetch(`${base}${route}`, {
          method,
          headers: { Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return { status: response.status, data: await response.json(), headers: response.headers };
      },
      post(route, body = {}, headers) { return this.request(route, { method: 'POST', body, headers }); },
      async guest() {
        const response = await this.post('/api/auth/guest');
        assert.equal(response.status, 201);
        return response.data.user;
      },
      async start(id, daily = false) {
        const response = await this.post('/api/attempts', { challengeId: id, daily });
        assert.ok([200, 201].includes(response.status), JSON.stringify(response.data));
        return response.data;
      },
      async submit(attempt, answers = challengeById.get(attempt.challenge.id).answers) {
        return this.post(`/api/attempts/${attempt.attemptId}/submit`, { answers });
      },
      async clear(id, daily = false) {
        const attempt = await this.start(id, daily);
        clock.time += 1000;
        const response = await this.submit(attempt);
        assert.equal(response.status, 200);
        assert.equal(response.data.correct, true);
        return response.data;
      },
    };
  }
  return { ...api, clock, base, client };
}
