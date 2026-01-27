/**
 * 兑换码生成脚本
 * 
 * 使用方法：
 * 1. 在命令行运行：node generate-codes.js
 * 2. 复制生成的 SQL 语句
 * 3. 粘贴到 Supabase 的 SQL Editor 执行
 */

// 配置：要生成多少个兑换码
const COUNT = 60

// 生成随机字符串
function randomString(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 去掉容易混淆的 0OI1
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// 生成单个兑换码
function generateCode() {
  return `MINA-${randomString(4)}-${randomString(4)}`
}

// 生成所有兑换码
const codes = []
for (let i = 0; i < COUNT; i++) {
  codes.push(generateCode())
}

// 输出兑换码列表
console.log('========== 生成的兑换码 ==========\n')
codes.forEach((code, index) => {
  console.log(`${(index + 1).toString().padStart(2, '0')}. ${code}`)
})

// 生成 SQL 插入语句
console.log('\n\n========== SQL 插入语句（复制到 Supabase SQL Editor 执行）==========\n')
console.log('INSERT INTO redemption_codes (code, is_used) VALUES')
codes.forEach((code, index) => {
  const isLast = index === codes.length - 1
  console.log(`  ('${code}', false)${isLast ? ';' : ','}`)
})

// 保存到文件
const fs = require('fs')
const timestamp = new Date().toISOString().slice(0, 10)
const filename = `codes-${timestamp}.txt`

let fileContent = `Mina 小手机兑换码\n生成时间: ${new Date().toLocaleString('zh-CN')}\n数量: ${COUNT}\n\n`
fileContent += '========== 兑换码列表 ==========\n\n'
codes.forEach((code, index) => {
  fileContent += `${(index + 1).toString().padStart(2, '0')}. ${code}\n`
})

fs.writeFileSync(filename, fileContent)
console.log(`\n\n✅ 兑换码已保存到文件: ${filename}`)
