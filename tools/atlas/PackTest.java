import com.haoxin.wordatlas.AtlasExtractor;

import java.io.File;

/**
 * Runs the real AtlasExtractor against the real media pack.
 *
 * This is the check that would have caught the tar-vs-zip bug: the CI
 * produced a tar file with a .zip name, ZipFile rejected it and the app
 * silently shipped without any media.
 *
 * Usage:
 *   javac -encoding UTF-8 -d out android/app/src/main/java/com/haoxin/wordatlas/AtlasExtractor.java tools/atlas/PackTest.java
 *   java -cp out PackTest android/app/src/main/assets/atlas.zip out/media
 */
public class PackTest {

    public static void main(String[] args) throws Exception {
        File pack = new File(args[0]);
        File target = new File(args[1]);

        byte[] magic = new byte[2];
        try (java.io.InputStream in = new java.io.FileInputStream(pack)) {
            in.read(magic);
        }
        System.out.println("pack magic = " + (char) magic[0] + (char) magic[1]);

        AtlasExtractor.Result r = AtlasExtractor.extract(pack, target, null);

        System.out.println("files  = " + r.files);
        System.out.println("total  = " + r.total);
        System.out.println("bytes  = " + r.bytes);
        System.out.println("written= " + r.written);

        int audio = count(target, "audio");
        int img = count(target, "img");
        int thumb = count(target, "thumb");
        System.out.println("audio=" + audio + " img=" + img + " thumb=" + thumb);

        // The plugin writes the marker after a successful run.
        AtlasExtractor.markReady(target, r);
        if (!AtlasExtractor.isReady(target)) throw new AssertionError("pack is not marked ready");
        if (r.total < 30000) throw new AssertionError("too few entries: " + r.total);
        if (audio < 20000) throw new AssertionError("missing audio: " + audio);
        if (img < 7000) throw new AssertionError("missing images: " + img);
        if (thumb < 7000) throw new AssertionError("missing thumbnails: " + thumb);
        System.out.println("OK");
    }

    private static int count(File target, String name) {
        File dir = new File(target, name);
        if (!dir.isDirectory()) return 0;
        final int[] n = { 0 };
        walk(dir, n);
        return n[0];
    }

    private static void walk(File dir, int[] n) {
        File[] kids = dir.listFiles();
        if (kids == null) return;
        for (File k : kids) {
            if (k.isDirectory()) walk(k, n);
            else n[0]++;
        }
    }
}
