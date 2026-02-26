import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeChat } from '../../context/WeChatContext'
import { useOS } from '../../context/OSContext'
import AppHeader from '../../components/AppHeader'

// ─── 分类 ─────────────────────────────────────────
const CATEGORIES = [
  { id: 'recommend', label: '首页推荐' },
  { id: 'beauty', label: '颜值' },
  { id: 'shopping', label: '带货' },
  { id: 'gaming', label: '电竞' },
  { id: 'talent', label: '才艺' },
  { id: 'outdoor', label: '户外' },
  { id: 'chat', label: '聊天' },
  { id: 'food', label: '美食' },
]

const CATEGORY_PROMPT_MAP: Record<string, string> = {
  recommend: '综合推荐（随机各种类型的主播，如颜值、才艺、游戏、聊天、户外等混合）',
  beauty: '颜值主播（好看的小哥哥小姐姐，互动聊天为主）',
  shopping: '带货主播（正在推荐商品、讲解产品、种草安利）',
  gaming: '电竞/游戏主播（正在打游戏或解说游戏）',
  talent: '才艺主播（唱歌、跳舞、乐器、画画等才艺表演）',
  outdoor: '户外主播（旅行、探店、街拍、自然风景直播）',
  chat: '聊天主播（陪聊、情感、深夜电台、树洞型直播）',
  food: '美食主播（吃播、做饭、探店、美食推荐）',
}

// ─── 头像 & 封面图片系统（日漫 + 动物 + 风景 混合） ──────────
// 渐变色做底色兜底
const GRADIENT_PAIRS = [
  ['#FF9A9E', '#FECFEF'], ['#A18CD1', '#FBC2EB'], ['#FAD0C4', '#FFD1FF'],
  ['#FFECD2', '#FCB69F'], ['#FF9A9E', '#FFDDE1'], ['#C2E9FB', '#A1C4FD'],
  ['#D4FC79', '#96E6A1'], ['#84FAB0', '#8FD3F4'], ['#A6C0FE', '#F68084'],
  ['#F093FB', '#F5576C'], ['#FA709A', '#FEE140'], ['#A8EDEA', '#FED6E3'],
  ['#E0C3FC', '#8EC5FC'], ['#FBC8D4', '#9795F0'], ['#667EEA', '#764BA2'],
]

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomGradient(): string {
  const pair = randomPick(GRADIENT_PAIRS)
  const angle = Math.floor(Math.random() * 360)
  return `linear-gradient(${angle}deg, ${pair[0]}, ${pair[1]})`
}

// 预取图片URL缓存（男性动漫为主，女性动漫+动物+风景混合）
let _husbandoCache: string[] = []
let _waifuCache: string[] = []
let _nekoCache: string[] = []
let _prefetchDone = false

async function prefetchImageUrls() {
  if (_prefetchDone) return
  _prefetchDone = true
  const grab = (url: string) => fetch(url).then(r => r.json()).catch(() => ({ results: [] }))
  try {
    const results = await Promise.all([
      grab('https://nekos.best/api/v2/husbando?amount=20'),
      grab('https://nekos.best/api/v2/husbando?amount=20'),
      grab('https://nekos.best/api/v2/husbando?amount=20'),
      grab('https://nekos.best/api/v2/husbando?amount=20'),
      grab('https://nekos.best/api/v2/husbando?amount=20'),
      grab('https://nekos.best/api/v2/waifu?amount=20'),
      grab('https://nekos.best/api/v2/neko?amount=20'),
    ])
    const toUrls = (r: any) => (r.results || []).map((x: any) => x.url)
    _husbandoCache = [...toUrls(results[0]), ...toUrls(results[1]), ...toUrls(results[2]), ...toUrls(results[3]), ...toUrls(results[4])]
    _waifuCache = toUrls(results[5])
    _nekoCache = toUrls(results[6])
  } catch { /* */ }
}

const CAT_URLS = Array.from({ length: 15 }, (_, i) => `https://placekitten.com/${200 + i * 5}/${200 + i * 5}`)

function generateAvatarUrl(): string {
  const r = Math.random()
  // 40% 男性动漫
  if (r < 0.4 && _husbandoCache.length > 0) return randomPick(_husbandoCache)
  // 15% 女性动漫
  if (r < 0.55 && (_waifuCache.length > 0 || _nekoCache.length > 0)) {
    const pool = [..._waifuCache, ..._nekoCache]
    return randomPick(pool)
  }
  // 20% 猫咪
  if (r < 0.75) return randomPick(CAT_URLS)
  // 10% 柴犬
  if (r < 0.85) return `https://cdn.shibe.online/shibes/${Math.floor(Math.random() * 100)}.jpg`
  // 15% 风景
  const seed = Math.random().toString(36).slice(2, 10)
  return `https://picsum.photos/seed/${seed}/128/128`
}

function generateCoverUrl(): string {
  const r = Math.random()
  // 45% 男性动漫做封面
  if (r < 0.45 && _husbandoCache.length > 0) return randomPick(_husbandoCache)
  // 20% 女性动漫
  if (r < 0.65 && (_waifuCache.length > 0 || _nekoCache.length > 0)) {
    return randomPick([..._waifuCache, ..._nekoCache])
  }
  // 35% 风景
  const seed = Math.random().toString(36).slice(2, 10)
  return `https://picsum.photos/seed/${seed}/400/500`
}

