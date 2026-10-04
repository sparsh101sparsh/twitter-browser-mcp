import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

describe("MCP Protocol Implementation", () => {
  test("MCP client connects via stdio and discovers post_tweet, search_tweets, and get_profile tools", async () => {
    const serverPath = path.resolve("build/index.js");

    const transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
      stderr: "pipe",
    });

    const client = new Client(
      {
        name: "test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    try {
      await client.connect(transport);

      const toolsResult = await client.listTools();
      assert.ok(toolsResult.tools, "Tools list should be returned");

      const toolNames = toolsResult.tools.map((t) => t.name);
      console.log("Discovered tools:", toolNames);

      assert.ok(toolNames.includes("post_tweet"), "Must include post_tweet");
      assert.ok(toolNames.includes("search_tweets"), "Must include search_tweets");
      assert.ok(toolNames.includes("get_profile"), "Must include get_profile");

      const postTweetTool = toolsResult.tools.find((t) => t.name === "post_tweet");
      assert.ok(postTweetTool);
      assert.ok(postTweetTool.inputSchema.properties.text);
      assert.ok(postTweetTool.inputSchema.properties.media_paths);

      const searchTweetsTool = toolsResult.tools.find((t) => t.name === "search_tweets");
      assert.ok(searchTweetsTool);
      assert.ok(searchTweetsTool.inputSchema.properties.query);
      assert.ok(searchTweetsTool.inputSchema.properties.limit);

      const getProfileTool = toolsResult.tools.find((t) => t.name === "get_profile");
      assert.ok(getProfileTool);
      assert.ok(getProfileTool.inputSchema.properties.username);

      // Verify tool call validation via MCP protocol
      const errorCall = await client.callTool({
        name: "post_tweet",
        arguments: {},
      });
      assert.equal(errorCall.isError, true);
      assert.ok(
        errorCall.content[0].text.includes("Must provide either text content or at least one media path")
      );
    } finally {
      await client.close().catch(() => {});
    }
  });
});
