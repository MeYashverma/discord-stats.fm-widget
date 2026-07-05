import axios, { AxiosError } from "axios";
import { config } from "./config";
import type { CurrentTrack, TopStats } from "./types";
import {
  buildRotatedTopStats,
  emptyRotationData,
  formatAccountAge,
  formatCount,
  type RotationData,
} from "./rotatingStats";
import { logger, retryAfterMs, sleep } from "./utils";

const LASTFM_API_URL = "https://ws.audioscrobbler.com/2.0/";

const http = axios.create({
  timeout: 15_000,
  headers: {
    Accept: "application/json",
    "User-Agent": "LastFmDiscordWidget/1.0 (Discord profile widget)",
  },
  validateStatus: (status) => status >= 200 && status < 300,
});

type LastfmImage = { size?: string; "#text"?: string };
type LastfmArtistRef = string | { name?: string; "#text"?: string };
type LastfmAlbumRef = string | { name?: string; "#text"?: string };

type LastfmTrack = {
  name?: string;
  artist?: LastfmArtistRef;
  album?: LastfmAlbumRef;
  image?: LastfmImage[];
  "@attr"?: { nowplaying?: string };
};

type LastfmTopArtist = { name?: string; playcount?: string };
type LastfmTopAlbum = { name?: string; artist?: { name?: string }; playcount?: string };
type LastfmTopTrack = { name?: string; artist?: { name?: string }; playcount?: string };

type LastfmUserInfo = {
  user?: {
    playcount?: string;
    registered?: { unixtime?: string; "#text"?: string };
  };
};

async function lastfmGet<T>(
  method: string,
  params: Record<string, string | number | undefined>,
  label: string,
): Promise<T | null> {
  const fullParams = {
    method,
    user: config.lastfmUsername,
    api_key: config.lastfmApiKey,
    format: "json",
    ...params,
  };

  logger.info(`Last.fm request [${label}]`, { method });

  try {
    const response = await http.get<T>(LASTFM_API_URL, { params: fullParams });
    return response.data;
  } catch (error) {
    await handleHttpError(error, label, method);
    return null;
  }
}

