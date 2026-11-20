import * as SQLite from "expo-sqlite";

export type Part = { category?: string; color?: string; fit?: string; length?: string; layered?: string; confidence?: string };
export type Look = { top?: Part; bottom?: Part; silhouette?: string; dressCode?: string; season?: string; seasons?: string[]; multiple?: boolean };
export type Row = Look & { id: number; createdAt: number; folders: number[] };
export type Folder = { id: number; name: string; emoji: string; isSample: number; parentId: number | null };

const SAMPLES = [
  { name: "출근룩", emoji: "👔" },
  { name: "사고 싶은 것", emoji: "🛒" },
];

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
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '📁',
      isSample INTEGER NOT NULL DEFAULT 0,
      parentId INTEGER
    );
    CREATE TABLE IF NOT EXISTS look_folders (
      lookId INTEGER NOT NULL,
      folderId INTEGER NOT NULL,
      PRIMARY KEY (lookId, folderId)
    );
  `);
  try {
    await db.execAsync("ALTER TABLE folders ADD COLUMN emoji TEXT NOT NULL DEFAULT '📁'");
  } catch {}
  try {
    await db.execAsync("ALTER TABLE folders ADD COLUMN parentId INTEGER");
  } catch {}
  try {
    await db.execAsync("ALTER TABLE looks ADD COLUMN reco TEXT");
  } catch {}
  try {
    const old = await db.getAllAsync<{ id: number }>(
      "SELECT id FROM folders WHERE isSample = 1 OR name IN ('출근룩', '사고 싶은 것')"
    );
    for (const o of old) {
      await db.runAsync("DELETE FROM look_folders WHERE folderId = ?", o.id);
      await db.runAsync("DELETE FROM folders WHERE id = ?", o.id);
    }
  } catch {}
  const n = await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) AS c FROM folders");
  if (!n || n.c === 0) {
    for (const f of SAMPLES) {
      await db.runAsync("INSERT INTO folders (name, emoji, isSample) VALUES (?, ?, 1)", f.name, f.emoji);
    }
  }
  return db;
}

export async function listFolders(): Promise<Folder[]> {
  const d = await get();
  return d.getAllAsync<Folder>("SELECT id, name, emoji, isSample, parentId FROM folders ORDER BY id");
}

export async function addFolder(name: string, emoji: string, parentId: number | null = null) {
  const d = await get();
  await d.runAsync("INSERT INTO folders (name, emoji, isSample, parentId) VALUES (?, ?, 0, ?)", name.trim(), emoji, parentId);
}

export async function renameFolder(id: number, name: string, emoji?: string) {
  const d = await get();
  if (emoji) await d.runAsync("UPDATE folders SET name = ?, emoji = ?, isSample = 0 WHERE id = ?", name.trim(), emoji, id);
  else await d.runAsync("UPDATE folders SET name = ?, isSample = 0 WHERE id = ?", name.trim(), id);
}

export async function removeFolder(id: number) {
  const d = await get();
  const kids = await d.getAllAsync<{ id: number }>("SELECT id FROM folders WHERE parentId = ?", id);
  for (const k of kids) {
    await d.runAsync("DELETE FROM look_folders WHERE folderId = ?", k.id);
    await d.runAsync("DELETE FROM folders WHERE id = ?", k.id);
  }
  await d.runAsync("DELETE FROM look_folders WHERE folderId = ?", id);
  await d.runAsync("DELETE FROM folders WHERE id = ?", id);
}

export async function insertLook(look: Look): Promise<number> {
  const d = await get();
  const r = await d.runAsync(
    "INSERT INTO looks (createdAt, payload) VALUES (?, ?)",
    Date.now(),
    JSON.stringify(look)
  );
  return r.lastInsertRowId;
}

export async function saveReco(id: number, reco: unknown) {
  const d = await get();
  await d.runAsync("UPDATE looks SET reco = ? WHERE id = ?", JSON.stringify(reco), id);
}

export async function getReco(id: number): Promise<unknown | null> {
  const d = await get();
  const r = await d.getFirstAsync<{ reco: string | null }>("SELECT reco FROM looks WHERE id = ?", id);
  if (!r || !r.reco) return null;
  try { return JSON.parse(r.reco); } catch { return null; }
}

export async function updateLook(id: number, look: Look) {
  const d = await get();
  await d.runAsync("UPDATE looks SET payload = ? WHERE id = ?", JSON.stringify(look), id);
}

export async function setFolders(lookId: number, folderIds: number[]) {
  const d = await get();
  await d.runAsync("DELETE FROM look_folders WHERE lookId = ?", lookId);
  for (const f of folderIds) {
    await d.runAsync("INSERT OR IGNORE INTO look_folders (lookId, folderId) VALUES (?, ?)", lookId, f);
  }
}

export async function listLooks(): Promise<Row[]> {
  const d = await get();
  const rows = await d.getAllAsync<{ id: number; createdAt: number; payload: string }>(
    "SELECT id, createdAt, payload FROM looks ORDER BY id DESC"
  );
  const links = await d.getAllAsync<{ lookId: number; folderId: number }>(
    "SELECT lookId, folderId FROM look_folders"
  );
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    folders: links.filter((l) => l.lookId === r.id).map((l) => l.folderId),
    ...(JSON.parse(r.payload) as Look),
  }));
}

export async function deleteLook(id: number) {
  const d = await get();
  await d.runAsync("DELETE FROM look_folders WHERE lookId = ?", id);
  await d.runAsync("DELETE FROM looks WHERE id = ?", id);
}
