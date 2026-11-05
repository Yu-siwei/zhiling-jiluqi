'use strict';

const CJK_RE = /[㐀-鿿豈-﫿]/;
const LATIN_RE = /[a-z]/i;
const TRANSLATE_ENDPOINT = 'https://api.mymemory.translated.net/get';
const CACHE_LIMIT = 200;
const cache = new Map();

const BASE_COMMANDS = {
  git: 'Git 版本控制',
  npm: 'Node.js 包管理',
  npx: '运行 Node.js 包命令',
  pnpm: 'pnpm 包管理',
  yarn: 'Yarn 包管理',
  node: '运行 Node.js',
  deno: 'Deno 运行时',
  bun: 'Bun 运行时',
  python: 'Python 解释器',
  py: 'Python 解释器',
  pip: 'Python 包管理',
  pip3: 'Python 包管理',
  uv: 'uv Python 工具',
  poetry: 'Poetry Python 项目管理',
  cargo: 'Rust 构建与包管理',
  rustc: 'Rust 编译器',
  go: 'Go 工具链',
  dotnet: '.NET 命令行',
  java: 'Java 运行或编译',
  javac: 'Java 编译器',
  mvn: 'Maven 构建',
  gradle: 'Gradle 构建',
  docker: 'Docker 容器',
  'docker-compose': 'Docker Compose 编排',
  kubectl: 'Kubernetes 命令行',
  helm: 'Helm 包管理',
  terraform: 'Terraform 基础设施管理',
  aws: 'AWS 命令行',
  az: 'Azure 命令行',
  gcloud: 'Google Cloud 命令行',
  ls: '列出目录内容',
  dir: '列出目录内容',
  cd: '切换当前目录',
  chdir: '切换当前目录',
  pwd: '显示当前工作目录',
  cp: '复制文件或目录',
  copy: '复制文件或目录',
  mv: '移动或重命名文件',
  move: '移动或重命名文件',
  rm: '删除文件或目录',
  del: '删除文件',
  erase: '删除文件',
  mkdir: '创建目录',
  md: '创建目录',
  rmdir: '删除目录',
  rd: '删除目录',
  cat: '输出文件内容',
  type: '输出文件内容',
  less: '分页查看文件',
  more: '分页查看文件',
  head: '查看文件开头',
  tail: '查看文件结尾',
  grep: '搜索文本',
  findstr: '搜索文本',
  'select-string': '搜索文本',
  find: '查找文件',
  locate: '查找文件',
  curl: '发送 HTTP 请求',
  wget: '下载文件',
  ssh: '远程登录',
  scp: '远程复制文件',
  rsync: '同步文件',
  chmod: '修改文件权限',
  chown: '修改文件所有者',
  ps: '查看进程',
  top: '查看系统资源占用',
  kill: '终止进程',
  taskkill: '终止进程',
  systemctl: '管理系统服务',
  service: '管理系统服务',
  journalctl: '查看系统日志',
  code: '打开 VS Code',
  notepad: '打开记事本',
  explorer: '打开文件资源管理器',
  start: '打开程序或文件',
  ffmpeg: '音视频转码',
  adb: 'Android 调试桥',
  ping: '测试网络连通性',
  ipconfig: '查看网络配置',
  ifconfig: '查看网络配置',
  netstat: '查看网络连接',
  nslookup: '查询 DNS 记录',
  tree: '树形显示目录',
  echo: '输出文本',
  printf: '格式化输出文本',
  export: '设置环境变量',
  set: '设置环境变量',
  source: '加载脚本或环境变量',
  alias: '设置命令别名',
  history: '查看命令历史',
  which: '查找命令位置',
  where: '查找命令位置',
  tar: '打包或解压归档',
  zip: '创建 ZIP 压缩包',
  unzip: '解压 ZIP 压缩包',
  '7z': '7-Zip 压缩工具',
  nginx: 'Nginx Web 服务器',
  httpd: 'Apache Web 服务器',
  claude: 'Claude Code 命令行',
  vim: '使用 Vim 编辑文件',
  nano: '使用 Nano 编辑文件',
  touch: '创建空文件或更新时间',
  stat: '查看文件详细信息',
  du: '统计目录占用空间',
  df: '查看磁盘空间',
  ln: '创建链接',
  sed: '流式编辑文本',
  awk: '文本处理与统计',
  jq: '处理 JSON 数据',
  openssl: 'OpenSSL 加密工具',
  certutil: 'Windows 证书与哈希工具'
};

