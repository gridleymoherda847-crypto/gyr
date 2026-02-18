const fs = require('fs');

// === Fix main.tsx: only set body height when keyboard is open ===
let main = fs.readFileSync('src/main.tsx', 'utf8');

const oldUpdate = `  const update = () => {
    try {
      const h = vv ? Math.round(vv.height) : window.innerHeight
      // 核心：直接设置 body 高度为可视区域高度，其他交给 CSS Flex
      document.body.style.height = \`\${h}px\`
      if (vv) {
        document.body.style.top = \`\${Math.round(vv.offsetTop)}px\`
      }

      // 键盘检测：高度差 OR 输入框聚焦。用于清除 safe-area padding。
      const textFocused = checkTextInputFocused()
      const kbOpen = (window.innerHeight - h > 80) || textFocused
      document.documentElement.style.setProperty(
        '--runtime-safe-bottom',
        kbOpen ? '0px' : 'env(safe-area-inset-bottom, 0px)',
      )
      if (kbOpen) {
        document.documentElement.style.setProperty('--runtime-screen-padding-bottom', '0px')
      } else {
        document.documentElement.style.removeProperty('--runtime-screen-padding-bottom')
      }
    } catch {
      // ignore
    }
  }`;

const newUpdate = `  const update = () => {
    try {
      const h = vv ? Math.round(vv.height) : window.innerHeight
      const textFocused = checkTextInputFocused()
      const kbOpen = (window.innerHeight - h > 80) || textFocused

      if (kbOpen) {
        document.body.style.height = \`\${h}px\`
        if (vv) {
          document.body.style.top = \`\${Math.round(vv.offsetTop)}px\`
        }
      } else {
        document.body.style.removeProperty('height')
        document.body.style.top = '0px'
      }

      document.documentElement.style.setProperty(
        '--runtime-safe-bottom',
        kbOpen ? '0px' : 'env(safe-area-inset-bottom, 0px)',
      )
      if (kbOpen) {
        document.documentElement.style.setProperty('--runtime-screen-padding-bottom', '0px')
      } else {
        document.documentElement.style.removeProperty('--runtime-screen-padding-bottom')
      }
    } catch {
      // ignore
    }
  }`;

if (main.includes(oldUpdate)) {
  main = main.replace(oldUpdate, newUpdate);
  console.log('main.tsx: updated update() - only set height when keyboard open');
} else {
  console.log('ERROR: could not find update() in main.tsx');
  console.log('Trying to find the function...');
  const idx = main.indexOf('const update = () => {');
  if (idx >= 0) {
    console.log('Found at index', idx);
    console.log('Context:', main.substring(idx, idx + 200));
  }
  process.exit(1);
}

fs.writeFileSync('src/main.tsx', main, 'utf8');
console.log('main.tsx saved');

// === Fix index.css: add bottom:0 to iOS rules ===
let css = fs.readFileSync('src/index.css', 'utf8');

// Add bottom: 0 to html.ios-safe-area
css = css.replace(
  `html.ios-safe-area {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  width: 100% !important;
  overflow: hidden !important;
  background: #000;
}`,
  `html.ios-safe-area {
  position: fixed !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
  background: #000;
}`
);
console.log('index.css: updated html.ios-safe-area with inset:0');

// Add bottom: 0 to html.ios-safe-area body
css = css.replace(
  `html.ios-safe-area body {
  position: fixed !important;
  left: 0 !important;
  right: 0 !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
}`,
  `html.ios-safe-area body {
  position: fixed !important;
  inset: 0 !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
}`
);
console.log('index.css: updated html.ios-safe-area body with inset:0');

// Same for PWA html
css = css.replace(
  `html.ios-pwa {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  width: 100% !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
  touch-action: manipulation !important;
  background: #000 !important;
}`,
  `html.ios-pwa {
  position: fixed !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
  touch-action: manipulation !important;
  background: #000 !important;
}`
);
console.log('index.css: updated html.ios-pwa with inset:0');

// Same for PWA body
css = css.replace(
  `html.ios-pwa body {
  position: fixed !important;
  left: 0 !important;
  right: 0 !important;
  width: 100% !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
  touch-action: manipulation !important;
  background: #000 !important;
}`,
  `html.ios-pwa body {
  position: fixed !important;
  inset: 0 !important;
  width: 100% !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
  touch-action: manipulation !important;
  background: #000 !important;
}`
);
console.log('index.css: updated html.ios-pwa body with inset:0');

fs.writeFileSync('src/index.css', css, 'utf8');
console.log('index.css saved');
console.log('All done!');
