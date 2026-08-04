const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const { Client } = require('ssh2');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// SSH connections JSON file storage path (stored safely outside of public directory)
const SSH_CONFIG_PATH = path.join(__dirname, 'ssh_connections.json');

const ALGORITHM = 'aes-256-cbc';
const MASTER_KEY_PATH = path.join(__dirname, 'master.key');
const KEY_LENGTH = 32; // AES-256 requires exactly 32 bytes
let ENCRYPTION_KEY;

/**
 * Loads and validates the master key. Behavior:
 *   - If master.key exists but cannot be read OR has the wrong length, the
 *     server refuses to start (process.exit(1)) to prevent silent data loss
 *     of previously encrypted SSH credentials and API keys in JSON files.
 *   - If master.key exists and is valid, runs a roundtrip self-test to make
 *     sure crypto primitives work with this key before continuing.
 *   - If master.key does NOT exist, generates a new one (first-run case).
 */
function loadOrCreateMasterKey() {
  if (fs.existsSync(MASTER_KEY_PATH)) {
    let key;
    try {
      key = fs.readFileSync(MASTER_KEY_PATH);
    } catch (err) {
      console.error('');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error(' FATAL: cannot read master.key');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error(`  Path: ${MASTER_KEY_PATH}`);
      console.error(`  Error: ${err.message}`);
      console.error('');
      console.error('  LogScope will NOT start to prevent overwriting an');
      console.error('  unreadable key, which would make all encrypted');
      console.error('  SSH passwords and API keys permanently undecryptable.');
      console.error('');
      console.error('  Fix the file permissions and try again, or restore');
      console.error('  the key from a backup if it was lost.');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      process.exit(1);
    }

    if (key.length !== KEY_LENGTH) {
      console.error('');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error(' FATAL: master.key has invalid length');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error(`  Path: ${MASTER_KEY_PATH}`);
      console.error(`  Expected: ${KEY_LENGTH} bytes (AES-256)`);
      console.error(`  Actual:   ${key.length} bytes`);
      console.error('');
      console.error('  LogScope will NOT start to prevent silent rotation');
      console.error('  of a corrupt key, which would make all encrypted');
      console.error('  SSH passwords and API keys permanently undecryptable.');
      console.error('');
      console.error('  Restore the original key from backup, or delete the');
      console.error('  file (you will need to re-enter all credentials).');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      process.exit(1);
    }

    // Roundtrip self-test: confirm crypto works with this key.
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      const testPlain = 'logscope-master-key-self-test';
      const encrypted = Buffer.concat([cipher.update(testPlain, 'utf8'), cipher.final()]);
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
      if (decrypted !== testPlain) {
        throw new Error('Roundtrip mismatch: decrypted text differs from original');
      }
    } catch (err) {
      console.error('');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error(' FATAL: master.key failed self-test');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error(`  Path: ${MASTER_KEY_PATH}`);
      console.error(`  Error: ${err.message}`);
      console.error('');
      console.error('  The key was read but crypto operations with it');
      console.error('  failed. This usually means the key is corrupt.');
      console.error('');
      console.error('  Restore the original key from backup, or delete the');
      console.error('  file (you will need to re-enter all credentials).');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      process.exit(1);
    }

    return key;
  }

  // First-run case: no master.key exists, create a new one.
  const key = crypto.randomBytes(KEY_LENGTH);
  try {
    fs.writeFileSync(MASTER_KEY_PATH, key);
  } catch (err) {
    console.error('Failed to write master key file:', err);
    // Not fatal: continue in-memory only (will fail on next encrypt
    // with a clear error thanks to the B5 fix).
  }
  return key;
}

ENCRYPTION_KEY = loadOrCreateMasterKey();

function encrypt(text) {
  if (!text) return '';
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (err) {
    console.error('Encryption failed:', err);
    // SECURITY: refusing to return plaintext prevents the secret from being
    // written unencrypted to ssh_connections.json / system_settings.json when
    // the master key is missing/corrupt. Callers MUST handle this throw.
    const wrapped = new Error('Encryption failed: master key missing or corrupt');
    wrapped.cause = err;
    throw wrapped;
  }
}

function decrypt(text) {
  if (!text) return '';
  const parts = text.split(':');
  if (parts.length !== 2) return text;
  const ivStr = parts[0];
  const encryptedTextStr = parts[1];
  if (ivStr.length !== 32) return text;
  
  try {
    const iv = Buffer.from(ivStr, 'hex');
    const encryptedText = Buffer.from(encryptedTextStr, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return text;
  }
}

// The settings JSON file storage path
const SETTINGS_PATH = path.join(__dirname, 'system_settings.json');

function getRawSystemSettings() {
  const defaultDir = path.resolve(__dirname, '..');
  const defaults = {
    localLogsDir: defaultDir,
    aiEnabled: false,
    aiProvider: 'gemini',
    aiApiKey: '',
    aiEndpoint: '',
    aiModel: 'gemini-1.5-flash'
  };

  if (!fs.existsSync(SETTINGS_PATH)) {
    return defaults;
  }
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    
    let resolvedDir = defaultDir;
    if (parsed.localLogsDir && fs.existsSync(parsed.localLogsDir) && fs.statSync(parsed.localLogsDir).isDirectory()) {
      resolvedDir = parsed.localLogsDir;
    }
    
    return {
      localLogsDir: resolvedDir,
      aiEnabled: !!parsed.aiEnabled,
      aiProvider: parsed.aiProvider || 'gemini',
      aiApiKey: parsed.aiApiKey ? decrypt(parsed.aiApiKey) : '',
      aiEndpoint: parsed.aiEndpoint || '',
      aiModel: parsed.aiModel || ''
    };
  } catch (err) {
    console.error('Error reading settings file:', err);
    return defaults;
  }
}

function getSystemSettings() {
  const raw = getRawSystemSettings();
  return {
    localLogsDir: raw.localLogsDir,
    aiEnabled: raw.aiEnabled,
    aiProvider: raw.aiProvider,
    aiEndpoint: raw.aiEndpoint,
    aiModel: raw.aiModel,
    hasAiApiKey: !!raw.aiApiKey
  };
}

function saveSystemSettings(settings) {
  try {
    const raw = getRawSystemSettings();
    const merged = {
      localLogsDir: settings.localLogsDir !== undefined ? settings.localLogsDir : raw.localLogsDir,
      aiEnabled: settings.aiEnabled !== undefined ? settings.aiEnabled : raw.aiEnabled,
      aiProvider: settings.aiProvider !== undefined ? settings.aiProvider : raw.aiProvider,
      aiEndpoint: settings.aiEndpoint !== undefined ? settings.aiEndpoint : raw.aiEndpoint,
      aiModel: settings.aiModel !== undefined ? settings.aiModel : raw.aiModel,
    };

    let encryptedKey = raw.aiApiKey ? encrypt(raw.aiApiKey) : '';
    if (settings.aiApiKey !== undefined) {
      if (settings.aiApiKey === '') {
        encryptedKey = '';
      } else if (settings.aiApiKey !== '******') {
        encryptedKey = encrypt(settings.aiApiKey);
      }
    }
    merged.aiApiKey = encryptedKey;

    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    console.error('Error saving settings file:', err);
    return { ok: false, error: err.message || String(err) };
  }
}

