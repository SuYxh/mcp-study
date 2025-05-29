import { Anthropic } from "@anthropic-ai/sdk";
import {
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import dotenv from "dotenv";
import path from "path"; // 导入 path 模块
import { fileURLToPath } from 'url'; // 导入 url 模块

// 获取当前文件的目录路径 (适用于 ES 模块)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 从 dist 目录回退一级到 apps/mcp-client
const envPath = path.resolve(__dirname, "..", ".env"); 
dotenv.config({ path: envPath });

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is not set");
}

interface ServerConnection {
  mcpClient: Client;
  transport: StdioClientTransport;
  tools: Tool[];
}

class MCPClient {
  private serverConnections: Map<string, ServerConnection> = new Map();
  private anthropic: Anthropic;
  private allTools: Tool[] = []; // Aggregated tools from all servers for Anthropic

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
    // this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" }); // Removed: will be created per server
  }
  // methods will go here

  private sanitizePathForToolName(filePath: string): string {
    // Replace any character not in a-zA-Z0-9_- with _
    let sanitized = filePath.replace(/[^a-zA-Z0-9_-]/g, '_');
    // Optional: Replace multiple consecutive underscores with a single one
    sanitized = sanitized.replace(/__+/g, '_');
    // Optional: Trim leading/trailing underscores if any were created
    sanitized = sanitized.replace(/^_+|_+$/g, '');
    return sanitized;
  }

  async connectToServer(serverScriptPath: string) {
    try {
      // Check if already connected to this server to prevent duplicates
      if (this.serverConnections.has(serverScriptPath)) {
        console.log(`Already connected to server: ${serverScriptPath}`);
        return;
      }

      const isJs = serverScriptPath.endsWith(".js");
      const isPy = serverScriptPath.endsWith(".py");
      if (!isJs && !isPy) {
        throw new Error(`Server script ${serverScriptPath} must be a .js or .py file`);
      }
      const command = isPy
        ? process.platform === "win32"
          ? "python"
          : "python3"
        : process.execPath;

      const transport = new StdioClientTransport({
        command,
        args: [serverScriptPath],
      });
      
      const mcpClient = new Client({ name: `mcp-client-for-${serverScriptPath}`, version: "1.0.0" });
      mcpClient.connect(transport);
  
      const toolsResult = await mcpClient.listTools();
      const sanitizedServerPathPrefix = this.sanitizePathForToolName(serverScriptPath);
      const serverTools: Tool[] = toolsResult.tools.map((tool) => {
        // Prefix tool name with serverScriptPath to avoid name collisions
        return {
          name: `${sanitizedServerPathPrefix}__${tool.name}`,
          description: `[${serverScriptPath}] ${tool.description}`,
          input_schema: tool.inputSchema,
        };
      });

      this.serverConnections.set(serverScriptPath, {
        mcpClient,
        transport,
        tools: serverTools,
      });

      // Aggregate tools from all servers
      this.allTools = [];
      for (const [, conn] of this.serverConnections) {
        this.allTools.push(...conn.tools);
      }

      console.log(
        `Connected to server ${serverScriptPath} with tools:`, 
        serverTools.map(({ name }) => name)
      );
      console.log(
        "All available tools from connected servers:",
        this.allTools.map(({ name }) => name)
      );
    } catch (e) {
      console.log(`Failed to connect to MCP server ${serverScriptPath}: `, e);
      // Do not rethrow, allow connecting to other servers
    }
  }

  async processQuery(query: string) {
    console.log("processQuery-query: ", query);
    const messages: MessageParam[] = [
      {
        role: "user",
        content: query,
      },
    ];
  
    const response = await this.anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1000,
      messages,
      tools: this.allTools, // Use aggregated tools from all servers
    });
    // console.log("response: ", response);
  
    const finalText = [];
    // const toolResults = []; // Keep for potential future use, but not strictly needed for current logic
  
    // Add assistant's response (including potential tool_use) to messages history
    if (response.role === 'assistant') {
        messages.push({
            role: response.role,
            content: response.content,
        });
    }

    for (const content of response.content) {
      if (content.type === "text") {
        finalText.push(content.text);
      } else if (content.type === "tool_use") {
        const prefixedToolName = content.name;
        const toolArgs = content.input as { [x: string]: unknown } | undefined;
        const toolUseId = content.id;

        // Find the server and original tool name from the prefixed name
        let targetMcpClient: Client | undefined;
        let originalToolName = '';
        let serverId = '';

        for (const [path, conn] of this.serverConnections) {
          const sanitizedPathPrefixForMatching = `${this.sanitizePathForToolName(path)}__`;
          if (prefixedToolName.startsWith(sanitizedPathPrefixForMatching)) {
            targetMcpClient = conn.mcpClient;
            originalToolName = prefixedToolName.substring(sanitizedPathPrefixForMatching.length); // +2 for '__'
            serverId = path;
            break;
          }
        }

        if (!targetMcpClient) {
          console.error(`Could not find MCP client for tool: ${prefixedToolName}`);
          finalText.push(`[Error: Tool ${prefixedToolName} not found or server not connected]`);
          // Add a tool_error message back to Claude
          messages.push({
            role: "user", // Or assistant role with tool_result content block
            content: [
              {
                type: "tool_result",
                tool_use_id: toolUseId,
                content: `Error: Tool ${prefixedToolName} not found or its server is not connected.`,
                is_error: true,
              }
            ]
          });
          // Potentially make another call to Anthropic with the error, or just return the error text.
          // For simplicity here, we'll just add to finalText and continue to the next message block if any.
          continue; 
        }
        
        finalText.push(
          `[Calling tool ${originalToolName} on server ${serverId} with args ${JSON.stringify(toolArgs)}]`
        );
  
        try {
            console.log("Calling tool: ", originalToolName, " on server: ", serverId, " with args: ", toolArgs);
            const result = await targetMcpClient.callTool({
                name: originalToolName,
                arguments: toolArgs,
            });

            // toolResults.push(result); // Optional: if you need to collect all results
    
            messages.push({
                role: "user", // Anthropic expects tool_result in a 'user' message or specific 'assistant' message structure
                content: [
                    {
                        type: "tool_result",
                        tool_use_id: toolUseId,
                        content: result.content as string, // Or handle non-string content appropriately
                    },
                ],
            });
    
            const followupResponse = await this.anthropic.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 1000,
                messages, // Send the whole history including the tool result
                // tools: this.allTools, // Usually not needed again unless chaining tool calls
            });
    
            // Add assistant's new response to messages history
            if (followupResponse.role === 'assistant') {
                messages.push({
                    role: followupResponse.role,
                    content: followupResponse.content,
                });
            }

            followupResponse.content.forEach(c => {
                if (c.type === "text") finalText.push(c.text);
            });

        } catch (toolError) {
            console.error(`Error calling tool ${originalToolName} on server ${serverId}:`, toolError);
            finalText.push(`[Error executing tool ${originalToolName}: ${(toolError as Error).message}]`);
            messages.push({
                role: "user",
                content: [
                    {
                        type: "tool_result",
                        tool_use_id: toolUseId,
                        content: `Error executing tool ${originalToolName}: ${(toolError as Error).message}`,
                        is_error: true,
                    }
                ]
            });
            // Optionally, make another call to Anthropic with the error message
        }
      }
    }
  
    return finalText.join("\n");
  }

  async chatLoop() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  
    try {
      console.log("\nMCP Client Started! 2 ");
      console.log("Type your queries or 'quit' to exit.");
  
      while (true) {
        const message = await rl.question("\nQuery: ");
        if (message.toLowerCase() === "quit") {
          break;
        }

        console.log("message: ", message);
        const response = await this.processQuery(message);
        console.log("\n" + response);
      }
    } finally {
      rl.close();
    }
  }
  
  async cleanup() {
    console.log("Cleaning up all server connections...");
    for (const [serverScriptPath, connection] of this.serverConnections) {
      try {
        await connection.mcpClient.close();
        await connection.transport.close(); // Corrected: StdioClientTransport has a close method
        console.log(`Closed connection to ${serverScriptPath}`);
      } catch (e) {
        console.error(`Error cleaning up connection to ${serverScriptPath}:`, e);
      }
    }
    this.serverConnections.clear();
    this.allTools = [];
    console.log("Cleanup complete.");
  }

  public getAllTools(): Tool[] {
    return this.allTools;
  }
}

async function main() {
  console.log("process.argv: ", process.argv.length);
  if (process.argv.length < 3) {
    console.log("Usage: node dist/index.js <path_to_server_script_1> [path_to_server_script_2] ...");
    console.log("Example: node dist/index.js ../mcp-server-a/dist/index.js ../mcp-server-b/dist/index.js");
    return;
  }
  const mcpClient = new MCPClient();
  const serverScriptPaths = process.argv.slice(2);

  try {
    for (const serverPath of serverScriptPaths) {
        await mcpClient.connectToServer(serverPath);
    }
    
    if (mcpClient.getAllTools().length === 0) {
        console.log("No tools available from any server. Exiting.");
        await mcpClient.cleanup();
        process.exit(0);
    }

    await mcpClient.chatLoop();
  } catch (error) {
    console.error("An error occurred in main execution:", error);
  } finally {
    await mcpClient.cleanup();
    process.exit(0);
  }
}

main();