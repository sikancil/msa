import sqlite3 from 'sqlite3';
import * as path from 'path';
import { promisify } from 'util';

const dbPath = path.join(__dirname, '..', 'tasks.db'); // Puts tasks.db in project root

// Enhance sqlite3.Database and Statement with promisified methods
interface PromisifiedDatabase extends sqlite3.Database {
  runAsync: (sql: string, ...params: any[]) => Promise<{ id: number; changes: number }>;
  getAsync: <T = any>(sql: string, ...params: any[]) => Promise<T | undefined>;
  allAsync: <T = any>(sql: string, ...params: any[]) => Promise<T[]>;
  closeAsync: () => Promise<void>;
}

interface PromisifiedStatement extends sqlite3.Statement {
  runAsync: (...params: any[]) => Promise<{ id: number; changes: number }>;
  getAsync: <T = any>(...params: any[]) => Promise<T | undefined>;
  allAsync: <T = any>(...params: any[]) => Promise<T[]>;
  finalizeAsync: () => Promise<void>;
}

// Create/connect to the database
const db = new sqlite3.Database(dbPath, (err: Error | null) => {
  if (err) {
    console.error('Error opening database:', err.message);
    // Propagate the error or handle it as critical
    throw err; 
  }
  console.log(`Connected to the SQLite database at ${dbPath}`);
});

// Promisify Database methods
(db as PromisifiedDatabase).runAsync = function(sql: string, ...params: any[]): Promise<{ id: number; changes: number }> {
  return new Promise((resolve, reject) => {
    // sqlite3's `run` method's callback has `this` context providing `lastID` and `changes`
    // We use a function declaration for the callback to preserve `this`.
    (this as sqlite3.Database).run(sql, params, function(this: sqlite3.RunResult, err: Error | null) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
};

(db as PromisifiedDatabase).getAsync = promisify(db.get).bind(db) as <T = any>(sql: string, ...params: any[]) => Promise<T | undefined>;
(db as PromisifiedDatabase).allAsync = promisify(db.all).bind(db) as <T = any>(sql: string, ...params: any[]) => Promise<T[]>;
(db as PromisifiedDatabase).closeAsync = promisify(db.close).bind(db);


// It's generally better to export the promisified instance directly.
export default db as PromisifiedDatabase;

// Promisify Statement methods (optional, if you use prepare extensively)
// This is more complex as you'd need to wrap the prepare method itself.
// For simplicity, we'll stick to promisifying Database methods for now.
// If specific statement promisification is needed, it can be added here.
// Example:
// export function prepareAsync(sql: string): Promise<PromisifiedStatement> {
//   return new Promise((resolve, reject) => {
//     const stmt = db.prepare(sql, (err) => {
//       if (err) reject(err);
//       else {
//         (stmt as PromisifiedStatement).runAsync = promisify(stmt.run).bind(stmt);
//         // ... and so on for get, all, finalize
//         resolve(stmt as PromisifiedStatement);
//       }
//     });
//   });
// }
