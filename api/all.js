// api/all.js — K-water 실시간 댐 데이터 + Supabase 캐시 + 카테고리 메타정보
// v2.1 (2026-05) — DamWatch Korea
//
// 변경사항 (v2.0 → v2.1):
//   ⭐ NEW: 시간별 history 시계열 추가 (K-water /hourlist 30시간치 활용)
//   ⭐ NEW: Supabase history_json 캐시 컬럼 자동 활용 (없으면 fallback)
//   ✅ 기존 v2.0 기능 모두 유지 (실시간 1개·정확한 필드·62개 사이트·카테고리 등)
//
// 출처: 한국수자원공사 OpenAPI (apis.data.go.kr/B500001)
// 인증: 공공데이터포털 발급 서비스키 (적용 종료일 2028-05-05)

const { createClient } = require('@supabase/supabase-js')

const KWATER_KEY = process.env.KWATER_KEY ||
  'adf383b5707d32def18d17ddec442b29ca7284cdd59370986fc5fa9868ecab35'
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const KWATER_BASE = 'https://apis.data.go.kr/B500001/dam/sluicePresentCondition'

// ═══════════════════════════════════════════════════════════════════
// 카테고리 정의
// ═══════════════════════════════════════════════════════════════════
const CATEGORIES = {
  multipurpose: {
    name: '다목적댐', name_en: 'Multipurpose Dam',
    icon: '🏔️', color: '#1e40af',
    desc: '발전·용수공급·홍수조절을 모두 하는 큰 댐. 한국 댐 중 가장 큰 시설들이에요.'
  },
  water_supply: {
    name: '용수전용댐', name_en: 'Water Supply Dam',
    icon: '💧', color: '#0ea5e9',
    desc: '식수·공업용수 공급만을 위해 만든 댐. 도시 가까이에서 수돗물을 책임져요.'
  },
  flood_control: {
    name: '홍수조절용댐', name_en: 'Flood Control Dam',
    icon: '🚨', color: '#dc2626',
    desc: '평소엔 거의 비어있다가 홍수 때만 물을 가두는 특수 댐. 평화의댐이 대표적!'
  },
  estuary_barrage: {
    name: '하굿둑', name_en: 'Estuary Barrage',
    icon: '🌊', color: '#0d9488',
    desc: '강과 바다의 경계 시설. 바닷물 역류를 막고 강물을 저장해요.'
  },
  regulation: {
    name: '조정지', name_en: 'Regulating Reservoir',
    icon: '🔄', color: '#6b7280',
    desc: '본댐 직하류의 작은 댐. 본댐이 발전할 때 갑자기 쏟아지는 물을 평탄화해요.'
  },
  weir: {
    name: '보 (Weir)', name_en: 'Weir',
    icon: '🏞️', color: '#f97316',
    desc: '댐보다 작은 강 횡단 시설. 4대강 사업으로 만들어진 16개 보가 유명해요.'
  },
}

const RIVER_BASINS = {
  han:      { name: '한강',   name_en: 'Han River',     color: '#3b82f6' },
  nakdong:  { name: '낙동강', name_en: 'Nakdong River', color: '#10b981' },
  geum:     { name: '금강',   name_en: 'Geum River',    color: '#f59e0b' },
  seomjin:  { name: '섬진강', name_en: 'Seomjin River', color: '#8b5cf6' },
  yeongsan: { name: '영산강', name_en: 'Yeongsan River',color: '#ec4899' },
  etc:      { name: '기타',   name_en: 'Other',         color: '#6b7280' },
}

const OPERATORS = {
  kwater: { name: '한국수자원공사 (K-water)',  short: 'K-water' },
  khnp:   { name: '한국수력원자력 (KHNP)',     short: 'KHNP' },
}

