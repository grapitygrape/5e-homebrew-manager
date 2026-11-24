import { describe, expect, it } from 'vitest';
import { error, json } from '@sveltejs/kit';
import {
  apiHandler,
  badRequest,
  boolQueryParam,
  notFound,
  parseJsonBody,
  parseJsonObject,
  requestOrigin,
  requireQueryParam,
} from '../http';

const fakeEvent = (req: Request, urlStr = 'http://localhost:5173/api/test') =>
  ({ request: req, url: new URL(urlStr) }) as Parameters<
    ReturnType<typeof apiHandler>
  >[0];

describe('server/http helpers', () => {
  it('parses valid JSON bodies and objects and rejects malformed input', async () => {
    const okReq = new Request('http://localhost/test', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
    });
    expect(await parseJsonObject(okReq)).toEqual({ a: 1 });

    const arrReq = new Request('http://localhost/test', {
      method: 'POST',
      body: '[1, 2]',
    });
    await expect(parseJsonObject(arrReq)).rejects.toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
    });

    const badReq = new Request('http://localhost/test', {
      method: 'POST',
      body: '{nope',
    });
    await expect(parseJsonBody(badReq)).rejects.toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
    });
  });

  it('extracts required and boolean query parameters', () => {
    const url = new URL(
      'http://localhost/test?file=hb.json&refresh=1&raw=true',
    );
    expect(requireQueryParam(url, 'file')).toBe('hb.json');
    expect(boolQueryParam(url, 'refresh')).toBe(true);
    expect(boolQueryParam(url, 'raw')).toBe(true);
    expect(boolQueryParam(url, 'missing')).toBe(false);
    expect(() => requireQueryParam(url, 'missing')).toThrow(/Missing required/);
  });

  it('formats ApiError, SvelteKit HttpError, and unexpected errors consistently', async () => {
    const req = new Request('http://localhost/api/test');

    const okHandler = apiHandler(() => json({ ok: true }));
    const okRes = await okHandler(fakeEvent(req));
    expect(okRes.status).toBe(200);
    expect(await okRes.json()).toEqual({ ok: true });

    const badHandler = apiHandler(() => {
      throw badRequest('Invalid payload', { field: 'name' });
    });
    const badRes = await badHandler(fakeEvent(req));
    expect(badRes.status).toBe(400);
    expect(await badRes.json()).toEqual({
      message: 'Invalid payload',
      error: {
        code: 'BAD_REQUEST',
        message: 'Invalid payload',
        details: { field: 'name' },
      },
    });

    const missingHandler = apiHandler(() => {
      throw notFound('No such file');
    });
    const missingRes = await missingHandler(fakeEvent(req));
    expect(missingRes.status).toBe(404);
    expect(await missingRes.json()).toEqual({
      message: 'No such file',
      error: { code: 'NOT_FOUND', message: 'No such file' },
    });

    const kitHandler = apiHandler(() => {
      throw error(403, 'Forbidden');
    });
    const kitRes = await kitHandler(fakeEvent(req));
    expect(kitRes.status).toBe(403);
    expect(await kitRes.json()).toMatchObject({
      message: 'Forbidden',
      error: { code: 'HTTP_403', message: 'Forbidden' },
    });

    const crashHandler = apiHandler(() => {
      throw new Error('disk full');
    });
    const crashRes = await crashHandler(fakeEvent(req));
    expect(crashRes.status).toBe(500);
    expect(await crashRes.json()).toEqual({
      message: 'disk full',
      error: { code: 'INTERNAL_ERROR', message: 'disk full' },
    });
  });

  it('resolves requestOrigin from reverse-proxy forwarded headers', () => {
    const url = new URL('http://127.0.0.1:5052/api/foundry/status');
    const plain = new Request(url);
    expect(requestOrigin(plain, url)).toBe('http://127.0.0.1:5052');

    const proxied = new Request(url, {
      headers: {
        'x-forwarded-proto': 'https, http',
        'x-forwarded-host': 'hbm.example.com',
      },
    });
    expect(requestOrigin(proxied, url)).toBe('https://hbm.example.com');
  });
});
