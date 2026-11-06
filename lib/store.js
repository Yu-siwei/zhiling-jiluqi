'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_COMMANDS = 5000;
const MAX_TEXT = 20000;
const MAX_PURPOSE = 5000;
const MAX_ENVIRONMENT = 80;
const MAX_ID = 120;

function nowMs() {
  return Date.now();
}

function clampString(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n?/g, '\n');
}

function normalizeEnvironment(value) {
  return clampString(value, MAX_ENVIRONMENT)
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCommand(raw, fallbackNow) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const text = normalizeLineEndings(clampString(raw.text, MAX_TEXT)).trim();
  if (!text) return null;

  const stamp = fallbackNow || nowMs();
  const createdAt = Number.isFinite(Number(raw.createdAt)) && Number(raw.createdAt) > 0
    ? Number(raw.createdAt)
    : stamp;
  const updatedAt = Number.isFinite(Number(raw.updatedAt)) && Number(raw.updatedAt) > 0
    ? Number(raw.updatedAt)
    : createdAt;
  const rawId = clampString(raw.id, MAX_ID).trim();
  const purpose = normalizeLineEndings(clampString(raw.purpose, MAX_PURPOSE)).trim();
  // Version 1.3 removed the translation feature. Keep the explanation from
  // older data by moving it into the purpose field when no purpose exists.
  const legacyTranslation = normalizeLineEndings(clampString(raw.translation, MAX_PURPOSE)).trim();

  return {
    id: rawId || crypto.randomUUID(),
    text,
    purpose: purpose || legacyTranslation,
    environment: normalizeEnvironment(raw.environment),
    favorite: raw.favorite === true,
    createdAt,
    updatedAt
  };
}

function normalizeEnvironmentOrder(raw, commands) {
  const available = new Set(
    commands.map((command) => command.environment).filter(Boolean)
  );
  const ordered = [];
  const seen = new Set();

  if (raw && Array.isArray(raw.environmentOrder)) {
    for (const item of raw.environmentOrder) {
      const name = normalizeEnvironment(item);
      if (!name || !available.has(name) || seen.has(name)) continue;
      seen.add(name);
      ordered.push(name);
    }
  }

  const missing = Array.from(available)
    .filter((name) => !seen.has(name))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  ordered.push(...missing);

  return ordered;
}

function normalizeState(raw) {
  const commands = [];
  const seenIds = new Set();

  if (raw && Array.isArray(raw.commands)) {
    for (const item of raw.commands.slice(0, MAX_COMMANDS)) {
      const command = normalizeCommand(item, nowMs());
      if (!command) continue;

      if (seenIds.has(command.id)) command.id = crypto.randomUUID();
      seenIds.add(command.id);
      commands.push(command);
    }
  }

  return {
    version: 1,
    commands,
    environmentOrder: normalizeEnvironmentOrder(raw, commands)
  };
}

function emptyState() {
  return { version: 1, commands: [], environmentOrder: [] };
}

function buildExportDocument(raw, exportedAt) {
  const state = normalizeState(raw);
  const stampDate = exportedAt instanceof Date ? exportedAt : new Date();
  return {
    app: '指令记录器',
    format: 1,
    exportedAt: Number.isNaN(stampDate.getTime()) ? new Date().toISOString() : stampDate.toISOString(),
    environmentOrder: state.environmentOrder,
    commands: state.commands
  };
}

function parseImportDocument(raw) {
  const payload = Array.isArray(raw) ? { commands: raw } : raw;
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.commands)) {
    throw new Error('文件不是有效的指令备份');
  }
  const state = normalizeState(payload);
  if (state.commands.length === 0) {
    throw new Error('备份中没有可导入的指令');
  }
  return state;
}

function backupCorruptFile(filePath) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
  const backupPath = filePath + '.corrupt-' + stamp;
  try {
    fs.copyFileSync(filePath, backupPath);
  } catch {
    // A backup is best-effort; the app can still start with an empty store.
  }
}

function loadState(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) throw new SyntaxError('empty data file');
    return {
      state: normalizeState(JSON.parse(raw)),
      warning: null
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { state: emptyState(), warning: null };
    }

    if (error instanceof SyntaxError) {
      backupCorruptFile(filePath);
      return {
        state: emptyState(),
        warning: '数据文件无法解析，已备份损坏文件并创建新的指令库。'
      };
    }

    throw new Error('读取指令数据失败：' + (error && error.message ? error.message : String(error)));
  }
}

function replaceFile(tmpPath, targetPath) {
  try {
    fs.renameSync(tmpPath, targetPath);
  } catch (error) {
    // On Windows, replacing an existing file can occasionally fail. Remove the
    // old file only after the complete temporary file has been written.
    if (error && (error.code === 'EEXIST' || error.code === 'EPERM' || error.code === 'EACCES')) {
      fs.rmSync(targetPath, { force: true });
      fs.renameSync(tmpPath, targetPath);
      return;
    }
    throw error;
  }
}

function saveState(filePath, raw) {
  const state = normalizeState(raw);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, filePath + '.bak');
    } catch {
      // A failed backup must not prevent saving the new data.
    }
  }

  const tmpPath = filePath + '.tmp-' + process.pid + '-' + Date.now();
  const payload = JSON.stringify(state, null, 2) + '\n';

  try {
    fs.writeFileSync(tmpPath, payload, 'utf8');
    replaceFile(tmpPath, filePath);
  } catch (error) {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // Ignore cleanup failures.
    }
    throw new Error('保存指令数据失败：' + (error && error.message ? error.message : String(error)));
  }

  return state;
}

module.exports = {
  MAX_COMMANDS,
  buildExportDocument,
  emptyState,
  loadState,
  normalizeCommand,
  normalizeState,
  parseImportDocument,
  saveState
};
