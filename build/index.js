#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError, } from "@modelcontextprotocol/sdk/types.js";
import { defaultTwitterService } from "./services/twitter.js";
const server = new Server({
    name: "twitter-browser-mcp",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
// Register Tool Discovery
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "post_tweet",
                description: "Posts a tweet with text and optional media attachments (images, GIFs, videos) via browser automation without requiring official API keys.",
                inputSchema: {
                    type: "object",
                    properties: {
                        text: {
                            type: "string",
                            description: "Text content of the tweet (up to 280 characters by default).",
                        },
                        media_paths: {
                            type: "array",
                            items: {
                                type: "string",
                            },
                            description: "Optional list of local file paths to attach (supports PNG, JPG, MP4, MOV, GIF, WEBP).",
                        },
                        allow_long_tweet: {
                            type: "boolean",
                            description: "Set to true to bypass client-side 280-char validation if the account has X Premium.",
                        },
                    },
                    required: [],
                },
            },
            {
                name: "search_tweets",
                description: "Searches tweets on Twitter/X by keyword or hashtag and returns formatted results.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "Search keyword, query, or hashtag.",
                        },
                        limit: {
                            type: "number",
                            description: "Maximum number of tweets to return (default 10, capped at 50 per twitter-safe-use rules).",
                        },
                        mode: {
                            type: "string",
                            enum: ["live", "top"],
                            description: "Search mode: 'live' (latest real-time tweets) or 'top' (top ranked tweets). Default is 'live'.",
                        },
                    },
                    required: ["query"],
                },
            },
            {
                name: "get_profile",
                description: "Fetches public profile details (bio, following, followers, join date) for a Twitter/X user.",
                inputSchema: {
                    type: "object",
                    properties: {
                        username: {
                            type: "string",
                            description: "Twitter/X handle or username (with or without leading @).",
                        },
                    },
                    required: ["username"],
                },
            },
        ],
    };
});
// Register Tool Execution Handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "post_tweet": {
                const result = await defaultTwitterService.postTweet(args);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            }
            case "search_tweets": {
                const result = await defaultTwitterService.searchTweets(args);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            }
            case "get_profile": {
                const result = await defaultTwitterService.getProfile(args);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            }
            default:
                throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
    }
    catch (err) {
        console.error(`[mcp_server] Error executing ${name}:`, err);
        return {
            isError: true,
            content: [
                {
                    type: "text",
                    text: `Error executing ${name}: ${err.message || String(err)}`,
                },
            ],
        };
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[mcp_server] Twitter Browser MCP server running on stdio transport");
}
main().catch((err) => {
    console.error("[mcp_server] Fatal server error:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map