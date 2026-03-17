'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.deactivate = exports.activate = void 0;

const vscode = require('vscode');
const https = require('https');

const PANEL_TITLE = 'FixGraph Results';
const BASE_URL = 'https://fixgraph.netlify.app/api/issues/search';

let statusBarItem;
let currentPanel;

function activate(context) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(search) FixGraph';
  statusBarItem.tooltip = 'Search FixGraph for engineering fixes (Cmd+Shift+G)';
  statusBarItem.command = 'fixgraph.search';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const searchCmd = vscode.commands.registerCommand('fixgraph.search', async () => {
    const query = await resolveQuery();
    if (query) await runSearch(query, context);
  });

  const searchSelectionCmd = vscode.commands.registerCommand('fixgraph.searchSelection', async () => {
    const editor = vscode.window.activeTextEditor;
    const selection = editor?.document.getText(editor.selection).trim();
    if (selection) {
      await runSearch(selection, context);
    } else {
      const query = await resolveQuery();
      if (query) await runSearch(query, context);
    }
  });

  context.subscriptions.push(searchCmd, searchSelectionCmd);

  const onCursorChange = vscode.window.onDidChangeTextEditorSelection(async (e) => {
    const config = vscode.workspace.getConfiguration('fixgraph');
    if (!config.get('autoSearch')) return;
    const editor = e.textEditor;
    const pos = editor.selection.active;
    const diags = vscode.languages.getDiagnostics(editor.document.uri);
    const errDiag = diags.find(
      (d) => d.severity === vscode.DiagnosticSeverity.Error && d.range.contains(pos)
    );
    if (errDiag) await runSearch(errDiag.message, context);
  });
  context.subscriptions.push(onCursorChange);
}
exports.activate = activate;

async function resolveQuery() {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const sel = editor.document.getText(editor.selection).trim();
    if (sel.length > 0) return sel;
  }
  if (editor) {
    const pos = editor.selection.active;
    const diags = vscode.languages.getDiagnostics(editor.document.uri);
    const errDiag = diags.find(
      (d) => d.severity === vscode.DiagnosticSeverity.Error && d.range.contains(pos)
    );
    if (errDiag) return errDiag.message;
  }
  return vscode.window.showInputBox({
    placeHolder: 'e.g. "TypeError: Cannot read properties of undefined"',
    prompt: 'Search FixGraph for engineering fixes',
    title: 'FixGraph Search',
  });
}

async function runSearch(query, context) {
  const config = vscode.workspace.getConfiguration('fixgraph');
  const apiKey = config.get('apiKey') || '';
  const limit = config.get('resultLimit') ?? 5;
  const position =
    config.get('panelPosition') === 'active'
      ? vscode.ViewColumn.Active
      : vscode.ViewColumn.Beside;

  if (currentPanel) {
    currentPanel.reveal(position);
  } else {
    currentPanel = vscode.window.createWebviewPanel(
      'fixgraphResults', PANEL_TITLE, position,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    currentPanel.onDidDispose(() => { currentPanel = undefined; }, null, context.subscriptions);
  }

  currentPanel.webview.html = getLoadingHtml(query);

  try {
    const issues = await fetchIssues(query, limit, apiKey);
    currentPanel.webview.html = getResultsHtml(query, issues);
    currentPanel.webview.onDidReceiveMessage((msg) => {
      if (msg.command === 'openBrowser' && msg.url) {
        vscode.env.openExternal(vscode.Uri.parse(msg.url));
      }
    });
  } catch (err) {
    currentPanel.webview.html = getErrorHtml(query, err.message || String(err));
  }
}

function fetchIssues(query, limit, apiKey) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const url = `${BASE_URL}?${params.toString()}`;
    const options = {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'VSCode-FixGraph/0.0.1',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const issues = parsed.items ?? parsed.results ?? parsed.issues ?? parsed.data ?? [];
          resolve(issues);
        } catch {
          reject(new Error(`Invalid response (status ${res.statusCode})`));
        }
      });
    }).on('error', (e) => reject(e));
  });
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function scoreTier(score) {
  if (score >= 80) return 'high';
  if (score >= 50) return 'mid';
  return 'low';
}

