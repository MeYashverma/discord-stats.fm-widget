# Troubleshooting

Use this document when the workflow runs but the widget does not look right.

---

## Quick diagnosis table

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Build passes but `npm start` says invalid config | Missing env/secrets | Add required GitHub secrets or local `.env` values |
| Widget shows editor defaults | Fields are not User Data or names mismatch | Re-check [widget fields](widget-setup.md) |
| Text updates but image does not | Image field not bound to `album_art` | Set Image → User Data → `album_art` |
| Image is square / badly clipped | Image pipeline fell back to direct URL | Check logs for D.W.I.F pipeline failure |
| No now-playing updates | Last.fm is not scrobbling or presence mode is misconfigured | Check Last.fm recent tracks, or fix Discord presence if using `discord`/`auto` |
| 401 / 403 on PATCH | Discord token/app/user/auth issue | Check `DISCORD_BOT_TOKEN`, `DISCORD_APP_ID`, `DISCORD_USER_ID`, and widget authorization |
| Last.fm stats are `-` | Last.fm key/user/API issue | Check `LASTFM_API_KEY`, `LASTFM_USERNAME`, public profile/scrobbles |
| Workflow says operation cancelled | You manually stopped it or concurrency cancelled | Re-run workflow if needed |

---

## Image still not setting correctly

The widget editor should look like:

```text
Image
Value Type: User Data
Data Field: album_art
Fallback: optional
```

The log should show:

```text
Prepared widget hero image through D.W.I.F pipeline
```

If you see:

```text
Widget image correction failed; using direct album art URL
```

then the bot is not sending a corrected CDN image. Common causes:

1. `DISCORD_IMAGE_WEBHOOK_URL` is missing or invalid.
2. The webhook was deleted.
3. Discord rejected the upload.
4. The source album art URL could not be downloaded.
5. `WIDGET_IMAGE_FIX=false` is set.

Recommended fix:

- Create a fresh Discord webhook in a private `#widget-assets` channel.
- Save the full URL as the `DISCORD_IMAGE_WEBHOOK_URL` repository secret.
- Re-run the workflow.

---

## Widget fields do not update

Discord widget fields are case-sensitive. `album_art` and `Album_Art` are different.

Every dynamic field should use:

```text
Value Type: User Data
```

not Custom String.

Also remember that Discord does not merge partial PATCHes. This bot sends the full payload, but another workflow or script PATCHing the same widget can overwrite these fields.

---

## Now-playing does not update

Discord presence requirements, only for `NOWPLAYING_SOURCE=discord` or `NOWPLAYING_SOURCE=auto`:

- Bot is in at least one server with your account.
- Discord Developer Portal → Bot → Presence Intent enabled.
- Discord Developer Portal → Bot → Server Members Intent enabled.
- Spotify is connected to your Discord account.
- Your Spotify listening activity is visible in Discord presence.

If presence is unavailable, the bot tries Last.fm recent now-playing fallback. That requires active scrobbling.

---

## Slash commands not visible

By default, commands are guild-scoped for instant registration.

If `COMMANDS_GUILD_ID` is empty, the bot uses the first mutual guild.

If you set:

```text
COMMANDS_GLOBAL=true
```

global commands can take time to appear.

---

## Discord PATCH 401 / 403

Check:

- `DISCORD_BOT_TOKEN` is current.
- `DISCORD_APP_ID` belongs to the same application as the bot token.
- `DISCORD_USER_ID` is your account ID, not the bot's ID.
- The profile widget / Social SDK authorization was completed for your Discord account.
- The application owns the widget you are editing.

---

## Last.fm stats are empty

Check:

- API key is valid.
- Username is exact.
- Last.fm profile has scrobbles.
- Last.fm scrobbling is connected to Spotify or your music client.

Some values are naturally approximate because Last.fm exposes scrobbles, not listening minutes. In this project:

- `4w` maps to Last.fm `1month`.
- `6m` maps to Last.fm `6month`.
- lifetime minutes are shown as `N/A` because Last.fm does not expose reliable listening duration totals for the user.

---

## Rate limits

The app reduces requests by:

- caching Last.fm stats for `TOPS_POLL_SECONDS`;
- skipping identical Discord PATCH payloads;
- caching processed album art during one daemon run;
- respecting Discord Retry-After headers.

If you see a 429, increase `POLL_SECONDS` or `TOPS_POLL_SECONDS` and make sure no other workflow is PATCHing the same widget.

---

## Safe reset

If the widget is in a bad state:

1. Stop all currently running workflows.
2. Verify widget editor fields.
3. Delete duplicate workflows/scripts updating the same Discord app/user.
4. Re-run this workflow manually.
5. Watch logs until `Discord widget updated` appears.
