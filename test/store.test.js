'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const store = require('../lib/store');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'command-recorder-test-'));
}

test('normalizes a command and keeps important multi-line text', () => {
  const normalized = store.normalizeCommand({
    id: '  command-1  ',
    text: '\r\n  git status\r\n  git log --oneline\r\n',
    translation: '  查看状态  ',
    purpose: '  检查仓库  ',
    environment: ' Git \n Bash ',
    favorite: true,
    createdAt: '100',
    updatedAt: '200'
  });

  assert.equal(normalized.id, 'command-1');
  assert.equal(normalized.text, 'git status\n  git log --oneline');
  assert.equal('translation' in normalized, false);
  assert.equal(normalized.purpose, '检查仓库');
  assert.equal(normalized.environment, 'Git Bash');
  assert.equal(normalized.favorite, true);
  assert.equal(normalized.createdAt, 100);
  assert.equal(normalized.updatedAt, 200);
});

test('migrates a legacy translation into the purpose when purpose is empty', () => {
  const normalized = store.normalizeCommand({
    text: 'git status',
    translation: '  查看仓库状态  '
  });

  assert.equal(normalized.purpose, '查看仓库状态');
  assert.equal('translation' in normalized, false);
});

test('prefers an existing purpose over a legacy translation', () => {
  const normalized = store.normalizeCommand({
    text: 'git status',
    translation: '查看仓库状态',
    purpose: '检查当前仓库'
  });

  assert.equal(normalized.purpose, '检查当前仓库');
});

test('drops empty commands and de-duplicates ids', () => {
  const state = store.normalizeState({
    commands: [
      { id: 'same', text: 'git status' },
      { id: 'same', text: 'git log' },
      { id: 'empty', text: '   ' },
      null
    ]
  });

  assert.equal(state.commands.length, 2);
  assert.notEqual(state.commands[0].id, state.commands[1].id);
});

test('keeps explicit environment order and appends missing environments', () => {
  const state = store.normalizeState({
    environmentOrder: ['Kubernetes', 'Git', 'Missing'],
    commands: [
      { text: 'git status', environment: 'Git' },
      { text: 'docker ps', environment: 'Docker' },
      { text: 'kubectl get pods', environment: 'Kubernetes' }
    ]
  });

  assert.deepEqual(state.environmentOrder, ['Kubernetes', 'Git', 'Docker']);
});

test('saves and reloads state through an atomic file write', () => {
  const dir = tempDir();
  const file = path.join(dir, 'commands.json');

  const saved = store.saveState(file, {
    environmentOrder: ['Docker', 'Git'],
    commands: [
      {
        text: 'docker compose up -d',
        translation: '后台启动所有服务',
        purpose: '启动本地环境',
        environment: 'Docker',
        favorite: true
      },
      {
        text: 'git status',
        environment: 'Git'
      }
    ]
  });

  assert.equal(fs.existsSync(file), true);
  assert.equal(saved.commands.length, 2);
  assert.deepEqual(saved.environmentOrder, ['Docker', 'Git']);

  const loaded = store.loadState(file);
  assert.equal(loaded.warning, null);
  assert.equal(loaded.state.commands[0].text, 'docker compose up -d');
  assert.equal(loaded.state.commands[0].environment, 'Docker');
  assert.equal(loaded.state.commands[0].favorite, true);
  assert.deepEqual(loaded.state.environmentOrder, ['Docker', 'Git']);
});

test('builds an export document that can be imported again', () => {
  const document = store.buildExportDocument({
    environmentOrder: ['Docker', 'Git'],
    commands: [
      { id: 'a', text: 'git status', environment: 'Git', favorite: true },
      { id: 'b', text: 'docker ps', environment: 'Docker' }
    ]
  }, new Date('2026-01-02T03:04:05.000Z'));

  assert.equal(document.app, '指令记录器');
  assert.equal(document.format, 1);
  assert.equal(document.exportedAt, '2026-01-02T03:04:05.000Z');
  assert.deepEqual(document.environmentOrder, ['Docker', 'Git']);

  const imported = store.parseImportDocument(JSON.parse(JSON.stringify(document)));
  assert.equal(imported.commands.length, 2);
  assert.deepEqual(imported.environmentOrder, ['Docker', 'Git']);
  assert.equal(imported.commands[0].id, 'a');
});

test('rejects invalid import documents', () => {
  assert.throws(() => store.parseImportDocument({ hello: 'world' }), /有效的指令备份/);
  assert.throws(() => store.parseImportDocument({ commands: [] }), /没有可导入的指令/);
});

test('backs up a corrupt data file and starts with an empty store', () => {
  const dir = tempDir();
  const file = path.join(dir, 'commands.json');
  fs.writeFileSync(file, '{not valid json', 'utf8');

  const loaded = store.loadState(file);
  assert.equal(loaded.state.commands.length, 0);
  assert.match(loaded.warning, /已备份/);

  const backups = fs.readdirSync(dir).filter((name) => name.includes('.corrupt-'));
  assert.equal(backups.length, 1);
});

test('missing data file is treated as an empty store', () => {
  const dir = tempDir();
  const loaded = store.loadState(path.join(dir, 'missing.json'));
  assert.deepEqual(loaded.state, store.emptyState());
  assert.equal(loaded.warning, null);
});
