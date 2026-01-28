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

// 手册内容文本（用于 AI 搜索）
const MANUAL_TEXT = `
【常见问题】
- 苹果手机底部有黑条：设置 → 屏幕适配 → 打开「iOS 底部适配」
- 按钮被屏幕截断：设置 → 屏幕适配 → 调整边距
- 苹果手机无法全屏：Safari 分享 → 添加到主屏幕（PWA 方式）
- AI 不回复：检查 API 配置，确认 Base URL、API Key、模型名称正确
- AI 回复乱码：可能是 API 中转站问题，尝试更换
- 聊天记录丢失：设置 → 导入数据，恢复备份
- 私聊如何让 AI 回复：点击右下角的播放按钮
- 群聊生成回复：点击消息列表右下角的生成按钮

【API 消耗详解】
消耗 API 的操作：
- 私聊点击播放按钮触发回复
- 群聊点击生成按钮
- 朋友圈点击右上角刷新按钮
- 情侣空间每次进入刷新留言
- 偷看日记
- 查手机
- 聊天记忆总结点击 AI 总结
- X 推特刷新主页
- X 推特搜索话题
- X 推特刷新私信

不消耗 API 的操作：
- 日记本查看/编辑
- 音乐播放器
- 斗地主
- 所有设置
- 创作工坊
- 壁纸设置
- 创建/编辑角色
- 基金模拟
- 钱包功能
- 发送消息本身
- X 私信发送消息
- X 私信翻译

【微信功能】
- 私聊：进入聊天 → 发送消息 → 点击右下角播放按钮让 AI 回复
- 群聊：微信 → 右上角加号 → 发起群聊
- 朋友圈：微信 → 底部朋友圈 Tab → 右上角刷新
- 偷看日记：聊天 → 点击「+」→ 偷看日记
- 查手机：聊天 → 点击「+」→ 查手机
- 情侣空间：聊天 → 点击「+」→ 情侣空间

【其他 App】
- 日记本：主屏幕 → 日记，写日记不消耗 API，偷看日记消耗 API
- 音乐：主屏幕 → 音乐，不消耗 API
- 斗地主：主屏幕 → 斗地主，不消耗 API
- X 推特：主屏幕 → X，刷新主页/搜索/刷新私信消耗 API，发送私信/翻译不消耗
- 创作工坊：主屏幕 → 创作工坊，不消耗 API
- 钱包/基金：微信 → 我 → 钱包，不消耗 API
- 设置：主屏幕 → 设置，不消耗 API

【API 配置】
- 位置：设置 → API 配置 → AI 对话配置
- 需要填写：Base URL、API Key、选择模型
- 开发者不提供 API，需要自行获取
- 可使用 OpenAI 官方或国内中转站

【角色设置】
- 创建角色：微信 → 右上角加号 → 新建角色
- 编辑角色：聊天 → 右上角「…」→ 聊天设置
- 人设提示词：描述角色性格、说话方式等
- 记忆管理：聊天设置 → 记忆管理 → AI 总结

【API 质量问题】
以下问题通常与 API 服务商或模型有关，开发者无法解决，请尝试更换模型或联系 API 服务商：
- AI 回复被截断/不完整：API 服务商可能限制了 max_tokens，联系服务商或换支持长输出的模型
- AI 回复很短/敷衍：模型能力弱或中转站篡改参数，换更强模型如 GPT-4/Claude
- AI 智商低/不理解上下文：模型版本旧或被偷换便宜模型，升级模型或换可信服务商
- AI 回复很慢/超时：服务商负载高或网络延迟，换响应快的模型或低延迟服务商
- 一直报错/返回 Error：401=API Key 无效，429=额度用完/频率过高，500/502/503=服务商问题
- AI 回复乱码/格式错误：服务商返回数据异常，更换稳定可靠的 API 服务商
`

