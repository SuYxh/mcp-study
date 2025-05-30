import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

//
// Prompt 元信息注册区（用于前端展示、参数填写提示）
//
const PROMPTS = {
  "git-commit": {
    name: "git-commit",
    description: "Generate a Git commit message",
    arguments: [
      {
        name: "changes",
        description: "Git diff or description of changes",
        required: true
      }
    ]
  },
  "explain-code": {
    name: "explain-code",
    description: "Explain how code works",
    arguments: [
      {
        name: "code",
        description: "Code to explain",
        required: true
      },
      {
        name: "language",
        description: "Programming language (optional)",
        required: false
      }
    ]
  },
  "summarize-text": {
    name: "summarize-text",
    description: "Summarize a long piece of text",
    arguments: [
      {
        name: "text",
        description: "Text to summarize",
        required: true
      }
    ]
  }
} as const;

type PromptName = keyof typeof PROMPTS;

//
// 实际的 prompt 执行逻辑：将 arguments 填入 prompt 模板并返回 message 列表
//
function getPromptMessages(name: PromptName, args: Record<string, any>) {
  switch (name) {
    case "git-commit":
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: `Generate a concise but descriptive commit message for these changes:\n\n${args.changes}`
          }
        }
      ];

    case "explain-code":
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: `Explain how this ${args.language || "unknown language"} code works:\n\n${args.code}`
          }
        }
      ];

    case "summarize-text":
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please summarize the following text:\n\n${args.text}`
          }
        }
      ];

    default:
      throw new Error(`Prompt implementation not found: ${name}`);
  }
}

//
// 启动 MCP Server
//
const server = new Server(
  {
    name: "example-prompts-server",
    version: "1.0.0"
  },
  {
    capabilities: {
      prompts: {}
    }
  }
);

//
// 列出所有 prompts 元信息
//
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: Object.values(PROMPTS)
  };
});

//
// 获取某个 prompt 的 message 模板
//
server.setRequestHandler(GetPromptRequestSchema, async (request: any) => {
  const name = request.params.name as PromptName;
  const prompt = PROMPTS[name];
  if (!prompt) {
    throw new Error(`Prompt not found: ${name}`);
  }

  const args = request.params.arguments || {};
  // 校验必填参数
  for (const arg of prompt.arguments) {
    if (arg.required && !(arg.name in args)) {
      throw new Error(`Missing required argument: ${arg.name}`);
    }
  }

  const messages = getPromptMessages(name, args);
  return { messages };
});

//
// 启动监听（如需本地测试可添加 HTTP wrapper）
//
console.log("✅ MCP Prompt Server ready.");


async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("✅ MCP Prompt Server started via stdio transport.");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
