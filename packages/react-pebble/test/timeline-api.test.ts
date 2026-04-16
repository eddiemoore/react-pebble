/**
 * Unit tests for the Timeline Web API module.
 * Mocks globalThis.fetch and asserts HTTP method, path, headers, and body.
 */

import {
  pushUserPin,
  removeUserPin,
  pushSharedPin,
  removeSharedPin,
  pushUserGlance,
  TimelineApiError,
} from '../src/timeline/index.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Mock infrastructure
// ---------------------------------------------------------------------------

let capturedUrl = '';
let capturedMethod = '';
let capturedHeaders: Record<string, string> = {};
let capturedBody: string | undefined;

let mockStatus = 200;
let mockStatusText = 'OK';
let mockBodyText = '';

const origFetch = globalThis.fetch;

function installMock(status = 200, statusText = 'OK', bodyText = '') {
  mockStatus = status;
  mockStatusText = statusText;
  mockBodyText = bodyText;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedMethod = init?.method ?? 'GET';
    capturedHeaders = {};
    if (init?.headers) {
      Object.assign(capturedHeaders, init.headers);
    }
    capturedBody = init?.body as string | undefined;

    return {
      ok: mockStatus >= 200 && mockStatus < 300,
      status: mockStatus,
      statusText: mockStatusText,
      text: async () => mockBodyText,
    } as Response;
  }) as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = origFetch;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const samplePin = {
  id: 'test-pin-1',
  time: 1700000000000,
  layout: { type: 'genericPin' as const, title: 'Hello' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// 1. pushUserPin
installMock();
await pushUserPin('tok_abc', samplePin);
assert(capturedMethod === 'PUT', `pushUserPin method: expected PUT, got ${capturedMethod}`);
assert(capturedUrl === 'https://timeline-api.rebble.io/v1/user/pins/test-pin-1', `pushUserPin url: ${capturedUrl}`);
assert(capturedHeaders['Content-Type'] === 'application/json', `pushUserPin Content-Type header`);
assert(capturedHeaders['X-User-Token'] === 'tok_abc', `pushUserPin X-User-Token header`);
assert(capturedBody === JSON.stringify(samplePin), `pushUserPin body`);
restoreFetch();

// 2. removeUserPin
installMock();
await removeUserPin('tok_abc', 'test-pin-1');
assert(capturedMethod === 'DELETE', `removeUserPin method: expected DELETE, got ${capturedMethod}`);
assert(capturedUrl === 'https://timeline-api.rebble.io/v1/user/pins/test-pin-1', `removeUserPin url: ${capturedUrl}`);
assert(capturedHeaders['X-User-Token'] === 'tok_abc', `removeUserPin X-User-Token header`);
assert(capturedBody === undefined, `removeUserPin should have no body`);
restoreFetch();

// 3. pushSharedPin
installMock();
await pushSharedPin('key_xyz', samplePin, ['sports', 'news']);
assert(capturedMethod === 'PUT', `pushSharedPin method: expected PUT, got ${capturedMethod}`);
assert(capturedUrl === 'https://timeline-api.rebble.io/v1/shared/pins/test-pin-1', `pushSharedPin url: ${capturedUrl}`);
assert(capturedHeaders['Content-Type'] === 'application/json', `pushSharedPin Content-Type header`);
assert(capturedHeaders['X-API-Key'] === 'key_xyz', `pushSharedPin X-API-Key header`);
assert(capturedHeaders['X-Pin-Topics'] === 'sports,news', `pushSharedPin X-Pin-Topics header`);
assert(capturedBody === JSON.stringify(samplePin), `pushSharedPin body`);
restoreFetch();

// 4. removeSharedPin
installMock();
await removeSharedPin('key_xyz', 'test-pin-1', ['sports', 'news']);
assert(capturedMethod === 'DELETE', `removeSharedPin method: expected DELETE, got ${capturedMethod}`);
assert(capturedUrl === 'https://timeline-api.rebble.io/v1/shared/pins/test-pin-1', `removeSharedPin url: ${capturedUrl}`);
assert(capturedHeaders['X-API-Key'] === 'key_xyz', `removeSharedPin X-API-Key header`);
assert(capturedHeaders['X-Pin-Topics'] === 'sports,news', `removeSharedPin X-Pin-Topics header`);
assert(capturedBody === undefined, `removeSharedPin should have no body`);
restoreFetch();

// 5. pushUserGlance
installMock();
const slices = [{ subtitle: 'Next game in 2h' }];
await pushUserGlance('tok_abc', slices);
assert(capturedMethod === 'PUT', `pushUserGlance method: expected PUT, got ${capturedMethod}`);
assert(capturedUrl === 'https://timeline-api.rebble.io/v1/user/glance', `pushUserGlance url: ${capturedUrl}`);
assert(capturedHeaders['Content-Type'] === 'application/json', `pushUserGlance Content-Type header`);
assert(capturedHeaders['X-User-Token'] === 'tok_abc', `pushUserGlance X-User-Token header`);
assert(capturedBody === JSON.stringify({ slices }), `pushUserGlance body`);
restoreFetch();

// 6. baseUrl override
installMock();
await pushUserPin('tok_abc', samplePin, { baseUrl: 'https://custom.example.com' });
assert(capturedUrl === 'https://custom.example.com/v1/user/pins/test-pin-1', `baseUrl override: ${capturedUrl}`);
restoreFetch();

// 7. Non-2xx throws TimelineApiError
installMock(403, 'Forbidden', 'invalid token');
let threw = false;
try {
  await pushUserPin('bad_token', samplePin);
} catch (err) {
  threw = true;
  assert(err instanceof TimelineApiError, `error should be TimelineApiError`);
  const e = err as TimelineApiError;
  assert(e.status === 403, `error status: expected 403, got ${e.status}`);
  assert(e.statusText === 'Forbidden', `error statusText: expected Forbidden, got ${e.statusText}`);
  assert(e.body === 'invalid token', `error body: expected 'invalid token', got '${e.body}'`);
}
assert(threw, `pushUserPin with 403 should throw`);
restoreFetch();

console.log('timeline-api.test.ts: PASS');
