/** The one place the iTunes Search API host is named (ADR 0010 §1). */
export const ITUNES_API_BASE = 'https://itunes.apple.com';

export const itunesEndpoints = {
  search: `${ITUNES_API_BASE}/search`,
  lookup: `${ITUNES_API_BASE}/lookup`,
} as const;
