/**
 * 天气「行动建议」引擎（服务端专用，纯函数）
 * ------------------------------------------------------------------
 * 目的：游客不关心「相对湿度 75% / 紫外线指数 8」这类指标代表什么，
 * 只关心「要不要带伞、穿什么、今天还去不去、要不要改行程」。
 * 因此本模块把气象数据直接翻译成可执行的动作。
 *
 * 设计约束：
 *  1. 纯函数、无 I/O、无随机：输入当前实况 + 今日预报，输出结构化建议。
 *  2. 输出只含「条目码 + 图标 + 少量插值变量」，不含任何语言文案。
 *     多语言文案集中在 i18n 词条里，因此同一份缓存响应可服务所有语言，
 *     也不会因为新增语言而改动气象逻辑。
 *  3. 命中即入列，按优先级排序后按组截断 —— 只展示最相关几条，
 *     不满足条件的条目不输出，避免把一整张规则表堆到页面上。
 *  4. 「风险提醒」独立成组，只有在达到危险阈值时才输出（无风险则整组为空），
 *     前端拿到后置顶红色展示，并弱化常规建议的视觉权重。
 *  5. 结合景点地理画像（山地丘陵 + 城市人文）输出本地化场景提示：
 *     登顶风感强于市区、上山以台阶与木栈道为主、山顶无遮阴无商店、
 *     晴天适合看汉江日落等。
 *
 * 产品细节（刻意规避的坑）：
 *  · 降水概率 ≠ 一定下雨，概率阈值只表达「大概率」，不写「今天一定会下雨」。
 *  · 不使用气象术语（如「辐照强度」），一律口语化。
 *  · 覆盖登高 + 城市漫步两类场景，普通城市天气预报没有这个视角。
 */
import attraction from '../config/attraction';
import type { WeatherCondition, WeatherCurrent, WeatherDay } from './weather';

/* ────────────────────────── 对外结构 ────────────────────────── */

export interface AdviceItem {
  /** 词条 key，对应 i18n 的 `weatherAdvice.codes` */
  code: string;
  /** 与语言无关的图标，可直接渲染 */
  icon: string;
  /** 词条中的 {变量} 插值（如 {temp} / {level} / {wind} / {uv}） */
  vars?: Record<string, string | number>;
}

export interface WeatherAdvice {
  /** 风险提醒：达到危险阈值时才有内容，前端置顶红色展示 */
  alerts: AdviceItem[];
  /** 出行穿搭 */
  outfit: AdviceItem[];
  /** 游玩安排 */
  activities: AdviceItem[];
  /** 随身物品 */
  items: AdviceItem[];
}

/* ────────────────────────── 分组上限 ────────────────────────── */
/** 每组最多展示几条，避免「全都显示」 */
const LIMIT = { alerts: 3, outfit: 3, activities: 3, items: 6 } as const;

/* ─────────────────── 降水强度：区分小 / 中 / 大雨 ─────────────────── */

type RainTier = 'none' | 'light' | 'moderate' | 'heavy';

/** 上游原始码中，真正决定「强度」的只有这几组 */
const CODE_DRIZZLE = new Set([51, 53, 55, 56, 57]);
const CODE_RAIN = new Set([61, 63, 65, 66, 67]);
const CODE_SHOWER = new Set([80, 81, 82]);
const CODE_SNOW = new Set([71, 73, 75, 77, 85, 86]);
const CODE_STORM = new Set([95, 96, 99]);
const CODE_FREEZING = new Set([56, 57, 66, 67]);
const CODE_MODERATE = new Set([55, 63, 81]);
const CODE_HEAVY = new Set([65, 82]);

/** 蒲福风级折算（km/h），用于把风速翻译成游客熟悉的「几级风」 */
const BEAUFORT_MAX_KMH = [5, 11, 19, 28, 38, 49, 61, 74, 88, 102, 117];

export function beaufortFromKmh(kmh: number): number {
  if (!Number.isFinite(kmh) || kmh < 1) return 0;
  for (let i = 0; i < BEAUFORT_MAX_KMH.length; i += 1) {
    if (kmh <= BEAUFORT_MAX_KMH[i]) return i + 1;
  }
  return 12;
}

/* ────────────────────────── 判定上下文 ────────────────────────── */

