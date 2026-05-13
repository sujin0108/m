// api/contrib.js — 학생·일반인 참여 + 관리자 페이지 v1.3 (2026-05)
//
// v1.3 변경:
//   - GET ?admin_pin=XXX → 모든 contribs 반환 (숨김 포함, 모든 댐, 관리자 전용)
//   - PATCH ?id=X&admin_pin=XXX&action=hide|unhide → 숨김/복원 (soft delete)
//   - DELETE는 기존과 동일 (본인 토큰 또는 관리자 PIN)
//
// 환경변수:
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (필수)
//   - ADMIN_PIN (관리자 비밀번호 — 길고 추측 어려운 문자열 권장)
//
// 엔드포인트:
//   GET    /api/contrib?dam_id=soyang             → 공개 목록 (숨김 제외)
//   GET    /api/contrib?admin_pin=XXX             → 관리자: 모든 글 (숨김 포함)
//   POST   /api/contrib                            → 새 글 등록
//   PATCH  /api/contrib?id=N&admin_pin=XXX&action=hide   → 숨김
//   PATCH  /api/contrib?id=N&admin_pin=XXX&action=unhide → 복원
//   DELETE /api/contrib?id=N&token=XXX            → 본인 삭제
//   DELETE /api/contrib?id=N&admin_pin=XXX        → 관리자 삭제

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN_PIN = process.env.ADMIN_PIN || ''

const PHOTO_BUCKET = 'dam-photos'
const MAX_PHOTO_SIZE = 5 * 1024 * 1024
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_NOTE_LENGTH = 200
const MAX_NICKNAME_LENGTH = 30
const SPAM_KEYWORDS = ['spam', '광고', 'viagra', 'casino', '도박']

