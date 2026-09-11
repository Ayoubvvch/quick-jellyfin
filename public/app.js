document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // State
  let currentCategory = 'movies';
  let categoriesData = { movies: true, shows: [], anime: [] };
  let currentExplorerPath = '';
  let currentFilesData = [];
  let currentSortField = 'size'; // 'name', 'size', 'date'
  let currentSortOrder = 'desc'; // 'asc', 'desc'
  let allTasks = [];

  // Clipboard & Selection State
  let selectedItems = new Set(); // Set of item names in currentExplorerPath
  let cutClipboard = null; // { sourcePath: string, items: string[] }

  // DOM Elements
  const connectionStatus = document.getElementById('connectionStatus');
  const statusText = document.getElementById('statusText');
  const diskUsageText = document.getElementById('diskUsageText');
  const diskProgressFill = document.getElementById('diskProgressFill');
  const ramUsageText = document.getElementById('ramUsageText');
  const ramProgressFill = document.getElementById('ramProgressFill');

  const navBtns = document.querySelectorAll('.nav-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  const urlInput = document.getElementById('urlInput');
  const connectionsSelect = document.getElementById('connectionsSelect');
  const maxConcurrentSelect = document.getElementById('maxConcurrentSelect');
  const categoryCards = document.querySelectorAll('.category-card');
  const showSelectionPanel = document.getElementById('showSelectionPanel');
  const showSelect = document.getElementById('showSelect');
  const seasonSelect = document.getElementById('seasonSelect');
  const targetPathText = document.getElementById('targetPathText');
  const btnStartDownload = document.getElementById('btnStartDownload');

  const modalNewShow = document.getElementById('modalNewShow');
  const btnNewShow = document.getElementById('btnNewShow');
  const btnCloseShowModal = document.getElementById('btnCloseShowModal');
  const btnSaveNewShow = document.getElementById('btnSaveNewShow');
  const inputNewShowName = document.getElementById('inputNewShowName');

  const modalNewSeason = document.getElementById('modalNewSeason');
  const btnNewSeason = document.getElementById('btnNewSeason');
  const btnCloseSeasonModal = document.getElementById('btnCloseSeasonModal');
  const btnSaveNewSeason = document.getElementById('btnSaveNewSeason');
  const inputNewSeasonNum = document.getElementById('inputNewSeasonNum');

  const modalNewFolder = document.getElementById('modalNewFolder');
  const btnNewFolderModal = document.getElementById('btnNewFolderModal');
  const btnCloseFolderModal = document.getElementById('btnCloseFolderModal');
  const btnSaveNewFolder = document.getElementById('btnSaveNewFolder');
  const inputNewFolderName = document.getElementById('inputNewFolderName');

  const tasksQueueContainer = document.getElementById('tasksQueueContainer');
  const historyContainer = document.getElementById('historyContainer');
  const activeCountBadge = document.getElementById('activeCountBadge');
  const btnClearCompleted = document.getElementById('btnClearCompleted');

  const fileExplorerBody = document.getElementById('fileExplorerBody');
  const explorerBreadcrumb = document.getElementById('explorerBreadcrumb');
  const totalFolderSize = document.getElementById('totalFolderSize');
  const btnRefreshFiles = document.getElementById('btnRefreshFiles');

  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const batchActionBar = document.getElementById('batchActionBar');
  const selectedCountText = document.getElementById('selectedCountText');
  const btnCutSelection = document.getElementById('btnCutSelection');
  const btnDeleteSelection = document.getElementById('btnDeleteSelection');
  const btnClearSelection = document.getElementById('btnClearSelection');

  const clipboardBanner = document.getElementById('clipboardBanner');
  const clipboardCountText = document.getElementById('clipboardCountText');
  const btnPasteClipboard = document.getElementById('btnPasteClipboard');
  const btnCancelCut = document.getElementById('btnCancelCut');

  const thName = document.getElementById('thName');
  const thSize = document.getElementById('thSize');
  const thDate = document.getElementById('thDate');

  // Socket Events
  socket.on('connect', () => {
    connectionStatus.classList.remove('offline');
    statusText.textContent = 'Connected';
  });

  socket.on('disconnect', () => {
    connectionStatus.classList.add('offline');
    statusText.textContent = 'Disconnected';
  });

  socket.on('init_settings', (settings) => {
    if (settings && settings.maxConcurrentDownloads && maxConcurrentSelect) {
      maxConcurrentSelect.value = String(settings.maxConcurrentDownloads);
    }
  });

  socket.on('settings_update', (settings) => {
    if (settings && settings.maxConcurrentDownloads && maxConcurrentSelect) {
      maxConcurrentSelect.value = String(settings.maxConcurrentDownloads);
    }
  });

  socket.on('init_tasks', (tasks) => {
    allTasks = tasks;
    renderTasks();
  });

  socket.on('task_update', (task) => {
    const idx = allTasks.findIndex(t => t.id === task.id);
    if (idx !== -1) {
      allTasks[idx] = task;
    } else {
      allTasks.push(task);
    }
    renderTasks();
  });

  socket.on('task_progress', (data) => {
    const task = allTasks.find(t => t.id === data.id);
    if (task) {
      task.progress = data.progress;
      task.speed = data.speed;
      task.downloaded = data.downloaded;
      task.total = data.total;
      task.eta = data.eta;
      updateTaskCardDOM(task);
    }
  });

  socket.on('task_deleted', (taskId) => {
    allTasks = allTasks.filter(t => t.id !== taskId);
    renderTasks();
  });

  socket.on('tasks_reload', (tasks) => {
    allTasks = tasks;
    renderTasks();
  });

  // Max Concurrent Selector Change
  if (maxConcurrentSelect) {
    maxConcurrentSelect.addEventListener('change', () => {
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxConcurrentDownloads: maxConcurrentSelect.value })
      });
    });
  }

  // Navigation Tabs
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      document.getElementById(tabId).classList.add('active');

      if (tabId === 'media-explorer') {
        loadFiles(currentExplorerPath);
      }
    });
  });

  // Category Selection
  categoryCards.forEach(card => {
    card.addEventListener('click', () => {
      categoryCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      currentCategory = card.dataset.category;

      if (currentCategory === 'shows' || currentCategory === 'anime') {
        showSelectionPanel.classList.remove('hidden');
        populateShowsDropdown();
      } else {
        showSelectionPanel.classList.add('hidden');
      }
      updateTargetPathPreview();
    });
  });

  // Fetch Categories & Folders
  async function fetchCategories() {
    try {
      const res = await fetch('/api/categories');
      categoriesData = await res.json();
      if (currentCategory === 'shows' || currentCategory === 'anime') {
        populateShowsDropdown();
      }
    } catch (e) {
      console.error('Failed to load categories', e);
    }
  }

  function populateShowsDropdown() {
    showSelect.innerHTML = '<option value="">-- Select Show --</option>';
    seasonSelect.innerHTML = '<option value="">-- Select Season --</option>';

    const list = currentCategory === 'shows' ? categoriesData.shows : categoriesData.anime;
    if (list) {
      list.forEach(show => {
        const opt = document.createElement('option');
        opt.value = show.name;
        opt.textContent = show.name;
        showSelect.appendChild(opt);
      });
    }
  }

  showSelect.addEventListener('change', () => {
    const selectedShowName = showSelect.value;
    seasonSelect.innerHTML = '<option value="">-- Select Season --</option>';
    if (!selectedShowName) {
      updateTargetPathPreview();
      return;
    }

    const list = currentCategory === 'shows' ? categoriesData.shows : categoriesData.anime;
    const showObj = list.find(s => s.name === selectedShowName);
    if (showObj && showObj.seasons) {
      showObj.seasons.forEach(season => {
        const opt = document.createElement('option');
        opt.value = season;
        opt.textContent = season;
        seasonSelect.appendChild(opt);
      });
    }
    updateTargetPathPreview();
  });

  seasonSelect.addEventListener('change', () => {
    updateTargetPathPreview();
  });

  function updateTargetPathPreview() {
    let path = '/home/ubuntu/jellyfin/media/' + currentCategory;
    if (currentCategory === 'shows' || currentCategory === 'anime') {
      if (showSelect.value) {
        path += '/' + showSelect.value;
        if (seasonSelect.value) {
          path += '/' + seasonSelect.value;
        }
      }
    }
    targetPathText.textContent = path;
  }

  // Modals - New Show
  btnNewShow.addEventListener('click', () => {
    inputNewShowName.value = '';
    modalNewShow.classList.add('active');
    inputNewShowName.focus();
  });

  btnCloseShowModal.addEventListener('click', () => {
    modalNewShow.classList.remove('active');
  });

  btnSaveNewShow.addEventListener('click', async () => {
    const showName = inputNewShowName.value.trim();
    if (!showName) return alert('Please enter a show name');

    try {
      const res = await fetch('/api/shows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: currentCategory, showName })
      });
      if (res.ok) {
        modalNewShow.classList.remove('active');
        await fetchCategories();
        showSelect.value = showName;
        showSelect.dispatchEvent(new Event('change'));
      }
    } catch (e) {
      alert('Failed to create folder');
    }
  });

  // Modals - New Season
  btnNewSeason.addEventListener('click', () => {
    if (!showSelect.value) return alert('Please select a show first before adding a season');
    modalNewSeason.classList.add('active');
    inputNewSeasonNum.focus();
  });

  btnCloseSeasonModal.addEventListener('click', () => {
    modalNewSeason.classList.remove('active');
  });

  btnSaveNewSeason.addEventListener('click', async () => {
    const seasonNumber = inputNewSeasonNum.value;
    if (!seasonNumber) return alert('Please enter a season number');

    try {
      const res = await fetch('/api/seasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: currentCategory,
          showName: showSelect.value,
          seasonNumber
        })
      });
      const data = await res.json();
      if (res.ok) {
        modalNewSeason.classList.remove('active');
        await fetchCategories();
        showSelect.value = showSelect.value;
        showSelect.dispatchEvent(new Event('change'));
        seasonSelect.value = data.seasonFolder;
        updateTargetPathPreview();
      }
    } catch (e) {
      alert('Failed to create season');
    }
  });

  // Modals - New Folder in Explorer
  if (btnNewFolderModal) {
    btnNewFolderModal.addEventListener('click', () => {
      inputNewFolderName.value = '';
      modalNewFolder.classList.add('active');
      inputNewFolderName.focus();
    });
  }

  if (btnCloseFolderModal) {
    btnCloseFolderModal.addEventListener('click', () => {
      modalNewFolder.classList.remove('active');
    });
  }

  if (btnSaveNewFolder) {
    btnSaveNewFolder.addEventListener('click', async () => {
      const folderName = inputNewFolderName.value.trim();
      if (!folderName) return alert('Please enter a folder name');

      try {
        const res = await fetch('/api/files/folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: currentExplorerPath, folderName })
        });
        if (res.ok) {
          modalNewFolder.classList.remove('active');
          loadFiles(currentExplorerPath);
        } else {
          alert('Failed to create folder');
        }
      } catch (e) {
        alert('Network error while creating folder');
      }
    });
  }

  // Start Download
  btnStartDownload.addEventListener('click', async () => {
    const text = urlInput.value.trim();
    if (!text) return alert('Please enter at least one URL');

    const links = text.split(/\s+/).filter(l => l.length > 5);
    if (links.length === 0) return alert('Invalid URLs provided');

    const connectionsCount = connectionsSelect ? connectionsSelect.value : 16;

    btnStartDownload.disabled = true;
    btnStartDownload.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting Tasks...';

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          links,
          category: currentCategory,
          showName: showSelect.value,
          seasonFolder: seasonSelect.value,
          connectionsCount
        })
      });

      if (res.ok) {
        urlInput.value = '';
        document.querySelector('[data-tab="active-queue"]').click();
      } else {
        alert('Error adding download tasks');
      }
    } catch (e) {
      alert('Failed to connect to server');
    } finally {
      btnStartDownload.disabled = false;
      btnStartDownload.innerHTML = '<i class="fa-solid fa-bolt"></i> Start Download Now';
    }
  });

  // Render Tasks
  function renderTasks() {
    const activeTasks = allTasks.filter(t => t.status === 'queued' || t.status === 'downloading' || t.status === 'extracting' || t.status === 'paused');
    const historyTasks = allTasks.filter(t => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled');

    activeCountBadge.textContent = activeTasks.length;

    const activeTabIcon = document.getElementById('activeTabIcon');
    if (activeTabIcon) {
      if (activeTasks.some(t => t.status === 'downloading' || t.status === 'extracting')) {
        activeTabIcon.className = 'fa-solid fa-spinner fa-spin-pulse';
      } else {
        activeTabIcon.className = 'fa-solid fa-download';
      }
    }

    if (activeTasks.length === 0) {
      tasksQueueContainer.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-inbox"></i>
          <p>No active or queued downloads currently</p>
        </div>`;
    } else {
      tasksQueueContainer.innerHTML = '';
      activeTasks.forEach(task => {
        tasksQueueContainer.appendChild(createTaskCard(task));
      });
    }

    if (historyTasks.length === 0) {
      historyContainer.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-box-open"></i>
          <p>History is empty</p>
        </div>`;
    } else {
      historyContainer.innerHTML = '';
      historyTasks.forEach(task => {
        historyContainer.appendChild(createTaskCard(task));
      });
    }
  }

  function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.id = `card_${task.id}`;

    let statusClass = `status-${task.status}`;
    let statusLabel = task.status;
    if (task.status === 'queued') statusLabel = 'Queued';
    if (task.status === 'downloading') statusLabel = 'Downloading';
    if (task.status === 'extracting') statusLabel = 'Extracting Archive...';
    if (task.status === 'paused') statusLabel = 'Paused';
    if (task.status === 'completed') statusLabel = 'Completed';
    if (task.status === 'failed') statusLabel = 'Failed';
    if (task.status === 'cancelled') statusLabel = 'Cancelled';

    const connTag = task.connectionsCount ? `${task.connectionsCount}x` : '16x';

    let toggleBtnHtml = '';
    if (task.status === 'downloading' || task.status === 'queued') {
      toggleBtnHtml = `<button class="btn btn-secondary btn-sm btn-pause-task"><i class="fa-solid fa-pause"></i> Pause</button>`;
    } else if (task.status === 'paused') {
      toggleBtnHtml = `<button class="btn btn-primary btn-sm btn-resume-task"><i class="fa-solid fa-play"></i> Resume</button>`;
    }

    card.innerHTML = `
      <div class="task-header">
        <div>
          <div class="task-url">${escapeHtml(task.url)}</div>
          <div class="task-path"><i class="fa-solid fa-folder"></i> ${escapeHtml(task.targetDir)}</div>
        </div>
        <span class="status-badge ${statusClass}">${statusLabel}</span>
      </div>
      <div class="progress-bar-container">
        <div class="progress-bar-fill" style="width: ${task.progress}%"></div>
      </div>
      <div class="task-meta">
        <span><i class="fa-solid fa-percent"></i> <strong class="val-progress">${task.progress}%</strong></span>
        <span><i class="fa-solid fa-gauge-high"></i> <strong class="val-speed">${task.speed || '0 KB/s'}</strong></span>
        <span><i class="fa-solid fa-network-wired"></i> <strong>${connTag}</strong></span>
        <span><i class="fa-solid fa-download"></i> <strong class="val-downloaded">${task.downloaded || '0'} / ${task.total || '0'}</strong></span>
        <span><i class="fa-solid fa-hourglass-half"></i> <strong class="val-eta">${task.eta || '--:--'}</strong></span>
        <div style="margin-left:auto; display:flex; gap:6px;">
          ${toggleBtnHtml}
          <button class="btn btn-danger btn-sm btn-delete-task"><i class="fa-solid fa-xmark"></i> Delete</button>
        </div>
      </div>
    `;

    const pauseBtn = card.querySelector('.btn-pause-task');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        fetch(`/api/tasks/${task.id}/pause`, { method: 'POST' });
      });
    }

    const resumeBtn = card.querySelector('.btn-resume-task');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        fetch(`/api/tasks/${task.id}/resume`, { method: 'POST' });
      });
    }

    card.querySelector('.btn-delete-task').addEventListener('click', () => {
      fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
    });

    return card;
  }

  function updateTaskCardDOM(task) {
    const card = document.getElementById(`card_${task.id}`);
    if (!card) return;

    const fill = card.querySelector('.progress-bar-fill');
    if (fill) fill.style.width = task.progress + '%';

    const valProgress = card.querySelector('.val-progress');
    if (valProgress) valProgress.textContent = task.progress + '%';

    const valSpeed = card.querySelector('.val-speed');
    if (valSpeed) valSpeed.textContent = task.speed;

    const valDownloaded = card.querySelector('.val-downloaded');
    if (valDownloaded) valDownloaded.textContent = `${task.downloaded} / ${task.total}`;

    const valEta = card.querySelector('.val-eta');
    if (valEta) valEta.textContent = task.eta;
  }

  btnClearCompleted.addEventListener('click', () => {
    fetch('/api/tasks/clear-completed', { method: 'POST' });
  });

  // ==========================================
  // File Explorer & Storage Management
  // ==========================================
  async function loadFiles(pathStr) {
    currentExplorerPath = pathStr;
    selectedItems.clear();
    updateBatchActionsUI();
    updateClipboardUI();
    if (selectAllCheckbox) selectAllCheckbox.checked = false;

    fileExplorerBody.innerHTML = '<tr><td colspan="5" class="text-center"><i class="fa-solid fa-spinner fa-spin"></i> Calculating file and folder sizes...</td></tr>';
    updateBreadcrumbs(pathStr);

    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(pathStr)}`);
      const data = await res.json();
      currentFilesData = data.files || [];

      if (totalFolderSize) {
        totalFolderSize.textContent = formatBytes(data.totalSize || 0);
      }

      if (currentFilesData.length === 0) {
        fileExplorerBody.innerHTML = '<tr><td colspan="5" class="text-center">This folder is empty</td></tr>';
        return;
      }

      renderExplorerTable();
    } catch (e) {
      fileExplorerBody.innerHTML = '<tr><td colspan="5" class="text-center">Failed to load files</td></tr>';
    }
  }

  function renderExplorerTable() {
    fileExplorerBody.innerHTML = '';

    // Sort items
    const sorted = [...currentFilesData].sort((a, b) => {
      let valA = a[currentSortField];
      let valB = b[currentSortField];

      if (currentSortField === 'name') {
        return currentSortOrder === 'asc' 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      }

      if (currentSortField === 'date') {
        valA = new Date(a.modifiedAt).getTime();
        valB = new Date(b.modifiedAt).getTime();
      }

      return currentSortOrder === 'asc' ? valA - valB : valB - valA;
    });

    sorted.forEach(item => {
      const tr = document.createElement('tr');
      const icon = item.isDirectory ? 'fa-folder' : getFileIcon(item.name);
      const sizeStr = formatBytes(item.size);
      const dateStr = formatDateEn(item.modifiedAt);

      let pillClass = 'normal';
      if (item.size > 5 * 1024 * 1024 * 1024) pillClass = 'huge'; // > 5 GB
      else if (item.size > 1024 * 1024 * 1024) pillClass = 'large'; // > 1 GB

      const isCut = cutClipboard && cutClipboard.sourcePath === currentExplorerPath && cutClipboard.items.includes(item.name);
      if (isCut) {
        tr.classList.add('item-cut');
      }

      const isSelected = selectedItems.has(item.name);

      tr.innerHTML = `
        <td style="text-align: center;">
          <input type="checkbox" class="file-checkbox" data-name="${escapeHtml(item.name)}" ${isSelected ? 'checked' : ''}>
        </td>
        <td>
          <div class="file-name-cell">
            <i class="fa-solid ${icon}"></i>
            <span class="file-name-text">${escapeHtml(item.name)}</span>
          </div>
        </td>
        <td><span class="size-pill ${pillClass}">${sizeStr}</span></td>
        <td>${dateStr}</td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm btn-cut-single" title="Cut to move to another folder">
              <i class="fa-solid fa-scissors"></i> Cut
            </button>
            <button class="btn btn-danger btn-sm btn-delete-file" title="Delete permanently">
              <i class="fa-solid fa-trash"></i> Delete
            </button>
          </div>
        </td>
      `;

      // Checkbox listener
      const checkbox = tr.querySelector('.file-checkbox');
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        if (checkbox.checked) {
          selectedItems.add(item.name);
        } else {
          selectedItems.delete(item.name);
        }
        updateBatchActionsUI();
        updateSelectAllState();
      });

      // Folder click
      tr.querySelector('.file-name-cell').addEventListener('click', () => {
        if (item.isDirectory) {
          const nextPath = currentExplorerPath ? `${currentExplorerPath}/${item.name}` : item.name;
          loadFiles(nextPath);
        }
      });

      // Single Cut
      tr.querySelector('.btn-cut-single').addEventListener('click', (e) => {
        e.stopPropagation();
        cutClipboard = {
          sourcePath: currentExplorerPath,
          items: [item.name]
        };
        selectedItems.clear();
        updateBatchActionsUI();
        updateClipboardUI();
        renderExplorerTable();
      });

      // Single Delete
      tr.querySelector('.btn-delete-file').addEventListener('click', async (e) => {
        e.stopPropagation();
        const typeText = item.isDirectory ? 'folder' : 'file';
        if (confirm(`Are you sure you want to delete ${typeText} "${item.name}" (${sizeStr})?`)) {
          const deletePath = currentExplorerPath ? `${currentExplorerPath}/${item.name}` : item.name;
          await fetch('/api/files', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: deletePath })
          });
          loadFiles(currentExplorerPath);
        }
      });

      fileExplorerBody.appendChild(tr);
    });

    updateSelectAllState();
  }

  // Multi-Select & Batch Actions UI
  function updateBatchActionsUI() {
    const count = selectedItems.size;
    if (count > 0) {
      batchActionBar.classList.remove('hidden');
      selectedCountText.textContent = `${count} item(s) selected`;
    } else {
      batchActionBar.classList.add('hidden');
    }
  }

  function updateSelectAllState() {
    if (!selectAllCheckbox) return;
    if (currentFilesData.length === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else if (selectedItems.size === currentFilesData.length) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else if (selectedItems.size > 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
  }

  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', () => {
      if (selectAllCheckbox.checked) {
        currentFilesData.forEach(item => selectedItems.add(item.name));
      } else {
        selectedItems.clear();
      }
      renderExplorerTable();
      updateBatchActionsUI();
    });
  }

  if (btnClearSelection) {
    btnClearSelection.addEventListener('click', () => {
      selectedItems.clear();
      renderExplorerTable();
      updateBatchActionsUI();
    });
  }

  // Batch Cut
  if (btnCutSelection) {
    btnCutSelection.addEventListener('click', () => {
      if (selectedItems.size === 0) return;
      cutClipboard = {
        sourcePath: currentExplorerPath,
        items: Array.from(selectedItems)
      };
      selectedItems.clear();
      updateBatchActionsUI();
      updateClipboardUI();
      renderExplorerTable();
    });
  }

  // Batch Delete
  if (btnDeleteSelection) {
    btnDeleteSelection.addEventListener('click', async () => {
      const count = selectedItems.size;
      if (count === 0) return;
      if (!confirm(`Are you sure you want to permanently delete the ${count} selected item(s)?`)) return;

      const paths = Array.from(selectedItems).map(name => {
        return currentExplorerPath ? `${currentExplorerPath}/${name}` : name;
      });

      try {
        const res = await fetch('/api/files/delete-multiple', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths })
        });
        if (res.ok) {
          selectedItems.clear();
          loadFiles(currentExplorerPath);
        } else {
          alert('Failed to delete some items');
        }
      } catch (e) {
        alert('Network error while deleting items');
      }
    });
  }

  // Clipboard UI & Paste Action
  function updateClipboardUI() {
    if (cutClipboard && cutClipboard.items.length > 0) {
      clipboardBanner.classList.remove('hidden');
      const count = cutClipboard.items.length;
      const srcDisplay = cutClipboard.sourcePath ? `media/${cutClipboard.sourcePath}` : 'Root (media)';
      clipboardCountText.innerHTML = `<strong>${count}</strong> item(s) cut from <em>${escapeHtml(srcDisplay)}</em> ready to move`;
    } else {
      clipboardBanner.classList.add('hidden');
    }
  }

  if (btnCancelCut) {
    btnCancelCut.addEventListener('click', () => {
      cutClipboard = null;
      updateClipboardUI();
      renderExplorerTable();
    });
  }

  if (btnPasteClipboard) {
    btnPasteClipboard.addEventListener('click', async () => {
      if (!cutClipboard || cutClipboard.items.length === 0) return;

      const { sourcePath, items } = cutClipboard;
      const targetPath = currentExplorerPath;

      if (sourcePath === targetPath) {
        alert('Source and destination folders are the same.');
        return;
      }

      btnPasteClipboard.disabled = true;
      btnPasteClipboard.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Moving...';

      try {
        const res = await fetch('/api/files/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourcePath,
            items,
            targetPath
          })
        });

        const data = await res.json();
        if (res.ok) {
          cutClipboard = null;
          updateClipboardUI();
          loadFiles(currentExplorerPath);
          fetchCategories(); // Refresh dropdown lists if folders were moved
        } else {
          alert(data.error || 'Failed to move files');
        }
      } catch (e) {
        alert('Network error during move operation');
      } finally {
        btnPasteClipboard.disabled = false;
        btnPasteClipboard.innerHTML = '<i class="fa-solid fa-paste"></i> Paste Here';
      }
    });
  }

  // Header Sorting Click Listeners
  if (thName) {
    thName.addEventListener('click', () => {
      toggleSort('name');
    });
  }
  if (thSize) {
    thSize.addEventListener('click', () => {
      toggleSort('size');
    });
  }
  if (thDate) {
    thDate.addEventListener('click', () => {
      toggleSort('date');
    });
  }

  function toggleSort(field) {
    if (currentSortField === field) {
      currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      currentSortField = field;
      currentSortOrder = 'desc';
    }
    updateSortHeaderUI();
    renderExplorerTable();
  }

  function updateSortHeaderUI() {
    [thName, thSize, thDate].forEach(th => {
      if (th) th.classList.remove('active-sort');
    });
    let activeTh = thSize;
    if (currentSortField === 'name') activeTh = thName;
    if (currentSortField === 'date') activeTh = thDate;
    if (activeTh) activeTh.classList.add('active-sort');
  }

  btnRefreshFiles.addEventListener('click', () => loadFiles(currentExplorerPath));

  function updateBreadcrumbs(pathStr) {
    explorerBreadcrumb.innerHTML = '';
    const rootCrumb = document.createElement('span');
    rootCrumb.className = 'crumb';
    rootCrumb.textContent = 'Root (media)';
    rootCrumb.addEventListener('click', () => loadFiles(''));
    explorerBreadcrumb.appendChild(rootCrumb);

    if (pathStr) {
      const parts = pathStr.split('/');
      let accumulated = '';
      parts.forEach((p, idx) => {
        explorerBreadcrumb.appendChild(document.createTextNode(' / '));
        accumulated = accumulated ? `${accumulated}/${p}` : p;
        const crumb = document.createElement('span');
        crumb.className = 'crumb';
        crumb.textContent = p;
        const target = accumulated;
        crumb.addEventListener('click', () => loadFiles(target));
        explorerBreadcrumb.appendChild(crumb);
      });
    }
  }

  // System Stats Polling
  async function fetchSystemStats() {
    try {
      const res = await fetch('/api/system');
      const data = await res.json();

      if (data.disk) {
        const usedGB = (data.disk.used / (1024 * 1024 * 1024)).toFixed(1);
        const totalGB = (data.disk.total / (1024 * 1024 * 1024)).toFixed(1);
        diskUsageText.textContent = `${usedGB} / ${totalGB} GB (${data.disk.usePercent}%)`;
        diskProgressFill.style.width = data.disk.usePercent + '%';
      }

      if (data.ram) {
        ramUsageText.textContent = `${data.ram.usePercent}%`;
        ramProgressFill.style.width = data.ram.usePercent + '%';
      }
    } catch (e) {}
  }

  // Helpers
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatDateEn(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (['mp4', 'mkv', 'avi', 'mov', 'wmv'].includes(ext)) return 'fa-file-video';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'fa-file-zipper';
    if (['mp3', 'flac', 'aac', 'wav'].includes(ext)) return 'fa-file-audio';
    if (['jpg', 'png', 'webp', 'jpeg'].includes(ext)) return 'fa-file-image';
    return 'fa-file';
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Initial calls
  fetchCategories();
  fetchSystemStats();
  setInterval(fetchSystemStats, 5000);
});
