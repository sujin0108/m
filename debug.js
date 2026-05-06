const KWATER_KEY = '48e9f3d3e090aecd6846658182a05ac05fb3f7bf144a761005e67ade749b4378'

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  try {
    const url = `https://apis.data.go.kr/B500001/dam/sluicePresentCondition/?serviceKey=${KWATER_KEY}&numOfRows=100&pageNo=1&_type=json`
    const resp = await fetch(url)
    const json = await resp.json()
    const items = json?.response?.body?.items?.item
    const arr = Array.isArray(items) ? items : [items]
    const names = arr.map(i => i.damNm).sort()
    return res.status(200).json({ count: names.length, names })
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}
