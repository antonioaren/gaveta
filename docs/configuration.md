# Configuration

## Vault selection

| Mechanism | Example |
| --- | --- |
| Flag | `gaveta --vault ~/Gaveta serve` |
| Environment | `export GAVETA_VAULT=~/Gaveta` |
| Working directory | Run commands inside the vault tree |

The install script writes **`~/.local/share/gaveta/env.sh`**:

```bash
export PATH="$HOME/.local/bin:$PATH"
export GAVETA_VAULT="$HOME/Gaveta"
```

Source it or open a new terminal after install.

## Locale (English / Spanish)

| Surface | Resolution |
| --- | --- |
| CLI | **`--lang en|es`**, then **`GAVETA_LANG`**, then **`LANG`** / **`LC_ALL`** |
| Web app | Saved preference in localStorage, then **`navigator.language`** |

Error codes (**`E_*`**, **`W_*`**) are never translated.

## JSON output

Add **`--json`** for machine-readable output:

```json
{
  "schemaVersion": 1,
  "ok": true,
  "command": "version",
  "data": { }
}
```

## Safe writes

After **`gaveta read`** or a successful write, use the returned **`sha256:`** hash with **`--if-match`** on **`new`** / **`edit`** to avoid clobbering concurrent changes.

## Updates (git install)

| Variable / flag | Purpose |
| --- | --- |
| **`gaveta update`** | Fast-forward to latest **`v*`** tag (default channel **stable**) |
| **`--channel main`** | Track **`origin/main`** |
| **`GAVETA_UPDATE_REMOTE`** | Must match **`git remote get-url origin`** when set |
| **`GAVETA_UPDATE_REPO_ROOT`** | Override repo root (tests/advanced) |

## Server session

**`gaveta serve`** prints a URL with a **`token=`** query parameter. API calls require header **`x-gaveta-token`**. The server listens on **127.0.0.1** only.

## Vault config file

**`.gaveta/config.json`** controls remote resource allowlists, **`rel`** vocabulary, and shipped asset versions. Edit with care; **`gaveta doctor`** helps detect issues.

See **[Installation](installation.md)** and **[CLI reference](cli-reference.md)**.
