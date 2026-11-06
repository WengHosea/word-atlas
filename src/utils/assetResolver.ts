import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { toast } from "../ui/Toast";
import { mediaPack } from "./mediaPack";

/**
 * Where the offline media pack lives on the phone.
 *
 * - `app`      → /storage/emulated/0/Android/data/com.haoxin.wordatlas/files/atlas
 * - `download` → /storage/emulated/0/Download/word-atlas/atlas
 */
export type MediaRoot = "app" | "download";

export interface MediaRootInfo {
  id: MediaRoot;
  label: string;
  /** Absolute path on the device. */
  path: string;
  /** Path relative to the app-private external files dir, for the filesystem plugin. */
  relative: string;
}

export const MEDIA_ROOTS: MediaRootInfo[] = [
  {
    id: "app",
    label: "应用私有目录（推荐）",
    path: "/storage/emulated/0/Android/data/com.haoxin.wordatlas/files/atlas",
    relative: "atlas",
  },
  {
    id: "download",
    label: "Download/word-atlas",
    path: "/storage/emulated/0/Download/word-atlas/atlas",
    relative: "word-atlas/atlas",
  },
];

const ROOT_KEY = "word-atlas:media-root";

/** Data files that stay inside the APK so the app boots instantly. */
const DATA_PREFIXES = ["index.json", "entries/"];

export const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/** Mobile layout: narrow viewport or a native shell. */
export const isMobile = (): boolean => isNative() || (typeof window !== "undefined" && window.innerWidth < 768);

let mediaRoot: MediaRoot = "app";

/**
 * The real location of the unpacked media on the device.
 *
 * The native plugin reports the absolute path it unpacked into, which is
 * the only trustworthy answer: the app-private folder and the shared
 * Download folder are both valid places for the media to live.
 */
let nativePath = MEDIA_ROOTS[0].path;

/** Remember where the native plugin actually put the media. */
export const setNativeMediaPath = (path: string): void => {
  if (path) nativePath = path;
};

export const getMediaRoot = (): MediaRoot => mediaRoot;

const rootInfo = (root: MediaRoot): MediaRootInfo => MEDIA_ROOTS.find((r) => r.id === root) ?? MEDIA_ROOTS[0];

/** Absolute path of the current media pack. */
export const mediaRootPath = (): string => (isNative() ? nativePath : rootInfo(mediaRoot).path);

/** Load the saved media-pack location. */
export async function initAssetResolver(): Promise<void> {
  if (!isNative()) return;
  try {
    const { value } = await Preferences.get({ key: ROOT_KEY });
    if (value === "app" || value === "download") mediaRoot = value;
  } catch {
    /* keep the default */
  }
}

/** Switch the media pack location. */
export async function setMediaRoot(root: MediaRoot): Promise<void> {
  mediaRoot = root;
  try {
    await Preferences.set({ key: ROOT_KEY, value: root });
  } catch {
    /* the preference is a convenience, not a requirement */
  }
}

/** True when the path refers to data that lives inside the APK. */
export const isBundledData = (path: string): boolean => DATA_PREFIXES.some((p) => path.startsWith(p));

/** True when the path refers to media that must be pushed to the phone. */
export const isExternalMedia = (path: string): boolean =>
  path.startsWith("img/") || path.startsWith("thumb/") || path.startsWith("audio/");

/**
 * Resolve an atlas-relative path to a URL the WebView can load.
 *
 * Bundled data (`index.json`, `entries/*.json`) always comes from the APK.
 * Media (`img`, `thumb`, `audio`) comes from the external media pack on
 * native builds, and from the web root everywhere else.
 */
export function getAssetUrl(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  if (!isNative() || !isExternalMedia(path)) return `${base}/atlas/${path}`;
  return Capacitor.convertFileSrc(`file://${mediaRootPath()}/${path}`);
}

/** True when the media pack folder exists on the phone. */
export async function hasMediaPack(): Promise<boolean> {
  if (!isNative()) return true;
  try {
    // The native plugin knows whether the pack was unpacked completely.
    // Looking for the directory alone is not enough: a half-finished
    // extraction also creates the directory, and it would look fine.
    const s = await mediaPack.status();
    if (s.path) setNativeMediaPath(s.path);
    return s.ready;
  } catch {
    return false;
  }
}

export const MISSING_PACK_MESSAGE =
  "未检测到完整的离线媒体包。请把 atlas.zip 放到手机 Download/word-atlas/ 或应用私有目录，然后在「我的 → 离线媒体包」里重新解压。";

let warned = false;

/** Show the missing-pack hint once per app run, without blocking the UI. */
export async function warnIfMediaMissing(): Promise<void> {
  if (warned || !isNative()) return;
  if (await hasMediaPack()) return;
  warned = true;
  toast(MISSING_PACK_MESSAGE, "warn");
}

