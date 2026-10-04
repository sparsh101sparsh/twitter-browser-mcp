import { BrowserSessionManager } from "../browser/session.js";
import type { PostTweetArgs, PostTweetResult, SearchTweetsArgs, SearchTweetsResult, GetProfileArgs, TwitterProfile } from "../types.js";
export declare class TwitterService {
    private sessionManager;
    constructor(sessionManager?: BrowserSessionManager);
    postTweet(args: PostTweetArgs): Promise<PostTweetResult>;
    searchTweets(args: SearchTweetsArgs): Promise<SearchTweetsResult>;
    getProfile(args: GetProfileArgs): Promise<TwitterProfile>;
}
export declare const defaultTwitterService: TwitterService;
