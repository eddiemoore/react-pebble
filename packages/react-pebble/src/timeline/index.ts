/**
 * Timeline Web API — server-side helpers for pushing pins and glances
 * via the Pebble / Rebble timeline REST API.
 *
 * These functions use `fetch()` and are intended for Node / Deno / edge
 * runtimes — they have no dependency on Preact or the watch-side runtime.
 */

export type {
  TimelinePin,
  TimelinePinLayout,
  TimelinePinLayoutType,
  TimelineColor,
  TimelinePinAction,
  TimelinePinActionHttp,
  TimelinePinActionOpenWatchApp,
  TimelinePinActionRemove,
  TimelinePinReminder,
  TimelinePinNotification,
} from '../hooks/useTimeline.js';

export type { AppGlanceSlice } from '../hooks/useAppGlance.js';

import type { TimelinePin } from '../hooks/useTimeline.js';
import type { AppGlanceSlice } from '../hooks/useAppGlance.js';

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class TimelineApiError extends Error {
  status: number;
  statusText: string;
  body: string;
  constructor(status: number, statusText: string, body: string) {
    super(`Timeline API ${status} ${statusText}: ${body}`);
    this.name = 'TimelineApiError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface TimelineOptions {
  baseUrl?: string;
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'https://timeline-api.rebble.io';

async function request(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<void> {
  const res = await fetch(url, {
    method,
    headers,
    ...(body !== undefined ? { body } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new TimelineApiError(res.status, res.statusText, text);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function pushUserPin(
  userToken: string,
  pin: TimelinePin,
  options?: TimelineOptions,
): Promise<void> {
  const base = options?.baseUrl ?? DEFAULT_BASE_URL;
  await request(
    'PUT',
    `${base}/v1/user/pins/${encodeURIComponent(pin.id)}`,
    { 'Content-Type': 'application/json', 'X-User-Token': userToken },
    JSON.stringify(pin),
  );
}

export async function removeUserPin(
  userToken: string,
  pinId: string,
  options?: TimelineOptions,
): Promise<void> {
  const base = options?.baseUrl ?? DEFAULT_BASE_URL;
  await request(
    'DELETE',
    `${base}/v1/user/pins/${encodeURIComponent(pinId)}`,
    { 'X-User-Token': userToken },
  );
}

export async function pushSharedPin(
  apiKey: string,
  pin: TimelinePin,
  topics: string[],
  options?: TimelineOptions,
): Promise<void> {
  const base = options?.baseUrl ?? DEFAULT_BASE_URL;
  await request(
    'PUT',
    `${base}/v1/shared/pins/${encodeURIComponent(pin.id)}`,
    {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'X-Pin-Topics': topics.join(','),
    },
    JSON.stringify(pin),
  );
}

export async function removeSharedPin(
  apiKey: string,
  pinId: string,
  topics: string[],
  options?: TimelineOptions,
): Promise<void> {
  const base = options?.baseUrl ?? DEFAULT_BASE_URL;
  await request(
    'DELETE',
    `${base}/v1/shared/pins/${encodeURIComponent(pinId)}`,
    {
      'X-API-Key': apiKey,
      'X-Pin-Topics': topics.join(','),
    },
  );
}

export async function pushUserGlance(
  userToken: string,
  slices: AppGlanceSlice[],
  options?: TimelineOptions,
): Promise<void> {
  const base = options?.baseUrl ?? DEFAULT_BASE_URL;
  await request(
    'PUT',
    `${base}/v1/user/glance`,
    { 'Content-Type': 'application/json', 'X-User-Token': userToken },
    JSON.stringify({ slices }),
  );
}
