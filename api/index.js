// K-water 공공데이터포털 API (HTTPS, 전세계 접근 가능)
const SERVICE_KEY = '48e9f3d3e090aecd6846658182a05ac05fb3f7bf144a761005e67ade749b4378';
const KWATER_BASE = 'https://apis.data.go.kr/B500001/dam/sluicePresentCondition';

const DAM_INFO = {
  soyang:    { name:'소양강댐', river:'북한강', full:2900,  minL:150, maxL:193, lat:37.9833, lng:127.7167 },
  chungju:   { name:'충주댐',   river:'남한강', full:2750,  minL:115, maxL:145, lat:37.0167, lng:128.0167 },
  daecheong: { name:'대청댐',   river:'금강',   full:1490,  minL:60,  maxL:80,  lat:36.4833, lng:127.5000 },
  andong:    { name:'안동댐',   river:'낙동강', full:1248,  minL:130, maxL:160, lat:36.5833, lng:128.8167 },
  hwacheon:  { name:'화천댐',   river:'북한강', full:1018,  minL:172, maxL:181, lat:38.1000, lng:127.7000 },
  yongdam:   { name:'용담댐',   river:'금강',   full:815,   minL:220, maxL:265, lat:35.9667, lng:127.5500 },
  hapcheon:  { name:'합천댐',   river:'황강',   full:790,   minL:155, maxL:179, lat:35.7500, lng:128.0833 },
  imha:      { name:'임하댐',   river:'반변천', full:595,   minL:148, maxL:172, lat:36.6000, lng:129.0167 },
  seomjin:   { name:'섬진강댐', river:'섬진강', full:466,   minL:190, maxL:207, lat:35.5667, lng:127.2333 },
  juam:      { name:'주암댐',   river:'보성강', full:457,   minL:140, maxL:170, lat:35.0000, lng:127.2167 },
  paldang:   { name:'팔당댐',   river:'한강',   full:244,   minL:22,  maxL:29,  lat:37.5333, lng:127.3167 },
  yeongju:   { name:'영주댐',   river:'내성천', full:181.6, minL:131, maxL:148, lat:36.8667, lng:128.5167 },
  boryeong:  { name:'보령댐',   river:'웅천천', full:116.9, minL:56,  maxL:71,  lat:36.3333, lng:126.7000 },
  miryang:   { name:'밀양댐',   river:'밀양강', full:73.6,  minL:89,  maxL:112, lat:35.5333, lng:128.7500 },
  buan:      { name:'부안댐',   river:'백천',   full:50,    minL:62,  maxL:75,  lat:35.7833, lng:126.7333 },
  janghung:  { name:'장흥댐',   river:'탐진강', full:43.7,  minL:78,  maxL:94,  lat:34.7167, lng:126.9167 },
};

function mockDam(id, info) {
  const rate = 55 + Math.random() * 30;
  const vol  = +(info.full * rate / 100).toFixed(1);
  const level= +(info.minL + (info.maxL - info.minL) * rate / 100).toFixed(2);
  return { id, ...info, realtime: { level, volume: vol, rate: +rate.toFixed(1), inflow: +(Math.random()*50+5).toFixed(1), outflow: +(Math.random()*40+3).toFixed(1), is_mock: true } };
}

function matchDam(item, info) {
  const nm = (item.damNm || item.damname || item.dam_nm || '').replace('댐','');
  const target = info.name.replace('댐','');
  return nm && (nm.includes(target) || target.includes(nm));
}

function parseItem(id, info, item) {
  return {
    id, ...info,
    realtime: {
      level:   parseFloat(item.swl   || item.wl      || item.wlev    || 0),
      volume:  parseFloat(item.rsv   || item.strgqy  || item.strge   || 0),
      rate:    parseFloat(item.rrt   || item.strgrt  || item.rsvcpct || 0),
      inflow:  parseFloat(item.inf   || item.inflw   || item.inflow  || 0),
      outflow: parseFloat(item.tof   || item.totspit || item.outflow || 0),
      is_mock: false,
    }
  };
}

async function fetchAll() {
  const url = `${KWATER_BASE}/?serviceKey=${SERVICE_KEY}&numOfRows=100&pageNo=1&_type=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const items = json?.response?.body?.items?.item;
  if (!items) throw new Error('empty');
  return Array.isArray(items) ? items : [items];
}

async function handleAll() {
  try {
    const items = await fetchAll();
    return Object.entries(DAM_INFO).map(([id, info]) => {
      const item = items.find(i => matchDam(i, info));
      return item ? parseItem(id, info, item) : mockDam(id, info);
    });
  } catch(e) {
    console.error('K-water error:', e.message);
    return Object.entries(DAM_INFO).map(([id, info]) => mockDam(id, info));
  }
}

async function handleDam(damId) {
  const info = DAM_INFO[damId];
  if (!info) return null;
  try {
    const items = await fetchAll();
    const item = items.find(i => matchDam(i, info));
    return item ? parseItem(damId, info, item) : mockDam(damId, info);
  } catch(e) { return mockDam(damId, info); }
}

async function handleHistory(damId) {
  const info = DAM_INFO[damId];
  if (!info) return null;
  try {
    const now = new Date();
    const p = n => String(n).padStart(2,'0');
    const fmt = d => `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}${p(d.getHours())}`;
    const start = new Date(now - 48*3600*1000);
    const url = `${KWATER_BASE}/hourlist?serviceKey=${SERVICE_KEY}&numOfRows=100&pageNo=1&_type=json&startDt=${fmt(start)}&endDt=${fmt(now)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    const arr = json?.response?.body?.items?.item;
    if (!arr) throw new Error('empty');
    const list = (Array.isArray(arr) ? arr : [arr]).filter(i => matchDam(i, info));
    if (!list.length) throw new Error('no data');
    return { dam_id: damId, labels: list.map(r => r.obsrvtnDt || r.ymdh || ''), levels: list.map(r => parseFloat(r.swl || r.wl || 0)), is_mock: false };
  } catch(e) {
    const base = info.minL + (info.maxL - info.minL) * 0.6;
    const labels = [], levels = [];
    for (let i = 47; i >= 0; i--) {
      const d = new Date(Date.now() - i*3600*1000);
      labels.push(`${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}시`);
      levels.push(+(base + Math.sin(i*0.3)*0.4 + (Math.random()-0.5)*0.2).toFixed(2));
    }
    return { dam_id: damId, labels, levels, is_mock: true };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  const path = (req.url || '/').replace(/^\/api/, '') || '/';
  try {
    let body;
    if (path === '/all' || path === '/') body = await handleAll();
    else if (path.startsWith('/dam/'))     body = await handleDam(path.split('/')[2]);
    else if (path.startsWith('/history/')) body = await handleHistory(path.split('/')[2]);
    else return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(body);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