interface AdviceContext {
  code: number | null;
  temperature: number;
  tempMax: number;
  tempMin: number;
  /** 昼夜温差 */
  tempSwing: number;
  /** 取「当前实况」与「今日最高」中较大者，避免漏报当天稍后的雨 */
  rainProb: number;
  uvMax: number;
  windKmh: number;
  windLevel: number;
  humidity: number;

  rainTier: RainTier;
  isRainy: boolean;
  /** 降水概率达到「大概率」阈值 */
  rainyLikely: boolean;
  isStorm: boolean;
  isSnow: boolean;
  isIcy: boolean;
  isFog: boolean;
  isClear: boolean;
  isCloudy: boolean;
  isHot: boolean;
  isCold: boolean;
  isFreezing: boolean;
  /** 山顶风感明显强于市区 */
  strongWindOnHill: boolean;
  /** 是否值得提醒防晒：下雨、下雪、起雾或雷暴时防晒已无意义 */
  sunMatters: boolean;

  profile: typeof attraction.weatherProfile;
}

const RAIN_CONDITIONS: WeatherCondition[] = [
  'drizzle',
  'freezing-drizzle',
  'rain',
  'freezing-rain',
  'rain-showers',
  'thunderstorm',
  'severe-thunderstorm',
];

function rainTierFromCode(code: number | null): RainTier {
  if (code === null) return 'none';
  if (CODE_HEAVY.has(code)) return 'heavy';
  if (CODE_MODERATE.has(code)) return 'moderate';
  if (CODE_DRIZZLE.has(code) || CODE_RAIN.has(code) || CODE_SHOWER.has(code)) return 'light';
  return 'none';
}

function buildContext(current: WeatherCurrent, today: WeatherDay | null): AdviceContext {
  const profile = attraction.weatherProfile;
  const code = current.weatherCode;

  const tempMax = today?.temperatureMax ?? current.temperature;
  const tempMin = today?.temperatureMin ?? current.temperature;
  const tempSwing = Math.round((tempMax - tempMin) * 10) / 10;
  const uvMax = today?.uvIndexMax ?? 0;
  const windKmh = current.windSpeed ?? 0;
  const windLevel = beaufortFromKmh(windKmh);
  const humidity = current.humidity ?? 0;

  const rainProb = Math.max(
    current.precipitationProbability ?? 0,
    today?.precipitationProbability ?? 0,
  );

  const isStorm = current.condition === 'thunderstorm' || current.condition === 'severe-thunderstorm';
  const rainTier = rainTierFromCode(code);
  const isRainy = rainTier !== 'none' || RAIN_CONDITIONS.includes(current.condition) || isStorm;
  const isSnow = code !== null && CODE_SNOW.has(code);
  const isIcy = code !== null && CODE_FREEZING.has(code);
  const isFog = current.condition === 'fog';

  return {
    code,
    temperature: current.temperature,
    tempMax,
    tempMin,
    tempSwing,
    rainProb,
    uvMax,
    windKmh,
    windLevel,
    humidity,

    rainTier,
    isRainy,
    rainyLikely: rainProb >= 60,
    isStorm,
    isSnow,
    isIcy,
    isFog,
    isClear: current.condition === 'clear' || current.condition === 'mainly-clear',
    isCloudy: current.condition === 'overcast' || current.condition === 'partly-cloudy',
    isHot: tempMax >= 32,
    isCold: tempMax <= 10,
    isFreezing: tempMin <= 0,
    strongWindOnHill: profile.exposedSummit && windLevel >= 5,
    // 雨、雪、雾或雷暴天气下防晒已无意义，此时不输出防晒类提醒
    sunMatters: rainTier === 'none' && !isStorm && !isFog && !isSnow,

    profile,
  };
}

/* ────────────────────────── 规则定义 ────────────────────────── */

interface Rule {
  code: string;
  icon: string;
  /** 越大越优先；同组内按此排序后截断 */
  priority: number;
  when: (ctx: AdviceContext) => boolean;
  vars?: (ctx: AdviceContext) => Record<string, string | number>;
}

const ceil = (value: number) => Math.round(value);

