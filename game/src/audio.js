// Sound: a tiny WebAudio synth, no files. Footsteps tick, loot chimes, a lure clinks,
// the alarm beeps while the meter runs hot, being caught stings, and a clean getaway
// plays a short jingle. Everything is created lazily on the first user gesture, so the
// page never needs an autoplay permission it does not have.

export function createAudio() {
  let context = null;
  let alarmTimer = null;
  let muted = false;

  function ensure() {
    if (context === null) {
      try {
        const AudioContext = window.AudioContext ?? window.webkitAudioContext;
        context = new AudioContext();
      } catch {
        context = null;
      }
    }
    if (context !== null && context.state === 'suspended') void context.resume();
    return context;
  }

  function tone(frequency, duration, type, volume, when = 0, slideTo = null) {
    const ctx = ensure();
    if (ctx === null || muted) return;
    const start = ctx.currentTime + when;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (slideTo !== null) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  function noise(duration, volume, when = 0) {
    const ctx = ensure();
    if (ctx === null || muted) return;
    const start = ctx.currentTime + when;
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(gain).connect(ctx.destination);
    source.start(start);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    step() {
      tone(180, 0.05, 'triangle', 0.03);
    },
    loot() {
      tone(880, 0.12, 'sine', 0.12);
      tone(1318, 0.18, 'sine', 0.1, 0.07);
    },
    star() {
      tone(523, 0.15, 'sine', 0.14);
      tone(659, 0.15, 'sine', 0.14, 0.1);
      tone(784, 0.2, 'sine', 0.14, 0.2);
      tone(1046, 0.35, 'sine', 0.16, 0.3);
    },
    lure() {
      tone(2400, 0.06, 'square', 0.05);
      tone(1900, 0.08, 'square', 0.05, 0.09);
    },
    smoke() {
      noise(0.4, 0.12);
    },
    emp() {
      tone(120, 0.5, 'sawtooth', 0.12, 0, 1400);
      noise(0.25, 0.1, 0.05);
    },
    suspicious() {
      tone(330, 0.15, 'square', 0.07);
      tone(330, 0.15, 'square', 0.07, 0.2);
    },
    chase() {
      tone(220, 0.2, 'sawtooth', 0.1, 0, 440);
    },
    caught() {
      tone(196, 0.4, 'sawtooth', 0.16, 0, 65);
      tone(98, 0.6, 'square', 0.12, 0.1, 49);
    },
    win() {
      const notes = [523, 659, 784, 1046, 1318];
      notes.forEach((note, i) => tone(note, 0.25, 'triangle', 0.14, i * 0.12));
    },
    over() {
      const notes = [392, 330, 262, 196];
      notes.forEach((note, i) => tone(note, 0.3, 'triangle', 0.12, i * 0.18));
    },
    /** Start the alarm beep loop while the meter runs hot; stop it when it cools. */
    setAlarmHot(hot) {
      if (hot && alarmTimer === null) {
        alarmTimer = window.setInterval(() => tone(980, 0.09, 'square', 0.045), 450);
      } else if (!hot && alarmTimer !== null) {
        window.clearInterval(alarmTimer);
        alarmTimer = null;
      }
    },
  };
}
