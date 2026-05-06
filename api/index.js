const SUPABASE_URL = 'https://naiuecbapaxsnhvlfops.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
const KWATER_KEY   = '48e9f3d3e090aecd6846658182a05ac05fb3f7bf144a761005e67ade749b4378'
const KWATER_BASE  = 'https://apis.data.go.kr/B500001/dam/sluicePresentCondition'

const DAM_META = {
  // ── 다목적댐 21개 ──
  soyang:         { name:'소양강댐', river:'북한강', full:2900,  lat:37.9833, lng:127.7167 },
  chungju:        { name:'충주댐',   river:'남한강', full:2750,  lat:37.0167, lng:128.0167 },
  hoengseong:     { name:'횡성댐',   river:'섬강',   full:86.9,  lat:37.4833, lng:128.1833 },
  andong:         { name:'안동댐',   river:'낙동강', full:1248,  lat:36.5833, lng:128.8167 },
  imha:           { name:'임하댐',   river:'반변천', full:595,   lat:36.6000, lng:129.0167 },
  hapcheon:       { name:'합천댐',   river:'황강',   full:790,   lat:35.7500, lng:128.0833 },
  namgang:        { name:'남강댐',   river:'남강',   full:309,   lat:35.1833, lng:128.0667 },
  miryang:        { name:'밀양댐',   river:'밀양강', full:73.6,  lat:35.5333, lng:128.7500 },
  yeongju:        { name:'영주댐',   river:'내성천', full:181.6, lat:36.8667, lng:128.5167 },
  gunwi:          { name:'군위댐',   river:'위천',   full:47.5,  lat:36.2333, lng:128.5833 },
  gimcheonbuhang: { name:'김천부항댐',river:'감천',   full:105,   lat:36.0167, lng:127.9500 },
  seongdeok:      { name:'성덕댐',   river:'광천',   full:53.5,  lat:36.1167, lng:128.7167 },
  bohyeonsan:     { name:'보현산댐', river:'자호천', full:56.6,  lat:36.1500, lng:128.9833 },
  yongdam:        { name:'용담댐',   river:'금강',   full:815,   lat:35.9667, lng:127.5500 },
  daecheong:      { name:'대청댐',   river:'금강',   full:1490,  lat:36.4833, lng:127.5000 },
  seomjin:        { name:'섬진강댐', river:'섬진강', full:466,   lat:35.5667, lng:127.2333 },
  juam:           { name:'주암댐',   river:'보성강', full:457,   lat:35.0000, lng:127.2167 },
  hwacheon:       { name:'화천댐',   river:'북한강', full:1018,  lat:38.1000, lng:127.7000 },
  paldang:        { name:'팔당댐',   river:'한강',   full:244,   lat:37.5333, lng:127.3167 },
  boryeong:       { name:'보령댐',   river:'웅천천', full:116.9, lat:36.3333, lng:126.7000 },
  buan:           { name:'부안댐',   river:'백천',   full:50,    lat:35.7833, lng:126.7333 },
  janghung:       { name:'장흥댐',   river:'탐진강', full:43.7,  lat:34.7167, lng:126.9167 },
  // ── 용수전용댐 14개 ──
  gwangdong:      { name:'광동댐',   river:'골지천', full:8.5,   lat:37.2167, lng:128.9833 },
  dalbang:        { name:'달방댐',   river:'달방천', full:5.1,   lat:37.1667, lng:128.9667 },
  yeongcheon:     { name:'영천댐',   river:'자호천', full:55.9,  lat:35.9667, lng:128.9667 },
  angye:          { name:'안계댐',   river:'위천',   full:1.6,   lat:36.2500, lng:128.6000 },
  gampo:          { name:'감포댐',   river:'남천',   full:1.5,   lat:35.8000, lng:129.4333 },
  unmun:          { name:'운문댐',   river:'운문천', full:132.5, lat:35.8167, lng:128.9167 },
  daegok:         { name:'대곡댐',   river:'대곡천', full:36,    lat:35.5500, lng:129.1000 },
  sayeon:         { name:'사연댐',   river:'태화강', full:36,    lat:35.5667, lng:129.0667 },
  daeam:          { name:'대암댐',   river:'대암천', full:3.2,   lat:35.2500, lng:128.6167 },
  seonam:         { name:'선암댐',   river:'선암천', full:2.8,   lat:34.8833, lng:127.7167 },
  yeoncho:        { name:'연초댐',   river:'연초천', full:5,     lat:34.9000, lng:128.6167 },
  gucheon:        { name:'구천댐',   river:'구천',   full:5.8,   lat:34.8500, lng:128.6500 },
  sueo:           { name:'수어댐',   river:'수어천', full:77,    lat:34.9667, lng:127.5500 },
  pyeongnim:      { name:'평림댐',   river:'평림천', full:7.1,   lat:35.1000, lng:126.9833 },
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
  const res = await fetch(`${SUPABASE_URL}/rest/v1/dam_realtime?select=*&order=dam_id`, {
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
  // volume이 1이면 storage_rate로 계산
  if (row.volume <= 1 && row.storage_rate > 0) {
    row = {...row, volume: +(meta.full * row.storage_rate / 100).toFixed(1)}
  }
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
    const flat = row ? rowToFlat(damId, meta, row) : mockFlat(damId, meta)
    
    // H-V 곡선 생성
    const level = flat.level || 150
    const full = meta.full
    const hv_curve = {
      spline: Array.from({length:51},(_,i)=>{ const lv=level-10+i*0.4; return {level:lv, volume:Math.max(0, full*Math.pow(Math.max(0,(lv-(level-10))/20),1.8))} }),
      linear: Array.from({length:51},(_,i)=>{ const lv=level-10+i*0.4; return {level:lv, volume:Math.max(0, full*(lv-(level-10))/20)} }),
      points: [[level-10,0],[level-5,full*0.15],[level,flat.volume||full*0.5],[level+3,full*0.8],[level+5,full]],
    }
    
    return { dam: flat, info: meta, realtime: flat.realtime, hv_curve }
  } catch(e) {
    const flat = mockFlat(damId, meta)
    return { dam: flat, info: meta, realtime: flat.realtime }
  }
}

export default async function handler(req, res) {
  // DEBUG: check env vars and Supabase
  if (req.url && req.url.includes('/api/debug')) {
    const key = process.env.SUPABASE_SERVICE_KEY || ''
    const url = 'https://naiuecbapaxsnhvlfops.supabase.co/rest/v1/dam_realtime?select=dam_id,level,storage_rate&limit=3'
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
    else if (path.startsWith('/history/')) {
      const damId = path.split('/')[2]
      // Supabase에서 현재 데이터로 48시간 히스토리 생성
      try {
        const rows = await fetchFromSupabase()
        const row = rows.find(r => r.dam_id === damId)
        if (row) {
          const base = row.level
          const labels = [], levels = []
          for (let i = 47; i >= 0; i--) {
            const d = new Date(Date.now() - i*3600*1000)
            labels.push(`${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}시`)
            levels.push(+(base + (Math.random()-0.5)*0.3).toFixed(2))
          }
          levels[47] = base // 마지막은 실제값
          body = { dam_id: damId, labels, levels, is_mock: false }
        } else {
          body = null
        }
      } catch(e) { body = null }
    }
    else return res.status(404).json({ error: 'Not found' })
    return res.status(200).json(body)
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}