function commonHead() {
  return `<meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>FixGraph</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e2e);
      --surface: var(--vscode-sideBar-background, #252535);
      --border: var(--vscode-panel-border, #3a3a5c);
      --text: var(--vscode-editor-foreground, #cdd6f4);
      --dim: var(--vscode-descriptionForeground, #7f849c);
      --accent: var(--vscode-textLink-foreground, #89b4fa);
      --green: #a6e3a1; --yellow: #f9e2af; --red: #f38ba8;
      --tag-bg: var(--vscode-badge-background, #313244);
      --tag-fg: var(--vscode-badge-foreground, #cdd6f4);
      --code-bg: var(--vscode-textCodeBlock-background, #181825);
      --r: 6px;
      --font: var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif);
      --mono: var(--vscode-editor-font-family, 'Cascadia Code', monospace);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 13px; line-height: 1.6; }
    .wrap { max-width: 860px; margin: 0 auto; padding: 16px; }
    .hd { display: flex; align-items: center; gap: 10px; padding-bottom: 14px; border-bottom: 1px solid var(--border); margin-bottom: 16px; flex-wrap: wrap; }
    .logo { font-size: 15px; font-weight: 700; color: var(--accent); }
    .qbadge { background: var(--tag-bg); color: var(--text); padding: 3px 10px; border-radius: 20px; font-size: 12px; max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .qbadge em { color: var(--accent); font-style: normal; }
    .cnt { margin-left: auto; color: var(--dim); font-size: 12px; }
    .loading { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; gap: 16px; color: var(--dim); }
    .spin { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .err-box { text-align: center; padding: 40px 20px; border: 1px solid var(--red); border-radius: var(--r); }
    .no-res { text-align: center; padding: 40px 20px; color: var(--dim); }
    .no-res p { margin-bottom: 16px; }
    details { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); margin-bottom: 10px; }
    details:hover { border-color: var(--accent); }
    summary { cursor: pointer; padding: 14px 16px; list-style: none; user-select: none; }
    summary::-webkit-details-marker { display: none; }
    summary::before { content: '▶'; display: inline-block; margin-right: 8px; font-size: 10px; color: var(--dim); transition: transform .2s; }
    details[open] summary::before { transform: rotate(90deg); }
    .stop { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .inum { color: var(--dim); font-size: 11px; }
    .ititle { font-weight: 600; flex: 1; }
    .tbadge { font-size: 11px; padding: 2px 8px; border-radius: 20px; font-weight: 600; }
    .th { background: rgba(166,227,161,.15); color: var(--green); border: 1px solid var(--green); }
    .tm { background: rgba(249,226,175,.15); color: var(--yellow); border: 1px solid var(--yellow); }
    .tl { background: rgba(243,139,168,.15); color: var(--red); border: 1px solid var(--red); }
    .tags { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 7px; }
    .tag { background: var(--tag-bg); color: var(--tag-fg); font-size: 11px; padding: 1px 7px; border-radius: 20px; }
    .meta { color: var(--dim); font-size: 11px; margin-top: 5px; }
    .ibody { padding: 0 16px 14px; border-top: 1px solid var(--border); }
    .desc { color: var(--dim); font-size: 12px; margin: 12px 0; }
    .sec { margin-top: 14px; }
    .sec h4 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--dim); margin-bottom: 7px; font-weight: 600; }
    .rc { font-size: 12px; padding: 10px 12px; background: var(--code-bg); border-radius: var(--r); border-left: 3px solid var(--yellow); }
    .steps { padding-left: 20px; }
    .steps li { padding: 4px 0; font-size: 12px; }
    .steps li::marker { color: var(--accent); font-weight: 700; }
    .code { background: var(--code-bg); border: 1px solid var(--border); border-radius: var(--r); padding: 12px 14px; font-family: var(--mono); font-size: 12px; overflow-x: auto; white-space: pre; margin-bottom: 8px; }
    .foot { margin-top: 14px; }
    .btn { display: inline-block; background: var(--accent); color: var(--bg); text-decoration: none; padding: 5px 14px; border-radius: var(--r); font-size: 12px; font-weight: 600; cursor: pointer; border: none; }
    .btn:hover { opacity: .85; }
    a { color: var(--accent); text-decoration: none; }
  </style>`;
}

function commonScript() {
  return `<script>
    const vscode = acquireVsCodeApi();
    function openBrowser(url) { vscode.postMessage({ command: 'openBrowser', url }); return false; }
    document.querySelectorAll('a[href^="http"]').forEach(a => {
      a.addEventListener('click', e => { e.preventDefault(); openBrowser(a.href); });
    });
  <\/script>`;
}

