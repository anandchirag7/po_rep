import Database from 'better-sqlite3';

const db = new Database('server/database.sqlite');
const stmt = db.prepare("DELETE FROM messages WHERE content = 'Processing...'");
const info = stmt.run();

console.log(`Deleted ${info.changes} corrupted 'Processing...' messages from the database.`);
