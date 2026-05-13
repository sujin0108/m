// api/contrib.js — 학생·일반인 참여 v1.4 (2026-05)
//
// v1.4 변경:
//   - POST ?action=report → 신고 (report_count +1), 5번 이상 신고 시 자동 숨김
//   - 신고 시 same author_token이면 1번만 카운트 (자기 신고 방지)
//   - admin GET 응답에 report_count 포함
//
// 엔드포인트:
//   GET    /api/contrib?dam_id=soyang             → 공개 (숨김 제외)
//   GET    /api/contrib?admin_pin=XXX             → 관리자: 모든 글
//   POST   /api/contrib                            → 새 글
//   POST   /api/contrib?action=report&id=N         → 신고 (body: author_token)
//   PATCH  /api/contrib?id=N&admin_pin=XXX&action=hide|unhide → 숨김/복원
//   DELETE /api/contrib?id=N&token=XXX             → 본인 삭제
//   DELETE /api/contrib?id=N&admin_pin=XXX         → 관리자 삭제

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN_PIN = process.env.ADMIN_PIN || ''

const PHOTO_BUCKET = 'dam-photos'
const MAX_PHOTO_SIZE = 5 * 1024 * 1024
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_NOTE_LENGTH = 200
const MAX_NICKNAME_LENGTH = 30
const AUTO_HIDE_THRESHOLD = 5  // 신고 5번이면 자동 숨김
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
  // ═══════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    const adminPin = sanitize(req.query?.admin_pin, 100)

    if (adminPin) {
      if (!ADMIN_PIN) return res.status(403).json({ error: 'ADMIN_PIN 환경변수 미설정' })
      if (adminPin !== ADMIN_PIN) return res.status(403).json({ error: '비밀번호가 틀렸어요' })

      try {
        const { data, error } = await supabase
          .from('contribs')
          .select('id, dam_id, type, photo_url, note, nickname, author_token, is_hidden, report_count, created_at')
          .order('report_count', { ascending: false })  // 신고 많은 글 우선
          .order('created_at', { ascending: false })
          .limit(500)
        if (error) {
          if (error.code === '42703') {
            return res.status(500).json({ error: 'report_count 컬럼 없음 — ALTER TABLE 실행 필요' })
          }
          throw error
        }
        return res.status(200).json({ contribs: data || [], admin: true })
      } catch (e) {
        return res.status(500).json({ error: e.message })
      }
    }

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
  // POST: 새 글 등록 OR 신고 (action=report)
  // ═══════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    const action = sanitize(req.query?.action, 20)

    // ──── 신고 처리 ────
    if (action === 'report') {
      try {
        const id = parseInt(req.query?.id, 10)
        const body = req.body || {}
        const reporterToken = sanitize(body.author_token, 100)

        if (!id) return res.status(400).json({ error: 'id 필수' })
        if (!reporterToken) return res.status(400).json({ error: '토큰 필수' })

        // 자기 글 신고 방지
        const { data: contrib, error: fetchErr } = await supabase
          .from('contribs')
          .select('id, author_token, report_count, is_hidden')
          .eq('id', id)
          .single()

        if (fetchErr) {
          if (fetchErr.code === 'PGRST116') return res.status(404).json({ error: '존재하지 않는 글' })
          throw fetchErr
        }

        if (contrib.author_token === reporterToken) {
          return res.status(400).json({ error: '본인 글은 신고할 수 없어요' })
        }

        const newCount = (contrib.report_count || 0) + 1
        const autoHide = newCount >= AUTO_HIDE_THRESHOLD

        const { error: updErr } = await supabase
          .from('contribs')
          .update({
            report_count: newCount,
            is_hidden: contrib.is_hidden || autoHide,
          })
          .eq('id', id)

        if (updErr) throw updErr

        return res.status(200).json({
          message: autoHide
            ? '🚩 신고 접수됨 (자동 숨김 처리)'
            : '🚩 신고가 접수됐어요. 관리자가 검토합니다.',
          report_count: newCount,
          auto_hidden: autoHide,
        })
      } catch (e) {
        return res.status(500).json({ error: e.message })
      }
    }

    // ──── 새 글 등록 ────
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
        .insert({ dam_id, type, photo_url, note, nickname, author_token, is_hidden: false, report_count: 0 })
        .select('id, dam_id, type, photo_url, note, nickname, created_at')
        .single()

      if (error) {
        if (error.code === '42P01') return res.status(500).json({ error: 'contribs 테이블 없음' })
        if (error.code === '42703') return res.status(500).json({ error: 'author_token 또는 report_count 컬럼 없음 — ALTER TABLE 필요' })
        throw error
      }

      return res.status(200).json({ contrib: data, message: '✅ 등록 완료' })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PATCH: 관리자 — 숨김/복원 (+ 신고 카운트 리셋)
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

      const updatePayload = { is_hidden: newHidden }
      // unhide 시 신고 카운트도 리셋 (관리자가 검토 완료한 것이므로)
      if (!newHidden) updatePayload.report_count = 0

      const { data, error } = await supabase
        .from('contribs')
        .update(updatePayload)
        .eq('id', id)
        .select('id, is_hidden, report_count')
        .single()

      if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: '존재하지 않는 글' })
        throw error
      }

      return res.status(200).json({
        message: newHidden ? '🙈 숨김 처리됨' : '👁️ 다시 표시됨 (신고 카운트 초기화)',
        contrib: data,
      })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ═══════════════════════════════════════════════════════════
  // DELETE: 본인 또는 관리자 삭제
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