/** 风险提醒：只有达到危险阈值才入列 */
const ALERT_RULES: Rule[] = [
  { code: 'alert.thunder', icon: '⛈️', priority: 100, when: (c) => c.isStorm },
  { code: 'alert.heavyRain', icon: '🌧️', priority: 92, when: (c) => c.rainTier === 'heavy' },
  {
    code: 'alert.wind',
    icon: '💨',
    priority: 88,
    when: (c) => c.windLevel >= 7,
    vars: (c) => ({ level: c.windLevel, wind: ceil(c.windKmh) }),
  },
  { code: 'alert.ice', icon: '🧊', priority: 86, when: (c) => c.isIcy },
  { code: 'alert.snow', icon: '❄️', priority: 82, when: (c) => c.isSnow },
  {
    code: 'alert.heat',
    icon: '🥵',
    priority: 80,
    when: (c) => c.tempMax >= 35,
    vars: (c) => ({ temp: ceil(c.tempMax) }),
  },
  {
    code: 'alert.cold',
    icon: '🥶',
    priority: 78,
    when: (c) => c.tempMin <= -5,
    vars: (c) => ({ temp: ceil(c.tempMin) }),
  },
  { code: 'alert.fog', icon: '🌫️', priority: 70, when: (c) => c.isFog },
];

/** 出行穿搭 */
const OUTFIT_RULES: Rule[] = [
  { code: 'outfit.storm', icon: '🧥', priority: 100, when: (c) => c.isStorm },
  { code: 'outfit.rainHeavy', icon: '🧥', priority: 94, when: (c) => c.rainTier === 'heavy' },
  { code: 'outfit.snow', icon: '🥾', priority: 90, when: (c) => c.isSnow },
  {
    code: 'outfit.windy',
    icon: '🧥',
    priority: 86,
    // 雷暴另有专用文案，避免同一件事说两遍
    when: (c) => c.strongWindOnHill && !c.isStorm,
    vars: (c) => ({ level: c.windLevel }),
  },
  {
    code: 'outfit.rain',
    icon: '☂️',
    priority: 82,
    // 雪与冻雨不该提醒带伞，那两种情况的重点是防滑与防寒
    when: (c) => c.isRainy && !c.isSnow && !c.isIcy && c.rainTier !== 'heavy',
  },
  { code: 'outfit.cold', icon: '🧣', priority: 78, when: (c) => c.isCold },
  { code: 'outfit.hot', icon: '👕', priority: 76, when: (c) => c.isHot },
  {
    code: 'outfit.muggy',
    icon: '💧',
    priority: 70,
    when: (c) => c.humidity >= 80 && c.tempMax >= 26,
  },
  { code: 'outfit.swing', icon: '🎒', priority: 62, when: (c) => c.tempSwing > 8 },
];

/** 游玩安排（含本地场景：登台阶、山顶无遮阴、看日落） */
const ACTIVITY_RULES: Rule[] = [
  { code: 'play.storm', icon: '⛈️', priority: 100, when: (c) => c.isStorm },
  { code: 'play.heavyRain', icon: '🌧️', priority: 94, when: (c) => c.rainTier === 'heavy' },
  {
    code: 'play.rain',
    icon: '☔',
    priority: 86,
    // 大雨已有更强的前置条目，这里只处理「可能下雨」这一档
    when: (c) => c.isRainy && c.rainyLikely && c.rainTier !== 'heavy',
  },
  { code: 'play.snow', icon: '❄️', priority: 84, when: (c) => c.isSnow },
  {
    code: 'play.windStrong',
    icon: '💨',
    priority: 82,
    when: (c) => c.strongWindOnHill && c.windLevel >= 7,
    vars: (c) => ({ level: c.windLevel }),
  },
  {
    code: 'play.uvVeryHigh',
    icon: '🔆',
    priority: 80,
    when: (c) => c.uvMax >= 8 && c.sunMatters,
    vars: (c) => ({ uv: ceil(c.uvMax) }),
  },
  {
    code: 'play.hot',
    icon: '🥵',
    priority: 78,
    when: (c) => c.isHot,
    vars: (c) => ({ temp: ceil(c.tempMax) }),
  },
  { code: 'play.cold', icon: '🥶', priority: 76, when: (c) => c.isCold },
  { code: 'play.fog', icon: '🌫️', priority: 74, when: (c) => c.isFog },
  { code: 'play.drizzle', icon: '🌦️', priority: 68, when: (c) => c.isRainy && !c.rainyLikely },
  {
    code: 'play.windy',
    icon: '🍃',
    priority: 66,
    when: (c) => c.strongWindOnHill && !c.isStorm && c.rainTier !== 'heavy',
    vars: (c) => ({ level: c.windLevel }),
  },
  {
    code: 'play.uvHigh',
    icon: '🕶️',
    priority: 62,
    // 与「紫外线很强」互斥，避免同一指数被提示两次
    when: (c) => c.uvMax >= 5 && c.uvMax < 8 && c.sunMatters,
    vars: (c) => ({ uv: ceil(c.uvMax) }),
  },
  {
    code: 'play.clearSunset',
    icon: '🌇',
    priority: 54,
    when: (c) => c.isClear && c.profile.sunsetViewpoint,
  },
  { code: 'play.cloudyPhoto', icon: '📷', priority: 44, when: (c) => c.isCloudy },
  { code: 'play.clear', icon: '🥾', priority: 36, when: (c) => c.isClear },
];

