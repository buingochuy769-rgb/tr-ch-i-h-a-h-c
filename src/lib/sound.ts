let ctx: AudioContext | null = null;
let muted = false;
try {
  muted = localStorage.getItem('muted') === '1';
} catch {
  /* bỏ qua */
}

export const isMuted = () => muted;
export function setMuted(v: boolean) {
  muted = v;
  try {
    localStorage.setItem('muted', v ? '1' : '0');
  } catch {
    /* bỏ qua */
  }
}

type Kind = 'phase' | 'ok' | 'bad' | 'tick' | 'join';
const TONES: Record<Kind, [number, number][]> = {
  phase: [[523, 0.12], [784, 0.2]],
  ok: [[660, 0.1], [880, 0.18]],
  bad: [[220, 0.25]],
  tick: [[1000, 0.04]],
  join: [[440, 0.08]],
};

export function play(kind: Kind) {
  if (muted) return;
  try {
    ctx = ctx ?? new AudioContext();
    let t = ctx.currentTime;
    for (const [freq, dur] of TONES[kind]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      o.type = 'sine';
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + dur);
      t += dur;
    }
  } catch {
    /* trình duyệt chặn âm thanh: bỏ qua */
  }
}
