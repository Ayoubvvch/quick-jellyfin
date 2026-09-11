const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { spawn, exec, execSync } = require('child_process');
const si = require('systeminformation');

const APP_DIR = process.env.APP_DIR || __dirname;
const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(APP_DIR, 'media');
const DATA_DIR = process.env.DATA_DIR || APP_DIR;
fs.ensureDirSync(DATA_DIR);

const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const MOVIES_DIR = path.join(MEDIA_ROOT, 'movies');
const SHOWS_DIR = path.join(MEDIA_ROOT, 'shows');
const ANIME_DIR = path.join(MEDIA_ROOT, 'anime');

fs.ensureDirSync(MOVIES_DIR);
fs.ensureDirSync(SHOWS_DIR);
fs.ensureDirSync(ANIME_DIR);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(APP_DIR, 'public')));

let settings = { maxConcurrentDownloads: 2 };
if (fs.existsSync(SETTINGS_FILE)) {
  try {
    settings = fs.readJsonSync(SETTINGS_FILE);
  } catch (e) {}
}

function saveSettings() {
  try {
    fs.writeJsonSync(SETTINGS_FILE, settings, { spaces: 2 });
  } catch (e) {}
}

let tasks = [];
if (fs.existsSync(TASKS_FILE)) {
  try {
    tasks = fs.readJsonSync(TASKS_FILE);
    tasks.forEach(t => {
      if (t.status === 'downloading' || t.status === 'extracting') {
        t.status = 'queued';
      }
    });
  } catch (e) {
    tasks = [];
  }
}

function saveTasks() {
  try {
    fs.writeJsonSync(TASKS_FILE, tasks, { spaces: 2 });
  } catch (e) {
    console.error('Error saving tasks:', e);
  }
}

const activeProcesses = new Map();

function resolveMediaFire(url) {
  return new Promise((resolve) => {
    if (!url.includes('mediafire.com')) return resolve(url);
    const resolverScript = path.join(APP_DIR, 'mediafire-resolver.py');
    exec(`python3 "${resolverScript}" "${url}"`, (err, stdout) => {
      if (err || !stdout.trim()) {
        console.warn('MediaFire resolution failed, using original URL');
        resolve(url);
      } else {
        const resolved = stdout.trim();
        console.log(`MediaFire link resolved: ${resolved}`);
        resolve(resolved);
      }
    });
  });
}

function extractArchive(filePath, targetDir) {
  return new Promise((resolve) => {
    const ext = path.extname(filePath).toLowerCase();
    let cmd = '';
    if (ext === '.zip') {
      cmd = `unzip -o "${filePath}" -d "${targetDir}" && rm -f "${filePath}"`;
    } else if (ext === '.rar') {
      cmd = `unrar x -o+ "${filePath}" "${targetDir}/" && rm -f "${filePath}"`;
    } else if (ext === '.7z') {
      cmd = `7z x "${filePath}" -o"${targetDir}" -y && rm -f "${filePath}"`;
    } else {
      return resolve();
    }

    exec(cmd, (err) => {
      if (err) console.error(`Extraction failed for ${filePath}:`, err);
      else console.log(`Extracted archive: ${filePath}`);
      resolve();
    });
  });
}

function cleanBadFiles(targetDir) {
  try {
    const files = fs.readdirSync(targetDir);
    for (const f of files) {
      const full = path.join(targetDir, f);
      const stat = fs.statSync(full);
      if (stat.isFile()) {
        if (f.startsWith('download_repair') || f.endsWith('.html') || f.endsWith('.php')) {
          fs.unlinkSync(full);
          console.log(`Removed bad file: ${f}`);
        }
      }
    }
  } catch (e) {}
}

function processQueue() {
  const currentlyRunning = tasks.filter(t => t.status === 'downloading' || t.status === 'extracting');
  const maxLimit = settings.maxConcurrentDownloads || 2;
  
  if (currentlyRunning.length >= maxLimit) return;

  const pendingTasks = tasks.filter(t => t.status === 'queued');
  if (pendingTasks.length === 0) return;

  const slotsAvailable = maxLimit - currentlyRunning.length;
  const tasksToStart = pendingTasks.slice(0, slotsAvailable);

  for (const task of tasksToStart) {
    startTaskDownload(task);
  }
}

