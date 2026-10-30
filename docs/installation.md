# Installation

Gaveta is distributed as a **git checkout** plus a local symlinked CLI (no npm package yet).

## One-line install (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/antonioaren/gaveta/main/install.sh | bash
```

Use **`bash`**, not **`sh`** (Ubuntu’s `/bin/sh` is dash).

### Default behavior (no flags)

| Step | Action |
| --- | --- |
| Node | Requires **≥ 22.18**; exits with a clear message if too old |
| Checkout | **`~/.local/share/gaveta`**, branch **`main`**, **full clone** (not shallow) |
| Build | **`pnpm install --frozen-lockfile`** and **`pnpm build:web`** |
| PATH | Symlinks **`gaveta`** and **`gv`** → **`packages/cli/bin/gaveta.js`** in **`~/.local/bin`** |
| Vault | Creates **`~/Gaveta`** if missing; **never overwrites** an existing vault |
| Skill | If **`~/.cursor`** exists → **`gaveta skill install --target cursor --scope user`**; same for **`~/.claude`** → **claude** |
| Shell | Writes **`~/.local/share/gaveta/env.sh`** (`PATH`, **`GAVETA_VAULT`**) and an idempotent block in **`.zshrc`**, **`.bashrc`**, or **`.profile`** |

Re-running the installer is **idempotent**: it updates the checkout, refreshes symlinks, and skips an existing vault.

### Installer flags

| Flag | Purpose |
| --- | --- |
| **`--dir PATH`** | Checkout directory (default **`~/.local/share/gaveta`**) |
| **`--ref REF`** | Git ref (default **`main`**) |
| **`--repo URL`** | Remote URL (default **`https://github.com/antonioaren/gaveta.git`**) |
| **`--source DIR`** | Use an existing checkout (CI/dev); no clone |
| **`--vault-dir PATH`** | Starter vault (default **`~/Gaveta`**) |
| **`--no-vault`** | Skip vault creation |
| **`--no-skill`** | Skip agent skill install |
| **`--dry-run`** | Print planned actions only |
| **`--yes`** | Non-interactive (required with **`--purge`**) |
| **`--uninstall`** | Remove **`gaveta`** / **`gv`** symlinks from **`~/.local/bin`** |
| **`--purge --yes`** | Also delete the install directory; **never deletes vaults** |

### After install

```bash
gaveta version
gaveta serve --vault ~/Gaveta
```

Open a new terminal (or **`source ~/.local/share/gaveta/env.sh`**) so **`GAVETA_VAULT`** is set, then:

```bash
gaveta serve
```

If **`gaveta`** is not found, add **`~/.local/bin`** to your PATH (the installer prints a snippet when needed).

## Manual install

```bash
git clone https://github.com/antonioaren/gaveta.git ~/.local/share/gaveta
cd ~/.local/share/gaveta
corepack enable
pnpm install --frozen-lockfile
pnpm build:web
mkdir -p ~/.local/bin
ln -sf "$(pwd)/packages/cli/bin/gaveta.js" ~/.local/bin/gaveta
ln -sf "$(pwd)/packages/cli/bin/gaveta.js" ~/.local/bin/gv
gaveta init ~/Gaveta
```

## Updates

From a git install detected by **`gaveta version`**:

```bash
gaveta update          # latest v* tag by default
gaveta update --check  # dry check only
gaveta update --channel main
```

Or re-run the curl installer.

See also **[Releasing](releasing.md)**.

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/antonioaren/gaveta/main/install.sh | bash -s -- --uninstall
```

Add **`--purge --yes`** to remove the checkout under **`~/.local/share/gaveta`**. Your vaults (e.g. **`~/Gaveta`**) are left untouched.

## Security notes

- The install script is plain bash from GitHub **`main`**; pin a tag or review the script before piping to **`bash`**.
- Gaveta’s server binds to **127.0.0.1** only; the installer does not enable telemetry or outbound product calls.
