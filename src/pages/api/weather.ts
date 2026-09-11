/**
 * GET /api/weather
 * ------------------------------------------------------------------
 * 服务端天气端点。浏览器只与本端点通信，上游数据源地址 / 参数 / 配额
 * 全部留在服务端，页面与网络面板中都不会出现数据供应方的任何信息。
 *
 * 缓存策略（三层，逐层回退）：
 *   1. 运行时内存缓存（同一 isolate 内最快）
 *   2. 边缘缓存 Cache API（跨 isolate / 跨 PoP 共享）
 *   3. 上游回源（仅在前两层都未命中时发生）
 * 回源失败时返回“过期但可用”的旧数据，避免页面出现空白。
 */
import type { APIRoute } from 'astro';

import { fetchWeather, WEATHER_TTL_SECONDS, type WeatherPayload } from '../../lib/weather';

/** 关闭预渲染：该端点必须在请求时于服务端执行。 */
export const prerender = false;

interface CacheEntry {
  payload: WeatherPayload;
  expiresAt: number;
}

let memoryCache: CacheEntry | null = null;

const CACHE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': `public, max-age=300, s-maxage=${WEATHER_TTL_SECONDS}, stale-while-revalidate=1800`,
} as const;

function respond(payload: WeatherPayload, state: 'memory' | 'edge' | 'origin' | 'stale') {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...CACHE_HEADERS, 'x-weather-cache': state },
  });
}

export const GET: APIRoute = async ({ request, locals }) => {
  const now = Date.now();

  // ── 1. 运行时内存缓存 ────────────────────────────────────────
  if (memoryCache && memoryCache.expiresAt > now) {
    return respond(memoryCache.payload, 'memory');
  }

  // ── 2. 边缘缓存 ──────────────────────────────────────────────
  const edgeCache = (locals as { runtime?: { caches?: { default?: Cache } } })?.runtime?.caches?.default;
  const cacheKey = new Request(new URL('/__edge-cache/weather', request.url).toString(), { method: 'GET' });

  if (edgeCache) {
    try {
      const hit = await edgeCache.match(cacheKey);
      if (hit) {
        const payload = (await hit.json()) as WeatherPayload;
        memoryCache = { payload, expiresAt: now + WEATHER_TTL_SECONDS * 1000 };
        return respond(payload, 'edge');
      }
    } catch {
      // 边缘缓存不可用时静默降级，不影响主流程。
    }
  }

  // ── 3. 回源 ─────────────────────────────────────────────────
  try {
    const payload = await fetchWeather();
    memoryCache = { payload, expiresAt: now + WEATHER_TTL_SECONDS * 1000 };

    if (edgeCache) {
      try {
        await edgeCache.put(cacheKey, respond(payload, 'origin'));
      } catch {
        // 忽略：部分运行时（如本地 dev）不支持 Cache API。
      }
    }
    return respond(payload, 'origin');
  } catch {
    // 回源失败：优先返回过期数据，其次才报错。
    if (memoryCache) return respond(memoryCache.payload, 'stale');

    return new Response(JSON.stringify({ error: 'weather_unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
};
