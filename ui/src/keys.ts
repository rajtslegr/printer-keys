// Everything the Keys tab decides, kept free of the DOM and the host so it can
// be tested on its own.
import type { Device } from '@prusa/connect-ui/domain';

export const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** One octave and a note, from C: A plays C, W plays C#, ... K plays the next C. */
export const COMPUTER_KEYS = 'awsedftgyhujk';

export const GCODE_VERB = 'core.command.send_gcode';

/** The states a printer may take a note in. Anything else, or no state, locks the keys. */
const PLAYABLE_STATES = new Set(['IDLE', 'READY', 'FINISHED', 'STOPPED']);

const clamp = (value: number, low: number, high: number): number =>
  Number.isFinite(value) ? Math.min(high, Math.max(low, Math.round(value))) : low;

/** Equal temperament, A4 = 440 Hz, rounded to the Hz the buzzer takes. */
export const freqOf = (midi: number): number => Math.round(440 * 2 ** ((midi - 69) / 12));

export const noteName = (midi: number): string =>
  `${NAMES[midi % 12] ?? ''}${String(Math.floor(midi / 12) - 1)}`;

/** The one command this extension sends. Pitch and length are clamped to what the buzzer plays. */
export const gcodeFor = (hz: number, ms: number): string =>
  `M300 S${String(clamp(hz, 50, 10000))} P${String(clamp(ms, 20, 2000))}`;

export const clampOctave = (octave: number): number => clamp(octave, 2, 7);

export const offsetOfKey = (key: string): number | undefined => {
  if (key.length !== 1) return undefined;
  const offset = COMPUTER_KEYS.indexOf(key.toLowerCase());
  return offset < 0 ? undefined : offset;
};

/** The note of a MIDI note-on, any channel. Velocity 0 is a note-off by convention. */
export const midiNoteOn = (data: ArrayLike<number>): number | undefined => {
  const [status = 0, note, velocity = 0] = Array.from(data);
  return (status & 0xf0) === 0x90 && velocity > 0 ? note : undefined;
};

/** Whether a key event belongs to a text field rather than to the keys. */
export const isTypingTarget = (target: unknown): boolean => {
  if (typeof target !== 'object' || target === null) return false;
  if ('isContentEditable' in target && target.isContentEditable === true) return true;
  return (
    'tagName' in target &&
    typeof target.tagName === 'string' &&
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
};

export type LockReason = 'absent' | 'offline' | 'unsupported' | 'busy';

/** Why this printer may not play now, or undefined when it may. */
export const lockReason = (
  device: Pick<Device, 'connected' | 'capabilities' | 'state'> | undefined,
): LockReason | undefined => {
  if (device === undefined) return 'absent';
  if (!device.connected) return 'offline';
  if (!device.capabilities?.includes(GCODE_VERB)) return 'unsupported';
  const state = device.state['/state'];
  return typeof state === 'string' && PLAYABLE_STATES.has(state) ? undefined : 'busy';
};

/**
 * Sends notes one at a time, in order. The buzzer plays one tone at once, so a
 * backlog past `limit` waiting notes is dropped rather than played late. `send`
 * reports its own errors; a rejection only moves the queue on.
 */
export class NoteQueue<T> {
  readonly #send: (note: T) => Promise<void>;
  readonly #limit: number;
  #waiting: T[] = [];
  #busy = false;

  constructor(send: (note: T) => Promise<void>, limit = 4) {
    this.#send = send;
    this.#limit = limit;
  }

  /** Queues a note. False when it was dropped. */
  push(note: T): boolean {
    if (this.#busy && this.#waiting.length >= this.#limit) return false;
    this.#waiting.push(note);
    void this.#pump();
    return true;
  }

  /** Drops every waiting note. The one being sent finishes. */
  clear(): void {
    this.#waiting = [];
  }

  async #pump(): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    for (let note = this.#waiting.shift(); note !== undefined; note = this.#waiting.shift()) {
      await this.#send(note).catch(() => undefined);
    }
    this.#busy = false;
  }
}
