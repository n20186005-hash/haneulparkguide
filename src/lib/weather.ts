/**
 * 天空公园 · 天气数据层（服务端专用）
 * ------------------------------------------------------------------
 * 该模块只在服务端（构建期 / 边缘运行时）执行，浏览器永远不会直连上游
 * 数据源，因此访问者无法看到任何数据供应方的名称、接口地址或参数。
 *
 * 上游返回的 WMO weather_code 会被归一化为稳定的 condition key，
 * 文案由各语言词条负责，前端组件只做查表，避免多语言逻辑分散。
 */
import attraction from '../config/attraction';
import { buildWeatherAdvice, type WeatherAdvice } from './weatherAdvice';

/** 归一化后的天气状况标识（前端据此查本地化文案与图标） */
export type WeatherCondition =
  | 'clear'
  | 'mainly-clear'
  | 'partly-cloudy'
  | 'overcast'
  | 'fog'
  | 'drizzle'
  | 'freezing-drizzle'
  | 'rain'
  | 'freezing-rain'
  | 'snow'
  | 'snow-grains'
  | 'rain-showers'
  | 'snow-showers'
  | 'thunderstorm'
  | 'severe-thunderstorm'
  | 'unknown';

export interface WeatherCurrent {
  temperature: number;
  apparentTemperature: number | null;
  humidity: number | null;
  precipitationProbability: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  condition: WeatherCondition;
  /** 归一化前的原始码，用于区分小雨 / 中雨 / 大雨强度（不含供应方信息） */
  weatherCode: number | null;
  isDay: boolean;
}

export interface WeatherDay {
  /** ISO date, e.g. 2026-09-11 */
  date: string;
  condition: WeatherCondition;
  /** 归一化前的原始码，用于区分降水强度 */
  weatherCode: number | null;
  temperatureMax: number;
  temperatureMin: number;
  precipitationProbability: number | null;
  uvIndexMax: number | null;
  sunrise: string | null;
  sunset: string | null;
}

export interface WeatherPayload {
  current: WeatherCurrent;
  daily: WeatherDay[];
  /** 观测时刻（ISO 8601，含时区偏移） */
  observedAt: string | null;
  timezone: string;
  /**
   * 由气象数据推导出的“可直接执行”的行动建议。
   * 只包含与语言无关的条目码（code），文案由各语言词条解析，
   * 因此同一份缓存响应可服务所有语言。
   */
  advice: WeatherAdvice;
  /** 该响应建议的缓存时长（秒） */
  ttl: number;
}

/** 上游数据缓存时长：15 分钟。既保证“准”，又避免频繁回源。 */
export const WEATHER_TTL_SECONDS = 900;

/** 预报天数（含今天） */
const FORECAST_DAYS = 7;

/** 上游请求超时（毫秒），避免构建或边缘请求被拖垮 */
const UPSTREAM_TIMEOUT_MS = 6000;

const UPSTREAM_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

const CURRENT_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'is_day',
  'precipitation_probability',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
];

const DAILY_FIELDS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'sunrise',
  'sunset',
  'precipitation_probability_max',
  'uv_index_max',
];

/**
 * WMO weather code -> 归一化 condition
 * @see https://www.nmt.edu/~weather/wmo_codes.pdf
 */
export function conditionFromCode(code: number | null | undefined): WeatherCondition {
  if (code === null || code === undefined || Number.isNaN(code)) return 'unknown';
  if (code === 0) return 'clear';
  if (code === 1) return 'mainly-clear';
  if (code === 2) return 'partly-cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code === 51 || code === 53 || code === 55) return 'drizzle';
  if (code === 56 || code === 57) return 'freezing-drizzle';
  if (code === 61 || code === 63 || code === 65) return 'rain';
  if (code === 66 || code === 67) return 'freezing-rain';
  if (code === 71 || code === 73 || code === 75) return 'snow';
  if (code === 77) return 'snow-grains';
  if (code === 80 || code === 81 || code === 82) return 'rain-showers';
  if (code === 85 || code === 86) return 'snow-showers';
  if (code === 95) return 'thunderstorm';
  if (code === 96 || code === 99) return 'severe-thunderstorm';
  return 'unknown';
}