export default function ManualScreen() {
  const navigate = useNavigate()
  const { fontColor, llmConfig, callLLM } = useOS()
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [showDisclaimer, setShowDisclaimer] = useState(() => {
    // 检查是否已经同意过免责声明
    return localStorage.getItem('mina_disclaimer_agreed') !== 'true'
  })
  
  // 问答搜索相关状态
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchConfirm, setShowSearchConfirm] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<string | null>(null)
  const [showSearchResult, setShowSearchResult] = useState(false)
  
  // 同意免责声明
  const handleAgreeDisclaimer = () => {
    localStorage.setItem('mina_disclaimer_agreed', 'true')
    setShowDisclaimer(false)
  }
  
  // 执行问答搜索
  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setShowSearchConfirm(false)
    setSearching(true)
    setSearchResult(null)
    
    try {
      const systemPrompt = `你是 Mina 小手机的使用帮助助手。根据用户的问题，从以下手册内容中找到相关答案并整理回复。

【手册内容】
${MANUAL_TEXT}

【回答要求】
1. 如果问题能在手册中找到答案，直接给出清晰简洁的回答
2. 如果问题在手册中找不到相关内容，回复："❌ 抱歉，这个问题不在使用手册范围内。建议您联系开发者反馈此问题。"
3. 回答要简洁明了，使用中文
4. 可以补充一些操作路径和注意事项`

      const result = await callLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: searchQuery },
      ], undefined, { maxTokens: 500, timeoutMs: 30000 })
      
      setSearchResult(result || '未能获取回答，请稍后重试')
    } catch (e: any) {
      setSearchResult(`搜索失败：${e?.message || '未知错误'}`)
    } finally {
      setSearching(false)
      setShowSearchResult(true)
    }
  }
  
  // 检查 API 是否配置
  const hasApiConfig = !!(llmConfig?.apiBaseUrl && llmConfig?.apiKey && llmConfig?.selectedModel)
  
  // 手册章节
  const sections: Section[] = [
    {
      id: 'faq',
      title: '常见问题汇总',
      icon: '❓',
      content: (
        <div className="space-y-4">
          <div className="p-4 bg-red-50 rounded-2xl border border-red-200">
            <h4 className="font-bold text-red-700 mb-2">🔴 最重要的事</h4>
            <p className="text-sm text-red-600">
              <strong>定期备份数据！</strong>
              <br />路径：设置 → 导出数据
              <br />小手机没有云端数据库，数据存在浏览器本地，清除浏览器数据会导致全部丢失！
            </p>
          </div>
          
          <h4 className="font-bold text-lg">📱 屏幕适配问题</h4>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: 苹果手机底部有黑条怎么办？</h4>
            <p className="text-sm text-gray-600">
              <strong>路径：</strong>设置 → 屏幕适配 → 打开「iOS 底部适配」→ 保存
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: 按钮/内容被屏幕边缘截断看不见？</h4>
            <p className="text-sm text-gray-600">
              <strong>路径：</strong>设置 → 屏幕适配 → 调整「左侧边距」或「右侧边距」→ 保存
              <br />可以调整上下左右四个方向的边距
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: 苹果手机无法全屏？</h4>
            <p className="text-sm text-gray-600">
              iOS Safari 不支持网页全屏 API。
              <br /><strong>解决方案：</strong>在 Safari 中点击分享 → 「添加到主屏幕」，以 PWA 方式打开即可全屏。
            </p>
          </div>
          
          <h4 className="font-bold text-lg mt-6">💬 聊天相关</h4>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: AI 不回复 / 点发送没反应？</h4>
            <p className="text-sm text-gray-600">
              1. 检查 API 是否配置正确：设置 → API 配置
              <br />2. 确认 API 额度是否充足
              <br />3. 发送消息后，需要点击输入框右边的「播放按钮 ▶」触发 AI 回复
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: 怎么让 AI 发语音？</h4>
            <p className="text-sm text-gray-600">
              1. 先配置语音 API：设置 → API 配置 → 语音配置
              <br />2. 然后给角色开启语音：进入聊天 → 右上角三个点 → 语音设置 → 开启
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: 消息记忆/AI 总结在哪？</h4>
            <p className="text-sm text-gray-600">
              进入聊天 → 右上角三个点 → 往下滑找到「记忆」板块
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: 怎么删除/编辑消息？</h4>
            <p className="text-sm text-gray-600">
              点击消息下方的时间，会出现「编辑」「引用」「删除」按钮
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: 群聊怎么创建？</h4>
            <p className="text-sm text-gray-600">
              微信 → 右上角 + 号 → 「创建群聊」
              <br />需要先创建至少 2 个角色才能拉群
            </p>
          </div>
          
          <h4 className="font-bold text-lg mt-6">⚠️ API 质量问题</h4>
          
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200">
            <p className="text-sm text-amber-700 mb-2">
              <strong>以下问题通常与 API 服务商或模型有关，开发者无法解决。</strong>
              <br />请尝试更换模型或联系你的 API 服务商咨询。
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: AI 回复被截断/不完整？</h4>
            <p className="text-sm text-gray-600">
              可能原因：
              <br />• API 服务商设置了 max_tokens 限制
              <br />• 使用的模型输出长度有限制
              <br />• 网络不稳定导致传输中断
              <br /><strong>解决方案：</strong>联系 API 服务商调整限制，或更换支持更长输出的模型/服务商
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: AI 回复很短/敷衍？</h4>
            <p className="text-sm text-gray-600">
              可能原因：
              <br />• 使用的模型能力较弱（如 GPT-3.5）
              <br />• API 中转站篡改了请求参数
              <br />• 人设提示词不够详细
              <br /><strong>解决方案：</strong>更换更强的模型（如 GPT-4、Claude），或更换 API 服务商
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: AI 智商好像很低/不理解上下文？</h4>
            <p className="text-sm text-gray-600">
              可能原因：
              <br />• 使用的模型版本较旧或能力弱
              <br />• 某些中转站可能「偷换」了便宜模型
              <br />• 对话历史太长超出模型上下文窗口
              <br /><strong>解决方案：</strong>升级到更智能的模型，或更换可信赖的 API 服务商
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: AI 回复很慢/超时？</h4>
            <p className="text-sm text-gray-600">
              可能原因：
              <br />• API 服务商服务器负载高
              <br />• 网络延迟（尤其是海外 API）
              <br />• 使用的模型本身推理速度慢
              <br /><strong>解决方案：</strong>换一个响应更快的模型，或更换延迟更低的 API 服务商
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: 一直报错 / 返回 Error？</h4>
            <p className="text-sm text-gray-600">
              常见错误码：
              <br />• <strong>401</strong>：API Key 无效或过期
              <br />• <strong>429</strong>：请求频率过高/额度用完
              <br />• <strong>500/502/503</strong>：服务商服务器问题
              <br /><strong>解决方案：</strong>检查 API Key 是否正确，确认余额充足，或等待服务商恢复
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: AI 回复乱码/格式错误？</h4>
            <p className="text-sm text-gray-600">
              可能原因：
              <br />• API 服务商返回数据格式异常
              <br />• 中转站处理响应时出错
              <br /><strong>解决方案：</strong>更换 API 服务商，选择稳定可靠的服务
            </p>
          </div>
          
          <h4 className="font-bold text-lg mt-6">🔧 其他问题</h4>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: API 哪里获取？</h4>
            <p className="text-sm text-gray-600">
              <strong>开发者不提供 API，需要自行获取。</strong>
              <br />可以使用 OpenAI 官方 API，或者国内中转站（自行搜索"GPT API 中转"）。
              <br />语音 API 需要去 MiniMax 官网注册获取。
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: 数据突然全部丢失了？</h4>
            <p className="text-sm text-gray-600">
              可能原因：
              <br />• 使用了无痕/私密浏览模式
              <br />• 浏览器清除了网站数据
              <br />• 某些国产浏览器不稳定（建议用 Chrome）
              <br /><strong>预防：定期导出备份！</strong>
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: 换设备怎么迁移数据？</h4>
            <p className="text-sm text-gray-600">
              旧设备：设置 → 导出数据 → 保存 JSON 文件
              <br />新设备：设置 → 导入数据 → 选择 JSON 文件
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">Q: 创作工坊/世界书在哪？</h4>
            <p className="text-sm text-gray-600">
              主屏幕 → 点击「创作工坊」App 图标
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'api-cost',
      title: 'API 消耗详解',
      icon: '💰',
      content: (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200">
            <p className="text-sm text-amber-700">
              <strong>⚠️ 重要说明</strong>
              <br />API 费用由你的 API 服务商收取，与本应用无关。
              <br />请合理使用，避免产生高额费用。
            </p>
          </div>
          
          <h4 className="font-bold text-lg text-red-600">🔴 消耗 LLM API 的操作</h4>
          <p className="text-sm text-gray-500 mb-2">（每次操作调用 1 次 API）</p>
          
          <div className="space-y-2">
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <div className="font-medium text-red-700">私聊：点击「▶ 播放按钮」触发回复</div>
              <div className="text-sm text-red-600">每点一次 = 调用 1 次 API</div>
            </div>
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <div className="font-medium text-red-700">群聊：点击「▶ 生成按钮」</div>
              <div className="text-sm text-red-600">每点一次 = 调用 1 次 API（一次生成多人回复）</div>
            </div>
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <div className="font-medium text-red-700">朋友圈：点击右上角刷新按钮</div>
              <div className="text-sm text-red-600">每次刷新 = 调用 1 次 API（生成动态/评论）</div>
            </div>
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <div className="font-medium text-red-700">情侣空间：每次进入刷新留言</div>
              <div className="text-sm text-red-600">每次进入 = 调用 1 次 API（刷新对方留言）</div>
            </div>
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <div className="font-medium text-red-700">偷看日记：点击「偷看日记」按钮</div>
              <div className="text-sm text-red-600">每次偷看 = 调用 1 次 API（生成日记内容）</div>
            </div>
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <div className="font-medium text-red-700">查手机：点击「查手机」按钮</div>
              <div className="text-sm text-red-600">每次查看 = 调用 1 次 API（生成聊天/账单等）</div>
            </div>
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <div className="font-medium text-red-700">聊天记忆总结：点击「AI 总结」</div>
              <div className="text-sm text-red-600">每次总结 = 调用 1 次 API</div>
            </div>
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <div className="font-medium text-red-700">X（推特）：点击右上角刷新主页</div>
              <div className="text-sm text-red-600">每次刷新 = 调用 1 次 API（生成新推文）</div>
            </div>
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <div className="font-medium text-red-700">X（推特）：搜索话题</div>
              <div className="text-sm text-red-600">每次搜索 = 调用 1 次 API（生成相关推文）</div>
            </div>
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <div className="font-medium text-red-700">X（推特）私信：点击右上角刷新</div>
              <div className="text-sm text-red-600">每次刷新 = 调用 1 次 API（生成新私信）</div>
            </div>
          </div>
          
          <h4 className="font-bold text-lg text-amber-600 mt-6">🟡 消耗 TTS（语音）API 的操作</h4>
          <p className="text-sm text-gray-500 mb-2">（需要单独配置语音 API）</p>
          
          <div className="space-y-2">
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
              <div className="font-medium text-amber-700">AI 发送语音消息</div>
              <div className="text-sm text-amber-600">根据角色「语音频率」设置决定，按字数计费</div>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
              <div className="font-medium text-amber-700">语音设置里「试听音色」</div>
              <div className="text-sm text-amber-600">每次试听消耗少量额度</div>
            </div>
          </div>
          
          <h4 className="font-bold text-lg text-green-600 mt-6">🟢 不消耗 API 的功能</h4>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-green-50 rounded-lg text-sm text-green-700">📔 日记本（查看/编辑）</div>
            <div className="p-2 bg-green-50 rounded-lg text-sm text-green-700">🎵 音乐播放器</div>
            <div className="p-2 bg-green-50 rounded-lg text-sm text-green-700">🃏 斗地主</div>
            <div className="p-2 bg-green-50 rounded-lg text-sm text-green-700">⚙️ 所有设置</div>
            <div className="p-2 bg-green-50 rounded-lg text-sm text-green-700">🎨 创作工坊</div>
            <div className="p-2 bg-green-50 rounded-lg text-sm text-green-700">🖼️ 壁纸设置</div>
            <div className="p-2 bg-green-50 rounded-lg text-sm text-green-700">👤 创建/编辑角色</div>
            <div className="p-2 bg-green-50 rounded-lg text-sm text-green-700">📊 基金模拟</div>
            <div className="p-2 bg-green-50 rounded-lg text-sm text-green-700">💳 钱包功能</div>
            <div className="p-2 bg-green-50 rounded-lg text-sm text-green-700">📱 发送消息本身</div>
            <div className="p-2 bg-green-50 rounded-lg text-sm text-green-700">🐦 X 私信发送消息</div>
            <div className="p-2 bg-green-50 rounded-lg text-sm text-green-700">🌐 X 私信翻译</div>
          </div>
          
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 mt-4">
            <h4 className="font-bold text-blue-700 mb-2">💡 省钱技巧</h4>
            <ul className="text-sm text-blue-600 space-y-1">
              <li>• 语音频率设为「偶尔」或「很少」</li>
              <li>• 选择便宜的模型（如 gpt-4o-mini、deepseek）</li>
              <li>• 减少朋友圈刷新次数</li>
              <li>• 聊天时不要频繁点生成按钮</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'chat',
      title: '微信功能说明',
      icon: '💬',
      content: (
        <div className="space-y-4">
          <h4 className="font-bold text-lg">📍 位置：主屏幕 → 微信</h4>
          
          <h4 className="font-bold mt-4">私聊操作</h4>
          <div className="space-y-2">
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">发送消息</div>
              <div className="text-sm text-gray-500">输入文字 → 点击「发送」</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">触发 AI 回复</div>
              <div className="text-sm text-gray-500">点击输入框右边的粉色「▶」按钮</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">角色设置</div>
              <div className="text-sm text-gray-500">聊天界面 → 右上角「⋯」→ 可设置人设、语音、气泡等</div>
            </div>
          </div>
          
          <h4 className="font-bold mt-4">群聊操作</h4>
          <div className="space-y-2">
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">创建群聊</div>
              <div className="text-sm text-gray-500">微信主界面 → 右上角「+」→「创建群聊」→ 选择成员</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">生成群友回复</div>
              <div className="text-sm text-gray-500">点击绿色「▶」按钮，可选择指定成员回复</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">群设置</div>
              <div className="text-sm text-gray-500">群聊界面 → 右上角「⋯」→ 可设置群名、成员、关系网等</div>
            </div>
          </div>
          
          <h4 className="font-bold mt-4">加号菜单功能</h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-gray-50 rounded-lg text-sm">📷 相册 - 发送图片</div>
            <div className="p-2 bg-gray-50 rounded-lg text-sm">📍 位置 - 发送位置</div>
            <div className="p-2 bg-gray-50 rounded-lg text-sm">💸 转账 - 模拟转账</div>
            <div className="p-2 bg-gray-50 rounded-lg text-sm">📅 经期 - 经期日历</div>
            <div className="p-2 bg-gray-50 rounded-lg text-sm">🎵 音乐 - 分享音乐</div>
            <div className="p-2 bg-gray-50 rounded-lg text-sm">💑 情侣 - 情侣空间</div>
            <div className="p-2 bg-gray-50 rounded-lg text-sm">📔 日记 - 分享日记</div>
            <div className="p-2 bg-gray-50 rounded-lg text-sm">🃏 斗地主 - 邀请玩牌</div>
            <div className="p-2 bg-gray-50 rounded-lg text-sm">↗️ 转发 - 转发消息</div>
            <div className="p-2 bg-gray-50 rounded-lg text-sm">🗑️ 清空 - 清空记录</div>
          </div>
          
          <h4 className="font-bold mt-4">朋友圈</h4>
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            微信 → 底部「朋友圈」Tab
            <br />• 下拉刷新生成角色动态（消耗 API）
            <br />• 可以点赞、评论
          </div>
        </div>
      ),
    },
    {
      id: 'other-apps',
      title: '其他 App 说明',
      icon: '📱',
      content: (
        <div className="space-y-4">
          <h4 className="font-bold">📔 日记本</h4>
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            <strong>位置：</strong>主屏幕 → 日记
            <br />• 记录心情日记，支持心情和天气标签
            <br />• 日历视图查看历史
            <br />• 可以分享日记给角色
            <br />• 收藏角色「偷看日记」的内容
            <br /><span className="text-green-600">✓ 写日记/查看日记不消耗 API</span>
            <br /><span className="text-amber-600">⚡ 聊天里「偷看日记」消耗 API</span>
          </div>
          
          <h4 className="font-bold mt-4">🎵 音乐</h4>
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            <strong>位置：</strong>主屏幕 → 音乐
            <br />• 本地音乐播放器
            <br />• 可导入音频文件或在线 URL
            <br />• 分享歌曲到聊天
            <br /><span className="text-green-600">✓ 不消耗 API</span>
          </div>
          
          <h4 className="font-bold mt-4">🃏 斗地主</h4>
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            <strong>位置：</strong>主屏幕 → 斗地主
            <br />• 单机模式：与电脑 AI 对战
            <br />• 好友模式：从聊天里邀请角色一起玩
            <br />• 金币系统：使用微信钱包余额
            <br /><span className="text-green-600">✓ 不消耗 API</span>
          </div>
          
          <h4 className="font-bold mt-4">🐦 X（推特）</h4>
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            <strong>位置：</strong>主屏幕 → X
            <br />• 模拟 X/Twitter 界面
            <br />• 角色会发推文
            <br /><span className="text-amber-600">⚡ 消耗 API：刷新主页、搜索话题、刷新私信</span>
            <br /><span className="text-green-600">✓ 不消耗 API：发送私信、私信翻译</span>
          </div>
          
          <h4 className="font-bold mt-4">🎨 创作工坊</h4>
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            <strong>位置：</strong>主屏幕 → 创作工坊
            <br />• 叙事设置：调整 AI 回复风格
            <br />• 世界书：创建设定库，关键词触发自动注入
            <br /><span className="text-green-600">✓ 不消耗 API（但会影响每次对话的提示词）</span>
          </div>
          
          <h4 className="font-bold mt-4">💳 钱包 & 基金</h4>
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            <strong>位置：</strong>微信 → 底部「我」Tab → 钱包
            <br />• 模拟微信钱包
            <br />• 基金模拟投资
            <br />• 用于斗地主下注
            <br /><span className="text-green-600">✓ 不消耗 API</span>
          </div>
          
          <h4 className="font-bold mt-4">💑 情侣空间</h4>
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            <strong>位置：</strong>聊天 → 点击「+」→ 情侣空间
            <br />• 每个角色专属的情侣空间
            <br />• 留言板互动
            <br /><span className="text-amber-600">⚡ 每次进入刷新留言消耗 API</span>
          </div>
          
          <h4 className="font-bold mt-4">📱 查手机</h4>
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            <strong>位置：</strong>聊天 → 点击「+」→ 查手机
            <br />• 查看角色的聊天记录、账单、备忘录等
            <br />• 展示角色的社交圈
            <br /><span className="text-amber-600">⚡ 每次查看消耗 API</span>
          </div>
          
          <h4 className="font-bold mt-4">⚙️ 设置</h4>
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            <strong>位置：</strong>主屏幕 → 设置
            <br />• API 配置（LLM + 语音）
            <br />• 屏幕适配（边距调整、iOS 适配）
            <br />• 导出/导入数据
            <br />• 字体、颜色、壁纸等
            <br /><span className="text-green-600">✓ 不消耗 API</span>
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
          <div className="p-4 bg-red-50 rounded-2xl border border-red-200">
            <p className="text-sm text-red-600">
              <strong>⚠️ 开发者不提供 API</strong>
              <br />你需要自行获取 API Key。可以使用：
              <br />• OpenAI 官方（需要海外支付）
              <br />• 国内 API 中转站（自行搜索）
              <br />• 其他兼容 OpenAI 格式的服务
            </p>
          </div>
          
          <h4 className="font-bold">📍 配置位置</h4>
          <div className="p-3 bg-blue-50 rounded-xl text-sm text-blue-700">
            设置 → API 配置 → AI 对话配置
          </div>
          
          <h4 className="font-bold mt-4">需要填写：</h4>
          <div className="space-y-3">
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">1. API Base URL</div>
              <div className="text-sm text-gray-500 mt-1">
                API 服务地址，例如：
                <br />• OpenAI: <code className="bg-gray-200 px-1 rounded">https://api.openai.com/v1</code>
                <br />• 中转站: 按服务商提供的填写
              </div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">2. API Key</div>
              <div className="text-sm text-gray-500 mt-1">你的密钥，通常以 sk- 开头</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="font-medium">3. 选择模型</div>
              <div className="text-sm text-gray-500 mt-1">点击「获取模型列表」后选择</div>
            </div>
          </div>
          
          <h4 className="font-bold mt-4">语音 API（可选）</h4>
          <div className="p-3 bg-gray-50 rounded-xl text-sm">
            <strong>位置：</strong>设置 → API 配置 → 语音配置
            <br /><strong>服务商：</strong>MiniMax（需要单独注册）
            <br />• 国内：minimaxi.com
            <br />• 海外：minimax.chat
          </div>
        </div>
      ),
    },
    {
      id: 'disclaimer',
      title: '免责声明',
      icon: '⚖️',
      content: (
        <div className="space-y-4">
          <div className="p-4 bg-red-50 rounded-2xl border border-red-200">
            <h4 className="font-bold text-red-700 mb-3">📜 用户须知</h4>
            <div className="text-sm text-red-600 space-y-3">
              <p>使用本应用前，请仔细阅读以下声明：</p>
            </div>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">1. 遵守法律法规</h4>
            <p className="text-sm text-gray-600">
              用户必须遵守相关法律法规。禁止利用本应用从事任何违法活动，包括但不限于：
              <br />• 制作、传播违法信息
              <br />• 传播淫秽、暴力、恐怖等有害内容
              <br />• 侵犯他人合法权益
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">2. 内容责任</h4>
            <p className="text-sm text-gray-600">
              AI 生成的内容由第三方大语言模型提供。用户对其创建的角色设定、对话内容承担全部责任。开发者不对 AI 生成内容负责。
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">3. 未成年人保护</h4>
            <p className="text-sm text-gray-600">
              <strong>未满 18 周岁的用户请在家长允许和指导下使用</strong>，并确保内容健康向上。
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">4. API 服务</h4>
            <p className="text-sm text-gray-600">
              本应用需要用户自行配置第三方 API。用户应遵守相关服务商条款。API 费用由用户自行承担。
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">5. 数据与隐私</h4>
            <p className="text-sm text-gray-600">
              数据存储在用户本地浏览器，不会上传至开发者服务器。但使用第三方 API 时，对话内容会发送至相应服务商。
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-2xl">
            <h4 className="font-bold mb-2">6. 免责条款</h4>
            <p className="text-sm text-gray-600">
              开发者不对因使用本应用而产生的任何损失承担责任，包括数据丢失、API 费用、因违规使用导致的法律责任等。
            </p>
          </div>
        </div>
      ),
    },
  ]
  
  // 免责声明弹窗
  if (showDisclaimer) {
    return (
      <PageContainer>
        <div className="flex flex-col h-full bg-white">
          <div className="flex-1 overflow-y-auto p-4">
            <div className="text-center py-4">
              <div className="text-3xl mb-2">⚠️</div>
              <h1 className="text-xl font-bold text-gray-800">使用须知</h1>
              <p className="text-sm text-gray-500 mt-1">请仔细阅读以下内容</p>
            </div>
            
            <div className="space-y-4 mt-4">
              <div className="p-4 bg-red-50 rounded-2xl border border-red-200">
                <h4 className="font-bold text-red-700 mb-2">🔞 年龄限制</h4>
                <p className="text-sm text-red-600">
                  <strong>未满 18 周岁的未成年人请在家长知情并允许的情况下使用本应用。</strong>
                </p>
              </div>
              
              <div className="p-4 bg-red-50 rounded-2xl border border-red-200">
                <h4 className="font-bold text-red-700 mb-2">🚫 禁止内容</h4>
                <p className="text-sm text-red-600">
                  严禁利用本应用制作、传播任何违法违规内容，包括但不限于：
                  <br />• 色情、淫秽内容
                  <br />• 暴力、恐怖内容
                  <br />• 危害国家安全的内容
                  <br />• 侵犯他人权益的内容
                </p>
              </div>
              
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200">
                <h4 className="font-bold text-amber-700 mb-2">⚖️ 法律责任</h4>
                <p className="text-sm text-amber-600">
                  用户需遵守中华人民共和国相关法律法规。
                  <br />违法使用产生的一切法律责任由用户自行承担。
                </p>
              </div>
              
              <div className="p-4 bg-gray-50 rounded-2xl">
                <h4 className="font-bold text-gray-700 mb-2">📋 其他说明</h4>
                <p className="text-sm text-gray-600">
                  • 本应用需要用户自行配置 AI API
                  <br />• API 费用由用户自行承担
                  <br />• 数据存储在本地，请定期备份
                  <br />• 开发者不对 AI 生成内容负责
                </p>
              </div>
            </div>
          </div>
          
          <div className="p-4 border-t border-gray-100">
            <button
              onClick={handleAgreeDisclaimer}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold shadow-lg"
            >
              我已阅读并同意以上条款
            </button>
            <p className="text-center text-xs text-gray-400 mt-2">
              点击即表示您已年满 18 周岁或已获得家长同意
            </p>
          </div>
        </div>
      </PageContainer>
    )
  }
  
  return (
    <PageContainer>
      <div className="flex flex-col h-full">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <button
            onClick={() => navigate('/')}
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
              {/* 重要警告 */}
              <div className="p-3 bg-red-500 rounded-2xl text-white text-center">
                <p className="text-sm font-bold">
                  ⚠️ 小手机没有云端数据库！
                </p>
                <p className="text-xs mt-1 opacity-90">
                  数据存在浏览器本地，请定期「设置 → 导出数据」备份
                </p>
              </div>
              
              <div className="text-center py-4">
                <div
                  className="text-3xl font-extrabold tracking-wide select-none inline-block mb-1"
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
                <p className="text-xs text-gray-500">使用手册 v2.0</p>
              </div>
              
              {/* 问答百科搜索入口 */}
              <div className="p-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl text-white">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🔍</span>
                  <span className="font-bold">问答百科一键搜索</span>
                </div>
                <p className="text-xs opacity-90 mb-3">输入你的问题，AI 会从手册中找出答案</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="例如：怎么让 AI 回复？"
                    className="flex-1 px-3 py-2 rounded-xl bg-white/20 placeholder-white/60 text-white text-sm outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchQuery.trim()) {
                        if (!hasApiConfig) {
                          alert('请先配置 API（设置 → API 配置）')
                        } else {
                          setShowSearchConfirm(true)
                        }
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (!searchQuery.trim()) {
                        alert('请输入问题')
                        return
                      }
                      if (!hasApiConfig) {
                        alert('请先配置 API（设置 → API 配置）')
                        return
                      }
                      setShowSearchConfirm(true)
                    }}
                    className="px-4 py-2 bg-white/20 rounded-xl text-sm font-medium hover:bg-white/30 transition-colors"
                  >
                    搜索
                  </button>
                </div>
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
                Made with ❤️
              </div>
            </div>
          )}
        </div>
        
        {/* 搜索确认弹窗 */}
        {showSearchConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="w-[300px] bg-white rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 text-center">
                <div className="text-4xl mb-3">🔍</div>
                <div className="font-bold text-gray-800 mb-2">问答搜索</div>
                <div className="text-sm text-gray-500 mb-1">本次搜索将消耗 1 次 API 调用</div>
                <div className="text-xs text-gray-400">AI 会从手册内容中精准查找答案</div>
              </div>
              <div className="flex border-t border-gray-100">
                <button
                  onClick={() => setShowSearchConfirm(false)}
                  className="flex-1 py-3 text-gray-600 text-[15px] border-r border-gray-100"
                >
                  取消
                </button>
                <button
                  onClick={handleSearch}
                  className="flex-1 py-3 text-purple-500 font-medium text-[15px]"
                >
                  确认搜索
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* 搜索中弹窗 */}
        {searching && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="w-[280px] bg-white rounded-2xl p-6 text-center shadow-xl">
              <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <div className="font-bold text-gray-800 mb-1">正在搜索…</div>
              <div className="text-sm text-gray-500">AI 正在分析手册内容</div>
            </div>
          </div>
        )}
        
        {/* 搜索结果弹窗 */}
        {showSearchResult && searchResult && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-[340px] max-h-[80vh] bg-white rounded-2xl overflow-hidden shadow-xl flex flex-col">
              <div className="p-4 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-gray-800">搜索结果</div>
                  <button
                    onClick={() => {
                      setShowSearchResult(false)
                      setSearchResult(null)
                      setSearchQuery('')
                    }}
                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="text-xs text-gray-400 mt-1">问题：{searchQuery}</div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {searchResult}
                </div>
              </div>
              <div className="p-3 border-t border-gray-100 flex-shrink-0">
                <button
                  onClick={() => {
                    setShowSearchResult(false)
                    setSearchResult(null)
                    setSearchQuery('')
                  }}
                  className="w-full py-2.5 bg-purple-500 text-white rounded-xl text-sm font-medium"
                >
                  我知道了
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
