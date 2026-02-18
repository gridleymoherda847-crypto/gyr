/**
 * Generate 1000 new redemption codes (MINA-XXXX-XXXX),
 * de-duplicated against existing codes found in:
 * - codes-supabase.sql
 * - codes-feishu.txt
 *
 * Outputs:
 * - codes-feishu-new-1000.txt (one code per line)
 * - codes-supabase-new-1000.sql (INSERT statement)
 */

const fs = require('fs')
const path = require('path')

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // exclude 0 O I 1
const TARGET = 1000

function extractCodes(text) {
  const m = String(text || '').match(/MINA-[A-Z2-9]{4}-[A-Z2-9]{4}/g)
  return m ? m : []
}

function readExistingCodes(filePath) {
  try {
    if (!fs.existsSync(filePath)) return []
    const txt = fs.readFileSync(filePath, 'utf8')
    return extractCodes(txt)
  } catch {
    return []
  }
}

function randChunk(n) {
  let s = ''
  for (let i = 0; i < n; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)]
  return s
}

function genOne() {
  return `MINA-${randChunk(4)}-${randChunk(4)}`
}

function main() {
  const root = path.resolve(__dirname, '..')
  const existing = new Set()

  ;['codes-supabase.sql', 'codes-feishu.txt'].forEach((name) => {
    for (const c of readExistingCodes(path.join(root, name))) existing.add(c)
  })

  const out = new Set()
  while (out.size < TARGET) {
    const c = genOne()
    if (existing.has(c) || out.has(c)) continue
    out.add(c)
  }

  const arr = Array.from(out)
  const feishuPath = path.join(root, 'codes-feishu-new-1000.txt')
  const sqlPath = path.join(root, 'codes-supabase-new-1000.sql')

  fs.writeFileSync(feishuPath, arr.join('\n') + '\n', 'utf8')

  const sql =
    'INSERT INTO redemption_codes (code, is_used) VALUES\n' +
    arr.map((c) => `  ('${c}', false)`).join(',\n') +
    ';\n'
  fs.writeFileSync(sqlPath, sql, 'utf8')

  console.log(
    JSON.stringify(
      {
        existingCount: existing.size,
        generated: arr.length,
        sample: arr.slice(0, 5),
        feishuPath,
        sqlPath,
      },
      null,
      2
    )
  )
}

main()