const SUBCOMMANDS = {
  git: {
    status: '查看状态',
    add: '暂存更改',
    commit: '提交更改',
    push: '推送到远程仓库',
    pull: '拉取并合并远程更新',
    fetch: '获取远程更新',
    clone: '克隆仓库',
    checkout: '切换分支或恢复文件',
    switch: '切换分支',
    restore: '恢复文件',
    branch: '分支管理',
    merge: '合并分支',
    rebase: '变基',
    log: '查看提交日志',
    diff: '查看差异',
    reset: '重置提交或暂存区',
    stash: '保存未提交的更改',
    remote: '管理远程仓库',
    init: '初始化仓库',
    config: '查看或修改配置',
    tag: '管理版本标签',
    blame: '查看代码修改记录',
    'cherry-pick': '摘取指定提交',
    clean: '清理未跟踪文件',
    show: '查看提交或对象详情',
    reflog: '查看引用变更日志',
    submodule: '管理子模块',
    worktree: '管理工作树'
  },
  npm: {
    install: '安装依赖',
    i: '安装依赖',
    ci: '按锁文件安装依赖',
    uninstall: '卸载依赖',
    remove: '卸载依赖',
    rm: '卸载依赖',
    update: '更新依赖',
    run: '运行脚本',
    start: '启动项目',
    test: '运行测试',
    build: '构建项目',
    dev: '启动开发模式',
    init: '初始化项目',
    create: '创建项目',
    publish: '发布包',
    link: '创建本地链接',
    audit: '检查依赖安全',
    outdated: '检查过期依赖',
    exec: '执行命令',
    config: '管理配置',
    view: '查看包信息'
  },
  pnpm: {
    install: '安装依赖',
    i: '安装依赖',
    add: '添加依赖',
    remove: '移除依赖',
    update: '更新依赖',
    run: '运行脚本',
    start: '启动项目',
    test: '运行测试',
    build: '构建项目',
    dev: '启动开发模式',
    init: '初始化项目',
    publish: '发布包',
    exec: '执行命令',
    dlx: '临时运行包命令'
  },
  yarn: {
    install: '安装依赖',
    add: '添加依赖',
    remove: '移除依赖',
    upgrade: '升级依赖',
    run: '运行脚本',
    start: '启动项目',
    test: '运行测试',
    build: '构建项目',
    dev: '启动开发模式',
    init: '初始化项目',
    publish: '发布包',
    dlx: '临时运行包命令'
  },
  docker: {
    run: '运行容器',
    ps: '列出容器',
    images: '列出镜像',
    pull: '拉取镜像',
    push: '推送镜像',
    build: '构建镜像',
    exec: '在容器中执行命令',
    logs: '查看容器日志',
    stop: '停止容器',
    start: '启动容器',
    restart: '重启容器',
    rm: '删除容器',
    rmi: '删除镜像',
    inspect: '查看容器详情',
    compose: '使用 Docker Compose 编排服务',
    network: '管理容器网络',
    volume: '管理数据卷',
    login: '登录镜像仓库',
    tag: '给镜像打标签',
    cp: '在容器与主机间复制文件',
    stats: '查看容器资源占用'
  },
  'docker-compose': {
    up: '启动并运行服务',
    down: '停止并移除服务',
    start: '启动服务',
    stop: '停止服务',
    restart: '重启服务',
    logs: '查看服务日志',
    ps: '查看服务状态',
    build: '构建服务镜像',
    pull: '拉取服务镜像',
    exec: '在服务容器中执行命令',
    config: '查看并校验配置'
  },
  kubectl: {
    get: '查询资源',
    apply: '应用配置',
    delete: '删除资源',
    describe: '查看资源详情',
    logs: '查看 Pod 日志',
    exec: '进入容器或执行命令',
    'port-forward': '转发端口',
    rollout: '管理滚动更新',
    scale: '调整副本数量',
    config: '管理集群配置',
    create: '创建资源',
    edit: '编辑资源',
    top: '查看资源占用',
    expose: '暴露服务',
    set: '修改资源设置'
  },
  cargo: {
    build: '构建项目',
    run: '运行项目',
    test: '运行测试',
    check: '检查代码',
    add: '添加依赖',
    remove: '移除依赖',
    fmt: '格式化代码',
    clippy: '运行静态检查',
    new: '创建新项目',
    init: '初始化项目',
    publish: '发布 crate',
    update: '更新依赖',
    doc: '生成文档'
  },
  python: {
    '-m': '以模块方式运行'
  },
  pip: {
    install: '安装包',
    uninstall: '卸载包',
    list: '列出已安装包',
    freeze: '导出依赖列表',
    show: '查看包信息',
    download: '下载包'
  },
  pip3: {
    install: '安装包',
    uninstall: '卸载包',
    list: '列出已安装包',
    freeze: '导出依赖列表',
    show: '查看包信息'
  },
  uv: {
    add: '添加依赖',
    remove: '移除依赖',
    sync: '同步依赖环境',
    run: '运行命令',
    init: '初始化项目',
    pip: '使用 pip 兼容接口'
  },
  poetry: {
    add: '添加依赖',
    remove: '移除依赖',
    install: '安装依赖',
    run: '运行命令',
    init: '初始化项目',
    build: '构建项目'
  },
  dotnet: {
    build: '构建项目',
    run: '运行项目',
    test: '运行测试',
    new: '创建项目',
    add: '添加包或引用',
    publish: '发布项目',
    restore: '还原依赖',
    watch: '监视并自动运行'
  },
  go: {
    run: '运行 Go 程序',
    build: '构建程序',
    test: '运行测试',
    get: '获取依赖',
    mod: '管理模块',
    install: '安装程序',
    fmt: '格式化代码',
    vet: '静态检查'
  },
  systemctl: {
    start: '启动服务',
    stop: '停止服务',
    restart: '重启服务',
    reload: '重新加载服务配置',
    status: '查看服务状态',
    enable: '设置开机自启',
    disable: '禁用开机自启',
    'daemon-reload': '重载 systemd 配置',
    'list-units': '列出服务单元',
    'list-unit-files': '列出所有单元文件',
    'is-active': '检查服务是否运行'
  },
  service: {
    start: '启动服务',
    stop: '停止服务',
    restart: '重启服务',
    reload: '重新加载服务配置',
    status: '查看服务状态'
  }
};

