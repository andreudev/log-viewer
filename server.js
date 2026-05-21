const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
