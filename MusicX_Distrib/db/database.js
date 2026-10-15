const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'music.db');
let db = null;

function loadOrCreate() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const buf = fs.readFileSync(DB_PATH);
      return buf;
    }
  } catch (e) {}
  return null;
}

function save() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e) { console.error('DB save error:', e.message); }
}

async function initDatabase() {
  const SQL = await initSqlJs();
  const existing = loadOrCreate();
  db = existing ? new SQL.Database(existing) : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      cover TEXT DEFAULT '',
      duration TEXT DEFAULT '',
      duration_sec INTEGER DEFAULT 0,
      source TEXT DEFAULT '',
      streaming_hash TEXT DEFAULT '',
      download_hash TEXT DEFAULT '',
      mp3 TEXT DEFAULT '',
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS playlist_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      track_id TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      cover TEXT DEFAULT '',
      duration TEXT DEFAULT '',
      duration_sec INTEGER DEFAULT 0,
      source TEXT DEFAULT '',
      streaming_hash TEXT DEFAULT '',
      download_hash TEXT DEFAULT '',
      mp3 TEXT DEFAULT '',
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS listening_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      source TEXT DEFAULT '',
      listened_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS favorite_artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      image TEXT DEFAULT '',
      source TEXT DEFAULT '',
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  save();
  return db;
}

function getDb() { return db; }

function prepare(sql) {
  return {
    run: function(...params) {
      db.run(sql, params);
      const lastId = db.exec("SELECT last_insert_rowid() as id");
      save();
      return { lastInsertRowid: lastId.length > 0 ? lastId[0].values[0][0] : 0 };
    },
    get: function(...params) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      if (stmt.step()) {
        const cols = stmt.getColumnNames();
        const vals = stmt.get();
        stmt.free();
        const row = {};
        cols.forEach(function(c, i) { row[c] = vals[i]; });
        return row;
      }
      stmt.free();
      return undefined;
    },
    all: function(...params) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        const cols = stmt.getColumnNames();
        const vals = stmt.get();
        const row = {};
        cols.forEach(function(c, i) { row[c] = vals[i]; });
        rows.push(row);
      }
      stmt.free();
      return rows;
    }
  };
}

function exec(sql) {
  db.run(sql);
  save();
}

module.exports = { initDatabase, getDb, prepare, exec, save };