async function startTaskDownload(pendingTask) {
  pendingTask.status = 'downloading';
  pendingTask.speed = '0 KB/s';
  saveTasks();
  io.emit('task_update', pendingTask);

  console.log(`Starting download task ${pendingTask.id}: ${pendingTask.url}`);

  try {
    const finalUrl = await resolveMediaFire(pendingTask.url);
    const targetDir = pendingTask.targetDir;
    fs.ensureDirSync(targetDir);

    const beforeFiles = new Set(fs.readdirSync(targetDir));
    const maxConn = String(pendingTask.connectionsCount || 16);

    const ariaArgs = [
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      '-x', maxConn,
      '-s', maxConn,
      '-c',
      '--auto-file-renaming=true',
      '--summary-interval=1',
      '-d', targetDir,
      finalUrl
    ];

    const child = spawn('aria2c', ariaArgs);
    activeProcesses.set(pendingTask.id, child);

    child.stdout.on('data', (data) => {
      const str = data.toString();
      const match = str.match(/\[#\w+\s+([\d\.\w]+)\/([\d\.\w]+)\((\d+)%\)\s+.*DL:([\d\.\w]+)(?:\s+ETA:([\w\d]+))?\]/);
      if (match) {
        pendingTask.downloaded = match[1];
        pendingTask.total = match[2];
        pendingTask.progress = parseInt(match[3], 10);
        pendingTask.speed = match[4] + '/s';
        pendingTask.eta = match[5] || 'calculating...';
        io.emit('task_progress', {
          id: pendingTask.id,
          progress: pendingTask.progress,
          speed: pendingTask.speed,
          downloaded: pendingTask.downloaded,
          total: pendingTask.total,
          eta: pendingTask.eta
        });
      }
    });

    child.on('close', async (code) => {
      activeProcesses.delete(pendingTask.id);
      if (pendingTask.status === 'paused' || pendingTask.status === 'cancelled') {
        saveTasks();
        processQueue();
        return;
      }

      if (code === 0) {
        pendingTask.status = 'extracting';
        pendingTask.progress = 99;
        io.emit('task_update', pendingTask);

        const afterFiles = fs.readdirSync(targetDir);
        const newFiles = afterFiles.filter(f => !beforeFiles.has(f));

        for (const file of newFiles) {
          const fullPath = path.join(targetDir, file);
          if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
            await extractArchive(fullPath, targetDir);
          }
        }

        cleanBadFiles(targetDir);

        pendingTask.status = 'completed';
        pendingTask.progress = 100;
        pendingTask.completedAt = new Date().toISOString();
        console.log(`Task ${pendingTask.id} finished successfully.`);
      } else {
        pendingTask.status = 'failed';
        pendingTask.error = `aria2c exited with code ${code}`;
      }

      saveTasks();
      io.emit('task_update', pendingTask);
      processQueue();
    });

  } catch (err) {
    console.error(`Task ${pendingTask.id} error:`, err);
    activeProcesses.delete(pendingTask.id);
    pendingTask.status = 'failed';
    pendingTask.error = err.message;
    saveTasks();
    io.emit('task_update', pendingTask);
    processQueue();
  }
}

function getItemSize(fullPath, isDirectory) {
  if (!isDirectory) {
    try { return fs.statSync(fullPath).size; } catch (e) { return 0; }
  }
  try {
    const stdout = execSync(`du -sb "${fullPath}" 2>/dev/null`).toString();
    const parts = stdout.trim().split(/\s+/);
    return parseInt(parts[0], 10) || 0;
  } catch (e) {
    return 0;
  }
}

// REST APIs
app.get('/api/settings', (req, res) => {
  res.json(settings);
});

app.post('/api/settings', (req, res) => {
  if (req.body.maxConcurrentDownloads) {
    const val = parseInt(req.body.maxConcurrentDownloads, 10);
    if (val >= 1 && val <= 10) {
      settings.maxConcurrentDownloads = val;
      saveSettings();
      io.emit('settings_update', settings);
      processQueue();
    }
  }
  res.json({ success: true, settings });
});

app.get('/api/categories', (req, res) => {
  try {
    const getFolders = (dir) => {
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir)
        .filter(f => fs.statSync(path.join(dir, f)).isDirectory());
    };

    const shows = getFolders(SHOWS_DIR).map(show => ({
      name: show,
      seasons: getFolders(path.join(SHOWS_DIR, show))
    }));

    const anime = getFolders(ANIME_DIR).map(a => ({
      name: a,
      seasons: getFolders(path.join(ANIME_DIR, a))
    }));

    res.json({ movies: true, shows, anime });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/shows', (req, res) => {
  const { category, showName } = req.body;
  if (!showName || (category !== 'shows' && category !== 'anime')) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }
  const baseDir = category === 'shows' ? SHOWS_DIR : ANIME_DIR;
  const showPath = path.join(baseDir, showName.trim());
  fs.ensureDirSync(showPath);
  res.json({ success: true, path: showPath });
});

