// api/contrib.js — 학생·일반인 참여 (v1.1 디버그 강화)
// v1.1: TypeError: fetch failed 진단용 정보 풍부하게 추가

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const PHOTO_BUCKET = 'dam-photos'
const MAX_PHOTO_SIZE = 5 * 1024 * 1024
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_NOTE_LENGTH = 200
const MAX_NICKNAME_LENGTH = 30
const SPAM_KEYWORDS = ['spam', '광고', 'viagra', 'casino']

function sanitize(text, maxLen) {
  if (!text) return ''
  return String(text).trim().slice(0, maxLen)
}
function isSpam(text) {
  if (!text) return false
  const lower = String(text).toLowerCase()
  return SPAM_KEYWORDS.some(kw => lower.includes(kw))
}

// ⭐ v1.1 진단 정보 (민감 정보 미노출)
function getDebugInfo(extra = {}) {
  return {
    hasUrl: !!SUPABASE_URL,
    urlPrefix: SUPABASE_URL ? SUPABASE_URL.substring(0, 40) + '...' : null,
    urlEndsWithSlash: SUPABASE_URL ? SUPABASE_URL.endsWith('/') : null,
    hasKey: !!SUPABASE_KEY,
    keyLength: SUPABASE_KEY ? SUPABASE_KEY.length : 0,
    keyStartsWithEyJ: SUPABASE_KEY ? SUPABASE_KEY.startsWith('eyJ') : false,
    nodeVersion: process.version,
    ...extra,
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({
      error: 'Supabase 환경변수 미설정',
      debug: getDebugInfo(),
    })
  }

  let supabase
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  } catch (e) {
    return res.status(500).json({
      error: 'Supabase 클라이언트 생성 실패: ' + e.message,
      debug: getDebugInfo(),
    })
  }

  // ───── GET: 댐별 contribs 조회 ─────
  if (req.method === 'GET') {
    const damId = req.query?.dam_id || req.query?.damId
    if (!damId) return res.status(400).json({ error: 'dam_id 필수' })

    try {
      const { data, error } = await supabase
        .from('contribs')
        .select('id, dam_id, type, photo_url, note, nickname, created_at')
        .eq('dam_id', damId)
        .eq('is_hidden', false)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) {
        if (error.code === '42P01' || error.message?.includes('not exist')) {
          return res.status(200).json({ contribs: [], warning: 'contribs 테이블 없음' })
        }
        throw error
      }
      return res.status(200).json({ contribs: data || [] })
    } catch (e) {
      return res.status(500).json({
        error: e.message,
        error_type: e.constructor.name,
        error_cause: e.cause?.message || null,
        error_code: e.code || null,
        debug: getDebugInfo({ method: 'GET', damId }),
      })
    }
  }

  // ───── POST: 새 contrib 등록 ─────
  if (req.method === 'POST') {
    try {
      const body = req.body || {}
      const dam_id = sanitize(body.dam_id, 50)
      const type = body.type === 'photo' ? 'photo' : 'note'
      const note = sanitize(body.note, MAX_NOTE_LENGTH)
      const nickname = sanitize(body.nickname, MAX_NICKNAME_LENGTH) || '익명'

      if (!dam_id) return res.status(400).json({ error: 'dam_id 필수' })
      if (isSpam(note) || isSpam(nickname)) return res.status(400).json({ error: '부적절한 내용 감지' })
      if (type === 'photo' && !body.photo_base64) return res.status(400).json({ error: '사진 필수' })
      if (type === 'note' && !note) return res.status(400).json({ error: '코멘트 필수' })

      let photo_url = null

      if (type === 'photo' && body.photo_base64) {
        const matches = String(body.photo_base64).match(/^data:(image\/[a-z]+);base64,(.+)$/)
        if (!matches) return res.status(400).json({ error: '잘못된 사진 형식' })

        const mime = matches[1]
        if (!ALLOWED_MIMES.includes(mime)) return res.status(400).json({ error: 'JPG·PNG·WebP만' })

        const buffer = Buffer.from(matches[2], 'base64')
        if (buffer.length > MAX_PHOTO_SIZE) return res.status(400).json({ error: '5MB 이하만' })

        const ext = mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1]
        const filename = `${dam_id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(filename, buffer, { contentType: mime, cacheControl: '3600' })

        if (uploadError) {
          if (uploadError.message?.includes('not found') || uploadError.statusCode === '404') {
            return res.status(500).json({
              error: 'dam-photos bucket 없음',
              debug: getDebugInfo({ uploadError: uploadError.message }),
            })
          }
          throw uploadError
        }

        const { data: urlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(filename)
        photo_url = urlData.publicUrl
      }

      const { data, error } = await supabase
        .from('contribs')
        .insert({ dam_id, type, photo_url, note, nickname, is_hidden: false })
        .select()
        .single()

      if (error) {
        if (error.code === '42P01' || error.message?.includes('not exist')) {
          return res.status(500).json({ error: 'contribs 테이블 없음', debug: getDebugInfo() })
        }
        throw error
      }

      return res.status(200).json({ contrib: data, message: '✅ 등록 완료' })
    } catch (e) {
      return res.status(500).json({
        error: e.message,
        error_type: e.constructor.name,
        error_cause: e.cause?.message || null,
        error_code: e.code || null,
        debug: getDebugInfo({ method: 'POST' }),
      })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
