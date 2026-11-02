# Self-hosting Armin

> [!IMPORTANT]
> **Self-hosting is for individuals running a private instance for their own
> use.** One instance has one account: yours.
>
> Self-hosted Armin is provided as-is under the [AGPL-3.0 license](../LICENSE),
> **with no warranty and no support guarantee.** You are responsible for your
> server, its security, its updates, and your backups. Andy Spike operates and
> takes responsibility only for the hosted service at
> [armincards.app](https://armincards.app). A self-hosted instance is not that
> service, and its data never reaches it.

If you'd rather not run a server, use [armincards.app](https://armincards.app).

## What you get

```
             your server (Docker)
 browser ──▶ Caddy (HTTPS) ─┬─▶ web app             cards.example.com
                            ├─▶ Convex API          api.cards.example.com
                            └─▶ Convex HTTP actions actions.cards.example.com
                                 └─ data: selfhost/data/
```

| Default             | Value                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Accounts            | One, the owner, created by `setup.sh` on the server. Website sign-up is always closed.                    |
| Email               | None. No verification step; passwords are reset on the server.                                            |
| Google sign-in      | Off                                                                                                       |
| AI assistants (MCP) | On, at `https://actions.<your domain>/mcp`                                                                |
| Limits              | armincards.app Pro limits, free: 100,000 cards (10,000 per deck), 1,000 decks, 5 GiB for images and audio |
| HTTPS               | Automatic Let's Encrypt certificates through Caddy                                                        |
| Data                | `selfhost/data/` on the server                                                                            |
| Backups             | `selfhost/backup.sh`, keeps the newest 7; you schedule it                                                 |
| Mobile app          | Not supported. Use the web app in your phone's browser.                                                   |

The app shows a **Self-hosted** badge next to the Armin name.

## Requirements

- A Linux server you control with a public IP address: 2 GB of RAM or more,
  and 10 GB of free disk. The first build needs the most memory.
- [Docker Engine with Compose v2](https://docs.docker.com/engine/install/).
  Check with `docker compose version`.
- `git`.
- A domain name, such as `cards.example.com`.
- Ports **80** and **443** open to the internet (Let's Encrypt checks them).

## 1. Point DNS at your server

Create three `A` records (and `AAAA` records if your server has IPv6), all
pointing at the server's public IP address:

| Name                        | Points to        |
| --------------------------- | ---------------- |
| `cards.example.com`         | your server's IP |
| `api.cards.example.com`     | your server's IP |
| `actions.cards.example.com` | your server's IP |

Check them from the server; each should print the IP:

```bash
getent hosts cards.example.com api.cards.example.com actions.cards.example.com
```

## 2. Get the code

```bash
git clone https://github.com/andy-spike/armin.git
cd armin
```

## 3. Run setup

```bash
./selfhost/setup.sh
```

It asks for:

1. **Domain:** `cards.example.com` (no `https://`).
2. **Email:** where Let's Encrypt sends certificate notices.
3. **Your account:** the email, name, and password you'll sign in with.

Then it generates secrets, builds the app (a few minutes the first time), starts
everything, creates your account, and prints your address. Run it again at any
time; it keeps your data, secrets, and account.

## 4. Sign in

Open `https://cards.example.com` and sign in with the account you created. It's
the instance's only account, and it's verified already. Setup creates it on the
server, and the website never offers sign-up, so nobody who finds the address
can claim your instance.

If you answered **n** when setup offered to create the account, run
`./selfhost/create-owner.sh` before signing in (or restore a backup, which
brings its own account).

## 5. Save your secrets

`selfhost/.env` holds the secrets that protect your data and sign-ins.
Copy it somewhere safe off the server, such as a password manager. Without it,
a backup can't be restored with your existing sign-ins.

## 6. Schedule backups

```bash
./selfhost/backup.sh
```

This saves all decks, cards, reviews, images, and your account to
`selfhost/backups/armin-<date>.zip` and keeps the newest 7 (change
`BACKUP_KEEP` in `selfhost/.env`). To run it daily at 03:00, add a line with
`crontab -e`, using your checkout's full path:

```cron
0 3 * * * /home/you/armin/selfhost/backup.sh >> /home/you/armin/selfhost/backups/backup.log 2>&1
```

Backups on the same disk don't survive a lost server. Copy them elsewhere
regularly, with `rsync`, `rclone`, or your host's snapshots.

## Everyday tasks

| Task                 | Command                                                   |
| -------------------- | --------------------------------------------------------- |
| Update to the latest | `git pull && ./selfhost/update.sh`                        |
| Back up now          | `./selfhost/backup.sh`                                    |
| Restore a backup     | `./selfhost/restore.sh selfhost/backups/armin-<date>.zip` |
| Reset your password  | `./selfhost/reset-password.sh`                            |
| See status           | `docker compose -f selfhost/docker-compose.yml ps`        |
| Read logs            | `docker compose -f selfhost/docker-compose.yml logs -f`   |
| Stop                 | `docker compose -f selfhost/docker-compose.yml down`      |
| Start again          | `docker compose -f selfhost/docker-compose.yml up -d`     |

**Updating** backs up first, rebuilds, redeploys the backend, brings existing
data up to date for the new version, and restarts the app. Read the release
notes before updating.

**Restoring** replaces everything in the instance with the backup and asks you
to type `RESTORE` first. A backup from an older version is brought up to date
the same way. To move to a new server: copy `selfhost/.env` into a
fresh checkout there, update DNS, run `./selfhost/setup.sh` and answer **n**
when it offers to create an account, restore your latest backup, and add the
backup `crontab` line again.

**Forgot your password?** The instance doesn't send email. On the server, run
`./selfhost/reset-password.sh`, enter your email and a new password, and sign
in again on every device.

## Connect an AI assistant

Open **AI setup** in the sidebar. It shows the steps and your instance's MCP
address, `https://actions.cards.example.com/mcp`. Chat apps such as Claude and
ChatGPT connect as a **custom connector** with that address; the Armin plugin
in their directories connects to armincards.app, not your instance. Coding
agents (Claude Code, Codex) use the setup prompt on that page.

## Optional: the Convex dashboard

To browse raw data and function logs, start the dashboard. It only listens on
the server itself:

```bash
docker compose -f selfhost/docker-compose.yml --profile dashboard up -d dashboard
```

From your computer, open an SSH tunnel with `ssh -L 6791:127.0.0.1:6791 you@server`,
then visit `http://127.0.0.1:6791`. Sign in with `CONVEX_ADMIN_KEY` from
`selfhost/.env`. Edits there bypass Armin's rules; prefer reading over editing.

## Troubleshooting

| Symptom                                | Check                                                                                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser shows a certificate error      | DNS for all three names must point here, and ports 80 and 443 must be open. Then read `docker compose -f selfhost/docker-compose.yml logs caddy`.                                              |
| `setup.sh` says Docker isn't reachable | Start Docker (`sudo systemctl start docker`) and add yourself to the `docker` group, then sign in again.                                                                                       |
| The build stops or the server freezes  | The server ran out of memory. Add swap or use a server with more RAM, then rerun `setup.sh`.                                                                                                   |
| Sign-up says it's closed               | Working as intended. Create the account with `./selfhost/create-owner.sh`, or reset its password with `./selfhost/reset-password.sh`.                                                          |
| Ports 80 or 443 are already used       | Stop the other web server, or set `HTTP_PORT` and `HTTPS_PORT` in `selfhost/.env` and rerun `setup.sh`. Let's Encrypt still needs port 80 or 443 reachable from the internet, so forward them. |

## Getting help

Report self-hosting bugs in [GitHub Issues](https://github.com/andy-spike/armin/issues)
and say that you self-host. Help is best-effort, with no guaranteed response.
Report security issues privately as described in [SECURITY.md](../SECURITY.md).

## What's in `selfhost/`

| File                 | Purpose                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `docker-compose.yml` | Convex backend (pinned build), web app, Caddy, plus `tools` and `dashboard` |
| `Dockerfile`         | Builds the web app for Node and the Convex command-line tools image         |
| `Caddyfile`          | HTTPS and routing for the three addresses                                   |
| `.env.example`       | Settings template; `setup.sh` creates `.env` from it                        |
| `*.sh`               | Setup, owner account, update, backup, restore, and password reset           |

The backend runs with `SELF_HOSTED=true`, which skips email verification and
refuses every sign-up request. Only `create-owner.sh` creates an account,
through a server-only function, and only while the instance has none. The web
image is built with `VITE_SELF_HOSTED=true`, which shows the badge and skips
the public landing page.