function sanitize(text, maxLen) {
  if (!text) return ''
  return String(text).trim().slice(0, maxLen)
}
function isSpam(text) {
  if (!text) return false
  const lower = String(text).toLowerCase()
  return SPAM_KEYWORDS.some(kw => lower.includes(kw))
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase 환경변수 미설정' })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // ═══════════════════════════════════════════════════════════
  // GET
  //   - admin_pin 있으면 → 관리자: 모든 글 (숨김 포함)
  //   - dam_id 있으면    → 공개: 그 댐의 표시 가능한 글만
  // ═══════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    const adminPin = sanitize(req.query?.admin_pin, 100)

    // 관리자 모드
    if (adminPin) {
      if (!ADMIN_PIN) return res.status(403).json({ error: 'ADMIN_PIN 환경변수 미설정' })
      if (adminPin !== ADMIN_PIN) return res.status(403).json({ error: '비밀번호가 틀렸어요' })

      try {
        const { data, error } = await supabase
          .from('contribs')
          .select('id, dam_id, type, photo_url, note, nickname, author_token, is_hidden, created_at')
          .order('created_at', { ascending: false })
          .limit(500)
        if (error) throw error
        return res.status(200).json({ contribs: data || [], admin: true })
      } catch (e) {
        return res.status(500).json({ error: e.message })
      }
    }

    // 공개 모드
    const damId = req.query?.dam_id || req.query?.damId
    if (!damId) return res.status(400).json({ error: 'dam_id 필수' })

    try {
      const { data, error } = await supabase
        .from('contribs')
        .select('id, dam_id, type, photo_url, note, nickname, created_at')
        .eq('dam_id', damId)
        .eq('is_hidden', false)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        if (error.code === '42P01') {
          return res.status(200).json({ contribs: [], warning: 'contribs 테이블 없음' })
        }
        throw error
      }
      return res.status(200).json({ contribs: data || [] })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ═══════════════════════════════════════════════════════════
  // POST: 새 글 등록 (닉네임 + 토큰 필수)
  // ═══════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    try {
      const body = req.body || {}
      const dam_id = sanitize(body.dam_id, 50)
      const type = body.type === 'photo' ? 'photo' : 'note'
      const note = sanitize(body.note, MAX_NOTE_LENGTH)
      const nickname = sanitize(body.nickname, MAX_NICKNAME_LENGTH)
      const author_token = sanitize(body.author_token, 100)

      if (!dam_id) return res.status(400).json({ error: 'dam_id 필수' })
      if (!nickname) return res.status(400).json({ error: '닉네임을 입력해 주세요' })
      if (!author_token) return res.status(400).json({ error: 'author_token 누락' })
      if (isSpam(note) || isSpam(nickname)) return res.status(400).json({ error: '부적절한 내용 감지' })
      if (type === 'photo' && !body.photo_base64) return res.status(400).json({ error: '사진 파일 필수' })
      if (type === 'note' && !note) return res.status(400).json({ error: '코멘트 필수' })

      let photo_url = null

      if (type === 'photo' && body.photo_base64) {
        const matches = String(body.photo_base64).match(/^data:(image\/[a-z]+);base64,(.+)$/)
        if (!matches) return res.status(400).json({ error: '잘못된 사진 형식' })

        const mime = matches[1]
        if (!ALLOWED_MIMES.includes(mime)) return res.status(400).json({ error: 'JPG·PNG·WebP만 허용' })

        const buffer = Buffer.from(matches[2], 'base64')
        if (buffer.length > MAX_PHOTO_SIZE) return res.status(400).json({ error: '사진 크기 5MB 이하' })

        const ext = mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1]
        const filename = `${dam_id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(filename, buffer, { contentType: mime, cacheControl: '3600' })

        if (uploadError) {
          if (uploadError.message?.includes('not found')) {
            return res.status(500).json({ error: 'dam-photos bucket 없음' })
          }
          throw uploadError
        }

        const { data: urlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(filename)
        photo_url = urlData.publicUrl
      }

      const { data, error } = await supabase
        .from('contribs')
        .insert({ dam_id, type, photo_url, note, nickname, author_token, is_hidden: false })
        .select('id, dam_id, type, photo_url, note, nickname, created_at')
        .single()

      if (error) {
        if (error.code === '42P01') return res.status(500).json({ error: 'contribs 테이블 없음' })
        if (error.code === '42703') return res.status(500).json({ error: 'author_token 컬럼 없음' })
        throw error
      }

      return res.status(200).json({ contrib: data, message: '✅ 등록 완료' })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PATCH: 관리자 — 숨김/복원 (soft delete)
  // ═══════════════════════════════════════════════════════════
  if (req.method === 'PATCH') {
    try {
      const id = parseInt(req.query?.id, 10)
      const adminPin = sanitize(req.query?.admin_pin, 100)
      const action = sanitize(req.query?.action, 20)

      if (!id) return res.status(400).json({ error: 'id 필수' })
      if (!adminPin) return res.status(400).json({ error: 'admin_pin 필수' })
      if (!ADMIN_PIN) return res.status(403).json({ error: 'ADMIN_PIN 환경변수 미설정' })
      if (adminPin !== ADMIN_PIN) return res.status(403).json({ error: '비밀번호가 틀렸어요' })
      if (!['hide', 'unhide'].includes(action)) {
        return res.status(400).json({ error: "action은 'hide' 또는 'unhide'" })
      }

      const newHidden = (action === 'hide')

      const { data, error } = await supabase
        .from('contribs')
        .update({ is_hidden: newHidden })
        .eq('id', id)
        .select('id, is_hidden')
        .single()

      if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: '존재하지 않는 글' })
        throw error
      }

      return res.status(200).json({
        message: newHidden ? '🙈 숨김 처리됨' : '👁️ 다시 표시됨',
        contrib: data,
      })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ═══════════════════════════════════════════════════════════
  // DELETE: 본인(토큰) 또는 관리자(PIN) 삭제
  // ═══════════════════════════════════════════════════════════
  if (req.method === 'DELETE') {
    try {
      const id = parseInt(req.query?.id, 10)
      const token = sanitize(req.query?.token, 100)
      const adminPin = sanitize(req.query?.admin_pin, 100)

      if (!id) return res.status(400).json({ error: 'id 필수' })
      if (!token && !adminPin) return res.status(400).json({ error: 'token 또는 admin_pin 필수' })

      const { data: contrib, error: fetchErr } = await supabase
        .from('contribs')
        .select('id, author_token, photo_url')
        .eq('id', id)
        .single()

      if (fetchErr) {
        if (fetchErr.code === 'PGRST116') return res.status(404).json({ error: '존재하지 않는 글' })
        throw fetchErr
      }

      const isOwner = token && contrib.author_token && contrib.author_token === token
      const isAdmin = adminPin && ADMIN_PIN && adminPin === ADMIN_PIN

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: '권한 없음' })
      }

      // 사진 파일 삭제 (있는 경우)
      if (contrib.photo_url) {
        const match = contrib.photo_url.match(/dam-photos\/(.+)$/)
        if (match) {
          await supabase.storage.from(PHOTO_BUCKET).remove([match[1]]).catch(() => {})
        }
      }

      const { error: delErr } = await supabase.from('contribs').delete().eq('id', id)
      if (delErr) throw delErr

      return res.status(200).json({
        message: isAdmin ? '✅ 관리자가 삭제했어요' : '✅ 삭제됐어요',
        deletedBy: isAdmin ? 'admin' : 'owner'
      })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
