# Deployment: phone, service and backups

[← Back to README](../README.md)

The app is built for one person on one PC. This page covers reaching it from your phone, running it as a background service, a first-install checklist, and backing up your journal.

## On your phone (Tailscale)

The recommended setup keeps the app on loopback and lets Tailscale put HTTPS in front of it. HTTPS matters because an
installable PWA and the offline shell only work in a secure context.

1. Install Tailscale on the PC and the phone and log both into the same tailnet
   (on Fedora: `sudo dnf install tailscale && sudo systemctl enable --now tailscaled && sudo tailscale up`).
2. On the PC, run `tailscale serve --bg 4317`. That gives you `https://<machine>.<tailnet>.ts.net`, reachable only
   inside your tailnet. `tailscale serve status` shows the exact name.
3. Add that name to `ALLOWED_HOSTS` in `.env` and restart the app. Until you do, requests for that host get `421`
   (a DNS rebinding guard).
4. On the phone, open the URL and use Add to Home Screen (iOS Safari) or Install app (Android Chrome).

> **Never use `tailscale funnel` for this app.** Funnel publishes the port to the whole internet, and your journal with
> it. The app has no login of its own, so the tailnet is the only boundary.

Plain `http://<tailscale-ip>:4317` with `HOST=0.0.0.0` also works, but the browser won't let you install the app or
use the offline shell over plain HTTP. Binding `0.0.0.0` also exposes the app to your whole local network, and the
server logs a warning about it.

## Run it as a service (systemd, your user)

`deploy/quest-journal.service` is a user unit. It runs as you, so `claude` can use your login.

```sh
bun run build
mkdir -p ~/.config/systemd/user
cp deploy/quest-journal.service ~/.config/systemd/user/
# if `command -v bun` is not ~/.bun/bin/bun, edit ExecStart in the copied file
systemctl --user daemon-reload
systemctl --user enable --now quest-journal
journalctl --user -u quest-journal -f           # logs
loginctl enable-linger "$USER"                  # optional: keep it running while you're logged out
```

After pulling new code, run `bun run build && systemctl --user restart quest-journal`. Open tabs show "A fresh page is
ready" and never reload while you're typing.

Don't enable the unit while agent sprints are running in this checkout, or while you're changing code here: it runs
whatever is in this folder. Build and restart once a change is finished and tested. Bun also auto-loads `.env.local`
and `.env.production`, so a scratch `DATA_DIR` left in one of those would silently apply to the service. Keep only
`.env`, and check the data dir line in the log after a restart (`journalctl --user -u quest-journal | grep -i data`).

## First install (checklist)

1. `curl -s http://127.0.0.1:4317/api/health | grep -o '"available":[a-z]*'` should print `"available":true`. If it
   says `false`: with `claude-cli`, the unit's `PATH` is shorter than your shell's, so compare with
   `command -v claude` and fix `Environment=PATH=`. With `anthropic`, the API key isn't set.
2. Do a check-in at `http://localhost:4317`, then run
   `curl -s http://127.0.0.1:4317/api/today | grep -o '"source":"[a-z]*"' | head -1`. `"source":"ai"` is good.
   `"pool"` means the model didn't answer under the service.
3. Through Tailscale, open Today on the phone and tap Done on a quest. `421` means the host isn't in `ALLOWED_HOSTS`.
   `403` means the proxy changed the Origin header.
4. Install it on the phone, turn on airplane mode, and reopen it. You should see the header and a "Can't reach your
   laptop right now" card.
5. Write a word in the evening notes, save, and within 5 s run `systemctl --user stop quest-journal`.
   `git -C ~/quest-data log -1 --format=%s` should show a `qj:` commit for that save.

## Back up your journal

Pick one and do it now. Either push to a private remote:

```sh
git -C ~/quest-data remote add backup <your-private-repo-url>
git -C ~/quest-data push backup HEAD          # repeat whenever you like, e.g. every Sunday
```

or to a second disk:

```sh
git init --bare /run/media/$USER/<disk>/quest-data.git
git -C ~/quest-data push /run/media/$USER/<disk>/quest-data.git HEAD
```

The remote must be private. Never `--force`. Restoring is `git clone <backup> ~/quest-data`.