// ═══════════════════════════════════════════════════════════════════
// 댐 메타정보 (62개 사이트)
// ═══════════════════════════════════════════════════════════════════
const DAM_META = {
  // ─── 한강 수계 ─────────────────────────────────────────────
  soyang: { name:'소양강댐', full:2900, lat:37.9833, lng:127.7167, kwater_code:'1012110', category:'multipurpose', river_basin:'han', operator:'kwater', cities:['춘천','원주','서울','인천','경기'], note:'국내 최대 저수용량 댐 (2,900백만톤). 수도권 식수의 핵심.' },
  chungju: { name:'충주댐', full:2750, lat:37.0167, lng:128.0167, kwater_code:'1003110', category:'multipurpose', river_basin:'han', operator:'kwater', cities:['충주','청주','대전','수도권'], note:'국내 2위 저수용량. 한강 수계의 핵심 다목적댐.' },
  chungju_reg: { name:'충주조정지댐', full:32, lat:37.0500, lng:128.0500, kwater_code:'1003611', category:'regulation', river_basin:'han', operator:'kwater', cities:['충주'], note:'충주댐 발전 후 일정 유량을 유지하기 위한 조정지.' },
  hoengseong: { name:'횡성댐', full:86.9, lat:37.4833, lng:128.1833, kwater_code:'1006110', category:'multipurpose', river_basin:'han', operator:'kwater', cities:['원주','횡성'], note:'강원 영서 지역의 식수원.' },
  pyeonghwa: { name:'평화의댐', full:263, lat:38.1583, lng:127.7000, kwater_code:'1009710', category:'flood_control', river_basin:'han', operator:'kwater', cities:['화천','춘천'], note:'평소엔 비어있는 방어 댐! 북한 임남댐(금강산댐) 방류에 대비해 만들어졌어요.' },
  gunnam: { name:'군남댐', full:71.5, lat:38.0500, lng:127.0500, kwater_code:'1021701', category:'flood_control', river_basin:'han', operator:'kwater', cities:['연천','파주'], note:'임진강 홍수 조절을 위한 댐. 정식 명칭은 군남홍수조절지.' },
  gwangdong: { name:'광동댐', full:8.5, lat:37.2167, lng:128.9833, kwater_code:'1001210', category:'water_supply', river_basin:'han', operator:'kwater', cities:['태백','정선'], note:'강원 태백 지역 식수 전용 작은 댐.' },
  dalbang: { name:'달방댐', full:5.1, lat:37.1667, lng:128.9667, kwater_code:'1302210', category:'water_supply', river_basin:'han', operator:'kwater', cities:['동해'], note:'동해시 식수원. 작지만 지역에는 매우 중요한 댐.' },
  gangcheonbo: { name:'강천보', full:41.5, lat:37.2700, lng:127.6500, kwater_code:'1007601', category:'weir', river_basin:'han', operator:'kwater', cities:['여주'], note:'4대강 사업 한강 보 (3개 중 상류). 여주 강천면.' },
  yeojubo: { name:'여주보', full:32.5, lat:37.3000, lng:127.6200, kwater_code:'1007602', category:'weir', river_basin:'han', operator:'kwater', cities:['여주'], note:'4대강 사업 한강 보. 여주 시내에 인접.' },
  ipobo: { name:'이포보', full:17.2, lat:37.2500, lng:127.5000, kwater_code:'1007603', category:'weir', river_basin:'han', operator:'kwater', cities:['여주'], note:'4대강 사업 한강 보 (3개 중 하류). 여주 이포.' },
  hwacheon: { name:'화천댐', full:1018, lat:38.1000, lng:127.7000, kwater_code:null, category:'multipurpose', river_basin:'han', operator:'khnp', is_static:true, cities:['화천','춘천'], note:'한국수력원자력 관리 — 발전 전용. 일제강점기에 지어진 가장 오래된 댐.' },
  paldang: { name:'팔당댐', full:244, lat:37.5333, lng:127.3167, kwater_code:null, category:'multipurpose', river_basin:'han', operator:'khnp', is_static:true, cities:['하남','남양주','서울','경기'], note:'한국수력원자력 관리 — 수도권 식수의 1차 공급원이지만 K-water가 아닌 KHNP 관할.' },

  // ─── 낙동강 수계 ───────────────────────────────────────────
  andong: { name:'안동댐', full:1248, lat:36.5833, lng:128.8167, kwater_code:'2001110', category:'multipurpose', river_basin:'nakdong', operator:'kwater', cities:['안동','영주','의성','영덕'], note:'낙동강 수계의 가장 상류 다목적댐.' },
  andong_reg: { name:'안동조정지댐', full:9.2, lat:36.5500, lng:128.8500, kwater_code:'2001611', category:'regulation', river_basin:'nakdong', operator:'kwater', cities:['안동'], note:'안동댐 발전 후 방류량 평탄화용 조정지.' },
  imha: { name:'임하댐', full:595, lat:36.6000, lng:129.0167, kwater_code:'2002110', category:'multipurpose', river_basin:'nakdong', operator:'kwater', cities:['안동','의성','청송'], note:'낙동강 지류 반변천에 위치. 안동댐과 함께 영남권 식수 책임.' },
  imha_reg: { name:'임하조정지댐', full:5.0, lat:36.5800, lng:129.0000, kwater_code:'2002610', category:'regulation', river_basin:'nakdong', operator:'kwater', cities:['안동'], note:'임하댐 직하류의 조정지.' },
  seongdeok: { name:'성덕댐', full:53.5, lat:36.1167, lng:128.7167, kwater_code:'2002111', category:'multipurpose', river_basin:'nakdong', operator:'kwater', cities:['성주','칠곡'], note:'비교적 최근 완공된 다목적댐.' },
  yeongju: { name:'영주댐', full:181.6, lat:36.8667, lng:128.5167, kwater_code:'2004101', category:'multipurpose', river_basin:'nakdong', operator:'kwater', cities:['영주','봉화'], note:'낙동강 본류 최상류 다목적댐. 내성천에 위치.' },
  gunwi: { name:'군위댐', full:47.5, lat:36.2333, lng:128.5833, kwater_code:'2008101', category:'multipurpose', river_basin:'nakdong', operator:'kwater', cities:['군위','의성','영천'], note:'대구·경북 지역 식수 공급.' },
  bohyeonsan: { name:'보현산댐', full:56.6, lat:36.1500, lng:128.9833, kwater_code:'2012101', category:'multipurpose', river_basin:'nakdong', operator:'kwater', cities:['영천','청도'], note:'경북 영천의 보현산 자락에 위치.' },
  yeongcheon: { name:'영천댐', full:55.9, lat:35.9667, lng:128.9667, kwater_code:'2012210', category:'water_supply', river_basin:'nakdong', operator:'kwater', cities:['영천','경산','대구'], note:'대구·영천 식수 공급 용수전용댐.' },
  hapcheon: { name:'합천댐', full:790, lat:35.7500, lng:128.0833, kwater_code:'2015110', category:'multipurpose', river_basin:'nakdong', operator:'kwater', cities:['거창','합천','대구'], note:'낙동강 지류 황강의 대형 다목적댐.' },
  hapcheon_reg: { name:'합천조정지댐', full:3.6, lat:35.7400, lng:128.0800, kwater_code:'2018611', category:'regulation', river_basin:'nakdong', operator:'kwater', cities:['합천'], note:'합천댐 직하류의 조정지.' },
  namgang: { name:'남강댐', full:309, lat:35.1833, lng:128.0667, kwater_code:'2018110', category:'multipurpose', river_basin:'nakdong', operator:'kwater', cities:['진주','사천','함양','산청'], note:'경남 서부 지역의 핵심 다목적댐.' },
  miryang: { name:'밀양댐', full:73.6, lat:35.5333, lng:128.7500, kwater_code:'2021110', category:'multipurpose', river_basin:'nakdong', operator:'kwater', cities:['밀양','양산'], note:'낙동강 지류 밀양강의 다목적댐.' },
  unmun: { name:'운문댐', full:132.5, lat:35.8167, lng:128.9167, kwater_code:'2021210', category:'water_supply', river_basin:'nakdong', operator:'kwater', cities:['청도','대구','경산'], note:'대구 지역 식수의 핵심 용수전용댐.' },
  angye: { name:'안계댐', full:1.6, lat:36.2500, lng:128.6000, kwater_code:'2101210', category:'water_supply', river_basin:'nakdong', operator:'kwater', cities:['의성'], note:'의성군 안계면 식수 전용 작은 댐.' },
  sayeon: { name:'사연댐', full:36, lat:35.5667, lng:129.0667, kwater_code:'2201220', category:'water_supply', river_basin:'nakdong', operator:'kwater', cities:['울산'], note:'울산 시민 식수원. 울산 4개 댐 중 하나.' },
  daeam: { name:'대암댐', full:3.2, lat:35.2500, lng:128.6167, kwater_code:'2201230', category:'water_supply', river_basin:'nakdong', operator:'kwater', cities:['울산'], note:'울산 식수 공급 보조 댐.' },
  daegok: { name:'대곡댐', full:36, lat:35.5500, lng:129.1000, kwater_code:'2201231', category:'water_supply', river_basin:'nakdong', operator:'kwater', cities:['울산'], note:'울산 식수 공급 댐.' },
  seonam: { name:'선암댐', full:2.8, lat:35.5300, lng:129.3200, kwater_code:'2301210', category:'water_supply', river_basin:'nakdong', operator:'kwater', cities:['울산'], note:'울산 식수 공급 보조 댐.' },
  gampo: { name:'감포댐', full:1.5, lat:35.8000, lng:129.4333, kwater_code:'2403201', category:'water_supply', river_basin:'nakdong', operator:'kwater', cities:['경주'], note:'경주 감포 지역 식수 전용 작은 댐.' },
  yeoncho: { name:'연초댐', full:5, lat:34.9000, lng:128.6167, kwater_code:'2503210', category:'water_supply', river_basin:'nakdong', operator:'kwater', cities:['거제'], note:'거제도 식수 공급 댐.' },
  gucheon: { name:'구천댐', full:5.8, lat:34.8500, lng:128.6500, kwater_code:'2503220', category:'water_supply', river_basin:'nakdong', operator:'kwater', cities:['거제'], note:'거제도 식수 공급 댐.' },
  sangjubo: { name:'상주보', full:27.4, lat:36.5000, lng:128.1800, kwater_code:'2007601', category:'weir', river_basin:'nakdong', operator:'kwater', cities:['상주'], note:'4대강 사업 낙동강 보 (가장 상류).' },
  nakdanbo: { name:'낙단보', full:24.7, lat:36.4300, lng:128.3200, kwater_code:'2009601', category:'weir', river_basin:'nakdong', operator:'kwater', cities:['상주','의성'], note:'4대강 사업 낙동강 보.' },
  gumibo: { name:'구미보', full:50.0, lat:36.1300, lng:128.4200, kwater_code:'2009602', category:'weir', river_basin:'nakdong', operator:'kwater', cities:['구미'], note:'4대강 사업 낙동강 보.' },
  chilgokbo: { name:'칠곡보', full:39.8, lat:35.9700, lng:128.4200, kwater_code:'2011601', category:'weir', river_basin:'nakdong', operator:'kwater', cities:['칠곡','구미'], note:'4대강 사업 낙동강 보.' },
  gangjeonggoryeongbo: { name:'강정고령보', full:92.6, lat:35.8300, lng:128.4500, kwater_code:'2011602', category:'weir', river_basin:'nakdong', operator:'kwater', cities:['대구','고령'], note:'4대강 사업 낙동강 최대 보. 디아크(The ARC) 건축물로 유명.' },
  dalseongbo: { name:'달성보', full:51.0, lat:35.6500, lng:128.4500, kwater_code:'2014601', category:'weir', river_basin:'nakdong', operator:'kwater', cities:['달성','고령'], note:'4대강 사업 낙동강 보.' },
  hapcheonchangnyeongbo: { name:'합천창녕보', full:22.0, lat:35.5500, lng:128.4200, kwater_code:'2014602', category:'weir', river_basin:'nakdong', operator:'kwater', cities:['합천','창녕'], note:'4대강 사업 낙동강 보.' },
  changnyeonghamanbo: { name:'창녕함안보', full:87.4, lat:35.4200, lng:128.5000, kwater_code:'2017601', category:'weir', river_basin:'nakdong', operator:'kwater', cities:['창녕','함안'], note:'4대강 사업 낙동강 보 (하류).' },
  nakdong_estuary: { name:'낙동강하굿둑', full:296, lat:35.1100, lng:128.9500, kwater_code:'2022510', category:'estuary_barrage', river_basin:'nakdong', operator:'kwater', cities:['부산','김해'], note:'낙동강과 바다의 경계. 바닷물 역류를 막아 부산 식수원을 보호.' },
  gimcheonbuhang: { name:'김천부항댐', full:105, lat:36.0167, lng:127.9500, kwater_code:null, category:'multipurpose', river_basin:'nakdong', operator:'kwater', is_static:true, cities:['김천','부항'], note:'K-water 다목적댐이지만 댐코드 API 응답에서 누락됨 (API 측 이슈).' },

  // ─── 금강 수계 ─────────────────────────────────────────────
  yongdam: { name:'용담댐', full:815, lat:35.9667, lng:127.5500, kwater_code:'3001110', category:'multipurpose', river_basin:'geum', operator:'kwater', cities:['진안','무주','전주'], note:'전북 진안의 다목적댐. 전주권 식수 공급.' },
  daecheong: { name:'대청댐', full:1490, lat:36.4833, lng:127.5000, kwater_code:'3008110', category:'multipurpose', river_basin:'geum', operator:'kwater', cities:['대전','청주','옥천','공주'], note:'대전·충청권 식수의 핵심. 금강 수계 최대 댐.' },
  daecheong_reg: { name:'대청조정지댐', full:4.0, lat:36.4500, lng:127.5000, kwater_code:'3008611', category:'regulation', river_basin:'geum', operator:'kwater', cities:['대전'], note:'대청댐 직하류의 조정지.' },
  sejongbo: { name:'세종보', full:5.0, lat:36.5000, lng:127.2700, kwater_code:'3010601', category:'weir', river_basin:'geum', operator:'kwater', cities:['세종'], note:'4대강 사업 금강 보. 세종시 도심에 위치.' },
  gongjubo: { name:'공주보', full:5.6, lat:36.4500, lng:127.1300, kwater_code:'3012601', category:'weir', river_basin:'geum', operator:'kwater', cities:['공주'], note:'4대강 사업 금강 보. 공산성 인근.' },
  baekjebo: { name:'백제보', full:23.7, lat:36.3000, lng:126.9300, kwater_code:'3012602', category:'weir', river_basin:'geum', operator:'kwater', cities:['부여'], note:'4대강 사업 금강 보 (가장 하류).' },

  // ─── 섬진강 수계 ──────────────────────────────────────────
  seomjin: { name:'섬진강댐', full:466, lat:35.5667, lng:127.2333, kwater_code:'4001110', category:'multipurpose', river_basin:'seomjin', operator:'kwater', cities:['임실','정읍','김제'], note:'국내 최초 다목적댐 (1965년 완공). 한국 댐의 효시.' },
  juam: { name:'주암댐(본)', full:457, lat:35.0000, lng:127.2167, kwater_code:'4007110', category:'multipurpose', river_basin:'seomjin', operator:'kwater', cities:['순천','광양','여수'], note:'전남 동부 광양만권의 핵심 다목적댐.' },
  juam_reg: { name:'주암조정지댐', full:25.5, lat:34.9900, lng:127.2100, kwater_code:'4104610', category:'regulation', river_basin:'seomjin', operator:'kwater', cities:['순천'], note:'주암댐 직하류 조정지.' },
  juam_yeok_reg: { name:'주암역조정지댐', full:4.5, lat:34.9700, lng:127.2000, kwater_code:'4204612', category:'regulation', river_basin:'seomjin', operator:'kwater', cities:['보성','순천'], note:'주암조정지의 보조 조정지.' },
  sueo: { name:'수어댐', full:77, lat:34.9667, lng:127.5500, kwater_code:'4105210', category:'water_supply', river_basin:'seomjin', operator:'kwater', cities:['광양','여수'], note:'광양·여수 산업단지 공업용수 공급.' },

  // ─── 영산강 수계 ──────────────────────────────────────────
  janghung: { name:'장흥댐', full:43.7, lat:34.7167, lng:126.9167, kwater_code:'5101110', category:'multipurpose', river_basin:'yeongsan', operator:'kwater', cities:['장흥','강진','영암','목포'], note:'전남 남부의 다목적댐. 목포·완도권 식수.' },
  pyeongnim: { name:'평림댐', full:7.1, lat:35.1000, lng:126.9833, kwater_code:'5002201', category:'water_supply', river_basin:'yeongsan', operator:'kwater', cities:['광주','장성'], note:'광주광역시 식수 공급 보조 댐.' },
  seungchonbo: { name:'승촌보', full:3.5, lat:35.0700, lng:126.8300, kwater_code:'5004601', category:'weir', river_basin:'yeongsan', operator:'kwater', cities:['광주'], note:'4대강 사업 영산강 보 (상류).' },
  juksanbo: { name:'죽산보', full:7.8, lat:35.0200, lng:126.7200, kwater_code:'5004602', category:'weir', river_basin:'yeongsan', operator:'kwater', cities:['나주'], note:'4대강 사업 영산강 보 (하류).' },

  // ─── 기타 (서해안) ────────────────────────────────────────
  boryeong: { name:'보령댐', full:116.9, lat:36.3333, lng:126.7000, kwater_code:'3203110', category:'multipurpose', river_basin:'etc', operator:'kwater', cities:['보령','서산','홍성','태안'], note:'충남 서해안 지역 식수의 생명선.' },
  buan: { name:'부안댐', full:50, lat:35.7833, lng:126.7333, kwater_code:'3303110', category:'multipurpose', river_basin:'etc', operator:'kwater', cities:['부안','정읍','고창'], note:'전북 서해안 식수 공급.' },
}