// ─── 类型 ─────────────────────────────────────────
export type LiveStreamer = {
  id: string
  name: string
  title: string
  viewers: number
  avatarUrl: string
  avatarGradient: string
  coverUrl: string
  category: string
  desc: string
  sceneText: string
}

// ─── Fallback 场景文本（小说旁白风格，每段至少300字） ────────────
const FALLBACK_SCENES: Record<string, string[]> = {
  recommend: [
    `镜头前的少女穿着奶白色oversize毛衣，双腿盘在椅子上，歪着头看弹幕。齐刘海下面一双圆溜溜的眼睛眨啊眨，睫毛又长又翘，鼻尖上有一颗小小的痣。

"哎你们说什么呢让我看看——"她凑近屏幕，鼻尖快碰到摄像头了，整个脸占满了画面。

桌上摆着半杯奶茶，吸管上还挂着一颗珍珠没掉下来。背后的LED灯带是淡粉色的，映得她白皙的皮肤泛着柔和的光。墙上贴了好几张polaroid照片，都是她和朋友的合照。

她突然笑出声："别骂了别骂了我知道我素颜丑。"然后伸手比了个心，手指纤细白净，指甲上涂了淡淡的裸粉色。

弹幕刷了一排"好可爱啊啊啊""素颜比我化妆好看""姐姐我可以"。

她看到弹幕一条一条念出来，念到搞笑的就仰头大笑，笑得毛衣领口都歪了。"你们太有意思了哈哈哈——"她用手背擦了擦笑出来的眼泪，"等会儿我给你们唱首歌好不好？刚学的。"

她从桌下拿出一个小音箱，调了调音量，房间里响起了轻轻的伴奏声。`,

    `主播戴着一副银框眼镜，黑色帽衫套头，看起来刚睡醒不久。头发有点乱，但那种慵懒感反而很好看。面前是三块屏幕，左边的在放比赛回放，中间是游戏画面，右边是弹幕。

"这波我觉得他不应该这么打，"他边说边用笔敲桌子，声音低沉有磁性，"你看这个走位，完全就是送——"

话没说完，游戏里突然被偷袭，屏幕一闪变成了灰色。他猛地坐直，眼镜差点甩飞出去："卧槽！"

弹幕里全是"哈哈哈哈笑死""说别人的时候自己也翻车了""经典解说翻车现场"。

他摘下眼镜揉了揉眼睛，无奈地笑了笑："行行行你们别刷了，这波确实是我的问题。"他端起旁边的马克杯喝了口水，杯子上印着一只柴犬的表情包。

"再来一把，这次认真打。"他重新戴好眼镜，手指在键盘上飞速敲击，鼠标精准地点击着每一个技能。房间里只开了屏幕的光，脸上忽明忽暗，很有电竞选手那种专注的氛围。`,

    `正在直播的是一对情侣，在厨房里手忙脚乱地做饭。女生围着围裙在切菜，围裙上印了一行字"今天也要好好吃饭"。男生在旁边试图颠锅结果差点把菜甩出去，鸡蛋飞到了灶台边上。

"你能不能别帮倒忙了——"女生无奈地看了他一眼，手上的刀没停。她扎着丸子头，碎发贴在额头上，因为厨房热气脸颊红扑扑的。

男生嬉皮笑脸地凑过来："我这不是想帮你嘛老婆。"他从身后环住她的腰。

"去去去手上有油别碰我！"她一胳膊肘怼过去，但嘴角是笑的。

弹幕都在刷"太真实了""这不就是我爸妈吗""单身狗受到暴击""柠檬精上线"。

锅里冒出的热气让镜头有点起雾，画面朦朦胧胧的反而特别有生活气息。厨房的窗台上摆了一盆小绿植，阳光从窗帘缝隙照进来，整个画面暖洋洋的。

男生最后还是乖乖去洗碗了，女生在锅前翻炒着，传来滋滋的响声和诱人的香气。`,
  ],
  beauty: [
    `女生坐在梳妆台前，长发披散着，穿了一件碎花吊带，锁骨上有一条很细的金色项链。她正在用美妆蛋拍粉底，一边拍一边对着镜头说话。

"今天教你们一个伪素颜妆，就是那种出门约会男朋友以为你没化妆但其实精致到每一根睫毛的那种。"

她笑着眨了一下眼，手上的动作没停。桌上摆了一排化妆品，每一样都码得整整齐齐，像是强迫症患者的桌面。

背景是暖色调的灯光，窗帘半拉着透进来午后的阳光，在她脸上投下柔和的光影。

"第一步先涂隔离——"她拿起一支粉管，"这个是我用了三支的老网红了，上脸就是奶油肌。"她在脸上点了几个点，然后用手指轻轻拍开。

"你们看这个遮瑕度，"她凑近镜头展示，皮肤确实看起来像开了磨皮滤镜一样细腻，"但是摸起来完全不厚重。"

弹幕在刷"求色号""姐妹你皮肤也太好了吧""学到了学到了"。

她看了一眼弹幕笑了："不是皮肤好，是灯光好啊哈哈哈——其实我今天有点过敏，脸颊这里红红的，等会儿遮一下你们就看不出来了。"`,

    `男生穿了一身黑色工装裤配白T，头发微卷，额前几缕碎发随意垂着。他正对着全身镜展示今天的穿搭，身材高挑，肩膀很宽。

"这条裤子是我前两天在vintage店淘的，才80块——"他转了个圈让大家看后面的设计，裤腿上有两条暗红色的车线。

背景音乐放着一首很chill的英文歌，房间很整洁，墙上挂着几幅潮牌海报和一面小镜子。衣架上整齐地挂着十几件外套，按颜色从浅到深排列。

"鞋子的话今天配了这双——"他抬起脚展示一双做旧的帆布鞋，"整体走一个日系工装的感觉。"

弹幕在刷"好帅""求裤子链接""这身太绝了""衣架子就是穿什么都好看"。

他挠了挠头有点不好意思地笑了："没有没有，主要是裤子选得好。"他从旁边的椅子上拿起一件卡其色的衬衫往身上一搭，"你们看加上这个衬衫当外套的话，又是另一种风格了。"

他走到窗边让自然光照一下整体效果，阳光把他的轮廓勾勒得很清晰。`,
  ],
  gaming: [
    `屏幕上是激烈的团战画面，特效满屏闪烁。主播的鼠标疯狂移动，左手在键盘上敲得啪啪响。他戴着头戴式耳机，黑色的，上面贴了一个小贴纸。

"打他打他别走别走——漂亮！"击杀提示弹出来的瞬间他猛拍了一下桌子，水杯差点翻了，晃了几下稳住了。

"兄弟们看到没，这波3杀直接翻盘。"他靠在椅背上，长舒一口气，端起水杯喝了口水。额头上有细密的汗，因为紧张的团战。

房间里只开了屏幕的光和背后一条蓝色LED灯带，脸上忽明忽暗，很有电竞选手那种氛围。桌面很整洁，除了键鼠和显示器，就只有一个手办和那杯水。

"行了这把稳了，经济领先两千了。"他活动了一下脖子，发出咔嚓几声，"大龙刷新之后我们直接打。"

弹幕在刷"太秀了""这操作我可以看十遍""主播什么段位""要不要开个语音教学"。

"教学？"他看了一眼弹幕笑了，露出一颗小虎牙，"我这水平教你们怕是要把你们带沟里去。"

说着游戏里又响起了交战的音效，他瞬间收起笑容，目光锐利地盯着屏幕，手指又开始飞速操作起来。`,

    `女生戴着猫耳耳机，粉色的，耳机两边的猫耳朵亮着呼吸灯。她穿着一件oversize的电竞战队T恤，领口大得露出一边肩膀。

她正在打一款手游，手指在屏幕上飞速滑动，偶尔发出短促的指令："跟我走""打龙""别浪了"。

"等一下等一下我先打完这波——"她皱着眉头，嘴唇微微抿着，表情特别认真。睫毛浓密又长，低头看手机的时候在脸颊上投下淡淡的阴影。

突然"Victory"的音效响了，她如释重负地往后一靠："终于赢了！这把打了20分钟我手都酸了。"

她晃了晃手腕，活动了一下手指，指甲上是亮闪闪的星星贴纸。房间里摆了好多手办和毛绒玩具，书架上还有几个游戏机和卡带。

弹幕在刷"姐姐好厉害""求带""这操作是真的猛""还是女孩子打游戏好看"。

"再来一把不？"她看着弹幕歪了歪头，然后拿起旁边的一杯冰美式喝了一口，"好吧那再打最后一把，打完就下播了，明天还要上课呢。"

她重新调整了一下坐姿，双腿盘在椅子上，又开始了新一局的匹配。`,
  ],
  talent: [
    `吉他斜挎在身上，他穿着一件白色亚麻衬衫，袖子挽到手肘。指尖按在琴弦上，指腹有薄薄的茧。

开始弹之前他调了调音，拨了几下弦，然后抬头看了一眼弹幕："好，这首《晴天》送给刚失恋的那位朋友——"

他轻轻笑了一下就低下头开始弹。旋律响起的瞬间弹幕安静了几秒，然后刷满了"好听""哭了""破防了"。

他的声音有点沙哑，低音部分很有磁性，高音的时候又很清亮。唱到副歌的时候他闭上了眼睛，眉头微微皱着，像是在回忆什么。

房间里只有一盏落地灯，暖黄色的光打在他侧脸上。背后的墙上挂着好几把不同款式的吉他，还有一些演出的照片。

"刮风这天——我试过握着你手——"他的声音在这句的时候轻了很多，几乎是气声在唱。

弹幕已经变成了"泪目""突然好想前任""主播嗓子好""单曲循环了"的刷屏。

唱完最后一个音他抬起头来，眼角似乎有一点点泛红。他清了清嗓子，笑了笑："好了伤心的歌唱完了，下一首来点开心的好不好？"他重新调了调弦，"那就来首《小幸运》吧。"`,

    `画板上已经画了大半幅水彩画，是一片薰衣草花海，紫色渐变得很梦幻。她换了一支更细的笔，蘸了一点紫色，仔细地描画花瓣的边缘。

"这个地方要用湿画法，颜色才会自然晕开——"她边画边讲解，语速不快，声音很温柔，像是在讲睡前故事。

她扎了一个低马尾，碎发垂在耳边，穿着一件沾了颜料的工作围裙，手上也有好几块干掉的颜料痕迹。

弹幕有人问"学画画多久了"，她想了想说"从小学三年级开始吧，十几年了。不过中间也有很长一段时间没画，最近才重新捡起来。"

她用清水洗了洗笔，在调色盘上混了一点白色和淡蓝色。"天空的部分要有层次感，不能直接涂一片蓝。"

她轻轻地在画纸上晕染开去，水彩在湿润的纸面上自然流动，形成了非常好看的渐变。

"哇——"弹幕里有人发出了感叹，"这也太好看了""手是什么神仙手""我也想学画画了"。

她笑了笑，继续专注地画着。桌上摆满了各种颜料管和画笔，窗外的夕阳正好照进来，给整个画面镀上了一层金色的光。`,
  ],
  shopping: [
    `"家人们看这个！"她举起一瓶精华液在镜头前晃了晃，双马尾跟着一起晃。她今天穿了一件玫红色的小西装，看起来特别精神。

"这个是我回购了第五瓶的，真的巨好用，不是我吹。"她按了一泵在手背上展示质地，镜头拉近。

"你们看这个流动性，像水一样但又不是水，有一点点黏稠度。上脸之后——"她往脸上拍了拍，"吸收超快，完全不会搓泥。"

背后是一整面货架，摆满了各种产品，每样东西上面都贴了彩色的价签和小标签。灯光打得特别亮，整个直播间像一个小型美妆柜台。

她语速很快但口齿清晰，每个产品的成分、功效、适合肤质都说得很清楚，一看就是做过功课的。

"现在下单前200名送同款的旅行装小样，两个！链接在购物车第一个，倒计时60秒开始抢——"

她助手在旁边举着一块倒计时牌子。弹幕疯狂刷"已拍""抢到了""手速不够""补货补货"。

"好的已经1000单了家人们！"她看了一眼后台数据，兴奋地拍了一下手，"那我再给大家加200份好不好？"直播间的在线人数蹭蹭地往上涨。`,
  ],
  outdoor: [
    `镜头在晃动，能看出主播正在走路。他穿着一件浅蓝色的防晒衣，戴了一顶渔夫帽，帽檐下面是一张被晒得健康黝黑的脸，笑起来露出一排白牙。

背景是一条老街，两边是古色古香的建筑，青砖灰瓦，屋檐下挂着红灯笼，已经被风吹得有些褪色了。

"你们看这家店，这个是手工做的桂花糕——"他把镜头对准了小摊，老板娘正在包糕点，手法利索得很。案板上铺着湿布，摆了一排模具。

他买了一块咬了一口，嚼了嚼，表情从惊讶变成享受："嗯！软软糯糯的超好吃！桂花味很浓，里面还有红豆沙。"

远处传来悠扬的二胡声，有个老人坐在巷子口拉琴。弹幕里有人说"我老家在这里""好怀念小时候""主播帮我买两盒寄给我"。

午后的阳光斜斜地照在青石板路上，石缝间长着一些小草。路边有只橘猫懒洋洋地躺在台阶上晒太阳，主播蹲下来撸了两下。

"这条街真的太有感觉了，"他边走边说，"你们闻不到，但空气里都是桂花的香味。"

前方拐角处是一家挂着手写招牌的茶馆，他推门进去，门上的风铃叮铃一声响了。`,
  ],
  chat: [
    `房间里只开了一盏小夜灯，暖黄色的光照亮了一小片区域。能看到一张布置得很温馨的书桌，上面摆了几本书和一个香薰蜡烛，正在燃烧，偶尔跳动一下。

主播的声音很轻很柔，像是怕吵到谁。她没有开摄像头，只有头像框亮着，头像是一朵小雏菊。

"今天有没有人想跟我聊聊？不开心的事说出来会好受一点。"

弹幕安静了一会儿，然后有人发了一条长消息，说自己失恋了，在一起三年的男朋友突然提的分手。

她安静地看完，声音更轻了："三年啊，那确实会很难过。你现在是什么感觉呢？"

对方说"感觉心里空了一块"。

"嗯，那是正常的。"她的声音很稳很温暖，"这种感觉可能会持续一段时间，但你不需要急着走出来。难过就难过吧，总比假装没事好。"

弹幕里有人发了个"抱抱"的表情，好几个人跟着发。也有人说"姐姐声音好治愈""每天睡前都来听你说话"。

窗外能隐约听到雨声，她似乎也注意到了："下雨了呢，正好适合发呆。你们有没有那种，下雨天特别容易想事情的时候？"

她翻了一页桌上的书，纸张沙沙的声音透过麦克风传过来。"那我给你们念一段书吧，今天在看的是《小王子》。"`,
  ],
  food: [
    `锅里的油已经烧热了，滋滋冒烟。他戴着一条深蓝色的围裙，袖子高高挽起，露出小麦色的手臂。

他把腌好的排骨一块一块放进去，"嗞啦——"一声，油花四溅，镜头上都溅了一点。

"小心小心不要被油溅到，"他往后退了一步，拿着锅铲翻了翻，动作很熟练。厨房里弥漫着蒜香味，案板上还摆着切好的葱花和姜片，码得整整齐齐。

"今天这道糖醋排骨是我奶奶教的配方，外面餐厅吃不到的那种味道。"他边炒边说，锅铲翻飞，排骨在锅里发出噼里啪啦的声音。

"现在加醋——"他倒了一圈醋，白烟腾地一下冒起来，醋酸味瞬间弥漫开来，"然后加糖，再来点酱油上色。"

弹幕已经疯了："深夜放毒""主播你赔我宵夜钱""我的减肥计划又泡汤了""已经开始咽口水了"。

他笑着看了一眼弹幕："你们忍一忍，马上就好了。"他收了汁，把排骨盛进盘子里，撒上白芝麻和葱花。

"来，镜头拉近你们看——"排骨表面裹着一层亮晶晶的酱汁，颜色红亮诱人，芝麻点缀其中。他用筷子夹了一块咬了一口，闭上眼享受了两秒："嗯~完美。"`,
  ],
}

