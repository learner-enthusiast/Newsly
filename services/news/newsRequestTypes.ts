/** DB enum `NewsRequestStatus`: pending → in progress, success → completed, failed → failed. */
export type NewsRequestStatus = "pending" | "failed" | "success";

export type NewsStoryStatus =
  | "PENDING"
  | "READY"
  | "FAILED"
  | "DRAFT"
  | "PUBLISHED"
  | "ARCHIVED";

export type NewsStoryCreator = "SYSTEM" | "USER";

export type NewsStoryProvenance = "SYSTEM" | "USER_RESEARCHED" | "USER_EDITED";

export type ChatStoryCreationPayload = {
  storyId: string;
  status: NewsStoryStatus;
  creator: NewsStoryCreator;
  provenance: NewsStoryProvenance;
};

export type SerializedStorySourceLink = {
  id: string;
  url: string;
  title: string;
  domain: string;
};

export type SerializedNewsRequest = {
  id: string;
  userId: string;
  date: string;
  location: string | null;
  scope: string;
  status: NewsRequestStatus;
  error: string | null;
  storyCount: number;
  categories: string[];
  customQuery: string | null;
  language: string | null;
  sources: string[];
  loadingLogs: string[];
  createdAt: string;
  completedAt: string | null;
};

export type SerializedTrendingNewsStory = {
  id: string;
  newsRequestId: string | null;
  title: string;
  description: string | null;
  summary: string;
  category: string;
  location: string | null;
  publishedAt: string | null;
  upvotes: number;
  downvotes: number;
  importanceScore: number | null;
  imageUrl: string | null;
  sourceUrls: SerializedStorySourceLink[];
};

export type SerializedNewsStory = {
  id: string;
  newsRequestId: string | null;
  status: NewsStoryStatus;
  creator: NewsStoryCreator;
  provenance: NewsStoryProvenance;
  title: string;
  summary: string;
  description: string | null;
  content: string;
  category: string;
  location: string | null;
  publishedAt: string | null;
  importanceScore: number | null;
  imageUrl: string | null;
  sourceUrls: SerializedStorySourceLink[];
  upvotes: number;
  downvotes: number;
  netVotes: number;
  userVote: "UP" | "DOWN" | null;
  userSaved: boolean;
};

export type NewsRequestResultPayload = {
  newsRequest: SerializedNewsRequest;
  stories: SerializedNewsStory[];
};

export type NewsStoryPagePayload = {
  newsRequest: SerializedNewsRequest | null;
  story: SerializedNewsStory;
  canViewFullBriefing: boolean;
};

export type NewsStoriesListPayload = {
  stories: SerializedNewsStory[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
