import type { Client, Presence } from "discord.js";
import { ActivityType, Events } from "discord.js";
import { handleSlashCommand } from "./commands";
import { config } from "./config";
import {
  createDiscordClient,
  currentTrackFromPresence,
  fetchDiscordSpotifyTrack,
  loginDiscord,
} from "./discordClient";
import { deploySlashCommands } from "./deployCommands";
import { fetchCurrentTrack as fetchLastfmCurrentTrack, fetchRotationData } from "./lastfm";
import {
  buildRotatedTopStats,
  emptyRotationData,
  STAT_PAGES,
  type RotationData,
} from "./rotatingStats";
import { recordStatsfmFetch, setBotOnline } from "./runtimeStatus";
import type { CurrentTrack } from "./types";
import { WidgetUpdater } from "./widgetUpdater";
import { logger, sleep } from "./utils";

/** Monotonic generation so an older in-flight poll cannot overwrite a newer one. */
let updateGeneration = 0;

/** Cached rotation stats from Last.fm. */
let cachedRotation: RotationData = emptyRotationData();
let rotationFetchedAt = 0;
let rotationInFlight: Promise<RotationData> | null = null;

/** Active bottom-stat page index (wraps across STAT_PAGES). */
let pageIndex = 0;
let pageChangedAt = Date.now();

/**
 * Once presence has worked, never invent now-playing from elsewhere.
 * Keep last known track if presence blips unavailable.
 */
let presenceEverWorked = false;
let lastPresenceTrack: CurrentTrack | null = null;
let presenceUnavailableWarned = false;

/**
 * Vinyl.fm — single-user Discord profile widget service.
 *
 * - Now-playing: Discord Spotify presence (every poll / presence event)
 * - Bottom stats: Last.fm, optionally rotating pages every ROTATION_INTERVAL_SECONDS
 */
async function getRotationData(force = false): Promise<RotationData> {
  const ageMs = Date.now() - rotationFetchedAt;
  const stale = ageMs >= config.topsPollSeconds * 1000;

  if (!force && !stale && rotationFetchedAt > 0) {
    return cachedRotation;
  }

  if (rotationInFlight) return rotationInFlight;

  rotationInFlight = fetchRotationData()
    .then((data) => {
      cachedRotation = data;
      rotationFetchedAt = Date.now();
      recordStatsfmFetch(true);
      return data;
    })
    .catch((error: unknown) => {
      logger.error("Failed to fetch rotation stats; keeping last cache", {
        message: error instanceof Error ? error.message : String(error),
      });
      recordStatsfmFetch(false);
      return cachedRotation;
    })
    .finally(() => {
      rotationInFlight = null;
    });

  return rotationInFlight;
}

function advancePageIfNeeded(): void {
  if (!config.rotatingStats) return;

  const elapsed = Date.now() - pageChangedAt;
  const intervalMs = config.rotationIntervalSeconds * 1000;
  if (elapsed < intervalMs) return;

  const steps = Math.floor(elapsed / intervalMs);
  pageIndex = (pageIndex + steps) % STAT_PAGES.length;
  pageChangedAt += steps * intervalMs;

  logger.info("Rotated bottom stats page", {
    pageIndex,
    page: STAT_PAGES[pageIndex]?.title,
    label: `${pageIndex + 1}/${STAT_PAGES.length}`,
  });
}

async function fetchLastfmNowPlaying(): Promise<CurrentTrack | null> {
  const track = await fetchLastfmCurrentTrack();
  if (track) {
    logger.info("Current track from Last.fm now-playing", {
      title: track.title,
      artist: track.artist,
    });
  }
  return track;
}

async function resolveCurrentTrack(client: Client): Promise<CurrentTrack | null> {
  if (config.nowPlayingSource === "lastfm") {
    return fetchLastfmNowPlaying();
  }

  try {
    const presence = await fetchDiscordSpotifyTrack(client);

    if (presence.status === "playing") {
      presenceEverWorked = true;
      lastPresenceTrack = presence.track;
      return presence.track;
    }

    if (presence.status === "idle") {
      presenceEverWorked = true;
      lastPresenceTrack = null;
      logger.info("Spotify closed / not listening — showing idle widget");
      return null;
    }

    if (presenceEverWorked) {
      logger.warn("Presence briefly unavailable; keeping last Spotify state", {
        reason: presence.reason,
        hadTrack: Boolean(lastPresenceTrack),
      });
      return lastPresenceTrack;
    }

    if (config.nowPlayingSource === "discord") {
      if (!presenceUnavailableWarned) {
        logger.warn("Discord presence unavailable; NOWPLAYING_SOURCE=discord so Last.fm fallback is disabled", {
          reason: presence.reason,
        });
        presenceUnavailableWarned = true;
      }
      return null;
    }

    if (!presenceUnavailableWarned) {
      logger.warn("Discord presence unavailable; trying Last.fm now-playing fallback", {
        reason: presence.reason,
      });
      presenceUnavailableWarned = true;
    }
    return fetchLastfmNowPlaying();
  } catch (error) {
    logger.error("Failed to read Discord Spotify presence", {
      message: error instanceof Error ? error.message : String(error),
    });
    return presenceEverWorked ? lastPresenceTrack : null;
  }
}

