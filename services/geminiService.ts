import { Type } from "@google/genai";
import { Mode, ProjectOutline, ScriptStyle, PhasePlan } from "../types";

// 修改点：根据你 Cloudflare 的设置读取变量
// 注意：Vite 环境下使用 import.meta.env
const API_KEY = import.meta.env.VITE_OPENAI_API_KEY || ''; 
const BASE_URL = import.meta.env.VITE_BASE_URL || 'https://openrouter.ai/api/v1/chat/completions';

// 封装 OpenRouter 请求逻辑
async function requestOpenRouter(model: string, systemInstruction: string, userContent: string) {
  // 确保 Key 后面没有多余的空格
  const cleanKey = API_KEY.trim();

  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      // 1. 只保留最基础的两个 Header，避免触发复杂的跨域预检
      "Authorization": `Bearer ${cleanKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "google/gemini-pro-1.5", // 显式写死模型名，确保万无一失
      messages: [
        { role: "system", content: systemInstruction + "\n请务必只输出合法的 JSON 格式内容。" },
        { role: "user", content: userContent }
      ],
      response_format: { type: "json_object" }
    })
  });

  // 如果还是报 CORS 错误，我们可以通过检查 response 是否存在来辅助排查
  if (!response) {
    throw new Error("网络请求被浏览器拦截，请检查是否开启了广告过滤器或 VPN。");
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `请求失败: ${response.status}`);
  }

  const data = await response.json();
  return { text: data.choices[0].message.content };
}

  if (!response.ok) {
    const errorData = await response.json();
    throw { status: response.status, message: errorData?.error?.message || "Request Failed" };
  }

  const data = await response.json();
  return { text: data.choices[0].message.content };
}

async function callWithRetry(fn: () => Promise<any>, maxRetries = 4): Promise<any> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorMessage = error?.message?.toLowerCase() || "";
      const status = error?.status || (errorMessage.includes('429') ? 429 : errorMessage.includes('500') ? 500 : 0);
      const isRetryable = status === 429 || status >= 500 || errorMessage.includes('xhr') || errorMessage.includes('rpc');
      if (isRetryable) {
        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export const geminiService = {
  generateOutline: async (novelText: string, mode: Mode): Promise<ProjectOutline> => {
    return callWithRetry(async () => {
      const systemInstruction = `你是一位顶级动漫爽剧编剧专家。你的任务是基于原著产出全案大纲。

【核心创作规范】：
1. **总集数规划**：全剧严格控制在 65-80 集。
2. **阶段结构**：第一阶段固定 10 集，后续根据爽点分布划分为多个阶段（每阶段8-12集）。
3. **受众对焦**：${mode}模式。`;

      const response = await requestOpenRouter(
        "google/gemini-3-pro-preview",
        systemInstruction,
        `素材：\n${novelText}`,
        {
          type: "object",
          properties: {
            content: { type: "string" },
            characters: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" }, gender: { type: "string" }, age: { type: "string" },
                  identity: { type: "string" }, appearance: { type: "string" }, growth: { type: "string" },
                  motivation: { type: "string" }
                },
                required: ["name", "gender", "age", "identity", "appearance", "growth", "motivation"]
              }
            },
            phasePlans: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  phaseIndex: { type: "number" }, episodes: { type: "number" },
                  description: { type: "string" }, climax: { type: "string" }
                },
                required: ["phaseIndex", "episodes", "description", "climax"]
              }
            }
          },
          required: ["content", "characters", "phasePlans"]
        }
      );
      return JSON.parse(response.text);
    });
  },

  generateScriptBatch: async (
    novelText: string, 
    outline: string,
    phasePlan: PhasePlan,
    startEpisode: number,
    previousContext: string = "",
    mode: Mode,
    scriptStyle: ScriptStyle,
    layoutRef: string = ""
  ): Promise<any> => {
    return callWithRetry(async () => {
      const isFirstBatch = startEpisode === 1;

      const styleInstruction = scriptStyle === '情绪流' 
        ? `【流派：情绪流】极致冲突，节奏爆破，反派嚣张化，情绪拉扯拉满。`
        : `【流派：非情绪流】诙谐幽默，反套路脑洞，对话有机锋。`;

      const continuityInstruction = isFirstBatch
        ? `【开篇指令】：首集3句内必须进入冲突，快速建模。`
        : `【硬核衔接指令】：
          1. 必须深度解析[前序剧集结尾]的最后一段剧情和悬念。
          2. 本批次的第一集（第${startEpisode}集）必须从上一集结束的精确时间点、物理位置直接开始。
          3. 严禁出现“过了一段时间”或转场感，必须是动作和台词的无缝延续。`;

      const systemInstruction = `你是一位专注爆款漫剧的首席编剧。任务：生成阶段 ${phasePlan.phaseIndex} 的剧本（第 ${startEpisode} 集至第 ${startEpisode + phasePlan.episodes - 1} 集）。

【核心原则】：
- 严禁删减器灵、系统、宠物的戏份。
- 每一集必须以极其强烈的悬念（钩子）结尾。
- ${styleInstruction}
- ${continuityInstruction}

【排版规范】：
严禁 Markdown。输出纯净剧本排版。
参考对齐：[${layoutRef || "标准格式"}]`;

      const response = await requestOpenRouter(
        "google/gemini-3-pro-preview",
        systemInstruction,
        `
        [大纲路线]：\n${outline}
        [当前阶段任务]：\n${phasePlan.description} (预期爽点: ${phasePlan.climax})
        [前序剧集结尾（必须紧接此处开始）]：\n${previousContext || "无（本批次为全剧开篇）"}
        [原著素材]：\n${novelText}`,
        {
          type: "object",
          properties: {
            episodes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  episodeNumber: { type: "number" },
                  title: { type: "string" },
                  content: { type: "string" }
                },
                required: ["episodeNumber", "title", "content"]
              }
            }
          },
          required: ["episodes"]
        }
      );
      return JSON.parse(response.text);
    });
  }
};
