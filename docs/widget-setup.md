# Widget setup guide

This is the step-by-step for binding your Discord profile widget to stats.fm widget. If the bot is online but the widget shows static/default values, the editor bindings are almost always the problem.

## Before you start

1. stats.fm widget is running (`npm run dev` or `npm start`)
2. Your `.env` has the correct `DISCORD_APP_ID`, `DISCORD_USER_ID`, and `DISCORD_BOT_TOKEN`
3. You've authorized the app with the `sdk.social_layer` OAuth scope at least once
4. The bot is in a server with you and has Presence + Server Members intents enabled

## Now playing section

Bind each field to **User Data** and set the **Data Field** name exactly as shown:

| Widget element | Data Field | What it shows |
| --- | --- | --- |
| Title | `title` | Current song name |
| Subtitle / artist line | `artist` or `subtitle` | Artist name |
| Album | `album` | Album name |
| Hero / cover image | `hero_image` | Album art while playing |

### Idle state (nothing playing)

When idle, the bot **omits** `hero_image` from the PATCH payload. Discord then falls back to whatever **Application Asset** you set as the image fallback in the widget editor.

**Important:** User Data image URLs do not animate. If you want an animated idle gif, upload it as an Application Asset in the Developer Portal and set it as the hero image fallback in the editor — do not bind idle art to a User Data field.

## Bottom stat cards (6 cards)

Each stat card has two text areas in the Discord widget editor:

| Editor slot | Bind to | What it is |
| --- | --- | --- |
| **Value** (small text on top) | `hdr_*` | Header / label for that card |
| **Label** (large text below) | `top_*` | The stat value |

Both must be **User Data**. If only the big numbers change but the small headers stay frozen, the header is still set to **Custom String**.

### Card bindings (same for every page)

These never change — set them once in the editor:

| Card | Small text → `hdr_*` | Large text → `top_*` |
| --- | --- | --- |
| #1 | `hdr_artist_4w` | `top_artist_4w` |
| #2 | `hdr_album_4w` | `top_album_4w` |
| #3 | `hdr_song_4w` | `top_song_4w` |
| #4 | `hdr_artist_6m` | `top_artist_6m` |
| #5 | `hdr_album_6m` | `top_album_6m` |
| #6 | `hdr_song_6m` | `top_song_6m` |

The field names look like "artist" / "album" / "song" but they are really just **six slots**. When pages rotate, the bot reuses the same six field names with different text.

### Static mode (`ROTATING_STATS=false`)

Only the **Top Music** page is shown. Card #1 header = `Top Artist(4w)`, value = your top artist, and so on.

### Rotating mode (`ROTATING_STATS=true`)

Same six bindings as above. Every `ROTATION_INTERVAL_SECONDS` (default 30s) the bot swaps in a new page:

**Page 1 — Top Music**
- #1 Top Artist(4w) / #2 Top Album(4w) / #3 Top Song(4w)
- #4 Top Artist(6m) / #5 Top Album(6m) / #6 Top Song(6m)

**Page 2 — Listening Stats**
- #1 Today / #2 This Week / #3 This Month
- #4 Total Streams / #5 Unique Artists / #6 Unique Tracks

**Page 3 — Discovery**
- #1 Last Artist / #2 Last Album / #3 Last Song
- #4 Artists Month / #5 Albums Month / #6 Songs Month

**Page 4 — Lifetime**
- #1 Lifetime Minutes / #2 Lifetime Streams / #3 Average Daily
- #4 Top Genre / #5 Library Size / #6 Account Age

## Optional page indicator

The bot sends a `stats_page` field (e.g. `2/4 · Listening Stats`). Add a User Data text field bound to `stats_page` if you want a visible page indicator — it's optional and safe to ignore.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Widget shows designer defaults / sample text | Every field must be **User Data**, not Custom String. Payload must include `username` (the bot sends `STATSM_USERNAME` automatically). |
| Now playing never updates | Enable Presence Intent. Bot must share a server with you. Spotify must be connected in Discord. |
| Headers don't rotate | Bind the small header text to `hdr_*` User Data fields, not Custom String. |
| Idle gif is a still image | Don't send idle gif via User Data URL. Use an Application Asset fallback in the editor. |
| 401 / 403 on PATCH | Check bot token, app ID, user ID, and `sdk.social_layer` authorization. |

## Discord API details

```
PATCH https://discord.com/api/v9/applications/{DISCORD_APP_ID}/users/{DISCORD_USER_ID}/identities/0/profile
Authorization: Bot {DISCORD_BOT_TOKEN}
User-Agent: DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)
```

The root payload must include `username`. Without it, Discord returns success but the widget keeps showing fallback values.