let LOGS_DIR = getRawSystemSettings().localLogsDir;

function getSshConnections() {
  if (!fs.existsSync(SSH_CONFIG_PATH)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(SSH_CONFIG_PATH, 'utf8');
    const connections = JSON.parse(raw);
    return connections.map(conn => ({
      ...conn,
      password: conn.password ? decrypt(conn.password) : '',
      privateKeyContent: conn.privateKeyContent ? decrypt(conn.privateKeyContent) : '',
      sudoPassword: conn.sudoPassword ? decrypt(conn.sudoPassword) : ''
    }));
  } catch (err) {
    console.error('Error reading SSH connections file:', err);
    return [];
  }
}

function saveSshConnections(connections) {
  try {
    const encryptedConnections = connections.map(conn => ({
      ...conn,
      password: conn.password ? encrypt(conn.password) : '',
      privateKeyContent: conn.privateKeyContent ? encrypt(conn.privateKeyContent) : '',
      sudoPassword: conn.sudoPassword ? encrypt(conn.sudoPassword) : ''
    }));
    fs.writeFileSync(SSH_CONFIG_PATH, JSON.stringify(encryptedConnections, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    console.error('Error saving SSH connections file:', err);
    return { ok: false, error: err.message || String(err) };
  }
}

function testSshConnection(config) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    // Outer watchdog: even if the remote host never emits 'ready' or
    // 'error' (flapping network, silent socket close), the promise
    // will resolve with a clear error after readyTimeout + 2s grace.
    const readyTimeout = parseInt(config.readyTimeout, 10) || 7000;
    const watchdog = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { conn.end(); } catch (e) { /* already closed */ }
      reject(new Error(`SSH connection timeout after ${readyTimeout + 2000}ms (no 'ready' or 'error' from remote)`));
    }, readyTimeout + 2000);

    const finishResolve = (val) => { if (!settled) { settled = true; clearTimeout(watchdog); conn.end(); resolve(val); } };
    const finishReject  = (err) => { if (!settled) { settled = true; clearTimeout(watchdog); try { conn.end(); } catch (e) {} reject(err); } };

    conn.on('ready', () => finishResolve(true))
        .on('error', finishReject)
        .on('close', () => {
          // If we never reached 'ready' and the socket just closed, treat
          // it as a connection failure so the caller doesn't hang.
          finishReject(new Error('SSH connection closed before reaching ready state'));
        })
        .connect({
          host: config.host,
          port: parseInt(config.port, 10) || 22,
          username: config.username,
          password: config.password || undefined,
          privateKey: config.privateKeyContent ? config.privateKeyContent : (config.privateKeyPath ? fs.readFileSync(config.privateKeyPath) : undefined),
          readyTimeout: readyTimeout
        });
  });
}

async function getSshFiles(config) {
  return new Promise((resolve) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) {
          conn.end();
          console.error(`SFTP error on ${config.name}:`, err);
          return resolve([]);
        }
        const remoteDir = config.logDir || '.';
        sftp.readdir(remoteDir, (err, list) => {
          conn.end();
          if (err) {
            console.error(`Readdir error on ${config.name} for folder ${remoteDir}:`, err);
            return resolve([]);
          }
          const files = list
            .filter(item => {
              const isDir = item.attrs.isDirectory();
              const ext = path.extname(item.filename).toLowerCase();
              return !isDir && (ext === '.log' || ext === '.txt');
            })
            .map(item => ({
              name: item.filename,
              sizeBytes: item.attrs.size,
              modifiedAt: new Date(item.attrs.mtime * 1000).toISOString(),
              createdAt: new Date(item.attrs.atime * 1000).toISOString(),
              origin: config.id,
              originName: config.name
            }));
          resolve(files);
        });
      });
    }).on('error', (err) => {
      console.error(`SSH Connection error on ${config.name}:`, err);
      resolve([]);
    }).connect({
      host: config.host,
      port: parseInt(config.port, 10) || 22,
      username: config.username,
      password: config.password || undefined,
      privateKey: config.privateKeyContent ? config.privateKeyContent : (config.privateKeyPath ? fs.readFileSync(config.privateKeyPath) : undefined),
      readyTimeout: 7000
    });
  });
}

/**
 * Runs `chmod 777 <remoteFilePath>` on a remote SSH server using an exec channel.
 * If the configured SSH user is not the file owner, escalates via `sudo -S` and
 * pipes the saved sudo password through stdin.
 * Resolves { ok: boolean, mode: 'plain'|'sudo', stderr?: string }. Never throws.
 */
