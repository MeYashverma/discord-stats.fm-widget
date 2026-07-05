/** Text field in the Discord profile widget dynamic payload. */
export interface WidgetTextField {
  type: 1;
  name: string;
  value: string;
}

/** Image field in the Discord profile widget dynamic payload. */
export interface WidgetImageField {
  type: 3;
  name: string;
  value: { url: string };
}

export type WidgetField = WidgetTextField | WidgetImageField;

export interface WidgetPayload {
  /**
   * Required for Discord to bind dynamic data to the profile widget.
   * Without this, Discord keeps showing the designer fallback/sample values.
   */
  username: string;
  data: {
    dynamic: WidgetField[];
  };
}

/** Normalized currently-playing / recent track for the widget. */
export interface CurrentTrack {
  title: string;
  artist: string;
  album: string;
  heroImageUrl: string;
  /** ISO timestamp of the stream end time from stats.fm. */
  endTime: string;
}

/**
 * Bottom six stat cards.
 * Headers (hdr_*) bind to Stat "Value" in the widget editor (small text).
 * Values (top_*) bind to Stat "Label" in the widget editor (large text).
 * Both must be User Data or headers stay stuck on "Top Artist(4w)" etc.
 */
export interface TopStats {
  hdrArtist4w: string;
  hdrAlbum4w: string;
  hdrSong4w: string;
  hdrArtist6m: string;
  hdrAlbum6m: string;
  hdrSong6m: string;
  topArtist4w: string;
  topAlbum4w: string;
  topSong4w: string;
  topArtist6m: string;
  topAlbum6m: string;
  topSong6m: string;
}

export interface WidgetSnapshot {
  track: CurrentTrack | null;
  tops: TopStats;
  /** Optional page indicator, e.g. "2/4 · Listening Stats". */
  pageLabel?: string;
}

/** Names of every dynamic field the Discord widget expects. */
export const WIDGET_FIELD_NAMES = [
  "title",
  "artist",
  "album",
  "subtitle",
  "hero_image",
  "hdr_artist_4w",
  "hdr_album_4w",
  "hdr_song_4w",
  "hdr_artist_6m",
  "hdr_album_6m",
  "hdr_song_6m",
  "top_artist_4w",
  "top_album_4w",
  "top_song_4w",
  "top_artist_6m",
  "top_album_6m",
  "top_song_6m",
] as const;

export type WidgetFieldName = (typeof WIDGET_FIELD_NAMES)[number];
