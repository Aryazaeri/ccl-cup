import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import messages from '../src/i18n/admin.tr.json'
import { translateAdmin, readAdminLanguage } from '../src/i18n/adminLanguage'
import { publicationDate } from '../src/lib/publication'

const tr = (source: string, values = {}) => translateAdmin('tr', source, values, messages)
assert.equal(tr('Teams'), 'Takımlar')
assert.equal(tr('  Save Changes '), '  Değişiklikleri kaydet ')
assert.equal(tr('s'), '')
assert.equal(tr('Unrecognised provider error'), 'Unrecognised provider error')
assert.equal(tr('constructor'), 'constructor')
assert.equal(tr('__proto__'), '__proto__')
assert.equal(translateAdmin('en', 'Delete {name}?', { name: 'İçerik & Takımlar' }, messages), 'Delete İçerik & Takımlar?')
assert.equal(tr('Delete {name}?', { name: 'Teams <script>' }), 'Teams <script> silinsin mi?')
assert.equal(tr('{count} comments awaiting review.', { count: 3 }), '3 yorum incelenmeyi bekliyor.')
assert.equal(tr('Role for {value0}', { value0: 'Şule Işık' }), 'Şule Işık rolü')
assert.equal(readAdminLanguage(), 'en', 'blocked or unavailable browser storage keeps the English default')
assert.equal(publicationDate('2026-10-28T12:00:00Z', 'tr-TR'), '28 Eki 2026')

const files = fs.readdirSync('src/components').filter((name) => name.endsWith('.tsx') && !['PublicSite.tsx', 'MatchBroadcast.tsx', 'Brand.tsx', 'TeamMark.tsx', 'AdminLanguageSwitch.tsx'].includes(name))
const missing = new Set<string>()
let calls = 0
for (const file of files) {
  const ast = ts.createSourceFile(file, fs.readFileSync(`src/components/${file}`, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const walk = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'tr' && node.arguments.length && ts.isStringLiteral(node.arguments[0])) {
      const source = node.arguments[0].text.trim()
      calls++
      if (!Object.hasOwn(messages, source)) missing.add(source)
    }
    if (ts.isJsxAttribute(node) && ['value', 'name', 'className', 'href'].includes(node.name.getText(ast))) {
      const text = node.initializer?.getText(ast) ?? ''
      assert.ok(!/\btr\(/.test(text), `${file}: localization must not change stored values, CSS identities or URLs: ${text}`)
    }
    ts.forEachChild(node, walk)
  }
  walk(ast)
}
assert.deepEqual([...missing], [], 'Every static admin translation call must have a Turkish message')
console.log(`Admin English/Turkish interpolation, content preservation, date locale and ${calls} translation calls passed`)