/** 随身物品（不满足条件的不出现：不下雨就不会出现雨伞） */
const ITEM_RULES: Rule[] = [
  {
    code: 'item.raincoat',
    icon: '🧥',
    priority: 100,
    when: (c) => c.isStorm || c.rainTier === 'heavy',
  },
  {
    code: 'item.grip',
    icon: '🥾',
    priority: 94,
    when: (c) => c.rainTier !== 'none' || c.isSnow || c.isIcy,
  },
  {
    code: 'item.umbrella',
    icon: '☂️',
    priority: 92,
    // 下雪或冻雨打伞没有意义，这两类只提醒防滑与防寒
    when: (c) => (c.isRainy || c.rainyLikely) && !c.isSnow && !c.isIcy,
  },
  { code: 'item.warm', icon: '🧣', priority: 84, when: (c) => c.isCold },
  { code: 'item.layer', icon: '🎒', priority: 78, when: (c) => c.tempSwing > 8 },
  {
    code: 'item.sunscreen',
    icon: '🧴',
    priority: 74,
    when: (c) => (c.uvMax >= 5 || c.isClear) && c.sunMatters,
  },
  {
    code: 'item.sunglasses',
    icon: '🕶️',
    priority: 68,
    when: (c) => c.uvMax >= 5 && c.sunMatters,
  },
  {
    code: 'item.hat',
    icon: '🧢',
    priority: 64,
    when: (c) => (c.uvMax >= 5 || c.tempMax >= 28) && c.sunMatters,
  },
  {
    code: 'item.water',
    icon: '🚰',
    priority: 58,
    when: (c) => c.profile.terrain === 'hill',
  },
  { code: 'item.mask', icon: '😷', priority: 52, when: (c) => c.isFog },
  {
    code: 'item.quickdry',
    icon: '👕',
    priority: 46,
    when: (c) => c.humidity >= 80 && c.tempMax >= 24 && !c.isSnow,
  },
];

/* ────────────────────────── 选取与输出 ────────────────────────── */

const toItem = (rule: Rule, ctx: AdviceContext): AdviceItem => {
  const item: AdviceItem = { code: rule.code, icon: rule.icon };
  if (rule.vars) item.vars = rule.vars(ctx);
  return item;
};

/** 命中 → 按优先级排序 → 截断；一条都不命中时回落到兜底文案 */
function select(
  rules: Rule[],
  ctx: AdviceContext,
  limit: number,
  fallback: AdviceItem,
): AdviceItem[] {
  const matched = rules
    .filter((rule) => rule.when(ctx))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit)
    .map((rule) => toItem(rule, ctx));

  return matched.length > 0 ? matched : [fallback];
}

/**
 * 依据当前实况与今日预报生成建议。
 *
 * @param current 当前实况（含归一化后的 condition 与强度原始码）
 * @param today   今日预报；缺失时退化为「只看实况」
 */
export function buildWeatherAdvice(
  current: WeatherCurrent,
  today: WeatherDay | null,
): WeatherAdvice {
  const ctx = buildContext(current, today);

  return {
    // 无风险时整组为空，前端会直接隐藏红色提示区
    alerts: ALERT_RULES.filter((rule) => rule.when(ctx))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, LIMIT.alerts)
      .map((rule) => toItem(rule, ctx)),
    outfit: select(OUTFIT_RULES, ctx, LIMIT.outfit, { code: 'outfit.mild', icon: '👟' }),
    activities: select(ACTIVITY_RULES, ctx, LIMIT.activities, {
      code: 'play.mild',
      icon: '🌤️',
    }),
    items: select(ITEM_RULES, ctx, LIMIT.items, { code: 'item.mild', icon: '🎒' }),
  };
}
