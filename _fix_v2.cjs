const fs = require('fs');

// === Fix 1: main.tsx - Add scroll event listener ===
let main = fs.readFileSync('src/main.tsx', 'utf8');

// Add scroll listener next to resize listener
const oldListener = `vv?.addEventListener?.('resize', update, { passive: true } as any)`;
const newListener = `vv?.addEventListener?.('resize', update, { passive: true } as any)
    vv?.addEventListener?.('scroll', update, { passive: true } as any)`;

if (main.includes("'scroll', update")) {
  console.log('main.tsx: scroll listener already present, skipping');
} else if (main.includes(oldListener)) {
  main = main.replace(oldListener, newListener);
  console.log('main.tsx: added scroll event listener');
} else {
  console.log('ERROR: could not find resize listener in main.tsx');
  process.exit(1);
}

// Also update the comment above the listener
main = main.replace(
  '// visualViewport resize 是唯一需要监听的事件',
  '// visualViewport resize + scroll'
);

fs.writeFileSync('src/main.tsx', main, 'utf8');
console.log('main.tsx updated');

// === Fix 2: index.css - Lock html in browser mode too ===
let css = fs.readFileSync('src/index.css', 'utf8');

const oldSafe = `html.ios-safe-area,
html.ios-safe-area body {
  background: #000;
}`;

const newSafe = `html.ios-safe-area {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  width: 100% !important;
  overflow: hidden !important;
  background: #000;
}
html.ios-safe-area body {
  background: #000;
}`;

if (css.includes(oldSafe)) {
  css = css.replace(oldSafe, newSafe);
  console.log('index.css: added position:fixed to html.ios-safe-area');
} else {
  console.log('WARNING: html.ios-safe-area block not found as expected');
  // Try to check if already fixed
  if (css.includes('html.ios-safe-area {')) {
    console.log('  (looks like it was already split)');
  }
}

fs.writeFileSync('src/index.css', css, 'utf8');
console.log('index.css updated');
console.log('All done!');
