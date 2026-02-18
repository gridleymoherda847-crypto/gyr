const fs = require('fs');

// === Fix index.css: change all #000 fallbacks to #fff in iOS rules ===
let css = fs.readFileSync('src/index.css', 'utf8');

// 1. html.ios-pwa body: hardcoded #000 → use var with #fff fallback + cover
css = css.replace(
  /html\.ios-pwa body \{([^}]*?)background:\s*#000\s*!important;/s,
  'html.ios-pwa body {$1background: var(--safe-area-bg, #fff) !important;\n  background-size: cover !important;\n  background-position: center !important;'
);

// 2. All var(--safe-area-bg, #000) → var(--safe-area-bg, #fff)
css = css.replace(/var\(--safe-area-bg,\s*#000\)/g, 'var(--safe-area-bg, #fff)');

fs.writeFileSync('src/index.css', css, 'utf8');
console.log('index.css: changed all #000 fallbacks to #fff');

// === Fix main.tsx: change default --safe-area-bg from #000 to #fff ===
let main = fs.readFileSync('src/main.tsx', 'utf8');
main = main.replace(
  "document.documentElement.style.setProperty('--safe-area-bg', '#000')",
  "document.documentElement.style.setProperty('--safe-area-bg', '#fff')"
);
fs.writeFileSync('src/main.tsx', main, 'utf8');
console.log('main.tsx: changed default --safe-area-bg to #fff');

console.log('Done!');
