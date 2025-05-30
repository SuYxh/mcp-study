import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";
import path from "path"; // 导入 path 模块
import { fileURLToPath } from 'url'; // 导入 url 模块

// 获取当前文件的目录路径 (适用于 ES 模块)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, "..", ".env"); // 从 dist 目录回退一级到 apps/mcp-client
dotenv.config({ path: envPath });

// QWeather API Key - 需要在环境变量中设置 QWEATHER_API_KEY
const QWEATHER_API_KEY = process.env.QWEATHER_API_KEY;

// Create server instance
const server = new McpServer({
  name: "weather",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

async function getWeather({ location }: { location: string }) {
  if (!QWEATHER_API_KEY) {
    console.error('错误: QWEATHER_API_KEY 环境变量未设置。');
    return '错误: QWeather API 密钥未配置。';
  }

  try {
    // 使用 GeoAPI 获取城市的 Location ID
    // 对应开发文档 `https://dev.qweather.com/docs/api/geoapi/`
    const geoUrl = `https://n336x6y9yf.re.qweatherapi.com/geo/v2/city/lookup?location=${encodeURIComponent(location)}&key=${QWEATHER_API_KEY}`;
    const geoRes = await fetch(geoUrl);
    if (!geoRes.ok) {
      throw new Error(`GeoAPI请求失败: ${geoRes.status} ${await geoRes.text()}`);
    }

    const geoData: any = await geoRes.json();
    if (geoData.code !== '200' || !geoData.location || geoData.location.length === 0) {
      return `抱歉，找不到 ${location} 的天气信息 (GeoAPI code: ${geoData.code})`;
    }

    const locationId = geoData.location[0].id;

    // 使用 Location ID 获取未来3天天气数据
    // 对应开发文档： `https://dev.qweather.com/docs/api/weather/weather-daily-forecast/`
    const weatherUrl = `https://n336x6y9yf.re.qweatherapi.com/v7/weather/3d?location=${locationId}&key=${QWEATHER_API_KEY}`;
    const weatherRes = await fetch(weatherUrl);
    if (!weatherRes.ok) {
      throw new Error(`天气API请求失败: ${weatherRes.status} ${await weatherRes.text()}`);
    }

    const weatherData: any = await weatherRes.json();
    if (weatherData.code !== '200') {
      return `获取 ${location} 的天气信息失败，错误码：${weatherData.code}`;
    }
    return weatherData.daily[1];
  } catch (error: any) {
    console.error('天气查询出错:', error);
    return `获取 ${location} 的天气信息时发生错误：${error.message}`;
  }
}

// Register weather tool using the new getWeather function
server.tool(
  "get-weather-forecast",
  "Get tomorrow's weather forecast for a specific location using QWeather API.",
  {
    location: z.string().describe("City name (e.g., Beijing) or comma-separated longitude,latitude (e.g., 116.41,39.92)"),
  },
  async ({ location }) => {
    const weatherResult = await getWeather({ location });

    if (typeof weatherResult === 'string') {
      // Error message string
      return {
        content: [
          {
            type: "text",
            text: weatherResult,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(weatherResult),
        },
      ],
    };
  }
);

async function main() {
  if (!QWEATHER_API_KEY) {
    console.error("错误: QWEATHER_API_KEY 环境变量未设置。请设置该变量后再启动服务。");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("✅ 天气MCP服务已启动！等待AI调用...");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});