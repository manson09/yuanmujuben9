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
女频向核心爽点：1极致手撕绿茶；2身份马甲掉落；3极致团宠/被守护；4追妻火葬场；5宿命心动感。
【情绪写法铁律】：
- 每场戏先给情绪压迫，再给爆发释放。
- 台词要“带刺”“带狠”“带占有欲/护短感”，不许温吞。
- 反派必须嘴贱、招恨、作死；主角必须当场回敬，不隔夜。`
  : `【流派：非情绪流（脑洞热梗引擎）】
文风诙谐幽默，融入网络热梗，快节奏，脑洞要大，每一集都要有小卡点。
男频向10大爽点：1身份打脸；2实力碾压；3护短暴走；4以牙还牙；5隐藏大佬；6财富碾压；7医术/绝技震撼；8美女倒追；9绝境翻盘；10群体下跪。
【热梗写法铁律】：
- 主角必须会吐槽，会阴阳，会一句话把人噎死。
- 爽点必须“直给”，系统播报/旁白播报/角色喊出来都行。
- 反派每集至少一次“作死加码”，主角当场“加倍奉还”。`;

      // 2. 开篇与衔接逻辑
      const continuityInstruction = isFirstBatch
        ? `【写作顺序硬性要求（必须遵守）】：
1. 第一场戏必须从“与主角无关的高危事件”开始（对峙/追杀/交易/威胁）。
2. 主角的登场方式必须是“意外介入”或“异常打断”，而非主动出手。
3. 穿越/重生/系统等设定只能用于解释“刚刚发生的异常”，禁止提前铺垫。
4. 主角在开篇必须立刻遭遇“可执行的危险”，反派不能只威胁，必须出手。
5. 若有系统/金手指，必须在绝境中即时兑现一次明确爽点。
6. 爽点之后，必须立刻制造新的不安因素（能力限制/误会/身份错位）。

【节奏要求】：
- 每3-5行必须发生一件新事件（动作/态度变化/能力变化）。
- 禁止连续情绪输出超过5行而无事件推进。
- 禁止长段世界观说明。

【唯一合格标准】：
观众看完第一集后必须清楚知道：
“这个主角以后会不断被卷入更大的麻烦，但每次都能用歪门邪道活下来。”
补充：
2. 若含穿越/重生：必须先用“离谱死法/憋屈处境”秒切，再无缝落到当前冲突现场。
3. 主角第一句必须立人设：吐槽/狠话/反击三选一，禁止平淡叙述。
4. 设定只能用“宣告式台词/系统播报”交代，禁止解释型长段落。`
  : `【硬核无缝衔接指令（硬性）】：
1. 本批次第1集必须从[前序剧集结尾]的“同一秒、同一地点、同一动作”续写。
2. 严禁：时间跳跃、换场景再开戏、回忆补课式开头。
3. 必须把上一集留下的悬念在开场10-20行内“加压升级”，不能拖。`;

      const adaptationConsistencyInstruction = `
【改编一致性监控（最高优先级）】：
1. 禁止幻觉人物：只能使用[之前批次的改编记录]里存在的人物与设定。
2. 若必须引入新角色：必须安排“合理初登场”。
3. 状态校验：人物生死、伤势、关系、道具归属必须与前序对齐。
4. 任何“删减/合并/改名”必须在本批次 adaptationSummary 里记录。`;

      // 3. 改编核心规范
      const coreMethodology = `
【爽漫工业化写法（总纲）】：
你的目标不是“写得像文学”，而是“让观众停不下来”。
每一集都必须做到：开场就让人上火，中段让人解气，结尾让人想立刻点下一集。

【爽剧直给铁律（最高优先级）】：
1. 所有重要信息必须“直接说出来”：系统播报/角色喊出来/旁白宣布都可以。
2. 禁止含蓄、禁止留白让观众猜：爽点要砸脸、要清晰、要明确。
3. 允许“嘴替式内心独白”：主角可以自言自语吐槽、骂街、阴阳怪气——形式是对白，本质是情绪。
4. 关键爽点必须“当场兑现”：不许铺垫半集才爽。

【单集结构硬模板（必须执行）】：
- 0-10行：冲突砸脸（羞辱/威胁/围观/栽赃/追杀/逼婚/逼退婚）
- 10-40行：加压升级（反派更嚣张、规则更不公平、围观更嘲笑）
- 40-80行：主角反击（嘴炮打脸 + 行动打脸至少各一次）
- 80-结尾：超额兑现（碾压/奖励/身份揭露/众人震惊）
- 最后5-10行：强钩子（下一集更大的敌人/更大的奖励/更大的误会/更大的反转）