function fixRemotePermissions(config, remoteFilePath, opts = {}) {
  const sudoPass = opts.sudoPassword || config.sudoPassword;
  return new Promise((resolve) => {
    const conn = new Client();
    let settled = false;
    // Outer watchdog: caps total wait at readyTimeout + 30s (covers both
    // plain chmod and the sudo escalation). Without this, a flapping
    // remote host can hang the promise forever — the original code only
    // listened to 'ready' and 'error', so a silent socket close left
    // done() never called.
    const watchdog = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { conn.end(); } catch (e) { /* already closed */ }
      console.warn(`[fix-perm] outer watchdog fired on ${config.name} (silent timeout)`);
      resolve({ ok: false, mode: 'plain', stderr: 'SSH connection timeout (no response from remote)' });
    }, 30000);
    const done = (result) => { if (!settled) { settled = true; clearTimeout(watchdog); try { conn.end(); } catch (e) {} resolve(result); } };

    const escaped = remoteFilePath.replace(/'/g, "'\\''");

    conn.on('ready', () => {
      // First try plain chmod (works if user already owns/can write the file).
      conn.exec(`chmod 777 '${escaped}'; echo "__CHMOD_EXIT__:$?"`, (err, stream) => {
        if (err) { conn.end(); return done({ ok: false, mode: 'plain', stderr: err.message }); }

        let stdout = '';
        let stderr = '';
        stream.on('close', () => { /* noop, handled per-data */ });
        stream.on('data', (d) => { stdout += d.toString(); });
        stream.stderr.on('data', (d) => { stderr += d.toString(); });
        stream.on('close', () => {
          // ssh2 exec emits 'close' twice (after exit and after channel close). We attach
          // our logic to the actual 'exit' event below instead.
        });

        stream.on('exit', async (code) => {
          const match = /__CHMOD_EXIT__:(\d+)/.exec(stdout);
          const exitCode = match ? parseInt(match[1], 10) : code;
          if (exitCode === 0) {
            conn.end();
            console.log(`[fix-perm] chmod 777 OK on ${config.name} -> ${remoteFilePath}`);
            return done({ ok: true, mode: 'plain' });
          }

          // Plain chmod failed. Try sudo if we have a password saved.
          if (!sudoPass) {
            conn.end();
            console.warn(`[fix-perm] chmod denied on ${config.name} (no sudo password configured)`);
            return done({ ok: false, mode: 'plain', stderr: stderr.trim() || 'chmod denied (no sudo configured)' });
          }

          console.log(`[fix-perm] chmod denied on ${config.name}, escalating with sudo...`);
          conn.exec(`sudo -S chmod 777 '${escaped}'; echo "__SUDO_EXIT__:$?"`, (sudoErr, sudoStream) => {
            if (sudoErr) { conn.end(); return done({ ok: false, mode: 'sudo', stderr: sudoErr.message }); }

            let sudoStdout = '';
            let sudoStderr = '';
            sudoStream.on('data', (d) => { sudoStdout += d.toString(); });
            sudoStream.stderr.on('data', (d) => { sudoStderr += d.toString(); });
            // Push the password as soon as the channel is up; sudo reads from stdin.
            sudoStream.write(sudoPass + '\n');

            sudoStream.on('exit', (sudoCode) => {
              const m = /__SUDO_EXIT__:(\d+)/.exec(sudoStdout);
              const sCode = m ? parseInt(m[1], 10) : sudoCode;
              conn.end();
              if (sCode === 0) {
                console.log(`[fix-perm] sudo chmod 777 OK on ${config.name} -> ${remoteFilePath}`);
                return done({ ok: true, mode: 'sudo' });
              }
              console.warn(`[fix-perm] sudo chmod failed on ${config.name} (exit ${sCode}): ${sudoStderr.trim()}`);
              done({ ok: false, mode: 'sudo', stderr: sudoStderr.trim() || `sudo exit ${sCode}` });
            });
          });
        });
      });
    }).on('error', (err) => {
      console.warn(`[fix-perm] SSH error on ${config.name}: ${err.message}`);
      done({ ok: false, mode: 'plain', stderr: err.message });
    }).on('close', () => {
      // If the socket closes before 'ready' (e.g. remote host killed
      // the connection, TCP RST), resolve with a clear error instead
      // of leaving the promise hanging until the outer watchdog fires.
      done({ ok: false, mode: 'plain', stderr: 'SSH connection closed before ready' });
    }).connect({
      host: config.host,
      port: parseInt(config.port, 10) || 22,
      username: config.username,
      password: config.password || undefined,
      privateKey: config.privateKeyContent ? config.privateKeyContent : (config.privateKeyPath ? fs.readFileSync(config.privateKeyPath) : undefined),
      readyTimeout: 10000
    });
  });
}

/**
 * Builds a safe remote file path from a `logDir` and `filename`, defending
 * against path traversal attacks.
 *
 * Why this is needed: the existing per-endpoint check only validates
 * `filename` (rejects "/", "\", ".."). If a user (or a misconfigured
 * saved connection) sets `logDir` to e.g. "/etc", a filename like
 * "passwd" produces "/etc/passwd" — leaking arbitrary files.
 *
 * Rules enforced:
 *   1. `filename` must not contain "/", "\", or "..".
 *   2. `logDir` (when set and not ".") must be an absolute POSIX path.
 *   3. `logDir` must not contain ".." segments.
 *   4. The resolved `logDir + "/" + filename` must still start with the
 *      normalized `logDir` (the join didn't escape).
 *
 * Returns the safe remote path, or null if the input is unsafe.
 */
function buildSafeRemotePath(logDir, filename) {
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return null;
  }
  // Filename must look like a log file: only safe chars + a recognized
  // extension. LogScope is a log viewer, so this is a reasonable
  // whitelist that still allows patterns like "app.2026-01-15.log" or
  // "middleware-error_log.txt". Rejecting "passwd" (no extension) and
  // "/etc/passwd"-style attacks is exactly the goal.
  if (!/^[A-Za-z0-9._-]+$/.test(filename)) {
    return null;
  }
  if (!/\.(log|txt|out|err)$/i.test(filename)) {
    return null;
  }
  if (!logDir || logDir === '.') {
    return filename;
  }
  if (!path.posix.isAbsolute(logDir)) {
    return null;
  }
  if (logDir.split('/').includes('..')) {
    return null;
  }
  const normalizedBase = path.posix.normalize(logDir).replace(/\/+$/, '');
  const candidate = path.posix.normalize(`${normalizedBase}/${filename}`);
  if (candidate !== normalizedBase && !candidate.startsWith(normalizedBase + '/')) {
    return null;
  }
  return candidate;
}

/**
 * POST /api/ssh-fix-perm
 * Body: { filename, origin }
 * Runs chmod 777 on the remote file (with sudo fallback if a sudo password is saved
 * for the connection). Returns the result so the UI can show a toast.
 */
app.post('/api/ssh-fix-perm', express.json(), async (req, res) => {
  const { filename, origin } = req.body || {};
  if (!filename || !origin || origin === 'local') {
    return res.status(400).json({ ok: false, error: 'filename and a non-local origin are required' });
  }

  const connections = getSshConnections();
  const config = connections.find(c => c.id === origin);
  if (!config) return res.status(404).json({ ok: false, error: 'SSH connection not found' });

  const remoteFilePath = buildSafeRemotePath(config.logDir, filename);
  if (!remoteFilePath) {
    return res.status(400).json({ ok: false, error: 'Invalid filename or logDir (path traversal rejected)' });
  }

  const result = await fixRemotePermissions(config, remoteFilePath);
  res.json({ ...result, remoteFilePath, host: config.name });
});

// Serve static assets from public/ folder
app.use(express.static(path.join(__dirname, 'public')));

/**
 * API GET /api/files
 * Lists all log (.log) and text (.txt) files inside LOGS_DIR (local) and SSH directories.
 */
