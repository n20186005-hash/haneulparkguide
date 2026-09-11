import zh from './zh.json';
import en from './en.json';
import ja from './ja.json';
import ko from './ko.json';

export const defaultLang = 'ko';
/** 默认韩语，其余为可切换语言（顺序即语言切换器的展示顺序） */
export const languagesList = ['ko', 'zh', 'en', 'ja'] as const;

export const languages: Record<string, string> = {
  ko: '한국어',
  zh: '中文',
  en: 'English',
  ja: '日本語',
};

const ui: Record<string, any> = { zh, en, ja, ko };

export function getLangFromUrl(url: URL): string {
  const seg = url.pathname.split('/').filter(Boolean);
  const lang = seg[0];
  return (languagesList as readonly string[]).includes(lang) ? lang : defaultLang;
}

export function getI18n(url: URL) {
  const lang = getLangFromUrl(url);
  const messages = ui[lang];
  const t = (key: string): string => {
    const found = key
      .split('.')
      .reduce<any>((o, i) => (o == null ? undefined : o[i]), messages);
    return found ?? '';
  };
  return { lang, messages, t };
}

export function buildAlternates(path = ''): Record<string, string> {
  const base = 'https://haneulparkguide.com';
  const clean = path.replace(/^\/+/, '').replace(/\/+$/, '');
  const mk = (l: string) => `${base}/${l}${clean ? '/' + clean : ''}`;
  return {
    zh: mk('zh'),
    en: mk('en'),
    ja: mk('ja'),
    ko: mk('ko'),
    xDefault: mk('ko'),
  };
}

export function htmlLangAttr(lang: string): string {
  if (lang === 'zh') return 'zh-CN';
  return lang;
}
