/** DB enum `NewsRequestStatus`: pending → in progress, success → completed, failed → failed. */
export type NewsRequestStatus = "pending" | "failed" | "success";

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
  newsRequestId: string;
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
  newsRequestId: string;
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
  newsRequest: SerializedNewsRequest;
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
