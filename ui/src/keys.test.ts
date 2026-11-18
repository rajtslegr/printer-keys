import { describe, expect, it } from 'vitest';

import {
  clampOctave,
  freqOf,
  gcodeFor,
  isTypingTarget,
  lockReason,
  midiNoteOn,
  NoteQueue,
  noteName,
  offsetOfKey,
  refusal,
} from './keys';

describe('pitch', () => {
  it('tunes A4 to 440 Hz and rounds the rest', () => {
    expect(freqOf(69)).toBe(440);
    expect(freqOf(60)).toBe(262);
    expect(freqOf(72)).toBe(523);
  });

  it('names notes with their octave', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(70)).toBe('A#4');
  });
});

describe('gcodeFor', () => {
  it('rounds the pitch', () => {
    expect(gcodeFor(440.6, 200)).toBe('M300 S441 P200');
  });

  it('clamps pitch to 50-10000 Hz and length to 20-2000 ms', () => {
    expect(gcodeFor(1, 1)).toBe('M300 S50 P20');
    expect(gcodeFor(99999, 99999)).toBe('M300 S10000 P2000');
  });

  it('never sends a non-number', () => {
    expect(gcodeFor(Number.NaN, Number.NaN)).toBe('M300 S50 P20');
  });
});

describe('keys', () => {
  it('keeps the octave within 2-7', () => {
    expect(clampOctave(1)).toBe(2);
    expect(clampOctave(9)).toBe(7);
    expect(clampOctave(4)).toBe(4);
  });

  it('maps the computer keys to semitone offsets', () => {
    expect(offsetOfKey('a')).toBe(0);
    expect(offsetOfKey('w')).toBe(1);
    expect(offsetOfKey('K')).toBe(12);
    expect(offsetOfKey('q')).toBeUndefined();
    expect(offsetOfKey('Shift')).toBeUndefined();
  });

  it('reads note-on on any channel and ignores velocity 0 and note-off', () => {
    expect(midiNoteOn([0x90, 60, 100])).toBe(60);
    expect(midiNoteOn([0x93, 61, 1])).toBe(61);
    expect(midiNoteOn([0x90, 60, 0])).toBeUndefined();
    expect(midiNoteOn([0x80, 60, 64])).toBeUndefined();
    expect(midiNoteOn([0xf8])).toBeUndefined();
  });

  it('treats form fields and editable text as typing', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it('leaves the keys on in a slider, checkbox or button input', () => {
    expect(isTypingTarget({ tagName: 'INPUT', type: 'range' })).toBe(false);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'button' })).toBe(false);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'search' })).toBe(true);
  });
});

describe('lockReason', () => {
  const idle = {
    connected: true,
    capabilities: ['core.command.send_gcode'],
    state: { '/state': 'IDLE' },
  };

  it('plays on an idle or finished printer that takes G-code', () => {
    expect(lockReason(idle)).toBeUndefined();
    expect(lockReason({ ...idle, state: { '/state': 'FINISHED' } })).toBeUndefined();
  });

  it('locks a printer that is not there, offline or without G-code', () => {
    expect(lockReason(undefined)).toBe('absent');
    expect(lockReason({ ...idle, connected: false })).toBe('offline');
    expect(lockReason({ ...idle, capabilities: ['core.command.pause'] })).toBe('unsupported');
    expect(lockReason({ ...idle, capabilities: null })).toBe('unsupported');
  });

  it('locks a printer that is printing, paused, busy or has no state', () => {
    for (const state of ['PRINTING', 'PAUSED', 'BUSY', 'ATTENTION', 'ERROR']) {
      expect(lockReason({ ...idle, state: { '/state': state } })).toBe('busy');
    }
    expect(lockReason({ ...idle, state: {} })).toBe('busy');
  });
});

describe('refusal', () => {
  it('is nothing when the printer ran the command', () => {
    expect(refusal({ ok: true })).toBeUndefined();
  });

  it("gives the printer's reason, else its fault code", () => {
    expect(refusal({ ok: false, fault_code: 'BUSY', machine_reason: 'Printer is busy' })).toBe(
      'Printer is busy',
    );
    expect(refusal({ ok: false, fault_code: 'core.printer/REFUSED' })).toBe('core.printer/REFUSED');
    expect(refusal({ ok: false, machine_reason: '' })).toBe('refused');
  });
});

describe('NoteQueue', () => {
  const deferredSender = () => {
    const sent: number[] = [];
    const pending: (() => void)[] = [];
    const send = (note: number) => {
      sent.push(note);
      return new Promise<void>((resolve) => pending.push(resolve));
    };
    const finishNext = async () => {
      pending.shift()?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    return { sent, send, finishNext };
  };

  it('sends one note at a time, in order, and drops past four waiting', async () => {
    const { sent, send, finishNext } = deferredSender();
    const queue = new NoteQueue(send);

    expect([1, 2, 3, 4, 5, 6].map((note) => queue.push(note))).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(sent).toEqual([1]);

    for (let i = 0; i < 5; i++) await finishNext();
    expect(sent).toEqual([1, 2, 3, 4, 5]);
  });

  it('sends nothing more after clear', async () => {
    const { sent, send, finishNext } = deferredSender();
    const queue = new NoteQueue(send);
    queue.push(1);
    queue.push(2);
    queue.push(3);

    queue.clear();
    await finishNext();

    expect(sent).toEqual([1]);
  });

  it('keeps going after a send fails', async () => {
    const sent: number[] = [];
    const queue = new NoteQueue((note: number) => {
      sent.push(note);
      return note === 1 ? Promise.reject(new Error('refused')) : Promise.resolve();
    });
    queue.push(1);
    queue.push(2);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sent).toEqual([1, 2]);
  });
});
