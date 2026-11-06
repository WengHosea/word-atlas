import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Preferences } from "@capacitor/preferences";
import { toast } from "../ui/Toast";

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

export const getMediaRoot = (): MediaRoot => mediaRoot;

const rootInfo = (root: MediaRoot): MediaRootInfo => MEDIA_ROOTS.find((r) => r.id === root) ?? MEDIA_ROOTS[0];

/** Absolute path of the current media pack. */
export const mediaRootPath = (): string => rootInfo(mediaRoot).path;

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
  const info = rootInfo(mediaRoot);
  try {
    const res = await Filesystem.stat({
      path: info.relative,
      directory: mediaRoot === "app" ? Directory.External : Directory.ExternalStorage,
    });
    return res.type === "directory";
  } catch {
    return false;
  }
}

export const MISSING_PACK_MESSAGE = `未检测到离线媒体包，请将 atlas 媒体目录放入 ${MEDIA_ROOTS[0].path}/`;

let warned = false;

/** Show the missing-pack hint once per app run, without blocking the UI. */
export async function warnIfMediaMissing(): Promise<void> {
  if (warned || !isNative()) return;
  if (await hasMediaPack()) return;
  warned = true;
  toast(MISSING_PACK_MESSAGE, "warn");
}

