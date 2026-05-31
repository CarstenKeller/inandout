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
        FOREIGN KEY (categoryId) REFERENCES categories(id)
      )
    `);

    // Migration: add isManual to existing DBs
    try {
      db.execSync('ALTER TABLE transactions ADD COLUMN isManual INTEGER NOT NULL DEFAULT 0');
    } catch {
      // Column already exists
    }

    const defaultCategories: [string, string, string, string][] = [
      ['Gehalt', '#4CAF50', 'briefcase', 'income'],
      ['Lebensmittel', '#FF9800', 'cart', 'expense'],
      ['Miete', '#F44336', 'home', 'expense'],
      ['Transport', '#2196F3', 'car', 'expense'],
      ['Freizeit', '#9C27B0', 'game-controller', 'expense'],
      ['Gesundheit', '#00BCD4', 'medkit', 'expense'],
      ['Versicherung', '#607D8B', 'shield', 'expense'],
      ['Sonstiges', '#9E9E9E', 'ellipsis-horizontal', 'both'],
    ];

    // Remove duplicates, keep lowest id per name
    db.execSync(
      'DELETE FROM categories WHERE id NOT IN (SELECT MIN(id) FROM categories GROUP BY name)'
    );

    // Insert defaults only if name doesn't exist yet
    const existingNames = new Set(
      db.getAllSync<{ name: string }>('SELECT name FROM categories').map(r => r.name)
    );
    for (const [name, color, icon, type] of defaultCategories) {
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