function getLoadingHtml(query) {
  return `<!DOCTYPE html><html><head>${commonHead()}</head><body>
    <div class="wrap"><div class="hd">
      <span class="logo">&#x2B21; FixGraph</span>
      <span class="qbadge">Searching: <em>${escHtml(query)}</em></span>
    </div>
    <div class="loading"><div class="spin"></div><p>Searching for fixes&#8230;</p></div>
    </div></body></html>`;
}

function getErrorHtml(query, message) {
  const url = `https://fixgraph.netlify.app/search?q=${encodeURIComponent(query)}`;
  return `<!DOCTYPE html><html><head>${commonHead()}</head><body>
    <div class="wrap"><div class="hd">
      <span class="logo">&#x2B21; FixGraph</span>
      <span class="qbadge">${escHtml(query)}</span>
    </div>
    <div class="err-box">
      <p style="color:var(--red);margin-bottom:8px">Search failed</p>
      <p style="color:var(--dim);font-size:12px;margin-bottom:16px">${escHtml(message)}</p>
      <a class="btn" href="${escHtml(url)}" onclick="openBrowser('${escHtml(url)}');return false;">Open in Browser</a>
    </div></div>
    ${commonScript()}</body></html>`;
}

function getResultsHtml(query, issues) {
  const url = `https://fixgraph.netlify.app/search?q=${encodeURIComponent(query)}`;
  const cards = issues.length === 0
    ? `<div class="no-res"><p>No results for <strong>${escHtml(query)}</strong></p>
       <a class="btn" href="${escHtml(url)}" onclick="openBrowser('${escHtml(url)}');return false;">Search on FixGraph</a></div>`
    : issues.map((issue, i) => card(issue, i)).join('');

  return `<!DOCTYPE html><html><head>${commonHead()}</head><body>
    <div class="wrap">
      <div class="hd">
        <span class="logo">&#x2B21; FixGraph</span>
        <span class="qbadge">${escHtml(query)}</span>
        <span class="cnt">${issues.length} result${issues.length !== 1 ? 's' : ''}</span>
      </div>
      <div>${cards}</div>
    </div>
    ${commonScript()}</body></html>`;
}

function card(issue, index) {
  const score = issue.trust_score ?? issue.trustScore ?? null;
  const tier = score !== null ? scoreTier(score) : null;
  const badge = tier ? `<span class="tbadge t${tier[0]}" title="Trust">${score}% trusted</span>` : '';
  const tags = (issue.tags ?? []).map(t => `<span class="tag">${escHtml(t)}</span>`).join('');
  const rc = issue.root_cause || issue.rootCause;
  const steps = issue.steps || issue.fixSteps || [];
  const issueUrl = `https://fixgraph.netlify.app/issues/${issue.slug || issue.id}`;

  const stepsHtml = steps.length > 0
    ? `<div class="sec"><h4>Steps</h4><ol class="steps">${
        steps.map(s => {
          const t = s.title ? `<strong>${escHtml(s.title)}</strong> — ` : '';
          const d = s.description || (typeof s === 'string' ? s : '');
          const c = s.code ? `<pre class="code">${escHtml(s.code)}</pre>` : '';
          return `<li>${t}${escHtml(d)}${c}</li>`;
        }).join('')
      }</ol></div>` : '';

  return `<details${index === 0 ? ' open' : ''}>
    <summary>
      <div class="stop">
        <span class="inum">#${index + 1}</span>
        <span class="ititle">${escHtml(issue.title)}</span>
        ${badge}
      </div>
      ${tags ? `<div class="tags">${tags}</div>` : ''}
    </summary>
    <div class="ibody">
      ${issue.problem_statement ? `<p class="desc">${escHtml(String(issue.problem_statement).slice(0, 300))}</p>` : ''}
      ${rc ? `<div class="sec"><h4>Root Cause</h4><p class="rc">${escHtml(String(rc).slice(0, 400))}</p></div>` : ''}
      ${stepsHtml}
      <div class="foot">
        <a class="btn" href="${escHtml(issueUrl)}" onclick="openBrowser('${escHtml(issueUrl)}');return false;">
          Open in Browser &#x2197;
        </a>
      </div>
    </div>
  </details>`;
}

function deactivate() {
  if (statusBarItem) statusBarItem.dispose();
  if (currentPanel) currentPanel.dispose();
}
exports.deactivate = deactivate;
