const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, fileName), 'utf-8'));
}

// Atomic write (temp file + rename) so a crash never leaves a half-written file.
function writeJson(fileName, data) {
  const filePath = path.join(DATA_DIR, fileName);
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, filePath);
}

const getCalls = () => readJson('calls.json');
const getNotifications = () => readJson('notifications.json');

module.exports = { readJson, writeJson, getCalls, getNotifications };