app.post('/api/seasons', (req, res) => {
  const { category, showName, seasonNumber } = req.body;
  if (!showName || !seasonNumber) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }
  const baseDir = category === 'shows' ? SHOWS_DIR : ANIME_DIR;
  const num = parseInt(seasonNumber, 10);
  const seasonFolder = `Season ${num < 10 ? '0' + num : num}`;
  const seasonPath = path.join(baseDir, showName.trim(), seasonFolder);
  fs.ensureDirSync(seasonPath);
  res.json({ success: true, path: seasonPath, seasonFolder });
});

app.post('/api/tasks', async (req, res) => {
  const { links, category, showName, seasonFolder, connectionsCount } = req.body;
  if (!links || !Array.isArray(links) || links.length === 0) {
    return res.status(400).json({ error: 'No links provided' });
  }

  let targetDir = MOVIES_DIR;
  if (category === 'shows' || category === 'anime') {
    const base = category === 'shows' ? SHOWS_DIR : ANIME_DIR;
    if (showName && seasonFolder) {
      targetDir = path.join(base, showName, seasonFolder);
    } else if (showName) {
      targetDir = path.join(base, showName);
    } else {
      targetDir = base;
    }
  }
  fs.ensureDirSync(targetDir);

  const numConn = parseInt(connectionsCount, 10) || 16;

  const createdTasks = [];
  for (const url of links) {
    if (!url || !url.trim()) continue;
    const task = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      url: url.trim(),
      targetDir,
      category,
      showName: showName || '',
      seasonFolder: seasonFolder || '',
      connectionsCount: numConn,
      status: 'queued',
      progress: 0,
      speed: '0 KB/s',
      downloaded: '0 MB',
      total: '0 MB',
      eta: '--:--',
      createdAt: new Date().toISOString()
    };
    tasks.push(task);
    createdTasks.push(task);
    io.emit('task_update', task);
  }

  saveTasks();
  processQueue();
  res.json({ success: true, tasks: createdTasks });
});

app.get('/api/tasks', (req, res) => {
  res.json(tasks);
});

app.post('/api/tasks/:id/pause', (req, res) => {
  const taskId = req.params.id;
  const task = tasks.find(t => t.id === taskId);
  if (task && (task.status === 'downloading' || task.status === 'queued')) {
    task.status = 'paused';
    task.speed = '0 KB/s';
    task.eta = 'Paused';
    if (activeProcesses.has(taskId)) {
      const proc = activeProcesses.get(taskId);
      try { proc.kill('SIGKILL'); } catch (e) {}
      activeProcesses.delete(taskId);
    }
    saveTasks();
    io.emit('task_update', task);
    processQueue();
  }
  res.json({ success: true });
});

app.post('/api/tasks/:id/resume', (req, res) => {
  const taskId = req.params.id;
  const task = tasks.find(t => t.id === taskId);
  if (task && task.status === 'paused') {
    task.status = 'queued';
    saveTasks();
    io.emit('task_update', task);
    processQueue();
  }
  res.json({ success: true });
});

app.delete('/api/tasks/:id', (req, res) => {
  const taskId = req.params.id;
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx !== -1) {
    const t = tasks[idx];
    t.status = 'cancelled';
    if (activeProcesses.has(taskId)) {
      const proc = activeProcesses.get(taskId);
      try { proc.kill('SIGKILL'); } catch (e) {}
      activeProcesses.delete(taskId);
    }
    tasks.splice(idx, 1);
    saveTasks();
    io.emit('task_deleted', taskId);
    processQueue();
  }
  res.json({ success: true });
});

app.post('/api/tasks/clear-completed', (req, res) => {
  tasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'failed' && t.status !== 'cancelled');
  saveTasks();
  io.emit('tasks_reload', tasks);
  res.json({ success: true });
});

