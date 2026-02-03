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
    model: model, 
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
3. **受众对焦**：${mode}模式。
4. **提炼爽点主轴**：把长篇I拆解为爽点结构表，明确主角弧光、反杀节点、情绪高潮、金句爆点。精准判断内容优先级。`;

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
    adaptationHistory: string = ""
  ): Promise<any> => {
    return callWithRetry(async () => {
      const isFirstBatch = startEpisode === 1;

      // 1. 风格指令（结合你的新建议）
      const styleInstruction = scriptStyle === '情绪流' 
        ? `【流派：情绪流（极致情绪引擎）】
           节奏要爽快！可以适当浮夸~ 反派建议脑残化一点，情绪一定要强！强！强！漫剧剧本怎么爽怎么来，节奏快就对了！
           女频向核心爽点：1.极致手撕绿茶；2.身份马甲掉落；3.极致团宠/被守护；4.追妻火葬场；5.宿命心动感。`
        : `【流派：非情绪流（脑洞热梗引擎）】
           文风可以诙谐幽默多玩热梗，但节奏不能拖！脑洞要大，每一集都要有小卡点。对话有机锋。
           男频向10大爽点：1.身份打脸；2.实力碾压；3.护短暴走；4.以牙还牙；5.隐藏大佬；6.财富碾压；7.医术/绝技震撼；8.美女倒追；9.绝境翻盘；10.群体下跪。`;

      // 2. 开篇与衔接逻辑
      const continuityInstruction = isFirstBatch
        ? `【开篇建模指令】：
          1. 3句内必须进入冲突。
          2. 若原著含穿越/重生，首集开头需用“极速剪辑感”描写原本离谱的死法或处境，随后瞬间切换到当前世界的冲突现场。
          3. 用主角对新身体/新环境的“第一吐槽”或“瞬间反击”快速立住人设。
          4. 通过正在发生的矛盾（如被退婚、被嘲讽）带出设定，绝不长篇大论。`
        : `【硬核衔接指令】：
          1. 必须深度解析[前序剧集结尾]的最后一段剧情 and 悬念。
          2. 本批次第1集从上一集结束的精确时间点、物理位置无缝延续。
          3. 严禁转场感，必须是动作 and 台词的无缝延续。`;

      const adaptationConsistencyInstruction = `
【改编一致性监控（最高优先级）】：
1. **禁止幻觉人物**：必须参考[之前批次的改编记录]，严禁突然出现已被删减的角色。
2. **逻辑闭环**：若原著人物重要但之前未交代，须在此批次安排合理的“初次登场”。
3. **状态校验**：确保第一场戏的人物、位置与[前序剧集结尾]完全对齐。`;

      // 3. 改编核心规范
      const coreMethodology = `
【改编核心五步走（实操优先级）】：
1. 提炼爽点主轴：成倍提升爽点密度，适配漫剧十几秒耐心阈值。
2. 重建单集单点叙事：每集只设一个核心目标，8秒内看懂“本集期待”。
3. 人物动机直给化：第一集亮明角色性格。${scriptStyle === '情绪流' ? '强化情绪代入点' : '突出升级驱动'}。
4. 视觉化转译：严禁内心独白，将其转化为微表情特写、前后反差镜头、符号物件。
5. 支线筛减合并：只保留推爽点或推情绪的必要支线。

【创作三大核心规范】：
- 剧情与节奏：主线单一聚焦，冲突升级依托反派关系链，拒绝“嘴炮”台词，强调动作与画面的即时反馈。
- 人设对白：人设一致，反派坏得彻底，男主杜绝圣母心。对白要有趣、有梗、有力量。
- 结构设定：简化人物网，金手指设定清晰易懂，重要场景细化描写突出镜头感。`;

      const systemInstruction = `你是一位专注爆款漫剧的首席编剧。任务：生成阶段 ${phasePlan.phaseIndex} 的剧本（第 ${startEpisode} 至 ${startEpisode + phasePlan.episodes - 1} 集）。

${coreMethodology}

【核心角色保留原则（严禁删减）】：
1. 必须深度挖掘原著中的关键道具（如判官笔、特殊法宝）、核心人物关系及标志性戏份。
2. 严禁删减以下三类“关键功能人”：【解说/百科类实体】（器灵、系统）、【吐槽/氛围类实体】（萌宠、挂件）、【秘密见证者】。这些实体是漫剧的唯一逻辑与情绪出口，必须以对话形式保留。

【爽点使用黄金原则】：
- 密度原则：每集至少2-3个爽点。
- 递进原则：爽感强度随集数逐级递进。
- 铺垫原则：所有爽点需提前埋入线索，反转丝滑。

改编要求：
- ${adaptationConsistencyInstruction}
- 信息传递遵循“Show, don't tell”原则。
- ${styleInstruction}
- ${continuityInstruction}

【硬性要求】：
- 每一集字数 600-800 字。
- 严禁 Markdown，严禁英文，输出纯净剧本。
- 参考布局：[${layoutRef || "标准格式"}]`;

      const response = await requestOpenRouter(
        "google/gemini-3-pro-preview",
        systemInstruction,
        `
        [大纲路线]：\n${outline}
        [之前批次的改编记录]：\n${adaptationHistory || "暂无记录"}
        [当前阶段任务]：\n${phasePlan.description} (预期爽点: ${phasePlan.climax})
        [前序剧集结尾（必须衔接）]：\n${previousContext || "无"}
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
            adaptationSummary: {
              type: "string", 
              description: "简要总结本批次：1.角色/情节删改记录；2.已使用的爽点等级；3.给下批次的伏笔或卡点。"
            }
          },
          required: ["episodes", "adaptationSummary"]
        }
      );
      return JSON.parse(response.text);
    });
  }
};
