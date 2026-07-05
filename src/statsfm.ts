import axios, { AxiosError } from "axios";
import { config } from "./config";
import type { CurrentTrack, TopStats } from "./types";
import {
  averageDailyMinutes,
  buildRotatedTopStats,
  emptyRotationData,
  formatAccountAge,
  formatCount,
  formatMinutesFromMs,
  type RotationData,
} from "./rotatingStats";
import {
  joinArtists,
  logger,
  pickSourceArtUrl,
  retryAfterMs,
  sleep,
} from "./utils";

const http = axios.create({
  timeout: 15_000,
  headers: {
    Accept: "application/json",
    "User-Agent": "StatsFmWidget/1.0 (stats.fm Discord profile widget)",
  },
  // Treat 204 as success with empty body.
  validateStatus: (status) => (status >= 200 && status < 300) || status === 204,
});

interface StatsFmExternalIds {
  spotify?: string[];
  appleMusic?: string[];
}

interface StatsFmArtist {
  id?: number;
  name?: string;
  image?: string;
  externalIds?: StatsFmExternalIds;
}

interface StatsFmAlbum {
  id?: number;
  name?: string;
  image?: string;
  artists?: StatsFmArtist[];
  externalIds?: StatsFmExternalIds;
}

interface StatsFmTrack {
  id?: number;
  name?: string;
  artists?: StatsFmArtist[];
  albums?: StatsFmAlbum[];
  externalIds?: StatsFmExternalIds;
}

interface StatsFmStream {
  endTime?: string;
  track?: StatsFmTrack;
  durationMs?: number;
}

interface ItemsResponse<T> {
  items?: T[];
}

async function getJson<T>(url: string, label: string): Promise<T | null> {
  logger.info(`stats.fm request [${label}]`, { url });

  try {
    const response = await http.get<T>(url);

    if (response.status === 204 || response.data == null || response.data === "") {
      logger.warn(`stats.fm returned empty response [${label}]`, {
        status: response.status,
        url,
      });
      return null;
    }

    return response.data;
  } catch (error) {
    await handleHttpError(error, label, url);
    return null;
  }
}

