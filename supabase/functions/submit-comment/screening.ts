/* ------------------------------------------------------------------ *
 * Comment screening with TypeSafe (Jev)
 *
 * Pure module: no Deno, no network. The Edge Function imports it to build the
 * request and route the answers; `tests/commentScreening.test.ts` imports it
 * to pin the routing behaviour down.
 *
 * Jev supplies the assessment — one probability per hazard and a severity
 * score — in a single request. What happens next is decided here, in code,
 * by a named policy. Thresholds are starting points: re-check them against
 * real comments (moderator overrides are the labels) before tightening or
 * loosening them. Jev is trained primarily on English; comments in other
 * languages are accepted but less accurate, which is one reason the default
 * policy only auto-approves comments that are clean on every question.
 * ------------------------------------------------------------------ */

export const TYPESAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
export const TYPESAFE_MODEL = 'jev-latest'

export type Hazard = 'spam' | 'abuse' | 'hate' | 'personal_info' | 'off_topic'
export type ScreeningAction = 'approve' | 'review' | 'reject'

type NoulQuestion = {
  type: 'noul'
  instructions: string
  criteria: { true: string; false: string }
}

type ScoreQuestion = {
  type: 'score'
  instructions: string
  criteria: string[]
}

export const HAZARD_QUESTIONS: Record<Hazard, NoulQuestion> = {
  spam: {
    type: 'noul',
    instructions:
      'Is this comment spam? Look at both `comment.author_name` and `comment.body`: advertising, ' +
      'promotion of an unrelated product, service, betting site or social channel, a link drop, ' +
      'or meaningless or repeated text.',
    criteria: {
      true: 'It advertises or promotes something, or is junk text rather than a genuine comment.',
      false: 'It is a genuine comment written by a person, whatever its opinion.',
    },
  },
  abuse: {
    type: 'noul',
    instructions:
      'Does `comment.body` (or `comment.author_name`) insult, harass, threaten or demean a specific ' +
      'person or group — for example a player, referee, organiser, team or another fan? Criticising ' +
      'how someone played or refereed, and ordinary good-natured football banter, do not count.',
    criteria: {
      true: 'It contains a personal insult, harassment, a threat, or demeaning language aimed at people.',
      false: 'It contains no personal attack, even if it is critical or passionate.',
    },
  },
  hate: {
    type: 'noul',
    instructions:
      'Does `comment.body` (or `comment.author_name`) attack or demean people because of their ' +
      'nationality, ethnicity, religion, gender, sexual orientation or disability?',
    criteria: {
      true: 'It attacks or stereotypes people for who they are.',
      false: 'It contains nothing hateful toward any group.',
    },
  },
  personal_info: {
    type: 'noul',
    instructions:
      'Does `comment.body` contain private contact or identifying details that should not be published — ' +
      'a phone number, email address, home address or ID number — whether the author\'s own or ' +
      'someone else\'s?',
    criteria: {
      true: 'It includes a phone number, email, home address, ID number or similar private detail.',
      false: 'It includes no private contact or identifying details.',
    },
  },
  off_topic: {
    type: 'noul',
    instructions:
      'The comment was left in the fan feedback section of a football tournament website. Is ' +
      '`comment.body` unrelated to the tournament, its teams, players, matches, organisation, venues ' +
      'or the website itself?',
    criteria: {
      true: 'It has nothing to do with the tournament or the website.',
      false: 'It is about the tournament, football, the teams, the event or the website.',
    },
  },
}

/** Levels 0–3. Answers are probability-weighted, so a score can land between levels. */
export const SEVERITY_QUESTION: ScoreQuestion = {
  type: 'score',
  instructions: 'How harmful would it be to publish `comment.body` on the tournament\'s public website?',
  criteria: [
    'Harmless: friendly, neutral or constructive — praise, questions, feedback or ordinary match discussion.',
    'Heated but acceptable: strong opinions or criticism of a performance, result or decision, with no personal attack.',
    'Offensive: insults, crude language aimed at people, or mockery that would embarrass the tournament if published.',
    'Severe: threats, hate toward a group, sexual content, or exposing someone\'s private information.',
  ],
}

export const HAZARDS = Object.keys(HAZARD_QUESTIONS) as Hazard[]

/** What a hazard does once it clears the policy's `actionAt` threshold. */
export const HAZARD_ACTION: Record<Hazard, Exclude<ScreeningAction, 'approve'>> = {
  spam: 'reject',
  abuse: 'reject',
  hate: 'reject',
  // Often the author's own number left so organisers can reply: legitimate,
  // but still not something to publish. A moderator decides.
  personal_info: 'review',
  // Low harm; a human can decide whether it belongs.
  off_topic: 'review',
}

