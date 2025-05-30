import db from './db'; // Import the promisified db instance
import { Logger } from '@arifwidianto/msa-core'; // Optional: for logging

const createTableSql = `
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'done'))
);
`;

async function initializeDatabase(): Promise<void> {
  Logger.info('Initializing database schema...');
  try {
    await db.runAsync(createTableSql);
    Logger.info('Table "tasks" created or already exists.');
    
    // You could add initial data seeding here if needed
    // Example:
    // const { changes } = await db.runAsync("INSERT INTO tasks (description) VALUES (?), (?)", "My first task", "My second task");
    // if (changes > 0) {
    //    Logger.info(`${changes} initial tasks inserted.`);
    // }

  } catch (error) {
    Logger.error('Error initializing database schema:', error);
    throw error; // Re-throw to indicate failure to the caller
  } finally {
    try {
      await db.closeAsync();
      Logger.info('Database connection closed after initialization.');
    } catch (closeError) {
      Logger.error('Error closing database connection after initialization:', closeError);
    }
  }
}

// Execute the initialization if this script is run directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      Logger.info('Database initialization script completed successfully.');
      process.exit(0);
    })
    .catch(() => {
      Logger.error('Database initialization script failed.');
      process.exit(1);
    });
}

// Export for potential programmatic use (though typically run as a script)
export default initializeDatabase;
