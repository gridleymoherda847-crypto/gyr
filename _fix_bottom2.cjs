const fs = require('fs');

// === Fix main.tsx ===
let main = fs.readFileSync('src/main.tsx', 'utf8');

const oldUpdate = `  const update = () => {
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
        document.body.style.height = \`\${window.innerHeight}px\`
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
  console.log('main.tsx: use window.innerHeight when keyboard closed');
} else {
  console.log('ERROR: could not find update() block');
  process.exit(1);
}

fs.writeFileSync('src/main.tsx', main, 'utf8');
console.log('main.tsx saved');

// === Fix index.css: use wallpaper bg on html as safety net ===
let css = fs.readFileSync('src/index.css', 'utf8');

// Update html.ios-safe-area to use wallpaper variable as background
css = css.replace(
  `html.ios-safe-area {
  position: fixed !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
  background: #000;
}`,
  `html.ios-safe-area {
  position: fixed !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
  background: var(--safe-area-bg, #000) !important;
  background-size: cover !important;
  background-position: center !important;
}`
);
console.log('index.css: html.ios-safe-area uses wallpaper bg');

// Same for PWA
css = css.replace(
  `html.ios-pwa {
  position: fixed !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
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
  background: var(--safe-area-bg, #000) !important;
  background-size: cover !important;
  background-position: center !important;
}`
);
console.log('index.css: html.ios-pwa uses wallpaper bg');

fs.writeFileSync('src/index.css', css, 'utf8');
console.log('index.css saved');
console.log('All done!');
