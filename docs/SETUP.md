# Setup Guide

This guide walks through the one-time Discord, Last.fm, widget-editor, and GitHub secret setup.

---

## 1. Discord application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a new application.
3. Copy the **Application ID** → `DISCORD_APP_ID`.
4. Open **Bot → Add Bot**.
5. Copy / reset the bot token → `DISCORD_BOT_TOKEN`.
6. Enable these privileged gateway intents under **Bot**:
   - Presence Intent
   - Server Members Intent

The presence intents are required so the bot can read your Spotify activity from a shared server.

---

## 2. Invite the bot

In the Developer Portal, open **OAuth2 → URL Generator**.

Recommended scopes:

```text
bot
applications.commands
```

Recommended bot permissions:

```text
View Channels
Send Messages
Attach Files
Read Message History
```

Invite the bot to a server where your Discord account is also present.

---

## 3. Discord user ID

Enable Developer Mode in Discord:

```text
User Settings → Advanced → Developer Mode
```

Right-click your own profile and copy your user ID → `DISCORD_USER_ID`.

---

## 4. Create / configure the Discord Profile Widget

Discord's profile widget feature is still experimental. You need a Dynamic Profile Widget / Social SDK profile attached to your application.

Helpful references:

- [Chloe Cinders — Discord widgets](https://chloecinders.com/blog/discord-widgets)
- [aamiaa widget creation script](https://gist.github.com/aamiaa/7cdd590e3949cd654758bc90bcb4710b)

Once the widget exists, bind fields exactly as shown in [Widget fields](widget-setup.md).

Most important image field:

```text
Value Type: User Data
Data Field: album_art
```

---

## 5. Last.fm API key

1. Open [Last.fm API account creation](https://www.last.fm/api/account/create).
2. Create an API application.
3. Copy the API key → `LASTFM_API_KEY`.
4. Copy your Last.fm username → `LASTFM_USERNAME`.

Make sure your Spotify scrobbling is connected to Last.fm if you want Last.fm recent-track fallback to reflect what you are currently playing.

---

## 6. Album-art webhook

The recommended image upload path is a Discord webhook.

1. Create a private channel, for example `#widget-assets`.
2. Open channel settings → **Integrations → Webhooks**.
3. Create a webhook.
4. Copy the webhook URL → `DISCORD_IMAGE_WEBHOOK_URL`.

The bot can also upload with `DISCORD_TARGET_CHANNEL_ID`, but the webhook path is simpler and matches the Lyrically widget approach.

---

## 7. GitHub repository secrets

Open:

```text
Repository → Settings → Secrets and variables → Actions → Secrets
```

Add these secrets:

| Secret | Required | Description |
| --- | --- | --- |
| `DISCORD_APP_ID` | Yes | Discord application ID |
| `DISCORD_USER_ID` | Yes | Your Discord user ID |
| `DISCORD_BOT_TOKEN` | Yes | Bot token |
| `LASTFM_API_KEY` | Yes | Last.fm API key |
| `LASTFM_USERNAME` | Yes | Last.fm username |
| `DISCORD_IMAGE_WEBHOOK_URL` | Recommended | Webhook for corrected album-art uploads |
| `DISCORD_TARGET_CHANNEL_ID` | Optional | Bot-upload fallback channel |

Optional repository variables:

| Variable | Default | Description |
| --- | --- | --- |
| `POLL_SECONDS` | `5` | Presence poll interval |
| `TOPS_POLL_SECONDS` | `60` | Last.fm stat refresh interval |
| `ROTATING_STATS` | `true` | Enable rotating bottom cards |
| `ROTATION_INTERVAL_SECONDS` | `30` | Rotation speed |
| `COMMANDS_GLOBAL` | `false` | Use global slash commands instead of guild commands |
| `COMMANDS_GUILD_ID` | empty | Register commands in a specific guild |
| `LASTFM_PROFILE_URL` | generated | Profile URL override |
| `WIDGET_IMAGE_FIX` | `true` | Enable corrected album-art pipeline |
| `IMAGE_CACHE_DIR` | `.cache/images` | Runtime image cache dir |
| `MAX_RUNTIME_SECONDS` | `21000` | Actions daemon runtime budget |

---

## 8. Run the workflow

Open:

```text
Actions → Update Last.fm Discord Widget → Run workflow
```

Expected healthy log lines:

```text
Discord bot is online
Guild slash commands registered
Starting poll loop
Current track from Discord Spotify presence
Prepared widget hero image through D.W.I.F pipeline
Discord widget updated
```

---

## 9. Local development

```bash
npm install
cp .env.example .env
# edit .env
npm run build
npm start
```

Your `.env` file is ignored by git. Never commit secrets.

---

## 10. Final checklist

- [ ] Bot is invited to a mutual server.
- [ ] Presence Intent and Server Members Intent are enabled.
- [ ] Widget image field is bound to `album_art` as User Data.
- [ ] Last.fm API key and username are set.
- [ ] Webhook URL is set if you want corrected album art.
- [ ] Workflow ran past `Discord widget updated`.
