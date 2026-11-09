package in.devendranplastic.salestracker;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

/** Minimal file provider (no AndroidX) for camera captures (cache/captures) and saved downloads on Android 7-9. */
public class CaptureProvider extends ContentProvider {
    static final String AUTH = "in.devendranplastic.salestracker.files";

    static Uri uriFor(Context c, File f) {
        String root;
        String path = f.getAbsolutePath();
        String cache = c.getCacheDir().getAbsolutePath();
        File ext = c.getExternalFilesDir(null);
        if (path.startsWith(cache + "/")) root = "cache" + path.substring(cache.length());
        else if (ext != null && path.startsWith(ext.getAbsolutePath() + "/")) root = "ext" + path.substring(ext.getAbsolutePath().length());
        else throw new IllegalArgumentException("outside shared roots");
        return new Uri.Builder().scheme("content").authority(AUTH).encodedPath("/" + root).build();
    }

    private File fileFor(Uri u) throws FileNotFoundException {
        String p = u.getPath();
        if (p == null || p.contains("..")) throw new FileNotFoundException();
        Context c = getContext();
        File f;
        if (p.startsWith("/cache/")) f = new File(c.getCacheDir(), p.substring(7));
        else if (p.startsWith("/ext/") && c.getExternalFilesDir(null) != null) f = new File(c.getExternalFilesDir(null), p.substring(5));
        else throw new FileNotFoundException(p);
        try {
            String canon = f.getCanonicalPath();
            if (!canon.startsWith(c.getCacheDir().getCanonicalPath()) && (c.getExternalFilesDir(null) == null || !canon.startsWith(c.getExternalFilesDir(null).getCanonicalPath())))
                throw new FileNotFoundException();
        } catch (IOException e) { throw new FileNotFoundException(); }
        return f;
    }

    static boolean exists(Context c, Uri u) {
        try (ParcelFileDescriptor pfd = c.getContentResolver().openFileDescriptor(u, "r")) {
            return pfd != null && pfd.getStatSize() > 0;
        } catch (Exception e) { return false; }
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = fileFor(uri);
        int m = ParcelFileDescriptor.parseMode(mode);
        if ((m & ParcelFileDescriptor.MODE_WRITE_ONLY) != 0 || (m & ParcelFileDescriptor.MODE_READ_WRITE) != 0) {
            File d = f.getParentFile();
            if (d != null) d.mkdirs();
        }
        return ParcelFileDescriptor.open(f, m);
    }

    @Override
    public Cursor query(Uri uri, String[] proj, String sel, String[] args, String sort) {
        File f;
        try { f = fileFor(uri); } catch (FileNotFoundException e) { return null; }
        String[] cols = proj != null ? proj : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor c = new MatrixCursor(cols, 1);
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = f.getName();
            else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = f.length();
        }
        c.addRow(row);
        return c;
    }

    @Override
    public String getType(Uri uri) {
        String n = uri.getLastPathSegment();
        return n == null ? "application/octet-stream" : MainActivity.mimeOf(n);
    }

    @Override public Uri insert(Uri uri, ContentValues v) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String s, String[] a) { try { return fileFor(uri).delete() ? 1 : 0; } catch (Exception e) { return 0; } }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { throw new UnsupportedOperationException(); }
}
