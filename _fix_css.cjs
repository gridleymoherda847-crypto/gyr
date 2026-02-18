const fs = require('fs');
const css = fs.readFileSync('src/index.css', 'utf8');

// Replace the ios-pwa section (lines 46-79)
const oldPwa = `/* iOS PWA \u6a21\u5f0f\uff08\u81ea\u52a8\u68c0\u6d4b\uff09- \u9632\u6b62\u7cfb\u7edf\u72b6\u6001\u680f\u88ab\u89e6\u53d1 */
html.ios-pwa,
html.ios-pwa body {
  /* \u9501\u5b9a\u6574\u4e2a\u9875\u9762\uff0c\u9632\u6b62\u4efb\u4f55\u6eda\u52a8\u89e6\u53d1\u7cfb\u7edf UI */
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100% !important;
  height: var(--app-height, 100%) !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
  -webkit-overflow-scrolling: auto !important;
  /* \u7981\u6b62\u201c\u62d6\u62fd\u6574\u9875/\u50cf\u7535\u8111\u6a21\u5f0f\u4e00\u6837\u80fd\u79fb\u52a8\u201d\uff0c\u540c\u65f6\u4fdd\u7559\u6b63\u5e38\u70b9\u51fb\u4e0e\u5185\u90e8\u6eda\u52a8 */
  touch-action: manipulation !important;
}

html.ios-pwa body {
  /* \u5982\u679c\u4ecd\u7136\u9732\u51fa\u201c\u5e95\u8272\u201d\uff0c\u9ed8\u8ba4\u7528\u9ed1\u8272\uff08\u907f\u514d iOS \u5168\u5c4f/PWA \u4e0b\u51fa\u73b0\u767d\u8fb9\uff09 */
  background: var(--safe-area-bg, #000) !important;
  background-size: cover !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
}

html.ios-pwa #root {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  overflow: hidden !important;
}`;

const newPwa = `/* iOS PWA \u6a21\u5f0f - JS \u4f1a\u76f4\u63a5\u8bbe\u7f6e body.style.height\uff0c\u8fd9\u91cc\u53ea\u505a\u5146\u5e95 */
html.ios-pwa,
html.ios-pwa body {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  width: 100% !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
  touch-action: manipulation !important;
  background: #000 !important;
}

html.ios-pwa #root {
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
}`;

// Replace ios-safe-area section (lines 81-120)
const oldSafe = `/* iOS \u5b89\u5168\u533a\u57df\u9002\u914d\u6a21\u5f0f - \u5f00\u5173\u5f00\u542f\u6216\u81ea\u52a8\u68c0\u6d4b\u5230 iOS PWA */
html.ios-safe-area {
  /* \u786e\u4fdd html \u586b\u6ee1 */
  height: 100%;
  min-height: 100%;
}

html.ios-safe-area,
html.ios-safe-area body {
  /* \u8ba9\u80cc\u666f\u5ef6\u4f38\u5230\u5b89\u5168\u533a\u57df\u5916 */
  background: var(--safe-area-bg, #000);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

html.ios-safe-area body {
  /* iOS PWA \u6a21\u5f0f\uff1a\u56fa\u5b9a\u5b9a\u4f4d\uff0c\u586b\u6ee1\u6574\u4e2a\u5c4f\u5e55 */
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  /* \u4f7f\u7528\u52a8\u6001\u89c6\u53e3\u9ad8\u5ea6 */
  height: var(--app-height, 100%) !important;
  min-height: var(--app-height, 100%) !important;
  max-height: var(--app-height, 100%) !important;
  /* \u7981\u7528\u6eda\u52a8 */
  overflow: hidden !important;
  overscroll-behavior: none !important;
}

html.ios-safe-area #root {
  /* \u786e\u4fdd\u586b\u6ee1\u6574\u4e2a\u89c6\u53e3 */
  height: 100% !important;
  min-height: 100% !important;
  max-height: 100% !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
}`;

const newSafe = `/* iOS \u5b89\u5168\u533a\u57df\u9002\u914d - JS \u76f4\u63a5\u63a7\u5236 body.style.height */
html.ios-safe-area,
html.ios-safe-area body {
  background: #000;
}

html.ios-safe-area body {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
}

html.ios-safe-area #root {
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
}`;

// Replace body section (lines 130-138)
const oldBody = `body {
  min-height: 100vh;
  min-height: 100dvh; /* \u52a8\u6001\u89c6\u53e3\u9ad8\u5ea6\uff0c\u9002\u914d\u79fb\u52a8\u7aef\u5730\u5740\u680f */
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: fixed;
  inset: 0;
}`;

const newBody = `body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}`;

// Replace #root section
const oldRoot = `#root {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  box-sizing: border-box;
}`;

const newRoot = `#root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}`;

let result = css;
const replacements = [
  [oldPwa, newPwa],
  [oldSafe, newSafe],
  [oldBody, newBody],
  [oldRoot, newRoot],
];

for (const [old, nw] of replacements) {
  if (!result.includes(old)) {
    console.log('WARNING: Could not find block to replace. First 80 chars:', JSON.stringify(old.slice(0, 80)));
  } else {
    result = result.replace(old, nw);
  }
}

fs.writeFileSync('src/index.css', result, 'utf8');
console.log('Done. CSS updated.');