app.get('/api/files', async (req, res) => {
  try {
    const files = await fs.promises.readdir(LOGS_DIR);
    const logFiles = [];

    for (const file of files) {
      const filePath = path.join(LOGS_DIR, file);
      try {
        const stats = await fs.promises.stat(filePath);
        if (stats.isFile()) {
          const ext = path.extname(file).toLowerCase();
          if (ext === '.log' || ext === '.txt') {
            logFiles.push({
              name: file,
              sizeBytes: stats.size,
              modifiedAt: stats.mtime.toISOString(),
              createdAt: stats.birthtime.toISOString(),
              origin: 'local',
              originName: 'Local'
            });
          }
        }
      } catch (e) {
        // Skip unreadable files
      }
    }

    // Load SSH connections and fetch their files
    const connections = getSshConnections();
    const sshFilesPromises = connections.map(conn => getSshFiles(conn));
    const sshFilesArrays = await Promise.all(sshFilesPromises);
    
    const allFiles = [...logFiles];
    for (const arr of sshFilesArrays) {
      allFiles.push(...arr);
    }

    // Sort all files by modified time descending (most recent first)
    allFiles.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

    res.json(allFiles);
  } catch (error) {
    console.error('Error reading logs directory:', error);
    res.status(500).json({ error: 'Failed to read logs directory' });
  }
});

/**
 * API GET /api/files/:filename
 * Serves the full content of a specific log file (local or remote SSH).
 */
app.get('/api/files/:filename', async (req, res) => {
  const filename = req.params.filename;
  const origin = req.query.origin || 'local';

  // Security check: Prevent path traversal (no "/", "\", or "..")
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  if (origin === 'local') {
    const filePath = path.join(LOGS_DIR, filename);
    try {
      const stats = await fs.promises.stat(filePath);
      if (!stats.isFile()) {
        return res.status(404).json({ error: 'File not found' });
      }
      const ext = path.extname(filename).toLowerCase();
      if (ext !== '.log' && ext !== '.txt') {
        return res.status(400).json({ error: 'Only .log and .txt files can be read' });
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      const readStream = fs.createReadStream(filePath, 'utf8');
      readStream.pipe(res);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({ error: 'File not found' });
      }
      console.error(`Error reading file ${filename}:`, error);
      res.status(500).json({ error: 'Failed to read file' });
    }
  } else {
    // Read from remote SSH
    const connections = getSshConnections();
    const config = connections.find(c => c.id === origin);
    if (!config) {
      return res.status(404).json({ error: 'SSH Connection configuration not found' });
    }

    const remoteFilePath = buildSafeRemotePath(config.logDir, filename);
    if (!remoteFilePath) {
      return res.status(400).json({ error: 'Invalid filename or logDir (path traversal rejected)' });
    }
    let permFixAttempted = false;

    const openReadStream = () => {
      const conn = new Client();
      conn.on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            console.error(`SFTP error on ${config.name} during file read:`, err);
            if (!res.headersSent) {
              return res.status(500).json({ error: 'Failed to establish SFTP session' });
            }
            return;
          }

          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          const stream = sftp.createReadStream(remoteFilePath, { encoding: 'utf8' });

          stream.on('error', async (streamErr) => {
            conn.end();
            console.error(`SFTP ReadStream error for file ${filename} on ${config.name}:`, streamErr);

            // SFTP error code 3 == PERMISSION_DENIED. Try to chmod 777 once and retry.
            const isPerm = streamErr && (streamErr.code === 3 || /Permission denied/i.test(streamErr.message || ''));
            if (isPerm && !permFixAttempted) {
              permFixAttempted = true;
              console.log(`[fix-perm] Permission denied on ${config.name}:${remoteFilePath}, attempting chmod 777...`);
              const fixResult = await fixRemotePermissions(config, remoteFilePath);
              if (fixResult.ok && !res.headersSent) {
                return openReadStream();
              }
            }

            if (!res.headersSent) {
              let msg;
              if (isPerm) {
                msg = config.sudoPassword
                  ? `Permission denied on ${config.name}:${remoteFilePath}. Auto sudo chmod failed - open the file in the explorer and click "Fix permissions" to retry.`
                  : `Permission denied on ${config.name}:${remoteFilePath}. Configure a sudo password for this server, or run 'sudo chmod 777 ${remoteFilePath}' manually.`;
              } else if (streamErr && streamErr.code === 2) {
                msg = `Remote file not found: ${remoteFilePath}`;
              } else {
                msg = 'Remote file not found or unreadable';
              }
              res.status(404).json({ error: msg, permDenied: !!isPerm, hasSudo: !!config.sudoPassword });
            }
          });

          stream.on('close', () => { conn.end(); });
          stream.pipe(res);
        });
      }).on('error', (err) => {
        console.error(`SSH connection error for file ${filename} on ${config.name}:`, err);
        if (!res.headersSent) {
          res.status(500).json({ error: `Connection failed: ${err.message}` });
        }
      }).connect({
        host: config.host,
        port: parseInt(config.port, 10) || 22,
        username: config.username,
        password: config.password || undefined,
        privateKey: config.privateKeyContent ? config.privateKeyContent : (config.privateKeyPath ? fs.readFileSync(config.privateKeyPath) : undefined),
        readyTimeout: 10000
      });
    };

    openReadStream();
  }
});

/**
 * API POST /api/webhook
 * Proxies webhook notifications to bypass browser CORS policies.
 */
