import { useSyncExternalStore } from "react";
import { mediaPack, type MediaPackState } from "./mediaPack";

/**
 * Startup handling of the offline media pack.
 *
 * The native plugin unpacks `atlas.zip` on its own, but the extraction of
 * ~37k files takes minutes and can be interrupted. The app therefore keeps
 * asking for the state and, when the pack is incomplete, resumes the
 * extraction until it is complete. Only then does the UI show the media.
 */

export type PackPhase = "idle" | "checking" | "unpacking" | "ready" | "missing" | "error";

export interface PackProgress {
  phase: PackPhase;
  /** Files written so far. */
  files: number;
  /** Files in the archive. */
  total: number;
  bytes: number;
  message: string;
  /** True when the installed APK ships with the media pack inside it. */
  bundled?: boolean;
}

let state: PackProgress = { phase: "idle", files: 0, total: 0, bytes: 0, message: "", bundled: false };
const subs = new Set<() => void>();
const set = (patch: Partial<PackProgress>) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};

export const usePackProgress = (): PackProgress =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
  );

const MB = (bytes: number) => `${Math.round(bytes / 1048576)} MB`;

/**
 * Make sure the media pack is fully unpacked, resuming whenever needed.
 *
 * Safe to call more than once; the native side skips files that are already
 * on disk, so a resumed run is cheap.
 */
export async function ensureMediaPack(): Promise<MediaPackState | null> {
  set({ phase: "checking", message: "正在检查离线媒体包…" });
  try {
    const s = await mediaPack.status();
    if (s.ready) {
      set({ phase: "ready", files: s.files, total: s.files, bytes: 0, message: "", bundled: s.bundled });
      return s;
    }
    if (!s.packFound && !s.bundled) {
      set({
        phase: s.bundled ? "idle" : "missing",
        files: 0,
        total: 0,
        bytes: 0,
        bundled: s.bundled,
        message: s.bundled ? "" : "没有找到 atlas.zip 媒体包",
      });
      return s;
    }
    set({
      phase: "unpacking",
      files: 0,
      total: 0,
      bytes: 0,
      bundled: s.bundled,
      message: "正在解压媒体包，请勿退出应用…",
    });
    await runUnpack();
    return await mediaPack.status();
  } catch (e) {
    set({ phase: "error", message: String(e instanceof Error ? e.message : e) });
    return null;
  }
}

/**
 * Unpack the archive and follow the progress events.
 *
 * The native side resumes an interrupted extraction, so this can also be
 * used to repair a half-finished pack.
 */
export async function runUnpack(): Promise<void> {
  const listener = await mediaPack.onProgress((s) => {
    if (s.phase === "done") {
      set({ phase: "ready", files: s.files, total: s.files, bytes: s.bytes ?? 0, message: "" });
    } else if (s.phase === "unpacking") {
      set({
        phase: "unpacking",
        files: s.files,
        total: s.total ?? 0,
        bytes: s.bytes ?? 0,
        message: `正在解压媒体包 ${s.files.toLocaleString()}/${(s.total ?? 0).toLocaleString()}（${MB(s.bytes ?? 0)}）`,
      });
    }
  });
  try {
    await mediaPack.unpack();
  } finally {
    await listener.remove();
  }
}
