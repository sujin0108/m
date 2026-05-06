// api/all.js — K-water 직접 호출 + Supabase 캐시
const { createClient } = require('@supabase/supabase-js')

const KWATER_KEY   = '48e9f3d3e090aecd6846658182a05ac05fb3f7bf144a761005e67ade749b4378'
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const DAM_META = {
  soyang:         { name:'소양강댐',  full:2900,   lat:37.9833, lng:127.7167 },
  chungju:        { name:'충주댐',    full:2750,   lat:37.0167, lng:128.0167 },
  hoengseong:     { name:'횡성댐',    full:86.9,   lat:37.4833, lng:128.1833 },
  andong:         { name:'안동댐',    full:1248,   lat:36.5833, lng:128.8167 },
  imha:           { name:'임하댐',    full:595,    lat:36.6000, lng:129.0167 },
  hapcheon:       { name:'합천댐',    full:790,    lat:35.7500, lng:128.0833 },
  namgang:        { name:'남강댐',    full:309,    lat:35.1833, lng:128.0667 },
  miryang:        { name:'밀양댐',    full:73.6,   lat:35.5333, lng:128.7500 },
  yeongju:        { name:'영주댐',    full:181.6,  lat:36.8667, lng:128.5167 },
  gunwi:          { name:'군위댐',    full:47.5,   lat:36.2333, lng:128.5833 },
  gimcheonbuhang: { name:'김천부항댐',full:105,    lat:36.0167, lng:127.9500 },
  seongdeok:      { name:'성덕댐',    full:53.5,   lat:36.1167, lng:128.7167 },
  bohyeonsan:     { name:'보현산댐',  full:56.6,   lat:36.1500, lng:128.9833 },
  yongdam:        { name:'용담댐',    full:815,    lat:35.9667, lng:127.5500 },
  daecheong:      { name:'대청댐',    full:1490,   lat:36.4833, lng:127.5000 },
  seomjin:        { name:'섬진강댐',  full:466,    lat:35.5667, lng:127.2333 },
  juam:           { name:'주암댐',    full:457,    lat:35.0000, lng:127.2167 },
  hwacheon:       { name:'화천댐',    full:1018,   lat:38.1000, lng:127.7000 },
  paldang:        { name:'팔당댐',    full:244,    lat:37.5333, lng:127.3167 },
  boryeong:       { name:'보령댐',    full:116.9,  lat:36.3333, lng:126.7000 },
  buan:           { name:'부안댐',    full:50,     lat:35.7833, lng:126.7333 },
  janghung:       { name:'장흥댐',    full:43.7,   lat:34.7167, lng:126.9167 },
  gwangdong:      { name:'광동댐',    full:8.5,    lat:37.2167, lng:128.9833 },
  dalbang:        { name:'달방댐',    full:5.1,    lat:37.1667, lng:128.9667 },
  yeongcheon:     { name:'영천댐',    full:55.9,   lat:35.9667, lng:128.9667 },
  angye:          { name:'안계댐',    full:1.6,    lat:36.2500, lng:128.6000 },
  gampo:          { name:'감포댐',    full:1.5,    lat:35.8000, lng:129.4333 },
  unmun:          { name:'운문댐',    full:132.5,  lat:35.8167, lng:128.9167 },
  daegok:         { name:'대곡댐',    full:36,     lat:35.5500, lng:129.1000 },
  sayeon:         { name:'사연댐',    full:36,     lat:35.5667, lng:129.0667 },
  daeam:          { name:'대암댐',    full:3.2,    lat:35.2500, lng:128.6167 },
  seonam:         { name:'선암댐',    full:2.8,    lat:34.8833, lng:127.7167 },
  yeoncho:        { name:'연초댐',    full:5,      lat:34.9000, lng:128.6167 },
  gucheon:        { name:'구천댐',    full:5.8,    lat:34.8500, lng:128.6500 },
  sueo:           { name:'수어댐',    full:77,     lat:34.9667, lng:127.5500 },
  pyeongnim:      { name:'평림댐',    full:7.1,    lat:35.1000, lng:126.9833 },
}