app.post('/api/webhook', express.json(), async (req, res) => {
  const { webhookUrl, payload } = req.body;
  if (!webhookUrl) {
    return res.status(400).json({ error: 'Missing webhookUrl parameter' });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    const status = response.status;
    const text = await response.text();

    res.json({ success: response.ok, status, message: text });
  } catch (error) {
    console.error('Error forwarding webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * API GET /api/ssh-connections
 * Returns a list of all configured SSH connections (excluding sensitive passwords/keys).
 */
app.get('/api/ssh-connections', (req, res) => {
  const connections = getSshConnections();
  const safeConnections = connections.map(conn => ({
    id: conn.id,
    name: conn.name,
    host: conn.host,
    port: conn.port,
    username: conn.username,
    authType: conn.authType,
    logDir: conn.logDir,
    hasPassword: !!conn.password,
    hasPrivateKey: !!conn.privateKeyContent || !!conn.privateKeyPath,
    hasSudoPassword: !!conn.sudoPassword,
    privateKeyPath: conn.privateKeyPath
  }));
  res.json(safeConnections);
});

/**
 * API POST /api/ssh-connections
 * Adds or updates an SSH connection.
 */
app.post('/api/ssh-connections', express.json(), (req, res) => {
  const { id, name, host, port, username, authType, password, privateKeyContent, privateKeyPath, logDir, sudoPassword } = req.body;

  if (!name || !host || !username) {
    return res.status(400).json({ error: 'Name, Host, and Username are required' });
  }

  // Validate logDir early to prevent storing a misconfigured path that would
  // later be combined with arbitrary filenames (see buildSafeRemotePath).
  // Allow "." (home dir default) or absolute POSIX paths without ".." segments.
  const finalLogDir = logDir || '.';
  if (finalLogDir !== '.' && (
    !path.posix.isAbsolute(finalLogDir) ||
    finalLogDir.split('/').includes('..')
  )) {
    return res.status(400).json({ error: 'logDir must be "." or an absolute POSIX path without ".." segments' });
  }

  const connections = getSshConnections();
  
  const connectionData = {
    id: id || Date.now().toString(),
    name,
    host,
    port: parseInt(port, 10) || 22,
    username,
    authType: authType || 'password',
    logDir: finalLogDir,
    privateKeyPath: privateKeyPath || ''
  };

  if (password !== undefined) connectionData.password = password;
  if (privateKeyContent !== undefined) connectionData.privateKeyContent = privateKeyContent;
  if (sudoPassword !== undefined) connectionData.sudoPassword = sudoPassword;

  const existingIndex = connections.findIndex(c => c.id === connectionData.id);
  if (existingIndex > -1) {
    const existing = connections[existingIndex];
    if (password === undefined) connectionData.password = existing.password;
    if (privateKeyContent === undefined) connectionData.privateKeyContent = existing.privateKeyContent;
    if (sudoPassword === undefined) connectionData.sudoPassword = existing.sudoPassword;
    connections[existingIndex] = connectionData;
  } else {
    connections.push(connectionData);
  }

  const result = saveSshConnections(connections);
  if (!result.ok) {
    return res.status(500).json({ error: result.error });
  }
  res.json({ success: true, connection: connectionData });
});

/**
 * API DELETE /api/ssh-connections/:id
 * Deletes an SSH connection.
 */
app.delete('/api/ssh-connections/:id', (req, res) => {
  const { id } = req.params;
  const connections = getSshConnections();
  const filtered = connections.filter(c => c.id !== id);
  const result = saveSshConnections(filtered);
  if (!result.ok) {
    return res.status(500).json({ error: result.error });
  }
  res.json({ success: true });
});

/**
 * API POST /api/ssh-connections/test
 * Tests a proposed SSH connection configuration.
 */
app.post('/api/ssh-connections/test', express.json(), async (req, res) => {
  const config = req.body;
  if (!config.host || !config.username) {
    return res.status(400).json({ error: 'Host and Username are required' });
  }

  if (config.id && config.password === undefined && config.privateKeyContent === undefined) {
    const saved = getSshConnections().find(c => c.id === config.id);
    if (saved) {
      config.password = saved.password;
      config.privateKeyContent = saved.privateKeyContent;
      config.privateKeyPath = saved.privateKeyPath;
    }
  }

  try {
    await testSshConnection(config);
    res.json({ success: true, message: 'SSH Connection successful!' });
  } catch (error) {
    res.status(500).json({ error: `Connection failed: ${error.message}` });
  }
});

/**
 * API GET /api/settings
 * Returns the general settings (such as localLogsDir).
 */
app.get('/api/settings', (req, res) => {
  res.json(getSystemSettings());
});

/**
 * API POST /api/settings
 * Updates general settings and refreshes files watchers.
 */
app.post('/api/settings', express.json(), (req, res) => {
  const settings = req.body;
  
  if (settings.localLogsDir !== undefined) {
    const localLogsDir = settings.localLogsDir;
    // Validate directory exists and is a directory
    if (!fs.existsSync(localLogsDir)) {
      return res.status(400).json({ error: `Directory "${localLogsDir}" does not exist on server` });
    }

    let stats;
    try {
      stats = fs.statSync(localLogsDir);
    } catch (err) {
      return res.status(400).json({ error: `Error checking directory: ${err.message}` });
    }

    if (!stats.isDirectory()) {
      return res.status(400).json({ error: `Path "${localLogsDir}" is not a directory` });
    }

    // Update memory reference
    LOGS_DIR = path.resolve(localLogsDir);
  }

  // Save to config file
  const saveResult = saveSystemSettings(settings);
  if (!saveResult.ok) {
    return res.status(500).json({ error: saveResult.error });
  }

  if (settings.localLogsDir !== undefined) {
    console.log(`[Settings] Local logs directory updated to: ${LOGS_DIR}`);

    // Disconnect active WS folder watchers to trigger them to reconnect and see new logs folder files
    for (const client of wss.clients) {
      if (client.isFilesSocket && client.readyState === WebSocket.OPEN) {
        console.log('[Settings] Closing files WebSocket to trigger reconnection...');
        client.close(1000, 'Directory changed');
      }
    }
  }

  res.json({ success: true, settings: getSystemSettings() });
});

/**
 * Helper to call configured AI Provider (Gemini, Ollama, OpenAI-Compatible)
 * Supports streaming if onChunk callback is provided.
 */
async function callAiProvider(settings, prompt, onChunk) {
  const { aiProvider, aiApiKey, aiEndpoint, aiModel } = settings;

  if (aiProvider === 'gemini') {
    const key = aiApiKey;
    if (!key) throw new Error('API key de Gemini no configurada');
    const model = aiModel || 'gemini-1.5-flash';
    
    // Gemini supports streaming via different endpoint: streamGenerateContent
    const mode = onChunk ? 'streamGenerateContent' : 'generateContent';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:${mode}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error en API de Gemini (${response.status}): ${errorText}`);
    }

    if (onChunk) {
      const reader = response.body.getReader();
      let fullText = '';
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunkText = decoder.decode(value, { stream: true });
        
        // Gemini stream returns an array of objects
        try {
          // Gemini chunks are sometimes partial JSONs in the stream
          // For simplicity in this implementation, we'll try to find the text parts
          // A more robust implementation would buffer the JSON
          const matches = chunkText.match(/"text":\s*"([^"]+)"/g);
          if (matches) {
            for (const match of matches) {
              const text = match.replace(/"text":\s*"(.*)"/, '$1');
              // Unescape basic stuff
              const cleanText = text.replace(/\\n/g, '\n').replace(/\\"/g, '"');
              onChunk(cleanText);
              fullText += cleanText;
            }
          }
        } catch (e) {}
      }
      return fullText;
    } else {
      const data = await response.json();
      if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
        return data.candidates[0].content.parts[0].text;
      } else {
        throw new Error('Formato de respuesta inesperado de Gemini: ' + JSON.stringify(data));
      }
    }
  } else if (aiProvider === 'nvidia') {
    if (!aiEndpoint) throw new Error('Endpoint de NVIDIA NIM no configurado');
    const url = aiEndpoint.endsWith('/chat/completions') ? aiEndpoint : (aiEndpoint.endsWith('/') ? `${aiEndpoint}chat/completions` : `${aiEndpoint}/chat/completions`);
    const headers = { 
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (aiApiKey) {
      headers['Authorization'] = `Bearer ${aiApiKey}`;
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: aiModel || 'meta/llama-3.3-70b-instruct',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        top_p: 0.7,
        frequency_penalty: 0,
        presence_penalty: 0,
        max_tokens: 2048,
        stream: !!onChunk
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[NVIDIA Error] Status: ${response.status}, Body: ${errorText}`);
      let errorMessage = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail || errorJson.message || errorText;
      } catch (e) {}
      throw new Error(`NVIDIA NIM Error (${response.status}): ${errorMessage}`);
    }

    if (onChunk) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const cleanLine = line.replace(/^data: /, '').trim();
          if (!cleanLine || cleanLine === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(cleanLine);
            const content = parsed.choices[0]?.delta?.content || '';
            if (content) {
              onChunk(content);
              fullText += content;
            }
          } catch (e) {}
        }
      }
      return fullText;
    } else {
      const data = await response.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        return data.choices[0].message.content;
      } else {
        throw new Error('Formato de respuesta inesperado de NVIDIA: ' + JSON.stringify(data));
      }
    }
  } else if (aiProvider === 'custom-json' || aiProvider === 'openai-compatible') {
    if (!aiEndpoint) throw new Error('Endpoint de API no configurado');
    
    let url = aiEndpoint;
    if (!url.endsWith('/chat/completions') && !url.includes('generate')) {
      url = url.endsWith('/') ? `${url}chat/completions` : `${url}/chat/completions`;
    }

    const headers = { 
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    if (aiApiKey) {
      headers['Authorization'] = `Bearer ${aiApiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: aiModel || 'deepseek-chat',
        messages: [
          { role: 'system', content: 'Eres un asistente de diagnóstico técnico experto en sistemas distribuidos y microservicios. Responde siempre en español de forma concisa.' },
          { role: 'user', content: prompt }
        ],
        stream: !!onChunk,
        max_tokens: 2048,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI Error] Status: ${response.status}, Body: ${errorText}`);
      let errorMessage = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail || errorJson.message || errorText;
      } catch (e) {}
      throw new Error(`AI Provider Error (${response.status}): ${errorMessage}`);
    }

    if (onChunk) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const cleanLine = line.replace(/^data: /, '').trim();
          if (!cleanLine || cleanLine === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(cleanLine);
            // Support multiple formats (OpenAI, DeepSeek, etc.)
            const content = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || '';
            if (content) {
              onChunk(content);
              fullText += content;
            }
          } catch (e) {}
        }
      }
      return fullText;
    } else {
      const data = await response.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        return data.choices[0].message.content;
      } else if (data.choices && data.choices[0] && data.choices[0].text) {
        return data.choices[0].text;
      } else if (data.response) {
        return data.response;
      } else if (data.output && data.output.text) {
        return data.output.text;
      } else {
        throw new Error('No se pudo extraer el texto de la respuesta. Formato desconocido: ' + JSON.stringify(data));
      }
    }
  } else if (aiProvider === 'ollama') {
    if (!aiEndpoint) throw new Error('Endpoint de Ollama no configurado');
    const url = aiEndpoint.endsWith('/api/generate') ? aiEndpoint : (aiEndpoint.endsWith('/') ? `${aiEndpoint}api/generate` : `${aiEndpoint}/api/generate`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: aiModel || 'llama3',
        prompt: prompt,
        stream: !!onChunk
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error en Ollama (${response.status}): ${errorText}`);
    }

    if (onChunk) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.response) {
              onChunk(parsed.response);
              fullText += parsed.response;
            }
          } catch (e) {}
        }
      }
      return fullText;
    } else {
      const data = await response.json();
      if (data.response) {
        return data.response;
      } else {
        throw new Error('Formato de respuesta inesperado de Ollama: ' + JSON.stringify(data));
      }
    }
  } else {
    throw new Error(`Proveedor de IA no soportado: ${aiProvider}`);
  }
}

/**
 * API POST /api/settings/ai/test
 * Tests the connection to the configured AI provider.
 */
app.post('/api/settings/ai/test', express.json(), async (req, res) => {
  console.log('[AI Test] Received request for provider:', req.body.aiProvider);
  const testSettings = req.body;
  
  // Si la API key es la máscara, o no viene (undefined), recuperamos la guardada
  const savedSettings = getRawSystemSettings();
  if (testSettings.aiApiKey === '******' || !testSettings.aiApiKey) {
    testSettings.aiApiKey = savedSettings.aiApiKey;
  }
  
  if (!testSettings.aiApiKey) {
    console.error('[AI Test] No API Key provided or found');
    return res.status(400).json({ error: 'No se proporcionó una clave API y no hay ninguna guardada.' });
  }

  try {
    const testPrompt = "Responde solo 'OK'";
    const result = await callAiProvider(testSettings, testPrompt);
    console.log('[AI Test] Success:', result);
    res.json({ success: true, response: result.trim() });
  } catch (err) {
    console.error('[AI Test] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * API POST /api/ai-diagnose
 * Generates an AI-based technical diagnosis for a log entry.
 */
app.post('/api/ai-diagnose', express.json(), async (req, res) => {
  const logEntry = req.body;
  const settings = getRawSystemSettings();
  
  if (!settings.aiEnabled) {
    return res.status(400).json({ error: 'El Asistente de IA está desactivado en la configuración' });
  }

  // Limitar el tamaño del mensaje del log para evitar prompts excesivamente largos que ralentizan la IA
  const truncatedMessage = logEntry.message && logEntry.message.length > 5000 
    ? logEntry.message.substring(0, 5000) + '... [TRUNCADO POR TAMAÑO]' 
    : logEntry.message;

  const prompt = `Eres un asistente de diagnóstico técnico experto en sistemas distribuidos y microservicios.
Analiza el siguiente registro de log de error de manera profesional y estructurada. Proporciona una explicación clara de la falla, las causas probables, el impacto potencial en el sistema, y sugerencias o pasos detallados para corregirla.
Responde de forma clara y directa en formato Markdown estructurado en español.

DETALLES DEL LOG DE ERROR:
- ID de Log: ${logEntry.id || 'N/A'}
- Marca de tiempo: ${logEntry.timestamp || 'N/A'}
- Nivel: ${logEntry.level || 'N/A'}
- Servicio: ${logEntry.service || 'N/A'}
- Clase/Módulo: ${logEntry.className || 'N/A'}
- Hilo de Ejecución: ${logEntry.thread || 'N/A'}
- Mensaje de Log: ${truncatedMessage || 'N/A'}
- Observación/Nota del Analista: ${logEntry.annotation || 'Ninguna'}

Estructura tu diagnóstico bajo los siguientes títulos Markdown:
1. **Análisis de la Falla**
2. **Causas Probables**
3. **Impacto Estimado**
4. **Soluciones Recomendadas**`;

  console.log(`[AI Diagnose] Iniciando diagnóstico para log ${logEntry.id || 'unknown'}...`);
  const startTime = Date.now();

  // Enable streaming response
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  try {
    await callAiProvider(settings, prompt, (chunk) => {
      res.write(chunk);
    });
    const duration = Date.now() - startTime;
    console.log(`[AI Diagnose] Diagnóstico completado en ${duration}ms`);
    res.end();
  } catch (err) {
    console.error('[AI Diagnose] Error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`\n\n[ERROR: ${err.message}]`);
      res.end();
    }
  }
});

/**
 * Helper to execute HTTP requests (Request Replay Engine)
 */
function makeHttpRequest({ url: targetUrl, method, headers, body }) {
  return new Promise((resolve) => {
    const parsedUrl = url.parse(targetUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? require('https') : require('http');

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.path || '/',
      method: (method || 'GET').toUpperCase(),
      headers: headers || {}
    };

    const startTime = Date.now();

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          body: data,
          timeMs: Date.now() - startTime
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        status: 0,
        statusText: `Error: ${err.message}`,
        headers: {},
        body: '',
        timeMs: Date.now() - startTime
      });
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * API POST /api/replay
 * Forwards HTTP requests to avoid CORS block and returns status/headers/body.
 */
app.post('/api/replay', express.json(), async (req, res) => {
  const { url, method, headers, body } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }
  try {
    const result = await makeHttpRequest({ url, method, headers, body });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Helpers for Cross-File Global Search
 */
async function searchLocalFiles(query, isRegex) {
  const readline = require('readline');
  const files = await fs.promises.readdir(LOGS_DIR);
  const results = [];
  const regex = isRegex ? new RegExp(query, 'i') : null;
  const lowerQuery = query.toLowerCase();

  for (const file of files) {
    const filePath = path.join(LOGS_DIR, file);
    try {
      const stats = await fs.promises.stat(filePath);
      if (!stats.isFile()) continue;
      const ext = path.extname(file).toLowerCase();
      if (ext !== '.log' && ext !== '.txt') continue;

      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      let lineNum = 0;
      let count = 0;
      const snippets = [];

      for await (const line of rl) {
        lineNum++;
        const match = regex ? regex.test(line) : line.toLowerCase().includes(lowerQuery);
        if (match) {
          count++;
          if (snippets.length < 5) {
            snippets.push({ lineNum, text: line.trim() });
          }
        }
      }

      if (count > 0) {
        results.push({
          fileKey: `local::${file}`,
          fileName: file,
          originName: 'Local',
          count,
          snippets
        });
      }
    } catch (e) {
      console.error(`Error searching local file ${file}:`, e);
    }
  }
  return results;
}

async function searchSshFiles(config, query, isRegex) {
  const readline = require('readline');
  const regex = isRegex ? new RegExp(query, 'i') : null;
  const lowerQuery = query.toLowerCase();
  const results = [];

  return new Promise((resolve) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.sftp(async (err, sftp) => {
        if (err) {
          conn.end();
          return resolve([]);
        }
        const remoteDir = config.logDir || '.';
        sftp.readdir(remoteDir, async (err2, list) => {
          if (err2) {
            conn.end();
            return resolve([]);
          }
          
          const textFiles = list.filter(item => {
            const ext = path.extname(item.filename).toLowerCase();
            return (ext === '.log' || ext === '.txt') && !item.attrs.isDirectory();
          });

          for (const item of textFiles) {
            const remoteFilePath = path.join(remoteDir, item.filename);
            try {
              await new Promise((resolveFile) => {
                const sftpStream = sftp.createReadStream(remoteFilePath);
                const rl = readline.createInterface({
                  input: sftpStream,
                  crlfDelay: Infinity
                });

                let lineNum = 0;
                let count = 0;
                const snippets = [];

                rl.on('line', (line) => {
                  lineNum++;
                  const match = regex ? regex.test(line) : line.toLowerCase().includes(lowerQuery);
                  if (match) {
                    count++;
                    if (snippets.length < 5) {
                      snippets.push({ lineNum, text: line.trim() });
                    }
                  }
                });

                rl.on('close', () => {
                  if (count > 0) {
                    results.push({
                      fileKey: `${config.id}::${item.filename}`,
                      fileName: item.filename,
                      originName: config.name,
                      count,
                      snippets
                    });
                  }
                  resolveFile();
                });

                rl.on('error', () => {
                  resolveFile(); // Skip file on error
                });
              });
            } catch (e) {
              console.error(`SFTP search error on file ${item.filename}:`, e);
            }
          }
          conn.end();
          resolve(results);
        });
      });
    }).on('error', () => {
      resolve([]);
    }).connect({
      host: config.host,
      port: parseInt(config.port, 10) || 22,
      username: config.username,
      password: config.password || undefined,
      privateKey: config.privateKeyContent ? config.privateKeyContent : (config.privateKeyPath ? fs.readFileSync(config.privateKeyPath) : undefined),
      readyTimeout: 5000
    });
  });
}

/**
 * API POST /api/search-global
 * Searches all local and SSH log files for a query string or regex.
 */
app.post('/api/search-global', express.json(), async (req, res) => {
  const { query, isRegex } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'query is required' });
  }

  try {
    const localResults = await searchLocalFiles(query, isRegex);

    const connections = getSshConnections();
    const sshResultsPromises = connections.map(conn => searchSshFiles(conn, query, isRegex));
    const sshResultsArrays = await Promise.all(sshResultsPromises);

    const allResults = [...localResults];
    for (const arr of sshResultsArrays) {
      allResults.push(...arr);
    }

    res.json({ success: true, results: allResults });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback for SPA routing - serve index.html for any other requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Upgrade HTTP connection to WebSockets for path '/ws/tail' or '/ws/files'
server.on('upgrade', (request, socket, head) => {
  const pathname = url.parse(request.url).pathname;

  if (pathname === '/ws/tail' || pathname === '/ws/files') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// WebSocket connection handler
wss.on('connection', (ws, request) => {
  const parsedUrl = url.parse(request.url, true);
  const pathname = parsedUrl.pathname;

  if (pathname === '/ws/files') {
    ws.isFilesSocket = true;
    console.log('[WS-Files] Client connected for live directory updates.');

    const sendFilesList = async () => {
      try {
        const files = await fs.promises.readdir(LOGS_DIR);
        const logFiles = [];

        for (const file of files) {
          const filePath = path.join(LOGS_DIR, file);
          try {
            const stats = await fs.promises.stat(filePath);
            if (stats.isFile()) {
              const ext = path.extname(file).toLowerCase();
              if (ext === '.log' || ext === '.txt') {
                logFiles.push({
                  name: file,
                  sizeBytes: stats.size,
                  modifiedAt: stats.mtime.toISOString(),
                  createdAt: stats.birthtime.toISOString(),
                  origin: 'local',
                  originName: 'Local'
                });
              }
            }
          } catch (e) {}
        }

        // Load SSH connections and fetch their files
        const connections = getSshConnections();
        const sshFilesPromises = connections.map(conn => getSshFiles(conn));
        const sshFilesArrays = await Promise.all(sshFilesPromises);
        
        const allFiles = [...logFiles];
        for (const arr of sshFilesArrays) {
          allFiles.push(...arr);
        }

        // Sort all files by modified time descending (most recent first)
        allFiles.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

        ws.send(JSON.stringify({ type: 'files', data: allFiles }));
      } catch (error) {
        console.error('[WS-Files] Error reading logs directory:', error);
      }
    };

    // Send immediately on connection
    sendFilesList();

    // Watch LOGS_DIR for changes and push updates to the client
    let fileWatcherDebounce;
    let dirWatcher;
    try {
      dirWatcher = fs.watch(LOGS_DIR, (eventType) => {
        if (fileWatcherDebounce) clearTimeout(fileWatcherDebounce);
        fileWatcherDebounce = setTimeout(() => {
          console.log('[WS-Files] Logs directory changed, pushing updated list to client.');
          sendFilesList();
        }, 300);
      });
    } catch (err) {
      console.error('[WS-Files] Error starting directory watcher:', err);
    }

    ws.on('close', (code, reason) => {
      console.log(`[WS-Files] Client disconnected. Code: ${code}`);
      if (dirWatcher) {
        dirWatcher.close();
      }
      if (fileWatcherDebounce) clearTimeout(fileWatcherDebounce);
    });

  } else if (pathname === '/ws/tail') {
    const filename = parsedUrl.query.filename;
    const origin = parsedUrl.query.origin || 'local';

    console.log(`[WS] Client attempting to connect. Filename: ${filename}, Origin: ${origin}`);

    if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      console.log(`[WS] Connection rejected: Invalid filename "${filename}"`);
      ws.close(1008, 'Invalid or missing filename');
      return;
    }

    if (origin === 'local') {
      const filePath = path.join(LOGS_DIR, filename);
      if (!fs.existsSync(filePath)) {
        console.log(`[WS] Connection rejected: File not found at "${filePath}"`);
        ws.close(1009, 'File not found');
        return;
      }

      // Get current file size as starting position for tailing (seek point)
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch (err) {
        console.error(`[WS] Error accessing file ${filePath}:`, err);
        ws.close(1011, 'Error accessing file');
        return;
      }

      let position = stat.size;
      console.log(`[WS] Connected. Tailing local "${filename}" starting from byte ${position}.`);

      // Let's watch the file for changes
      let watcher;
      try {
        watcher = fs.watch(filePath, (eventType) => {
          if (eventType === 'change') {
            try {
              const currentStat = fs.statSync(filePath);
              console.log(`[WS] File change detected on "${filename}". Size changed from ${position} to ${currentStat.size}.`);
              if (currentStat.size < position) {
                console.log(`[WS] File was truncated or recreated. Resetting position to 0.`);
                position = 0;
              }
              if (currentStat.size > position) {
                const stream = fs.createReadStream(filePath, {
                  start: position,
                  end: currentStat.size - 1,
                  encoding: 'utf8'
                });
                position = currentStat.size;

                let buffer = '';
                stream.on('data', (chunk) => {
                  buffer += chunk;
                  const lines = buffer.split(/\r?\n/);
                  // Save the last incomplete line to append to next chunk
                  buffer = lines.pop() || '';
                  
                  for (const line of lines) {
                    if (line) {
                      ws.send(JSON.stringify({ type: 'line', data: line }));
                    }
                  }
                });

                stream.on('end', () => {
                  if (buffer) {
                    ws.send(JSON.stringify({ type: 'line', data: buffer }));
                  }
                });
              }
            } catch (err) {
              console.error('[WS] Error during file change event:', err);
            }
          }
        });
      } catch (err) {
        console.error('[WS] Error starting fs.watch:', err);
        ws.close(1011, 'Watcher error');
        return;
      }

      ws.on('close', (code, reason) => {
        console.log(`[WS] Client disconnected. Code: ${code}`);
        if (watcher) {
          watcher.close();
        }
      });

      // Send a connected status back to the client
      ws.send(JSON.stringify({ type: 'status', status: 'connected', filename }));
    } else {
      // Tail from remote SSH server
      const connections = getSshConnections();
      const config = connections.find(c => c.id === origin);
      if (!config) {
        console.log(`[WS] Connection rejected: SSH configuration not found for ID "${origin}"`);
        ws.close(1011, 'SSH connection configuration not found');
        return;
      }

      console.log(`[WS] Connecting to SSH server "${config.name}" for tailing...`);
      const conn = new Client();
      let sshStream;

      conn.on('ready', () => {
const remoteFilePath = buildSafeRemotePath(config.logDir, filename);
      if (!remoteFilePath) {
        console.log(`[WS] Connection rejected: path traversal attempt on filename "${filename}" with logDir "${config.logDir}"`);
        ws.close(1008, 'Invalid filename or logDir');
        conn.end();
        return;
      }
        console.log(`[WS] SSH connection ready. Running tail on remote file "${remoteFilePath}"...`);

        // Execute tail -f on the remote server
        conn.exec(`tail -n 200 -f "${remoteFilePath}"`, (err, stream) => {
          if (err) {
            console.error(`[WS] SSH exec error for tail:`, err);
            ws.close(1011, `SSH exec error: ${err.message}`);
            conn.end();
            return;
          }

          sshStream = stream;
          ws.send(JSON.stringify({ type: 'status', status: 'connected', filename }));

          let buffer = '';
          stream.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (line) {
                ws.send(JSON.stringify({ type: 'line', data: line }));
              }
            }
          });

          stream.stderr.on('data', (errData) => {
            console.error(`[WS] Remote tail stderr:`, errData.toString('utf8'));
          });

          stream.on('close', (code) => {
            console.log(`[WS] SSH tail stream closed with code ${code}`);
            ws.close(1011, 'Remote stream closed');
            conn.end();
          });
        });
      }).on('error', (err) => {
        console.error(`[WS] SSH connection error to "${config.name}":`, err);
        ws.close(1011, `SSH connection failed: ${err.message}`);
      }).connect({
        host: config.host,
        port: parseInt(config.port, 10) || 22,
        username: config.username,
        password: config.password || undefined,
        privateKey: config.privateKeyContent ? config.privateKeyContent : (config.privateKeyPath ? fs.readFileSync(config.privateKeyPath) : undefined),
        readyTimeout: 10000
      });

      ws.on('close', (code, reason) => {
        console.log(`[WS] Client disconnected. Closing remote SSH tail connection. Code: ${code}`);
        if (sshStream) {
          sshStream.destroy();
        }
        conn.end();
      });
    }
  }
});

server.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});

