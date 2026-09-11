import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: 'https://haneulparkguide.com',
  // 站点主体保持静态预渲染（访问速度最快）；仅 /api/* 天气端点在请求时
  // 于服务端执行，见 src/pages/api/weather.ts 中的 `prerender = false`。
  output: 'static',
  adapter: cloudflare(),
  i18n: {
    defaultLocale: 'ko',
    locales: ['ko', 'zh', 'en', 'ja'],
    routing: {
      prefixDefaultLocale: true,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
