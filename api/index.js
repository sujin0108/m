const SUPABASE_URL = 'https://naiuaecbapaxsnhvlfops.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
const KWATER_KEY   = '48e9f3d3e090aecd6846658182a05ac05fb3f7bf144a761005e67ade749b4378'
const KWATER_BASE  = 'https://apis.data.go.kr/B500001/dam/sluicePresentCondition'

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
}

function mockFlat(id, meta) {
  const rate = +(55 + Math.random() * 30).toFixed(1)
  const volume = +(meta.full * rate / 100).toFixed(1)
  const alert = { code:0, label:'정상' }
  const now = new Date()
  const p = n => String(n).padStart(2,'0')
  const time = `${now.getFullYear()}${p(now.getMonth()+1)}${p(now.getDate())}${p(now.getHours())}`
  return { id, ...meta, level:0, volume, storage_rate:rate, inflow:+(Math.random()*50+5).toFixed(1), outflow:+(Math.random()*40+3).toFixed(1), time, is_mock:true, alert, realtime:{level:0,volume,storage_rate:rate,inflow:0,outflow:0,time,is_mock:true} }
}

// 1. Supabase에서 읽기
async function fetchFromSupabase() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/dam_realtime?select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
    signal: AbortSignal.timeout(5000)
  })
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`)
  const rows = await res.json()
  if (!rows || !rows.length) throw new Error('empty')
  return rows
}

// 2. K-water에서 직접 읽고 Supabase에 저장
async function fetchFromKwater() {
  const url = `${KWATER_BASE}/?serviceKey=${KWATER_KEY}&numOfRows=100&pageNo=1&_type=json`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Kwater HTTP ${res.status}`)
  const json = await res.json()
  const items = json?.response?.body?.items?.item
  if (!items) throw new Error('no items')
  const arr = Array.isArray(items) ? items : [items]

  // Supabase에 저장
  const rows = []
  for (const [id, meta] of Object.entries(DAM_META)) {
    const item = arr.find(i => {
      const nm = (i.damNm||'').replace('댐','')
      return nm && meta.name.replace('댐','').includes(nm)
    })
    if (!item) continue
    rows.push({
      dam_id: id,
      level:        parseFloat(item.swl||item.wl||0),
      volume:       parseFloat(item.rsv||item.strgqy||0),
      storage_rate: parseFloat(item.rrt||item.strgrt||0),
      inflow:       parseFloat(item.inf||item.inflw||0),
      outflow:      parseFloat(item.tof||item.totspit||0),
      updated_at:   new Date().toISOString(),
    })
  }
  if (rows.length > 0) {
    await fetch(`${SUPABASE_URL}/rest/v1/dam_realtime`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    })
  }
  return rows
}

function rowToFlat(id, meta, row) {
  const rate = row.storage_rate || 0
  const alert = rate >= 95 ? {code:3,label:'경보'} : rate >= 80 ? {code:2,label:'주의'} : {code:0,label:'정상'}
  const now = new Date()
  const p = n => String(n).padStart(2,'0')
  const time = `${now.getFullYear()}${p(now.getMonth()+1)}${p(now.getDate())}${p(now.getHours())}`
  return { id, ...meta, level:row.level, volume:row.volume, storage_rate:rate, inflow:row.inflow, outflow:row.outflow, time, is_mock:false, alert, realtime:{level:row.level,volume:row.volume,storage_rate:rate,inflow:row.inflow,outflow:row.outflow,time,is_mock:false} }
}

async function handleAll() {
  // 먼저 Supabase 캐시 확인
  try {
    const rows = await fetchFromSupabase()
    const dams = Object.entries(DAM_META).map(([id, meta]) => {
      const row = rows.find(r => r.dam_id === id)
      return row ? rowToFlat(id, meta, row) : mockFlat(id, meta)
    })
    // 백그라운드로 K-water 갱신 시도
    fetchFromKwater().catch(() => {})
    return { dams, updated: new Date().toISOString(), total_storage: dams.reduce((a,d)=>a+d.volume,0), total_capacity: dams.reduce((a,d)=>a+d.full,0) }
  } catch(e) {
    console.log('Supabase empty, trying K-water...')
  }
  // Supabase 비어있으면 K-water 직접
  try {
    const rows = await fetchFromKwater()
    const dams = Object.entries(DAM_META).map(([id, meta]) => {
      const row = rows.find(r => r.dam_id === id)
      return row ? rowToFlat(id, meta, row) : mockFlat(id, meta)
    })
    return { dams, updated: new Date().toISOString(), total_storage: dams.reduce((a,d)=>a+d.volume,0), total_capacity: dams.reduce((a,d)=>a+d.full,0) }
  } catch(e) {
    return { dams: Object.entries(DAM_META).map(([id,meta])=>mockFlat(id,meta)), updated: new Date().toISOString(), total_storage:0, total_capacity:0 }
  }
}

async function handleDam(damId) {
  const meta = DAM_META[damId]
  if (!meta) return null
  try {
    const rows = await fetchFromSupabase()
    const row = rows.find(r => r.dam_id === damId)
    if (!row) return { dam: mockFlat(damId, meta), info: meta, realtime: mockFlat(damId, meta).realtime }
    const flat = rowToFlat(damId, meta, row)
    return { dam: flat, info: meta, realtime: flat.realtime }
  } catch(e) {
    const flat = mockFlat(damId, meta)
    return { dam: flat, info: meta, realtime: flat.realtime }
  }
}

export default async function handler(req, res) {
  // DEBUG: check env vars and Supabase
  if (req.url && req.url.includes('/api/debug')) {
    const key = process.env.SUPABASE_SERVICE_KEY || ''
    const url = 'https://naiuaecbapaxsnhvlfops.supabase.co/rest/v1/dam_realtime?select=dam_id,level,storage_rate&limit=3'
    let sbResult = null
    let sbError = null
    try {
      const r = await fetch(url, { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } })
      sbResult = { status: r.status, data: await r.json() }
    } catch(e) { sbError = e.message }
    return res.status(200).json({
      has_key: !!key,
      key_prefix: key.slice(0,15),
      supabase: sbResult,
      supabase_error: sbError
    })
  }
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')
  const path = (req.url || '/').replace(/^\/api/, '') || '/'

  if (req.method === 'POST' && path === '/reservoir/submit') {
    return res.status(200).json({ ok: true })
  }

  try {
    let body
    if (path === '/all' || path === '/')       body = await handleAll()
    else if (path.startsWith('/dam/'))          body = await handleDam(path.split('/')[2])
    else if (path === '/reservoir/list')        body = { reservoirs: [] }
    else if (path === '/reservoir/stats')       body = { total_registered:0, total_volume_million_ton:0, contributors:0 }
    else if (path.startsWith('/history/'))      body = null
    else return res.status(404).json({ error: 'Not found' })
    return res.status(200).json(body)
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}
