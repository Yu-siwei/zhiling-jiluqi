'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hasChinese,
  isEnglishText,
  localCommandHint,
  translateCommand
} = require('../lib/translate');

function fetchReturning(translatedText) {
  return async () => ({
    ok: true,
    status: 200,
    async json() {
      return { responseData: { translatedText } };
    }
  });
}

test('detects English and Chinese content', () => {
  assert.equal(isEnglishText('git status'), true);
  assert.equal(isEnglishText('git status 查看状态'), false);
  assert.equal(isEnglishText('你好'), false);
  assert.equal(hasChinese('git 提交'), true);
  assert.equal(hasChinese('git commit'), false);
});

test('builds useful local hints for command-shaped input', () => {
  assert.match(localCommandHint('git status'), /Git 版本控制.*查看状态/);
  assert.match(localCommandHint('git commit -m "fix bug"'), /提交更改.*-m.*提交信息/);
  assert.match(localCommandHint('docker compose up -d'), /Docker.*编排.*-d.*后台运行/);
  assert.match(localCommandHint('npm run dev'), /运行脚本.*启动开发模式/);
  assert.match(localCommandHint('sudo systemctl restart nginx'), /管理员权限.*重启服务/);
  assert.equal(localCommandHint('some unknown command'), '');
});

test('prefers a Chinese remote translation', async () => {
  const result = await translateCommand('list every file in the current folder', {
    fetchImpl: fetchReturning('列出当前文件夹中的每个文件')
  });
  assert.equal(result.source, 'remote');
  assert.equal(result.translation, '列出当前文件夹中的每个文件');
});

test('falls back to a local hint when the service leaves a command unchanged', async () => {
  const result = await translateCommand('git status', {
    fetchImpl: fetchReturning('git status')
  });
  assert.equal(result.source, 'local');
  assert.match(result.translation, /查看状态/);
});

test('falls back to a local hint when the network request fails', async () => {
  const result = await translateCommand('docker compose up -d', {
    fetchImpl: async () => {
      throw new Error('offline');
    }
  });
  assert.equal(result.source, 'local');
  assert.match(result.translation, /后台运行/);
});

test('reports an error when no useful translation can be produced', async () => {
  await assert.rejects(
    translateCommand('some unknown command', {
      fetchImpl: fetchReturning('some unknown command')
    }),
    /未获得中文翻译/
  );
});