const SCRIPT_HINTS = {
  dev: '启动开发模式',
  start: '启动项目',
  build: '构建项目',
  test: '运行测试',
  lint: '检查代码规范',
  format: '格式化代码',
  preview: '预览构建结果',
  deploy: '部署项目',
  watch: '监听并自动构建',
  typecheck: '检查类型'
};

const FLAG_HINTS = {
  git: {
    '-m': '提交信息',
    '--message': '提交信息',
    '--amend': '修改最近一次提交',
    '--oneline': '单行简洁输出',
    '--hard': '丢弃工作区更改',
    '--soft': '保留暂存区更改',
    '-u': '设置上游分支',
    '-b': '新建分支',
    '-n': '限制输出条数',
    '-f': '强制执行',
    '--force': '强制推送',
    '--all': '所有分支或文件',
    '--no-verify': '跳过提交钩子',
    '--global': '全局配置'
  },
  npm: {
    '-g': '全局安装',
    '--global': '全局安装',
    '-D': '安装为开发依赖',
    '--save-dev': '安装为开发依赖',
    '-y': '自动确认',
    '--yes': '自动确认',
    '-f': '强制执行',
    '--force': '强制执行'
  },
  docker: {
    '-d': '后台运行',
    '--detach': '后台运行',
    '-p': '映射端口',
    '--publish': '映射端口',
    '-v': '挂载数据卷',
    '--volume': '挂载数据卷',
    '--name': '指定容器名称',
    '-it': '交互式终端',
    '--rm': '退出后自动删除容器',
    '-e': '设置环境变量'
  },
  'docker-compose': {
    '-d': '后台运行',
    '--detach': '后台运行',
    '-f': '指定配置文件',
    '--build': '启动前重新构建',
    '--remove-orphans': '清理孤立容器'
  },
  kubectl: {
    '-n': '指定命名空间',
    '--namespace': '指定命名空间',
    '-A': '所有命名空间',
    '--all-namespaces': '所有命名空间',
    '-o': '指定输出格式',
    '--output': '指定输出格式',
    '-f': '指定配置文件',
    '--filename': '指定配置文件'
  },
  cargo: {
    '--release': '发布模式构建',
    '-p': '指定包',
    '--all-features': '启用全部特性',
    '--locked': '使用锁定版本'
  }
};

