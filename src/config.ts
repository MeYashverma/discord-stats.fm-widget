import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Load settings from .env in the project root.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim().length === 0) return undefined;
  return value;
};

const optionalUrl = z
  .preprocess(emptyStringToUndefined, z.string().url().optional());

const positiveIntWithDefault = (defaultValue: number) =>
  z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().default(defaultValue),
  );

const nonNegativeIntWithDefault = (defaultValue: number) =>
  z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().nonnegative().default(defaultValue),
  );

const configSchema = z.object({
  DISCORD_APP_ID: z.string().min(1, "DISCORD_APP_ID is required"),
  DISCORD_USER_ID: z.string().min(1, "DISCORD_USER_ID is required"),
  // Bot token lives only in .env as DISCORD_BOT_TOKEN. Never hardcode it.
  DISCORD_BOT_TOKEN: z
    .string()
    .min(1, "DISCORD_BOT_TOKEN is required — set it in your .env file"),
  LASTFM_API_KEY: z.string().min(1, "LASTFM_API_KEY is required"),
  LASTFM_USERNAME: z.string().min(1, "LASTFM_USERNAME is required"),
  // Optional: webhook from the image channel, same approach as Discord-Lyrically-Widget.
  DISCORD_IMAGE_WEBHOOK_URL: optionalUrl,
  // Optional channel used to upload D.W.I.F-corrected album art and get a Discord CDN URL.
  DISCORD_TARGET_CHANNEL_ID: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : undefined;
    }),
  LASTFM_PROFILE_URL: optionalUrl,
  IDLE_IMAGE_URL: optionalUrl,
  // Backup poll for Discord Spotify presence.
  POLL_SECONDS: positiveIntWithDefault(5),
  // Tops change slowly; refresh less often so we can poll recent streams hard.
  TOPS_POLL_SECONDS: positiveIntWithDefault(60),
  CURRENT_TRACK_WINDOW_SECONDS: positiveIntWithDefault(300),
  ROTATING_STATS: z
    .string()
    .optional()
    .transform((value) => value === "true" || value === "1"),
  ROTATION_INTERVAL_SECONDS: positiveIntWithDefault(30),
  // Slash commands: guild (instant, default) or global (set COMMANDS_GLOBAL=true).
  COMMANDS_GLOBAL: z
    .string()
    .optional()
    .transform((value) => value === "true" || value === "1"),
  COMMANDS_GUILD_ID: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : undefined;
    }),
  // GitHub Actions daemon mode: 0 disables auto-exit for local/VPS use.
  MAX_RUNTIME_SECONDS: nonNegativeIntWithDefault(0),
  WIDGET_IMAGE_FIX: z
    .string()
    .optional()
    .transform((value) => value !== "false" && value !== "0"),
  IMAGE_CACHE_DIR: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : ".cache/images";
    }),
});

export type AppConfig = {
  discordAppId: string;
  discordUserId: string;
  /** Discord bot token — never log this value. */
  discordBotToken: string;
  lastfmApiKey: string;
  lastfmUsername: string;
  /** Optional Discord webhook for corrected album art uploads. */
  discordImageWebhookUrl?: string;
  /** Optional channel for uploading corrected album art to Discord CDN. */
  discordTargetChannelId?: string;
  profileUrl: string;
  idleImageUrl?: string;
  pollSeconds: number;
  topsPollSeconds: number;
  currentTrackWindowSeconds: number;
  rotatingStats: boolean;
  rotationIntervalSeconds: number;
  /** Exit cleanly after this many seconds. 0 means run forever. */
  maxRuntimeSeconds: number;
  /** Process album art with the D.W.I.F-style image correction before sending it. */
  widgetImageFix: boolean;
  /** Local cache directory for downloaded/processed images. */
  imageCacheDir: string;
  /** When true, register global slash commands (slow to propagate). */
  commandsGlobal: boolean;
  /** Guild for instant slash command registration in development. */
  commandsGuildId?: string;
};

function loadConfig(): AppConfig {
  const parsed = configSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid configuration: ${details}`);
  }

  const env = parsed.data;

  return {
    discordAppId: env.DISCORD_APP_ID,
    discordUserId: env.DISCORD_USER_ID,
    discordBotToken: env.DISCORD_BOT_TOKEN,
    lastfmApiKey: env.LASTFM_API_KEY,
    lastfmUsername: env.LASTFM_USERNAME,
    discordImageWebhookUrl: env.DISCORD_IMAGE_WEBHOOK_URL,
    discordTargetChannelId: env.DISCORD_TARGET_CHANNEL_ID,
    profileUrl:
      env.LASTFM_PROFILE_URL ??
      `https://www.last.fm/user/${encodeURIComponent(env.LASTFM_USERNAME)}`,
    idleImageUrl: env.IDLE_IMAGE_URL,
    pollSeconds: env.POLL_SECONDS,
    topsPollSeconds: env.TOPS_POLL_SECONDS,
    currentTrackWindowSeconds: env.CURRENT_TRACK_WINDOW_SECONDS,
    rotatingStats: Boolean(env.ROTATING_STATS),
    rotationIntervalSeconds: env.ROTATION_INTERVAL_SECONDS,
    maxRuntimeSeconds: env.MAX_RUNTIME_SECONDS,
    widgetImageFix: Boolean(env.WIDGET_IMAGE_FIX),
    imageCacheDir: env.IMAGE_CACHE_DIR,
    commandsGlobal: Boolean(env.COMMANDS_GLOBAL),
    commandsGuildId: env.COMMANDS_GUILD_ID,
  };
}

export const config = loadConfig();
