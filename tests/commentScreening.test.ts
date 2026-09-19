import {
  buildScreeningRequest,
  HAZARDS,
  parseScreeningResponse,
  POLICIES,
  resolvePolicyName,
  routeScreening,
  type Hazard,
  type ScreeningAssessment,
} from '../supabase/functions/submit-comment/screening.ts'

let passed = 0
let failed = 0

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    passed += 1
    console.log(`  ok   ${label}`)
  } else {
    failed += 1
    console.log(`  FAIL ${label}\n         expected ${e}\n         actual   ${a}`)
  }
}

function throws(label: string, run: () => unknown) {
  try {
    run()
    failed += 1
    console.log(`  FAIL ${label}\n         expected a throw`)
  } catch {
    passed += 1
    console.log(`  ok   ${label}`)
  }
}

function section(title: string) {
  console.log(`\n${title}`)
}

/** All hazards at `base`, with overrides. */
function assess(overrides: Partial<Record<Hazard, number>> = {}, severity = 0, base = 0.02): ScreeningAssessment {
  const hazards = Object.fromEntries(HAZARDS.map((hazard) => [hazard, base])) as Record<Hazard, number>
  return { hazards: { ...hazards, ...overrides }, severity }
}

const { balanced, strict } = POLICIES

/* ---------------- routing: balanced ---------------- */

section('balanced policy')
check('clean comment is approved', routeScreening(assess(), balanced), { action: 'approve', reasons: [] })
check('clear spam is rejected', routeScreening(assess({ spam: 0.97 }), balanced), {
  action: 'reject',
  reasons: ['spam'],
})
check('clear abuse is rejected', routeScreening(assess({ abuse: 0.9 }), balanced).action, 'reject')
check('borderline abuse goes to review', routeScreening(assess({ abuse: 0.5 }), balanced), {
  action: 'review',
  reasons: ['abuse'],
})
check('personal info is never auto-rejected', routeScreening(assess({ personal_info: 0.99 }), balanced), {
  action: 'review',
  reasons: ['personal_info'],
})
check('off-topic is never auto-rejected', routeScreening(assess({ off_topic: 0.95 }), balanced).action, 'review')
check('grey zone (0.15–0.35) is not auto-approved', routeScreening(assess({ spam: 0.2 }), balanced), {
  action: 'review',
  reasons: ['uncertain'],
})
check('mild severity alone still approves', routeScreening(assess({}, 0.5), balanced).action, 'approve')
check('severity between approve and review cut-offs is held', routeScreening(assess({}, 1.0), balanced).action, 'review')
check('high severity alone goes to review', routeScreening(assess({}, 1.8), balanced), {
  action: 'review',
  reasons: ['severity'],
})
check('severe severity alone rejects', routeScreening(assess({}, 2.7), balanced).action, 'reject')
check('reject outranks review; reasons strongest first', routeScreening(assess({ off_topic: 0.6, hate: 0.92 }), balanced), {
  action: 'reject',
  reasons: ['hate', 'off_topic'],
})
check('threshold is inclusive', routeScreening(assess({ spam: 0.85 }), balanced).action, 'reject')

/* ---------------- routing: strict ---------------- */

section('strict policy')
check('clean comment still waits for a human', routeScreening(assess(), strict), { action: 'review', reasons: [] })
check('clear spam is still rejected', routeScreening(assess({ spam: 0.97 }), strict).action, 'reject')

/* ---------------- policy names ---------------- */

section('resolvePolicyName')
check('known name', resolvePolicyName('strict'), 'strict')
check('unset falls back to balanced', resolvePolicyName(undefined), 'balanced')
check('unknown falls back to balanced', resolvePolicyName('lenient'), 'balanced')
check('prototype keys are not policies', resolvePolicyName('toString'), 'balanced')

/* ---------------- request / response ---------------- */

section('request')
const request = buildScreeningRequest({ authorName: 'Deniz', body: 'Great final!' })
check('uses jev-latest', request.model, 'jev-latest')
check('one question per hazard plus severity', Object.keys(request.questions), [...HAZARDS, 'severity'])
check('comment is named state', request.state.comment, { author_name: 'Deniz', body: 'Great final!' })

section('parseScreeningResponse')
const answers = {
  spam: { type: 'noul', noul: 0.01 },
  abuse: { type: 'noul', noul: 0.02 },
  hate: { type: 'noul', noul: 0.01 },
  personal_info: { type: 'noul', noul: 0.03 },
  off_topic: { type: 'noul', noul: 0.04 },
  severity: { type: 'score', score: 0.2, confidence: 0.9 },
}
check('reads nouls and severity', parseScreeningResponse({ model: 'jev-1.12', answers }), {
  hazards: { spam: 0.01, abuse: 0.02, hate: 0.01, personal_info: 0.03, off_topic: 0.04 },
  severity: 0.2,
})
throws('missing answers throws', () => parseScreeningResponse({}))
throws('missing hazard throws', () => parseScreeningResponse({ answers: { ...answers, hate: undefined } }))
throws('non-numeric noul throws', () => parseScreeningResponse({ answers: { ...answers, spam: { noul: 'low' } } }))
throws('missing severity throws', () => parseScreeningResponse({ answers: { ...answers, severity: {} } }))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
