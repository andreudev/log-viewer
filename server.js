const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const url = require('url');

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// The directory where log files reside (one level up from this server file, or absolute path)
const LOGS_DIR = path.resolve(__dirname, '..');

// Serve static assets from public/ folder
app.use(express.static(path.join(__dirname, 'public')));

/**
 * API GET /api/files
 * Lists all log (.log) and text (.txt) files inside LOGS_DIR, excluding directories
 * and the log-viewer's own files.
 */
app.get('/api/files', async (req, res) => {
  try {
    const files = await fs.promises.readdir(LOGS_DIR);
    const logFiles = [];

    for (const file of files) {
      const filePath = path.join(LOGS_DIR, file);
      const stats = await fs.promises.stat(filePath);

      if (stats.isFile()) {
        const ext = path.extname(file).toLowerCase();
        if (ext === '.log' || ext === '.txt') {
          logFiles.push({
            name: file,
            sizeBytes: stats.size,
            modifiedAt: stats.mtime,
            createdAt: stats.birthtime
          });
        }
      }
    }

    // Sort files by modified time descending (most recent first)
    logFiles.sort((a, b) => b.modifiedAt - a.modifiedAt);

    res.json(logFiles);
  } catch (error) {
    console.error('Error reading logs directory:', error);
    res.status(500).json({ error: 'Failed to read logs directory' });
  }
});

/**
 * API GET /api/files/:filename
 * Serves the full content of a specific log file with directory traversal protection.
 */
app.get('/api/files/:filename', async (req, res) => {
  const filename = req.params.filename;

  // Security check: Prevent path traversal (no "/", "\", or "..")
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const filePath = path.join(LOGS_DIR, filename);

  try {
    // Check if file exists and is indeed a file
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) {
      return res.status(404).json({ error: 'File not found' });
    }

    const ext = path.extname(filename).toLowerCase();
    if (ext !== '.log' && ext !== '.txt') {
      return res.status(400).json({ error: 'Only .log and .txt files can be read' });
    }

    // Stream the file directly for high efficiency
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
    console.log('[WS-Files] Client connected for live directory updates.');

    const sendFilesList = async () => {
      try {
        const files = await fs.promises.readdir(LOGS_DIR);
        const logFiles = [];

        for (const file of files) {
          const filePath = path.join(LOGS_DIR, file);
          const stats = await fs.promises.stat(filePath);

          if (stats.isFile()) {
            const ext = path.extname(file).toLowerCase();
            if (ext === '.log' || ext === '.txt') {
              logFiles.push({
                name: file,
                sizeBytes: stats.size,
                modifiedAt: stats.mtime,
                createdAt: stats.birthtime
              });
            }
          }
        }

        // Sort files by modified time descending (most recent first)
        logFiles.sort((a, b) => b.modifiedAt - a.modifiedAt);
        ws.send(JSON.stringify({ type: 'files', data: logFiles }));
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

    console.log(`[WS] Client attempting to connect. Filename: ${filename}`);

    if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      console.log(`[WS] Connection rejected: Invalid filename "${filename}"`);
      ws.close(1008, 'Invalid or missing filename');
      return;
    }

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
    console.log(`[WS] Connected. Tailing "${filename}" starting from byte ${position}.`);

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
              const oldPos = position;
              position = currentStat.size;

              let buffer = '';
              stream.on('data', (chunk) => {
                buffer += chunk;
                const lines = buffer.split(/\r?\n/);
                // Save the last incomplete line to append to next chunk
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                  if (line) {
                    console.log(`[WS] Sending line to client: "${line.slice(0, 60)}..."`);
                    ws.send(JSON.stringify({ type: 'line', data: line }));
                  }
                }
              });

              stream.on('end', () => {
                if (buffer) {
                  console.log(`[WS] Sending final line buffer to client: "${buffer.slice(0, 60)}..."`);
                  ws.send(JSON.stringify({ type: 'line', data: buffer }));
                }
              });

              stream.on('error', (err) => {
                console.error('[WS] Error reading file stream during tail:', err);
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
      console.log(`[WS] Client disconnected. Code: ${code}, Reason: ${reason.toString() || 'No reason'}`);
      if (watcher) {
        watcher.close();
        console.log(`[WS] Closed file watcher for "${filename}".`);
      }
    });

    // Send a connected status back to the client
    ws.send(JSON.stringify({ type: 'status', status: 'connected', filename }));
  }
});

server.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});

