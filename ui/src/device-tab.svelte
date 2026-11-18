<script lang="ts">
  import { onDestroy } from 'svelte';

  import { heldHost } from './host';
  import {
    clampOctave,
    COMPUTER_KEYS,
    freqOf,
    gcodeFor,
    GCODE_VERB,
    isTypingTarget,
    lockReason,
    midiNoteOn,
    NAMES,
    NoteQueue,
    noteName,
    offsetOfKey,
    refusal,
  } from './keys';

  interface Props {
    deviceId: string;
  }

  let { deviceId }: Props = $props();

  const host = heldHost();
  const t = host.t;

  const WHITE_PX = 44;
  const BLACK_PX = 28;

  const device = $derived(host.fleet.device(deviceId));
  const lock = $derived(lockReason(device));

  let ms = $state(200);
  let octave = $state(4);
  let last = $state('');
  let lit = $state<number[]>([]);
  let midi = $state<{ key: string; names?: string }>({ key: 'none' });

  interface Note {
    deviceId: string;
    midi: number;
    ms: number;
  }

  const send = async (note: Note): Promise<void> => {
    // A waiting note is dropped if the tab moved to another printer, or this
    // one locked, since it was played.
    if (note.deviceId !== deviceId || lock !== undefined) return;
    const hz = freqOf(note.midi);
    const name = noteName(note.midi);
    try {
      const result = await host.client.sendDeviceCommand(
        {
          path: { device_id: note.deviceId },
          body: { verb: GCODE_VERB, args: { gcode: gcodeFor(hz, note.ms) } },
        },
        host.signal,
      );
      const reason = refusal(result);
      last =
        reason === undefined
          ? t('printer-keys.deviceTab.last', { note: name, hz, ms: note.ms })
          : t('printer-keys.deviceTab.failed', { note: name, reason });
    } catch (err) {
      if (host.signal.aborted) return;
      const reason = err instanceof Error ? err.message : String(err);
      last = t('printer-keys.deviceTab.failed', { note: name, reason });
    }
  };

  const queue = new NoteQueue(send);

  // Leaving the tab plays none of the notes still waiting.
  onDestroy(() => {
    queue.clear();
  });

  const flash = (note: number, length: number) => {
    lit = [...lit, note];
    setTimeout(() => {
      lit = lit.filter((n) => n !== note);
    }, length);
  };

  const hit = (note: number) => {
    if (lock !== undefined) return;
    const length = ms;
    if (queue.push({ deviceId, midi: note, ms: length })) flash(note, length);
  };

  const base = $derived((octave + 1) * 12);

  // Two octaves and the C above them, laid out as a piano: white keys in a row,
  // black keys over the gaps.
  const keys = $derived.by(() => {
    let whites = 0;
    return Array.from({ length: 25 }, (_, offset) => {
      const note = base + offset;
      const black = (NAMES[note % 12] ?? '').includes('#');
      const left = black ? whites * WHITE_PX - BLACK_PX / 2 : 0;
      if (!black) whites += 1;
      const label =
        offset < COMPUTER_KEYS.length ? (COMPUTER_KEYS[offset] ?? '').toUpperCase() : '';
      return { note, black, left, label, name: noteName(note) };
    });
  });

  $effect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        octave = clampOctave(octave - 1);
        return;
      }
      if (key === 'x') {
        octave = clampOctave(octave + 1);
        return;
      }
      const offset = offsetOfKey(key);
      if (offset !== undefined) hit(base + offset);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  });

  // Web MIDI exists only on a secure page (HTTPS or localhost).
  $effect(() => {
    if (!window.isSecureContext) {
      midi = { key: 'insecure' };
      return;
    }
    if (!('requestMIDIAccess' in navigator)) {
      midi = { key: 'unsupported' };
      return;
    }
    let access: MIDIAccess | undefined;
    let stopped = false;
    const bind = () => {
      if (access === undefined) return;
      const inputs = [...access.inputs.values()];
      midi =
        inputs.length === 0
          ? { key: 'none' }
          : { key: 'devices', names: inputs.map((i) => i.name ?? '?').join(', ') };
      for (const input of inputs) {
        input.onmidimessage = (event) => {
          const note = event.data ? midiNoteOn(event.data) : undefined;
          if (note !== undefined) hit(note);
        };
      }
    };
    navigator.requestMIDIAccess().then(
      (granted) => {
        if (stopped) return;
        access = granted;
        access.onstatechange = bind;
        bind();
      },
      () => {
        if (!stopped) midi = { key: 'refused' };
      },
    );
    return () => {
      stopped = true;
      if (access === undefined) return;
      access.onstatechange = null;
      for (const input of access.inputs.values()) input.onmidimessage = null;
    };
  });
</script>

<div class="flex flex-col gap-4">
  <p class="text-sm text-muted-foreground">{t('printer-keys.deviceTab.intro')}</p>

  <div class="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
    <label class="flex items-center gap-2">
      {t('printer-keys.deviceTab.length')}
      <input type="range" min="50" max="800" step="10" bind:value={ms} />
      <span class="tabular-nums">{t('printer-keys.deviceTab.lengthValue', { ms })}</span>
    </label>
    <span class="flex items-center gap-2">
      {t('printer-keys.deviceTab.octave')}
      <button
        type="button"
        class="rounded-md border border-border px-2"
        aria-label={t('printer-keys.deviceTab.octaveDown')}
        onclick={() => (octave = clampOctave(octave - 1))}>−</button
      >
      <span class="tabular-nums">{octave}</span>
      <button
        type="button"
        class="rounded-md border border-border px-2"
        aria-label={t('printer-keys.deviceTab.octaveUp')}
        onclick={() => (octave = clampOctave(octave + 1))}>+</button
      >
    </span>
    <span class="text-muted-foreground">
      {t(`printer-keys.deviceTab.midi.${midi.key}`, { names: midi.names ?? '' })}
    </span>
  </div>

  {#if lock !== undefined}
    <p class="text-sm font-medium">{t(`printer-keys.deviceTab.lock.${lock}`)}</p>
  {/if}

  <div class="overflow-x-auto pb-2">
    <div
      class="relative flex h-44 select-none"
      role="group"
      aria-label={t('printer-keys.deviceTab.keyboard')}
    >
      {#each keys as key (key.note)}
        <button
          type="button"
          disabled={lock !== undefined}
          aria-label={key.name}
          class={[
            'flex items-end justify-center rounded-b-md pb-2 text-xs disabled:opacity-50',
            key.black
              ? 'absolute z-10 h-28 w-7 border border-black bg-black text-white/70'
              : 'h-44 w-11 shrink-0 border border-border bg-white text-black/60',
            lit.includes(key.note) && 'bg-primary! text-primary-foreground!',
          ]}
          style:left={key.black ? `${String(key.left)}px` : undefined}
          onpointerdown={() => {
            hit(key.note);
          }}
          onkeydown={(event) => {
            // Enter or Space on a focused key, once per press like a pointer.
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            if (!event.repeat) hit(key.note);
          }}>{key.label}</button
        >
      {/each}
    </div>
  </div>

  <p class="min-h-5 font-mono text-xs text-muted-foreground">{last}</p>
</div>
