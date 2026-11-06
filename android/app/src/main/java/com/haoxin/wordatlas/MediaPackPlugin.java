package com.haoxin.wordatlas;

import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Build;
import android.os.StatFs;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Imports the offline media pack.
 *
 * The pack is shipped as a single zip because pushing 37k small files over
 * MTP is painfully slow. The app unpacks it into its own external files
 * directory, which is the only place it can write without extra permissions.
 *
 * Two hard-won rules are baked in here:
 *
 - "Is the pack ready?" must never be answered by looking for `index.json`.
   That file is the *second* entry of the archive, so it lands on disk long
   before the 37k media files do. An interrupted extraction would look
   "complete" forever and the app would never repair itself.
   {@link AtlasExtractor#isReady(File)} uses a marker file instead.
 - Every step is appended to a log file inside the app's own external files
   directory, because a phone that cannot be reached by adb can still be
   inspected over MTP. `files/diag.log` is the only window into what the app
   is doing on the device.
 */
@CapacitorPlugin(name = "MediaPack")
public class MediaPackPlugin extends Plugin {

    /** Listeners must be notified on the main thread. */
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    /** Name of the media pack archive, without any directory part. */
    static final String PACK_NAME = "atlas.zip";

    /** Where the unpacked media lives. */
    static final String TARGET_NAME = "atlas";

    /** Name of the diagnostic log inside the app's external files dir. */
    static final String LOG_NAME = "diag.log";

    /** Name of the file that records which build is running on the device. */
    static final String STAMP_NAME = "version.txt";

    /**
     * Candidate locations for the media pack archive, most persistent first.
     *
     * The app-private folder is wiped whenever the app is reinstalled with a
     * different signature (the debug signature is now pinned, so this should
     * not happen anymore), so the shared Download folder is also checked.
     */
    private File[] packCandidates() {
        // "Download" is spelled out instead of using Environment.DIRECTORY_DOWNLOAD,
        // which is not visible in the android-36 stub jar.
        File download = Environment.getExternalStoragePublicDirectory("Download");
        return new File[] {
            // The app's own external files dir needs no permission at all, so
            // it stays the primary location.
            new File(getContext().getExternalFilesDir(null), PACK_NAME),
            // Fallbacks live in the shared Download folder and need the
            // all-files-access permission on Android 11+.
            new File(download, "word-atlas/" + PACK_NAME),
            new File(download, PACK_NAME),
            new File(getContext().getFilesDir(), PACK_NAME),
        };
    }

    /** The directory the media is unpacked into. */
    private File targetDir() {
        File dir = getContext().getExternalFilesDir(null);
        if (dir == null) dir = getContext().getFilesDir();
        return new File(dir, TARGET_NAME);
    }

    /** The directory the diagnostic log is written to. */
    private File logDir() {
        File dir = getContext().getExternalFilesDir(null);
        if (dir == null) dir = getContext().getFilesDir();
        return dir;
    }

    /** First existing pack archive, or null when none was pushed. */
    private File findPack() {
        for (File f : packCandidates()) {
            if (f.exists() && f.length() > 0) return f;
        }
        return null;
    }

    // ---------------------------------------------------------------- log ---

    /**
     * Write a stamp file that tells us exactly which build is running.
     *
     * The app cannot be reached by adb on the author's phone, so this file
     * is the only reliable way to tell "the new APK is installed" from "the
     * new APK is installed *and running*".
     */
    private void writeStamp() {
        try {
            File out = new File(logDir(), STAMP_NAME);
            String text = "sdk=" + Build.VERSION.SDK_INT + "\n"
                + "versionName=" + appVersionName() + "\n"
                + "stampWrittenAt=" + System.currentTimeMillis() + "\n";
            try (OutputStream os = new FileOutputStream(out, false)) {
                os.write(text.getBytes("UTF-8"));
            }
        } catch (Exception ignored) {
            /* the stamp is a convenience, never a hard requirement */
        }
    }

    /** The app's versionName, read from the package manager. */
    private String appVersionName() {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(
                getContext().getPackageName(), 0);
            return info.versionName == null ? "?" : info.versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "?";
        }
    }

    /** Free bytes on the volume that holds the app's external files dir. */
    private long freeBytes() {
        try {
            File dir = getContext().getExternalFilesDir(null);
            if (dir == null) return -1L;
            StatFs fs = new StatFs(dir.getAbsolutePath());
            return fs.getAvailableBytes();
        } catch (Exception e) {
            return -1L;
        }
    }

    /** Append one line to the on-device log. Never throws. */
    private void log(String message) {
        try {
            String stamp = new SimpleDateFormat("MM-dd HH:mm:ss", Locale.US).format(new Date());
            File out = new File(logDir(), LOG_NAME);
            try (OutputStream os = new FileOutputStream(out, true)) {
                os.write((stamp + "  " + message + "\n").getBytes("UTF-8"));
            }
        } catch (Exception ignored) {
            /* logging must never break the app */
        }
    }

    /** Append a stack trace to the on-device log. Never throws. */
    private void logError(String where, Throwable t) {
        StringWriter sw = new StringWriter();
        t.printStackTrace(new PrintWriter(sw));
        log("ERROR in " + where + ": " + t + "\n" + sw);
    }

    // ------------------------------------------------------------- state ---

    /** Snapshot of the pack state, shared by `status` and the events. */
    private JSObject state() {
        File target = targetDir();
        File zip = findPack();
        JSObject out = new JSObject();
        out.put("ready", AtlasExtractor.isReady(target));
        out.put("present", target.isDirectory());
        out.put("packFound", zip != null);
        out.put("packPath", zip == null ? "" : zip.getAbsolutePath());
        out.put("packBytes", zip == null ? 0L : zip.length());
        out.put("path", target.getAbsolutePath());
        out.put("logPath", new File(logDir(), LOG_NAME).getAbsolutePath());
        out.put("files", countFiles(target));
        return out;
    }

    /** Rough count of files in the unpacked directory (bounded walk). */
    private int countFiles(File dir) {
        if (dir == null || !dir.isDirectory()) return 0;
        int[] n = { 0 };
        walk(dir, n, 0);
        return n[0];
    }

    private void walk(File dir, int[] n, int depth) {
        if (depth > 4 || n[0] > 200000) return;
        File[] kids = dir.listFiles();
        if (kids == null) return;
        for (File k : kids) {
            if (k.isDirectory()) {
                walk(k, n, depth + 1);
            } else if (!k.getName().equals(AtlasExtractor.READY_MARKER)) {
                n[0]++;
            }
        }
    }

    /** Notify the web layer; listeners must be called on the main thread. */
    private void emit(JSObject payload) {
        main.post(() -> notifyListeners("mediaPack", payload));
    }

    /** Resolve a plugin call; the webview must be touched on the main thread. */
    private void resolve(PluginCall call, JSObject value) {
        main.post(() -> call.resolve(value));
    }

    private void reject(PluginCall call, String message) {
        main.post(() -> call.reject(message));
    }

    // -------------------------------------------------------------- load ---

    /**
     * Unpack automatically on startup: the pack is pushed to the app's own
     * folder over MTP, so the user only has to open the app once.
     */
    @Override
    public void load() {
        writeStamp();
        log("=== app start (sdk=" + Build.VERSION.SDK_INT + " version=" + appVersionName() + ") ===");
        log("free space = " + freeBytes() + " bytes");
        worker.execute(() -> {
            try {
                File target = targetDir();
                log("target=" + target.getAbsolutePath());
                if (AtlasExtractor.isReady(target)) {
                    log("pack already ready, nothing to do");
                    emit(state());
                    return;
                }
                File zip = findPack();
                if (zip == null) {
                    log("NO PACK FOUND. candidates:");
                    for (File f : packCandidates()) {
                        log("  " + f.getAbsolutePath() + " exists=" + f.exists());
                    }
                    emit(state());
                    return;
                }
                log("unpacking " + zip.getAbsolutePath() + " (" + zip.length() + " bytes)");
                long free = freeBytes();
                if (free > 0 && free < zip.length() * 3 / 2) {
                    log("WARNING: not enough free space (" + free + " bytes) for a "
                        + zip.length() + " byte archive");
                }
                unpackInto(zip, target);
            } catch (Throwable t) {
                logError("load", t);
                emit(state());
            }
        });
    }

    // ----------------------------------------------------------- methods ---

    /**
     * Unpack `atlas.zip` into the target directory. Safe to call repeatedly:
     * an interrupted run continues where it stopped.
     */
    @PluginMethod
    public void unpack(PluginCall call) {
        String name = call.getString("file", PACK_NAME);
        worker.execute(() -> {
            try {
                File zip = findPack();
                if (zip == null) {
                    // The caller may point at a specific file name.
                    zip = new File(getContext().getFilesDir(), name);
                }
                if (!zip.exists() || zip.length() == 0) {
                    log("unpack requested but pack not found: " + name);
                    reject(call, "找不到压缩包 " + name + "，请先把它放到 Download/word-atlas/ 或应用私有目录");
                    return;
                }
                log("manual unpack of " + zip.getAbsolutePath());
                AtlasExtractor.Result r = unpackInto(zip, targetDir());
                JSObject out = state();
                out.put("written", r.written);
                out.put("total", r.total);
                out.put("bytes", r.bytes);
                resolve(call, out);
            } catch (Throwable t) {
                logError("unpack", t);
                reject(call, "解压失败: " + t.getMessage());
            }
        });
    }

    /** Report whether a media pack is present and completely unpacked. */
    @PluginMethod
    public void status(PluginCall call) {
        worker.execute(() -> {
            try {
                resolve(call, state());
            } catch (Throwable t) {
                logError("status", t);
                reject(call, String.valueOf(t.getMessage()));
            }
        });
    }

    // ---------------------------------------------------------- internals ---

    /** Unpack a zip into the target directory and mark it ready afterwards. */
    private AtlasExtractor.Result unpackInto(File zip, File target) throws Exception {
        long started = System.currentTimeMillis();
        emit(state());
        AtlasExtractor.Result r = AtlasExtractor.extract(zip, target, (files, total, bytes) -> {
            JSObject p = state();
            p.put("files", files);
            p.put("total", total);
            p.put("bytes", bytes);
            p.put("phase", "unpacking");
            emit(p);
            if (files % 5000 == 0) {
                log("  progress " + files + "/" + total + " (" + (bytes / 1048576) + " MB)");
            }
        });
        if (r.written == 0 && AtlasExtractor.isReady(target)) {
            log("nothing new to write, pack stays ready");
        } else {
            AtlasExtractor.markReady(target, r);
        }
        log("unpack finished: files=" + r.files + " written=" + r.written
            + " bytes=" + r.bytes + " in " + (System.currentTimeMillis() - started) + " ms"
            + " ready=" + AtlasExtractor.isReady(target));
        JSObject p = state();
        p.put("phase", "done");
        emit(p);
        return r;
    }
}
