/**
 * 单景点 SEO 实体绑定配置（Entity Binding Data）
 * ------------------------------------------------------------------
 * 全站唯一的“景点实体”数据源。任何页面（Schema.org、TDK、OG、地图、
 * 面包屑、页脚 NAP）都从这里取值，确保名称 / 地址 / 坐标 / 链接
 * 在所有语言与所有页面中保持 100% 一致（NAP consistency）。
 *
 * 变量占位符对应关系（见需求表）：
 *   {{DOMAIN_NAME}}            -> domain
 *   {{ATTRACTION_FULL_NAME}}   -> fullName
 *   {{ATTRACTION_SHORT_NAME}}  -> shortName
 *   {{CITY_NAME}}              -> city
 *   {{STATE_PROVINCE}}         -> region
 *   {{COUNTRY_NAME}}           -> country
 *   {{COUNTRY_CODE_2LETTER}}   -> countryCode
 *   {{POSTAL_CODE}}            -> postalCode
 *   {{LATITUDE}} / {{LONGITUDE}} -> latitude / longitude
 *   {{MAPS_SHARE_URL}}         -> mapsShareUrl
 *   {{MAPS_EMBED_SRC}}         -> mapsEmbedSrc
 *   {{NEARBY_LANDMARK_1/2}}    -> nearbyLandmarks
 *   {{GOVT_TOURISM_URL}}       -> govtTourismUrl
 */

export const attraction = {
  // ── 基本身份 ───────────────────────────────────────────────
  domain: 'haneulparkguide.com',
  siteUrl: 'https://haneulparkguide.com',
  fullName: 'Haneul Park',
  localName: '하늘공원',
  shortName: 'Haneul Park',
  /** 便于 alternateName / 语义等值声明使用 */
  alternateNames: [
    '하늘공원',
    'Haneul Park',
    'Haneul Park (하늘공원)',
    'Sky Park Seoul',
    'Haneul Park Seoul',
    '天空公园',
    'ハヌル公園',
  ],

  // ── 地理归属（面包屑：景点 → 区 → 市 → 国家）──────────────
  district: 'Mapo-gu',
  city: 'Seoul',
  region: 'Seoul',
  country: 'South Korea',
  countryCode: 'KR',
  postalCode: '03900',
  streetAddress: '95 Haneulgongwon-ro, Mapo-gu',
  /** 完整地址（单行 NAP 展示用） */
  streetAddressFull: '95 Haneulgongwon-ro, Mapo-gu, Seoul 03900, South Korea',

  // ── 坐标与编码 ─────────────────────────────────────────────
  latitude: 37.5674533,
  longitude: 126.8854782,
  plusCode: 'HV8P+X5',

  // ── 联系方式（与 Google 地图资料保持一致）─────────────────
  telephone: '+82-2-300-5501',
  telephoneE164: '+8223005501',

  // ── 地图 ───────────────────────────────────────────────────
  mapsShareUrl: 'https://maps.app.goo.gl/yCzVRqGHL5rkgDFL7',
  mapsEmbedSrc:
    'https://www.google.com/maps/embed?pb=!1m5!3m3!1m2!1s0x357b4552b993615f%3A0xa96d9d254b05ae18!2sHaneul%20Park!5e1!3m2!1szh-CN!2sus!4v1789107693505!5m2!1szh-CN!2sus',

  // ── 权威外链（.go.kr / .org，增强 E-E-A-T 与本地引用）─────
  govtTourismUrl: 'https://parks.seoul.go.kr/',
  govtTourismName: 'Seoul Metropolitan Government Parks — World Cup Park / Haneul Park',
  officialTourismUrl: 'https://www.visitseoul.net/',
  officialTourismName: 'Visit Seoul (Seoul Tourism Organization)',

  // ── 周边核心地标（语义集群）────────────────────────────────
  nearbyLandmarks: [
    'Peace Park (평화의공원)',
    'Nanji Hangang Park (난지한강공원)',
    'Seoul World Cup Stadium (서울월드컵경기장)',
    'Noeul Park (노을공원)',
  ],

  // ── 结构化数据属性 ─────────────────────────────────────────
  ratingValue: 4.5,
  reviewCount: 8297,
  priceRange: 'Free',
  isAccessibleForFree: true,
  openingHours: { opens: '06:00', closes: '22:00' },

  // ── 地理环境画像（天气建议引擎据此输出“本地化场景提示”）────
  // 本站景点属于「山地丘陵 + 城市人文」组合场景：山顶完全暴露、
  // 上山以台阶与木栈道为主、山顶无遮阴与室内避雨处，且临江湿度偏高。
  // 因此天气建议除通用项外，还需覆盖登顶风感、台阶湿滑、观日落时机。
  weatherProfile: {
    /** 地形：hill = 山地丘陵（决定是否输出登顶/台阶类提示） */
    terrain: 'hill' as 'hill' | 'flat' | 'coastal',
    /** 城市人文环境：热岛效应明显，夏季夜间降温慢 */
    urban: true,
    /** 山顶暴露程度高于市区（风感更强、体感更低） */
    exposedSummit: true,
    /** 上山以台阶与木栈道为主，湿滑天气需重点提醒 */
    stepAccess: true,
    /** 山顶几乎没有遮阴与室内避雨空间 */
    noShelter: true,
    /** 临汉江，近水区域风力与湿度偏高 */
    riverside: true,
    /** 日落与城市天际线是本站核心体验，晴天提示观景时机 */
    sunsetViewpoint: true,
  },

  // ── 图片资源（命名规范：haneul-park-<index>）─────────────────
  /** 图库照片总数（与 /gallery/haneul-park-<n>.* 一一对应） */
  galleryCount: 24,
  /** 图库图片基路径，组件按 `${galleryBase}-<n>.jpg|.avif` 取值 */
  galleryBase: '/gallery/haneul-park',
  /** LCP / 社交分享用的大图 */
  heroImage: '/gallery/haneul-park-hero.jpg',

  /** JSON-LD image 节点（Google 搜索卡片强依赖） */
  images: [
    '/gallery/haneul-park-1.jpg',
    '/gallery/haneul-park-2.jpg',
    '/gallery/haneul-park-3.jpg',
    '/gallery/haneul-park-4.jpg',
  ],

  /** 版权声明：所有图片产权归原摄影者所有 */
  imageCredit: 'All image rights and copyrights on this site belong to the original photographers.',
} as const;

export type Attraction = typeof attraction;
export default attraction;
