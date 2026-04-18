/**
 * useDictation — voice-to-text input.
 */

import { useCallback } from 'preact/hooks';
import { useState } from './internal/use-state.js';

export type DictationStatus = 'idle' | 'listening' | 'transcribing' | 'done'
  | 'error' | 'cancelled' | 'rejected' | 'systemAborted' | 'unsupported';

export interface UseDictationResult {
  text: string | null;
  status: DictationStatus;
  start: () => void;
  error: string | null;
  errorReason: string | null;
}

/**
 * Voice-to-text dictation.
 *
 * On Alloy: uses the `Dictation` global if available.
 * In mock mode: returns `status: 'unsupported'`.
 */
export function useDictation(): UseDictationResult {
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState<DictationStatus>(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Dictation) {
      return 'idle';
    }
    return 'unsupported';
  });
  const [error, setError] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);

  const start = useCallback(() => {
    if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Dictation) {
      const dict = (globalThis as Record<string, unknown>).Dictation as {
        start?: (cb: (result: string | null, st: string) => void) => void;
      };
      setStatus('listening');
      setError(null);
      setErrorReason(null);
      dict.start?.((result, st) => {
        if (result) {
          setText(result);
          setStatus('done');
          setErrorReason(null);
        } else {
          const raw = st || 'Dictation failed';
          const lower = raw.toLowerCase();
          let granularStatus: DictationStatus;
          if (lower.includes('cancel')) {
            granularStatus = 'cancelled';
          } else if (lower.includes('reject')) {
            granularStatus = 'rejected';
          } else if (lower.includes('abort')) {
            granularStatus = 'systemAborted';
          } else {
            granularStatus = 'error';
          }
          setError(raw);
          setErrorReason(raw);
          setStatus(granularStatus);
        }
      });
    }
  }, []);

  return { text, status, start, error, errorReason };
}
