# Quick start

Three steps from a fresh machine: **install → serve → open the app**. The [README](../README.md) covers install; this page adds your first notes and agent setup.

## 1. Install

```bash
curl -fsSL https://raw.githubusercontent.com/antonioaren/gaveta/main/install.sh | bash
```

## 2. Serve

```bash
source ~/.local/share/gaveta/env.sh   # or open a new terminal
gaveta serve
```

Open the printed **127.0.0.1** URL. **`gaveta serve`** is a long-running process; stop it with Ctrl+C.

Equivalent with an explicit vault:

```bash
gaveta serve --vault ~/Gaveta
```

## 3. First linked notes (CLI)

From any directory, targeting the starter vault:

```bash
export GAVETA_VAULT=~/Gaveta

echo '<article><h1>Other</h1><section id="body"><p>Reference note.</p></section></article>' \
  | gaveta new "Other" --type doc --from - --json

echo '<article><h1>Origin</h1><section id="body"><p>See [[Other]]</p></section></article>' \
  | gaveta new "Origin" --type doc --from - --json

gaveta read Origin --as outline --json
gaveta search Other --json
gaveta doctor --json
```

Reload the app (or use live reload) to see new notes in the explorer.

## Try the demo vault (developers)

From a git checkout:

```bash
pnpm demo
```

Serves **`examples/demo-vault`** with the built web UI.

## Agent skill (optional)

If the installer did not detect your agent directories:

```bash
gaveta skill install --target cursor --scope user
gaveta skill status
```

Inside a vault, add short rules for all agents in the vault:

```bash
gaveta init --agent-instructions all
```

See **[Agent skill](skill.md)**.

## Develop the web UI

Hot reload (contributors):

```bash
pnpm dev
```

Production-like local app against your vault:

```bash
gaveta serve --vault ~/Gaveta
```

## Next steps

- **`gaveta guide`** — HTML contract and every command example  
- **[Import Markdown](migration-round-trip.md)** — **`gaveta import`** / **`export`**  
- **[Configuration](configuration.md)** — locale, vault discovery, updates
