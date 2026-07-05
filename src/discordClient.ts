import {
  Activity,
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  Presence,
} from "discord.js";
import { config } from "./config";
import type { CurrentTrack } from "./types";
import { logger, pickSourceArtUrl } from "./utils";

/**
 * Result of reading Discord Spotify presence.
 * - playing: live Spotify activity
 * - idle: presence readable and not listening
 * - unavailable: cannot read presence (no shared server / intents)
 */
export type PresenceLookup =
  | { status: "playing"; track: CurrentTrack }
  | { status: "idle" }
  | { status: "unavailable"; reason: string };

/**
 * discord.js client:
 * - keeps the bot online
 * - reads live Spotify presence for now-playing (instant track changes)
 *
 * Tops still come from Last.fm.
 *
 * Token source: DISCORD_BOT_TOKEN in .env — never hardcode or log it.
 *
 * Developer Portal → Bot → enable Presence Intent + Server Members Intent.
 * Bot must share a server with DISCORD_USER_ID.
 */
export function createDiscordClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildMembers,
    ],
  });

  client.once(Events.ClientReady, (readyClient) => {
    logger.info("Discord bot is online", {
      tag: readyClient.user.tag,
      id: readyClient.user.id,
      guilds: readyClient.guilds.cache.size,
    });

    if (readyClient.guilds.cache.size === 0) {
      logger.warn(
        "Bot is in 0 servers — Spotify presence and guild slash commands need a shared server. Invite the bot, enable Presence + Server Members intents.",
      );
    }
  });

  client.on(Events.Error, (error) => {
    logger.error("Discord client error", { message: error.message });
  });

  client.on(Events.Warn, (message) => {
    logger.warn("Discord client warning", { message });
  });

  return client;
}

/** Log in with the bot token from config. Does not print the token. */
export async function loginDiscord(client: Client): Promise<void> {
  logger.info("Logging into Discord…");
  await client.login(config.discordBotToken);
}

/** Build a CurrentTrack from a gateway presence payload (no extra API fetch). */
export function currentTrackFromPresence(
  presence: Presence | null | undefined,
): CurrentTrack | null {
  if (!presence) return null;
  return trackFromPresence(presence);
}

/**
 * Read live Spotify activity for DISCORD_USER_ID from a shared guild presence.
 */
export async function fetchDiscordSpotifyTrack(
  client: Client,
): Promise<PresenceLookup> {
  if (!client.isReady()) {
    return { status: "unavailable", reason: "Discord client not ready" };
  }

  if (client.guilds.cache.size === 0) {
    return {
      status: "unavailable",
      reason: "Bot is in 0 servers — invite it to a server you are in",
    };
  }

  for (const guild of client.guilds.cache.values()) {
    try {
      const member = await guild.members.fetch({
        user: config.discordUserId,
        withPresences: true,
      });

      if (!member.presence) {
        logger.warn("Member found but presence is null — check Presence Intent", {
          guildId: guild.id,
        });
        return {
          status: "unavailable",
          reason: "Presence is null (enable Presence Intent)",
        };
      }

      const track = trackFromPresence(member.presence);
      if (track) {
        logger.info("Current track from Discord Spotify presence", {
          title: track.title,
          artist: track.artist,
          guildId: guild.id,
        });
        return { status: "playing", track };
      }

      logger.info("Discord presence idle (no Spotify activity)", {
        guildId: guild.id,
      });
      return { status: "idle" };
    } catch (error) {
      logger.debug("User not in guild or presence fetch failed", {
        guildId: guild.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    status: "unavailable",
    reason:
      "Could not find DISCORD_USER_ID in any shared server — invite the bot to a server you are in",
  };
}

function trackFromPresence(presence: Presence): CurrentTrack | null {
  const activity =
    presence.activities.find(isSpotifyActivity) ??
    presence.activities.find(
      (entry) => entry.type === ActivityType.Listening && Boolean(entry.details),
    );

  if (!activity) return null;
  return trackFromActivity(activity);
}

function isSpotifyActivity(activity: Activity): boolean {
  return (
    activity.type === ActivityType.Listening &&
    activity.name.toLowerCase() === "spotify"
  );
}

function trackFromActivity(activity: Activity): CurrentTrack | null {
  const title = activity.details?.trim();
  if (!title) return null;

  const artist = activity.state?.trim() || "-";
  const album = activity.assets?.largeText?.trim() || "-";
  const images = resolveSpotifyArtwork(activity);

  return {
    title,
    artist,
    album,
    heroImageUrl: pickSourceArtUrl(images),
    endTime: new Date().toISOString(),
  };
}

/**
 * Prefer short i.scdn.co URLs so the 480×360 crop proxy stays short enough.
 */
function resolveSpotifyArtwork(activity: Activity): {
  highRes?: string;
  medium?: string;
  small?: string;
} {
  const largeImage = activity.assets?.largeImage;

  if (largeImage?.startsWith("spotify:")) {
    const id = largeImage.slice("spotify:".length);
    return { highRes: `https://i.scdn.co/image/${id}` };
  }

  const highRes = activity.assets?.largeImageURL({ size: 640 }) ?? undefined;
  if (highRes) return { highRes };

  if (
    largeImage &&
    (largeImage.startsWith("http://") || largeImage.startsWith("https://"))
  ) {
    return { highRes: largeImage };
  }

  return {};
}
