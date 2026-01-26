const fs = require('fs');
let content = fs.readFileSync('src/screens/wechat/ChatScreen.tsx', 'utf8');
const oldText = '- 【重要】你绝对不要在普通聊天里无缘无故报歌名/列歌单/复读歌名。听歌邀请只通过"音乐卡片"流程处理（用户发卡片→点箭头→你决定→弹确认→进入一起听界面）。`';
const newText = `- 若要邀请对方一起听歌，单独一行写：[音乐:歌名:歌手]，例如：[音乐:City of Stars:周深]
  - 只有在聊天氛围合适时才发（比如气氛甜蜜、想哄对方、想分享心情、对方心情不好想安慰等）
  - 不要无缘无故频繁发音乐邀请，每次聊天最多发1次
  - 不要在普通聊天里无缘无故报歌名/列歌单\``;
if (content.includes(oldText)) {
  content = content.replace(oldText, newText);
  fs.writeFileSync('src/screens/wechat/ChatScreen.tsx', content, 'utf8');
  console.log('Modified successfully');
} else {
  console.log('Text not found');
  // Show nearby content for debugging
  const idx = content.indexOf('若要分享你的推特主页');
  if (idx !== -1) {
    console.log('Found nearby text at index:', idx);
    console.log('Content around it:', JSON.stringify(content.substring(idx, idx + 400)));
  }
}