function getRandomScene(category: string): string {
  const scenes = FALLBACK_SCENES[category] || FALLBACK_SCENES.recommend
  return scenes[Math.floor(Math.random() * scenes.length)]
}

// ─── 本地 fallback 生成 ───────────────────────────
const FALLBACK_PROFILES: Record<string, { name: string; title: string; desc: string }[]> = {
  recommend: [
    { name: '温柔刀', title: '深夜陪聊 声音很酥', desc: '低音炮男主播 听了会上瘾' },
    { name: '叶修同学', title: '实况解说翻车现场', desc: '游戏菜但嘴强 欢迎来怼' },
    { name: '南风知意', title: '今天给你们做饭', desc: '会做饭的男生 了解一下' },
    { name: '星河漫步', title: '随缘闲聊 来就是缘分', desc: '聊点有的没的 治愈系男声' },
    { name: '甜酱酱', title: '素颜唠嗑中~', desc: '奶茶控 每天不一样的我' },
    { name: '猫系男友', title: '深夜陪伴电台', desc: '安静的声音 陪你入睡' },
  ],
  beauty: [
    { name: '穿搭小王子', title: '80块vintage淘到宝', desc: '潮男穿搭 每日不重样' },
    { name: '氛围感少年', title: '男生护肤也很重要', desc: '干净清爽 精致男孩' },
    { name: '落日飞车', title: '今日穿搭mood', desc: '色彩搭配师 每天一个配色灵感' },
    { name: '颜值暴击', title: '侧脸杀练习中', desc: '镜头前的帅气瞬间' },
    { name: '仙女日记', title: '今日伪素颜妆教学', desc: '精致到睫毛但看起来没化' },
    { name: '白月光', title: '健身房穿搭分享', desc: '自律的男生最帅' },
  ],
  gaming: [
    { name: '叶修本修', title: '团战3杀翻盘时刻', desc: '荣耀战神 欢迎挑战' },
    { name: '午夜骑士', title: '零点开黑组队了', desc: '深夜场 菜鸟也欢迎' },
    { name: '稳如老狗', title: '排位晋级中别说话', desc: '认真打游戏 不认真聊天' },
    { name: '电竞男神', title: '教你上分系列', desc: '高段位教学 带你飞' },
    { name: '猫耳电竞', title: '打完这把就下播', desc: '可爱女孩打游戏 手残但快乐' },
    { name: '键盘侠本侠', title: '速通挑战第N次', desc: '失败N次但从不放弃' },
  ],
  talent: [
    { name: '沙哑少年', title: '吉他弹唱·晴天', desc: '一首歌 送给想念的人' },
    { name: '钢琴王子', title: '即兴弹奏BGM', desc: '点歌就弹 来挑战我的曲库' },
    { name: '墨香公子', title: '写一幅今日份书法', desc: '毛笔字修行 欢迎围观' },
    { name: '口琴旅人', title: '夕阳下的口琴声', desc: '用音乐记录每个地方' },
    { name: '水彩日落', title: '画一片薰衣草花海', desc: '画画十几年 安静地创作' },
    { name: '街舞少年', title: '新学了一段breaking', desc: '舞蹈生日常 燃起来' },
  ],
  shopping: [
    { name: '好物君', title: '今日限时秒杀', desc: '省钱攻略 不交智商税' },
    { name: '测评老哥', title: '开箱测评第100期', desc: '买了你不用买 替你踩雷' },
    { name: '成分党', title: '护肤品成分解析', desc: '理性种草 科学护肤' },
    { name: '种草姐姐', title: '回购五瓶的精华来了', desc: '只推自己用过的好物' },
    { name: '数码达人', title: '最新款手机测评', desc: '理工男的测评日常' },
    { name: '直播间甜心', title: '新品首发限量抢', desc: '手速比心速快' },
  ],
  outdoor: [
    { name: '古街浪子', title: '老街桂花糕太好吃了', desc: '一个人一条路 走到哪算哪' },
    { name: '骑行少年', title: '环湖骑行中', desc: '自行车+相机 这就够了' },
    { name: '探店小哥', title: '第88家宝藏小店', desc: '帮你们探出真正好吃的' },
    { name: '四季旅人', title: '自驾川藏线day7', desc: '人在路上 心在远方' },
    { name: '城市猎人', title: '藏在巷子里的咖啡馆', desc: '找到你不知道的好地方' },
    { name: '日出少年', title: '海边日出第一视角', desc: '每天用镜头记录风景' },
  ],
  chat: [
    { name: '深夜电台', title: '深夜树洞·说出来吧', desc: '低音炮 听你说 陪伴你' },
    { name: '晚安世界', title: '给你念段《小王子》', desc: '睡前故事 伴你入眠' },
    { name: '解忧杂货铺', title: '失恋了怎么办', desc: '情感急救 温柔接住每一个你' },
    { name: '月光邮局', title: '写给陌生人的信', desc: '用文字传递温暖' },
    { name: '安静的风', title: '不说话也可以待着', desc: '只是一个安静的直播间' },
    { name: '柠檬茶话会', title: '来聊点开心的', desc: '生活已经很苦了 来甜一下' },
  ],
  food: [
    { name: '排骨教主', title: '奶奶的糖醋排骨配方', desc: '家传味道 外面吃不到' },
    { name: '深夜食堂', title: '凌晨做一碗面', desc: '给加班的人 一碗热汤面' },
    { name: '甜品实验室', title: '草莓慕斯制作中', desc: '手残也能做出好看甜品' },
    { name: '吃货本货', title: '火锅吃播来了', desc: '一个人也要好好吃饭' },
    { name: '咖啡女孩', title: '手冲咖啡教学', desc: '每天一杯 从入门到入坑' },
    { name: '厨房翻车侠', title: '挑战做全席', desc: '可能成功也可能炸厨房' },
  ],
}