async function handleHttpError(error: unknown, label: string, method: string): Promise<void> {
  if (!axios.isAxiosError(error)) {
    logger.error(`Last.fm request failed [${label}]`, {
      method,
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const axiosError = error as AxiosError;
  const status = axiosError.response?.status;
  const headers = axiosError.response?.headers as Record<string, unknown> | undefined;

  if (status === 429) {
    const waitMs = retryAfterMs(headers, 5_000);
    logger.warn(`Last.fm rate limited [${label}], backing off`, { status, method, waitMs });
    await sleep(waitMs);
    return;
  }

  logger.error(`Last.fm request failed [${label}]`, {
    status,
    method,
    message: axiosError.message,
  });
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function artistName(artist: LastfmArtistRef | undefined): string {
  if (!artist) return "";
  return typeof artist === "string" ? artist : artist.name ?? artist["#text"] ?? "";
}

function albumName(album: LastfmAlbumRef | undefined): string {
  if (!album) return "";
  return typeof album === "string" ? album : album.name ?? album["#text"] ?? "";
}

function bestImage(images: LastfmImage[] | undefined): string {
  return [...(images ?? [])]
    .reverse()
    .map((image) => image["#text"]?.trim() ?? "")
    .find(Boolean) ?? "";
}

function totalFromAttr(container: unknown): number | undefined {
  const attr = (container as { "@attr"?: { total?: string } } | undefined)?.["@attr"];
  const total = Number(attr?.total);
  return Number.isFinite(total) ? total : undefined;
}

function trackLabel(track: LastfmTopTrack | undefined): string {
  if (!track?.name) return "-";
  const artist = track.artist?.name?.trim();
  return artist ? `${track.name} - ${artist}` : track.name;
}

function albumLabel(album: LastfmTopAlbum | undefined): string {
  if (!album?.name) return "-";
  const artist = album.artist?.name?.trim();
  return artist ? `${album.name} - ${artist}` : album.name;
}

async function fetchTopArtist(period: string): Promise<string> {
  const payload = await lastfmGet<{ topartists?: { artist?: LastfmTopArtist[] } }>(
    "user.gettopartists",
    { period, limit: 1 },
    `top-artists-${period}`,
  );
  return payload?.topartists?.artist?.[0]?.name?.trim() || "-";
}

async function fetchTopAlbum(period: string): Promise<string> {
  const payload = await lastfmGet<{ topalbums?: { album?: LastfmTopAlbum[] } }>(
    "user.gettopalbums",
    { period, limit: 1 },
    `top-albums-${period}`,
  );
  return albumLabel(payload?.topalbums?.album?.[0]);
}

async function fetchTopTrack(period: string): Promise<string> {
  const payload = await lastfmGet<{ toptracks?: { track?: LastfmTopTrack[] } }>(
    "user.gettoptracks",
    { period, limit: 1 },
    `top-tracks-${period}`,
  );
  return trackLabel(payload?.toptracks?.track?.[0]);
}

async function fetchTotal(
  method: "user.gettopartists" | "user.gettopalbums" | "user.gettoptracks",
  period: string,
  label: string,
): Promise<number | undefined> {
  const payload = await lastfmGet<Record<string, unknown>>(
    method,
    { period, limit: 1 },
    label,
  );
  const root = method === "user.gettopartists"
    ? payload?.topartists
    : method === "user.gettopalbums"
      ? payload?.topalbums
      : payload?.toptracks;
  return totalFromAttr(root);
}

async function fetchRecent(limit = 1): Promise<LastfmTrack[]> {
  const payload = await lastfmGet<{ recenttracks?: { track?: LastfmTrack | LastfmTrack[] } }>(
    "user.getrecenttracks",
    { limit, extended: 0 },
    "recent",
  );
  return asArray(payload?.recenttracks?.track);
}

/** Optional Last.fm now-playing source. Discord presence is still preferred by default. */
export async function fetchCurrentTrack(): Promise<CurrentTrack | null> {
  const recent = await fetchRecent(1);
  const track = recent[0];
  if (!track || !track["@attr"]?.nowplaying) return null;

  const title = track.name?.trim();
  if (!title) return null;

  return {
    title,
    artist: artistName(track.artist).trim() || "Unknown artist",
    album: albumName(track.album).trim() || "Unknown album",
    heroImageUrl: bestImage(track.image),
    endTime: new Date().toISOString(),
  };
}

/** Classic static top stats API. */
export async function fetchTopStats(): Promise<TopStats> {
  const data = await fetchRotationData();
  return buildRotatedTopStats(data, 0, false).tops;
}

/** Bundle every value needed by rotating stat pages, backed by Last.fm. */
export async function fetchRotationData(): Promise<RotationData> {
  const data = emptyRotationData();

  const [
    topArtist1m,
    topAlbum1m,
    topTrack1m,
    topArtist6m,
    topAlbum6m,
    topTrack6m,
    totalTracks1m,
    totalArtists1m,
    totalAlbums1m,
    totalTracksOverall,
    totalArtistsOverall,
    userInfo,
    recent,
    topArtistOverall,
  ] = await Promise.all([
    fetchTopArtist("1month"),
    fetchTopAlbum("1month"),
    fetchTopTrack("1month"),
    fetchTopArtist("6month"),
    fetchTopAlbum("6month"),
    fetchTopTrack("6month"),
    fetchTotal("user.gettoptracks", "1month", "tracks-month-total"),
    fetchTotal("user.gettopartists", "1month", "artists-month-total"),
    fetchTotal("user.gettopalbums", "1month", "albums-month-total"),
    fetchTotal("user.gettoptracks", "overall", "tracks-overall-total"),
    fetchTotal("user.gettopartists", "overall", "artists-overall-total"),
    lastfmGet<LastfmUserInfo>("user.getinfo", { user: config.lastfmUsername }, "profile"),
    fetchRecent(1),
    fetchTopArtist("overall"),
  ]);

  data.topArtist4w = topArtist1m;
  data.topAlbum4w = topAlbum1m;
  data.topSong4w = topTrack1m;
  data.topArtist6m = topArtist6m;
  data.topAlbum6m = topAlbum6m;
  data.topSong6m = topTrack6m;

  const playcount = Number(userInfo?.user?.playcount ?? 0);
  data.minutesToday = "Last.fm only";
  data.minutesWeek = "Scrobbles";
  data.minutesMonth = formatCount(totalTracks1m);
  data.totalStreams = Number.isFinite(playcount) && playcount > 0 ? formatCount(playcount) : "-";
  data.uniqueArtists = formatCount(totalArtistsOverall);
  data.uniqueTracks = formatCount(totalTracksOverall);

  data.artistsMonth = formatCount(totalArtists1m);
  data.albumsMonth = formatCount(totalAlbums1m);
  data.tracksMonth = formatCount(totalTracks1m);

  const last = recent[0];
  if (last) {
    data.newestArtist = artistName(last.artist).trim() || "-";
    data.newestAlbum = albumName(last.album).trim() || "-";
    data.newestTrack = last.name?.trim() || "-";
  }

  const registeredUnix = Number(userInfo?.user?.registered?.unixtime ?? 0);
  const createdAt = registeredUnix > 0 ? new Date(registeredUnix * 1000).toISOString() : undefined;
  data.lifetimeMinutes = "N/A";
  data.lifetimeStreams = data.totalStreams;
  data.averageDaily = "N/A";
  data.topGenre = topArtistOverall;
  data.librarySize = formatCount(totalTracksOverall);
  data.accountAge = formatAccountAge(createdAt);

  return data;
}