function matchId(kwaterName) {
  const nm = kwaterName.replace(/댐$/, '').replace(/다목적$/, '').replace(/\s/g, '').trim()
  for (const [id, meta] of Object.entries(DAM_META)) {
    const mn = meta.name.replace(/댐$/, '').replace(/\s/g, '').trim()
    if (mn === nm || mn.includes(nm) || nm.includes(mn)) return id
  }
  return null
}

function addMeta(rows) {
  return rows.map(r => ({
    ...r,
    name:    DAM_META[r.dam_id]?.name || r.dam_id,
    full:    DAM_META[r.dam_id]?.full || 0,
    lat:     DAM_META[r.dam_id]?.lat  || 0,
    lng:     DAM_META[r.dam_id]?.lng  || 0,
    is_mock: false,
  }))
}

async function fetchKwater() {
  const url = `https://apis.data.go.kr/B500001/dam/sluicePresentCondition/?serviceKey=${KWATER_KEY}&numOfRows=100&pageNo=1&_type=json`
  const res  = await fetch(url)
  const text = await res.text()
  if (!text.startsWith('{') && !text.startsWith('[')) throw new Error('K-water 응답 오류: ' + text.slice(0, 80))
  const json = JSON.parse(text)
  const raw  = json?.response?.body?.items?.item
  if (!raw) throw new Error('K-water 데이터 없음')
  return Array.isArray(raw) ? raw : [raw]
}

async function loadSupabase(supabase, maxAgeHours = 1) {
  if (!supabase) return null
  const since = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString()
  const { data } = await supabase.from('dam_realtime').select('*').gte('updated_at', since)
  return data && data.length >= 10 ? data : null
}

async function saveSupabase(supabase, rows) {
  if (!supabase || !rows.length) return
  await supabase.from('dam_realtime').upsert(rows, { onConflict: 'dam_id' })
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const supabase = (SUPABASE_URL && SUPABASE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_KEY) : null

  // ★ 디버그: ?raw=1 이면 K-water 원본 댐 이름 반환
  if (req.query?.raw === '1') {
    try {
      const items = await fetchKwater()
      return res.status(200).json({ count: items.length, names: items.map(i => i.damNm).sort() })
    } catch(e) {
      return res.status(500).json({ error: e.message })
    }
  }

  let rows   = null
  let source = 'unknown'

  // 1) Supabase 1시간 캐시 확인
  try {
    const cached = await loadSupabase(supabase, 1)
    if (cached) { rows = cached; source = 'supabase_cache_1h' }
  } catch(e) {}

  // 2) K-water 직접 호출
  if (!rows) {
    try {
      const items = await fetchKwater()
      const now   = new Date().toISOString()
      const time  = now.replace(/[-:T]/g, '').slice(0, 10)
      rows = []
      const toSave = []
      for (const [id, meta] of Object.entries(DAM_META)) {
        const item = items.find(i => matchId(i.damNm || '') === id)
        const level        = parseFloat(item?.swl    || item?.wl      || 0)
        const volume       = parseFloat(item?.rsv    || item?.strgqy  || 0)
        const storage_rate = parseFloat(item?.rrt    || item?.strgrt  || 0)
        const inflow       = parseFloat(item?.inf    || item?.inflw   || 0)
        const outflow      = parseFloat(item?.tof    || item?.totspit || 0)
        const row = { dam_id: id, level, volume, storage_rate, inflow, outflow, updated_at: now }
        toSave.push(row)
        rows.push({ ...row, name: meta.name, full: meta.full, lat: meta.lat, lng: meta.lng, time, is_mock: false })
      }
      saveSupabase(supabase, toSave).catch(() => {})
      source = 'kwater_live'
    } catch(e) {
      // 3) K-water 실패 → Supabase 오래된 캐시라도 사용 (최대 24시간)
      try {
        const stale = await loadSupabase(supabase, 24)
        if (stale) { rows = stale; source = 'supabase_cache_stale' }
      } catch(e2) {}

      if (!rows) {
        return res.status(503).json({ error: 'K-water API 호출 실패', detail: e.message })
      }
    }
  }

  if (source !== 'kwater_live') {
    rows = addMeta(rows)
  }

  return res.status(200).json({ dams: rows, source, count: rows.length })
}