function generateFallbackStreamers(category: string): LiveStreamer[] {
  const profiles = FALLBACK_PROFILES[category] || FALLBACK_PROFILES.recommend
  const result: LiveStreamer[] = []
  for (let i = 0; i < 6; i++) {
    const p = profiles[i % profiles.length]
    result.push({
      id: `ls_${category}_${Date.now()}_${i}`,
      name: p.name, title: p.title,
      viewers: Math.floor(Math.random() * 8000) + 200,
      avatarUrl: generateAvatarUrl(),
      avatarGradient: randomGradient(),
      coverUrl: generateCoverUrl(),
      category, desc: p.desc,
      sceneText: getRandomScene(category),
    })
  }
  return result
}

function tryParseJSON(text: string): any {
  try { const m = text.match(/\[[\s\S]*\]/); if (m) return JSON.parse(m[0]) } catch { /* */ }
  try { return JSON.parse(text) } catch { /* */ }
  return null
}

// ─── sessionStorage 持久化 ───────────────────────
const SS_KEY_STREAMS = 'livestream_streams_cache'
const SS_KEY_CATEGORY = 'livestream_active_category'

function loadCachedStreams(): Record<string, LiveStreamer[]> | null {
  try {
    const raw = sessionStorage.getItem(SS_KEY_STREAMS)
    if (raw) {
      const parsed = JSON.parse(raw)
      const firstCat = Object.values(parsed)[0] as any[] | undefined
      if (firstCat?.[0] && !('avatarUrl' in firstCat[0])) return null
      return parsed
    }
  } catch { /* */ }
  return null
}

