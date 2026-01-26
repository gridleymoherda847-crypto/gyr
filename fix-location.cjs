const fs = require('fs');
const path = 'c:/Users/33362/Desktop/LittlePhone/src/screens/wechat/ChatScreen.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. 在parseXProfileCommand后面添加parseLocationCommand定义
const locationFunc = `
        
        // 位置分享指令：[位置:名称:地址:城市]
        const parseLocationCommand = (text: string): { name: string; address: string; city: string } | null => {
          const m = text.match(/\\[(位置|分享位置):([^:\\]]+)(?::([^:\\]]*))?(?::([^\\]]*))?\\]/)
          if (!m) return null
          const name = (m[2] || '').trim()
          if (!name) return null
          return { name, address: (m[3] || '').trim(), city: (m[4] || '').trim() }
        }`;

content = content.replace(
  /(const parseXProfileCommand = \(text: string\) => \{[\s\S]*?return null\n        \})/,
  `$1${locationFunc}`
);

// 2. 在预扫描中也添加parseLocationCommand检查
content = content.replace(
  /(if \(parseXProfileCommand\(t\)\) continue\n)(            stickerCandidates\.push\(i\))/,
  `$1            if (parseLocationCommand(t)) continue\n$2`
);

// 3. 在消息处理中添加locationCmd
content = content.replace(
  /(const xProfileCmd = parseXProfileCommand\(trimmedContent\))\n(\n          safeTimeoutEx)/,
  `$1\n          const locationCmd = parseLocationCommand(trimmedContent)\n$2`
);

// 4. 添加locationCmd处理逻辑
content = content.replace(
  /(safeTimeoutEx\(\(\) => \{\n            if \(transferCmd\) \{)/,
  `safeTimeoutEx(() => {
            if (locationCmd) {
              // AI发位置卡片
              addMessage({
                characterId: character.id,
                content: \`[位置] \${locationCmd.name}\`,
                isUser: false,
                type: 'location',
                locationName: locationCmd.name,
                locationAddress: locationCmd.address || '',
                locationCity: locationCmd.city || '',
                locationCountry: (character as any).country || '',
              })
            } else if (transferCmd) {`
);

fs.writeFileSync(path, content);
console.log('Done - parseLocationCommand added');
