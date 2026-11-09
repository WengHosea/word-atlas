package com.haoxin.wordatlas;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Enumeration;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Unpacks the offline media pack into a target directory.
 *
 * This class deliberately has no Android or Capacitor dependencies so the
 * exact same code can be exercised on a desktop JVM against the real
 * 600 MB archive before it ever reaches a phone.
 *
 * Two properties matter a lot in practice:
 *
 * - The extraction is resumable. A pack has ~37,500 files and unpacking it
 *   takes minutes; if the app is killed halfway through, the next start
 *   picks up where it stopped instead of starting over.
 * - Completion is recorded in a marker file. The archive contains
 *   `index.json` as its *second* entry, so checking for `index.json` alone
 *   cannot tell a complete pack from one that was interrupted after two
 *   files. The marker is only written once the whole archive is on disk.
 */
public final class AtlasExtractor {

    /** Marker file written into the target directory when the pack is complete. */
    public static final String READY_MARKER = ".atlas-ready";

    /** Progress callback, invoked roughly every {@link #PROGRESS_STEP} files. */
    public interface Progress {
        void onProgress(int files, int total, long bytes);
    }

    /** Outcome of one extraction run. */
    public static final class Result {

        /** Files present in the target directory after the run. */
        public final int files;
        /** File entries in the archive. */
        public final int total;
        /** Total bytes of media in the target directory. */
        public final long bytes;
        /** How many files had to be written during this run. */
        public final int written;

        Result(int files, int total, long bytes, int written) {
            this.files = files;
            this.total = total;
            this.bytes = bytes;
            this.written = written;
        }
    }

    /** How often the progress callback fires. */
    private static final int PROGRESS_STEP = 250;

    private AtlasExtractor() {}

    /** True when the pack was unpacked completely at least once. */
    public static boolean isReady(File target) {
        return target != null && target.isDirectory() && new File(target, READY_MARKER).isFile();
    }

    /** Write the completion marker. */
    public static void markReady(File target, Result result) throws IOException {
        File marker = new File(target, READY_MARKER);
        try (OutputStream os = new FileOutputStream(marker)) {
            String text = "files=" + result.files + "\nbytes=" + result.bytes + "\n";
            os.write(text.getBytes("UTF-8"));
        }
    }

    /**
     * Unpack {@code zip} into {@code target}.
     *
     * Files that already exist with the expected size are left alone, which
     * makes an interrupted run cheap to finish.
     */
    public static Result extract(File zip, File target, Progress progress) throws IOException {
        if (zip == null || !zip.isFile() || zip.length() == 0) {
            throw new IOException("媒体包不存在或为空: " + (zip == null ? "null" : zip.getAbsolutePath()));
        }
        assertRealZip(zip);
        if (!target.isDirectory() && !target.mkdirs() && !target.isDirectory()) {
            throw new IOException("无法创建目录: " + target.getAbsolutePath());
        }

        String canonicalTarget = target.getCanonicalPath();
        int total = 0;
        int files = 0;
        int written = 0;
        long bytes = 0;

        try (ZipFile zf = new ZipFile(zip)) {
            String prefix = detectPrefix(zf);

            // Count the file entries first. ZipFile.nextElement() is avoided
            // on purpose: it is not available on every Android release.
            Enumeration<? extends ZipEntry> entries = zf.entries();
            while (entries.hasMoreElements()) {
                if (!entries.nextElement().isDirectory()) total++;
            }

            entries = zf.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                String name = entry.getName();
                if (!prefix.isEmpty() && name.startsWith(prefix)) {
                    name = name.substring(prefix.length());
                }
                if (name.isEmpty()) continue;

                File out = new File(target, name);
                // Guard against zip-slip: the entry must stay under the target.
                if (!out.getCanonicalPath().startsWith(canonicalTarget + File.separator)) {
                    continue;
                }

                if (entry.isDirectory()) {
                    out.mkdirs();
                    continue;
                }

                File parent = out.getParentFile();
                if (parent != null && !parent.isDirectory()) {
                    parent.mkdirs();
                }

                long expected = entry.getSize();
                if (out.isFile() && expected >= 0 && out.length() == expected) {
                    // Already unpacked by an earlier run.
                    files++;
                    bytes += expected;
                    continue;
                }

                try (
                    InputStream in = zf.getInputStream(entry);
                    OutputStream os = new FileOutputStream(out)
                ) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    long writtenHere = 0;
                    while ((n = in.read(buf)) > 0) {
                        os.write(buf, 0, n);
                        writtenHere += n;
                    }
                    bytes += writtenHere;
                }
                files++;
                written++;

                if (progress != null && written % PROGRESS_STEP == 0) {
                    progress.onProgress(files, total, bytes);
                }
            }
        }

        return new Result(files, total, bytes, written);
    }

    /**
     * Fail with a readable message when the archive is not a ZIP.
     *
     * The media pack used to be packed with `tar -a`, which only produces a
     * ZIP on BSD tar. On GNU tar it silently produced a tar file, and
     * `ZipFile` then failed with a bare "error in opening zip file" that
     * said nothing about the real cause. Checking the two magic bytes up
     * front turns that into an actionable message.
     */
    private static void assertRealZip(File zip) throws IOException {
        byte[] magic = new byte[2];
        try (InputStream in = new FileInputStream(zip)) {
            int read = in.read(magic);
            if (read < 2 || magic[0] != 'P' || magic[1] != 'K') {
                throw new IOException(
                    "媒体包不是有效的 ZIP 文件（文件头不是 PK）。它可能被打包成了 tar，"
                    + "请用 scripts/bundle-media-pack.mjs 重新生成: " + zip.getAbsolutePath());
            }
        }
    }

    /**
     * Return the shared top-level folder of the archive, e.g. {@code atlas/}.
     *
     * The archive is produced from the {@code public/atlas} folder, so every
     * entry starts with {@code atlas/}. That prefix is stripped so the files
     * land directly in the target folder instead of {@code target/atlas/...}.
     */
    private static String detectPrefix(ZipFile zf) {
        Enumeration<? extends ZipEntry> entries = zf.entries();
        String first = null;
        while (entries.hasMoreElements() && first == null) {
            ZipEntry e = entries.nextElement();
            if (e.isDirectory()) continue;
            first = e.getName();
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

    /** Copy a file, used to park the pack in the shared Download folder. */
    public static long copy(File from, File to) throws IOException {
        File parent = to.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs() && !parent.isDirectory()) {
            throw new IOException("无法创建目录: " + parent.getAbsolutePath());
        }
        try (
            InputStream in = new FileInputStream(from);
            OutputStream os = new FileOutputStream(to)
        ) {
            byte[] buf = new byte[128 * 1024];
            int n;
            long total = 0;
            while ((n = in.read(buf)) > 0) {
                os.write(buf, 0, n);
                total += n;
            }
            return total;
        }
    }
}
