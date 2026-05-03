// ══════════════════════════════════════════════════════════
//  DamWatch — Vercel Serverless Function
//  WAMIS (환경부 수자원정보) API 프록시
// ══════════════════════════════════════════════════════════

const WAMIS = 'http://www.wamis.go.kr:8080/wamis/openapi/wkw';

const DAM_INFO = {
  soyang:    { code:'1001710', name:'소양강댐', river:'북한강', full:2900,  minL:150, maxL:193 },
  chungju:   { code:'3001710', name:'충주댐',   river:'남한강', full:2750,  minL:115, maxL:145 },
  daecheong: { code:'4001710', name:'대청댐',   river:'금강',   full:1490,  minL:60,  maxL:80  },
  andong:    { code:'5001710', name:'안동댐',   river:'낙동강', full:1248,  minL:130, maxL:160 },
  hwacheon:  { code:'1002710', name:'화천댐',   river:'북한강', full:1018,  minL:172, maxL:181 },
  yongdam:   { code:'4002710', name:'용담댐',   river:'금강',   full:815,   minL:220, maxL:265 },
  hapcheon:  { code:'5002710', name:'합천댐',   river:'황강',   full:790,   minL:155, maxL:179 },
  imha:      { code:'5003710', name:'임하댐',   river:'반변천', full:595,   minL:148, maxL:172 },
  seomjin:   { code:'6001710', name:'섬진강댐', river:'섬진강', full:466,   minL:190, maxL:207 },
  juam:      { code:'6002710', name:'주암댐',   river:'보성강', full:457,   minL:140, maxL:170 },
  paldang:   { code:'2001710', name:'팔당댐',   river:'한강',   full:244,   minL:22,  maxL:29  },
  yeongju:   { code:'5004710', name:'영주댐',   river:'내성천', full:181.6, minL:131, maxL:148 },
  boryeong:  { code:'4003710', name:'보령댐',   river:'웅천천', full:116.9, minL:56,  maxL:71  },
  miryang:   { code:'5005710', name:'밀양댐',   river:'밀양강', full:73.6,  minL:89,  maxL:112 },
  buan:      { code:'6003710', name:'부안댐',   river:'백천',   full:50,    minL:62,  maxL:75  },
  janghung:  { code:'6004710', name:'장흥댐',   river:'탐진강', full:43.7,  minL:78,  maxL:94  },
};

function today() {
  return new Date().toISOString().slice(0,10).replace(/-/g,'');
}
function yesterday() {
  const d = new Date(); d.setDate(d.getDate()-1);
  return d.toISOString().slice(0,10).replace(/-/g,'');
}
function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate()-n);
  return d.toISOString().slice(0,10).replace(/-/g,'');
}

async function wamisFetch(url) {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(4000)
  });
  if (!res.ok) throw new Error(`WAMIS HTTP ${res.status}`);
  return res.json();
}

function mockDam(id, info) {
  const rate = 55 + Math.random() * 30;
  const vol  = +(info.full * rate / 100).toFixed(1);
  const level= +(info.minL + (info.maxL - info.minL) * rate / 100).toFixed(2);
  return {
    id, ...info,
    realtime: {
      level, volume: vol, rate: +rate.toFixed(1),
      inflow: +(Math.random()*50+5).toFixed(1),
      outflow: +(Math.random()*40+3).toFixed(1),
      is_mock: true,
    }
  };
}

async function fetchOneDam(id) {
  const info = DAM_INFO[id];
  if (!info) return null;
  try {
    const url = `${WAMIS}/wkwResDailyList.do?damcd=${info.code}&startdt=${yesterday()}&enddt=${today()}&output=json`;
    const json = await wamisFetch(url);
    const rows = json?.list || json?.data || [];
    if (!rows.length) return mockDam(id, info);
    const r = rows[rows.length - 1];
    return {
      id, ...info,
      realtime: {
        level:   parseFloat(r.wl  || r.swl  || 0),
        volume:  parseFloat(r.rsv || r.svo  || 0),
        rate:    parseFloat(r.rrt || r.srt  || 0),
        inflow:  parseFloat(r.inf || r.tinf || 0),
        outflow: parseFloat(r.tof || r.otf  || 0),
        is_mock: false,
      }
    };
  } catch(e) {
    console.error(`WAMIS fetch failed for ${id}:`, e.message);
    return mockDam(id, info);
  }
}

async function handleAll() {
  const ids = Object.keys(DAM_INFO);
  const dams = await Promise.all(ids.map(fetchOneDam));
  return dams.filter(Boolean);
}

async function handleDam(id) {
  return await fetchOneDam(id);
}

async function handleHistory(id) {
  const info = DAM_INFO[id];
  if (!info) return null;
  try {
    const url = `${WAMIS}/wkwResHhList.do?damcd=${info.code}&startdt=${daysAgo(2)}&enddt=${today()}&output=json`;
    const json = await wamisFetch(url);
    const rows = json?.list || json?.data || [];
    if (!rows.length) throw new Error('empty');
    return {
      dam_id: id,
      labels: rows.map(r => r.ymdh || r.ymdhm || ''),
      levels: rows.map(r => parseFloat(r.wl || r.swl || 0)),
      is_mock: false,
    };
  } catch(e) {
    const base = info.minL + (info.maxL - info.minL) * 0.6;
    const labels = [], levels = [];
    for (let i = 47; i >= 0; i--) {
      const d = new Date(); d.setHours(d.getHours() - i);
      labels.push(`${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}시`);
      levels.push(+(base + Math.sin(i*0.3)*0.4 + (Math.random()-0.5)*0.2).toFixed(2));
    }
    return { dam_id: id, labels, levels, is_mock: true };
  }
}

// ── Vercel Handler (Express-style req/res) ──
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // URL에서 경로 추출: /api/all, /api/dam/soyang, /api/history/soyang 등
  const url = req.url || '/';
  const path = url.replace(/^\/api/, '') || '/';

  try {
    let body;

    if (path === '/all' || path === '/') {
      body = await handleAll();
    } else if (path.startsWith('/dam/')) {
      const id = path.split('/')[2];
      body = await handleDam(id);
    } else if (path.startsWith('/history/')) {
      const id = path.split('/')[2];
      body = await handleHistory(id);
    } else {
      return res.status(404).json({ error: 'Not found', path });
    }

    return res.status(200).json(body);

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
