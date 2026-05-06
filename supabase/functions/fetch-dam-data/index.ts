import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const KWATER_KEY   = '48e9f3d3e090aecd6846658182a05ac05fb3f7bf144a761005e67ade749b4378'
const supabase     = createClient(SUPABASE_URL, SUPABASE_KEY)

const DAM_META: Record<string, any> = {
  // ── 다목적댐 21개 ──
  soyang:         { name:'소양강댐', full:2900  },
  chungju:        { name:'충주댐',   full:2750  },
  hoengseong:     { name:'횡성댐',   full:86.9  },
  andong:         { name:'안동댐',   full:1248  },
  imha:           { name:'임하댐',   full:595   },
  hapcheon:       { name:'합천댐',   full:790   },
  namgang:        { name:'남강댐',   full:309   },
  miryang:        { name:'밀양댐',   full:73.6  },
  yeongju:        { name:'영주댐',   full:181.6 },
  gunwi:          { name:'군위댐',   full:47.5  },
  gimcheonbuhang: { name:'김천부항댐',full:105   },
  seongdeok:      { name:'성덕댐',   full:53.5  },
  bohyeonsan:     { name:'보현산댐', full:56.6  },
  yongdam:        { name:'용담댐',   full:815   },
  daecheong:      { name:'대청댐',   full:1490  },
  seomjin:        { name:'섬진강댐', full:466   },
  juam:           { name:'주암댐',   full:457   },
  hwacheon:       { name:'화천댐',   full:1018  },
  paldang:        { name:'팔당댐',   full:244   },
  boryeong:       { name:'보령댐',   full:116.9 },
  buan:           { name:'부안댐',   full:50    },
  janghung:       { name:'장흥댐',   full:43.7  },
  // ── 용수전용댐 14개 ──
  gwangdong:      { name:'광동댐',   full:8.5   },
  dalbang:        { name:'달방댐',   full:5.1   },
  yeongcheon:     { name:'영천댐',   full:55.9  },
  angye:          { name:'안계댐',   full:1.6   },
  gampo:          { name:'감포댐',   full:1.5   },
  unmun:          { name:'운문댐',   full:132.5 },
  daegok:         { name:'대곡댐',   full:36    },
  sayeon:         { name:'사연댐',   full:36    },
  daeam:          { name:'대암댐',   full:3.2   },
  seonam:         { name:'선암댐',   full:2.8   },
  yeoncho:        { name:'연초댐',   full:5     },
  gucheon:        { name:'구천댐',   full:5.8   },
  sueo:           { name:'수어댐',   full:77    },
  pyeongnim:      { name:'평림댐',   full:7.1   },
}

Deno.serve(async () => {
  try {
    const url = `https://apis.data.go.kr/B500001/dam/sluicePresentCondition/?serviceKey=${KWATER_KEY}&numOfRows=100&pageNo=1&_type=json`
    const res  = await fetch(url)
    const json = await res.json()
    const items = json?.response?.body?.items?.item
    if (!items) throw new Error('no items')

    const arr = Array.isArray(items) ? items : [items]
    let saved = 0, skipped = 0

    for (const [id, meta] of Object.entries(DAM_META)) {
      const item = arr.find((i: any) => {
        const nm = (i.damNm || '').replace(/댐$/,'').trim()
        const mn = meta.name.replace(/댐$/,'').trim()
        return nm && (mn.includes(nm) || nm.includes(mn))
      })
      if (!item) { skipped++; continue }

      await supabase.from('dam_realtime').upsert({
        dam_id:       id,
        level:        parseFloat(item.swl   || item.wl      || 0),
        volume:       parseFloat(item.rsv   || item.strgqy  || 0),
        storage_rate: parseFloat(item.rrt   || item.strgrt  || 0),
        inflow:       parseFloat(item.inf   || item.inflw   || 0),
        outflow:      parseFloat(item.tof   || item.totspit || 0),
        updated_at:   new Date().toISOString(),
      }, { onConflict: 'dam_id' })
      saved++
    }

    return new Response(
      JSON.stringify({ ok:true, saved, skipped, total:arr.length }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch(e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status:500 })
  }
})
