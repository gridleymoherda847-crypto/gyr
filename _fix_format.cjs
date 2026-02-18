const fs = require('fs');

let code = fs.readFileSync('src/screens/wechat/ChatScreen.tsx', 'utf8');

// ============================================================
// FIX 1: Add response cleaning filters for echoed context markers
// Insert after the existing [拍一拍] filters (line ~1298)
// ============================================================
const patMarker = "t = t.replace(/\\(拍一拍[^)]*\\)/g, '')";
if (!code.includes(patMarker)) {
  console.log('ERROR: could not find pat marker filter line');
  process.exit(1);
}

const newFilters = `t = t.replace(/\\(拍一拍[^)]*\\)/g, '')

          // 过滤 AI 错误回显的转账上下文标记（历史记录里的格式，AI不该输出）
          t = t.replace(/\\[[^\\]]*发起转账给[^\\]]*\\]/g, '')
          t = t.replace(/\\[转账结果[：:][^\\]]*\\]/g, '')
          // 过滤 AI 错误回显的语音消息标记
          t = t.replace(/\\[语音消息\\]/g, '')`;

code = code.replace(patMarker, newFilters);
console.log('FIX 1: Added transfer/voice context echo filters');

// ============================================================
// FIX 2: Make parseStickerMetaLine strip [语音消息] prefix
// ============================================================
const oldStickerParser = `const parseStickerMetaLine = (text: string) => {
          const t = String(text || '').trim()
          if (!t) return null
          if (!/^[【\\[]\\s*表情包/.test(t)) return null`;

const newStickerParser = `const parseStickerMetaLine = (text: string) => {
          let t = String(text || '').trim()
          if (!t) return null
          t = t.replace(/^\\[语音消息\\]\\s*/, '')
          if (!/^[【\\[]\\s*表情包/.test(t)) return null`;

if (code.includes(oldStickerParser)) {
  code = code.replace(oldStickerParser, newStickerParser);
  console.log('FIX 2: Updated parseStickerMetaLine to handle [语音消息] prefix');
} else {
  console.log('WARNING: Could not find exact parseStickerMetaLine signature, trying alternate');
  // Try a more flexible match
  if (code.includes('const parseStickerMetaLine = (text: string)')) {
    // Replace just the const to let
    const old2 = "const t = String(text || '').trim()\n          if (!t) return null\n          if (!/^[【\\[]\\s*表情包/.test(t)) return null";
    const new2 = "let t = String(text || '').trim()\n          if (!t) return null\n          t = t.replace(/^\\[语音消息\\]\\s*/, '')\n          if (!/^[【\\[]\\s*表情包/.test(t)) return null";
    if (code.includes(old2)) {
      code = code.replace(old2, new2);
      console.log('FIX 2 (alt): Updated parseStickerMetaLine');
    } else {
      console.log('ERROR: Could not find parseStickerMetaLine body');
    }
  }
}

// ============================================================
// FIX 3: Strengthen system prompt - add prohibition for context markers
// ============================================================
const oldPromptLine = `  ❌ "[图片]"、"[表情包]"、"[转账]"、"[音乐]"、"[情侣空间]"、"[情侣空间申请]"`;
const newPromptLine = `  ❌ "[图片]"、"[表情包]"、"[转账]"、"[音乐]"、"[情侣空间]"、"[情侣空间申请]"
  ❌ "[语音消息]" — 这是系统标记，你绝对不能输出
  ❌ "[xxx发起转账给xxx：¥xxx，备注xxx，已领取/待领取]" — 这是历史上下文标记，不要模仿/回显
  ❌ "[转账结果：xxx]" — 同上，不要模仿
  ❌ "【表情包】备注=xxx；关键词=xxx" — 你看到的表情包描述是上下文，不要把它当文字输出`;

if (code.includes(oldPromptLine)) {
  code = code.replace(oldPromptLine, newPromptLine);
  console.log('FIX 3: Strengthened system prompt with context marker prohibitions');
} else {
  console.log('WARNING: Could not find prompt line to enhance');
}

fs.writeFileSync('src/screens/wechat/ChatScreen.tsx', code, 'utf8');
console.log('All fixes applied to ChatScreen.tsx');
