package com.haoxin.wordatlas;

import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Imports the offline media pack.
 *
 * The pack is shipped as a single zip because pushing 37k small files over
 * MTP is painfully slow. The app unpacks it into its own external files
 * directory, which is the only place it can write without extra permissions.
 */
@CapacitorPlugin(name = "MediaPack")
public class MediaPackPlugin extends Plugin {

    private final Handler main = new Handler(Looper.getMainLooper());

    /**
     * Unpack automatically on startup: the pack is pushed to the app's own
     * folder over MTP, so the user only has to open the app once.
     */
    @Override
    public void load() {
        main.post(() -> {
            try {
                File target = new File(getContext().getExternalFilesDir(null), "atlas");
                if (target.isDirectory() && new File(target, "index.json").exists()) {
                    notifyListeners("mediaPack", packInfo(true, 0, 0));
                    return;
                }
                File zip = new File(getContext().getExternalFilesDir(null), "atlas.zip");
                if (!zip.exists()) zip = new File(getContext().getFilesDir(), "atlas.zip");
                if (!zip.exists()) return;
                notifyListeners("mediaPack", packInfo(false, 0, 0));
                JSObject res = unpack(zip, target);
                notifyListeners("mediaPack", packInfo(true, res.getInt("files"), res.getLong("bytes")));
            } catch (Exception e) {
                notifyListeners("mediaPack", packInfo(false, 0, 0));
            }
        });
    }

    private JSObject packInfo(boolean ok, int files, long bytes) {
        JSObject out = new JSObject();
        out.put("ok", ok);
        out.put("files", files);
        out.put("bytes", bytes);
        out.put("path", new File(getContext().getExternalFilesDir(null), "atlas").getAbsolutePath());
        return out;
    }

    /**
     * Unpack `atlas.zip` from the app's files dir into `atlas/`.
     */
    @PluginMethod
    public void unpack(PluginCall call) {
        String name = call.getString("file", "atlas.zip");
        main.post(() -> {
            try {
                File filesDir = getContext().getFilesDir();
                File zip = new File(filesDir, name);
                if (!zip.exists()) {
                    // Fall back to the external files dir, which is where the
                    // pack is normally pushed to over MTP.
                    zip = new File(getContext().getExternalFilesDir(null), name);
                }
                if (!zip.exists()) {
                    call.reject("找不到压缩包 " + name);
                    return;
                }

                JSObject result = unpack(zip, new File(getContext().getExternalFilesDir(null), "atlas"));
                call.resolve(result);
            } catch (Exception e) {
                call.reject("解压失败: " + e.getMessage());
            }
        });
    }

    /**
     * Unpack a zip into a target directory, returning file/byte counts.
     *
     * The zip is usually produced from the `public/atlas` folder, so every
     * entry starts with `atlas/`. That prefix is stripped so the files land
     * directly in the target folder instead of `target/atlas/...`.
     */
    private JSObject unpack(File zip, File target) throws Exception {
        int files = 0;
        long bytes = 0;
        try (ZipFile zf = new ZipFile(zip)) {
            String prefix = detectPrefix(zf);
            java.util.Enumeration<? extends ZipEntry> entries = zf.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                String name = entry.getName();
                if (!prefix.isEmpty() && name.startsWith(prefix)) {
                    name = name.substring(prefix.length());
                }
                if (name.isEmpty()) {
                    continue;
                }
                File out = new File(target, name);
                // Guard against zip-slip: the entry name must stay under target.
                if (!out.getCanonicalPath().startsWith(target.getCanonicalPath() + File.separator)) {
                    continue;
                }
                if (entry.isDirectory()) {
                    out.mkdirs();
                    continue;
                }
                out.getParentFile().mkdirs();
                try (
                    InputStream in = zf.getInputStream(entry);
                    OutputStream os = new FileOutputStream(out)
                ) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        os.write(buf, 0, n);
                        bytes += n;
                    }
                }
                files++;
            }
        }
        JSObject out = new JSObject();
        out.put("files", files);
        out.put("bytes", bytes);
        out.put("path", target.getAbsolutePath());
        return out;
    }

    /** Return the shared top-level folder of the archive, e.g. "atlas/". */
    private String detectPrefix(ZipFile zf) {
        java.util.Enumeration<? extends ZipEntry> entries = zf.entries();
        String first = null;
        while (entries.hasMoreElements() && first == null) {
            ZipEntry e = entries.nextElement();
            if (e.isDirectory()) continue;
            first = e.getName();
            break;
        }
        if (first == null) return "";
        int slash = first.indexOf('/');
        if (slash <= 0) return "";
        String candidate = first.substring(0, slash + 1);
        // Only strip it when every entry shares it.
        entries = zf.entries();
        while (entries.hasMoreElements()) {
            ZipEntry e = entries.nextElement();
            if (e.isDirectory()) continue;
            if (!e.getName().startsWith(candidate)) return "";
        }
        return candidate;
    }

    /** Report whether a media pack is present in the app's files dir. */
    @PluginMethod
    public void status(PluginCall call) {
        File target = new File(getContext().getExternalFilesDir(null), "atlas");
        JSObject out = new JSObject();
        out.put("present", target.isDirectory() && new File(target, "index.json").exists());
        out.put("path", target.getAbsolutePath());
        call.resolve(out);
    }
}
