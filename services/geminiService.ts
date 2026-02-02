import { Mode, ProjectOutline, ScriptStyle, PhasePlan } from "../types";

// 修改点：自动补全 URL 路径，解决返回 HTML 的问题
const API_KEY = import.meta.env.VITE_OPENAI_API_KEY || ''; 
const RAW_BASE_URL = import.meta.env.VITE_BASE_URL || 'https://openrouter.ai/api/v1';
const BASE_URL = RAW_BASE_URL.endsWith('/chat/completions') 
  ? RAW_BASE_URL 
  : `${RAW_BASE_URL.replace(/\/$/, '')}/chat/completions`;

// 封装 OpenRouter 请求逻辑
async function requestOpenRouter(model: string, systemInstruction: string, userContent: string, responseSchema?: any) {
  const cleanKey = API_KEY.trim();

  // 构造请求体
  const body: any = {
    model: model, // 使用传入的参数
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: userContent }
    ]
  };

  // 如果传入了 schema，则启用 OpenRouter 的结构化输出模式
  if (responseSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "response_data",
        strict: true,
        schema: responseSchema
      }
    };
  }

  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cleanKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  // 增加安全检查：如果返回的不是 JSON，打印错误
  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const errorText = await response.text();
    console.error("服务器返回了非 JSON 内容:", errorText);
    throw { status: response.status, message: "接口路径配置错误，服务器返回了网页。请检查 VITE_BASE_URL 是否正确。" };
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
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
    layoutRef: string = "",
    adaptationHistory: string = "" // 新增：用于传递之前批次中对人物和剧情的改动记录
  ): Promise<any> => {
    return callWithRetry(async () => {
      const isFirstBatch = startEpisode === 1;

      const styleInstruction = scriptStyle === '情绪流' 
        ? `【流派：情绪流】极致冲突，节奏爆破，反派嚣张化，情绪拉扯拉满。`
        : `【流派：非情绪流】诙谐幽默，反套路脑洞，对话有机锋。`;

      const continuityInstruction = isFirstBatch
        ? `【开篇指令】：首集3句内必须进入冲突，快速建模。`
        : `【硬核衔接指令】：
          1. 必须深度解析[前序剧集结尾]的最后一段剧情 and 悬念。
          2. 本批次的第一集（第${startEpisode}集）必须从上一集结束的精确时间点、物理位置直接开始。
          3. 严禁出现“过了一段时间”或转场感，必须是动作 and 台词的无缝延续。`;

      // 新增：针对你提到的改编内容对不上的补丁指令
      const adaptationConsistencyInstruction = `
【改编一致性监控（最高优先级）】：
1. **禁止幻觉人物**：必须参考[之前批次的改编记录]。如果某个原著人物在之前的改编中已被删减、合并或尚未登场，严禁在本批次突然出现。
2. **逻辑闭环**：若原著人物在当前情节中很重要但之前未交代，你必须在本批次为其安排合理的“初次登场”或将其戏份合并给已存在的角色。
3. **状态校验**：严格检查[前序剧集结尾]中在场的人物名单，确保第一场戏不会凭空多出或减少人。`;

      const systemInstruction = `你是一位专注爆款漫剧的首席编剧。任务：生成阶段 ${phasePlan.phaseIndex} 的剧本（第 ${startEpisode} 集至第 ${startEpisode + phasePlan.episodes - 1} 集）。

【核心角色保留原则】：
1. 必须深度挖掘原著中的关键道具（如判官笔、特殊法宝）、核心人物关系及标志性戏份。
2. 改编可以快节奏，但绝不能删减原著的关键设定 and 道具戏份。这些元素必须作为爽点和转折的核心频繁出现。

在改编任何原著小说时，严禁删减以下三类“非人类/非传统”角色的戏份，并将它们视为剧本的【关键功能人】：

1. 【解说与百科类实体】：如器灵（判官笔）、系统、魔法书。它们是世界观和逻辑链的唯一出口，严禁将其台词转化为旁白，必须以对话形式保留。
2. 【吐槽与氛围类实体】：如萌宠、损友型挂件。它们负责调节情绪流节奏，防止剧本陷入单一阴沉，必须保留其反馈戏份。
3. 【秘密见证者】：唯一知道主角真实身份或前世记忆的非人实体。

改编要求：
- ${adaptationConsistencyInstruction}
- 确保主角与这些实体之间的“推拉”、“吐槽”、“合作”戏份在剧本中占比不低于原著比例。
- 信息传递必须遵循“Show, don't tell”原则，通过主角与辅助实体的交互来展示，而非删除实体。
- ${styleInstruction}
- ${continuityInstruction}

【强制要求】：
- 每一集字数要求在600-800字。

  
【排版规范】：
严禁 Markdown。输出纯净剧本排版。
严禁生成英文，所有环节必须全中文。
参考对齐：[${layoutRef || "标准格式"}]`;




      const response = await requestOpenRouter(
        "google/gemini-3-pro-preview",
        systemInstruction,
        `
        [大纲路线]：\n${outline}
        [之前批次的改编记录（需严格遵守）]：\n${adaptationHistory || "暂无记录"}
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
            },
            // 新增：让AI输出本批次的改编总结，供下一批次使用
            adaptationSummary: {
              type: "string", 
              description: "简要总结本批次对原著角色、剧情做的重大删改（如：删除了某人，合并了某情节），以便维持一致性。"
            }
          },
          required: ["episodes", "adaptationSummary"]
        }
      );
      return JSON.parse(response.text);
    });
  }
};
