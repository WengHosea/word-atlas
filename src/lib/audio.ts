import { duck } from "./sound";

let current: HTMLAudioElement | null = null;
let token = 0;

export function stopAudio() {
  token++;
  current?.pause();
  current = null;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

/** Play a recording, falling back to the device voice. Resolves when playback ends. */
export async function play(url: string | null | undefined, text: string, accent: "uk" | "us" = "uk", rate = 1) {
  duck(true);
  try {
    return await speak(url, text, accent, rate);
  } finally {
    duck(false);
  }
}

/** How long to wait for a voice engine before giving up on it. */
const SPEECH_TIMEOUT = 8000;

async function speak(url: string | null | undefined, text: string, accent: "uk" | "us", rate: number) {
  stopAudio();
  const mine = ++token;
  if (url) {
    const a = new Audio(url);
    a.playbackRate = rate;
    current = a;
    try {
      await a.play();
      await new Promise<void>((r) => {
        a.onended = () => r();
        a.onpause = () => r();
        // A recording that dies mid-stream (a truncated file, a decoder
        // error) must not leave the caller waiting forever.
        a.onerror = () => r();
      });
      return "recorded" as const;
    } catch {
      if (mine !== token) return "stopped" as const;
      current = null;
    }
  }
  if (!("speechSynthesis" in window)) return "unsupported" as const;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = accent === "uk" ? "en-GB" : "en-US";
  u.rate = rate * 0.95;
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-") === u.lang);
  const best = voices.find((v) => /premium|enhanced|natural|google/i.test(v.name)) || voices[0];
  if (best) u.voice = best;
  await new Promise<void>((r) => {
    u.onend = () => r();
    u.onerror = () => r();
    // Android WebViews expose `speechSynthesis` but usually ship no voice
    // engine at all. In that case `speak()` neither fires `onend` nor
    // `onerror`, so the promise would never settle and the UI would wait
    // forever. The timeout turns that into a normal, silent return.
    const timer = window.setTimeout(() => r(), SPEECH_TIMEOUT);
    u.onend = () => {
      window.clearTimeout(timer);
      r();
    };
    u.onerror = () => {
      window.clearTimeout(timer);
      r();
    };
    speechSynthesis.speak(u);
  });
  return "device" as const;
}
