export interface PostTweetArgs {
  text?: string;
  media_paths?: string[];
  allow_long_tweet?: boolean;
}

export interface PostTweetResult {
  status: "success" | "error";
  message: string;
  tweet_url?: string;
  tweet_id?: string;
  text?: string;
  media_count?: number;
}

export interface SearchTweetsArgs {
  query: string;
  limit?: number;
  mode?: "live" | "top";
}

export interface TweetItem {
  id?: string;
  author_name: string;
  author_handle: string;
  timestamp?: string;
  url?: string;
  text: string;
  replies?: string;
  retweets?: string;
  likes?: string;
  has_media?: boolean;
}

export interface SearchTweetsResult {
  query: string;
  mode: string;
  count: number;
  tweets: TweetItem[];
}

export interface GetProfileArgs {
  username: string;
}

export interface TwitterProfile {
  username: string;
  name: string;
  handle: string;
  bio?: string;
  location?: string;
  url?: string;
  joined?: string;
  following?: string;
  followers?: string;
  verified?: boolean;
  profile_url: string;
}

export interface PlaywrightCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}
