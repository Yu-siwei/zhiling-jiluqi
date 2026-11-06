'use strict';

(() => {
  const api = window.commandRecorder;
  const SORT_KEY = 'command-recorder:sort';
  const SORTS = ['manual', 'favorite', 'newest', 'oldest', 'alpha'];
  const ENV_COLORS = ['#6ee7c8', '#7aa2ff', '#f4c75d', '#f49ac1', '#a78bfa', '#fb923c', '#67e8f9', '#a3e635', '#fca5a5', '#93c5fd'];

  const ICON = {
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 6.5l4 4M5 19l3.3-.7L19 7.6a2.1 2.1 0 0 0-3-3L5.7 15.3z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15M9.5 3.8h5M7 7l.8 12.2h8.4L17 7M10 11v5M14 11v5"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5v7h-7"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    folderInput: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/></svg>',
    grip: '<svg viewBox="0 0 12 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="4" r="1.4"/><circle cx="8" cy="4" r="1.4"/><circle cx="4" cy="10" r="1.4"/><circle cx="8" cy="10" r="1.4"/><circle cx="4" cy="16" r="1.4"/><circle cx="8" cy="16" r="1.4"/></svg>',
    terminal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M7.5 9.5l3 2.5-3 2.5M13 15h4"/></svg>'
  };

  const els = {
    searchInput: document.getElementById('searchInput'),
    clearSearch: document.getElementById('clearSearch'),
    addButton: document.getElementById('addButton'),
    importButton: document.getElementById('importButton'),
    exportButton: document.getElementById('exportButton'),
    openDataFolder: document.getElementById('openDataFolder'),
    sortSelect: document.getElementById('sortSelect'),
    commandList: document.getElementById('commandList'),
    environmentList: document.getElementById('environmentList'),
    countAll: document.getElementById('countAll'),
    countFavorites: document.getElementById('countFavorites'),
    listTitle: document.getElementById('listTitle'),
    listSubtitle: document.getElementById('listSubtitle'),
    toastHost: document.getElementById('toastHost'),
    modalHost: document.getElementById('modalHost'),
    sidebar: document.querySelector('.sidebar'),
    main: document.querySelector('.main')
  };

  let appState = { version: 1, commands: [], environmentOrder: [] };
  let loading = true;
  let loadError = '';
  let modal = null;
  let choiceModal = null;
  let dragState = null;
  let suppressClickUntil = 0;

  const ui = {
    filter: { type: 'all', value: '' },
    search: '',
    sort: readSort()
  };

  init();

  function init() {
    bindEvents();
    els.sortSelect.value = ui.sort;
    updateSearchUi();

    if (!api) {
      loading = false;
      loadError = '未检测到桌面运行环境，请通过“指令记录器”应用打开。';
      renderAll();
      return;
    }

    loadState();
  }

  async function loadState() {
    loading = true;
    loadError = '';
    renderList();
    try {
      const result = await api.loadState();
      if (!result || !result.ok) {
        throw new Error((result && result.error) || '读取指令数据失败');
      }
      appState = normalizeRendererState(result.state);
      loading = false;
      renderAll();
      if (result.warning) {
        showToast(result.warning, { tone: 'warn', duration: 6500 });
      }
    } catch (error) {
      loading = false;
      loadError = error && error.message ? error.message : '读取指令数据失败';
      renderAll();
    }
  }

  function normalizeRendererState(raw) {
    if (!raw || !Array.isArray(raw.commands)) {
      return { version: 1, commands: [], environmentOrder: [] };
    }
    const commands = raw.commands.filter((command) => command && typeof command.text === 'string');
    return {
      version: 1,
      commands,
      environmentOrder: normalizeEnvironmentOrderFor(
        commands,
        Array.isArray(raw.environmentOrder) ? raw.environmentOrder : []
      )
    };
  }

  function normalizeEnvironmentOrderFor(commands, preferred) {
    const available = new Set(
      commands.map((command) => (command.environment || '').trim()).filter(Boolean)
    );
    const ordered = [];
    const seen = new Set();

    for (const item of preferred) {
      const name = typeof item === 'string' ? item.trim() : '';
      if (!name || !available.has(name) || seen.has(name)) continue;
      seen.add(name);
      ordered.push(name);
    }

    const missing = Array.from(available)
      .filter((name) => !seen.has(name))
      .sort((a, b) => a.localeCompare(b, 'zh-CN'));
    ordered.push(...missing);
    return ordered;
  }

  function mergeEnvironmentOrder(commands, ...orders) {
    return normalizeEnvironmentOrderFor(commands, orders.flat());
  }

  function bindEvents() {
    els.addButton.addEventListener('click', () => openEditor());

    els.searchInput.addEventListener('input', () => {
      ui.search = els.searchInput.value;
      updateSearchUi();
      renderHeader();
      renderList();
    });

    els.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && els.searchInput.value) {
        event.preventDefault();
        clearSearch();
      }
    });

    els.clearSearch.addEventListener('click', clearSearch);

    els.sortSelect.addEventListener('change', () => {
      ui.sort = SORTS.includes(els.sortSelect.value) ? els.sortSelect.value : 'manual';
      writeSort(ui.sort);
      renderHeader();
      renderList();
    });

    els.importButton.addEventListener('click', importCommands);
    els.exportButton.addEventListener('click', exportCommands);

    els.sidebar.addEventListener('click', (event) => {
      if (Date.now() < suppressClickUntil) return;
      const button = event.target.closest('[data-filter-type]');
      if (!button) return;
      const type = button.dataset.filterType;
      const value = type === 'env' ? (button.dataset.filterValue || '') : '';
      if (!['all', 'favorites', 'env', 'uncategorized'].includes(type)) return;
      ui.filter = { type, value };
      renderAll();
    });

    els.openDataFolder.addEventListener('click', async () => {
      if (!api) return;
      try {
        const result = await api.openDataFolder();
        if (!result || !result.ok) throw new Error((result && result.error) || '无法打开数据目录');
        showToast('已打开数据目录');
      } catch (error) {
        showToast(error && error.message ? error.message : '无法打开数据目录', { tone: 'danger' });
      }
    });

    els.commandList.addEventListener('click', handleListClick);
    els.commandList.addEventListener('keydown', handleListKeydown);
    bindCommandDragEvents();
    bindEnvironmentDragEvents();
    document.addEventListener('keydown', handleGlobalKeydown);
  }

  function handleListClick(event) {
    if (Date.now() < suppressClickUntil) return;
    if (event.target.closest('.drag-handle')) return;

    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
      event.preventDefault();
      event.stopPropagation();
      const id = actionButton.dataset.id;
      const action = actionButton.dataset.action;
      if (action === 'favorite') toggleFavorite(id);
      else if (action === 'edit') openEditor(id);
      else if (action === 'delete') deleteCommand(id);
      return;
    }

    const emptyAction = event.target.closest('[data-empty-action]');
    if (emptyAction) {
      handleEmptyAction(emptyAction.dataset.emptyAction);
      return;
    }

    const card = event.target.closest('.command-card');
    if (!card) return;
    copyCommand(card.dataset.id, card);
  }

  function handleListKeydown(event) {
    const handle = event.target.closest('.drag-handle');
    if (handle) {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        moveCommandByStep(handle.dataset.id, event.key === 'ArrowUp' ? -1 : 1);
      }
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target.closest('button, textarea, input, select')) return;
    const card = event.target.closest('.command-card');
    if (!card) return;
    event.preventDefault();
    copyCommand(card.dataset.id, card);
  }

  function moveCommandByStep(id, direction) {
    if (ui.sort !== 'manual') return;
    const visible = getVisibleCommands();
    const index = visible.findIndex((command) => command.id === id);
    if (index < 0) return;
    const target = visible[index + direction];
    if (!target) return;
    reorderCommand(id, target.id, direction > 0)
      .then(() => {
        requestAnimationFrame(() => {
          const handle = els.commandList.querySelector('.drag-handle[data-id="' + cssEscape(id) + '"]');
          if (handle) handle.focus();
        });
      })
      .catch(() => {});
  }

  function handleEmptyAction(action) {
    if (action === 'new') {
      openEditor();
    } else if (action === 'reset') {
      ui.filter = { type: 'all', value: '' };
      ui.search = '';
      els.searchInput.value = '';
      updateSearchUi();
      renderAll();
    } else if (action === 'retry') {
      loadState();
    }
  }

  function handleGlobalKeydown(event) {
    if (choiceModal) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeChoiceDialog();
        return;
      }
      if (event.key === 'Tab') {
        keepFocusIn(choiceModal.panel, event);
      }
      return;
    }

    if (modal) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeEditor();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        modal.form.requestSubmit();
        return;
      }
      if (event.key === 'Tab') {
        keepFocusInEditor(event);
      }
      return;
    }

    const commandKey = event.ctrlKey || event.metaKey;
    const key = String(event.key || '').toLowerCase();

    if (commandKey && key === 'n') {
      event.preventDefault();
      openEditor();
      return;
    }

    if (commandKey && key === 'f') {
      event.preventDefault();
      focusSearch();
      return;
    }

    if (event.key === '/' && !isEditableTarget(event.target)) {
      event.preventDefault();
      focusSearch();
      return;
    }

    if (event.key === 'Escape' && document.activeElement === els.searchInput) {
      clearSearch();
      els.searchInput.blur();
    }
  }

  function isEditableTarget(target) {
    if (!target) return false;
    return Boolean(target.closest && target.closest('input, textarea, select, [contenteditable="true"]'));
  }

  function focusSearch() {
    els.searchInput.focus();
    els.searchInput.select();
  }

  function clearSearch() {
    ui.search = '';
    els.searchInput.value = '';
    updateSearchUi();
    renderHeader();
    renderList();
    els.searchInput.focus();
  }

  function updateSearchUi() {
    const hasText = Boolean(ui.search);
    els.clearSearch.hidden = !hasText;
    els.searchInput.parentElement.classList.toggle('has-value', hasText);
  }

  function readSort() {
    try {
      const value = localStorage.getItem(SORT_KEY);
      return SORTS.includes(value) ? value : 'manual';
    } catch {
      return 'manual';
    }
  }

  function writeSort(value) {
    try {
      localStorage.setItem(SORT_KEY, value);
    } catch {
      // Sorting preference is non-critical.
    }
  }

  function renderAll() {
    renderSidebar();
    renderHeader();
    renderList();
    updateSearchUi();
  }

  function renderSidebar() {
    els.countAll.textContent = String(appState.commands.length);
    els.countFavorites.textContent = String(appState.commands.filter((command) => command.favorite).length);

    const counts = new Map();
    let uncategorized = 0;
    for (const command of appState.commands) {
      const environment = command.environment.trim();
      if (environment) counts.set(environment, (counts.get(environment) || 0) + 1);
      else uncategorized += 1;
    }

    if (ui.filter.type === 'env' && !counts.has(ui.filter.value)) {
      ui.filter = { type: 'all', value: '' };
    }

    document.querySelectorAll('.nav-item[data-filter-type]').forEach((button) => {
      if (button.closest('#environmentList')) return;
      const type = button.dataset.filterType;
      button.classList.toggle('is-active', ui.filter.type === type);
      button.setAttribute('aria-current', ui.filter.type === type ? 'page' : 'false');
    });

    const environmentOrder = normalizeEnvironmentOrderFor(appState.commands, appState.environmentOrder);
    const parts = [];

    for (const environment of environmentOrder) {
      const count = counts.get(environment) || 0;
      const active = ui.filter.type === 'env' && ui.filter.value === environment;
      parts.push(
        '<button class="nav-item env-item' + (active ? ' is-active' : '') + '" type="button" draggable="true" ' +
        'data-filter-type="env" data-filter-value="' + escapeHtml(environment) + '" data-env-name="' + escapeHtml(environment) + '" ' +
        'title="' + escapeHtml(environment) + ' · 拖动排序（Alt + ↑/↓）" aria-current="' + (active ? 'page' : 'false') + '">' +
        '<span class="env-grip" aria-hidden="true">' + ICON.grip + '</span>' +
        '<span class="environment-dot" style="--env-color:' + envColor(environment) + '"></span>' +
        '<span class="nav-text">' + escapeHtml(environment) + '</span>' +
        '<span class="nav-count">' + count + '</span>' +
        '</button>'
      );
    }

    if (uncategorized > 0) {
      const active = ui.filter.type === 'uncategorized';
      parts.push(
        '<button class="nav-item env-item' + (active ? ' is-active' : '') + '" type="button" data-filter-type="uncategorized" aria-current="' +
        (active ? 'page' : 'false') + '">' +
        '<span class="environment-dot is-neutral"></span>' +
        '<span class="nav-text">未分类</span>' +
        '<span class="nav-count">' + uncategorized + '</span>' +
        '</button>'
      );
    }

    if (!parts.length) {
      parts.push('<p class="env-empty-label">添加指令后，软件环境会自动出现在这里。</p>');
    }

    els.environmentList.innerHTML = parts.join('');
  }

  function renderHeader() {
    const totalInFilter = countForFilter();
    const visible = getVisibleCommands();

    els.listTitle.textContent = getFilterTitle();

    if (loading) {
      els.listSubtitle.textContent = '正在读取指令库…';
    } else if (loadError) {
      els.listSubtitle.textContent = '数据读取失败';
    } else if (ui.search) {
      els.listSubtitle.textContent = visible.length + ' 条匹配 · 点击卡片复制';
    } else if (totalInFilter === 0) {
      els.listSubtitle.textContent = appState.commands.length === 0
        ? '记录你的第一条指令'
        : '这里还没有指令';
    } else if (ui.sort === 'manual') {
      els.listSubtitle.textContent = visible.length + ' 条指令 · 拖动排序 · 点击复制';
    } else {
      els.listSubtitle.textContent = visible.length + ' 条指令 · 点击卡片复制';
    }

    if (els.sortSelect.value !== ui.sort) els.sortSelect.value = ui.sort;
  }

  function getFilterTitle() {
    if (ui.filter.type === 'favorites') return '收藏指令';
    if (ui.filter.type === 'env') return ui.filter.value;
    if (ui.filter.type === 'uncategorized') return '未分类';
    return '全部指令';
  }

  function countForFilter() {
    if (ui.filter.type === 'favorites') return appState.commands.filter((command) => command.favorite).length;
    if (ui.filter.type === 'env') return appState.commands.filter((command) => command.environment === ui.filter.value).length;
    if (ui.filter.type === 'uncategorized') return appState.commands.filter((command) => !command.environment).length;
    return appState.commands.length;
  }

  function getVisibleCommands() {
    let commands = appState.commands.slice();

    if (ui.filter.type === 'favorites') {
      commands = commands.filter((command) => command.favorite);
    } else if (ui.filter.type === 'env') {
      commands = commands.filter((command) => command.environment === ui.filter.value);
    } else if (ui.filter.type === 'uncategorized') {
      commands = commands.filter((command) => !command.environment);
    }

    const query = ui.search.trim().toLocaleLowerCase();
    if (query) {
      commands = commands.filter((command) => {
        const haystack = [
          command.text,
          command.purpose,
          command.environment
        ].join('\n').toLocaleLowerCase();
        return haystack.includes(query);
      });
    }

    return sortCommands(commands, ui.sort);
  }

  function sortCommands(commands, sort) {
    const list = commands.slice();
    if (sort === 'manual') {
      return list;
    }
    if (sort === 'newest') {
      list.sort((a, b) => (b.createdAt - a.createdAt) || (b.updatedAt - a.updatedAt));
    } else if (sort === 'oldest') {
      list.sort((a, b) => (a.createdAt - b.createdAt) || (a.updatedAt - b.updatedAt));
    } else if (sort === 'alpha') {
      list.sort((a, b) => a.text.localeCompare(b.text, 'zh-CN', { sensitivity: 'base', numeric: true }) || (b.updatedAt - a.updatedAt));
    } else {
      list.sort((a, b) => (Number(b.favorite) - Number(a.favorite)) || (b.updatedAt - a.updatedAt));
    }
    return list;
  }

  function renderList() {
    if (loading) {
      els.commandList.innerHTML = '<div class="list-placeholder"><span class="spinner" aria-hidden="true"></span><span>正在读取指令库…</span></div>';
      return;
    }

    if (loadError) {
      els.commandList.innerHTML = emptyStateTemplate({
        title: '无法打开指令库',
        text: escapeHtml(loadError),
        action: 'retry',
        actionLabel: '重新读取'
      });
      return;
    }

    if (appState.commands.length === 0) {
      els.commandList.innerHTML = emptyStateTemplate({
        title: '记录第一条指令',
        text: '把常用命令、用途和软件环境记下来。点击卡片即可复制，直接粘贴到终端。',
        action: 'new',
        actionLabel: '新建指令'
      });
      return;
    }

    const visible = getVisibleCommands();
    if (!visible.length) {
      const isSearching = Boolean(ui.search.trim());
      const text = isSearching
        ? '没有找到与“' + escapeHtml(ui.search.trim()) + '”匹配的指令，换个关键词试试。'
        : '这个分类下还没有指令。';
      els.commandList.innerHTML = emptyStateTemplate({
        title: isSearching ? '没有匹配结果' : '这里还是空的',
        text,
        action: 'reset',
        actionLabel: '查看全部指令'
      });
      return;
    }

    els.commandList.innerHTML = visible.map(commandCardTemplate).join('');
  }

  function emptyStateTemplate(options) {
    return (
      '<div class="empty-state">' +
      '<div class="empty-art" aria-hidden="true">' + ICON.terminal + '</div>' +
      '<h3>' + escapeHtml(options.title) + '</h3>' +
      '<p>' + options.text + '</p>' +
      '<button class="btn btn-primary" type="button" data-empty-action="' + options.action + '">' +
      (options.action === 'retry' ? ICON.refresh : ICON.plus) +
      '<span>' + escapeHtml(options.actionLabel) + '</span>' +
      '</button>' +
      '</div>'
    );
  }

  function commandCardTemplate(command) {
    const environment = command.environment || '未分类';
    const hasEnvironment = Boolean(command.environment);
    const manual = ui.sort === 'manual';
    const purpose = command.purpose
      ? '<p class="purpose-text" title="' + escapeHtml(command.purpose) + '">' + escapeHtml(command.purpose) + '</p>'
      : '<p class="purpose-text is-empty">未填写用途说明</p>';
    const dotStyle = hasEnvironment ? ' style="--env-color:' + envColor(command.environment) + '"' : '';
    const dotClass = hasEnvironment ? 'environment-dot' : 'environment-dot is-neutral';
    const dragHandle = manual
      ? '<span class="drag-handle" draggable="true" data-id="' + escapeHtml(command.id) + '" tabindex="0" role="button" ' +
        'title="拖动调整顺序，方向键也可移动" aria-label="拖动调整指令顺序">' + ICON.grip + '</span>'
      : '';

    return (
      '<article class="command-card' + (manual ? ' is-manual' : '') + '" data-id="' + escapeHtml(command.id) + '" ' +
      'tabindex="0" role="button" aria-label="复制指令：' + escapeHtml(truncate(command.text, 90)) + '">' +
      '<div class="card-topline">' +
      dragHandle +
      '<span class="environment-pill' + (hasEnvironment ? '' : ' is-neutral') + '" title="软件环境：' + escapeHtml(environment) + '">' +
      '<span class="' + dotClass + '"' + dotStyle + '></span>' +
      '<span>' + escapeHtml(environment) + '</span>' +
      '</span>' +
      '<div class="card-actions">' +
      '<button class="icon-action favorite-action' + (command.favorite ? ' is-favorite' : '') + '" type="button" ' +
      'data-action="favorite" data-id="' + escapeHtml(command.id) + '" ' +
      'title="' + (command.favorite ? '取消收藏' : '收藏') + '" aria-label="' + (command.favorite ? '取消收藏' : '收藏') + '" ' +
      'aria-pressed="' + (command.favorite ? 'true' : 'false') + '">' + ICON.star + '</button>' +
      '<button class="icon-action" type="button" data-action="edit" data-id="' + escapeHtml(command.id) + '" title="编辑指令" aria-label="编辑指令">' + ICON.edit + '</button>' +
      '<button class="icon-action delete-action" type="button" data-action="delete" data-id="' + escapeHtml(command.id) + '" title="删除指令" aria-label="删除指令">' + ICON.trash + '</button>' +
      '</div>' +
      '</div>' +
      '<div class="card-body">' +
      '<pre class="command-text" aria-label="指令">' + escapeHtml(command.text) + '</pre>' +
      '<div class="purpose-cell">' +
      purpose +
      '</div>' +
      '</div>' +
      '</article>'
    );
  }

  async function copyCommand(id, card) {
    if (!api) return;
    const command = appState.commands.find((item) => item.id === id);
    if (!command) return;

    try {
      const result = await api.copyText(command.text);
      if (!result || !result.ok) throw new Error((result && result.error) || '复制失败');
      markCopied(card);
      showToast('已复制到剪贴板');
    } catch (error) {
      showToast(error && error.message ? error.message : '复制失败', { tone: 'danger' });
    }
  }

  function markCopied(card) {
    if (!card || !card.isConnected) return;
    card.classList.add('is-copied');
    clearTimeout(card._copyTimer);
    card._copyTimer = setTimeout(() => {
      if (!card.isConnected) return;
      card.classList.remove('is-copied');
    }, 1200);
  }

  async function toggleFavorite(id) {
    if (!api) return;
    const command = appState.commands.find((item) => item.id === id);
    if (!command) return;

    const previous = cloneState(appState);
    command.favorite = !command.favorite;
    renderAll();

    try {
      const result = await api.saveState(appState);
      if (!result || !result.ok) throw new Error((result && result.error) || '保存失败');
      appState = normalizeRendererState(result.state);
      renderAll();
      showToast(command.favorite ? '已收藏' : '已取消收藏');
    } catch (error) {
      appState = previous;
      renderAll();
      showToast(error && error.message ? error.message : '收藏状态保存失败', { tone: 'danger' });
    }
  }

  async function deleteCommand(id) {
    if (!api) return;
    const index = appState.commands.findIndex((item) => item.id === id);
    if (index < 0) return;

    const previous = cloneState(appState);
    const removed = appState.commands[index];
    appState.commands.splice(index, 1);
    renderAll();

    try {
      const result = await api.saveState(appState);
      if (!result || !result.ok) throw new Error((result && result.error) || '删除失败');
      appState = normalizeRendererState(result.state);
      renderAll();
      showToast('已删除“' + truncate(removed.text, 24) + '”', {
        actionLabel: '撤销',
        duration: 7000,
        onAction: () => restoreDeletedCommand(removed, index)
      });
    } catch (error) {
      appState = previous;
      renderAll();
      showToast(error && error.message ? error.message : '删除失败', { tone: 'danger' });
    }
  }

  async function restoreDeletedCommand(command, index) {
    if (!api) return;
    const previous = cloneState(appState);
    const insertAt = Math.max(0, Math.min(index, appState.commands.length));
    appState.commands.splice(insertAt, 0, command);
    renderAll();

    try {
      const result = await api.saveState(appState);
      if (!result || !result.ok) throw new Error((result && result.error) || '恢复失败');
      appState = normalizeRendererState(result.state);
      renderAll();
      showToast('指令已恢复');
    } catch (error) {
      appState = previous;
      renderAll();
      showToast(error && error.message ? error.message : '恢复失败', { tone: 'danger' });
    }
  }

  function cloneState(state) {
    if (typeof structuredClone === 'function') return structuredClone(state);
    return JSON.parse(JSON.stringify(state));
  }

  /* --------------------------------------------------------------------- */
  /* Manual ordering                                                        */
  /* --------------------------------------------------------------------- */

  function bindCommandDragEvents() {
    els.commandList.addEventListener('dragstart', (event) => {
      if (ui.sort !== 'manual') return;
      const handle = event.target.closest('.drag-handle');
      if (!handle) {
        event.preventDefault();
        return;
      }
      const card = handle.closest('.command-card');
      if (!card) return;

      dragState = { type: 'command', id: card.dataset.id };
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.dataset.id);
      try {
        event.dataTransfer.setDragImage(card, 36, 26);
      } catch {
        // A custom drag image is optional.
      }
      card.classList.add('is-dragging');
    });

    els.commandList.addEventListener('dragover', (event) => {
      if (!dragState || dragState.type !== 'command') return;
      const card = event.target.closest('.command-card');
      if (!card) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      clearDropTargets(els.commandList);
      if (card.dataset.id === dragState.id) return;

      const rect = card.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      card.classList.add(after ? 'drop-after' : 'drop-before');
      autoScrollMain(event.clientY);
    });

    els.commandList.addEventListener('drop', (event) => {
      if (!dragState || dragState.type !== 'command') return;
      const card = event.target.closest('.command-card');
      if (!card) return;
      event.preventDefault();
      const rect = card.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      const draggedId = dragState.id;
      const targetId = card.dataset.id;
      cleanupDrag();
      if (draggedId !== targetId) reorderCommand(draggedId, targetId, after);
    });

    els.commandList.addEventListener('dragend', cleanupDrag);
    els.commandList.addEventListener('dragleave', (event) => {
      if (!event.relatedTarget || !els.commandList.contains(event.relatedTarget)) {
        clearDropTargets(els.commandList);
      }
    });
  }

  function bindEnvironmentDragEvents() {
    els.environmentList.addEventListener('dragstart', (event) => {
      const item = event.target.closest('.env-item[data-env-name]');
      if (!item) return;
      dragState = { type: 'environment', name: item.dataset.envName };
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.dataset.envName);
      try {
        event.dataTransfer.setDragImage(item, 24, 18);
      } catch {
        // A custom drag image is optional.
      }
      item.classList.add('is-dragging');
    });

    els.environmentList.addEventListener('dragover', (event) => {
      if (!dragState || dragState.type !== 'environment') return;
      const item = event.target.closest('.env-item[data-env-name]');
      if (!item) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      clearDropTargets(els.environmentList);
      if (item.dataset.envName === dragState.name) return;

      const rect = item.getBoundingClientRect();
      const horizontal = window.matchMedia('(max-width: 900px)').matches;
      const after = horizontal
        ? event.clientX > rect.left + rect.width / 2
        : event.clientY > rect.top + rect.height / 2;
      item.classList.add(after ? 'drop-after' : 'drop-before');
    });

    els.environmentList.addEventListener('drop', (event) => {
      if (!dragState || dragState.type !== 'environment') return;
      const item = event.target.closest('.env-item[data-env-name]');
      if (!item) return;
      event.preventDefault();
      const rect = item.getBoundingClientRect();
      const horizontal = window.matchMedia('(max-width: 900px)').matches;
      const after = horizontal
        ? event.clientX > rect.left + rect.width / 2
        : event.clientY > rect.top + rect.height / 2;
      const draggedName = dragState.name;
      const targetName = item.dataset.envName;
      cleanupDrag();
      if (draggedName !== targetName) reorderEnvironment(draggedName, targetName, after);
    });

    els.environmentList.addEventListener('dragend', cleanupDrag);
    els.environmentList.addEventListener('dragleave', (event) => {
      if (!event.relatedTarget || !els.environmentList.contains(event.relatedTarget)) {
        clearDropTargets(els.environmentList);
      }
    });

    els.environmentList.addEventListener('keydown', (event) => {
      const item = event.target.closest('.env-item[data-env-name]');
      if (!item || !event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
      event.preventDefault();
      const names = getOrderedEnvironmentNames();
      const index = names.indexOf(item.dataset.envName);
      const targetName = names[index + (event.key === 'ArrowUp' ? -1 : 1)];
      if (!targetName) return;
      const name = item.dataset.envName;
      reorderEnvironment(name, targetName, event.key === 'ArrowDown').then(() => {
        requestAnimationFrame(() => {
          const next = els.environmentList.querySelector('[data-env-name="' + cssEscape(name) + '"]');
          if (next) next.focus();
        });
      }).catch(() => {});
    });
  }

  function autoScrollMain(clientY) {
    if (!els.main) return;
    const rect = els.main.getBoundingClientRect();
    if (clientY < rect.top + 58) els.main.scrollTop -= 18;
    else if (clientY > rect.bottom - 58) els.main.scrollTop += 18;
  }

  function clearDropTargets(container) {
    container.querySelectorAll('.drop-before, .drop-after').forEach((element) => {
      element.classList.remove('drop-before', 'drop-after');
    });
  }

  function cleanupDrag() {
    for (const container of [els.commandList, els.environmentList]) {
      container.querySelectorAll('.is-dragging, .drop-before, .drop-after').forEach((element) => {
        element.classList.remove('is-dragging', 'drop-before', 'drop-after');
      });
    }
    dragState = null;
    suppressClickUntil = Date.now() + 260;
  }

  async function reorderCommand(id, targetId, after) {
    if (!api) return;
    const from = appState.commands.findIndex((command) => command.id === id);
    if (from < 0) return;
    const target = appState.commands.findIndex((command) => command.id === targetId);
    if (target < 0) return;

    if (ui.sort !== 'manual') {
      ui.sort = 'manual';
      writeSort(ui.sort);
      els.sortSelect.value = 'manual';
    }

    const previous = cloneState(appState);
    const moved = appState.commands.splice(from, 1)[0];
    const targetIndex = appState.commands.findIndex((command) => command.id === targetId);
    if (targetIndex < 0) {
      appState = previous;
      return;
    }
    appState.commands.splice(targetIndex + (after ? 1 : 0), 0, moved);
    renderAll();

    try {
      const result = await api.saveState(appState);
      if (!result || !result.ok) throw new Error((result && result.error) || '保存排序失败');
      appState = normalizeRendererState(result.state);
      renderAll();
    } catch (error) {
      appState = previous;
      renderAll();
      showToast(error && error.message ? error.message : '保存排序失败', { tone: 'danger' });
      throw error;
    }
  }

  function getOrderedEnvironmentNames() {
    return normalizeEnvironmentOrderFor(appState.commands, appState.environmentOrder);
  }

  async function reorderEnvironment(name, targetName, after) {
    if (!api) return;
    const names = getOrderedEnvironmentNames();
    const from = names.indexOf(name);
    if (from < 0 || names.indexOf(targetName) < 0) return;

    const previous = cloneState(appState);
    names.splice(from, 1);
    const targetIndex = names.indexOf(targetName);
    names.splice(targetIndex + (after ? 1 : 0), 0, name);
    appState.environmentOrder = names;
    renderAll();

    try {
      const result = await api.saveState(appState);
      if (!result || !result.ok) throw new Error((result && result.error) || '保存环境顺序失败');
      appState = normalizeRendererState(result.state);
      renderAll();
    } catch (error) {
      appState = previous;
      renderAll();
      showToast(error && error.message ? error.message : '保存环境顺序失败', { tone: 'danger' });
      throw error;
    }
  }

  /* --------------------------------------------------------------------- */
  /* Import and export                                                      */
  /* --------------------------------------------------------------------- */

  async function exportCommands() {
    if (!api) return;
    if (!appState.commands.length) {
      showToast('当前没有可导出的指令', { tone: 'warn' });
      return;
    }

    setToolButtonBusy(els.exportButton, '导出中', true);
    try {
      const result = await api.exportData(appState);
      if (!result || result.canceled) return;
      if (!result.ok) throw new Error(result.error || '导出失败');
      showToast('已导出 ' + result.count + ' 条指令', { duration: 3500 });
    } catch (error) {
      showToast(error && error.message ? error.message : '导出失败', { tone: 'danger', duration: 4500 });
    } finally {
      setToolButtonBusy(els.exportButton, '导出', false);
    }
  }

  async function importCommands() {
    if (!api) return;
    setToolButtonBusy(els.importButton, '读取中', true);
    try {
      const result = await api.importData();
      if (!result || result.canceled) return;
      if (!result.ok) throw new Error(result.error || '导入失败');

      const commands = Array.isArray(result.commands)
        ? result.commands.filter((command) => command && typeof command.text === 'string' && command.text.trim())
        : [];
      if (!commands.length) throw new Error('备份中没有可导入的指令');

      openImportDialog({
        fileName: result.fileName || '指令备份.json',
        commands,
        environmentOrder: normalizeEnvironmentOrderFor(commands, result.environmentOrder || [])
      });
    } catch (error) {
      showToast(error && error.message ? error.message : '导入失败', { tone: 'danger', duration: 5000 });
    } finally {
      setToolButtonBusy(els.importButton, '导入', false);
    }
  }

  function setToolButtonBusy(button, label, busy) {
    if (!button) return;
    const text = button.querySelector('span');
    if (text) text.textContent = label;
    button.disabled = busy;
    button.classList.toggle('is-busy', busy);
  }

  function commandFingerprint(command) {
    return [command.text, command.purpose, command.environment]
      .map((value) => String(value || '').trim())
      .join('\u0000');
  }

  function openImportDialog(imported) {
    if (choiceModal || modal) return;

    const existingKeys = new Set(appState.commands.map(commandFingerprint));
    const newCommands = [];
    let duplicateCount = 0;
    for (const command of imported.commands) {
      const key = commandFingerprint(command);
      if (existingKeys.has(key)) {
        duplicateCount += 1;
        continue;
      }
      existingKeys.add(key);
      newCommands.push(command);
    }

    const environmentCount = normalizeEnvironmentOrderFor(imported.commands, imported.environmentOrder).length;
    els.modalHost.innerHTML =
      '<div class="choice-backdrop">' +
      '<div class="choice-panel" role="dialog" aria-modal="true" aria-labelledby="importTitle">' +
      '<div class="choice-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5"/><path d="M5 17.5v2h14v-2"/></svg>' +
      '</div>' +
      '<p class="choice-kicker">IMPORT BACKUP</p>' +
      '<h2 class="choice-title" id="importTitle">导入指令备份</h2>' +
      '<p class="choice-file" title="' + escapeHtml(imported.fileName) + '">' + escapeHtml(imported.fileName) + '</p>' +
      '<div class="choice-stats">' +
      '<span><strong>' + imported.commands.length + '</strong> 条指令</span>' +
      '<span><strong>' + environmentCount + '</strong> 个环境</span>' +
      (duplicateCount ? '<span class="is-muted">将跳过 ' + duplicateCount + ' 条重复</span>' : '') +
      '</div>' +
      '<p class="choice-note">“合并导入”会保留现有指令并追加新内容；“替换全部”会清空当前指令库后再导入。</p>' +
      '<p class="choice-error" id="importError" hidden></p>' +
      '<div class="choice-actions">' +
      '<button class="btn" id="importCancel" type="button">取消</button>' +
      '<button class="btn btn-danger" id="importReplace" type="button">替换全部</button>' +
      '<button class="btn btn-primary" id="importMerge" type="button"' + (newCommands.length ? '' : ' disabled') + '>' +
      (newCommands.length ? '合并导入 ' + newCommands.length + ' 条' : '没有新指令') +
      '</button>' +
      '</div>' +
      '</div>' +
      '</div>';

    const panel = els.modalHost.querySelector('.choice-panel');
    const cancelButton = els.modalHost.querySelector('#importCancel');
    const mergeButton = els.modalHost.querySelector('#importMerge');
    const replaceButton = els.modalHost.querySelector('#importReplace');
    const errorBox = els.modalHost.querySelector('#importError');
    let replaceArmed = false;
    let armTimer = null;

    const close = () => {
      clearTimeout(armTimer);
      if (choiceModal && choiceModal.panel === panel) {
        choiceModal = null;
        els.modalHost.innerHTML = '';
      }
    };
    choiceModal = { panel, close };

    cancelButton.addEventListener('click', close);
    els.modalHost.querySelector('.choice-backdrop').addEventListener('mousedown', (event) => {
      if (event.target === event.currentTarget) event.preventDefault();
    });

    mergeButton.addEventListener('click', () => {
      runImport('merge', imported, newCommands, duplicateCount, close);
    });

    replaceButton.addEventListener('click', () => {
      if (!replaceArmed) {
        replaceArmed = true;
        replaceButton.textContent = '再次点击确认替换';
        replaceButton.classList.add('is-armed');
        armTimer = setTimeout(() => {
          if (!panel.isConnected) return;
          replaceArmed = false;
          replaceButton.textContent = '替换全部';
          replaceButton.classList.remove('is-armed');
        }, 4000);
        return;
      }
      clearTimeout(armTimer);
      runImport('replace', imported, newCommands, duplicateCount, close);
    });

    function showImportError(message) {
      errorBox.textContent = message;
      errorBox.hidden = false;
    }

    // Expose error handling to runImport without leaving the panel in a dead state.
    panel._showImportError = showImportError;
    panel._setButtonsDisabled = (disabled) => {
      cancelButton.disabled = disabled;
      mergeButton.disabled = disabled || !newCommands.length;
      replaceButton.disabled = disabled;
    };

    requestAnimationFrame(() => {
      if (!panel.isConnected) return;
      if (newCommands.length) mergeButton.focus();
      else cancelButton.focus();
    });
  }

  async function runImport(mode, imported, newCommands, duplicateCount, close) {
    if (!choiceModal) return;
    const panel = choiceModal.panel;
    panel._setButtonsDisabled(true);

    let nextCommands;
    let nextOrder;

    if (mode === 'merge') {
      if (!newCommands.length) {
        panel._showImportError('没有新的指令可以导入。');
        panel._setButtonsDisabled(false);
        return;
      }
      nextCommands = appState.commands.concat(newCommands.map((command) => ({
        ...command,
        id: makeId()
      })));
      nextOrder = mergeEnvironmentOrder(nextCommands, appState.environmentOrder, imported.environmentOrder);
    } else {
      nextCommands = imported.commands.slice();
      nextOrder = normalizeEnvironmentOrderFor(nextCommands, imported.environmentOrder);
    }

    try {
      const result = await api.saveState({
        version: 1,
        commands: nextCommands,
        environmentOrder: nextOrder
      });
      if (!result || !result.ok) throw new Error(result && result.error ? result.error : '导入失败');

      appState = normalizeRendererState(result.state);
      close();
      ui.filter = { type: 'all', value: '' };
      ui.search = '';
      els.searchInput.value = '';
      updateSearchUi();
      renderAll();

      if (mode === 'merge') {
        showToast(
          '已导入 ' + newCommands.length + ' 条指令' + (duplicateCount ? '，跳过 ' + duplicateCount + ' 条重复' : ''),
          { duration: 4200 }
        );
      } else {
        showToast('已替换为 ' + imported.commands.length + ' 条指令', { duration: 4200 });
      }
    } catch (error) {
      if (panel.isConnected) {
        panel._showImportError(error && error.message ? error.message : '导入失败，请重试。');
        panel._setButtonsDisabled(false);
      } else {
        showToast(error && error.message ? error.message : '导入失败', { tone: 'danger' });
      }
    }
  }

  function closeChoiceDialog() {
    if (choiceModal && typeof choiceModal.close === 'function') choiceModal.close();
  }

  /* --------------------------------------------------------------------- */
  /* Editor                                                                 */
  /* --------------------------------------------------------------------- */

  function openEditor(id) {
    if (modal || !api) return;
    const existing = id ? appState.commands.find((command) => command.id === id) : null;
    if (id && !existing) return;

    const isEdit = Boolean(existing);
    const environments = normalizeEnvironmentOrderFor(appState.commands, appState.environmentOrder);

    els.modalHost.innerHTML = editorTemplate(existing, environments, isEdit);
    const backdrop = els.modalHost.querySelector('.editor-backdrop');
    const form = els.modalHost.querySelector('#editorForm');
    const commandInput = els.modalHost.querySelector('#commandInput');
    const purposeInput = els.modalHost.querySelector('#purposeInput');
    const environmentInput = els.modalHost.querySelector('#environmentInput');
    const favoriteInput = els.modalHost.querySelector('#favoriteInput');
    const editorError = els.modalHost.querySelector('#editorError');
    const saveButton = els.modalHost.querySelector('#saveButton');
    const cancelButton = els.modalHost.querySelector('#cancelButton');
    const closeButton = els.modalHost.querySelector('#editorClose');

    let saving = false;
    let closed = false;

    const context = {
      form,
      commandInput,
      purposeInput,
      environmentInput,
      favoriteInput,
      saveButton,
      cancelButton,
      closed: false
    };
    modal = context;

    document.body.classList.add('modal-open');

    requestAnimationFrame(() => {
      if (closed) return;
      commandInput.focus();
      commandInput.setSelectionRange(commandInput.value.length, commandInput.value.length);
    });

    commandInput.addEventListener('input', hideEditorError);
    purposeInput.addEventListener('input', hideEditorError);
    environmentInput.addEventListener('input', hideEditorError);
    favoriteInput.addEventListener('change', hideEditorError);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      saveEditor();
    });

    cancelButton.addEventListener('click', closeEditor);
    closeButton.addEventListener('click', closeEditor);
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) event.preventDefault();
    });

    function showEditorError(message) {
      editorError.textContent = message;
      editorError.hidden = false;
    }

    function hideEditorError() {
      editorError.hidden = true;
      editorError.textContent = '';
    }

    async function saveEditor() {
      if (saving || closed) return;
      hideEditorError();

      const text = commandInput.value.trim();
      if (!text) {
        showEditorError('请输入指令内容。');
        commandInput.focus();
        return;
      }

      saving = true;
      saveButton.disabled = true;
      cancelButton.disabled = true;
      saveButton.textContent = '保存中…';

      const now = Date.now();
      const payload = {
        id: existing ? existing.id : makeId(),
        text,
        purpose: purposeInput.value.trim(),
        environment: environmentInput.value.trim(),
        favorite: favoriteInput.checked,
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now
      };

      const nextState = cloneState(appState);
      if (existing) {
        const index = nextState.commands.findIndex((command) => command.id === existing.id);
        if (index >= 0) nextState.commands[index] = payload;
        else nextState.commands.unshift(payload);
      } else {
        nextState.commands.unshift(payload);
      }

      try {
        const result = await api.saveState(nextState);
        if (!result || !result.ok) throw new Error((result && result.error) || '保存失败');
        appState = normalizeRendererState(result.state);
        closeEditor();
        renderAll();
        showToast(existing ? '修改已保存' : '指令已添加');
      } catch (error) {
        saving = false;
        saveButton.disabled = false;
        cancelButton.disabled = false;
        saveButton.textContent = existing ? '保存修改' : '保存指令';
        showEditorError(error && error.message ? error.message : '保存失败，请重试。');
      }
    }

    function closeEditor() {
      if (closed) return;
      closed = true;
      context.closed = true;
      modal = null;
      els.modalHost.innerHTML = '';
      document.body.classList.remove('modal-open');
    }

    context.close = closeEditor;
  }

  function keepFocusIn(container, event) {
    if (!container) return;
    const focusable = Array.from(container.querySelectorAll(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  }

  function keepFocusInEditor(event) {
    if (modal) keepFocusIn(modal.form, event);
  }

  function closeEditor() {
    if (modal && typeof modal.close === 'function') modal.close();
  }

  function editorTemplate(existing, environments, isEdit) {
    const text = existing ? existing.text : '';
    const purpose = existing ? existing.purpose : '';
    const environment = existing ? existing.environment : '';
    const favorite = existing ? existing.favorite : false;

    return (
      '<div class="editor-backdrop">' +
      '<form class="editor-panel" id="editorForm" role="dialog" aria-modal="true" aria-labelledby="editorTitle" novalidate>' +
      '<header class="editor-header">' +
      '<div class="editor-title-wrap">' +
      '<p class="editor-kicker">' + (isEdit ? 'EDIT COMMAND' : 'NEW COMMAND') + '</p>' +
      '<h2 class="editor-title" id="editorTitle">' + (isEdit ? '编辑指令' : '新建指令') + '</h2>' +
      '<p class="editor-subtitle">记录指令本身、它解决什么问题，以及常用的软件环境。</p>' +
      '</div>' +
      '<button class="editor-close" id="editorClose" type="button" title="关闭" aria-label="关闭">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>' +
      '</button>' +
      '</header>' +
      '<div class="editor-body">' +
      '<div class="editor-grid">' +
      '<div class="form-field">' +
      '<div class="field-label-row">' +
      '<label class="field-label" for="commandInput">指令内容</label>' +
      '<span class="field-hint">粘贴或输入完整指令</span>' +
      '</div>' +
      '<textarea class="field-input command-input" id="commandInput" maxlength="20000" spellcheck="false" ' +
      'placeholder="例如：git log --oneline -n 10">' + escapeHtml(text) + '</textarea>' +
      '</div>' +
      '<div class="form-field purpose-field">' +
      '<div class="field-label-row">' +
      '<label class="field-label" for="purposeInput">用途说明 <span class="optional">可选</span></label>' +
      '<span class="field-hint">记录这条指令解决什么问题</span>' +
      '</div>' +
      '<textarea class="field-input purpose-input" id="purposeInput" maxlength="5000" ' +
      'placeholder="例如：查看最近 10 条简洁提交记录，排查版本变化">' + escapeHtml(purpose) + '</textarea>' +
      '</div>' +
      '<div class="editor-meta-row">' +
      '<div class="form-field env-field">' +
      '<div class="field-label-row">' +
      '<label class="field-label" for="environmentInput">软件环境 <span class="optional">可选</span></label>' +
      '<span class="field-hint">用于左侧分类</span>' +
      '</div>' +
      '<div class="env-input-wrap">' +
      '<svg class="env-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M7.5 9.5l2.5 2-2.5 2M12.5 14h4"/></svg>' +
      '<input class="field-input env-input" id="environmentInput" maxlength="80" list="environmentSuggestions" ' +
      'placeholder="例如：Git Bash、Docker、VS Code" autocomplete="off" value="' + escapeHtml(environment) + '">' +
      '</div>' +
      '<datalist id="environmentSuggestions">' +
      environments.map((name) => '<option value="' + escapeHtml(name) + '"></option>').join('') +
      '</datalist>' +
      '</div>' +
      '<label class="favorite-toggle">' +
      '<input type="checkbox" id="favoriteInput"' + (favorite ? ' checked' : '') + '>' +
      '<span class="switch-track" aria-hidden="true"></span>' +
      ICON.star +
      '<span>收藏这条指令</span>' +
      '</label>' +
      '</div>' +
      '<p class="editor-error" id="editorError" hidden></p>' +
      '</div>' +
      '<footer class="editor-footer">' +
      '<span class="footer-hint"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> 保存 · <kbd>Esc</kbd> 关闭</span>' +
      '<div class="footer-actions">' +
      '<button class="btn" id="cancelButton" type="button">取消</button>' +
      '<button class="btn btn-primary" id="saveButton" type="submit">' + (isEdit ? '保存修改' : '保存指令') + '</button>' +
      '</div>' +
      '</footer>' +
      '</form>' +
      '</div>'
    );
  }

  /* --------------------------------------------------------------------- */
  /* Toasts and formatting                                                  */
  /* --------------------------------------------------------------------- */

  function showToast(message, options) {
    const settings = options || {};
    const tone = settings.tone || 'default';
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.dataset.tone = tone;

    const icon = tone === 'warn'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.1"/></svg>'
      : tone === 'danger'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.5 2.5 5.5-5.6"/></svg>';

    toast.innerHTML = icon + '<span class="toast-message">' + escapeHtml(message) + '</span>';

    if (settings.actionLabel) {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'toast-action';
      action.textContent = settings.actionLabel;
      action.addEventListener('click', () => {
        removeToast(toast);
        if (typeof settings.onAction === 'function') settings.onAction();
      });
      toast.appendChild(action);
    }

    els.toastHost.appendChild(toast);
    while (els.toastHost.children.length > 3) {
      removeToast(els.toastHost.firstElementChild, true);
    }

    const duration = Number(settings.duration) || 2800;
    toast._timer = setTimeout(() => removeToast(toast), duration);
  }

  function removeToast(toast, immediately) {
    if (!toast || !toast.isConnected) return;
    clearTimeout(toast._timer);
    if (immediately) {
      toast.remove();
      return;
    }
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 160);
  }

  function envColor(environment) {
    let hash = 0;
    for (let i = 0; i < environment.length; i += 1) {
      hash = ((hash << 5) - hash + environment.charCodeAt(i)) | 0;
    }
    return ENV_COLORS[Math.abs(hash) % ENV_COLORS.length];
  }

  function truncate(value, max) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'cmd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => {
      if (character === '&') return '&amp;';
      if (character === '<') return '&lt;';
      if (character === '>') return '&gt;';
      if (character === '"') return '&quot;';
      return '&#39;';
    });
  }
})();
