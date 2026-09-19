// Supabase Edge Function: submit-comment
//
// Two calls, one screening path:
//
//   POST { authorName, body, matchId?, storyId? }   — public. Stores the
//        comment as `pending` first (so nothing is ever lost), screens it with
//        TypeSafe, records the assessment, then applies the policy's action.
//        Replies { id, status: 'approved' | 'pending' }. A rejection is
//        reported as 'pending' on purpose: a spammer learns nothing.
//
//   POST { commentId }                              — content staff only.
//        Re-screens an existing comment (for example one submitted while the
//        function was down) and applies the action if it is still pending.
//
// The TypeSafe key never leaves this function. If TypeSafe is unreachable the
// comment simply stays pending for a moderator — the same outcome as before
// screening existed.
//
// Secrets: TYPESAFE_API_KEY (required), COMMENT_SCREENING_POLICY
// ('balanced' | 'strict', default 'balanced'). SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  buildScreeningRequest,
  parseScreeningResponse,
  POLICIES,
  resolvePolicyName,
  routeScreening,
  TYPESAFE_ENDPOINT,
  TYPESAFE_MODEL,
  type CommentForScreening,
} from './screening.ts'

type CommentStatus = 'pending' | 'approved' | 'rejected'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MODERATOR_ROLES = ['super_admin', 'admin', 'editor']

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function optionalId(value: unknown): number | null {
  if (value == null) return null
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

async function askTypeSafe(apiKey: string, comment: CommentForScreening): Promise<unknown> {
  const request = JSON.stringify(buildScreeningRequest(comment))
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(TYPESAFE_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: request,
      signal: AbortSignal.timeout(10_000),
    })
    // 429 rate limit / 529 overloaded: back off once, then give up and leave
    // the comment for a human rather than keep the visitor waiting.
    if ((response.status === 429 || response.status === 529) && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 800))
      continue
    }
    if (!response.ok) {
      throw new Error(`TypeSafe ${response.status}: ${(await response.text()).slice(0, 300)}`)
    }
    return await response.json()
  }
  throw new Error('TypeSafe is busy')
}

/** Screens one stored comment and applies the result. Returns the comment's
 *  status afterwards. Never throws: a screening failure leaves it pending. */
async function screenComment(
  admin: SupabaseClient,
  commentId: number,
  comment: CommentForScreening,
): Promise<CommentStatus> {
  const apiKey = Deno.env.get('TYPESAFE_API_KEY')
  if (!apiKey) {
    console.error('TYPESAFE_API_KEY is not set; comment left for manual review')
    return 'pending'
  }

  try {
    const policyName = resolvePolicyName(Deno.env.get('COMMENT_SCREENING_POLICY'))
    const raw = await askTypeSafe(apiKey, comment)
    const assessment = parseScreeningResponse(raw)
    const decision = routeScreening(assessment, POLICIES[policyName])

    const { error: saveError } = await admin.from('comment_screenings').upsert({
      comment_id: commentId,
      model: (raw as { model?: string }).model ?? TYPESAFE_MODEL,
      policy: policyName,
      action: decision.action,
      reasons: decision.reasons,
      hazards: assessment.hazards,
      severity: assessment.severity,
      screened_at: new Date().toISOString(),
    })
    if (saveError) throw saveError

    if (decision.action !== 'review') {
      // Only move a comment no moderator has decided on yet.
      const { error } = await admin
        .from('comments')
        .update({ status: decision.action === 'approve' ? 'approved' : 'rejected' })
        .eq('id', commentId)
        .eq('status', 'pending')
      if (error) throw error
    }
  } catch (reason) {
    console.error(`Screening failed for comment ${commentId}:`, reason)
  }

  const { data } = await admin.from('comments').select('status').eq('id', commentId).maybeSingle()
  return (data?.status as CommentStatus | undefined) ?? 'pending'
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: 'Function is not configured' }, 500)
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }

  /* ---- Staff re-screen ------------------------------------------------ */
  if (payload.commentId != null) {
    const commentId = optionalId(payload.commentId)
    if (!commentId) return json({ error: 'Invalid comment id' }, 400)

    // Ask the database, as the caller, whether they may moderate — the same
    // is_staff() check the comments RLS policy uses.
    const caller = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
    })
    const { data: allowed, error: roleError } = await caller.rpc('is_staff', { required_roles: MODERATOR_ROLES })
    if (roleError || allowed !== true) return json({ error: 'Only moderators can re-screen comments.' }, 403)

    const { data: row, error } = await admin
      .from('comments')
      .select('id, author_name, body')
      .eq('id', commentId)
      .maybeSingle()
    if (error) return json({ error: 'Could not load the comment.' }, 500)
    if (!row) return json({ error: 'Comment not found.' }, 404)

    const status = await screenComment(admin, commentId, { authorName: row.author_name, body: row.body })
    return json({ id: commentId, status })
  }

  /* ---- Public submission --------------------------------------------- */
  // Same limits as the table's check constraints and the client form.
  const authorName = typeof payload.authorName === 'string' ? payload.authorName.trim() : ''
  const body = typeof payload.body === 'string' ? payload.body.trim() : ''
  if (authorName.length < 2 || authorName.length > 60) return json({ error: 'Please enter your name.' }, 400)
  if (body.length < 2) return json({ error: 'Please write a comment before sending.' }, 400)
  if (body.length > 2000) return json({ error: 'Comments are limited to 2000 characters.' }, 400)

  // Stored before screening, as pending. The service role bypasses RLS, so
  // this line is what guarantees a new comment is never published unseen.
  const { data: inserted, error: insertError } = await admin
    .from('comments')
    .insert({
      author_name: authorName,
      body,
      match_id: optionalId(payload.matchId),
      story_id: optionalId(payload.storyId),
      status: 'pending',
    })
    .select('id')
    .single()
  if (insertError || !inserted) {
    console.error('Comment insert failed:', insertError)
    return json({ error: 'Your comment could not be saved.' }, 500)
  }

  const status = await screenComment(admin, inserted.id, { authorName, body })
  return json({ id: inserted.id, status: status === 'approved' ? 'approved' : 'pending' })
})
