const db = require('./setup');

// Store user's Trello token
function storeUserToken(uid, token) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR REPLACE INTO user_tokens (user_id, trello_token) VALUES (?, ?)',
      [uid, token],
      (err) => {
        if (err) {
          console.error('Database error:', err);
          reject(err);
          return;
        }
        resolve(true);
      }
    );
  });
}

// Get user's Trello token
function getUserToken(uid) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT trello_token FROM user_tokens WHERE user_id = ?',
      [uid],
      (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null);
        resolve(row.trello_token);
      }
    );
  });
}

// Check if a request has been processed
function isRequestProcessed(requestId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT request_id FROM processed_requests WHERE request_id = ?',
      [requestId],
      (err, row) => {
        if (err) return reject(err);
        resolve(!!row); // Convert to boolean
      }
    );
  });
}

// Mark a request as processed
function markRequestProcessed(requestId) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR IGNORE INTO processed_requests (request_id) VALUES (?)',
      [requestId],
      (err) => {
        if (err) {
          console.error('Database error:', err);
          reject(err);
          return;
        }
        resolve(true);
      }
    );
  });
}

module.exports = {
  storeUserToken,
  getUserToken,
  isRequestProcessed,
  markRequestProcessed
}; 