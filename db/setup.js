const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create a new database or connect to existing one
const db = new sqlite3.Database(path.join(__dirname, 'trello_tokens.db'), (err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    return;
  }
  console.log('Connected to SQLite database');
});

// Create the tokens table
db.run(`
  CREATE TABLE IF NOT EXISTS user_tokens (
    user_id TEXT PRIMARY KEY,
    trello_token TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('Error creating tokens table:', err);
    return;
  }
  console.log('Tokens table created or already exists');
});

// Create the processed requests table
db.run(`
  CREATE TABLE IF NOT EXISTS processed_requests (
    request_id TEXT PRIMARY KEY,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('Error creating processed_requests table:', err);
    return;
  }
  console.log('Processed requests table created or already exists');
});

module.exports = db; 