// ═══════════════════════════════════════════════════════════════════
// 숫자 파싱 (K-water는 1,000 이상 값에 쉼표)
// ═══════════════════════════════════════════════════════════════════
function num(v) {
  if (v === null || v === undefined || v === '') return 0
  const n = parseFloat(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

// ═══════════════════════════════════════════════════════════════════
// K-water API: 단일 댐 호출
// ⭐ v2.1: 마지막 1개뿐 아니라 시간별 history 배열도 반환 (30시간치)
// ═══════════════════════════════════════════════════════════════════
async function fetchOneDam(damCode) {
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86400000)
  const fmt = d => d.toISOString().slice(0, 10)

  const url = `${KWATER_BASE}/hourlist`
    + `?serviceKey=${KWATER_KEY}`
    + `&damcode=${damCode}`
    + `&stdt=${fmt(yesterday)}`
    + `&eddt=${fmt(today)}`
    + `&numOfRows=30&pageNo=1&_type=json`

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)

    const text = await res.text()
    if (!text || !text.trim().startsWith('{')) return null

    const json = JSON.parse(text)
    if (json?.response?.header?.resultCode !== '00') return null

    const items = json?.response?.body?.items?.item
    if (!items) return null

    const arr = Array.isArray(items) ? items : [items]
    if (!arr.length) return null

    // 시간순 정렬 (오래된 → 최신) — obsrdt 기준
    const sorted = arr.slice().sort((a, b) =>
      String(a.obsrdt || '').localeCompare(String(b.obsrdt || ''))
    )

    // 최신 시간 데이터 (마지막 항목)
    const latest = sorted[sorted.length - 1]

    // ⭐ NEW: 시간별 시계열 history (추세 탭에서 사용)
    const history = sorted.map(item => ({
      time:         String(item.obsrdt || '').trim(),
      level:        num(item.lowlevel),
      volume:       num(item.rsvwtqy),
      storage_rate: num(item.rsvwtrt),
      inflow:       num(item.inflowqy),
      outflow:      num(item.totdcwtrqy),
      rainfall:     num(item.rf),
    }))

    return {
      level:        num(latest.lowlevel),    // 댐수위 (EL.m)
      volume:       num(latest.rsvwtqy),     // 저수량 (백만㎥)
      storage_rate: num(latest.rsvwtrt),     // 저수율 (%)
      inflow:       num(latest.inflowqy),    // 유입량 (㎥/s)
      outflow:      num(latest.totdcwtrqy),  // 총방류량 (㎥/s)
      rainfall:     num(latest.rf),          // 강우량 (mm)
      observed_at:  String(latest.obsrdt || '').trim(),
      history,                                // ⭐ NEW: 30시간 시계열
    }
  } catch (e) {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════
// 모든 K-water 댐 병렬 호출
// ═══════════════════════════════════════════════════════════════════
async function fetchAllKwaterDams() {
  const targets = Object.entries(DAM_META).filter(([_, m]) => m.kwater_code)
  const results = await Promise.allSettled(
    targets.map(async ([id, meta]) => ({ id, data: await fetchOneDam(meta.kwater_code) }))
  )
  const now = new Date().toISOString()
  return results
    .filter(r => r.status === 'fulfilled' && r.value.data)
    .map(r => ({ dam_id: r.value.id, ...r.value.data, updated_at: now }))
}

// ═══════════════════════════════════════════════════════════════════
// Supabase 캐시
// ⭐ v2.1: history_json 컬럼 자동 활용 (있으면 캐시, 없으면 fallback)
// ═══════════════════════════════════════════════════════════════════
async function loadFreshCache(supabase) {
  if (!supabase) return null
  try {
    const since = new Date(Date.now() - 3600000).toISOString()
    const { data } = await supabase.from('dam_realtime').select('*').gte('updated_at', since)
    if (data && data.length >= 30) return data
  } catch (e) {}
  return null
}

async function loadStaleCache(supabase) {
  if (!supabase) return null
  try {
    const { data } = await supabase.from('dam_realtime').select('*')
    if (data && data.length >= 5) return data
  } catch (e) {}
  return null
}

async function saveCache(supabase, rows) {
  if (!supabase || !rows.length) return
  try {
    // ⭐ history는 history_json 컬럼에 JSON 문자열로 저장
    //    (Supabase에 history_json TEXT 컬럼 추가 권장 — 없으면 자동 fallback)
    const cleanRows = rows.map(r => {
      const { history, ...rest } = r
      if (history && history.length > 0) {
        return { ...rest, history_json: JSON.stringify(history) }
      }
      return rest
    })
    await supabase.from('dam_realtime').upsert(cleanRows, { onConflict: 'dam_id' })
  } catch (e) {
    // history_json 컬럼이 없을 경우 fallback: history 제외하고 저장
    try {
      const fallbackRows = rows.map(({ history, ...rest }) => rest)
      await supabase.from('dam_realtime').upsert(fallbackRows, { onConflict: 'dam_id' })
    } catch (e2) {}
  }
}

// ═══════════════════════════════════════════════════════════════════
// 응답 빌더: 메타정보 + 실시간 데이터 + history 결합
// ═══════════════════════════════════════════════════════════════════
function buildResponse(realtimeData, source) {
  const rtMap = new Map((realtimeData || []).map(r => [r.dam_id, r]))

  const dams = Object.entries(DAM_META).map(([id, meta]) => {
    const rt = rtMap.get(id)
    const isLive = !!rt && !meta.is_static
    const isStatic = !!meta.is_static

    const cat = CATEGORIES[meta.category] || {}
    const basin = RIVER_BASINS[meta.river_basin] || {}
    const op = OPERATORS[meta.operator] || {}

    // ⭐ v2.1: history 결합 (K-water 직접 우선, Supabase 캐시는 history_json 파싱)
    let history = []
    if (Array.isArray(rt?.history) && rt.history.length > 0) {
      history = rt.history
    } else if (rt?.history_json) {
      try {
        const parsed = JSON.parse(rt.history_json)
        if (Array.isArray(parsed)) history = parsed
      } catch (e) {}
    }

    return {
      dam_id: id, name: meta.name,
      lat: meta.lat, lng: meta.lng, full: meta.full,
      category: meta.category, category_label: cat.name,
      category_icon: cat.icon, category_color: cat.color,
      river_basin: meta.river_basin, river_label: basin.name, river_color: basin.color,
      operator: meta.operator, operator_label: op.name,
      cities: meta.cities || [], note: meta.note || '',
      level:        rt?.level        || 0,
      volume:       rt?.volume       || 0,
      storage_rate: rt?.storage_rate || 0,
      inflow:       rt?.inflow       || 0,
      outflow:      rt?.outflow      || 0,
      rainfall:     rt?.rainfall     || 0,
      observed_at:  rt?.observed_at  || '',
      history,                            // ⭐ NEW: 30시간 시계열
      is_live: isLive, is_static: isStatic, is_mock: false,
      data_source: isStatic
        ? `정적 정보 · ${op.short || meta.operator} 관리`
        : isLive ? 'K-water 실시간' : 'K-water (데이터 미수신)',
    }
  })

  return {
    dams, categories: CATEGORIES, river_basins: RIVER_BASINS, operators: OPERATORS,
    source, count: dams.length,
    live_count:    dams.filter(d => d.is_live).length,
    static_count:  dams.filter(d => d.is_static).length,
    history_count: dams.filter(d => d.history && d.history.length > 0).length,  // ⭐ NEW
    updated: new Date().toISOString(),
    total_storage:  dams.reduce((s, d) => s + (d.volume || 0), 0),
    total_capacity: dams.reduce((s, d) => s + (d.full   || 0), 0),
  }
}

// ═══════════════════════════════════════════════════════════════════
// 메인 핸들러
// ═══════════════════════════════════════════════════════════════════
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800')

  const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null

  let realtimeData = null
  let source = 'unknown'

  realtimeData = await loadFreshCache(supabase)
  if (realtimeData) source = 'supabase_cache_1h'

  if (!realtimeData) {
    try {
      const fresh = await fetchAllKwaterDams()
      if (fresh.length >= 10) {
        realtimeData = fresh
        source = 'kwater_live'
        saveCache(supabase, fresh).catch(() => {})
      }
    } catch (e) {}
  }

  if (!realtimeData) {
    realtimeData = await loadStaleCache(supabase)
    if (realtimeData) source = 'supabase_cache_stale'
  }

  if (!realtimeData) {
    realtimeData = []
    source = 'meta_only'
  }

  return res.status(200).json(buildResponse(realtimeData, source))
}