const FLAG_FALLBACKS = {
  '--help': '显示帮助',
  '-h': '显示帮助',
  '--version': '显示版本号',
  '-V': '显示版本号',
  '-v': '显示详细输出',
  '--verbose': '显示详细输出',
  '-q': '静默模式',
  '--quiet': '静默模式',
  '-r': '递归处理',
  '--recursive': '递归处理',
  '-f': '强制执行',
  '--force': '强制执行',
  '-o': '指定输出文件',
  '--output': '指定输出文件',
  '-y': '自动确认',
  '--yes': '自动确认',
  '--all': '处理全部'
};

function hasChinese(value) {
  return CJK_RE.test(String(value || ''));
}

function isEnglishText(value) {
  const text = String(value || '').trim();
  return text.length > 0 && LATIN_RE.test(text) && !CJK_RE.test(text);
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function tokenize(line) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|([^\s]+)/g;
  let match;
  while ((match = re.exec(line)) !== null) {
    tokens.push(match[1] !== undefined ? match[1] : match[2] !== undefined ? match[2] : match[3]);
  }
  return tokens;
}

function normalizeBaseToken(token) {
  let value = String(token || '').trim().replace(/^["']|["']$/g, '');
  value = value.split(/[\\/]/).pop() || value;
  value = value.replace(/\.exe$/i, '').replace(/\.cmd$/i, '').replace(/\.bat$/i, '');
  return value.toLowerCase();
}

function localCommandHint(text) {
  const line = String(text || '').trim().split('\n')[0].trim();
  if (!line) return '';

  const tokens = tokenize(line);
  if (!tokens.length) return '';

  let index = 0;
  let elevated = false;
  while (index < tokens.length) {
    const token = tokens[index].toLowerCase();
    if (token === 'sudo' || token === 'doas' || token === 'runas') {
      elevated = true;
      index += 1;
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) {
      index += 1;
      continue;
    }
    break;
  }

  const baseToken = tokens[index];
  if (!baseToken) return '';
  const base = normalizeBaseToken(baseToken);
  const baseDescription = BASE_COMMANDS[base];
  if (!baseDescription) return '';

  const rest = tokens.slice(index + 1);
  const subMap = SUBCOMMANDS[base] || {};
  let subKey = '';
  for (const token of rest) {
    if (token.startsWith('-')) continue;
    const clean = token.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(subMap, clean)) {
      subKey = clean;
      break;
    }
  }

  const parts = [];
  if (subKey) {
    let detail = subMap[subKey];
    if (['npm', 'pnpm', 'yarn'].includes(base) && subKey === 'run') {
      const runIndex = rest.findIndex((token) => token.toLowerCase() === 'run');
      const scriptName = runIndex >= 0 ? String(rest[runIndex + 1] || '').toLowerCase() : '';
      if (Object.prototype.hasOwnProperty.call(SCRIPT_HINTS, scriptName)) {
        detail += '（' + SCRIPT_HINTS[scriptName] + '）';
      }
    }
    parts.push(baseDescription + '：' + detail);
  } else {
    parts.push(baseDescription);
  }

  const flagHints = FLAG_HINTS[base] || {};
  const describedFlags = [];
  for (const token of rest) {
    const flag = token.toLowerCase();
    if (describedFlags.length >= 3) break;
    if (Object.prototype.hasOwnProperty.call(flagHints, flag)) {
      describedFlags.push(flag + ' 表示' + flagHints[flag]);
    } else if (Object.prototype.hasOwnProperty.call(FLAG_FALLBACKS, flag)) {
      describedFlags.push(flag + ' 表示' + FLAG_FALLBACKS[flag]);
    }
  }
  if (describedFlags.length) {
    parts.push('参数 ' + describedFlags.join('，'));
  }

  const prefix = elevated ? '以管理员权限执行；' : '';
  return prefix + parts.join('；') + '。';
}

function cleanRemoteTranslation(value) {
  const text = decodeHtmlEntities(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  if (!text) return '';
  if (/MYMEMORY WARNING|QUERY LENGTH LIMIT EXCEEDED|INVALID/i.test(text)) return '';
  return text;
}

async function remoteTranslate(text, fetchImpl) {
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== 'function') throw new Error('当前环境不支持网络请求');

  const url = new URL(TRANSLATE_ENDPOINT);
  url.searchParams.set('q', text.slice(0, 900));
  url.searchParams.set('langpair', 'en|zh-CN');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await doFetch(url.toString(), {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CommandRecorder/1.0'
      }
    });

    if (!response.ok) {
      throw new Error('翻译服务返回 HTTP ' + response.status);
    }

    const data = await response.json();
    const candidate = data && data.responseData && data.responseData.translatedText;
    return cleanRemoteTranslation(candidate);
  } finally {
    clearTimeout(timer);
  }
}

