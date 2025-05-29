# MCP Study Project

这是一个基于 pnpm monorepo 的项目，旨在学习和演示 Model Context Protocol (MCP) 的使用。

## 目录结构

```
.
├── apps
│   ├── fetch-mcp-server    # MCP 服务器，提供基于 URL 内容的问答服务
│   ├── mcp-client          # MCP 客户端，用于与 MCP 服务器交互
│   └── weather-mcp-server  # MCP 服务器，提供天气查询服务
├── packages
│   └── mcp-client-core     # (规划中) MCP 客户端核心逻辑
├── package.json            # 根项目的 package.json
├── pnpm-lock.yaml
└── pnpm-workspace.yaml     # pnpm monorepo 配置文件
```

## 主要功能

### `fetch-mcp-server`

- **描述**: 一个 MCP 服务器，它接收一个 URL，获取该 URL 的内容，并允许客户端基于这些内容进行提问。
- **主要依赖**: `@modelcontextprotocol/sdk`, `express`, `jsdom`, `turndown`, `zod`
- **启动脚本**: (通过 `mcp-client` 间接启动)

### `weather-mcp-server`

- **描述**: 一个 MCP 服务器，提供天气查询服务。它使用和风天气 API 获取指定地点的天气预报。
- **主要依赖**: `@modelcontextprotocol/sdk`, `express`, `dotenv`, `zod`
- **启动脚本**: (通过 `mcp-client` 间接启动)
- **环境变量**: 需要设置 `QWEATHER_API_KEY` (和风天气 API 密钥)。可选设置 `QWEATHER_API_HOST`。

### `mcp-client`

- **描述**: 一个 MCP 客户端，可以连接到一个或多个 MCP 服务器，并通过命令行与这些服务器进行交互。
- **主要依赖**: `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`, `dotenv`, `readline`
- **启动脚本**: 见下方 "如何运行" 部分。
- **环境变量**: 需要设置 `ANTHROPIC_API_KEY` (Anthropic API 密钥)。

## 如何构建

在项目根目录下运行以下命令来构建所有子项目：

```bash
pnpm build
```

这将递归执行 `apps` 目录下所有子包中定义的 `build` 脚本 (通常是 `rslib build`)。

## 如何运行

确保在运行前已经成功构建了所有项目 (`pnpm build`)。

### 运行 `weather-mcp-server` 和 `mcp-client`

此命令将启动 `weather-mcp-server` 并通过 `mcp-client` 与其交互。

```bash
pnpm run dev:weather
```

### 运行 `fetch-mcp-server` 和 `mcp-client`

此命令将启动 `fetch-mcp-server` 并通过 `mcp-client` 与其交互。

```bash
pnpm run dev:fetch
```

### 运行所有服务

此命令将同时启动 `weather-mcp-server` 和 `fetch-mcp-server`，并允许 `mcp-client` 与两者交互。

```bash
pnpm run dev
```

**注意**: 
- `mcp-client` 会尝试连接到命令行参数中指定的所有服务器。
- 确保在运行前已在相应的 `.env` 文件中或通过其他方式设置了所需的环境变量：
    - `mcp-client`: `ANTHROPIC_API_KEY`
    - `weather-mcp-server`: `QWEATHER_API_KEY`

## 依赖项

主要的依赖项已在各个子项目的功能描述中列出。详细的依赖关系请查看各个子项目的 `package.json` 文件。

- **Monorepo管理**: pnpm
- **构建工具**: rslib (用于各子包)
- **代码检查与格式化**: biomejs/biome
- **核心协议**: @modelcontextprotocol/sdk
- **AI模型**: @anthropic-ai/sdk (用于 `mcp-client`)
- **Web服务**: express
- **环境变量管理**: dotenv
- **数据校验**: zod

## TODO / 未来优化方向

- **`mcp-client`**: 
    - [ ] 支持配置和切换不同厂商的大语言模型 (LLM)，而不仅仅是 Anthropic。
    - [ ] 实现更友好的用户交互界面，例如使用 Web UI 替代命令行。
    - [ ] 增加对多轮对话历史的管理和记忆功能。
    - [ ] 允许用户在客户端自定义或注册新的 MCP 工具。
- **`fetch-mcp-server`**:
    - [ ] 优化内容提取逻辑，提高对不同网页结构的适应性和准确性。
    - [ ] 增加对不同文件类型的支持 (例如 PDF, DOCX)。
    - [ ] 实现内容缓存机制，避免重复获取相同 URL 的内容。
- **`weather-mcp-server`**:
    - [ ] 支持更多的天气数据源，提供更全面的天气信息。
    - [ ] 增加对地理位置名称的模糊匹配和纠错功能。
- **通用优化**:
    - [ ] 完善单元测试和集成测试，确保代码质量。
    - [ ] 增加更详细的日志记录和错误处理机制。
    - [ ] 考虑将核心的 MCP Server 和 Client 逻辑进一步抽象和封装，发布为可独立使用的 npm 包。
    - [ ] 探索将 MCP Server 部署到 Serverless 平台的可行性。
    - [ ] 增加对 MCP 协议安全性的考虑，例如认证和授权机制。