/** 天气状况对应的图标（与语言无关，可安全地由服务端下发） */
export const CONDITION_ICON: Record<WeatherCondition, string> = {
  clear: '☀️',
  'mainly-clear': '🌤️',
  'partly-cloudy': '⛅',
  overcast: '☁️',
  fog: '🌫️',
  drizzle: '🌦️',
  'freezing-drizzle': '🌧️',
  rain: '🌧️',
  'freezing-rain': '🌧️',
  snow: '❄️',
  'snow-grains': '🌨️',
  'rain-showers': '🌦️',
  'snow-showers': '🌨️',
  thunderstorm: '⛈️',
  'severe-thunderstorm': '⛈️',
  unknown: '🌫️',
};

/** 夜间图标（仅用于“晴/多云”这类昼夜差异明显的状况） */
export const NIGHT_ICON: Partial<Record<WeatherCondition, string>> = {
  clear: '🌙',
  'mainly-clear': '🌙',
};

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const round = (value: number | null, digits = 0): number | null =>
  value === null ? null : Number(value.toFixed(digits));

/** 只保留 "HH:MM" 部分（上游返回 "2026-09-11T19:34"） */
const clock = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const at = value.indexOf('T');
  return at === -1 ? null : value.slice(at + 1, at + 6);
};

const pick = (list: unknown, index: number): unknown =>
  Array.isArray(list) ? list[index] : undefined;

interface UpstreamPayload {
  current?: Record<string, unknown>;
  daily?: Record<string, unknown>;
  timezone?: string;
}

/** 把上游响应转换为站内稳定的数据结构 */
export function normalizeWeather(raw: UpstreamPayload): WeatherPayload {
  const current = raw.current ?? {};
  const daily = raw.daily ?? {};

  const dates: unknown = daily.time;
  const dayCount = Array.isArray(dates) ? dates.length : 0;

  const days: WeatherDay[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    const date = pick(dates, i);
    const dayCode = num(pick(daily.weather_code, i));
    days.push({
      date: typeof date === 'string' ? date : '',
      condition: conditionFromCode(dayCode),
      weatherCode: round(dayCode),
      temperatureMax: round(num(pick(daily.temperature_2m_max, i))) ?? 0,
      temperatureMin: round(num(pick(daily.temperature_2m_min, i))) ?? 0,
      precipitationProbability: round(num(pick(daily.precipitation_probability_max, i))),
      uvIndexMax: round(num(pick(daily.uv_index_max, i)), 1),
      sunrise: clock(pick(daily.sunrise, i)),
      sunset: clock(pick(daily.sunset, i)),
    });
  }

  const currentCode = num(current.weather_code);
  const condition = conditionFromCode(currentCode);

  const currentWeather: WeatherCurrent = {
    temperature: round(num(current.temperature_2m), 1) ?? 0,
    apparentTemperature: round(num(current.apparent_temperature), 1),
    humidity: round(num(current.relative_humidity_2m)),
    precipitationProbability: round(num(current.precipitation_probability)),
    windSpeed: round(num(current.wind_speed_10m), 1),
    windDirection: round(num(current.wind_direction_10m)),
    condition,
    weatherCode: round(currentCode),
    isDay: num(current.is_day) !== 0,
  };

  return {
    current: currentWeather,
    daily: days,
    observedAt: typeof current.time === 'string' ? current.time : null,
    timezone: typeof raw.timezone === 'string' ? raw.timezone : 'Asia/Seoul',
    advice: buildWeatherAdvice(currentWeather, days[0] ?? null),
    ttl: WEATHER_TTL_SECONDS,
  };
}

/**
 * 在服务端向上游拉取一次预报数据并归一化。
 * 调用方负责缓存；本函数不做任何缓存，保证语义单纯。
 */
export async function fetchWeather(): Promise<WeatherPayload> {
  const url = new URL(UPSTREAM_ENDPOINT);
  url.searchParams.set('latitude', String(attraction.latitude));
  url.searchParams.set('longitude', String(attraction.longitude));
  url.searchParams.set('current', CURRENT_FIELDS.join(','));
  url.searchParams.set('daily', DAILY_FIELDS.join(','));
  url.searchParams.set('timezone', 'Asia/Seoul');
  url.searchParams.set('forecast_days', String(FORECAST_DAYS));
  url.searchParams.set('wind_speed_unit', 'kmh');
  url.searchParams.set('temperature_unit', 'celsius');

  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    // Cloudflare 边缘节点的原生缓存；其它运行时忽略该字段。
    // @ts-expect-error -- `cf` 仅存在于 Cloudflare Workers 环境
    cf: { cacheTtl: WEATHER_TTL_SECONDS, cacheEverything: true },
  });

  if (!response.ok) {
    throw new Error(`weather upstream responded ${response.status}`);
  }

  return normalizeWeather((await response.json()) as UpstreamPayload);
}
