import * as SQLite from "expo-sqlite";

export type Part = { category?: string; color?: string; fit?: string; length?: string; layered?: string; confidence?: string };
export type Look = { top?: Part; bottom?: Part; silhouette?: string; dressCode?: string; season?: string; multiple?: boolean };
export type Row = Look & { id: number; createdAt: number };

let db: SQLite.SQLiteDatabase | null = null;

async function get() {
  if (db) return db;
  db = await SQLite.openDatabaseAsync("pinset.db");
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS looks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      createdAt INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
  `);
  return db;
}

export async function insertLook(look: Look) {
  const d = await get();
  await d.runAsync("INSERT INTO looks (createdAt, payload) VALUES (?, ?)", Date.now(), JSON.stringify(look));
}

export async function listLooks(): Promise<Row[]> {
  const d = await get();
  const rows = await d.getAllAsync<{ id: number; createdAt: number; payload: string }>(
    "SELECT id, createdAt, payload FROM looks ORDER BY id DESC"
  );
  return rows.map((r) => ({ id: r.id, createdAt: r.createdAt, ...(JSON.parse(r.payload) as Look) }));
}

export async function deleteLook(id: number) {
  const d = await get();
  await d.runAsync("DELETE FROM looks WHERE id = ?", id);
}
