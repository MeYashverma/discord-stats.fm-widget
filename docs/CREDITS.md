# Credits and References

This project builds on public Discord widget research, Last.fm API docs, and several related widget projects.

---

## Project references

| Project | What it influenced |
| --- | --- |
| [Discord-Lyrically-Widget](https://github.com/MeYashverma/Discord-Lyrically-Widget) | GitHub Actions daemon hosting, webhook album-art hosting, D.W.I.F-style image fix, detailed hosting notes |
| [Discord-LaunchPad-Widget](https://github.com/MeYashverma/Discord-LaunchPad-Widget) | Architecture documentation style, image-pipeline documentation, daemon lifecycle model |
| [discord-lastfm-widget](https://github.com/MeYashverma/discord-lastfm-widget) | Last.fm widget automation and payload experiments |
| [discord-waifu-widget](https://github.com/MeYashverma/discord-waifu-widget) | Discord widget automation experiments |
| [Genshin-Stats](https://github.com/MeYashverma/Genshin-Stats) | Public README style, setup tables, API-flow documentation approach |

---

## External references

| Reference | Link |
| --- | --- |
| D.W.I.F — Discord Widget Image Fixer by AjaxFNC-YT | https://github.com/AjaxFNC-YT/D.W.I.F |
| Last.fm API docs | https://www.last.fm/api |
| Last.fm API key creation | https://www.last.fm/api/account/create |
| Discord Developer Docs | https://discord.com/developers/docs |
| Discord Developer Portal | https://discord.com/developers/applications |
| GitHub Actions docs | https://docs.github.com/actions |
| Chloe Cinders Discord widgets article | https://chloecinders.com/blog/discord-widgets |
| aamiaa Discord widget creation script | https://gist.github.com/aamiaa/7cdd590e3949cd654758bc90bcb4710b |
| discord.js | https://discord.js.org/ |
| Sharp image library | https://sharp.pixelplumbing.com/ |

---

## API and platform acknowledgements

- Music statistics are provided by [Last.fm](https://www.last.fm/).
- Live Spotify presence is read through Discord Gateway presence data.
- Corrected images are hosted on Discord CDN via webhooks or channel message uploads.
- Widget updates use Discord's Dynamic Profile Widget / identity endpoint.

---

## D.W.I.F note

The album-art correction logic is inspired by [D.W.I.F](https://github.com/AjaxFNC-YT/D.W.I.F). This repo does not shell out to the D.W.I.F project at runtime; it implements the relevant transform directly in TypeScript/Sharp:

1. resize album art to a square;
2. shift it down to create a transparent top strip;
3. clip the top-right corner;
4. save/upload a PNG with alpha.

Credit for the original widget-image-fixer idea goes to AjaxFNC-YT and the D.W.I.F project.

---

## Disclaimer

Discord profile widgets and Dynamic Identity behavior are not as stable or as thoroughly documented as standard Discord bot APIs. They may change. This project is for personal profile automation and should be used respectfully within Discord and Last.fm rate limits.
