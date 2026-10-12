/** Client-safe: API key scopes and their descriptions. */

export const API_SCOPES = [
  "news:read",
  "news:write",
  "research:read",
  "research:write",
  "instruments:read",
  "newsletters:read",
  "newsletters:write",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export const API_SCOPE_DESCRIPTIONS: Record<ApiScope, string> = {
  "news:read": "Read public stories and your own briefings",
  "news:write": "Create news briefings (counts against the daily quota)",
  "research:read": "Read your stock, ETF and mutual fund research reports",
  "research:write": "Start research reports (counts against the daily quota)",
  "instruments:read": "Search stocks, ETFs and mutual funds",
  "newsletters:read": "List and read your newsletters",
  "newsletters:write": "Create, update, pause and delete your newsletters",
};

/** Pre-checked in the create dialog: read-only access plus instrument search. */
export const DEFAULT_API_SCOPES: ApiScope[] = [
  "news:read",
  "research:read",
  "instruments:read",
  "newsletters:read",
];

export const API_KEY_EXPIRY_OPTIONS = ["30", "90", "365", "never"] as const;

export type ApiKeyExpiryOption = (typeof API_KEY_EXPIRY_OPTIONS)[number];

export const API_KEY_EXPIRY_LABELS: Record<ApiKeyExpiryOption, string> = {
  "30": "30 days",
  "90": "90 days",
  "365": "1 year",
  never: "Never",
};

export type ApiKeyStatus = "active" | "revoked" | "expired" | "suspended";

/** Shape the Developers page receives — never includes the hash. */
export type SerializedApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiScope[];
  status: ApiKeyStatus;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  usage: { requestsToday: number; requestsThisMonth: number; pipelineJobsToday: number };
};

export type DevelopersPayload = {
  plan: "free" | "pro";
  limits: {
    requestsPerMinute: number;
    pipelineJobsPerDay: number;
    maxActiveKeys: number;
  };
  usage: { requestsToday: number; requestsThisMonth: number; pipelineJobsToday: number };
  keys: SerializedApiKey[];
};
