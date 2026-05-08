/**
 * useSpeaker — audio playback via the Pebble speaker.
 *
 * Supports single tones, MIDI note sequences, polyphonic tracks (up to 4),
 * PCM streaming, volume control, and playback status.
 */

import { useCallback, useEffect, useState } from 'preact/hooks';

export type Waveform = 'sine' | 'square' | 'triangle' | 'sawtooth';
export type PCMFormat = '8khz-8bit' | '16khz-8bit' | '8khz-16bit' | '16khz-16bit';
export type SpeakerStatus = 'idle' | 'playing' | 'streaming';

export interface MidiNote {
  note: number;
  durationMs: number;
}

export interface SpeakerTrack {
  notes: MidiNote[];
  waveform?: Waveform;
  volume?: number;
}

export interface UseSpeakerResult {
  /** Play a single tone at the given frequency and waveform for up to 10 seconds. */
  playTone: (frequency: number, waveform: Waveform, durationMs: number) => void;
  /** Play a monophonic melody from an array of MIDI notes. */
  playNotes: (notes: MidiNote[]) => void;
  /** Mix up to 4 polyphonic tracks together. */
  playTracks: (tracks: SpeakerTrack[]) => void;
  /** Open a PCM audio stream. */
  streamOpen: (format: PCMFormat, volume?: number) => void;
  /** Push audio data into the PCM stream. */
  streamWrite: (data: ArrayBuffer | Uint8Array) => void;
  /** Close the PCM stream. */
  streamClose: () => void;
  /** Stop any active playback immediately. */
  stop: () => void;
  /** Set global volume (0–100). */
  setVolume: (volume: number) => void;
  /** Current playback status. */
  status: SpeakerStatus;
}

interface SpeakerGlobal {
  playTone?: (frequency: number, waveform: string, durationMs: number) => void;
  playNotes?: (notes: MidiNote[]) => void;
  playTracks?: (tracks: SpeakerTrack[], count: number) => void;
  streamOpen?: (format: string, volume: number) => void;
  streamWrite?: (data: ArrayBuffer | Uint8Array) => void;
  streamClose?: () => void;
  stop?: () => void;
  setVolume?: (volume: number) => void;
  getStatus?: () => string;
  setFinishCallback?: (cb: () => void) => void;
}

function getSpeaker(): SpeakerGlobal | undefined {
  if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).Speaker) {
    return (globalThis as Record<string, unknown>).Speaker as SpeakerGlobal;
  }
  return undefined;
}

/**
 * Audio playback via the Pebble speaker.
 *
 * On Alloy: uses the `Speaker` global.
 * In mock mode: no-op functions, status always `'idle'`.
 */
export function useSpeaker(): UseSpeakerResult {
  const [status, setStatus] = useState<SpeakerStatus>('idle');
  const speaker = getSpeaker();

  useEffect(() => {
    if (!speaker) return;
    speaker.setFinishCallback?.(() => setStatus('idle'));
    return () => {
      speaker.stop?.();
    };
  }, []);

  const playTone = useCallback(
    (frequency: number, waveform: Waveform, durationMs: number) => {
      if (!speaker) return;
      speaker.playTone?.(frequency, waveform, Math.min(durationMs, 10000));
      setStatus('playing');
    },
    [],
  );

  const playNotes = useCallback(
    (notes: MidiNote[]) => {
      if (!speaker) return;
      speaker.playNotes?.(notes);
      setStatus('playing');
    },
    [],
  );

  const playTracks = useCallback(
    (tracks: SpeakerTrack[]) => {
      if (!speaker) return;
      const clamped = tracks.slice(0, 4);
      speaker.playTracks?.(clamped, clamped.length);
      setStatus('playing');
    },
    [],
  );

  const streamOpen = useCallback(
    (format: PCMFormat, volume?: number) => {
      if (!speaker) return;
      speaker.streamOpen?.(format, Math.max(0, Math.min(100, volume ?? 100)));
      setStatus('streaming');
    },
    [],
  );

  const streamWrite = useCallback(
    (data: ArrayBuffer | Uint8Array) => {
      speaker?.streamWrite?.(data);
    },
    [],
  );

  const streamClose = useCallback(() => {
    if (!speaker) return;
    speaker.streamClose?.();
    setStatus('idle');
  }, []);

  const stop = useCallback(() => {
    if (!speaker) return;
    speaker.stop?.();
    setStatus('idle');
  }, []);

  const setVolume = useCallback(
    (volume: number) => {
      speaker?.setVolume?.(Math.max(0, Math.min(100, volume)));
    },
    [],
  );

  return {
    playTone,
    playNotes,
    playTracks,
    streamOpen,
    streamWrite,
    streamClose,
    stop,
    setVolume,
    status,
  };
}