// File Management APIs
app.get('/api/files', (req, res) => {
  const relPath = req.query.path || '';
  const targetPath = path.join(MEDIA_ROOT, relPath);

  if (!targetPath.startsWith(MEDIA_ROOT)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    if (!fs.existsSync(targetPath)) return res.json({ path: relPath, files: [], totalSize: 0 });
    
    const items = fs.readdirSync(targetPath).map(name => {
      const full = path.join(targetPath, name);
      const stat = fs.statSync(full);
      const isDirectory = stat.isDirectory();
      const size = getItemSize(full, isDirectory);

      return {
        name,
        isDirectory,
        size,
        modifiedAt: stat.mtime
      };
    });

    const totalSize = items.reduce((acc, i) => acc + i.size, 0);

    res.json({ path: relPath, files: items, totalSize });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/files', (req, res) => {
  const relPath = req.body.path;
  if (!relPath) return res.status(400).json({ error: 'Path required' });
  const targetPath = path.join(MEDIA_ROOT, relPath);

  if (!targetPath.startsWith(MEDIA_ROOT) || targetPath === MEDIA_ROOT) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    fs.removeSync(targetPath);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/files/delete-multiple', (req, res) => {
  const { paths } = req.body;
  if (!paths || !Array.isArray(paths) || paths.length === 0) {
    return res.status(400).json({ error: 'No paths provided' });
  }

  try {
    let deletedCount = 0;
    for (const relPath of paths) {
      const targetPath = path.join(MEDIA_ROOT, relPath);
      if (targetPath.startsWith(MEDIA_ROOT) && targetPath !== MEDIA_ROOT && fs.existsSync(targetPath)) {
        fs.removeSync(targetPath);
        deletedCount++;
      }
    }
    res.json({ success: true, deletedCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/files/move', async (req, res) => {
  const { sourcePath = '', items, targetPath = '' } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No items provided' });
  }

  const srcDir = path.join(MEDIA_ROOT, sourcePath);
  const destDir = path.join(MEDIA_ROOT, targetPath);

  if (!srcDir.startsWith(MEDIA_ROOT) || !destDir.startsWith(MEDIA_ROOT)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    fs.ensureDirSync(destDir);
    let movedCount = 0;
    const errors = [];

    for (const item of items) {
      const srcItem = path.join(srcDir, item);
      const destItem = path.join(destDir, item);

      if (!srcItem.startsWith(MEDIA_ROOT) || !destItem.startsWith(MEDIA_ROOT)) {
        errors.push(`Access denied for ${item}`);
        continue;
      }

      if (!fs.existsSync(srcItem)) {
        errors.push(`Item not found: ${item}`);
        continue;
      }

      if (srcItem === destItem) {
        continue;
      }

      if (destItem.startsWith(srcItem + path.sep)) {
        errors.push(`Cannot move folder into itself: ${item}`);
        continue;
      }

      await fs.move(srcItem, destItem, { overwrite: true });
      movedCount++;
    }

    res.json({ success: true, movedCount, errors });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/files/folder', (req, res) => {
  const { path: relPath = '', folderName } = req.body;
  if (!folderName || !folderName.trim()) {
    return res.status(400).json({ error: 'Folder name required' });
  }

  const cleanName = folderName.trim().replace(/[/\\?%*:|"<>]/g, '_');
  const targetDir = path.join(MEDIA_ROOT, relPath, cleanName);

  if (!targetDir.startsWith(MEDIA_ROOT)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    fs.ensureDirSync(targetDir);
    res.json({ success: true, folderName: cleanName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/system', async (req, res) => {
  try {
    const fsSize = await si.fsSize();
    const mem = await si.mem();
    const rootFs = fsSize.find(f => f.mount === '/') || fsSize[0];

    res.json({
      disk: {
        total: rootFs ? rootFs.size : 0,
        used: rootFs ? rootFs.used : 0,
        usePercent: rootFs ? rootFs.use : 0
      },
      ram: {
        total: mem.total,
        used: mem.active,
        usePercent: Math.round((mem.active / mem.total) * 100)
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

io.on('connection', (socket) => {
  socket.emit('init_tasks', tasks);
  socket.emit('init_settings', settings);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Jellyfin Downloader Web Suite running on http://0.0.0.0:${PORT}`);
  processQueue();
});