【爽点密度硬指标】：
- 每集至少 3 次“爽点动作”：①嘴上打脸（狠话/反讽/揭短）②行动碾压（出手/逼跪/夺物）③群体反馈（震惊/下跪/改口/跪求）
- 每集至少 1 个“观众期待点”：新敌人、新规则、新奖励、新身份、新危机，必须落地。

【反派写法（必须够招恨）】：
- 反派坏得彻底、嘴贱、爱踩人、爱秀优越。
- 反派每集至少一次“作死加码”，主角必须当场加倍奉还。
- 禁止反派讲道理、讲大局、讲感情铺垫；只准欺负、羞辱、栽赃、夺取。

【主角写法（必须够狠）】：
- 不圣母、不讲和、不忍气吞声；被踩就踩回去，被抢就抢回来。
- 台词要短、狠、有攻击性，有记忆点（金句）。
- 可以嚣张，但要“有凭有据”：靠实力/靠系统/靠身份/靠手段。

【镜头与节奏（短剧化）】：
- 多用：▲特写、▲近景、▲反应、▲群像震惊、▲动作连击。
- 台词不要长段解释；每句尽量 8-20 字，像弹幕一样利落。
- 禁止“说明书式设定介绍”，设定只能通过冲突中被迫亮出来。

【结尾钩子硬性要求（必须执行）】：
- 每集结尾必须出现至少一种：
  1. 新能力即将释放 / 新功能解锁
  2. 更强敌人到场 / 执法堂/宗主/首席介入
  3. 重要人物态度翻转（跪、求、怕、改口）
  4. 新误会/新陷阱/新任务砸下来
- 禁止平淡收尾，禁止聊天收尾。
【首场戏专用：爽剧开篇20行硬模板（最高优先级，仅在第1集第1场启用）】：
触发条件：当 startEpisode === 1 时，“第1集第1场戏”必须严格按20行模板写，先规则后人物，先死亡后吐槽。
硬模板（20行以内）：
1-3行：规则/系统/法则先宣告惩罚或倒计时（禁止环境描写）
4-6行：主角身体反应（痛/窒息/失重/灼烧等），只写动作不解释
7-9行：死亡证据贴脸（崩裂/追杀/锁定/倒计时播报），让观众确信马上会死
10-12行：身份暴击（规则宣布“必死/替死/弃子/罪名成立”等结论），主角只允许短反应词
13-15行：极短闪回（1-2句碎片：他曾在这里死过/被牺牲/没人救）
16-18行：第一反抗（必须行动反抗），规则立刻加重惩罚或加速倒计时
19-20行：钩子砸脸（异常触发/隐藏变量启动/更高规则介入），戛然而止
【穿越 / 重生 / 穿书设定保留特许条款（最高优先级）】：
- 若故事包含穿越、重生、穿书、回档等设定：
  1. 禁止用“解释型叙述”说明设定来源与原理。
  2. 必须将该设定作为【规则异常 / 死亡异常 / 系统异常】直接宣告。
  3. 允许且必须在第1场中，用【系统播报 / 法则提示 / 判决修正】的方式明确点出：
     - “灵魂来源异常”
     - “死亡记录被覆盖”
     - “第二次启动 / 非首次执行”
  4. 禁止使用长回忆，但允许 1 句“结果式确认”，例如：
     - 【检测到非本世界灵魂。】
     - 【历史死亡记录：已发生。】
     - 【当前为重启版本。】

【判定标准】：
- 观众必须在开篇20行内明确知道：
  “主角不是第一次活着 / 不是原本这个身份。”

【开篇硬性禁止】：
禁止看风景、禁止世界观解释、禁止“我是谁我在哪”、禁止长吐槽骂作者；
吐槽只能发生在“死亡机制已执行”的前提下。
`;

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
- 信息传递遵循“爽点直给原则”：重要信息必须用对白/系统播报直接宣告，禁止含蓄留白。
- ${styleInstruction}
- ${continuityInstruction}

【硬性要求】：
- 每一集字数 600-800 字。
- 严禁 Markdown，严禁英文，全中文输出纯净剧本。
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
