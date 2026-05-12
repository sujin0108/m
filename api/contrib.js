// api/contrib.js — 학생·일반인 참여: 사진·방문기 업로드 및 조회
// v1.0 (2026-05) — DamWatch Korea
//
// 사용:
//   GET  /api/contrib?dam_id=soyang   → 해당 댐의 모든 contribs 목록
//   POST /api/contrib                  → 새 contrib 등록 (사진 또는 코멘트)
//
// Supabase 사전 작업 (정상님 대시보드에서):
//   1. SQL Editor → contribs 테이블 생성 (아래 스키마 참조)
//   2. Storage → 'dam-photos' bucket 생성 (Public)
//   3. RLS 정책 설정

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const PHOTO_BUCKET = 'dam-photos'
const MAX_PHOTO_SIZE = 5 * 1024 * 1024  // 5MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_NOTE_LENGTH = 200
const MAX_NICKNAME_LENGTH = 30

// 간단한 욕설/스팸 필터 (확장 가능)
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  // Supabase 미설정 시 명확한 에러
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({
      error: 'Supabase 환경변수 미설정 — Vercel 설정에서 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 확인'
    })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // ═══════════════════════════════════════════════════════
  // GET: 특정 댐의 contrib 목록 조회
  // ═══════════════════════════════════════════════════════
  if (req.method === 'GET') {
    const damId = req.query?.dam_id || req.query?.damId
    if (!damId) {
      return res.status(400).json({ error: 'dam_id 쿼리 파라미터 필수' })
    }

    try {
      const { data, error } = await supabase
        .from('contribs')
        .select('id, dam_id, type, photo_url, note, nickname, created_at')
        .eq('dam_id', damId)
        .eq('is_hidden', false)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) {
        // 테이블이 아직 없으면 빈 배열 반환 (정상님이 SQL 실행 전)
        if (error.code === '42P01' || error.message?.includes('not exist')) {
          return res.status(200).json({
            contribs: [],
            warning: 'contribs 테이블이 아직 없음 — Supabase에서 SQL 실행 필요'
          })
        }
        throw error
      }

      return res.status(200).json({ contribs: data || [] })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ═══════════════════════════════════════════════════════
  // POST: 새 contrib 등록 (사진 또는 코멘트)
  // ═══════════════════════════════════════════════════════
  if (req.method === 'POST') {
    try {
      const body = req.body || {}
      const dam_id = sanitize(body.dam_id, 50)
      const type = body.type === 'photo' ? 'photo' : 'note'
      const note = sanitize(body.note, MAX_NOTE_LENGTH)
      const nickname = sanitize(body.nickname, MAX_NICKNAME_LENGTH) || '익명'

      if (!dam_id) {
        return res.status(400).json({ error: 'dam_id 필수' })
      }

      // 스팸 필터
      if (isSpam(note) || isSpam(nickname)) {
        return res.status(400).json({ error: '부적절한 내용이 감지됨' })
      }

      // 사진/코멘트 둘 다 없으면 거부
      if (type === 'photo' && !body.photo_base64) {
        return res.status(400).json({ error: '사진 파일 필수' })
      }
      if (type === 'note' && !note) {
        return res.status(400).json({ error: '코멘트 필수' })
      }

      let photo_url = null

      // ──────────────────────────────────
      // 사진 업로드 처리 (Supabase Storage)
      // ──────────────────────────────────
      if (type === 'photo' && body.photo_base64) {
        // base64 → buffer
        const matches = String(body.photo_base64).match(/^data:(image\/[a-z]+);base64,(.+)$/)
        if (!matches) {
          return res.status(400).json({ error: '잘못된 사진 형식 (data URL 필요)' })
        }

        const mime = matches[1]
        if (!ALLOWED_MIMES.includes(mime)) {
          return res.status(400).json({ error: 'JPG·PNG·WebP만 허용' })
        }

        const buffer = Buffer.from(matches[2], 'base64')
        if (buffer.length > MAX_PHOTO_SIZE) {
          return res.status(400).json({ error: '사진 크기 5MB 이하만 가능' })
        }

        const ext = mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1]
        const filename = `${dam_id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(filename, buffer, {
            contentType: mime,
            cacheControl: '3600',
          })

        if (uploadError) {
          if (uploadError.message?.includes('not found') || uploadError.statusCode === '404') {
            return res.status(500).json({
              error: 'dam-photos bucket이 아직 없음 — Supabase Storage에서 bucket 생성 필요'
            })
          }
          throw uploadError
        }

        // Public URL 가져오기
        const { data: urlData } = supabase.storage
          .from(PHOTO_BUCKET)
          .getPublicUrl(filename)

        photo_url = urlData.publicUrl
      }

      // ──────────────────────────────────
      // 메타데이터 DB 저장
      // ──────────────────────────────────
      const { data, error } = await supabase
        .from('contribs')
        .insert({
          dam_id,
          type,
          photo_url,
          note,
          nickname,
          is_hidden: false,
        })
        .select()
        .single()

      if (error) {
        if (error.code === '42P01' || error.message?.includes('not exist')) {
          return res.status(500).json({
            error: 'contribs 테이블이 아직 없음 — Supabase SQL Editor에서 테이블 생성 필요'
          })
        }
        throw error
      }

      return res.status(200).json({
        contrib: data,
        message: '✅ 등록 완료'
      })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