async function pollOnce(
  client: Client,
  updater: WidgetUpdater,
  trackOverride?: CurrentTrack | null,
): Promise<void> {
  const generation = ++updateGeneration;

  advancePageIfNeeded();

  const trackPromise =
    trackOverride !== undefined
      ? Promise.resolve(trackOverride)
      : resolveCurrentTrack(client);

  const [track, rotation] = await Promise.all([trackPromise, getRotationData()]);

  if (generation !== updateGeneration) {
    logger.info("Skipping stale widget update", {
      generation,
      latest: updateGeneration,
      title: track?.title ?? "(idle)",
    });
    return;
  }

  const { tops, pageLabel } = buildRotatedTopStats(
    rotation,
    pageIndex,
    config.rotatingStats,
  );

  await updater.update({
    track,
    tops,
    pageLabel: config.rotatingStats ? pageLabel : undefined,
  });
}

function spotifySyncId(presence: Presence | null | undefined): string | null {
  return (
    presence?.activities.find(
      (activity) =>
        activity.type === ActivityType.Listening &&
        activity.name.toLowerCase() === "spotify",
    )?.syncId ?? null
  );
}

async function runPollLoop(client: Client, updater: WidgetUpdater): Promise<void> {
  const intervalMs = config.pollSeconds * 1000;
  const stopAt =
    config.maxRuntimeSeconds > 0
      ? Date.now() + config.maxRuntimeSeconds * 1000
      : null;

  logger.info("Starting poll loop", {
    pollSeconds: config.pollSeconds,
    topsPollSeconds: config.topsPollSeconds,
    rotatingStats: config.rotatingStats,
    rotationIntervalSeconds: config.rotationIntervalSeconds,
    pages: STAT_PAGES.map((page) => page.title),
    nowPlaying: config.nowPlayingSource,
    tops: "Last.fm",
    profile: config.profileUrl,
    maxRuntimeSeconds: config.maxRuntimeSeconds,
  });

  await getRotationData(true);
  pageChangedAt = Date.now();

  // Instant now-playing updates when Spotify starts, changes track, or stops.
  // Disabled for NOWPLAYING_SOURCE=lastfm to avoid presence warnings when you only want Last.fm.
  if (config.nowPlayingSource !== "lastfm") {
    client.on(Events.PresenceUpdate, (oldPresence, newPresence) => {
    if (newPresence.userId !== config.discordUserId) return;

    const oldTrack = spotifySyncId(oldPresence);
    const newTrackId = spotifySyncId(newPresence);
    const oldListening = oldTrack !== null;
    const newListening = newTrackId !== null;

    if (oldTrack === newTrackId && oldListening === newListening) return;

    const track = currentTrackFromPresence(newPresence);
    presenceEverWorked = true;
    lastPresenceTrack = track;

    logger.info("Spotify presence changed; refreshing widget", {
      from: oldTrack ?? "(idle)",
      to: newTrackId ?? "(idle)",
      title: track?.title ?? "(idle)",
    });

      void pollOnce(client, updater, track).catch((error: unknown) => {
        logger.error("Presence-triggered poll failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    });
  }

  for (;;) {
    if (stopAt !== null && Date.now() >= stopAt) {
      logger.info("Max runtime reached; exiting poll loop");
      return;
    }

    const started = Date.now();
    try {
      await pollOnce(client, updater);
    } catch (error) {
      logger.error("Poll tick failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const elapsed = Date.now() - started;
    const baseWaitMs = Math.max(0, intervalMs - elapsed);
    const remainingRuntimeMs =
      stopAt === null ? Number.POSITIVE_INFINITY : stopAt - Date.now();

    if (remainingRuntimeMs <= 0) {
      logger.info("Max runtime reached; exiting poll loop");
      return;
    }

    await sleep(Math.min(baseWaitMs, remainingRuntimeMs));
  }
}

async function main(): Promise<void> {
  logger.info("Vinyl.fm widget starting", {
    discordAppId: config.discordAppId,
    discordUserId: config.discordUserId,
    lastfmUsername: config.lastfmUsername,
    rotatingStats: config.rotatingStats,
  });

  const client = createDiscordClient();
  const updater = new WidgetUpdater();

  const shutdown = async (signal: string) => {
    logger.info(`Shutting down (${signal})…`);
    try {
      client.destroy();
    } catch {
      // ignore destroy errors during shutdown
    }
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  client.once(Events.ClientReady, () => {
    setBotOnline(true);
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    void handleSlashCommand(interaction);
  });

  await loginDiscord(client);

  try {
    await deploySlashCommands(client);
  } catch (error) {
    logger.error("Failed to deploy slash commands", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  await runPollLoop(client, updater);
  await shutdown("max runtime reached");
}

main().catch((error: unknown) => {
  logger.error("Fatal error", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