export type ScreeningPolicy = {
  /** Every hazard below this, and severity below `approveSeverityBelow`, may auto-approve. */
  approveBelow: number
  approveSeverityBelow: number
  /** At or above: flag for a human. */
  reviewAt: number
  /** At or above: apply the hazard's HAZARD_ACTION. */
  actionAt: number
  severityReviewAt: number
  severityRejectAt: number
  /** Off switch for auto-approval; rejections and flags still apply. */
  autoApprove: boolean
}

export const POLICIES = {
  /** Auto-approves only comments that are clean on every question. */
  balanced: {
    approveBelow: 0.15,
    approveSeverityBelow: 0.6,
    reviewAt: 0.35,
    actionAt: 0.85,
    severityReviewAt: 1.5,
    severityRejectAt: 2.5,
    autoApprove: true,
  },
  /** Never publishes without a human; still rejects clear spam and abuse. */
  strict: {
    approveBelow: 0,
    approveSeverityBelow: 0,
    reviewAt: 0.35,
    actionAt: 0.85,
    severityReviewAt: 1.5,
    severityRejectAt: 2.5,
    autoApprove: false,
  },
} satisfies Record<string, ScreeningPolicy>

export type PolicyName = keyof typeof POLICIES
export const DEFAULT_POLICY: PolicyName = 'balanced'

export function resolvePolicyName(value: string | undefined | null): PolicyName {
  return value && Object.hasOwn(POLICIES, value) ? (value as PolicyName) : DEFAULT_POLICY
}

export type CommentForScreening = {
  authorName: string
  body: string
}

export function buildScreeningRequest(comment: CommentForScreening) {
  return {
    model: TYPESAFE_MODEL,
    state: {
      site: 'Fan feedback section of the public website for CCL Cup, a football tournament.',
      comment: { author_name: comment.authorName, body: comment.body },
    },
    questions: { ...HAZARD_QUESTIONS, severity: SEVERITY_QUESTION },
  }
}

export type ScreeningAssessment = {
  hazards: Record<Hazard, number>
  severity: number
}

/** Reads a /v1/systemone response. Throws when an expected answer is missing
 *  or malformed, so a partial response is never routed as if it were clean. */
export function parseScreeningResponse(json: unknown): ScreeningAssessment {
  const answers = (json as { answers?: Record<string, Record<string, unknown> | undefined> } | null)?.answers
  if (!answers) throw new Error('TypeSafe response has no answers')

  const hazards = {} as Record<Hazard, number>
  for (const hazard of HAZARDS) {
    const value = answers[hazard]?.noul
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`TypeSafe response is missing a noul for "${hazard}"`)
    }
    hazards[hazard] = value
  }

  const severity = answers.severity?.score
  if (typeof severity !== 'number' || !Number.isFinite(severity)) {
    throw new Error('TypeSafe response is missing the severity score')
  }
  return { hazards, severity }
}

export type ScreeningDecision = {
  action: ScreeningAction
  /** Hazard ids (plus 'severity' / 'uncertain'), strongest first — shown to moderators. */
  reasons: string[]
}

export function routeScreening(assessment: ScreeningAssessment, policy: ScreeningPolicy): ScreeningDecision {
  const triggered: { action: 'review' | 'reject'; reason: string; weight: number }[] = []

  for (const hazard of HAZARDS) {
    const probability = assessment.hazards[hazard]
    if (probability >= policy.actionAt) {
      triggered.push({ action: HAZARD_ACTION[hazard], reason: hazard, weight: probability })
    } else if (probability >= policy.reviewAt) {
      triggered.push({ action: 'review', reason: hazard, weight: probability })
    }
  }

  if (assessment.severity >= policy.severityRejectAt) {
    triggered.push({ action: 'reject', reason: 'severity', weight: 1 })
  } else if (assessment.severity >= policy.severityReviewAt) {
    triggered.push({ action: 'review', reason: 'severity', weight: 0.5 })
  }

  if (triggered.length > 0) {
    triggered.sort((a, b) => b.weight - a.weight)
    const action = triggered.some((entry) => entry.action === 'reject') ? 'reject' : 'review'
    return { action, reasons: triggered.map((entry) => entry.reason) }
  }

  const clean =
    policy.autoApprove &&
    HAZARDS.every((hazard) => assessment.hazards[hazard] < policy.approveBelow) &&
    assessment.severity < policy.approveSeverityBelow

  // Nothing fired, but not clearly clean either: the grey zone between
  // `approveBelow` and `reviewAt` goes to a person, not to the public page.
  if (clean) return { action: 'approve', reasons: [] }
  return { action: 'review', reasons: policy.autoApprove ? ['uncertain'] : [] }
}
