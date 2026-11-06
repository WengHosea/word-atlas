import { registerPlugin } from "@capacitor/core";

/**
 * Native helper that unpacks the offline media pack.
 *
 * The pack is pushed to the phone as a single zip (`atlas.zip`) because
 * pushing 37k small files over USB/MTP takes hours. The app unpacks it into
 * its own external files directory on first launch.
 */
interface MediaPackPlugin {
  unpack(options?: { file?: string }): Promise<{ files: number; bytes: number; path: string }>;
  status(): Promise<{ present: boolean; path: string }>;
}

const MediaPack = registerPlugin<MediaPackPlugin>("MediaPack");

export const mediaPack = {
  async unpack(file = "atlas.zip") {
    return MediaPack.unpack({ file });
  },
  async status() {
    return MediaPack.status();
  },
};
