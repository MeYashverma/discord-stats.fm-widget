# Widget Field Setup

This guide lists the exact Discord widget editor bindings used by this project.

If the workflow logs say `Discord widget updated` but the profile still shows default/editor values, the field bindings are almost always the problem.

---

## Rules

1. Field names are case-sensitive.
2. Every dynamic field must use **Value Type → User Data**.
3. Image field should use `album_art`.
4. Do not run another workflow that PATCHes the same widget with a partial payload.

---

## Image field

For the main album-art image field:

```text
Value Type: User Data
Data Field: album_art
```

The bot sends both `album_art` and `hero_image`, but `album_art` is the recommended field name for this layout.

When nothing is playing, the bot omits the image field so Discord can use the editor fallback / Application Asset.

> User Data image URLs do not animate. If you want an animated idle GIF, upload it as an Application Asset in the Discord Developer Portal and use it as the widget image fallback.

---

## Now-playing text fields

| Widget element | Data Field | Type | Description |
| --- | --- | --- | --- |
| Track title | `title` | Text | Current song name |
| Artist | `artist` | Text | Current artist |
| Album | `album` | Text | Current album |
| Subtitle | `subtitle` | Text | `artist • album` |

---

## Bottom stat cards

Each stat card normally has two text areas:

| Editor slot | Bind to | Description |
| --- | --- | --- |
| Value / small header | `hdr_*` | Card title/header |
| Label / large text | `top_*` | Card value |

Use these six fixed slots:

| Card | Header field | Value field |
| --- | --- | --- |
| 1 | `hdr_artist_4w` | `top_artist_4w` |
| 2 | `hdr_album_4w` | `top_album_4w` |
| 3 | `hdr_song_4w` | `top_song_4w` |
| 4 | `hdr_artist_6m` | `top_artist_6m` |
| 5 | `hdr_album_6m` | `top_album_6m` |
| 6 | `hdr_song_6m` | `top_song_6m` |

The names are historical. In rotating mode these are just six reusable card slots.

---

## Rotating pages

When `ROTATING_STATS=true`, the same six cards rotate every `ROTATION_INTERVAL_SECONDS`.

### Page 1 — Top Music

| Card | Header | Value |
| --- | --- | --- |
| 1 | Top Artist(4w) | Top artist for Last.fm `1month` |
| 2 | Top Album(4w) | Top album for Last.fm `1month` |
| 3 | Top Song(4w) | Top track for Last.fm `1month` |
| 4 | Top Artist(6m) | Top artist for Last.fm `6month` |
| 5 | Top Album(6m) | Top album for Last.fm `6month` |
| 6 | Top Song(6m) | Top track for Last.fm `6month` |

### Page 2 — Listening Stats

Last.fm exposes scrobbles more reliably than listening minutes, so these fields are adapted to Last.fm data.

| Card | Meaning |
| --- | --- |
| 1 | Source indicator |
| 2 | Scrobble indicator |
| 3 | Tracks this month |
| 4 | Total scrobbles |
| 5 | Unique artists overall |
| 6 | Unique tracks overall |

### Page 3 — Discovery

| Card | Meaning |
| --- | --- |
| 1 | Last artist |
| 2 | Last album |
| 3 | Last song |
| 4 | Artists this month |
| 5 | Albums this month |
| 6 | Tracks this month |

### Page 4 — Lifetime

| Card | Meaning |
| --- | --- |
| 1 | Lifetime minutes (`N/A` for Last.fm) |
| 2 | Lifetime scrobbles |
| 3 | Average daily (`N/A` for Last.fm) |
| 4 | Top artist overall |
| 5 | Library size / unique tracks |
| 6 | Account age |

---

## Optional page indicator

The bot sends two aliases:

```text
stats_page
page
```

Bind either one to a text field if you want a visible label like:

```text
2/4 · Listening Stats
```

---

## Full field checklist

```text
album_art
title
artist
album
subtitle
hdr_artist_4w
hdr_album_4w
hdr_song_4w
hdr_artist_6m
hdr_album_6m
hdr_song_6m
top_artist_4w
top_album_4w
top_song_4w
top_artist_6m
top_album_6m
top_song_6m
stats_page
```

Compatibility image alias:

```text
hero_image
```

---

## Troubleshooting bindings

| Problem | Fix |
| --- | --- |
| Image does not change | Bind Image → User Data → `album_art` |
| Image is raw square art | Check [Image Pipeline](IMAGE_PIPELINE.md) and webhook secret |
| Text remains sample/default | Field is probably Custom String instead of User Data |
| Headers do not rotate | Bind small card text to `hdr_*`, not hardcoded strings |
| Values do not rotate | Bind large card text to `top_*` fields |
| Widget accepts PATCH but does not display | Ensure payload includes `username` and fields match exactly |
