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

final class LedgerStore extends SQLiteOpenHelper {
  private final HashMap<String, JSONArray> snapshotCache = new HashMap<>();
  private int cachedPendingCount = -1;

  LedgerStore(Context context, String owner) {
    super(context, "ledger-" + java.util.UUID.fromString(owner) + ".db", null, 1);
    setWriteAheadLoggingEnabled(true);
  }

  @Override
  public void onCreate(SQLiteDatabase db) {
    db.execSQL("CREATE TABLE snapshot (name TEXT PRIMARY KEY, payload TEXT NOT NULL)");
    db.execSQL(
        "CREATE TABLE outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,"
            + " payload TEXT NOT NULL, error TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL)");
  }

  @Override
  public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
    throw new IllegalStateException("Database upgrade requires a migration");
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
    try (Cursor c =
        getReadableDatabase()
            .rawQuery("SELECT payload FROM snapshot WHERE name=?", new String[] {name})) {
      JSONArray parsed = c.moveToFirst() ? new JSONArray(c.getString(0)) : new JSONArray();
      snapshotCache.put(name, parsed);
      return parsed;
    }
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

  synchronized void commitSnapshot(JSONObject snapshots, ArrayList<String> acknowledged)
      throws Exception {
    SQLiteDatabase db = getWritableDatabase();
    db.beginTransaction();
    try {
      for (java.util.Iterator<String> it = snapshots.keys(); it.hasNext(); ) {
        String name = it.next();
        JSONArray array = snapshots.getJSONArray(name);
        ContentValues v = new ContentValues();
        v.put("name", name);
        v.put("payload", array.toString());
        db.insertWithOnConflict("snapshot", null, v, SQLiteDatabase.CONFLICT_REPLACE);
        snapshotCache.put(name, array);
      }
      for (String id : acknowledged) db.delete("outbox", "id=?", new String[] {id});
      db.setTransactionSuccessful();
      cachedPendingCount = -1;
    } finally {
      db.endTransaction();
    }
  }
}
