const fs = require('fs');
const d = fs.readFileSync('src/main.tsx', 'utf8');
const lines = d.split('\n');

// Find the old viewport section (starts at the comment line, ends at the closing })
let startLine = -1;
let endLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('\u89c6\u53e3\u9ad8\u5ea6\u4fee\u590d') && lines[i].startsWith('//')) {
    startLine = i;
  }
  // The block ends with a lone "}" after the iOS gesture prevention
  if (startLine >= 0 && i > startLine + 5 && lines[i].trim() === '}' && lines[i - 1]?.includes('gestureend')) {
    // Actually, the } is a few lines after gestureend. Let me find the block end differently.
  }
}

// Better approach: find the block that starts with "// 视口高度修复" and ends at the next "//" top-level comment or known marker
startLine = -1;
endLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('\u89c6\u53e3\u9ad8\u5ea6\u4fee\u590d') && lines[i].startsWith('//')) {
    startLine = i;
  }
  if (startLine >= 0 && i > startLine && lines[i].startsWith('// =========')) {
    endLine = i;
    break;
  }
}

if (startLine < 0 || endLine < 0) {
  console.log('ERROR: Could not find viewport section. startLine:', startLine, 'endLine:', endLine);
  process.exit(1);
}

console.log('Found viewport section: lines', startLine + 1, 'to', endLine);

const newSection = [
  '// \u89c6\u53e3\u9ad8\u5ea6\u4fee\u590d\uff08\u5168\u65b0\u65b9\u6848\uff1a\u76f4\u63a5\u8bbe\u7f6e body.style.height = visualViewport.height\uff09',
  '// \u4e0d\u518d\u7528 CSS \u53d8\u91cf --app-height\uff0c\u4e0d\u505a\u590d\u6742\u8ba1\u7b97\u3002',
  '// \u952e\u76d8\u5f39\u8d77\u65f6 visualViewport.height \u7f29\u5c0f\uff0cbody \u8ddf\u7740\u7f29\uff0cflex \u5e03\u5c40\u81ea\u52a8\u628a\u8f93\u5165\u680f\u9876\u5230\u952e\u76d8\u4e0a\u6cbf\u3002',
  '{',
  '  const vv = window.visualViewport',
  '  const nonTextTypes = new Set([\'button\', \'checkbox\', \'radio\', \'range\', \'file\', \'color\', \'submit\', \'reset\', \'image\'])',
  '',
  '  const checkTextInputFocused = () => {',
  '    const el = document.activeElement as HTMLElement | null',
  '    if (!el) return false',
  '    if (el.tagName === \'TEXTAREA\') return true',
  '    if (el.tagName === \'INPUT\') return !nonTextTypes.has(((el as HTMLInputElement).type || \'text\').toLowerCase())',
  '    return !!el.isContentEditable',
  '  }',
  '',
  '  const update = () => {',
  '    try {',
  '      const h = vv ? Math.round(vv.height) : window.innerHeight',
  '      // \u6838\u5fc3\uff1a\u76f4\u63a5\u8bbe\u7f6e body \u9ad8\u5ea6\u4e3a\u53ef\u89c6\u533a\u57df\u9ad8\u5ea6\uff0c\u5176\u4ed6\u4ea4\u7ed9 CSS Flex',
  '      document.body.style.height = `${h}px`',
  '',
  '      // \u952e\u76d8\u68c0\u6d4b\uff1a\u9ad8\u5ea6\u5dee OR \u8f93\u5165\u6846\u805a\u7126\u3002\u7528\u4e8e\u6e05\u9664 safe-area padding\u3002',
  '      const textFocused = checkTextInputFocused()',
  '      const kbOpen = (window.innerHeight - h > 80) || textFocused',
  '      document.documentElement.style.setProperty(',
  '        \'--runtime-safe-bottom\',',
  '        kbOpen ? \'0px\' : \'env(safe-area-inset-bottom, 0px)\',',
  '      )',
  '      if (kbOpen) {',
  '        document.documentElement.style.setProperty(\'--runtime-screen-padding-bottom\', \'0px\')',
  '      } else {',
  '        document.documentElement.style.removeProperty(\'--runtime-screen-padding-bottom\')',
  '      }',
  '    } catch {',
  '      // ignore',
  '    }',
  '  }',
  '',
  '  // \u521d\u59cb\u5316',
  '  update()',
  '',
  '  // visualViewport resize \u662f\u552f\u4e00\u9700\u8981\u76d1\u542c\u7684\u4e8b\u4ef6',
  '  try {',
  '    vv?.addEventListener?.(\'resize\', update, { passive: true } as any)',
  '  } catch { /* ignore */ }',
  '',
  '  // \u5146\u5e95\uff1awindow resize + focus \u4e8b\u4ef6',
  '  window.addEventListener(\'resize\', update, { passive: true } as any)',
  '  document.addEventListener(\'focusin\', () => {',
  '    update()',
  '    window.setTimeout(update, 100)',
  '    window.setTimeout(update, 300)',
  '  }, true)',
  '  document.addEventListener(\'focusout\', () => {',
  '    window.setTimeout(update, 80)',
  '    window.setTimeout(update, 300)',
  '  }, true)',
  '',
  '  // iOS\uff1a\u7981\u7528\u53cc\u6307\u7f29\u653e/\u9875\u9762\u624b\u52bf',
  '  if (isIOS) {',
  '    const preventGesture = (e: Event) => {',
  '      // eslint-disable-next-line @typescript-eslint/no-explicit-any',
  '      const ev: any = e as any',
  '      if (typeof ev?.preventDefault === \'function\') ev.preventDefault()',
  '    }',
  '    document.addEventListener(\'gesturestart\', preventGesture as any, { passive: false } as any)',
  '    document.addEventListener(\'gesturechange\', preventGesture as any, { passive: false } as any)',
  '    document.addEventListener(\'gestureend\', preventGesture as any, { passive: false } as any)',
  '  }',
  '}',
  '',
].join('\n');

const before = lines.slice(0, startLine).join('\n');
const after = lines.slice(endLine).join('\n');
const result = before + '\n' + newSection + after;
fs.writeFileSync('src/main.tsx', result, 'utf8');
console.log('Done. main.tsx rewritten.');
