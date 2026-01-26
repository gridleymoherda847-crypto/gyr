/**
 * 使用手册 - Mina 小手机使用指南
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS } from '../context/OSContext'
import PageContainer from '../components/PageContainer'

// 手册章节类型
type Section = {
  id: string
  title: string
  icon: string
  content: React.ReactNode
}

export default function ManualScreen() {
  const navigate = useNavigate()
  const { fontColor } = useOS()
  const [activeSection, setActiveSection] = useState<string | null>(null)
  
  // 手册章节
  const sections: Section[] = [
    {
      id: 'intro',
      title: '欢迎使用',
      icon: '👋',
      content: (
        <div className="space-y-4">
          <p>欢迎使用 <strong>Mina 小手机</strong>！这是一款 AI 虚拟伴侣应用，你可以创建属于自己的 AI 角色，与 TA 进行沉浸式对话。</p>
          
          <div className="p-4 bg-pink-50 rounded-2xl border border-pink-100">
            <h4 className="font-bold text-pink-700 mb-2">✨ 核心功能</h4>
            <ul className="text-sm text-pink-600 space-y-1">
              <li>• 创建并自定义 AI 角色</li>
              <li>• 沉浸式聊天对话</li>
              <li>• AI 语音回复</li>
              <li>• 朋友圈、情侣空间</li>
              <li>• 日记、音乐、斗地主等趣味功能</li>
            </ul>
          </div>
          
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
            <h4 className="font-bold text-amber-700 mb-2">⚠️ 重要提示</h4>
            <p className="text-sm text-amber-600">本应用需要配置 AI API 才能使用聊天功能。请先完成 API 配置。</p>
          </div>
        </div>
      ),
    },
    {
      id: 'api-config',
      title: 'API 配置指南',
      icon: '🔑',
      content: (
        <div className="space-y-4">
          <p>使用聊天功能需要配置 AI API。目前支持 OpenAI 兼容格式的 API。</p>
          
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
            <h4 className="font-bold text-blue-700 mb-2">📍 配置路径</h4>
            <p className="text-sm text-blue-600">设置 → API 配置 → AI 对话配置</p>
          </div>
          
          <h4 className="font-bold">需要填写的信息：</h4>
          <div className="space-y-3">
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">1. API Base URL</div>
              <div className="text-sm text-gray-500 mt-1">
                API 服务地址，例如：
                <br />• OpenAI: <code className="bg-gray-200 px-1 rounded">https://api.openai.com/v1</code>
                <br />• 中转站: 根据服务商提供的地址填写
              </div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">2. API Key</div>
              <div className="text-sm text-gray-500 mt-1">你的 API 密钥，以 sk- 开头</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">3. 选择模型</div>
              <div className="text-sm text-gray-500 mt-1">点击"获取模型列表"后选择，推荐 gpt-4o 或 claude-3.5-sonnet</div>
            </div>
          </div>
          
          <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
            <h4 className="font-bold text-red-700 mb-2">💰 API 费用说明</h4>
            <p className="text-sm text-red-600">
              每次 AI 回复都会消耗 API 额度。费用由你的 API 服务商收取，与本应用无关。
              <br /><br />
              <strong>消耗 API 的功能：</strong>
              <br />• 聊天对话（主要消耗）
              <br />• 朋友圈刷新
              <br />• 情侣空间留言
              <br />• X 私信翻译
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'tts-config',
      title: '语音功能配置',
      icon: '🎙️',
      content: (
        <div className="space-y-4">
          <p>让 AI 角色用语音回复你！需要配置 MiniMax 语音 API。</p>
          
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
            <h4 className="font-bold text-blue-700 mb-2">📍 配置路径</h4>
            <p className="text-sm text-blue-600">设置 → API 配置 → 语音配置</p>
          </div>
          
          <h4 className="font-bold">配置步骤：</h4>
          <div className="space-y-3">
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">1. 获取 MiniMax API Key</div>
              <div className="text-sm text-gray-500 mt-1">
                访问 <a href="https://www.minimaxi.com" target="_blank" className="text-blue-500 underline">minimaxi.com</a>（国内）或 
                <a href="https://www.minimax.chat" target="_blank" className="text-blue-500 underline">minimax.chat</a>（海外）注册并获取
              </div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">2. 选择区域</div>
              <div className="text-sm text-gray-500 mt-1">根据你注册的平台选择国内版或海外版</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">3. 选择音色</div>
              <div className="text-sm text-gray-500 mt-1">系统预设 10+ 种音色，也可以上传音频克隆自己的音色</div>
            </div>
          </div>
          
          <h4 className="font-bold mt-4">为角色开启语音：</h4>
          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="text-sm text-gray-600">
              进入角色聊天 → 右上角设置 → 语音设置 → 开启语音
              <br /><br />
              <strong>语音频率选项：</strong>
              <br />• 总是：每条消息都发语音
              <br />• 经常：约 50% 概率发语音
              <br />• 偶尔：约 20% 概率发语音
              <br />• 很少：约 5% 概率发语音
            </div>
          </div>
          
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
            <h4 className="font-bold text-amber-700 mb-2">💰 费用说明</h4>
            <p className="text-sm text-amber-600">
              语音功能按字符数计费，约 ¥0.1/千字符。
              <br />建议选择"偶尔"或"很少"来控制费用。
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'chat',
      title: '聊天功能',
      icon: '💬',
      content: (
        <div className="space-y-4">
          <p>与 AI 角色进行沉浸式对话，支持多种消息类型和互动方式。</p>
          
          <h4 className="font-bold">基本操作：</h4>
          <div className="space-y-2">
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">发送消息</div>
              <div className="text-sm text-gray-500">在输入框输入文字，点击发送</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">触发 AI 回复</div>
              <div className="text-sm text-gray-500">发送消息后，点击输入框右侧的 ➤ 箭头按钮</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">播放语音</div>
              <div className="text-sm text-gray-500">点击语音气泡播放，再次点击暂停</div>
            </div>
          </div>
          
          <h4 className="font-bold mt-4">加号菜单功能：</h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-gray-50 rounded-lg text-sm">📷 相册 - 发送图片</div>
            <div className="p-2 bg-gray-50 rounded-lg text-sm">📍 位置 - 发送位置</div>
            <div className="p-2 bg-gray-50 rounded-lg text-sm">💸 转账 - 模拟转账</div>
            <div className="p-2 bg-gray-50 rounded-lg text-sm">📅 经期 - 经期日历</div>
            <div className="p-2 bg-gray-50 rounded-lg text-sm">🎵 音乐 - 分享音乐</div>
            <div className="p-2 bg-gray-50 rounded-lg text-sm">💑 情侣 - 情侣空间</div>
            <div className="p-2 bg-gray-50 rounded-lg text-sm">📔 日记 - 分享日记</div>
            <div className="p-2 bg-gray-50 rounded-lg text-sm">🃏 斗地主 - 邀请玩牌</div>
          </div>
          
          <div className="p-4 bg-green-50 rounded-2xl border border-green-100">
            <h4 className="font-bold text-green-700 mb-2">💡 小技巧</h4>
            <ul className="text-sm text-green-600 space-y-1">
              <li>• 长按消息可以编辑或删除</li>
              <li>• 下拉可以查看更早的消息</li>
              <li>• 点击角色头像进入设置</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'character',
      title: '创建与管理角色',
      icon: '👤',
      content: (
        <div className="space-y-4">
          <p>创建你的专属 AI 角色，设定 TA 的性格、背景和说话方式。</p>
          
          <h4 className="font-bold">创建角色：</h4>
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            Chat → 右上角 + 按钮 → 填写角色信息 → 保存
          </div>
          
          <h4 className="font-bold mt-4">角色设置项：</h4>
          <div className="space-y-2">
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">基本信息</div>
              <div className="text-sm text-gray-500">姓名、性别、生日、头像</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">人设描述</div>
              <div className="text-sm text-gray-500">角色的性格、背景故事、说话风格等（非常重要！）</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">关系设定</div>
              <div className="text-sm text-gray-500">TA 怎么称呼你、你们的关系</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">语言设置</div>
              <div className="text-sm text-gray-500">角色使用的语言，可开启翻译</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">语音设置</div>
              <div className="text-sm text-gray-500">选择音色、设置语音频率</div>
            </div>
          </div>
          
          <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100">
            <h4 className="font-bold text-purple-700 mb-2">✍️ 人设写作技巧</h4>
            <p className="text-sm text-purple-600">
              好的人设让角色更生动！建议包含：
              <br />• 性格特点（温柔/傲娇/活泼...）
              <br />• 说话风格（语气词、口头禅）
              <br />• 背景故事
              <br />• 与你的关系设定
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'workshop',
      title: '创作工坊',
      icon: '🎨',
      content: (
        <div className="space-y-4">
          <p>高级创作设置，让 AI 回复更符合你的期望。</p>
          
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
            <h4 className="font-bold text-blue-700 mb-2">📍 位置</h4>
            <p className="text-sm text-blue-600">主屏幕 → 创作工坊</p>
          </div>
          
          <h4 className="font-bold">叙事设置：</h4>
          <div className="space-y-2">
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">感官优先描写</div>
              <div className="text-sm text-gray-500">AI 会更注重描写感官细节（看到、听到、感受到...）</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">角色思维代理</div>
              <div className="text-sm text-gray-500">AI 完全代入角色视角思考和行动</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">保持角色一致性</div>
              <div className="text-sm text-gray-500">角色始终按照人设行动，不会跳出角色</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">保持沉浸感</div>
              <div className="text-sm text-gray-500">剧情自然流畅，不会突兀中断</div>
            </div>
          </div>
          
          <h4 className="font-bold mt-4">世界书：</h4>
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            创建世界观设定，当聊天中出现关键词时自动注入相关设定。
            <br /><br />
            例如：当提到"魔法学院"时，自动注入学院的详细设定。
          </div>
          
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
            <h4 className="font-bold text-amber-700 mb-2">💡 提示</h4>
            <p className="text-sm text-amber-600">
              这些设置不会直接消耗 API，但会影响每次对话的 prompt，可能略微增加 token 消耗。
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'other-apps',
      title: '其他功能',
      icon: '📱',
      content: (
        <div className="space-y-4">
          <h4 className="font-bold">日记本 📔</h4>
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            记录你的心情日记，可以分享给 AI 角色阅读。
            <br />• 支持心情和天气标签
            <br />• 日历视图查看历史
            <br />• 收藏角色分享的日记
            <br /><span className="text-green-600">✓ 不消耗 API</span>
          </div>
          
          <h4 className="font-bold mt-4">音乐 🎵</h4>
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            本地音乐播放器。
            <br />• 导入本地音频文件
            <br />• 创建歌单
            <br />• 分享歌曲到聊天
            <br /><span className="text-green-600">✓ 不消耗 API</span>
          </div>
          
          <h4 className="font-bold mt-4">斗地主 🃏</h4>
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            和 AI 角色一起打牌！
            <br />• 单机模式：与电脑对战
            <br />• 好友模式：邀请 1-2 位角色一起玩
            <br />• 金币系统：使用微信钱包余额
            <br /><span className="text-green-600">✓ 不消耗 API</span>
          </div>
          
          <h4 className="font-bold mt-4">X（推特）🐦</h4>
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            模拟 X/Twitter 界面，查看角色动态。
            <br />• 私信功能
            <br />• 非中文自动翻译
            <br /><span className="text-amber-600">⚡ 翻译功能消耗 API</span>
          </div>
          
          <h4 className="font-bold mt-4">朋友圈 📷</h4>
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            在 Chat → 朋友圈 Tab 查看。
            <br />• AI 角色会发布动态
            <br />• 可以点赞和评论
            <br /><span className="text-amber-600">⚡ 刷新时消耗 API</span>
          </div>
          
          <h4 className="font-bold mt-4">情侣空间 💑</h4>
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            在聊天加号菜单进入。
            <br />• 专属情侣空间
            <br />• 留言板互动
            <br /><span className="text-amber-600">⚡ 留言时消耗 API</span>
          </div>
        </div>
      ),
    },
    {
      id: 'api-cost',
      title: 'API 费用汇总',
      icon: '💰',
      content: (
        <div className="space-y-4">
          <p>了解哪些功能会消耗 API 额度，帮助你控制费用。</p>
          
          <h4 className="font-bold text-red-600">⚡ 消耗 LLM API 的功能：</h4>
          <div className="space-y-2">
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <div className="font-medium text-red-700">聊天对话</div>
              <div className="text-sm text-red-600">主要消耗点，每次 AI 回复都会调用</div>
            </div>
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <div className="font-medium text-red-700">朋友圈刷新</div>
              <div className="text-sm text-red-600">刷新时生成角色动态</div>
            </div>
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <div className="font-medium text-red-700">情侣空间留言</div>
              <div className="text-sm text-red-600">发送留言时生成回复</div>
            </div>
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <div className="font-medium text-red-700">X 私信翻译</div>
              <div className="text-sm text-red-600">非中文消息自动翻译</div>
            </div>
          </div>
          
          <h4 className="font-bold text-amber-600 mt-4">🎙️ 消耗 TTS API 的功能：</h4>
          <div className="space-y-2">
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
              <div className="font-medium text-amber-700">语音消息</div>
              <div className="text-sm text-amber-600">根据角色语音频率设置决定是否生成</div>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
              <div className="font-medium text-amber-700">语音试听</div>
              <div className="text-sm text-amber-600">在设置中测试音色时</div>
            </div>
          </div>
          
          <h4 className="font-bold text-green-600 mt-4">✓ 不消耗 API 的功能：</h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-green-50 rounded-lg text-sm text-green-700">📔 日记本</div>
            <div className="p-2 bg-green-50 rounded-lg text-sm text-green-700">🎵 音乐</div>
            <div className="p-2 bg-green-50 rounded-lg text-sm text-green-700">🃏 斗地主</div>
            <div className="p-2 bg-green-50 rounded-lg text-sm text-green-700">⚙️ 设置</div>
            <div className="p-2 bg-green-50 rounded-lg text-sm text-green-700">🎨 创作工坊</div>
            <div className="p-2 bg-green-50 rounded-lg text-sm text-green-700">🖼️ 壁纸</div>
          </div>
          
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
            <h4 className="font-bold text-blue-700 mb-2">💡 省钱技巧</h4>
            <ul className="text-sm text-blue-600 space-y-1">
              <li>• 语音频率设为"偶尔"或"很少"</li>
              <li>• 选择较便宜的模型（如 gpt-4o-mini）</li>
              <li>• 减少朋友圈刷新次数</li>
              <li>• 调低最大回复长度</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'faq',
      title: '常见问题',
      icon: '❓',
      content: (
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: AI 不回复怎么办？</h4>
            <p className="text-sm text-gray-600">
              1. 检查 API 配置是否正确
              <br />2. 确认 API 额度是否充足
              <br />3. 点击输入框右侧的 ➤ 箭头触发回复
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: 语音播放没声音？</h4>
            <p className="text-sm text-gray-600">
              1. 检查手机是否静音
              <br />2. 确认 TTS API 配置正确
              <br />3. 检查角色是否开启了语音功能
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: 数据会丢失吗？</h4>
            <p className="text-sm text-gray-600">
              数据保存在浏览器本地。清除浏览器数据会导致丢失。
              <br />建议定期在 设置 → 导出数据 备份。
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: 换设备后数据还在吗？</h4>
            <p className="text-sm text-gray-600">
              数据不会自动同步。需要在旧设备导出数据，在新设备导入。
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: 可以同时在多个设备使用吗？</h4>
            <p className="text-sm text-gray-600">
              一个兑换码只能绑定一个设备。如需更换设备，输入兑换码时选择"迁移"即可。
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: 如何获取更多兑换码？</h4>
            <p className="text-sm text-gray-600">
              请联系开发者购买。
            </p>
          </div>
        </div>
      ),
    },
  ]
  
  return (
    <PageContainer>
      <div className="flex flex-col h-full">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <svg className="w-6 h-6" style={{ color: fontColor.value }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold" style={{ color: fontColor.value }}>使用手册</h1>
          <div className="w-10" />
        </div>
        
        {/* 内容 */}
        <div className="flex-1 overflow-y-auto">
          {activeSection ? (
            // 章节详情
            <div className="p-4">
              <button
                onClick={() => setActiveSection(null)}
                className="flex items-center gap-2 text-sm text-gray-500 mb-4 hover:text-gray-700"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                返回目录
              </button>
              
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{sections.find(s => s.id === activeSection)?.icon}</span>
                <h2 className="text-xl font-bold" style={{ color: fontColor.value }}>
                  {sections.find(s => s.id === activeSection)?.title}
                </h2>
              </div>
              
              <div className="prose prose-sm max-w-none" style={{ color: fontColor.value }}>
                {sections.find(s => s.id === activeSection)?.content}
              </div>
            </div>
          ) : (
            // 目录
            <div className="p-4 space-y-3">
              <div className="text-center py-6">
                <div
                  className="text-4xl font-extrabold tracking-wide select-none inline-block mb-2"
                  style={{
                    fontFamily: '"Baloo 2", "ZCOOL KuaiLe", "Noto Sans SC", system-ui, sans-serif',
                    background: 'linear-gradient(135deg, #fb7185 0%, #ec4899 55%, #f472b6 100%)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                  }}
                >
                  Mina
                </div>
                <p className="text-sm text-gray-500">使用手册 v1.0</p>
              </div>
              
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all active:scale-[0.98]"
                >
                  <span className="text-2xl">{section.icon}</span>
                  <span className="font-medium" style={{ color: fontColor.value }}>{section.title}</span>
                  <svg className="w-5 h-5 ml-auto opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
              
              <div className="text-center text-xs text-gray-400 pt-4">
                Made with ❤️ by Mina Team
              </div>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  )
}