function saveCachedStreams(data: Record<string, LiveStreamer[]>) {
  try { sessionStorage.setItem(SS_KEY_STREAMS, JSON.stringify(data)) } catch { /* */ }
}

function loadCachedCategory(): string {
  return sessionStorage.getItem(SS_KEY_CATEGORY) || 'recommend'
}

function saveCachedCategory(cat: string) {
  try { sessionStorage.setItem(SS_KEY_CATEGORY, cat) } catch { /* */ }
}

// ─── 主组件 ──────────────────────────────────────
export default function LivestreamHome() {
  const navigate = useNavigate()
  const { livestreamCoins, walletBalance, exchangeWalletToCoins, myLivestreamProfile, followedStreamers } = useWeChat()
  const { callLLM } = useOS()

  useEffect(() => { prefetchImageUrls() }, [])

  const [activeCategory, setActiveCategory] = useState(loadCachedCategory)
  const [streams, setStreams] = useState<Record<string, LiveStreamer[]>>(() => {
    const cached = loadCachedStreams()
    if (cached && Object.keys(cached).length > 0) return cached
    const init: Record<string, LiveStreamer[]> = {}
    CATEGORIES.forEach(cat => { init[cat.id] = generateFallbackStreamers(cat.id) })
    saveCachedStreams(init)
    return init
  })
  const [loading, setLoading] = useState(false)
  const [showRecharge, setShowRecharge] = useState(false)
  const [rechargeAmount, setRechargeAmount] = useState('')
  const [activeTab, setActiveTab] = useState<'lobby' | 'me'>('lobby')

  const currentStreams = streams[activeCategory] || []

  const updateStreams = useCallback((updater: (prev: Record<string, LiveStreamer[]>) => Record<string, LiveStreamer[]>) => {
    setStreams(prev => {
      const next = updater(prev)
      saveCachedStreams(next)
      return next
    })
  }, [])

  const handleCategoryChange = useCallback((catId: string) => {
    setActiveCategory(catId)
    saveCachedCategory(catId)
  }, [])

  const handleRefresh = useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      const catLabel = CATEGORY_PROMPT_MAP[activeCategory] || '综合推荐'
      const prompt = `你是一个直播平台的内容生成器。请为「${catLabel}」分类生成6个虚拟主播的直播间信息。

要求：
- 每个主播有独特的昵称（2-5个字，有网感有个性，中文）、直播间标题（5-15字）、一句话简介（desc，10-20字）
- 昵称、标题、简介必须和直播内容一致匹配
- 【最重要】每个主播必须有一段"直播画面实况"(sceneText)，要求：
  · 像写小说旁白+对话一样，至少300字，写得越细越好
  · 详细描写主播此刻的外貌（长相、发型、肤色）、穿搭（具体衣服款式颜色）、表情、姿势、动作
  · 描写直播间的环境细节（灯光颜色、房间布局、桌上摆了什么、背景音乐等）
  · 必须包含主播说的多句台词（用引号括起来），以及弹幕互动的反应
  · 用户点进来时直播已经在进行中（不是开头），要有现场感
  · 注意换行，每2-3句话换一行，方便阅读
- 严格按以下JSON数组格式输出：
[{"name":"昵称","title":"直播标题","desc":"一句话简介","sceneText":"至少300字的直播画面实况"},...]
只输出6个，只输出JSON不要解释。`

      const res = await callLLM(
        [
          { role: 'system', content: '你是直播平台内容生成器，擅长写生动的场景描写。只输出JSON，不要解释。' },
          { role: 'user', content: prompt },
        ],
        undefined,
        { maxTokens: 6000, timeoutMs: 90000, temperature: 1.0 }
      )

      const parsed = tryParseJSON(res)
      if (Array.isArray(parsed) && parsed.length > 0) {
        const newStreams: LiveStreamer[] = parsed.slice(0, 6).map((item: any, i: number) => ({
          id: `ls_${activeCategory}_${Date.now()}_${i}`,
          name: String(item.name || '主播').slice(0, 8),
          title: String(item.title || '直播中').slice(0, 20),
          viewers: Math.floor(Math.random() * 8000) + 200,
          avatarUrl: generateAvatarUrl(),
          avatarGradient: randomGradient(),
          coverUrl: generateCoverUrl(),
          category: activeCategory,
          desc: String(item.desc || '').slice(0, 30),
          sceneText: String(item.sceneText || '').slice(0, 800) || getRandomScene(activeCategory),
        }))
        updateStreams(prev => ({ ...prev, [activeCategory]: newStreams }))
      } else {
        updateStreams(prev => ({ ...prev, [activeCategory]: generateFallbackStreamers(activeCategory) }))
      }
    } catch {
      updateStreams(prev => ({ ...prev, [activeCategory]: generateFallbackStreamers(activeCategory) }))
    } finally {
      setLoading(false)
    }
  }, [activeCategory, callLLM, loading, updateStreams])

  const handleRecharge = () => {
    const amount = parseInt(rechargeAmount)
    if (isNaN(amount) || amount <= 0) return
    if (exchangeWalletToCoins(amount)) { setRechargeAmount(''); setShowRecharge(false) }
  }

  return (
    <div className="relative h-full w-full bg-white flex flex-col">
      {/* 固定头部 */}
      <div className="flex-shrink-0 px-3 pt-1">
        <AppHeader
          title="直播大厅"
          onBack={() => navigate('/')}
          rightElement={
            <div className="flex items-center gap-2">
              {activeTab === 'lobby' && (
                <button type="button" onClick={handleRefresh} disabled={loading}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200 disabled:opacity-50">
                  <svg className={`w-4 h-4 text-gray-600 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
              <button type="button" onClick={() => setShowRecharge(true)}
                className="flex items-center gap-1 bg-gradient-to-r from-yellow-400 to-orange-400 text-white text-xs px-2.5 py-1 rounded-full font-medium shadow">
                <span>🪙</span><span>{livestreamCoins}</span>
              </button>
            </div>
          }
        />

        {activeTab === 'lobby' && (
          <div className="flex gap-1 overflow-x-auto hide-scrollbar pb-2">
            {CATEGORIES.map(cat => (
              <button key={cat.id} type="button" onClick={() => handleCategoryChange(cat.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  activeCategory === cat.id ? 'bg-pink-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                }`}>{cat.label}</button>
            ))}
          </div>
        )}
      </div>

      {activeTab === 'lobby' && loading && (
        <div className="flex-shrink-0 flex items-center justify-center py-2 gap-2">
          <div className="w-4 h-4 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-gray-400">正在刷新直播间...</span>
        </div>
      )}

      {activeTab === 'lobby' ? (
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-28">
          <div className="grid grid-cols-2 gap-2">
            {currentStreams.map(stream => (
              <button
                key={stream.id}
                type="button"
                onClick={() => {
                  const data = encodeURIComponent(JSON.stringify(stream))
                  navigate(`/apps/livestream/room/${stream.id}?mode=watch&data=${data}`)
                }}
                className="relative rounded-xl overflow-hidden aspect-[4/5] text-left active:scale-[0.97] transition-transform shadow-sm"
              >
                <div className="absolute inset-0" style={{ background: stream.avatarGradient }} />
                <img src={stream.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/60" />
                <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                  <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm animate-pulse">LIVE</span>
                  <span className="bg-black/40 text-white text-[9px] px-1 py-0.5 rounded-sm backdrop-blur-sm">
                    {stream.viewers > 1000 ? `${(stream.viewers / 1000).toFixed(1)}k` : stream.viewers}
                  </span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
                  <div className="text-white text-[11px] font-medium truncate leading-tight">{stream.title}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="w-5 h-5 rounded-full flex-shrink-0 overflow-hidden border border-white/30"
                      style={{ background: stream.avatarGradient }}>
                      <img src={stream.avatarUrl} alt="" className="w-full h-full object-cover"
                        loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    </div>
                    <span className="text-white/80 text-[10px] truncate">{stream.name}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-4 mb-2 flex justify-center">
            <button type="button" onClick={() => navigate('/apps/livestream/room/me?mode=host')}
              className="bg-gradient-to-r from-pink-500 to-red-500 text-white font-bold px-8 py-3 rounded-full shadow-lg shadow-pink-500/30 active:scale-95 transition-transform flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              我要开播
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50 pb-24">
          <div className="mx-3 mt-2 rounded-2xl overflow-hidden bg-white shadow-sm">
            <button
              type="button"
              onClick={() => navigate('/apps/livestream/me')}
              className="w-full text-left"
            >
              <div className="h-32 bg-gradient-to-r from-fuchsia-400 via-pink-400 to-orange-300 relative">
                {myLivestreamProfile.coverUrl && (
                  <img src={myLivestreamProfile.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                )}
                <div className="absolute inset-0 bg-black/20" />
                <div className="absolute left-1/2 -bottom-9 -translate-x-1/2 w-[72px] h-[72px] rounded-full overflow-hidden border-4 border-white bg-white shadow">
                  {myLivestreamProfile.avatarUrl ? (
                    <img src={myLivestreamProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white text-2xl">我</div>
                  )}
                </div>
              </div>
              <div className="pt-11 pb-4 px-4 text-center">
                <div className="text-[15px] font-semibold text-gray-900">我的主页</div>
                <div className="text-xs text-gray-500 mt-1">{myLivestreamProfile.signature || '这个人很懒，还没写签名。'}</div>
                <div className="text-xs text-pink-600 mt-2">粉丝 {myLivestreamProfile.followers}</div>
              </div>
            </button>
          </div>

          <div className="mx-3 mt-3 rounded-2xl bg-white p-3 shadow-sm">
            <div className="text-sm font-semibold text-gray-800 mb-2">近期动态</div>
            {myLivestreamProfile.recentPosts.length === 0 ? (
              <div className="text-xs text-gray-400 py-4 text-center">还没有动态，开播互动后会自动生成。</div>
            ) : (
              <div className="space-y-2">
                {myLivestreamProfile.recentPosts.slice(0, 3).map(post => (
                  <div key={post.id} className="rounded-xl bg-gray-50 px-3 py-2">
                    <div className="text-[12px] text-gray-700 whitespace-pre-wrap">{post.content}</div>
                    <div className="text-[10px] text-gray-400 mt-1">{new Date(post.timestamp).toLocaleString('zh-CN')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mx-3 mt-3 rounded-2xl bg-white p-3 shadow-sm">
            <div className="text-sm font-semibold text-gray-800 mb-2">我关注的人</div>
            {followedStreamers.length === 0 ? (
              <div className="text-xs text-gray-400 py-4 text-center">你还没有关注主播，先去直播大厅逛逛吧。</div>
            ) : (
              <div className="space-y-2">
                {followedStreamers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => navigate(`/apps/livestream/profile/${s.id}`)}
                    className="w-full flex items-center gap-2 rounded-xl bg-gray-50 p-2 text-left active:scale-[0.99]"
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200">
                      {s.avatarUrl ? <img src={s.avatarUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: s.avatarGradient }} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-gray-900 truncate">{s.name}</div>
                      <div className="text-[11px] text-gray-500 truncate">{s.signature || s.desc || '暂无签名'}</div>
                    </div>
                    <div className="text-[10px] text-pink-500">{s.posts.length}条动态</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mx-3 mt-3 mb-2">
            <button type="button" onClick={() => navigate('/apps/livestream/room/me?mode=host')}
              className="w-full bg-gradient-to-r from-pink-500 to-red-500 text-white font-bold px-4 py-3 rounded-xl shadow-lg shadow-pink-500/20 active:scale-[0.99] transition-transform">
              我要开播
            </button>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-black/10 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-[420px] h-14 flex items-center">
          <button
            type="button"
            onClick={() => setActiveTab('lobby')}
            className={`flex-1 h-full text-sm font-medium ${activeTab === 'lobby' ? 'text-pink-600' : 'text-gray-500'}`}
          >
            直播大厅
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('me')}
            className={`flex-1 h-full text-sm font-medium ${activeTab === 'me' ? 'text-pink-600' : 'text-gray-500'}`}
          >
            我的
          </button>
        </div>
      </div>

      {/* 充值弹窗 */}
      {showRecharge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-5 mx-6 w-full max-w-xs shadow-xl">
            <h3 className="text-center font-bold text-lg mb-1">充值直播币</h3>
            <p className="text-center text-gray-400 text-xs mb-4">1元 = 10直播币</p>
            <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
              <span>钱包余额</span><span className="font-medium text-gray-800">¥{walletBalance.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
              <span>当前直播币</span><span className="font-medium text-yellow-600">🪙 {livestreamCoins}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[10, 50, 100, 200, 500, 1000].map(v => (
                <button key={v} type="button" onClick={() => setRechargeAmount(String(v))}
                  className={`py-2 rounded-lg text-sm font-medium border transition-colors ${rechargeAmount === String(v) ? 'border-pink-400 bg-pink-50 text-pink-600' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>¥{v}</button>
              ))}
            </div>
            <input type="number" value={rechargeAmount} onChange={e => setRechargeAmount(e.target.value)}
              placeholder="自定义金额（元）" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-pink-400" />
            {rechargeAmount && parseInt(rechargeAmount) > 0 && (
              <p className="text-xs text-center text-gray-400 mb-3">将获得 <span className="text-yellow-600 font-medium">{parseInt(rechargeAmount) * 10}</span> 直播币</p>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={() => { setShowRecharge(false); setRechargeAmount('') }}
                className="flex-1 py-2.5 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium">取消</button>
              <button type="button" onClick={handleRecharge}
                disabled={!rechargeAmount || parseInt(rechargeAmount) <= 0 || parseInt(rechargeAmount) > walletBalance}
                className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-pink-500 to-red-500 text-white text-sm font-medium disabled:opacity-50">充值</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
