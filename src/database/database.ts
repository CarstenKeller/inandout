import { openDatabaseSync } from 'expo-sqlite';

export const db = openDatabaseSync('inandout.db');

export const initDatabase = (): Promise<void> => {
  db.withTransactionSync(() => {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        icon TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'both'
      )
    `);

    db.execSync(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT NOT NULL,
        categoryId INTEGER,
        type TEXT NOT NULL,
        importHash TEXT UNIQUE,
        isManual INTEGER NOT NULL DEFAULT 0,
        recurrence TEXT NOT NULL DEFAULT 'once',
        FOREIGN KEY (categoryId) REFERENCES categories(id)
      )
    `);

    // Migrations for existing DBs
    try { db.execSync("ALTER TABLE transactions ADD COLUMN isManual INTEGER NOT NULL DEFAULT 0"); } catch {}
    try { db.execSync("ALTER TABLE transactions ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'once'"); } catch {}
    try { db.execSync("ALTER TABLE categories ADD COLUMN keywords TEXT NOT NULL DEFAULT ''"); } catch {}
    try { db.execSync("ALTER TABLE categories ADD COLUMN amount_rules TEXT NOT NULL DEFAULT ''"); } catch {}

    db.execSync(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#607D8B',
        iban TEXT
      )
    `);
    try { db.execSync("ALTER TABLE transactions ADD COLUMN accountId INTEGER REFERENCES accounts(id)"); } catch {}
    try { db.execSync("ALTER TABLE import_sessions ADD COLUMN account_id INTEGER REFERENCES accounts(id)"); } catch {}

    db.execSync(`
      CREATE TABLE IF NOT EXISTS import_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        total_count INTEGER NOT NULL DEFAULT 0,
        auto_count INTEGER NOT NULL DEFAULT 0,
        assigned_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0
      )
    `);

    db.execSync(`
      CREATE TABLE IF NOT EXISTS import_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        import_hash TEXT NOT NULL,
        date TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        category_id INTEGER,
        FOREIGN KEY (session_id) REFERENCES import_sessions(id) ON DELETE CASCADE
      )
    `);

    // Remove duplicate categories, keep lowest id per name
    db.execSync(
      'DELETE FROM categories WHERE id NOT IN (SELECT MIN(id) FROM categories GROUP BY name)'
    );

    // Insert missing defaults
    const existingNames = new Set(
      db.getAllSync<{ name: string }>('SELECT name FROM categories').map(r => r.name)
    );
    const defaults: [string, string, string, string][] = [
      ['Gehalt', '#4CAF50', 'briefcase', 'income'],
      ['Lebensmittel', '#FF9800', 'cart', 'expense'],
      ['Miete', '#F44336', 'home', 'expense'],
      ['Transport', '#2196F3', 'car', 'expense'],
      ['Freizeit', '#9C27B0', 'game-controller', 'expense'],
      ['Gesundheit', '#00BCD4', 'medkit', 'expense'],
      ['Versicherung', '#607D8B', 'shield', 'expense'],
      ['Sonstiges', '#9E9E9E', 'ellipsis-horizontal', 'both'],
    ];
    for (const [name, color, icon, type] of defaults) {
      if (!existingNames.has(name)) {
        db.runSync(
          'INSERT INTO categories (name, color, icon, type) VALUES (?, ?, ?, ?)',
          [name, color, icon, type]
        );
      }
    }
  });

  return Promise.resolve();
};
