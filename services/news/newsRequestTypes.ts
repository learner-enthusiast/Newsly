/** DB enum `NewsRequestStatus`: pending → in progress, success → completed, failed → failed. */
export type NewsRequestStatus = "pending" | "failed" | "success";

export const RECENT_NEWS_REQUEST_LIMIT = 4;
export const USER_NEWS_REQUESTS_PAGE_SIZE = 10;
export const USER_NEWS_REQUESTS_MAX_LIMIT = 50;

export type PublishStatus = "draft" | "published";

export type ChatStoryCreationPayload = {
  storyId: string;
  isUserCreated: true;
  publishStatus: PublishStatus;
  isGenerating: boolean;
  generationFailed: boolean;
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
  /** Stories actually created for this request. */
  createdStoryCount: number;
  searchQueries: {
    news: string;
    search: string;
    extraPairs: Array<{ news: string; search: string }>;
  } | null;
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
  isUserCreated: boolean;
  publishStatus: PublishStatus;
  ownerId: string | null;
  isGenerating: boolean;
  generationFailed: boolean;
  generationError: string | null;
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
  createdAt: string;
  updatedAt: string;
  loadingLogs: string[];
  canEdit: boolean;
  originChatSessionId: string | null;
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
