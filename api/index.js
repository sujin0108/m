// K-water 공공데이터포털 API
const SERVICE_KEY = '48e9f3d3e090aecd6846658182a05ac05fb3f7bf144a761005e67ade749b4378';
const KWATER_BASE = 'https://apis.data.go.kr/B500001/dam/sluicePresentCondition';

const DAM_META = {
  soyang:    { name:'소양강댐', river:'북한강', full:2900,  lat:37.9833, lng:127.7167 },
  chungju:   { name:'충주댐',   river:'남한강', full:2750,  lat:37.0167, lng:128.0167 },
  daecheong: { name:'대청댐',   river:'금강',   full:1490,  lat:36.4833, lng:127.5000 },
  andong:    { name:'안동댐',   river:'낙동강', full:1248,  lat:36.5833, lng:128.8167 },
  hwacheon:  { name:'화천댐',   river:'북한강', full:1018,  lat:38.1000, lng:127.7000 },
  yongdam:   { name:'용담댐',   river:'금강',   full:815,   lat:35.9667, lng:127.5500 },
  hapcheon:  { name:'합천댐',   river:'황강',   full:790,   lat:35.7500, lng:128.0833 },
  imha:      { name:'임하댐',   river:'반변천', full:595,   lat:36.6000, lng:129.0167 },
  seomjin:   { name:'섬진강댐', river:'섬진강', full:466,   lat:35.5667, lng:127.2333 },
  juam:      { name:'주암댐',   river:'보성강', full:457,   lat:35.0000, lng:127.2167 },
  paldang:   { name:'팔당댐',   river:'한강',   full:244,   lat:37.5333, lng:127.3167 },
  yeongju:   { name:'영주댐',   river:'내성천', full:181.6, lat:36.8667, lng:128.5167 },
  boryeong:  { name:'보령댐',   river:'웅천천', full:116.9, lat:36.3333, lng:126.7000 },
  miryang:   { name:'밀양댐',   river:'밀양강', full:73.6,  lat:35.5333, lng:128.7500 },
  buan:      { name:'부안댐',   river:'백천',   full:50,    lat:35.7833, lng:126.7333 },
  janghung:  { name:'장흥댐',   river:'탐진강', full:43.7,  lat:34.7167, lng:126.9167 },
};

// 프론트엔드가 기대하는 flat 형식으로 변환
function toFlatDam(id, meta, level, volume, rate, inflow, outflow, isMock) {
  const r = parseFloat(rate) || 0;
  const alert = r >= 80 ? { code:2, label:'주의' } : r >= 95 ? { code:3, label:'경보' } : { code:0, label:'정상' };
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  const time = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}`;
  return {
    id, ...meta,
    level:        parseFloat(level)   || 0,
    volume:       parseFloat(volume)  || 0,
    storage_rate: parseFloat(rate)    || 0,
    inflow:       parseFloat(inflow)  || 0,
    outflow:      parseFloat(outflow) || 0,
    time, is_mock: isMock, alert,
    realtime: {
      level: parseFloat(level) || 0,
      volume: parseFloat(volume) || 0,
      storage_rate: parseFloat(rate) || 0,
      inflow: parseFloat(inflow) || 0,
      outflow: parseFloat(outflow) || 0,
      time, is_mock: isMock,
    }
  };
}

function mockFlat(id, meta) {
  const rate = +(55 + Math.random() * 30).toFixed(1);
  const volume = +(meta.full * rate / 100).toFixed(1);
  return toFlatDam(id, meta, 0, volume, rate,
    +(Math.random()*50+5).toFixed(1), +(Math.random()*40+3).toFixed(1), true);
}

function matchName(apiName, metaName) {
  const a = (apiName||'').replace('댐','').trim();
  const b = metaName.replace('댐','').trim();
  return a && b && (a.includes(b) || b.includes(a));
}

async function fetchKwater() {
  const url = `${KWATER_BASE}/?serviceKey=${SERVICE_KEY}&numOfRows=100&pageNo=1&_type=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  // 에러 코드 체크 (한국 공공API는 HTTP 200으로 에러 반환)
  const code = json?.response?.header?.resultCode;
  if (code && code !== '00') throw new Error(`API error: ${code}`);
  const items = json?.response?.body?.items?.item;
  if (!items) throw new Error('no items');
  return Array.isArray(items) ? items : [items];
}

async function handleAll() {
  let items = null;
  try { items = await fetchKwater(); } catch(e) { console.error('K-water:', e.message); }

  const dams = Object.entries(DAM_META).map(([id, meta]) => {
    if (!items) return mockFlat(id, meta);
    const item = items.find(i => matchName(i.damNm || i.damname || '', meta.name));
    if (!item) return mockFlat(id, meta);
    return toFlatDam(id, meta,
      item.swl   || item.wl    || 0,
      item.rsv   || item.strgqy|| 0,
      item.rrt   || item.strgrt|| 0,
      item.inf   || item.inflw || 0,
      item.tof   || item.totspit||0,
      false
    );
  });

  return {
    dams,
    updated: new Date().toISOString(),
    total_storage:  dams.reduce((a,d) => a + d.volume, 0),
    total_capacity: dams.reduce((a,d) => a + d.full, 0),
  };
}

async function handleDam(damId) {
  const meta = DAM_META[damId];
  if (!meta) return null;
  try {
    const items = await fetchKwater();
    const item = items.find(i => matchName(i.damNm || i.damname || '', meta.name));
    if (!item) return mockFlat(damId, meta);
    const flat = toFlatDam(damId, meta,
      item.swl||item.wl||0, item.rsv||item.strgqy||0,
      item.rrt||item.strgrt||0, item.inf||item.inflw||0,
      item.tof||item.totspit||0, false);
    return { dam: flat, info: meta, realtime: flat.realtime };
  } catch(e) {
    const flat = mockFlat(damId, meta);
    return { dam: flat, info: meta, realtime: flat.realtime };
  }
}

async function handleHistory(damId) {
  const meta = DAM_META[damId];
  if (!meta) return null;
  const base = meta.full * 0.6 / meta.full * (meta.full > 100 ? 170 : 80);
  const labels = [], levels = [];
  for (let i = 47; i >= 0; i--) {
    const d = new Date(Date.now() - i*3600*1000);
    labels.push(`${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}시`);
    levels.push(+(base + Math.sin(i*0.3)*0.4 + (Math.random()-0.5)*0.2).toFixed(2));
  }
  return { dam_id: damId, labels, levels, is_mock: true };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  const path = (req.url || '/').replace(/^\/api/, '') || '/';
  try {
    let body;
    if (path === '/all' || path === '/')       body = await handleAll();
    else if (path.startsWith('/dam/'))          body = await handleDam(path.split('/')[2]);
    else if (path.startsWith('/history/'))      body = await handleHistory(path.split('/')[2]);
    else if (path === '/world')                 body = { dams: [] };
    else if (path === '/hv_compare/' + path.split('/')[2]) body = { data: [] };
    else return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(body);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
