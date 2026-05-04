import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const KWATER_KEY = '48e9f3d3e090aecd6846658182a05ac05fb3f7bf144a761005e67ade749b4378'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const DAM_META: Record<string, any> = {
  soyang:    { name:'소양강댐', river:'북한강', full:2900 },
  chungju:   { name:'충주댐',   river:'남한강', full:2750 },
  daecheong: { name:'대청댐',   river:'금강',   full:1490 },
  andong:    { name:'안동댐',   river:'낙동강', full:1248 },
  hwacheon:  { name:'화천댐',   river:'북한강', full:1018 },
  yongdam:   { name:'용담댐',   river:'금강',   full:815  },
  hapcheon:  { name:'합천댐',   river:'황강',   full:790  },
  imha:      { name:'임하댐',   river:'반변천', full:595  },
  seomjin:   { name:'섬진강댐', river:'섬진강', full:466  },
  juam:      { name:'주암댐',   river:'보성강', full:457  },
  paldang:   { name:'팔당댐',   river:'한강',   full:244  },
  yeongju:   { name:'영주댐',   river:'내성천', full:181.6},
  boryeong:  { name:'보령댐',   river:'웅천천', full:116.9},
  miryang:   { name:'밀양댐',   river:'밀양강', full:73.6 },
  buan:      { name:'부안댐',   river:'백천',   full:50   },
  janghung:  { name:'장흥댐',   river:'탐진강', full:43.7 },
}

Deno.serve(async () => {
  try {
    const url = `https://apis.data.go.kr/B500001/dam/sluicePresentCondition/?serviceKey=${KWATER_KEY}&numOfRows=100&pageNo=1&_type=json`
    const res = await fetch(url)
    const json = await res.json()
    const items = json?.response?.body?.items?.item
    if (!items) throw new Error('no items')
    const arr = Array.isArray(items) ? items : [items]

    for (const [id, meta] of Object.entries(DAM_META)) {
      const item = arr.find((i: any) => {
        const nm = (i.damNm || '').replace('댐','')
        return nm && meta.name.replace('댐','').includes(nm)
      })
      if (!item) continue
      await supabase.from('dam_realtime').upsert({
        dam_id:       id,
        level:        parseFloat(item.swl || item.wl || 0),
        volume:       parseFloat(item.rsv || item.strgqy || 0),
        storage_rate: parseFloat(item.rrt || item.strgrt || 0),
        inflow:       parseFloat(item.inf || item.inflw || 0),
        outflow:      parseFloat(item.tof || item.totspit || 0),
        updated_at:   new Date().toISOString(),
      }, { onConflict: 'dam_id' })
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch(e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
})
