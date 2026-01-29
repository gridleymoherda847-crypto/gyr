const fs = require('fs');

const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codes = new Set();

while (codes.size < 1000) {
  let code = 'MINA-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code += '-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  codes.add(code);
}

const arr = [...codes];

// 保存纯文本（给飞书用）
fs.writeFileSync('codes-feishu.txt', arr.join('\n'), 'utf8');

// 保存 SQL（给 Supabase 用）
const sqlLines = arr.map(c => `  ('${c}', false)`);
const sql = `INSERT INTO redemption_codes (code, is_used) VALUES\n${sqlLines.join(',\n')};`;
fs.writeFileSync('codes-supabase.sql', sql, 'utf8');

console.log('已生成两个文件：');
console.log('1. codes-feishu.txt - 直接复制到飞书（每行一个兑换码）');
console.log('2. codes-supabase.sql - 复制到 Supabase SQL Editor');
console.log('\n共 ' + arr.length + ' 个兑换码');