function remember(key, value) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) {
    cache.delete(cache.keys().next().value);
  }
}

async function translateCommand(text, options) {
  const source = String(text || '').trim();
  if (!source) throw new Error('指令内容为空');
  if (!isEnglishText(source)) throw new Error('内容不是英文，无需自动翻译');

  const cacheKey = source;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const fetchImpl = options && options.fetchImpl;
  let remote = '';
  let remoteError = null;

  try {
    remote = await remoteTranslate(source, fetchImpl);
  } catch (error) {
    remoteError = error;
  }

  if (remote && hasChinese(remote)) {
    const result = { translation: remote, source: 'remote' };
    remember(cacheKey, result);
    return result;
  }

  const hint = localCommandHint(source);
  if (hint) {
    const result = { translation: hint, source: 'local' };
    remember(cacheKey, result);
    return result;
  }

  if (remote) {
    // A command-shaped string often comes back unchanged. Showing it again is
    // not useful, so ask the user to fill in the Chinese explanation instead.
    throw new Error('未获得中文翻译，可手动填写');
  }

  if (remoteError) {
    if (remoteError.name === 'AbortError') {
      throw new Error('自动翻译超时，请检查网络后重试');
    }
    throw new Error('自动翻译暂不可用，可手动填写');
  }

  throw new Error('未获得中文翻译，可手动填写');
}

module.exports = {
  hasChinese,
  isEnglishText,
  localCommandHint,
  translateCommand
};