async function handleHttpError(
  error: unknown,
  label: string,
  url: string,
): Promise<void> {
  if (!axios.isAxiosError(error)) {
    logger.error(`stats.fm request failed [${label}]`, {
      url,
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const axiosError = error as AxiosError;
  const status = axiosError.response?.status;
  const headers = axiosError.response?.headers as Record<string, unknown> | undefined;

  if (status === 401 || status === 403) {
    logger.error(`stats.fm access denied [${label}]`, { status, url });
    return;
  }

  if (status === 429) {
    const waitMs = retryAfterMs(headers, 5_000);
    logger.warn(`stats.fm rate limited [${label}], backing off`, {
      status,
      url,
      waitMs,
    });
    await sleep(waitMs);
    return;
  }

  logger.error(`stats.fm request failed [${label}]`, {
    status,
    url,
    message: axiosError.message,
  });
}

function pickFirstItem<T>(payload: ItemsResponse<T> | T[] | null): T | null {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload[0] ?? null;
  if (Array.isArray(payload.items)) return payload.items[0] ?? null;
  return null;
}

function mapStreamToTrack(stream: StatsFmStream): CurrentTrack | null {
  const track = stream.track;
  if (!track?.name) return null;

  const artists = track.artists ?? [];
  const album = track.albums?.[0];
  const artistName = joinArtists(artists) || "Unknown artist";
  const albumName = album?.name?.trim() || "Unknown album";

  const albumImage = album?.image?.trim();
  const artistImage = artists[0]?.image?.trim();

  return {
    title: track.name.trim(),
    artist: artistName,
    album: albumName,
    // Prefer album art, then artist image (source URL; cropped at PATCH time).
    heroImageUrl: pickSourceArtUrl({
      highRes: albumImage,
      medium: artistImage,
    }),
    endTime: stream.endTime ?? "",
  };
}

/**
 * Fetch the newest stream and, if it ended within the configured window,
 * treat it as currently playing.
 */
export async function fetchCurrentTrack(): Promise<CurrentTrack | null> {
  const payload = await getJson<ItemsResponse<StatsFmStream> | StatsFmStream[]>(
    config.statsmUrls.recent,
    "recent",
  );

  const newest = pickFirstItem(payload);
  if (!newest) {
    logger.info("No recent streams from stats.fm");
    return null;
  }

  const track = mapStreamToTrack(newest);
  if (!track) {
    logger.warn("Newest stream was missing track metadata");
    return null;
  }

  if (!track.endTime) {
    logger.warn("Newest stream missing endTime; treating as not playing");
    return null;
  }

  const endMs = Date.parse(track.endTime);
  if (Number.isNaN(endMs)) {
    logger.warn("Newest stream had invalid endTime", { endTime: track.endTime });
    return null;
  }

  const ageSeconds = (Date.now() - endMs) / 1000;
  if (ageSeconds > config.currentTrackWindowSeconds) {
    logger.info("Newest stream is outside the current-track window", {
      title: track.title,
      ageSeconds: Math.round(ageSeconds),
      windowSeconds: config.currentTrackWindowSeconds,
    });
    return null;
  }

  logger.info("Current track detected", {
    title: track.title,
    artist: track.artist,
    ageSeconds: Math.round(ageSeconds),
  });

  return track;
}

async function fetchTopName(
  url: string,
  label: string,
  extract: (item: Record<string, unknown>) => string | undefined,
): Promise<string> {
  const payload = await getJson<ItemsResponse<Record<string, unknown>> | Record<string, unknown>[]>(
    url,
    label,
  );
  const item = pickFirstItem(payload);
  if (!item) return "-";

  const name = extract(item)?.trim();
  return name && name.length > 0 ? name : "-";
}

function artistNameFromItem(item: Record<string, unknown>): string | undefined {
  const artist = item.artist as StatsFmArtist | undefined;
  return artist?.name ?? (item.name as string | undefined);
}

function albumNameFromItem(item: Record<string, unknown>): string | undefined {
  const album = item.album as StatsFmAlbum | undefined;
  return album?.name ?? (item.name as string | undefined);
}

/** Format as "Song - Artist" to match the widget layout. */
function trackLabelFromItem(item: Record<string, unknown>): string | undefined {
  const track = item.track as StatsFmTrack | undefined;
  const title = track?.name?.trim() || (item.name as string | undefined)?.trim();
  if (!title) return undefined;

  const artist = joinArtists(track?.artists ?? []);
  return artist ? `${title} - ${artist}` : title;
}

/** Pull top artist / album / song for the last 4 weeks and last 6 months. */
export async function fetchTopStats(): Promise<TopStats> {
  const data = await fetchRotationData();
  return buildRotatedTopStats(data, 0, false).tops;
}

interface StreamStatsItems {
  durationMs?: number;
  count?: number;
  cardinality?: {
    tracks?: number;
    artists?: number;
    albums?: number;
  };
}

interface StreamStatsResponse {
  items?: StreamStatsItems;
}

function readStreamStats(payload: StreamStatsResponse | null): StreamStatsItems {
  return payload?.items ?? {};
}

/**
 * Bundle every value needed by rotating stat pages.
 * Missing stats.fm fields become "-" via the formatters / emptyRotationData.
 */
export async function fetchRotationData(): Promise<RotationData> {
  const base = `https://api.stats.fm/api/v1/users/${encodeURIComponent(config.statsmUsername)}`;
  const data = emptyRotationData();

  const [
    topArtist4w,
    topAlbum4w,
    topSong4w,
    topArtist6m,
    topAlbum6m,
    topSong6m,
    todayStats,
    weekStats,
    monthStats,
    lifetimeStats,
    profile,
    recent,
    topGenre,
  ] = await Promise.all([
    fetchTopName(config.statsmUrls.topArtists4w, "top-artists-4w", artistNameFromItem),
    fetchTopName(config.statsmUrls.topAlbums4w, "top-albums-4w", albumNameFromItem),
    fetchTopName(config.statsmUrls.topTracks4w, "top-tracks-4w", trackLabelFromItem),
    fetchTopName(config.statsmUrls.topArtists6m, "top-artists-6m", artistNameFromItem),
    fetchTopName(config.statsmUrls.topAlbums6m, "top-albums-6m", albumNameFromItem),
    fetchTopName(config.statsmUrls.topTracks6m, "top-tracks-6m", trackLabelFromItem),
    getJson<StreamStatsResponse>(`${base}/streams/stats?range=today`, "stats-today"),
    getJson<StreamStatsResponse>(`${base}/streams/stats?range=weeks`, "stats-weeks"),
    getJson<StreamStatsResponse>(`${base}/streams/stats?range=months`, "stats-months"),
    getJson<StreamStatsResponse>(`${base}/streams/stats?range=lifetime`, "stats-lifetime"),
    getJson<{ item?: { createdAt?: string } }>(base, "profile"),
    getJson<ItemsResponse<StatsFmStream> | StatsFmStream[]>(
      config.statsmUrls.recent,
      "recent-discovery",
    ),
    getJson<ItemsResponse<Record<string, unknown>>>(
      `${base}/top/genres?range=lifetime&limit=1`,
      "top-genre",
    ),
  ]);

  data.topArtist4w = topArtist4w;
  data.topAlbum4w = topAlbum4w;
  data.topSong4w = topSong4w;
  data.topArtist6m = topArtist6m;
  data.topAlbum6m = topAlbum6m;
  data.topSong6m = topSong6m;

  const today = readStreamStats(todayStats);
  const week = readStreamStats(weekStats);
  const month = readStreamStats(monthStats);
  const lifetime = readStreamStats(lifetimeStats);

  data.minutesToday = formatMinutesFromMs(today.durationMs);
  data.minutesWeek = formatMinutesFromMs(week.durationMs);
  data.minutesMonth = formatMinutesFromMs(month.durationMs);
  data.totalStreams = formatCount(lifetime.count);
  data.uniqueArtists = formatCount(lifetime.cardinality?.artists);
  data.uniqueTracks = formatCount(lifetime.cardinality?.tracks);

  data.artistsMonth = formatCount(month.cardinality?.artists);
  data.albumsMonth = formatCount(month.cardinality?.albums);
  data.tracksMonth = formatCount(month.cardinality?.tracks);

  // Last streamed artist / album / song from the newest recent stream.
  const lastStream = pickFirstItem(recent);
  if (lastStream?.track) {
    data.newestArtist = joinArtists(lastStream.track.artists ?? []) || "-";
    data.newestAlbum = lastStream.track.albums?.[0]?.name?.trim() || "-";
    data.newestTrack = lastStream.track.name?.trim() || "-";
  }

  const createdAt = profile?.item?.createdAt;
  data.lifetimeMinutes = formatMinutesFromMs(lifetime.durationMs);
  data.lifetimeStreams = formatCount(lifetime.count);
  data.averageDaily = averageDailyMinutes(lifetime.durationMs, createdAt);
  data.librarySize = formatCount(lifetime.cardinality?.tracks);
  data.accountAge = formatAccountAge(createdAt);

  const genreItem = pickFirstItem(topGenre);
  const genre = genreItem?.genre as { tag?: string } | string | undefined;
  if (typeof genre === "string" && genre.trim()) {
    data.topGenre = genre.trim();
  } else if (genre && typeof genre === "object" && genre.tag?.trim()) {
    data.topGenre = genre.tag.trim();
  }

  return data;
}
