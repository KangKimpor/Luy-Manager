package com.luymanager.nativeapp;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The local ledger.
 *
 * Rows are stored one per record rather than as a JSON snapshot of a whole table.
 * A sync that changes three transactions then writes three rows instead of
 * rewriting every transaction the user has ever recorded, and an incremental pull
 * can merge without replacing the table.
 *
 * `snapshot(name)` still returns the old array shape, so screens did not have to
 * change; the array is assembled from the records and cached for the session.
 */
final class LedgerStore extends SQLiteOpenHelper {
  private static final int VERSION = 2;
  private final HashMap<String, JSONArray> snapshotCache = new HashMap<>();
  private int cachedPendingCount = -1;

  LedgerStore(Context context, String owner) {
    super(context, "ledger-" + java.util.UUID.fromString(owner) + ".db", null, VERSION);
    setWriteAheadLoggingEnabled(true);
  }

  @Override
  public void onCreate(SQLiteDatabase db) {
    createRecords(db);
    createOutbox(db);
    db.execSQL("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  }

  @Override
  public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
    if (oldVersion < 2) {
      // Version 1 stored each table as one JSON blob. Move every row into the
      // record table, then drop the blob so the disk saving is real.
      createRecords(db);
      db.execSQL("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
      if (hasTable(db, "snapshot")) {
        try (Cursor c = db.rawQuery("SELECT name,payload FROM snapshot", null)) {
          while (c.moveToNext()) {
            String name = c.getString(0);
            JSONArray rows = new JSONArray(c.getString(1));
            for (int i = 0; i < rows.length(); i++) {
              JSONObject row = rows.getJSONObject(i);
              ContentValues values = new ContentValues();
              values.put("name", name);
              values.put("id", row.getString("id"));
              values.put("payload", row.toString());
              db.insertWithOnConflict(
                  "records", null, values, SQLiteDatabase.CONFLICT_REPLACE);
            }
          }
        } catch (Exception ignored) {
          // A malformed legacy blob is dropped rather than blocking the upgrade.
          // The next sync repopulates the table from the server.
        }
        db.execSQL("DROP TABLE IF EXISTS snapshot");
      }
      if (!hasTable(db, "outbox")) createOutbox(db);
    }
  }

  private static void createRecords(SQLiteDatabase db) {
    db.execSQL(
        "CREATE TABLE IF NOT EXISTS records (name TEXT NOT NULL, id TEXT NOT NULL,"
            + " payload TEXT NOT NULL, PRIMARY KEY (name, id))");
  }

  private static void createOutbox(SQLiteDatabase db) {
    db.execSQL(
        "CREATE TABLE IF NOT EXISTS outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,"
            + " payload TEXT NOT NULL, error TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL)");
  }

  private static boolean hasTable(SQLiteDatabase db, String name) {
    try (Cursor c =
        db.rawQuery("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", new String[] {name})) {
      return c.moveToFirst();
    }
  }

  @Override
  public synchronized void close() {
    snapshotCache.clear();
    cachedPendingCount = -1;
    super.close();
  }

  synchronized JSONArray snapshot(String name) throws Exception {
    JSONArray cached = snapshotCache.get(name);
    if (cached != null) return cached;
    JSONArray parsed = new JSONArray();
    try (Cursor c =
        getReadableDatabase()
            .rawQuery("SELECT payload FROM records WHERE name=? ORDER BY rowid", new String[] {name})) {
      while (c.moveToNext()) parsed.put(new JSONObject(c.getString(0)));
    }
    snapshotCache.put(name, parsed);
    return parsed;
  }

  synchronized JSONArray rows(String name) throws Exception {
    LinkedHashMap<String, JSONObject> rows = new LinkedHashMap<>();
    JSONArray cached = snapshot(name);
    for (int i = 0; i < cached.length(); i++) {
      JSONObject row = cached.getJSONObject(i);
      rows.put(row.getString("id"), row);
    }
    if (pendingCount() > 0) {
      for (JSONObject operation : pending()) {
        JSONObject op = operation.getJSONObject("operation");
        if (!op.getString("table").equals(name)) continue;
        JSONArray changes = op.getJSONArray("rows");
        for (int i = 0; i < changes.length(); i++) {
          JSONObject row = changes.getJSONObject(i);
          rows.put(row.getString("id"), new JSONObject(row.toString()).put("_pending", true));
        }
      }
    }
    JSONArray result = new JSONArray();
    for (JSONObject row : rows.values()) if (row.isNull("deleted_at")) result.put(row);
    return result;
  }

  synchronized void enqueue(String table, JSONArray rows) throws Exception {
    if (!table.equals("transactions") && !table.equals("accounts") && !table.equals("budgets"))
      throw new IllegalArgumentException("Unsupported write");
    ContentValues values = new ContentValues();
    values.put("id", java.util.UUID.randomUUID().toString());
    values.put("payload", new JSONObject().put("table", table).put("rows", rows).toString());
    values.put("created", System.currentTimeMillis());
    getWritableDatabase().insertOrThrow("outbox", null, values);
    cachedPendingCount = -1;
  }

  synchronized ArrayList<JSONObject> pending() throws Exception {
    ArrayList<JSONObject> result = new ArrayList<>();
    try (Cursor c =
        getReadableDatabase().rawQuery("SELECT id,payload,error FROM outbox ORDER BY seq", null)) {
      while (c.moveToNext())
        result.add(
            new JSONObject()
                .put("id", c.getString(0))
                .put("operation", new JSONObject(c.getString(1)))
                .put("error", c.getString(2)));
    }
    cachedPendingCount = result.size();
    return result;
  }

  synchronized int pendingCount() {
    if (cachedPendingCount >= 0) return cachedPendingCount;
    try (Cursor c = getReadableDatabase().rawQuery("SELECT count(*) FROM outbox", null)) {
      c.moveToFirst();
      cachedPendingCount = c.getInt(0);
      return cachedPendingCount;
    }
  }

  synchronized void failed(String id, String message) {
    ContentValues v = new ContentValues();
    v.put("error", message);
    getWritableDatabase().update("outbox", v, "id=?", new String[] {id});
  }

  /** Replace every row in the named tables. Used by the first full download. */
  synchronized void commitSnapshot(JSONObject snapshots, ArrayList<String> acknowledged)
      throws Exception {
    SQLiteDatabase db = getWritableDatabase();
    db.beginTransaction();
    try {
      for (java.util.Iterator<String> it = snapshots.keys(); it.hasNext(); ) {
        String name = it.next();
        JSONArray array = snapshots.getJSONArray(name);
        db.delete("records", "name=?", new String[] {name});
        for (int i = 0; i < array.length(); i++) {
          JSONObject row = array.getJSONObject(i);
          ContentValues v = new ContentValues();
          v.put("name", name);
          v.put("id", row.getString("id"));
          v.put("payload", row.toString());
          db.insertWithOnConflict("records", null, v, SQLiteDatabase.CONFLICT_REPLACE);
        }
        snapshotCache.put(name, array);
      }
      for (String id : acknowledged) db.delete("outbox", "id=?", new String[] {id});
      db.setTransactionSuccessful();
      cachedPendingCount = -1;
    } finally {
      db.endTransaction();
    }
  }

  /**
   * Apply only the rows a delta sync returned. A soft-deleted row arrives with
   * `deleted_at` set and stays in the table, so the tombstone survives until the
   * next full download.
   */
  synchronized void mergeSnapshot(JSONObject snapshots, ArrayList<String> acknowledged)
      throws Exception {
    SQLiteDatabase db = getWritableDatabase();
    db.beginTransaction();
    try {
      for (java.util.Iterator<String> it = snapshots.keys(); it.hasNext(); ) {
        String name = it.next();
        JSONArray array = snapshots.getJSONArray(name);
        for (int i = 0; i < array.length(); i++) {
          JSONObject row = array.getJSONObject(i);
          ContentValues v = new ContentValues();
          v.put("name", name);
          v.put("id", row.getString("id"));
          v.put("payload", row.toString());
          db.insertWithOnConflict("records", null, v, SQLiteDatabase.CONFLICT_REPLACE);
        }
        if (array.length() > 0) snapshotCache.remove(name);
      }
      for (String id : acknowledged) db.delete("outbox", "id=?", new String[] {id});
      db.setTransactionSuccessful();
      cachedPendingCount = -1;
    } finally {
      db.endTransaction();
    }
  }

  /** Server timestamp, in milliseconds, up to which the tables are known complete. */
  synchronized long lastSyncedAt() {
    try (Cursor c =
        getReadableDatabase().rawQuery("SELECT value FROM meta WHERE key='last_sync'", null)) {
      return c.moveToFirst() ? Long.parseLong(c.getString(0)) : 0L;
    } catch (RuntimeException e) {
      return 0L;
    }
  }

  synchronized void setLastSyncedAt(long value) {
    ContentValues v = new ContentValues();
    v.put("key", "last_sync");
    v.put("value", Long.toString(value));
    getWritableDatabase()
        .insertWithOnConflict("meta", null, v, SQLiteDatabase.CONFLICT_REPLACE);
  }
}
