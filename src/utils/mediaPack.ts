import { registerPlugin } from "@capacitor/core";

/**
 * Native helper that unpacks the offline media pack.
 *
 * The pack is pushed to the phone as a single zip (`atlas.zip`) because
 * pushing 37k small files over USB/MTP takes hours. The app unpacks it into
 * its own external files directory on first launch.
 */
export interface MediaPackState {
  /** True when the pack was unpacked completely (marker file present). */
  ready: boolean;
  /** True when the target directory exists at all. */
  present: boolean;
  /** True when an `atlas.zip` archive was found somewhere. */
  packFound: boolean;
  packPath: string;
  packBytes: number;
  /** Absolute path of the unpacked media. */
  path: string;
  /** Absolute path of the on-device diagnostic log. */
  logPath: string;
  /** Files currently unpacked. */
  files: number;
  /** File entries in the archive (only while unpacking). */
  total?: number;
  bytes?: number;
  phase?: "unpacking" | "done";
  /** How many files had to be written in the last run. */
  written?: number;
}

interface MediaPackPlugin {
  unpack(options?: { file?: string }): Promise<MediaPackState>;
  status(): Promise<MediaPackState>;
  addListener(eventName: "mediaPack", listener: (state: MediaPackState) => void): Promise<{ remove: () => void }>;
}

const MediaPack = registerPlugin<MediaPackPlugin>("MediaPack");

export const mediaPack = {
  async unpack(file = "atlas.zip") {
    return MediaPack.unpack({ file });
  },
  async status() {
    return MediaPack.status();
  },
  /**
   * Subscribe to unpack progress. The native side emits `phase` while the
   * archive is being unpacked and `done` afterwards.
   */
  async onProgress(listener: (state: MediaPackState) => void) {
    return MediaPack.addListener("mediaPack", listener);
  },
};
