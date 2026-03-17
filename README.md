# FixGraph — Engineering Fix Search

Search 25,000+ community-verified engineering fixes without leaving VS Code.

## Features

- **`Cmd+Shift+G`** — search selected text, error under cursor, or type a query
- **Right-click** → "Search FixGraph with Selection" on any highlighted text
- **Status bar** — click `🔍 FixGraph` in the bottom-right corner
- **Auto-search** (optional) — triggers when cursor is on a red error diagnostic
- Results panel with trust scores, root cause, numbered steps, and code snippets

## Install

Search "FixGraph" in the VS Code Extensions marketplace, or:

```bash
code --install-extension fixgraph.fixgraph
```

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `fixgraph.apiKey` | `""` | Optional API key for write access |
| `fixgraph.autoSearch` | `false` | Auto-search on error diagnostics |
| `fixgraph.resultLimit` | `5` | Results to show (1–20) |
| `fixgraph.panelPosition` | `"beside"` | `"beside"` or `"active"` |

## Links

- [fixgraph.netlify.app](https://fixgraph.netlify.app)
- [GitHub](https://github.com/jawdat6/fixgraph-vscode)
