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
let ENCRYPTION_KEY;

if (fs.existsSync(MASTER_KEY_PATH)) {
  try {
    ENCRYPTION_KEY = fs.readFileSync(MASTER_KEY_PATH);
  } catch (err) {
    console.error('Failed to read master key file:', err);
    ENCRYPTION_KEY = crypto.randomBytes(32);
    fs.writeFileSync(MASTER_KEY_PATH, ENCRYPTION_KEY);
  }
} else {
  ENCRYPTION_KEY = crypto.randomBytes(32);
  try {
    fs.writeFileSync(MASTER_KEY_PATH, ENCRYPTION_KEY);
  } catch (err) {
    console.error('Failed to write master key file:', err);
  }
}

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
    return text;
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
  } catch (err) {
    console.error('Error saving settings file:', err);
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
      privateKeyContent: conn.privateKeyContent ? decrypt(conn.privateKeyContent) : ''
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
      privateKeyContent: conn.privateKeyContent ? encrypt(conn.privateKeyContent) : ''
    }));
    fs.writeFileSync(SSH_CONFIG_PATH, JSON.stringify(encryptedConnections, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving SSH connections file:', err);
  }
}

function testSshConnection(config) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.end();
      resolve(true);
    }).on('error', (err) => {
      reject(err);
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

    const conn = new Client();
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) {
          conn.end();
          console.error(`SFTP error on ${config.name} during file read:`, err);
          return res.status(500).json({ error: 'Failed to establish SFTP session' });
        }
        
        const remoteFilePath = (config.logDir && config.logDir !== '.') ? `${config.logDir}/${filename}` : filename;
        
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        const stream = sftp.createReadStream(remoteFilePath, { encoding: 'utf8' });
        
        stream.on('error', (streamErr) => {
          conn.end();
          console.error(`SFTP ReadStream error for file ${filename} on ${config.name}:`, streamErr);
          if (!res.headersSent) {
            res.status(404).json({ error: 'Remote file not found or unreadable' });
          }
        });

        stream.on('close', () => {
          conn.end();
        });

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
    privateKeyPath: conn.privateKeyPath
  }));
  res.json(safeConnections);
});

/**
 * API POST /api/ssh-connections
 * Adds or updates an SSH connection.
 */
app.post('/api/ssh-connections', express.json(), (req, res) => {
  const { id, name, host, port, username, authType, password, privateKeyContent, privateKeyPath, logDir } = req.body;
  
  if (!name || !host || !username) {
    return res.status(400).json({ error: 'Name, Host, and Username are required' });
  }

  const connections = getSshConnections();
  
  const connectionData = {
    id: id || Date.now().toString(),
    name,
    host,
    port: parseInt(port, 10) || 22,
    username,
    authType: authType || 'password',
    logDir: logDir || '.',
    privateKeyPath: privateKeyPath || ''
  };

  if (password !== undefined) connectionData.password = password;
  if (privateKeyContent !== undefined) connectionData.privateKeyContent = privateKeyContent;

  const existingIndex = connections.findIndex(c => c.id === connectionData.id);
  if (existingIndex > -1) {
    const existing = connections[existingIndex];
    if (password === undefined) connectionData.password = existing.password;
    if (privateKeyContent === undefined) connectionData.privateKeyContent = existing.privateKeyContent;
    connections[existingIndex] = connectionData;
  } else {
    connections.push(connectionData);
  }

  saveSshConnections(connections);
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
  saveSshConnections(filtered);
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
  saveSystemSettings(settings);

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
        const remoteFilePath = (config.logDir && config.logDir !== '.') ? `${config.logDir}/${filename}` : filename;
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

