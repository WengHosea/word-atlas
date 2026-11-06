import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { isNative } from "./assetResolver";

const BACKUP_FILE = "progress-backup.json";

/** Where the silent backup copy lives on the phone. */
export const BACKUP_PATH = `/storage/emulated/0/Android/data/com.haoxin.wordatlas/files/${BACKUP_FILE}`;

/**
 * Write a copy of the progress to the app sandbox. This is the second safety
 * net: if the WebView storage is cleared, the backup file can still be
 * restored from the settings page.
 */
export async function writeProgressBackup(json: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await Filesystem.writeFile({
      path: BACKUP_FILE,
      directory: Directory.External,
      data: json,
      encoding: Encoding.UTF8,
    });
    return true;
  } catch {
    return false;
  }
}

/** Read the sandbox backup back. Returns null when there is none. */
export async function readProgressBackup(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const res = await Filesystem.readFile({
      path: BACKUP_FILE,
      directory: Directory.External,
      encoding: Encoding.UTF8,
    });
    return typeof res.data === "string" ? res.data : null;
  } catch {
    return null;
  }
}

