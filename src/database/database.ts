import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabase('inandout.db');

export const initDatabase = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    db.transaction(
      tx => {
        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            icon TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'both'
          )`,
          [],
          () => {},
          (_, error) => { reject(error); return false; }
        );

        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT NOT NULL,
            categoryId INTEGER,
            type TEXT NOT NULL,
            importHash TEXT UNIQUE,
            FOREIGN KEY (categoryId) REFERENCES categories(id)
          )`,
          [],
          () => {},
          (_, error) => { reject(error); return false; }
        );

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

        defaultCategories.forEach(([name, color, icon, type]) => {
          tx.executeSql(
            'INSERT OR IGNORE INTO categories (name, color, icon, type) VALUES (?, ?, ?, ?)',
            [name, color, icon, type],
            () => {},
            (_, error) => { console.error('Error inserting category:', error); return false; }
          );
        });
      },
      error => reject(error),
      () => resolve()
    );
  });
};

export default db;
