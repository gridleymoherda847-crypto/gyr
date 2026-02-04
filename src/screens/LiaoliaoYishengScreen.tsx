import { useEffect, useMemo, useRef, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { useOS, type Song } from '../context/OSContext'

// ============ 类型定义 ============

type StatKey = 'body' | 'root' | 'face' | 'luck'
type Stats = Record<StatKey, number>

type Realm = 'mortal' | 'qi' | 'foundation' | 'core' | 'nascent' | 'ascend'
const REALM_ORDER: Realm[] = ['mortal', 'qi', 'foundation', 'core', 'nascent', 'ascend']
const REALM_NAMES: Record<Realm, string> = {
  mortal: '凡人',
  qi: '练气',
  foundation: '筑基',
  core: '金丹',
  nascent: '元婴',
  ascend: '飞升',
}
const REALM_LIFESPAN: Record<Realm, number> = {
  mortal: 60,
  qi: 80,
  foundation: 100,
  core: 130,
  nascent: 160,
  ascend: 999,
}

type PersonRole = 'parent' | 'childhood' | 'master' | 'senior' | 'junior' | 'friend' | 'lover' | 'enemy' | 'demon_friend'
const ROLE_NAMES: Record<PersonRole, string> = {
  parent: '父母',
  childhood: '青梅竹马',
  master: '师父',
  senior: '师兄',
  junior: '师弟/妹',
  friend: '友人',
  lover: '道侣',
  enemy: '仇人',
  demon_friend: '妖族友人',
}

type Person = {
  id: string
  name: string
  gender: 'male' | 'female'
  role: PersonRole
  prevRole?: PersonRole // 成为道侣前的关系（用于回忆杀/解除关系）
  appearance: string
  personality: string
  race: 'human' | 'demon'
  beastTrait?: string | null // 妖/兽化形特征（耳/尾/发色等）
  realm: Realm
  age: number
  favor: number // 好感度 0~100
  affection: number // 心动值 0~100（仅在条件满足时增长）
  affectionLocked?: boolean // 与他人成婚后：心动锁定（变灰，不再增长/不再出暧昧）
  spouseName?: string | null // 与他人成婚对象名字（有则显示“有伴侣”）
  willWait?: boolean // 古风誓言：此生不再另许
  status: 'alive' | 'injured' | 'missing' | 'dead'
  flags: string[]
  isPastLover?: boolean // 前世爱人标记
}

// 物品定义
type ItemDef = {
  id: string
  name: string
  desc: string
  effect: (g: GameState) => GameState
}

function removeOneItem(g: GameState, itemName: string): GameState {
  const idx = g.items.indexOf(itemName)
  if (idx < 0) return g
  return { ...g, items: [...g.items.slice(0, idx), ...g.items.slice(idx + 1)] }
}

const ITEMS: Record<string, ItemDef> = {
  '聚灵丹': { id: '聚灵丹', name: '聚灵丹', desc: '服用后修为+15', effect: (g) => ({ ...g, cultivation: Math.min(100, g.cultivation + 15) }) },
  '太清仙露': { id: '太清仙露', name: '太清仙露', desc: '服用后修为+20（仙帝所赠）', effect: (g) => ({ ...g, cultivation: Math.min(100, g.cultivation + 20) }) },
  '延寿丹': { id: '延寿丹', name: '延寿丹', desc: '服用后大限+10岁（不避意外）', effect: (g) => addPlayerLifeBonusYears(g, 10) },
  '归元灵髓': { id: '归元灵髓', name: '归元灵髓', desc: '服用后修为+100（上限100）', effect: (g) => ({ ...g, cultivation: Math.min(100, g.cultivation + 100) }) },
  '培元丹': { id: '培元丹', name: '培元丹', desc: '服用后体魄+5', effect: (g) => ({ ...g, stats: { ...g.stats, body: Math.min(100, g.stats.body + 5) } }) },
  '洗髓丹': { id: '洗髓丹', name: '洗髓丹', desc: '服用后根骨+3', effect: (g) => ({ ...g, stats: { ...g.stats, root: Math.min(100, g.stats.root + 3) } }) },
  '驻颜丹': { id: '驻颜丹', name: '驻颜丹', desc: '服用后容貌+5', effect: (g) => ({ ...g, stats: { ...g.stats, face: Math.min(100, g.stats.face + 5) } }) },
  '机缘丹': { id: '机缘丹', name: '机缘丹', desc: '服用后机缘+5', effect: (g) => ({ ...g, stats: { ...g.stats, luck: Math.min(100, g.stats.luck + 5) } }) },
  // 幼年小机缘：更“小而多”，让10岁前不那么固定
  '启灵草': { id: '启灵草', name: '启灵草', desc: '服用后修为+6（幼年启灵）', effect: (g) => ({ ...g, cultivation: Math.min(100, g.cultivation + 6) }) },
  '小福符': { id: '小福符', name: '小福符', desc: '使用后机缘+4（随身的薄福）', effect: (g) => ({ ...g, stats: { ...g.stats, luck: Math.min(100, g.stats.luck + 4) } }) },
  '澄心露': { id: '澄心露', name: '澄心露', desc: '服用后根骨+2、体魄+1（安神定息）', effect: (g) => ({ ...g, stats: { ...g.stats, root: Math.min(100, g.stats.root + 2), body: Math.min(100, g.stats.body + 1) } }) },
  '忘情水': { id: '忘情水', name: '忘情水', desc: '不可自用：送给NPC后，TA的心动值归零', effect: (g) => g },
  '破境丹': { id: '破境丹', name: '破境丹', desc: '突破时成功率+20%（自动生效）', effect: (g) => g },
  '回天破境丹': { id: '回天破境丹', name: '回天破境丹', desc: '服用后突破成功率+10%', effect: (g) => ({ ...g, breakthroughBonus: clamp(g.breakthroughBonus + 10, 0, 100) }) },
  '护脉丹': { id: '护脉丹', name: '护脉丹', desc: '服用后体魄+5（救命后调养专用）', effect: (g) => ({ ...g, stats: { ...g.stats, body: Math.min(100, g.stats.body + 5) } }) },
  '引灵丹': { id: '引灵丹', name: '引灵丹', desc: '服用后修为+8', effect: (g) => ({ ...g, cultivation: Math.min(100, g.cultivation + 8) }) },
}

type EventOption = {
  id: string
  text: string
  picked: boolean
}

type CurrentEvent = {
  id: string
  title: string
  rawText: string // 含临时标记，用于分支解析
  text: string
  options: EventOption[]
  resolved: boolean
}

type GameState = {
  version: 1
  seed: number
  name: string
  gender: 'male' | 'female'
  age: number
  alive: boolean
  stats: Stats
  cultivation: number
  realm: Realm
  money: number
  sect: string | null
  relations: Person[]
  flags: string[]
  logs: string[]
  items: string[]
  currentEvent: CurrentEvent | null
  yearFlags: { explored: boolean; chattedIds: string[]; popup: null | { title: string; text: string } }
  hasPastLover: boolean // 本局是否已有前世爱人
  spouseId: string | null // 主角道侣（只能有一个）
  friendNames: string[] // 邀请好友名字池（仅复刻名字）
  usedFriendNames: string[] // 已被占用的好友名字（避免重复）
  lastEventId: string | null // 防止连续年刷同一事件
  treasureCd: number // 意外收获冷却（年）
  marketDemonCd: number // “坊市救下的小妖兽”偶发回礼冷却（年）
  breakthroughDrops: number // 已突破次数（用于基础成功率每次-20%）
  breakthroughBonus: number // 突破额外成功率加成（丹药等，0~100）
  pendingRescue: { id: string; cause: string }[] // 待处理的“濒死救人”队列（可连续弹出）
}

// ============ 常量数据 ============

const STORAGE_KEY = 'lp_xiuxian_v1'
const STORY_STORAGE_KEY = 'lp_xiuxian_stories_v1'

type SavedStory = {
  id: string
  createdAt: number
  title: string
  mode: 'life' | 'npc'
  npcLabel?: string
  text: string
}

const MALE_NAMES = [
  '清玄', '墨寒', '惜朝', '逸尘', '子画', '孤城', '无双', '无邪',
  '慕白', '云深', '墨渊', '夜华', '凌霄', '寒江', '青冥', '玄冰',
  '墨染', '寒山', '青衣', '孤星', '冷月', '霜华', '风吟', '剑心',
  '无尘', '清风', '明月', '长安', '萧寒', '叶凌', '楚天', '顾北',
  '沈南', '林西', '江东', '云舒', '紫霄', '流光', '辰逸', '夜辰',
]

const FEMALE_NAMES = [
  '若雪', '婉儿', '灵儿', '语嫣', '紫英', '青苗', '雪见', '紫萱',
  '月如', '云歌', '红衣', '小妹', '清浅', '素素', '浅浅', '白浅',
  '凤九', '成玉', '缈落', '司音', '阿离', '霜华', '雪落', '寒烟',
  '青黛', '如梦', '初雪', '落霞', '碧瑶', '雨萱', '诗韵', '梦琪',
]

const SURNAMES = [
  '林', '陈', '李', '张', '王', '刘', '周', '吴', '徐', '孙',
  '沈', '萧', '叶', '楚', '顾', '白', '苏', '江', '温', '蓝',
  '云', '墨', '夜', '凌', '风', '雪', '霜', '寒', '冷', '慕',
]

const MALE_APPEARANCES = [
  '剑眉星目，气质清冷',
  '温润如玉，笑容和煦',
  '面如冠玉，唇红齿白',
  '棱角分明，眼神凌厉',
  '俊美邪魅，勾人心魄',
  '清俊出尘，宛若谪仙',
  '英气逼人，身姿挺拔',
  '面容冷峻，不苟言笑',
  '眉目温柔，让人安心',
  '神秘莫测，深不可测',
  '病弱苍白，惹人心疼',
  '黑衣如墨，气质阴沉',
  '白衣胜雪，不染尘埃',
]

const MALE_APPEARANCES_AVG = [
  '眉眼端正，相貌平平',
  '衣着整洁，气质普通',
  '五官不算出挑，但耐看',
  '面容寻常，丢进人群也不显眼',
]

const MALE_APPEARANCES_UGLY = [
  '眉骨突兀，五官略显别扭',
  '皮肤粗糙，神情有些刻薄',
  '眼神游移，笑起来让人不太舒服',
  '相貌不佳，却偏偏很自信',
]

const FEMALE_APPEARANCES = [
  '倾国倾城，美若天仙',
  '清丽脱俗，不食人间烟火',
  '英姿飒爽，巾帼不让须眉',
  '温婉可人，笑靥如花',
  '冷若冰霜，拒人千里',
  '灵动可爱，古灵精怪',
  '端庄大气，雍容华贵',
  '病弱楚楚，惹人怜惜',
]

const FEMALE_APPEARANCES_AVG = [
  '眉眼清秀，相貌平平',
  '气质素净，站在旁人身侧也不突兀',
  '五官柔和，却不算惊艳',
  '面容寻常，胜在神态安稳',
]

const FEMALE_APPEARANCES_UGLY = [
  '五官略失协调，笑起来有些局促',
  '眉眼寡淡，神情尖刻时更显难亲近',
  '皮肤粗糙，风尘气重',
  '相貌不佳，却眼神很亮',
]

const PERSONALITIES = [
  '冷淡疏离', '温柔体贴', '腹黑狡诈', '毒舌傲娇', '闷骚内敛',
  '热情开朗', '阴沉多疑', '正直善良', '狠辣果断', '深情专一',
  '孤僻寡言', '话痨健谈', '神秘莫测', '高冷禁欲', '邪魅狂狷',
]

const SECTS = [
  { id: 'qingyun', name: '青云宗', desc: '正道第一，规矩严格' },
  { id: 'tianjian', name: '天剑门', desc: '以剑入道，剑修为主' },
  { id: 'luoxia', name: '落霞派', desc: '风景秀丽，功法阴柔' },
  { id: 'baicao', name: '百草谷', desc: '擅长丹药，医修聚集' },
]

const EXPLORE_PLACES = [
  { id: 'herb_valley', name: '百草谷', desc: '安全采药，低风险', risk: 0.1 },
  { id: 'snow_peak', name: '寒霜雪峰', desc: '冰属性灵草，可能遇雪妖', risk: 0.3 },
  { id: 'demon_mountain', name: '妖兽山脉', desc: '危险但收获大', risk: 0.5 },
  { id: 'ancient_ruins', name: '上古遗迹', desc: '极高风险，可能发大财或死', risk: 0.7 },
  { id: 'cliff_fall', name: '断崖边', desc: '一步踏空，万念俱灰（自尽）', risk: 1 },
]

// 互动对话文本（根据关系类型和好感度）
const CHAT_TEXTS: Record<PersonRole, { low: string[]; mid: string[]; high: string[] }> = {
  parent: {
    low: ['「最近修炼怎么样？」他/她看起来有些担心。', '「记得按时吃饭。」', '「外面危险，小心点。」'],
    mid: ['「爹娘永远支持你。」', '「有空多回来看看。」', '「你长大了，真好。」'],
    high: ['「不管发生什么，家永远在这里。」', '「看到你现在的样子，我们很欣慰。」', '「你是我们最大的骄傲。」'],
  },
  childhood: {
    low: ['「好久不见……」他有些拘谨。', '「你还好吗？」', '「我有时候会想起以前的事。」'],
    mid: ['「还记得小时候吗？」他笑了笑。', '「我一直都记得你。」', '「能再见到你真好。」', '「你变了很多，但眼睛还是和以前一样。」'],
    high: ['「我……一直在等你。」他的声音有些颤抖。', '「小时候我就想，以后一定要保护你。」', '「你知道吗，你是我最重要的人。」', '「能和你在一起，真好。」', '他没有说话，只是静静地看着你，眼神温柔。'],
  },
  master: {
    low: ['「嗯。」师父惜字如金。', '「多练功，少废话。」', '「去抄经。」'],
    mid: ['「你的资质还不错。」难得的夸奖。', '「为师对你有期望。」', '「有什么不懂的可以问。」'],
    high: ['「你是为师最得意的弟子。」', '「以后宗门就交给你了。」', '他少见地露出了微笑。', '「你让为师看到了希望。」'],
  },
  senior: {
    low: ['「嗯？找我有事？」他看起来有些冷淡。', '「说吧。」', '「……」他没有回应。'],
    mid: ['「小师妹，修炼还顺利吗？」', '「有什么困难可以跟我说。」', '「今天月色不错。」他若有所思地看着天空。', '「你比我当初强多了。」'],
    high: ['「你来了……」他的眼神柔和下来。', '「我一直在注意你。」', '「有你在，真好。」', '他轻轻握住了你的手。', '「以后，我会一直保护你。」', '「你知道我为什么总是对你特别吗？」'],
  },
  junior: {
    low: ['「师姐找我？」', '「有什么事吗？」', '他看起来有些拘束。'],
    mid: ['「师姐！」他开心地跑过来。', '「我今天突破了！」', '「师姐教我两招吧。」'],
    high: ['「师姐是我最敬佩的人。」', '「以后我一定会变得和师姐一样强。」', '「师姐，我……我想永远跟着你。」'],
  },
  friend: {
    low: ['「好久不见。」', '「最近怎么样？」', '他礼貌地点了点头。'],
    mid: ['「想你了，一起喝杯茶？」', '「有什么烦心事尽管说。」', '「你是我为数不多的朋友。」'],
    high: ['「能认识你是我的幸运。」', '「你是我最好的朋友。」', '「不管发生什么，我都站在你这边。」'],
  },
  lover: {
    low: ['「怎么了？」他看起来有些疲惫。', '「最近好忙……」', '气氛有些尴尬。'],
    mid: ['「想你了。」他轻声说。', '「今晚一起看月亮吗？」', '他牵起你的手，什么都没说。', '「你最近瘦了，要好好吃饭。」'],
    high: ['「你是我这辈子最重要的人。」', '「能遇见你，是我最大的幸运。」', '他从身后抱住你：「别离开我。」', '「下辈子，还要在一起。」', '「我会用一生来爱你。」', '他吻了吻你的额头，眼中满是温柔。'],
  },
  enemy: {
    low: ['「哼。」他冷冷地看了你一眼。', '「你还敢来找我？」', '「滚。」'],
    mid: ['「你到底想干什么？」', '「我们之间没什么好说的。」', '他警惕地盯着你。'],
    high: ['「……算了，旧事就让它过去吧。」', '「也许我们不必是敌人。」', '他叹了口气：「我累了。」'],
  },
  demon_friend: {
    low: ['「人类……」他有些警惕。', '「你找我做什么？」', '他的耳朵动了动，似乎在观察你。'],
    mid: ['「你真是个奇怪的人类。」他露出尖牙笑了。', '「想我了？」他凑近你。', '「你身上的味道很好闻。」', '「要摸我的尾巴吗？」他坏笑。'],
    high: ['「我不会让任何人伤害你。」他的眼神认真。', '「你是唯一让我想保护的人类。」', '他变回原形，用毛茸茸的身体蹭你。', '「留在我身边……永远。」', '「我可以为你做任何事。」'],
  },
}

// ===== 聊天分池：日常/含蓄/暧昧（大量随机文本）=====
type ChatStage = 'neutral' | 'subtle' | 'ambiguous'

const ROLE_CHAT_NEUTRAL: Record<PersonRole, { low: string[]; mid: string[]; high: string[] }> = {
  parent: CHAT_TEXTS.parent,
  childhood: {
    low: ['「好久不见。」他有些生疏地笑了笑。', '「你还记得村口那棵树吗？」', '「最近……还好吗？」'],
    mid: ['「小时候的事，我还记得。」', '「你走之后，我总觉得少了点什么。」', '「能再见到你，挺好的。」', '「我给你留了些旧物。」'],
    high: ['「这些年你辛苦了。」他轻声说。', '「你若需要帮忙，尽管开口。」', '「我会站在你这边。」', '他看着你，像把很多话都藏起来了。'],
  },
  master: {
    low: ['「修行贵在恒。」', '「少说话，多练功。」', '「去，把今日的功课做完。」', '「心浮则道不进。」'],
    mid: ['「你悟性不错。」', '「遇到瓶颈了？」他扫你一眼，「去把经卷再看三遍。」', '「为师不护短，但会护你命。」', '「别逞强。」'],
    high: ['「你比我想得更坚韧。」', '「你若走错一步，我会把你拉回来。」', '「你是为师亲手带出来的。」', '他把一枚玉简放到你掌心：「拿着。」'],
  },
  senior: {
    low: ['「嗯？找我有事？」', '「有话直说。」', '「别绕弯子。」', '他点头算作回应。'],
    mid: ['「修炼可还顺？」', '「别和那些人一般见识。」', '「今天练到哪一步了？」', '「我路过，顺便看看。」'],
    high: ['「你进步很快。」', '「我会在。」他淡淡道。', '「遇事别一个人扛。」', '「你若不想说，也没关系。」'],
  },
  junior: {
    low: ['「师姐找我？」', '「我、我没偷懒！」', '他有点紧张地站直。'],
    mid: ['「师姐！」他很开心。', '「我今天学会了一招！」', '「我给你带了吃的。」', '「你别总一个人。」'],
    high: ['「我想变得更强。」', '「师姐别受伤。」', '「有我在。」他认真得像要发誓。', '「我会努力追上你。」'],
  },
  friend: {
    low: ['「好久不见。」', '「近来可好？」', '「路上小心。」', '他礼貌地向你拱手。'],
    mid: ['「一起喝杯茶？」', '「你总是这么忙。」', '「我听到些风声，来提醒你。」', '「别太累。」'],
    high: ['「我信你。」', '「你若开口，我便来。」', '「这世上能让我放心交背后的人不多。」', '他笑了笑：「你算一个。」'],
  },
  lover: CHAT_TEXTS.lover,
  enemy: CHAT_TEXTS.enemy,
  demon_friend: {
    low: ['他尾巴轻轻一扫，警惕地看着你。', '「人类，你又想做什么？」', '他的耳朵动了动，像在听你心跳。'],
    mid: ['「你身上的灵息……很熟。」他微微皱眉。', '「别怕，我不吃人。」他哼了一声。', '他把斗篷扔给你：「冷就披上。」', '「你欠我一次。」'],
    high: ['他把尾巴收好，却还是露出一点耳尖。', '「你别离我太远。」', '「我会护着你。」他说得很慢，却很笃定。', '他低声道：「你是例外。」'],
  },
}

// 含蓄池：好感很高但心动未开启时（不越界）
const ROLE_CHAT_SUBTLE: Record<PersonRole, string[]> = {
  parent: ['「你长大了，走得也更远了。」', '「别忘了回家。」'],
  childhood: ['「你还是你。」他轻声说，「只是比小时候更亮了。」', '「我总觉得……你会回来。」', '他把一枚小小的东西塞给你：「别弄丢。」'],
  master: ['他看你一眼，移开视线：「……别逞强。」', '「今夜风大。」他把披风丢给你，「别冻着。」'],
  senior: ['他停顿很久：「路上小心。」', '「我不常夸人。」他低声道，「但你值得。」', '「你若回头，我在。」'],
  junior: ['「我不是孩子了。」他小声说，「我也能护你。」', '他把手背到身后：「……我只是想和你多待一会儿。」'],
  friend: ['「你别总一个人扛着。」', '「我不问缘由。」他笑了笑，「但我会站你这边。」'],
  lover: ['他把你发梢拨到耳后：「别着凉。」', '「我在。」他说得很轻。'],
  enemy: ['他沉默片刻：「……别死得太快。」', '「你若活着回来，我们再算账。」'],
  demon_friend: ['他耳尖微红，尾巴却藏不住地摇了一下。', '「你别靠太近……」他说着，却没退开。'],
}

// 暧昧池：只有心动>=60 或 前世/菀菀类卿/誓言 等特殊时才可用
const ROLE_CHAT_AMBIG: Record<PersonRole, string[]> = {
  parent: [],
  childhood: ['「我等你很久了。」他声音发颤。', '「小时候我就想……以后要把你护在身后。」', '他看着你，像把名字含在唇齿间。'],
  master: ['他低声道：「你要我怎么放手？」', '「你若走，我便不留；可你若回头……」他停住。'],
  senior: ['「你知道我为何总对你偏心吗？」', '他握住你的手腕，又像被烫到似的松开。', '「别离我太远。」'],
  junior: ['「我想成为能让你依靠的人。」', '他红着眼：「你别不要我。」'],
  friend: ['「若我说……我不只想做朋友呢？」', '他轻声笑：「你总让我失控。」'],
  lover: ['他贴近你耳畔：「别躲。」', '「今夜别走。」', '他吻了吻你的额头，像落下一场雪。'],
  enemy: ['「我恨你……却也忘不掉你。」', '他冷笑：「你若敢喜欢别人——」后半句吞回去。'],
  demon_friend: ['他尾巴绕过你腕骨，低声道：「你是我的。」', '「想摸耳朵吗？」他笑得危险，却眼神温软。', '他靠近你：「我忍很久了。」'],
}

const PERSONALITY_CHAT_NEUTRAL: Record<string, string[]> = {
  '冷淡疏离': ['「嗯。」他应了一声，目光却没有离开你。', '他把话说得很少，却把伞往你这边偏了偏。', '「别做无谓的事。」'],
  '温柔体贴': ['他替你掸掉肩上的尘，语气很轻：「一路辛苦了。」', '「你累了就歇会儿。」他给你倒了杯热茶。', '他笑着听你说完，眼神很专注。'],
  '腹黑狡诈': ['他笑得意味深长：「你想要的，我都能给。」', '「别信旁人。」他靠近一步，「信我。」', '他轻轻敲了敲桌面：「你欠我一个解释。」'],
  '毒舌傲娇': ['「你怎么又把自己弄成这样？」他嘴硬，手却很稳地给你包扎。', '「哼。」他别开脸，「我只是路过。」', '「别给我丢脸。」'],
  '闷骚内敛': ['他沉默很久才开口：「……你没事就好。」', '他耳尖红了，却还故作镇定。', '「我不太会说。」他低声道，「但我在意。」'],
  '热情开朗': ['「走走走！」他拉你去看热闹。', '「你来了我就放心了！」', '「今天心情不错？」他眨眨眼。'],
  '深情专一': ['他看着你，像把所有情绪都藏进眼底。', '「你说什么我都信。」', '「我会一直在。」他说得很慢。'],
  '神秘莫测': ['「别问。」他笑，「时机到了你自然会懂。」', '「你身上的灵息……有些特别。」他低声道。', '他用指尖点了点你眉心：「记住我。」'],
  '高冷禁欲': ['「别胡闹。」他说得冷，却把你护在身后。', '「我没空。」他转身走了两步，又停下：「……晚点再说。」', '他垂眸：「别受伤。」'],
}

const PERSONALITY_CHAT_SUBTLE: Record<string, string[]> = {
  '冷淡疏离': ['他停顿很久：「……路上小心。」', '「别让我担心。」声音很轻。'],
  '温柔体贴': ['「你一笑，我就觉得这世道也没那么坏。」', '「我希望你被温柔以待。」'],
  '腹黑狡诈': ['「你若想躲，我可以替你遮风。」他笑得很轻。', '「你总会来找我。」他笃定。'],
  '毒舌傲娇': ['「你别误会。」他耳尖红了，「我只是……顺手。」', '「你要是敢不回来，我就……」他咬牙。'],
  '闷骚内敛': ['他把披风搭到你肩上：「……别冷。」', '「我想多看你一会儿。」他低声道。'],
  '热情开朗': ['「你陪我去就好了！」他笑得眼睛亮。', '「有你在，我就不怕。」'],
  '深情专一': ['「我不急。」他轻声说，「我等你。」', '「你回头，我就在。」'],
  '神秘莫测': ['「你若愿意，我可以把秘密给你。」', '他靠近一步又退开：「……算了。」'],
  '高冷禁欲': ['「……你别逞强。」他移开视线。', '「你若累了，就靠一下。」说完又补一句：「只一下。」'],
}

const PERSONALITY_CHAT_AMBIG: Record<string, string[]> = {
  '冷淡疏离': ['「别靠太近。」他说着，却没躲开。', '他看你很久：「……你知道你在做什么吗？」'],
  '温柔体贴': ['「我想把你藏起来。」他笑着说，却认真得可怕。', '「你别怕。」他低声，「我在。」'],
  '腹黑狡诈': ['「你逃不掉的。」他轻笑，指尖划过你掌心。', '「你越躲，我越想要。」'],
  '毒舌傲娇': ['「你别盯着我看！」他凶你一句，声音却发颤。', '「……你再这样，我会当真。」'],
  '闷骚内敛': ['他耳尖红得厉害：「……别看。」', '「我忍很久了。」他声音很低。'],
  '热情开朗': ['「我喜欢你！」他脱口而出，又立刻捂住嘴。', '他笑得发烫：「你别走。」'],
  '深情专一': ['「你是我唯一的执念。」', '「这一生，我只想与你并肩。」'],
  '神秘莫测': ['「你若再靠近，我会失控。」他轻笑。', '「你是我唯一想改命的人。」'],
  '高冷禁欲': ['他把你挡在阴影里，声音哑：「别闹。」', '「你若再这么看我……」他停住。'],
}

const PERSONALITY_CHAT_MARRIED_AMBIG: Record<string, string[]> = {
  '冷淡疏离': ['他指尖碰了碰你袖口，声音很低：「别在别人面前这样。」', '「我已经成婚。」他说得冷静，目光却不肯放开你。'],
  '温柔体贴': ['他替你拢好衣领，轻声道：「我不该这样……可我忍不住想护着你。」', '「若早一点遇见你就好了。」他笑得很轻，像怕你听见。'],
  '腹黑狡诈': ['他贴近你耳侧，笑意很淡：「名分是别人的，心却未必。」', '「你猜？」他抚过你指尖，「我到底在等谁。」'],
  '毒舌傲娇': ['「别得意。」他嘴硬得很，眼神却软了，「我只是……不习惯你离我太远。」', '「我又没说不想见你。」他别开脸。'],
  '闷骚内敛': ['他压着嗓子：「……你别走。」说完自己先红了耳尖。', '「我会克制。」他喉结滚动，「但你别逼我。」'],
  '热情开朗': ['他笑着把情绪藏起来：「我没事……就是看到你，心有点乱。」', '「我以为我能放下。」他笑得发烫，「结果还是不行。」'],
  '深情专一': ['「我等了太久。」他说，「就算你不选我，我也还是想靠近你。」', '「我会守规矩。」他看着你，「可我心不听话。」'],
  '神秘莫测': ['他看你一眼，像把所有不该说的话都吞回去：「你别问。」', '「这世上有些结，是解不开的。」他轻轻笑。'],
  '高冷禁欲': ['他低声道：「……我不该碰你。」却还是把你挡在身后。', '「离我远点。」他冷冷说，指尖却微微颤。'],
}

function getChatStage(_g: GameState, p: Person): ChatStage {
  if (p.role === 'parent') return 'neutral'
  if (p.role === 'lover') return 'ambiguous'
  if (p.isPastLover) return 'ambiguous'
  // 与他人成婚：心动锁定，不再出现暧昧阶段
  if (isMarriedToOther(p) || p.affectionLocked) return 'neutral'
  if (p.affection >= 60) return 'ambiguous'
  if (p.favor >= 90 && p.affection <= 0) return 'subtle'
  return 'neutral'
}

const CHILD_TREAT_AS_KID: Record<PersonRole, string[]> = {
  parent: ['「慢慢来，不急。」', '「今天有没有乖乖吃饭？」', '「别跑太远。」'],
  childhood: ['「走，我们去掏鸟窝。」', '「给你糖。」', '「你别怕，我在呢。」'],
  master: ['「小孩就该按规矩来。」', '「先把基础练稳。」', '「不许胡闹。」'],
  senior: ['「小师妹，慢点走。」', '「别逞强，摔了要哭的。」', '「我带你去熟悉路。」'],
  junior: ['「师姐，给你这个！」', '「我们一起玩吧！」', '「你别嫌我烦。」'],
  friend: ['「小家伙，别一个人乱跑。」', '「想吃糖吗？」', '「走，带你看热闹。」'],
  lover: ['「别闹。」他轻轻敲你额头。', '「乖。」', '「小心别摔。」'],
  enemy: ['「小孩别挡路。」', '「回家去。」', '他哼了一声，没再为难你。'],
  demon_friend: ['他用尾巴把你往身后轻轻一挡。', '「小不点，别靠近。」', '「别怕，我不伤你。」'],
}

function pickOneUnique(rng: ReturnType<typeof makeRng>, arr: string[], fallback: string) {
  const uniq = Array.from(new Set(arr.filter(Boolean)))
  return uniq.length ? rng.pickOne(uniq) : fallback
}

function getChatText(rng: ReturnType<typeof makeRng>, g: GameState, p: Person): string {
  // 主角14岁前：除前世线外，一律按“小朋友”对待，杜绝暧昧
  if (g.age < 14 && !p.isPastLover) {
    const kidPool = CHILD_TREAT_AS_KID[p.role] || ['「……」']
    let line = pickOneUnique(rng, kidPool, '「……」')
    if (p.race === 'demon' && rng.chance(0.25)) {
      const tiny = ['他的耳尖轻轻动了一下。', '尾巴扫过地面，像在警戒。', '他把你挡在身后。']
      line = line + ' ' + rng.pickOne(tiny)
    }
    return line
  }

  const stage = getChatStage(g, p)
  const favorLevel = p.favor >= 60 ? 'high' : p.favor >= 20 ? 'mid' : 'low'
  const rolePoolNeutral = ROLE_CHAT_NEUTRAL[p.role]?.[favorLevel] || ['「……」']
  const rolePoolSubtle = ROLE_CHAT_SUBTLE[p.role] || []
  const rolePoolAmbig = ROLE_CHAT_AMBIG[p.role] || []
  const perNeutral = PERSONALITY_CHAT_NEUTRAL[p.personality] || []
  const perSubtle = PERSONALITY_CHAT_SUBTLE[p.personality] || []
  const perAmbig = PERSONALITY_CHAT_AMBIG[p.personality] || []

  // 每次聊天只出“一段文本”（一句/一小段），避免连续堆很多句
  let line = ''
  if (stage === 'neutral') {
    line = pickOneUnique(rng, [...rolePoolNeutral, ...perNeutral], '「……」')
  } else if (stage === 'subtle') {
    line = pickOneUnique(rng, [...rolePoolNeutral, ...rolePoolSubtle, ...perSubtle], '「……」')
  } else {
    // 已与他人成婚：心动>60时，暧昧更“压着”——走婚后暧昧池
    if ((isMarriedToOther(p) || p.affectionLocked) && (p.affection || 0) >= 60 && rng.chance(0.65)) {
      const marriedPool = PERSONALITY_CHAT_MARRIED_AMBIG[p.personality] || []
      line = pickOneUnique(rng, [...marriedPool, ...rolePoolAmbig, ...perAmbig], '「……」')
    } else {
      line = pickOneUnique(rng, [...rolePoolNeutral, ...rolePoolAmbig, ...perAmbig], '「……」')
    }
    // 暧昧阶段才允许出现“心动氛围句”
    if (rng.chance(0.25) && AFFECTION_TEXTS.length > 0) {
      const extra = rng.pickOne(AFFECTION_TEXTS)
      if (extra !== line) line = `${line}\n${extra}`
    }
  }
  // 妖/兽化形：轻微兽性细节（仍算同一段）
  if (p.race === 'demon' && rng.chance(0.25)) {
    const beastHabits = [
      '他的耳尖轻轻抖了一下，又很快装作无事。',
      '尾巴不受控地扫过衣摆，像在泄露情绪。',
      '他下意识护住你的手腕，像护住领地。',
      '他的瞳色在灯下微微一变，又恢复如常。',
    ]
    const extra = rng.pickOne(beastHabits)
    if (extra !== line) line = `${line}\n${extra}`
  }
  return applyGenderToLine(line, p)
}

// 心动值相关的额外台词（心动>50时可能出现）
const AFFECTION_TEXTS = [
  '他的目光在你身上停留了很久。',
  '他好像有话想说，但最终只是轻轻叹了口气。',
  '「你……今天很好看。」他移开视线。',
  '他的耳尖红了。',
  '「没什么，就是想看看你。」',
  '他假装不经意地靠近了一点。',
  '「最近总是会想起你。」他小声说。',
  '他注视你的眼神，温柔得像要融化。',
  '「如果……我是说如果……」他欲言又止。',
  '你感觉他的心跳加速了。',
]

// 转世重逢特殊台词（isPastLover为true时可能触发）
const PAST_LOVER_TEXTS = [
  '「……你身上有一种很熟悉的气息。」他看着你，眼神复杂。',
  '「我们以前……是不是见过？」他皱着眉，像在回忆什么。',
  '「奇怪，第一次见你，却像认识了很久。」',
  '他看着你出神，忽然眼眶微红：「对不起……你让我想起一个人。」',
  '「那个人……曾与我并肩很久。」他的声音有些哑。',
  '「我送走过一个很重要的人。」他望向远处，「后来我等了很久。」',
  '「若这世真有轮回……」他苦笑一声，「我大概是个不肯放手的。」',
  '他指尖停在半空，终究没有碰到你：「像，又不像。」',
  '「别误会。」他低声说，「我只是……怕再错过一次。」',
  '他轻轻叹气：「能再遇见你，就够了。」',
]

// 根据性格的额外台词修饰
const PERSONALITY_MODIFIERS: Record<string, string[]> = {
  '冷淡疏离': ['他的表情依旧淡漠。', '他没有多说什么。', '气氛有些冷。'],
  '温柔体贴': ['他温柔地笑了。', '他的声音很轻柔。', '他递给你一杯热茶。'],
  '腹黑狡诈': ['他意味深长地笑了。', '你总觉得他话里有话。', '他的眼神让你捉摸不透。'],
  '毒舌傲娇': ['他别过头：「才、才不是特意来找你的！」', '「哼，算你走运。」', '他嘴上说着嫌弃，却没有离开。'],
  '闷骚内敛': ['他的耳朵红了，但表情没变。', '他沉默了很久才开口。', '你注意到他的手在微微发抖。'],
  '热情开朗': ['他笑得很灿烂。', '「太好了！你来找我！」', '他热情地拉住你的手。'],
  '深情专一': ['他的眼中只有你。', '「你是我唯一在乎的人。」', '他握紧了你的手。'],
  '神秘莫测': ['他露出一个意味深长的微笑。', '「有些事……时机到了你就会知道。」', '他的眼神深不可测。'],
  '高冷禁欲': ['他的表情一如既往地冷淡。', '但你注意到他的目光柔和了一瞬。', '「……嗯。」'],
}

// 满好感表白台词（按性格）
const CONFESSION_TEXTS: Record<string, string[]> = {
  '温柔体贴': [
    '「我曾见过山川日月，走过万里风霜……可当我闭上眼，心里只有你的模样。」',
    '「你我相逢不过数载，却像前生早已相识。我……想把余生都交给你。」',
  ],
  '高冷禁欲': [
    '他沉默良久，才低声道：「……我不擅言辞。但我想要你。」',
    '「我从不做无谓之事。」他看着你，「等你一句话。」',
  ],
  '毒舌傲娇': [
    '「别、别误会！」他别过脸，「我才不是喜欢你……只是除了你，别人都入不了眼。」',
    '「哼，你若敢不要我，我就……」他咬牙，「算了。你爱怎样就怎样。」',
  ],
  '热情开朗': [
    '「我想了很久！」他笑得灿烂，「我喜欢你，想和你并肩走很久很久。」',
    '「我不想再装作只是朋友了。」他认真起来，「你愿不愿意……做我的道侣？」',
  ],
  '深情专一': [
    '「三千弱水，我只取一瓢。」他望着你，眼底尽是温柔，「此生唯你。」',
    '「我可以等你，等你慢慢喜欢我。」他轻声道，「但我更想现在就把你留在身边。」',
  ],
  '闷骚内敛': [
    '他耳尖微红，却仍固执地看着你：「……我不太会说。但我想与你一同走下去。」',
    '「从见你的那天起，我就没想过别人。」他声音很轻，「也不会再想。」',
  ],
  '神秘莫测': [
    '「我算过很多人的命，唯独算不出自己的。」他轻笑，「直到遇见你。」',
    '「你是我命里唯一的变数。」他靠近一步，「也是我唯一想要的答案。」',
  ],
}

const ROLE_CONFESSION_PREFIX: Record<PersonRole, string[]> = {
  parent: [''],
  childhood: ['「还记得小时候吗……」', '「我从很早就……」'],
  master: ['「为师不该如此。」', '「我本不该动情。」'],
  senior: ['「我一直把你当作需要护着的人。」', '「从你入门那天起。」'],
  junior: ['「师姐……我忍了很久。」', '「我知道我不配。」'],
  friend: ['「我本以为我们只会是朋友。」', '「我原想把这份心思藏一辈子。」'],
  lover: ['「道侣之约已立。」', '「我更想把你抱紧。」'],
  enemy: ['「我恨你。」', '「我本该与你为敌。」'],
  demon_friend: ['「人修与妖，本不该。」', '「我知道我们站在对立面。」'],
}

function pickConfessionLine(rng: ReturnType<typeof makeRng>, p: Person): string {
  const per = pickByPersonality(rng, p.personality, CONFESSION_TEXTS, GENERIC_CONFESSION)
  const prefixPool = ROLE_CONFESSION_PREFIX[p.role] && ROLE_CONFESSION_PREFIX[p.role].length ? ROLE_CONFESSION_PREFIX[p.role] : ['']
  const prefix = rng.pickOne(prefixPool)
  const merged = prefix ? `${prefix}\n${per}` : per
  return applyGenderToLine(merged, p)
}

// “此心系君”的古风誓言（按性格）
const VOW_TEXTS: Record<string, string[]> = {
  '温柔体贴': [
    '「我不求你此刻应我，只愿你记得——此心既系君，便不再另许。」',
    '「若你不愿，我便不扰。但我会在你回首之处，守你一盏灯。」',
  ],
  '高冷禁欲': [
    '「我不说诺言。」他低声道，「但我会用余生证明。」',
    '「你若不选我，我便不娶。」他说得极轻，却像誓言落地。',
  ],
  '毒舌傲娇': [
    '「谁、谁稀罕！」他咬牙，却又低声补了一句：「……可我也不会再看别人。」',
    '「你爱来不来。」他转身就走，声音闷闷的：「反正我会等。」',
  ],
  '热情开朗': [
    '「我不想把你让给任何人。」他认真道，「我会一直在——直到你愿意。」',
    '「我认定你了。」他笑，却带着固执，「此后不论风雪，我都等你。」',
  ],
  '深情专一': [
    '「纵使红尘万丈，我心中也只你一人。」他看着你，「此生不改。」',
    '「你若不来，我便不老。」他轻声道，「我愿等到你回头。」',
  ],
  '闷骚内敛': [
    '他沉默很久，才开口：「……我会等你。」短短四字，却字字滚烫。',
    '「我不擅长争。」他说，「可我也不会退。」',
  ],
  '神秘莫测': [
    '「我能看见许多结局。」他微笑，「可我只想走向你。」',
    '「命数若要我放手，我偏不。」他低声道，「此心系你。」',
  ],
}

const GENERIC_CONFESSION = [
  '「我喜欢你。」他看着你，像是终于下定决心，「你愿不愿意……与我结为道侣？」',
  '他把一枚玉佩放到你掌心：「不是礼物，是心意。你若收下，我便不再放手。」',
]

const GENERIC_VOW = [
  '「我不求你此刻答我。」他轻声道，「只愿你记得：此心既系君，便不再另许。」',
  '「你若不允，我便不扰。」他垂眸，「可我会一直等你。」',
]

function pickByPersonality(rng: ReturnType<typeof makeRng>, personality: string, table: Record<string, string[]>, fallback: string[]) {
  const list = table[personality]
  return rng.pickOne(list && list.length ? list : fallback)
}

// ===== NPC故事池（组合式生成，保证同一性格也不止一种故事）=====
const STORY_TRIGGERS = [
  '他喝了酒，眼神比平日更软。',
  '你们疯玩了一天，夜风把笑声吹散。',
  '节日灯火下，他忽然沉默。',
  '你们并肩夜归，脚步声在石阶上回响。',
  '他受了点伤，却笑着说没事。',
]

const STORY_CORES_BY_ROLE: Record<PersonRole, string[]> = {
  parent: [],
  childhood: [
    '「你走之后，我被迫懂事得很快。」他低声道，「可我最想的，还是那年你把糖塞进我掌心的温度。」',
    '「小时候我总觉得，长大就能护住你。」他笑了一下，「后来才发现，想护一个人，先要学会不怕失去。」',
    '「我也曾想过忘了你。」他垂眸，「可每次路过那条小溪，我都像看见你在笑。」',
  ],
  master: [
    '「我也曾有师父。」他盯着灯火良久，「他教我一句：心软者不配修仙。」',
    '「为师见过太多天才半途夭折。」他声音很冷，「所以我宁可你恨我，也不要你死。」',
    '「你以为修仙是登天？」他轻嗤，「不过是把人心拆开来，一寸寸看清。」',
  ],
  senior: [
    '「我第一次上山时，也像你这么小。」他望着远处，「那年冬天冻死了三个同门，没人替他们收尸。」',
    '「我曾以为，努力就能换来公平。」他自嘲一笑，「后来才知道，很多时候……只有命。」',
    '「别把宗门想得太干净。」他低声道，「你若想活得久，得学会挑路走。」',
  ],
  junior: [
    '「我小时候很怕黑。」他挠挠头，「后来发现，怕也没用，只能硬着头皮往前走。」',
    '「我想变强，不是为了逞能。」他认真道，「是因为我不想再眼睁睁看着人受伤。」',
    '「别人都说我没天赋。」他笑得有点苦，「可我至少……还有不放弃的本事。」',
  ],
  friend: [
    '「我不是一直都这样。」他轻声说，「只是有些事，教会了我别轻易相信。」',
    '「我走过很多地方。」他望向人潮，「越走越觉得，人心比妖更难猜。」',
    '「你知道吗？」他笑了笑，「我最怕的不是死，是没人在意我活过。」',
  ],
  lover: [
    '他低声道：「我不怕天劫，不怕刀剑……只怕你不在。」',
    '「我一直都在学。」他说，「学会怎么好好爱你。」',
  ],
  enemy: [
    '「你以为我天生与你为敌？」他冷笑，「若不是那一夜，我也不至于走到这一步。」',
    '「我不后悔恨你。」他声音发哑，「我只是后悔……曾经也信过你。」',
  ],
  demon_friend: [
    '他尾巴收得很紧，像怕你看见：「我第一次化形时，被人关在笼子里挑价。」',
    '「妖也会怕。」他低声道，「怕被剜丹，怕被当成皮毛，怕一觉醒来……没有名字。」',
    '他嗅了嗅风，笑得很淡：「你救过我一次，所以我把命还你。」',
  ],
}

const STORY_PERSONALITY_ADDONS: Record<string, string[]> = {
  '冷淡疏离': ['他把情绪压得很低，像不愿让你看见自己脆弱。', '他说完便沉默，指尖却轻轻发抖。'],
  '温柔体贴': ['他说到这里，替你把衣襟拢好，像怕你着凉。', '他笑着把痛说得很轻，却更让人心酸。'],
  '腹黑狡诈': ['他笑着讲，像在试探你会不会心软。', '他把真话藏进玩笑里。'],
  '毒舌傲娇': ['他嘴上嫌弃，却把你的手握得更紧。', '他骂得凶，眼神却温。'],
  '闷骚内敛': ['他憋了很久，才把那句话说出口。', '他的耳尖红了，像把心事全露了。'],
  '热情开朗': ['他努力笑着讲完，笑意却藏不住一点点酸。', '他把悲伤说成笑话。'],
  '深情专一': ['他看着你，像把所有的信任都交出去。', '「只要你在，我就不怕。」他很轻地说。'],
  '神秘莫测': ['他的话像雾，听懂的人才会心疼。', '他说到一半，忽然停住，像怕你看穿。'],
  '高冷禁欲': ['他用最平静的语气讲最锋利的事。', '他移开视线，却把你挡在风里。'],
}

const STORY_ENDINGS = [
  '他说完，像是终于把一块石头放下。',
  '他笑了一下，却没把笑意落到眼底。',
  '风吹过，你忽然很想抱抱他。',
  '你听见自己心跳，像在替他疼。',
]

function generateNpcStory(rng: ReturnType<typeof makeRng>, p: Person): string {
  const trigger = rng.pickOne(STORY_TRIGGERS)
  const core = rng.pickOne(STORY_CORES_BY_ROLE[p.role] && STORY_CORES_BY_ROLE[p.role].length ? STORY_CORES_BY_ROLE[p.role] : STORY_CORES_BY_ROLE.friend)
  const addon = rng.pickOne(STORY_PERSONALITY_ADDONS[p.personality] || ['他沉默了一会儿。'])
  const ending = rng.pickOne(STORY_ENDINGS)
  const beastExtra = p.race === 'demon' && rng.chance(0.5) ? '他的尾巴轻轻垂下，像把最软的一面藏不住。' : ''
  return applyGenderToLine(`${trigger}\n${core}\n${addon}${beastExtra ? '\n' + beastExtra : ''}\n${ending}`, p)
}

function isAdultForRomance(p: Person) {
  return p.age >= 14
}

function isMarriedToOther(p: Person) {
  return !!p.spouseName
}

function hasAlivePlayerLover(g: GameState): boolean {
  if (!g.spouseId) return false
  const p = getRelationById(g, g.spouseId)
  return !!p && p.status === 'alive' && p.role === 'lover'
}

function clearPlayerLover(g: GameState, loverId: string, reason?: string): GameState {
  let next = g
  next = removeFlag(next, 'has_lover')
  next = removeFlag(next, `lover_id_${loverId}`)
  next = { ...next, spouseId: null }
  if (reason) next = { ...next, logs: pushLog(next, reason) }
  return next
}

function getPersonMaxLifespan(p: Person): number {
  const base = getMaxLifespan(p.realm)
  const extra = (hasPersonFlag(p, 'life_extended_10') ? 10 : 0) + getPersonLifeBonusYears(p)
  // 仙帝：不死（用于“容貌极高”的隐藏线）
  if (hasPersonFlag(p, 'immortal_emperor')) return 999999 + extra
  // 师父常常寿元极长：避免 300~600 岁直接“寿尽”
  if (p.role === 'master') return Math.max(base, 900) + extra
  // 妖族寿元偏长：用于妖王/化形线
  if (p.race === 'demon') return Math.max(base, 600) + extra
  return base + extra
}

function maybeApplyFriendCameo(rng: ReturnType<typeof makeRng>, g: GameState, p: Person): { g: GameState; p: Person } {
  if (!g.friendNames || g.friendNames.length === 0) return { g, p }
  if (p.role === 'parent') return { g, p }
  function splitSurnameGiven(full: string) {
    const surnames = [...SURNAMES].sort((a, b) => b.length - a.length)
    for (const s of surnames) {
      if (full.startsWith(s) && full.length > s.length) return { surname: s, given: full.slice(s.length) }
    }
    // 兜底：按首字分
    return { surname: full.slice(0, 1), given: full.slice(1) }
  }
  function inferGenderByGiven(full: string): 'male' | 'female' | null {
    const { given } = splitSurnameGiven(full)
    if (MALE_NAMES.includes(given)) return 'male'
    if (FEMALE_NAMES.includes(given)) return 'female'
    return null
  }

  const available = g.friendNames
    .filter(n => !g.usedFriendNames.includes(n))
    // 尽量避免名字与NPC性别明显不符（如男叫“婉儿”）
    .filter(n => {
      const inf = inferGenderByGiven(n)
      return inf ? inf === p.gender : true
    })
  if (available.length === 0) return { g, p }
  // 25% 概率把某个好友名字“复刻”到本NPC（只替换名字，不搬人设）
  if (!rng.chance(0.25)) return { g, p }
  const cameoName = rng.pickOne(available)
  const p2: Person = { ...p, name: cameoName, flags: [...(p.flags || []), 'cameo_friend_name'] }
  const g2: GameState = { ...g, usedFriendNames: [...g.usedFriendNames, cameoName] }
  return { g: g2, p: p2 }
}

function genderLabel(g: Person['gender']) {
  if (g === 'male') return '男'
  if (g === 'female') return '女'
  return '其他'
}

function canNpcMarryOtherThisYear(_g: GameState, p: Person): { ok: boolean; p: number } {
  if (p.role === 'parent') return { ok: false, p: 0 }
  if (p.status !== 'alive') return { ok: false, p: 0 }
  if (p.role === 'lover') return { ok: false, p: 0 } // 已与主角结为道侣
  if (isMarriedToOther(p)) return { ok: false, p: 0 }
  if (hasPersonFlag(p, 'immortal_emperor')) return { ok: false, p: 0 } // 仙帝不与旁人牵姻缘线
  if (p.willWait) return { ok: false, p: 0 }
  if (p.favor >= 100 && (p.affection || 0) >= 80) return { ok: false, p: 0 } // 一生不娶不嫁等你（已进入“等待”轨道）

  // 统一结婚概率：默认每年5%
  // 师父/高龄妖族仍按5%（不再更高），避免玩家完全没机会
  if (p.role === 'master') {
    return { ok: true, p: 0.05 }
  }

  // 高龄妖族/妖王：也设置为低概率（每年5%）
  if (p.race === 'demon' && p.age >= 120) {
    return { ok: true, p: 0.05 }
  }

  if (p.age < 22) return { ok: false, p: 0 }

  let prob = 0.05
  // 心动越高越不容易与他人成婚
  if ((p.affection || 0) >= 80) prob = 0.02
  if (p.favor >= 100) prob = Math.min(prob, 0.01)
  return { ok: true, p: prob }
}

// ============ 工具函数 ============

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function taByGender(g: Person['gender']) {
  return g === 'female' ? '她' : '他'
}

function ta(p: Pick<Person, 'gender'>) {
  return taByGender(p.gender)
}

function tade(p: Pick<Person, 'gender'>) {
  return (p.gender === 'female' ? '她' : '他') + '的'
}

function taByFlagGender(g: GameState, femaleFlag: string) {
  return hasFlag(g, femaleFlag) ? '她' : '他'
}

function getPersonFlagNumber(p: Person, prefix: string): number | null {
  const flags = p.flags || []
  let max: number | null = null
  for (const f of flags) {
    if (!f.startsWith(prefix)) continue
    const n = parseInt(f.slice(prefix.length), 10)
    if (!Number.isFinite(n)) continue
    max = max == null ? n : Math.max(max, n)
  }
  return max
}

function getConfessBlockUntil(p: Person): number {
  return getPersonFlagNumber(p, 'confess_block_until_') ?? 0
}

function applyRejectConfessPenalty(g: GameState, pid: string): GameState {
  const p = getRelationById(g, pid)
  if (!p) return g
  const cur = clamp(p.affection || 0, 0, 100)
  const reduced = Math.floor(cur * 0.7) // 拒绝表白：心动值-30%
  return updateRelation(g, pid, { affection: reduced })
}

function applyGenderToLine(line: string, p: Person): string {
  // 尽量只替换“作为代词的他”，避免把“其他/他们/他人”等词搞坏
  if (p.gender !== 'female') return line
  let s = line
  s = s.replace(/(^|[\n「」『』，。！？”\s])他的/g, '$1她的')
  s = s.replace(/(^|[\n「」『』，。！？”\s])他/g, '$1她')
  return s
}

function appendPopup(g: GameState, title: string, text: string): GameState {
  const cur = g.yearFlags.popup
  if (!cur) return { ...g, yearFlags: { ...g.yearFlags, popup: { title, text } } }
  const mergedTitle = cur.title === title ? title : '本年消息'
  const mergedText = `${cur.text}\n\n——\n\n【${title}】\n${text}`
  return { ...g, yearFlags: { ...g.yearFlags, popup: { title: mergedTitle, text: mergedText } } }
}

function loadSavedStories(): SavedStory[] {
  try {
    const raw = localStorage.getItem(STORY_STORAGE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveSavedStories(stories: SavedStory[]) {
  try {
    localStorage.setItem(STORY_STORAGE_KEY, JSON.stringify(stories))
  } catch { /* ignore */ }
}

function pickNarrativeStyle(kind: 'life' | 'npc'): '顺叙' | '倒叙' | '梦境' {
  // 生成故事要“每次都不一样”：不要用可复现seed；直接用真实随机
  // 且顺叙为主，倒叙次之，梦境极少（避免篇篇“开头一阵风”）
  const r = Math.random()
  if (kind === 'npc') {
    if (r < 0.75) return '顺叙'
    if (r < 0.97) return '倒叙'
    return '梦境'
  }
  if (r < 0.65) return '顺叙'
  if (r < 0.95) return '倒叙'
  return '梦境'
}

function parseLogAges(logs: string[]): { maxAge: number; minAge: number } {
  let min = Number.POSITIVE_INFINITY
  let max = 0
  for (const l of logs) {
    const m = l.match(/^【(\d+)岁】/)
    if (!m) continue
    const a = parseInt(m[1] || '0', 10)
    if (!Number.isFinite(a)) continue
    min = Math.min(min, a)
    max = Math.max(max, a)
  }
  if (!Number.isFinite(min)) min = 0
  return { minAge: min, maxAge: max }
}

function computePlayerAgeByLogIndex(logs: string[]): number[] {
  // pushLog：同一年后续行不再带【X岁】前缀，因此这里需要“继承”最近一次出现的年龄
  let cur = 0
  const ages: number[] = []
  for (const l of logs) {
    const m = l.match(/^【(\d+)岁】/)
    if (m) {
      const a = parseInt(m[1] || '0', 10)
      if (Number.isFinite(a)) cur = a
    }
    ages.push(cur)
  }
  return ages
}

function findNpcDeathInfo(logs: string[], npc: Person): { idx: number; playerAge: number; clue: string } | null {
  const ages = computePlayerAgeByLogIndex(logs)
  const name = npc.name
  const needles = [
    '噩耗传来',
    '死讯',
    '身陨',
    '魂飞魄散',
    '再也醒不过来',
    '再也没有回来',
    '去送了',
    '送走了',
  ]
  for (let i = 0; i < logs.length; i++) {
    const l = logs[i] || ''
    if (!l.includes(name)) continue
    if (!needles.some(k => l.includes(k))) continue
    const start = Math.max(0, i - 2)
    const end = Math.min(logs.length, i + 3)
    const clue = logs.slice(start, end).join('\n')
    return { idx: i, playerAge: ages[i] || 0, clue }
  }
  return null
}

function pickNpcKeySnippets(logs: string[], npc: Person, max = 36): { playerAge: number; text: string }[] {
  const ages = computePlayerAgeByLogIndex(logs)
  const name = npc.name
  const keywords = [
    '表白', '婉拒', '拒绝', '没有收下', '收下心意', '结为道侣', '道侣之约', '解除道侣',
    '此心系君', '等你', '誓言', '转世', '重逢',
    '噩耗传来', '死讯', '身陨', '魂飞魄散', '再也醒不过来', '再也没有回来', '送走', '送了',
    '忘情水',
  ]
  const picked: { playerAge: number; text: string }[] = []
  const seen = new Set<string>()
  function push(i: number) {
    const l = (logs[i] || '').trim()
    if (!l) return
    const key = `${ages[i] || 0}::${l}`
    if (seen.has(key)) return
    seen.add(key)
    picked.push({ playerAge: ages[i] || 0, text: l })
  }
  // 先保证“相遇开端”和“最后一次出现”在里面
  let firstIdx = -1
  let lastIdx = -1
  for (let i = 0; i < logs.length; i++) {
    if (logs[i] && logs[i].includes(name)) { firstIdx = i; break }
  }
  for (let i = logs.length - 1; i >= 0; i--) {
    if (logs[i] && logs[i].includes(name)) { lastIdx = i; break }
  }
  if (firstIdx >= 0) push(firstIdx)
  if (lastIdx >= 0 && lastIdx !== firstIdx) push(lastIdx)

  for (let i = 0; i < logs.length; i++) {
    const l = logs[i] || ''
    if (!l.includes(name)) continue
    if (!keywords.some(k => l.includes(k))) continue
    push(i)
    if (picked.length >= max) break
  }

  // 若仍不足：补一些“包含名字”的普通碎片（让故事不至于断裂）
  if (picked.length < Math.min(10, max)) {
    for (let i = 0; i < logs.length; i++) {
      const l = logs[i] || ''
      if (!l.includes(name)) continue
      push(i)
      if (picked.length >= Math.min(10, max)) break
    }
  }

  // 按在日志中的先后顺序输出（而不是按push顺序）
  const orderMap = new Map<string, number>()
  for (let i = 0; i < logs.length; i++) {
    const l = (logs[i] || '').trim()
    if (!l) continue
    orderMap.set(`${ages[i] || 0}::${l}`, i)
  }
  picked.sort((a, b) => (orderMap.get(`${a.playerAge}::${a.text}`) ?? 0) - (orderMap.get(`${b.playerAge}::${b.text}`) ?? 0))
  return picked.slice(0, max)
}

function buildNpcTimeAnchors(logs: string[], npc: Person): {
  meetAge: number | null
  rejectAges: number[]
  acceptAge: number | null
  vowAge: number | null
  deathAge: number | null
  deathClue: string | null
} {
  const ages = computePlayerAgeByLogIndex(logs)
  const name = npc.name
  let meetAge: number | null = null
  let acceptAge: number | null = null
  let vowAge: number | null = null
  const rejectAges: number[] = []
  for (let i = 0; i < logs.length; i++) {
    const l = logs[i] || ''
    if (!l.includes(name)) continue
    const a = ages[i] || 0
    if (meetAge == null) meetAge = a
    if (acceptAge == null && /结为道侣|你们结为道侣|从此，你们结为道侣/.test(l)) acceptAge = a
    if (/(心动-30%|至少三年后才会再提|此后，不再提及旁人|此心系君)/.test(l)) {
      if (vowAge == null && (l.includes('不再提及旁人') || l.includes('此心系君'))) vowAge = a
      if (l.includes('心动-30%') || l.includes('至少三年后才会再提')) rejectAges.push(a)
    }
    if (/你轻声拒绝|你没有收下|你婉转拒绝/.test(l)) rejectAges.push(a)
  }
  const death = findNpcDeathInfo(logs, npc)
  const deathAge = death ? death.playerAge : null
  const deathClue = death ? death.clue : null
  // 去重并排序
  const uniqReject = Array.from(new Set(rejectAges.filter(x => x > 0))).sort((a, b) => a - b)
  return { meetAge, rejectAges: uniqReject, acceptAge, vowAge, deathAge, deathClue }
}

function buildNpcEarlySceneHints(npc: Person | undefined, anchors: ReturnType<typeof buildNpcTimeAnchors> | null): string {
  if (!npc) return ''
  const meetAge = anchors?.meetAge
  const role = npc.prevRole || npc.role
  const hints: string[] = []
  if (role === 'childhood') {
    hints.push('写一段童年日常：村口/溪边/塞糖/抓鱼/摔倒背你回家，至少一个具体物件与一句对话。')
  } else if (role === 'master') {
    hints.push('写一段入门早期：你年幼时我收你为徒/第一次抄经/第一次练剑或打坐，我如何严厉或偏心。')
  } else if (role === 'senior' || role === 'junior') {
    hints.push('写一段同门早期：你初入门时的笨拙、练功房/台阶/饭堂的片段，我如何注意到你。')
  } else if (role === 'friend') {
    hints.push('写一段结识初期：一次并肩赶路或坊市相遇，至少一个共同经历的小插曲。')
  } else if (role === 'demon_friend') {
    hints.push('写一段妖缘初期：我为何对你心软/你如何不怕我，点到耳尾等细节但别浮夸。')
  }
  if (meetAge != null && meetAge > 0) {
    hints.push(`时间要求：上述“早期片段”必须发生在你${meetAge}岁附近或其后不久，且在任何表白/结契之前。`)
  } else {
    hints.push('时间要求：上述“早期片段”必须在任何表白/结契之前，且要占全文至少三分之一篇幅。')
  }
  return hints.length ? hints.map(x => `- ${x}`).join('\n') : ''
}

function makeDeathDetailText(g: GameState): string {
  // 这段是写给“日志/模型”的，必须明确：你在X岁那年死亡
  const realm = REALM_NAMES[g.realm]
  const tail = (g.logs || []).slice(-8).join('\n')
  const causeHint =
    /走火入魔|突破失败/.test(tail) ? '走火入魔' :
    /寿元耗尽|大限将至/.test(tail) ? '寿元耗尽' :
    /重伤|命悬一线|黑暗/.test(tail) ? '重伤不治' :
    '尘缘已尽'
  return `你在这一年真正明白：自己回不去了。\n你享年${g.age}岁，境界${realm}。\n死因：${causeHint}。\n你听见远处的风声，像有人在喊你的名字，又像只是幻觉。`
}

function killPlayer(g: GameState, reasonLine?: string, popupTitle: string = '人生落幕'): GameState {
  let next: GameState = { ...g, alive: false, currentEvent: null }
  if (reasonLine) next = { ...next, logs: pushLog(next, reasonLine) }
  const detail = makeDeathDetailText(next)
  next = { ...next, logs: pushLog(next, detail) }
  next = appendPopup(next, popupTitle, detail)
  return next
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard && (window as any)?.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fallthrough */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', 'true')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    ta.style.top = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return !!ok
  } catch {
    return false
  }
}

function roleLabelForLog(p: Person): string {
  if (hasPersonFlag(p, 'disciple_of_player')) return '徒弟'
  if (p.role === 'lover') {
    const prev = p.prevRole && p.prevRole !== 'lover' ? ROLE_NAMES[p.prevRole] : null
    return prev ? `${prev}/道侣` : '道侣'
  }
  return ROLE_NAMES[p.role] || '关系人'
}

function nameWithRole(p: Person): string {
  return `（${roleLabelForLog(p)}）${p.name}`
}

function getRescueGiftCount(p: Person): number {
  const flags = p.flags || []
  let max = 0
  for (const f of flags) {
    const m = f.match(/^rescue_gifts_(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1] || '0', 10))
  }
  return max
}

function incRescueGiftCount(g: GameState, id: string): GameState {
  const p = getRelationById(g, id)
  if (!p) return g
  const cur = getRescueGiftCount(p)
  return addPersonFlag(g, id, `rescue_gifts_${cur + 1}`)
}

function makeRescueCurrentEvent(g: GameState): CurrentEvent | null {
  const first = g.pendingRescue[0]
  if (!first) return null
  const p = getRelationById(g, first.id)
  if (!p) return null
  const rawText = `${first.cause}\n\n你可以尝试以自身为代价救${ta(p)}。\n代价：你的「健康/体魄」将降为1，此后每年都有猝死风险。`
  const hint = hasPersonFlag(p, 'life_extended_10') ? '' : '（以命续命：可为TA换取十年寿元，仅一次）'
  return {
    id: 'S950_rescue_npc',
    title: '生死抉择',
    rawText,
    text: rawText.replace(/\[[^\]]+\]/g, ''),
    options: [
      { id: 'save', text: `救${ta(p)}（体魄变为1）${hint}`, picked: false },
      { id: 'letgo', text: `送${ta(p)}最后一程`, picked: false },
    ],
    resolved: false,
  }
}

function randRelGain(rng: ReturnType<typeof makeRng>, min = 8, max = 15) {
  return rng.nextInt(min, max)
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeRng(seed: number) {
  const next = mulberry32(seed)
  return {
    nextFloat() { return next() },
    nextInt(min: number, max: number) {
      return Math.floor(next() * (max - min + 1)) + min
    },
    chance(p: number) { return next() < p },
    pickOne<T>(arr: T[]): T {
      return arr[Math.floor(next() * arr.length)]
    },
    shuffle<T>(arr: T[]): T[] {
      const result = [...arr]
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[result[i], result[j]] = [result[j], result[i]]
      }
      return result
    },
  }
}

function uuidLike(rng: ReturnType<typeof makeRng>) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += chars[rng.nextInt(0, chars.length - 1)]
  return `p_${Date.now()}_${s}`
}

function genName(rng: ReturnType<typeof makeRng>, gender: 'male' | 'female') {
  const surname = rng.pickOne(SURNAMES)
  const pool = gender === 'male' ? MALE_NAMES : FEMALE_NAMES
  return surname + rng.pickOne(pool)
}

function genNameWithSurname(rng: ReturnType<typeof makeRng>, gender: 'male' | 'female', surname: string) {
  const pool = gender === 'male' ? MALE_NAMES : FEMALE_NAMES
  return surname + rng.pickOne(pool)
}

function genAppearance(rng: ReturnType<typeof makeRng>, gender: 'male' | 'female') {
  // 60%：好看；20%：相貌平平；20%：较丑（仙帝/妖王等有专属外观，不走这里）
  const r = rng.nextFloat()
  if (gender === 'male') {
    if (r < 0.6) return rng.pickOne(MALE_APPEARANCES)
    if (r < 0.8) return rng.pickOne(MALE_APPEARANCES_AVG)
    return rng.pickOne(MALE_APPEARANCES_UGLY)
  }
  if (r < 0.6) return rng.pickOne(FEMALE_APPEARANCES)
  if (r < 0.8) return rng.pickOne(FEMALE_APPEARANCES_AVG)
  return rng.pickOne(FEMALE_APPEARANCES_UGLY)
}

const BEAST_TRAITS = [
  '雪白狐耳与一条蓬松长尾', '乌黑猫耳与细长尾巴', '灰蓝狼耳与短尾', '金色兽瞳与尾尖银光',
  '银白长发与一对尖耳', '柔软兽耳与两条尾巴', '尾巴偶尔不受控地摇动', '耳尖一红就藏不住',
]

function withBeastTrait(rng: ReturnType<typeof makeRng>, baseAppearance: string, forced?: string) {
  const trait = forced || rng.pickOne(BEAST_TRAITS)
  const extra = `（化形仍保留：${trait}）`
  return { appearance: `${baseAppearance}，${extra}`, beastTrait: trait }
}

function genPersonality(rng: ReturnType<typeof makeRng>) {
  return rng.pickOne(PERSONALITIES)
}

function createPerson(
  rng: ReturnType<typeof makeRng>,
  role: PersonRole,
  overrides?: Partial<Person>,
  canBePastLover: boolean = false // 是否可能是前世爱人
): Person {
  const gender = overrides?.gender ?? (rng.chance(0.5) ? 'male' : 'female')
  
  // 转世重逢：设定为“玩家上一世寿尽”，长生NPC孤独多年后寻到转世
  // 为避免违和：不出现在父母/青梅竹马/师弟等“天然偏同龄或更小”的身份上
  const canRollPastLover =
    canBePastLover &&
    role !== 'parent' &&
    role !== 'childhood' &&
    role !== 'junior'
  const isPastLover = canRollPastLover && rng.chance(0.08) // 8%概率
  
  // 心动值：初始为0，前世爱人例外
  const baseAffection = isPastLover ? rng.nextInt(60, 85) : 0
  const baseAppearance = overrides?.appearance ?? genAppearance(rng, gender)
  const basePersonality = overrides?.personality ?? genPersonality(rng)
  const baseRace = overrides?.race ?? 'human'
  const beastApplied = baseRace === 'demon'
    ? withBeastTrait(rng, baseAppearance, overrides?.beastTrait || undefined)
    : { appearance: baseAppearance, beastTrait: null as string | null }
  
  // 转世重逢对象通常是长生者：若未显式覆盖年龄/境界，则在这里给出更合理的默认值
  const defaultAge =
    overrides?.age != null
      ? overrides.age
      : isPastLover
        ? (role === 'master' ? rng.nextInt(300, 600) : baseRace === 'demon' ? rng.nextInt(180, 520) : rng.nextInt(160, 420))
        : 30
  const defaultRealm =
    overrides?.realm
      ? overrides.realm
      : isPastLover
        ? (role === 'master' || baseRace === 'demon' ? 'nascent' : 'core')
        : 'mortal'

  return {
    id: uuidLike(rng),
    name: genName(rng, gender),
    gender,
    role,
    prevRole: overrides?.prevRole,
    appearance: beastApplied.appearance,
    beastTrait: beastApplied.beastTrait,
    personality: basePersonality,
    race: baseRace,
    realm: defaultRealm,
    age: defaultAge,
    favor: isPastLover ? 100 : 0, // 前世今生：好感直接满
    affection: baseAffection,
    affectionLocked: false,
    spouseName: null,
    willWait: false,
    status: 'alive',
    flags: [],
    isPastLover,
    ...overrides,
  }
}

function pushLog(g: GameState, text: string): string[] {
  // 同一年内多条记录只在第一条标注年龄
  const agePrefixRe = /^【(\d+)岁】/
  let lastAge: number | null = null
  for (let i = g.logs.length - 1; i >= 0; i--) {
    const m = g.logs[i].match(agePrefixRe)
    if (m) { lastAge = parseInt(m[1]); break }
  }
  const line = lastAge === g.age ? text : `【${g.age}岁】${text}`
  const next = g.logs.length > 150 ? g.logs.slice(-150) : g.logs.slice()
  next.push(line)
  return next
}

function hasFlag(g: GameState, flag: string): boolean {
  return g.flags.includes(flag)
}

function addFlag(g: GameState, flag: string): GameState {
  if (g.flags.includes(flag)) return g
  return { ...g, flags: [...g.flags, flag] }
}

function removeFlag(g: GameState, flag: string): GameState {
  if (!g.flags.includes(flag)) return g
  return { ...g, flags: g.flags.filter(f => f !== flag) }
}

function removeFlagsByPrefix(flags: string[], prefix: string): string[] {
  return flags.filter(f => !f.startsWith(prefix))
}

function getGameFlagNumber(g: GameState, prefix: string): number | null {
  let max: number | null = null
  for (const f of g.flags || []) {
    if (!f.startsWith(prefix)) continue
    const n = parseInt(f.slice(prefix.length), 10)
    if (!Number.isFinite(n)) continue
    max = max == null ? n : Math.max(max, n)
  }
  return max
}

function getPlayerLifeBonusYears(g: GameState): number {
  return getGameFlagNumber(g, 'player_life_bonus_') ?? 0
}

function setPlayerLifeBonusYears(g: GameState, years: number): GameState {
  const cleaned = removeFlagsByPrefix(g.flags || [], 'player_life_bonus_')
  return { ...g, flags: [...cleaned, `player_life_bonus_${Math.max(0, Math.floor(years))}`] }
}

function addPlayerLifeBonusYears(g: GameState, delta: number): GameState {
  const cur = getPlayerLifeBonusYears(g)
  return setPlayerLifeBonusYears(g, cur + delta)
}

function getPersonLifeBonusYears(p: Person): number {
  return getPersonFlagNumber(p, 'life_bonus_') ?? 0
}

function setPersonLifeBonusYears(g: GameState, id: string, years: number): GameState {
  const p = getRelationById(g, id)
  if (!p) return g
  const flags = removeFlagsByPrefix(p.flags || [], 'life_bonus_')
  return updateRelation(g, id, { flags: [...flags, `life_bonus_${Math.max(0, Math.floor(years))}`] })
}

function addPersonLifeBonusYears(g: GameState, id: string, delta: number): GameState {
  const p = getRelationById(g, id)
  if (!p) return g
  const cur = getPersonLifeBonusYears(p)
  return setPersonLifeBonusYears(g, id, cur + delta)
}

function getRelation(g: GameState, role: PersonRole): Person | undefined {
  return g.relations.find(r => r.role === role && r.status === 'alive')
}

function getRelationById(g: GameState, id: string): Person | undefined {
  return g.relations.find(r => r.id === id)
}

function updateRelation(g: GameState, id: string, updates: Partial<Person>): GameState {
  return {
    ...g,
    relations: g.relations.map(r => r.id === id ? { ...r, ...updates } : r),
  }
}

function hasPersonFlag(p: Person | undefined, flag: string) {
  if (!p) return false
  return (p.flags || []).includes(flag)
}

function addPersonFlag(g: GameState, id: string, flag: string): GameState {
  const p = getRelationById(g, id)
  if (!p) return g
  if ((p.flags || []).includes(flag)) return g
  return updateRelation(g, id, { flags: [...(p.flags || []), flag] })
}

function addRelation(g: GameState, person: Person): GameState {
  return { ...g, relations: [...g.relations, person] }
}

function getMaxLifespan(realm: Realm): number {
  return REALM_LIFESPAN[realm]
}

function canBreakthrough(g: GameState): boolean {
  if (g.realm === 'ascend') return false
  return g.cultivation >= 100
}

function getNextRealm(realm: Realm): Realm | null {
  const idx = REALM_ORDER.indexOf(realm)
  if (idx < 0 || idx >= REALM_ORDER.length - 1) return null
  return REALM_ORDER[idx + 1]
}

function getRealmIdx(r: Realm) {
  return Math.max(0, REALM_ORDER.indexOf(r))
}

function getBreakthroughRate(g: GameState): number {
  // 基础：初始100%，每成功突破一次 -20%
  const base = clamp(1 - g.breakthroughDrops * 0.2, 0.05, 1)
  // 境界越高越难（按当前境界指数）
  const realmPenalty = clamp(1 - getRealmIdx(g.realm) * 0.08, 0.6, 1)
  // 属性带来的微小修正
  const statBoost = (g.stats.root / 800) + (g.stats.luck / 1200)
  const bonus = (g.breakthroughBonus || 0) / 100
  return clamp(base * realmPenalty + statBoost + bonus, 0.05, 1)
}

function getBreakthroughRateLabel(g: GameState): string {
  return `${Math.floor(getBreakthroughRate(g) * 100)}%`
}

function maybeTriggerEarlyCoreGenius(rng: ReturnType<typeof makeRng>, g: GameState, reached: Realm): GameState {
  if (reached !== 'core') return g
  if (g.age > 29) return g
  if (hasFlag(g, 'praised_genius')) return g
  // “同门”前提：需要已入宗门
  if (!hasFlag(g, 'in_sect') || !g.sect) return addFlag(g, 'praised_genius')

  let next = addFlag(g, 'praised_genius')

  const gender: 'male' | 'female' = next.gender === 'female' ? 'male' : 'female'
  const pers: Person['personality'] = rng.pickOne(['冷淡疏离', '毒舌傲娇', '高冷禁欲', '神秘莫测'] as const)
  const name = genName(rng, gender)
  const app = genAppearance(rng, gender)
  const age = clamp(next.age + rng.nextInt(-1, 6), 14, 120)
  const realm: Realm = rng.chance(0.7) ? 'foundation' : 'qi'
  const favor = -rng.nextInt(8, 22)
  let jealous = createPerson(
    rng,
    'senior',
    {
      name,
      gender,
      age,
      realm,
      favor,
      appearance: app,
      personality: pers,
      flags: ['jealous_genius'],
    },
    !next.hasPastLover
  )
  if (jealous.isPastLover) next = { ...next, hasPastLover: true }
  const cameo = maybeApplyFriendCameo(rng, next, jealous)
  next = cameo.g
  jealous = cameo.p
  next = addRelation(next, jealous)

  const text = `你在${next.sect}的名声一夜传开。\n有人说你是“天之才子”，二十余岁便结金丹，前途不可限量。\n可也有人在廊下冷冷看你一眼。\n「${jealous.name}」淡声道：「别得意。」\n那语气像雪，落在你肩上。\n从此，你的关系里多了一个“同门”。（好感${favor}）`
  next = { ...next, logs: pushLog(next, text) }
  next = appendPopup(next, '天之才子', text)
  return next
}

// ============ 事件系统 ============

type EventDef = {
  id: string
  title: string
  minAge: number
  maxAge: number
  condition: (g: GameState) => boolean
  weight: (g: GameState) => number
  text: (g: GameState, rng: ReturnType<typeof makeRng>) => string
  options: (g: GameState, rng: ReturnType<typeof makeRng>) => {
    id: string
    text: string
    effect: (g: GameState, rng: ReturnType<typeof makeRng>) => GameState
  }[]
}

function getEvents(): EventDef[] {
  return [
    // ===== 0岁：出生 =====
    {
      id: 'E000_birth',
      title: '呱呱坠地',
      minAge: 0, maxAge: 0,
      condition: () => true,
      weight: () => 100,
      text: (g, rng) => {
        const dad = g.relations.find(r => r.role === 'parent' && r.gender === 'male')
        const mom = g.relations.find(r => r.role === 'parent' && r.gender === 'female')
        
        // 随机家庭情况
        const familyTypes = [
          { type: 'poor', desc: '家境贫寒，住在破旧的茅屋里', money: 10 },
          { type: 'normal', desc: '家境普通，是个平凡的农户人家', money: 50 },
          { type: 'rich', desc: '家境殷实，父亲是个小商人', money: 150 },
          { type: 'cultivator', desc: '父亲曾是散修，虽已放弃修行，但家中尚有些积蓄', money: 100 },
        ]
        const family = rng.pickOne(familyTypes)
        
        // 随机出生地点
        const birthPlaces = [
          '偏远的小山村', '繁华城镇边的村落', '深山老林中的隐居地', 
          '大宗门附近的凡人镇', '灵气稀薄的荒原边缘',
        ]
        const birthPlace = rng.pickOne(birthPlaces)
        
        return `你出生在${birthPlace}。\n\n【家庭情况】\n${family.desc}。\n父亲「${dad?.name}」，${dad?.age}岁。\n母亲「${mom?.name}」，${mom?.age}岁。\n\n他们满怀希望地给你取名「${g.name}」。\n\n【初始属性】\n体魄：${g.stats.body} | 根骨：${g.stats.root} | 容貌：${g.stats.face} | 机缘：${g.stats.luck}\n灵石：${g.money}\n\n这个世界，灵气充沛，修仙者众。你的人生，才刚刚开始。\n[family_money:${family.money}]`
      },
      options: (g) => {
        const match = g.currentEvent?.rawText.match(/\[family_money:(\d+)\]/)
        const familyMoney = match ? parseInt(match[1]) : 50
        return [
          { id: 'cry', text: '哇哇大哭', effect: (g2) => {
            let next = { ...g2, stats: { ...g2.stats, body: g2.stats.body + 2 }, money: familyMoney }
            return { ...next, logs: pushLog(next, `你哭得很响亮，中气十足。\n（体魄+2，初始灵石：${familyMoney}）`) }
          }},
          { id: 'quiet', text: '安静地看着这个世界', effect: (g2) => {
            let next = { ...g2, stats: { ...g2.stats, root: g2.stats.root + 2 }, money: familyMoney }
            return { ...next, logs: pushLog(next, `你安静地睁开眼，仿佛在观察这个世界。\n（根骨+2，初始灵石：${familyMoney}）`) }
          }},
        ]
      },
    },

    // ===== 1-5岁：童年 =====
    {
      id: 'E010_childhood_play',
      title: '童年时光',
      minAge: 1, maxAge: 5,
      condition: (g) => !hasFlag(g, 'E010_done'),
      weight: () => 30,
      text: () => '你在村子里玩耍，无忧无虑的童年。',
      options: () => [
        { id: 'play', text: '到处跑着玩', effect: (g2) => {
          let next = { ...g2, stats: { ...g2.stats, body: g2.stats.body + 1 } }
          next = addFlag(next, 'E010_done')
          return { ...next, logs: pushLog(next, '你跑遍了整个村子，身体越来越结实。') }
        }},
        { id: 'read', text: '缠着父母讲修仙的故事', effect: (g2) => {
          let next = { ...g2, stats: { ...g2.stats, root: g2.stats.root + 1 } }
          next = addFlag(next, 'E010_done')
          return { ...next, logs: pushLog(next, '你听了很多修仙的故事，心中充满向往。') }
        }},
      ],
    },
    {
      id: 'E011_meet_childhood_male',
      title: '邻家男孩',
      minAge: 2, maxAge: 5,
      // 青梅竹马改为概率线：本局抽到才会出现
      condition: (g) => hasFlag(g, 'world_childhood_yes') && !hasFlag(g, 'has_childhood') && !hasFlag(g, 'E011_skip'),
      weight: (g) => 25 + Math.floor(g.stats.luck / 10),
      text: (_g, rng) => {
        const name = genName(rng, 'male')
        const appearance = genAppearance(rng, 'male')
        const personality = genPersonality(rng)
        return `隔壁住着一个小男孩，叫「${name}」。\n他${appearance}，性格${personality}。\n他总是偷偷给你塞糖吃，带你去村子后面的小溪抓鱼。\n[temp_childhood_name:${name}|${appearance}|${personality}]`
      },
      options: (_g, _rng) => [
        { id: 'befriend', text: '和他做朋友', effect: (g2, rng2) => {
          const match = g2.currentEvent?.rawText.match(/\[temp_childhood_name:(.+?)\|(.+?)\|(.+?)\]/)
          const name = match?.[1] || genName(rng2, 'male')
          const appearance = match?.[2] || genAppearance(rng2, 'male')
          const personality = match?.[3] || genPersonality(rng2)
          let person = createPerson(rng2, 'childhood', { name, appearance, personality, gender: 'male', age: g2.age + rng2.nextInt(-1, 2), favor: 30 }, !g2.hasPastLover)
          let baseNext: GameState = g2
          if (person.isPastLover) baseNext = { ...baseNext, hasPastLover: true }
          const cameo = maybeApplyFriendCameo(rng2, baseNext, person)
          baseNext = cameo.g
          person = cameo.p
          let next = addRelation(baseNext, person)
          next = addFlag(next, 'has_childhood')
          next = addFlag(next, `childhood_id_${person.id}`)
          return { ...next, logs: pushLog(next, `你和「${person.name}」成为了好朋友。他的笑容很温暖。${person.isPastLover ? '\n（你总觉得，和他在一起的时候，有一种莫名的熟悉感……）' : ''}`) }
        }},
        { id: 'ignore', text: '不太想理他', effect: (g2) => {
          const next = addFlag(g2, 'E011_skip')
          return { ...next, logs: pushLog(next, '你没有和他玩。也许以后会后悔？') }
        }},
      ],
    },
    {
      id: 'E011B_meet_beast',
      title: '竹林小兽',
      minAge: 2, maxAge: 5,
      condition: (g) => !hasFlag(g, 'world_childhood_yes') && !hasFlag(g, 'saved_beast') && !hasFlag(g, 'beast_skip'),
      weight: (g) => 22 + Math.floor(g.stats.luck / 10),
      text: (_g, rng) => {
        const beasts = [
          { id: 'fox', name: '小狐', desc: '一只雪白的小狐狸，尾尖带一点银' },
          { id: 'cat', name: '小猫', desc: '一只黑金相间的小猫，眼睛像墨玉' },
          { id: 'wolf', name: '小狼', desc: '一只灰蓝的小狼崽，耳尖微微发红' },
          { id: 'deer', name: '小鹿', desc: '一只幼鹿，额间有淡淡的灵纹' },
        ]
        const b = rng.pickOne(beasts)
        return `村后竹林里，你听见细微的呜咽声。\n${b.desc}，缩在落叶里，前爪被夹伤了。\n它看着你，没有逃。\n你伸手时，它却忽然安静下来，像是记住了你指尖的温度。\n[temp_beast:${b.id}|${b.name}]`
      },
      options: (_g, _rng) => [
        {
          id: 'save',
          text: '把它抱回去包扎',
          effect: (g2, _rng2) => {
            const m = g2.currentEvent?.rawText.match(/\[temp_beast:(.+?)\|(.+?)\]/)
            const beastId = m?.[1] || 'fox'
            const beastNick = m?.[2] || '小兽'
            let next = addFlag(g2, 'saved_beast')
            next = addFlag(next, `beast_kind_${beastId}`)
            next = addFlag(next, 'beast_marked_you')
            next = { ...next, stats: { ...next.stats, luck: clamp(next.stats.luck + 2, 0, 100) } }
            return { ...next, logs: pushLog(next, `你把${beastNick}抱回家，小心替它处理伤口。\n它用鼻尖轻轻碰了碰你的手背，像在道谢。（机缘+2）`) }
          },
        },
        {
          id: 'leave',
          text: '不敢靠近，转身离开',
          effect: (g2) => {
            let next = addFlag(g2, 'beast_skip')
            return { ...next, logs: pushLog(next, '你最终没有靠近那只小兽。竹林的风吹过，你心里有些发闷。') }
          },
        },
      ],
    },
    {
      id: 'E012_childhood_maybe_separate',
      title: '变故',
      minAge: 4, maxAge: 5,
      condition: (g) => hasFlag(g, 'has_childhood') && !hasFlag(g, 'childhood_fate_decided'),
      weight: () => 45,
      text: (g, rng) => {
        const childhood = getRelation(g, 'childhood')
        // 随机决定是搬走还是不搬走
        const willStay = rng.chance(0.4)
        if (willStay) {
          return `「${childhood?.name}」跑来找你，气喘吁吁。\n「好消息！我爹说我们不搬走了！」\n他笑得很开心。\n[childhood_stay:true]`
        } else {
          return `「${childhood?.name}」要搬走了。\n他站在你面前，欲言又止。\n「我……我要走了。」\n[childhood_stay:false]`
        }
      },
      options: (g) => {
        const childhood = getRelation(g, 'childhood')
        const text = g.currentEvent?.rawText || ''
        const willStay = text.includes('[childhood_stay:true]')
        
        if (willStay) {
          return [
            { id: 'happy', text: '开心地抱住他', effect: (g2) => {
              let next = updateRelation(g2, childhood!.id, { favor: childhood!.favor + 25 })
              next = addFlag(next, 'childhood_fate_decided')
              next = addFlag(next, 'childhood_stayed')
              return { ...next, logs: pushLog(next, `你开心地抱住他。「太好了！」\n他的脸红了，但也紧紧回抱你。`) }
            }},
            { id: 'calm', text: '「那太好了」', effect: (g2) => {
              let next = updateRelation(g2, childhood!.id, { favor: childhood!.favor + 15 })
              next = addFlag(next, 'childhood_fate_decided')
              next = addFlag(next, 'childhood_stayed')
              return { ...next, logs: pushLog(next, `「嗯！」他使劲点头，「以后我们还能一起玩。」`) }
            }},
          ]
        } else {
          return [
            { id: 'ask', text: '「你还会回来吗？」', effect: (g2) => {
              let next = updateRelation(g2, childhood!.id, { favor: childhood!.favor + 20, flags: [...childhood!.flags, 'promised_return'] })
              next = addFlag(next, 'childhood_fate_decided')
              next = addFlag(next, 'childhood_separated')
              next = addFlag(next, 'childhood_promise')
              return { ...next, logs: pushLog(next, `「一定会。」他认真地看着你。然后转身离开了。`) }
            }},
            { id: 'gift', text: '送他一个东西作为信物', effect: (g2) => {
              let next = updateRelation(g2, childhood!.id, { favor: childhood!.favor + 25, flags: [...childhood!.flags, 'has_keepsake'] })
              next = addFlag(next, 'childhood_fate_decided')
              next = addFlag(next, 'childhood_separated')
              next = addFlag(next, 'gave_childhood_keepsake')
              next = { ...next, items: [...next.items, `${childhood?.name}的回礼`] }
              return { ...next, logs: pushLog(next, `他收下了，也从怀里掏出一个小东西给你。「帮我收着。」`) }
            }},
            { id: 'run', text: '转身跑开，不敢看他', effect: (g2) => {
              let next = updateRelation(g2, childhood!.id, { favor: childhood!.favor + 10 })
              next = addFlag(next, 'childhood_fate_decided')
              next = addFlag(next, 'childhood_separated')
              next = addFlag(next, 'childhood_regret')
              return { ...next, logs: pushLog(next, '你跑开了。眼泪模糊了视线。') }
            }},
          ]
        }
      },
    },
    {
      id: 'E012B_childhood_together_sect',
      title: '一起入宗门',
      minAge: 6, maxAge: 6,
      condition: (g) => hasFlag(g, 'childhood_stayed') && !hasFlag(g, 'tested_root'),
      weight: () => 80,
      text: (g) => {
        const childhood = getRelation(g, 'childhood')
        return `测灵根的日子到了。\n你惊讶地发现，「${childhood?.name}」也在队伍里！\n「我们一起去！」他朝你挥手。`
      },
      options: (g) => {
        const childhood = getRelation(g, 'childhood')
        return [
          { id: 'together', text: '和他站在一起', effect: (g2) => {
            let next = updateRelation(g2, childhood!.id, { favor: childhood!.favor + 15 })
            next = addFlag(next, 'childhood_together_test')
            return { ...next, logs: pushLog(next, `你走过去，和他并肩站着。\n「不管结果怎样，我们都在一起。」他小声说。`) }
          }},
        ]
      },
    },
    {
      id: 'E012C_childhood_help_sect',
      title: '青梅竹马的帮助',
      minAge: 6, maxAge: 8,
      condition: (g) => {
        const childhood = g.relations.find(r => r.role === 'childhood' && r.status === 'alive')
        return hasFlag(g, 'is_loose_cultivator') && !!childhood && childhood.favor >= 30 && !hasFlag(g, 'childhood_helped_sect')
      },
      weight: () => 50,
      text: (g) => {
        const childhood = g.relations.find(r => r.role === 'childhood' && r.status === 'alive')
        return `你没想到会再见到「${childhood?.name}」。\n他穿着华丽的宗门服饰，气质大变。\n「我听说你没能入宗门……」他顿了顿，「我可以帮你。」\n原来他家这些年发了大财，在宗门里很有关系。`
      },
      options: (g, rng) => {
        const childhood = g.relations.find(r => r.role === 'childhood' && r.status === 'alive')!
        const sect = rng.pickOne(SECTS)
        return [
          { id: 'accept', text: '接受他的帮助', effect: (g2, rng2): GameState => {
            let next: GameState = { ...g2, sect: sect.name }
            next = addFlag(next, 'childhood_helped_sect')
            next = addFlag(next, 'in_sect')
            next = updateRelation(next, childhood.id, { favor: childhood.favor + 30 })
            let master = createPerson(rng2, 'master', {
              gender: rng2.chance(0.6) ? 'male' : 'female',
              realm: rng2.chance(0.5) ? 'core' : 'nascent',
              age: rng2.nextInt(300, 600),
              favor: 10,
            }, !next.hasPastLover)
            const cameo = maybeApplyFriendCameo(rng2, next, master)
            next = cameo.g
            master = cameo.p
            next = addRelation(next, master)
            if (master.isPastLover) next = { ...next, hasPastLover: true }
            const extraText = master.isPastLover ? '（你的新师父看你的眼神很奇怪……）' : ''
            return { ...next, logs: pushLog(next, `「谢谢你……」\n他笑了笑：「小时候你对我那么好，这算什么。」\n就这样，你进入了${sect.name}，拜「${master.name}」为师。${extraText}\n而${childhood.name}，成了你在宗门里最亲近的人。`) }
          }},
          { id: 'refuse', text: '「不用了，我想靠自己」', effect: (g2) => {
            let next = addFlag(g2, 'childhood_helped_sect')
            next = updateRelation(next, childhood.id, { favor: childhood.favor + 10 })
            return { ...next, logs: pushLog(next, `他愣了一下，然后笑了。\n「你还是这么倔。不过……我喜欢。」\n「有什么需要随时找我。」`) }
          }},
        ]
      },
    },
    {
      id: 'E013_mysterious_person',
      title: '神秘白衣人',
      minAge: 3, maxAge: 5,
      condition: (g) => !hasFlag(g, 'met_mysterious'),
      weight: (g) => 10 + Math.floor(g.stats.luck / 5),
      text: () => '一个神秘的白衣人路过你家门口。\n他停下脚步，看了你一眼。\n「这孩子……」\n他若有所思，然后飘然离去。',
      options: () => [
        { id: 'curious', text: '好奇地看着他', effect: (g) => {
          let next = addFlag(g, 'met_mysterious')
          next = addFlag(next, 'mysterious_looked_back')
          return { ...next, logs: pushLog(next, '他回头看了你一眼，眼神意味深长。然后消失在云雾中。') }
        }},
        { id: 'hide', text: '害怕，躲到父母身后', effect: (g) => {
          let next = addFlag(g, 'met_mysterious')
          return { ...next, logs: pushLog(next, '等你再看时，他已经不见了。仿佛从未出现过。') }
        }},
      ],
    },
    {
      id: 'E014_save_demon',
      title: '受伤的小妖兽',
      minAge: 3, maxAge: 10, // 10岁后不再触发童年救妖剧情
      condition: (g) => !hasFlag(g, 'demon_encounter'),
      weight: (g) => 15 + Math.floor(g.stats.luck / 8),
      text: () => '你在山里玩的时候，发现了一只受伤的小妖兽。\n它浑身雪白，眼睛像宝石一样漂亮，可怜巴巴地看着你。\n它的腿受伤了，正在流血。',
      options: () => [
        { id: 'save', text: '救它', effect: (g) => {
          let next = addFlag(g, 'demon_encounter')
          next = addFlag(next, 'saved_little_demon')
          next = { ...next, stats: { ...next.stats, luck: next.stats.luck + 5 } }
          return { ...next, logs: pushLog(next, '你用衣服帮它包扎伤口。它舔了舔你的手，眼中满是感激。然后一瘸一拐地离开了。') }
        }},
        { id: 'run', text: '害怕，跑掉', effect: (g) => {
          let next = addFlag(g, 'demon_encounter')
          return { ...next, logs: pushLog(next, '你跑回了家，心跳得厉害。') }
        }},
        { id: 'kill', text: '听说妖丹很值钱……', effect: (g) => {
          let next = addFlag(g, 'demon_encounter')
          next = addFlag(next, 'killed_little_demon')
          next = { ...next, money: next.money + 50, stats: { ...next.stats, luck: next.stats.luck - 10 } }
          return { ...next, logs: pushLog(next, '你找了块石头……那双眼睛直到最后都在看着你。你得到了一颗劣质妖丹，卖了50灵石。但你总觉得，有什么东西在暗处看着你。') }
        }},
      ],
    },

    // ===== 1~10岁：更多幼年机缘（物品/资质/修为），避免太固定 =====
    {
      id: 'E015_market_day',
      title: '集市一角',
      minAge: 1, maxAge: 5,
      condition: (g) => !hasFlag(g, 'E015_done'),
      weight: (g) => 18 + Math.floor(g.stats.luck / 20),
      text: (_g, rng) => {
        const scenes = [
          '你跟着父母去赶集，人声鼎沸，满街都是叫卖声。',
          '你第一次见到这么热闹的集市，糖人、纸鸢、药摊挤在一条街上。',
          '集市上有人摆摊卖“能让孩子测出灵根”的偏方，围了一圈人。',
        ]
        const s = rng.pickOne(scenes)
        return `${s}\n你在人群里挤来挤去，忽然看到一个不起眼的药摊。`
      },
      options: (_g, _rng) => {
        const samplePool = ['启灵草', '小福符', '澄心露', '培元丹', '洗髓丹', '机缘丹']
        return [
          {
            id: 'herb',
            text: '凑到药摊前看热闹',
            effect: (g2, rng2) => {
              let next = addFlag(g2, 'E015_done')
              const item = rng2.pickOne(samplePool)
              next = { ...next, items: [...next.items, item] }
              return { ...next, logs: pushLog(next, `药摊老板见你眼睛亮亮的，笑着塞给你一份小样。\n（获得「${item}」）`) }
            },
          },
          {
            id: 'help',
            text: '帮父母拎东西',
            effect: (g2) => {
              let next = addFlag(g2, 'E015_done')
              next = { ...next, stats: { ...next.stats, body: Math.min(100, next.stats.body + 1) }, money: next.money + 10 }
              return { ...next, logs: pushLog(next, '你一路跟着拎得手酸，却咬牙没喊累。\n（体魄+1，灵石+10）') }
            },
          },
          {
            id: 'listen',
            text: '蹲在角落听人讲修仙奇谈',
            effect: (g2) => {
              let next = addFlag(g2, 'E015_done')
              next = { ...next, stats: { ...next.stats, root: Math.min(100, next.stats.root + 1) } }
              return { ...next, logs: pushLog(next, '你听得入迷，脑子里像多了一扇门。\n（根骨+1）') }
            },
          },
        ]
      },
    },
    {
      id: 'E016_river_token',
      title: '河边旧物',
      minAge: 2, maxAge: 6,
      condition: (g) => !hasFlag(g, 'E016_done'),
      weight: (g) => 16 + Math.floor(g.stats.luck / 22),
      text: (_g, rng) => {
        const things = [
          '一枚温润的旧玉扣',
          '一截磨得发亮的木牌',
          '一枚刻着奇怪纹路的铜钱',
        ]
        const t = rng.pickOne(things)
        return `河水很清，你蹲在岸边玩水。\n石缝里卡着${t}，像被水冲了很多年。`
      },
      options: (_g, _rng) => [
        {
          id: 'keep',
          text: '擦干净，收起来',
          effect: (g2, rng2) => {
            let next = addFlag(g2, 'E016_done')
            // 小概率直接给物品，否则给一点机缘
            if (rng2.chance(0.6)) {
              next = { ...next, items: [...next.items, '小福符'] }
              return { ...next, logs: pushLog(next, '你把旧物擦干净，贴身收好。\n夜里你做了个很轻的梦，像有人替你把路拨亮了一点。\n（获得「小福符」）') }
            }
            next = { ...next, stats: { ...next.stats, luck: Math.min(100, next.stats.luck + 2) } }
            return { ...next, logs: pushLog(next, '你把旧物擦干净，贴身收好。\n之后几日，总能碰巧捡到好东西。\n（机缘+2）') }
          },
        },
        {
          id: 'give',
          text: '交给父母保管',
          effect: (g2) => {
            let next = addFlag(g2, 'E016_done')
            next = { ...next, stats: { ...next.stats, root: Math.min(100, next.stats.root + 1) } }
            return { ...next, logs: pushLog(next, '父母夸你懂事，又给你讲了不少“谨慎行事”的道理。\n（根骨+1）') }
          },
        },
      ],
    },
    {
      id: 'E017_small_shrine',
      title: '破庙求签',
      minAge: 3, maxAge: 8,
      condition: (g) => !hasFlag(g, 'E017_done'),
      weight: (g) => 16 + Math.floor(g.stats.luck / 18),
      text: (_g, rng) => {
        const weather = rng.pickOne(['细雨', '大风', '薄雪', '闷热'])
        return `${weather}天，你躲进村外一座小破庙。\n香灰很薄，供桌上放着一筒旧签。\n你忽然想：要不要摇一支？`
      },
      options: () => [
        {
          id: 'pray',
          text: '摇签，认真拜一拜',
          effect: (g2, rng2) => {
            let next = addFlag(g2, 'E017_done')
            next = { ...next, stats: { ...next.stats, luck: Math.min(100, next.stats.luck + 2), root: Math.min(100, next.stats.root + 1) } }
            // 小概率额外掉一个“安神定息”的东西
            if (rng2.chance(0.25)) {
              next = { ...next, items: [...next.items, '澄心露'] }
              return { ...next, logs: pushLog(next, '你摇出一支旧签，上面字迹模糊，却让你心里一下子安静下来。\n供桌角落还放着一小瓶清露。\n（机缘+2，根骨+1，获得「澄心露」）') }
            }
            return { ...next, logs: pushLog(next, '你摇出一支旧签，上面字迹模糊，却让你心里一下子安静下来。\n（机缘+2，根骨+1）') }
          },
        },
        {
          id: 'mess',
          text: '好奇乱翻供桌',
          effect: (g2, rng2) => {
            let next = addFlag(g2, 'E017_done')
            if (rng2.chance(0.5)) {
              next = { ...next, money: next.money + 20, stats: { ...next.stats, luck: Math.max(0, next.stats.luck - 1) } }
              return { ...next, logs: pushLog(next, '你翻到几枚旧灵石，赶紧揣进兜里。\n可回去路上一直觉得背后发凉。\n（灵石+20，机缘-1）') }
            }
            next = { ...next, stats: { ...next.stats, luck: Math.max(0, next.stats.luck - 2) } }
            return { ...next, logs: pushLog(next, '你把供桌翻得乱七八糟，什么也没找到。\n回去后还摔了一跤。\n（机缘-2）') }
          },
        },
      ],
    },
    {
      id: 'E018_glowing_herb',
      title: '微光灵草',
      minAge: 4, maxAge: 10,
      condition: (g) => !hasFlag(g, 'E018_done'),
      weight: (g) => 18 + Math.floor(g.stats.luck / 16),
      text: (_g, rng) => {
        const places = ['田埂边', '竹林里', '石阶旁', '溪水边']
        const p = rng.pickOne(places)
        return `你在${p}看见一点微光。\n是一株细细的灵草，叶脉里像藏着一口气。\n你伸手时，指尖微微发热。`
      },
      options: () => [
        {
          id: 'eat',
          text: '小心尝一小口',
          effect: (g2) => {
            let next = addFlag(g2, 'E018_done')
            const gain = 4 + Math.floor(g2.stats.root / 40)
            next = { ...next, cultivation: Math.min(100, next.cultivation + gain) }
            return { ...next, logs: pushLog(next, `草汁清苦，却让你胸口一暖，像是第一次“听见了气”。\n（修为+${gain}）`) }
          },
        },
        {
          id: 'dry',
          text: '带回家晾干',
          effect: (g2, rng2) => {
            let next = addFlag(g2, 'E018_done')
            const item = rng2.chance(0.7) ? '启灵草' : '澄心露'
            next = { ...next, items: [...next.items, item] }
            return { ...next, logs: pushLog(next, `你把灵草仔细包好带回家。\n晾干后香气淡淡，像能让人静下心。\n（获得「${item}」）`) }
          },
        },
      ],
    },
    {
      id: 'E019_broken_scroll',
      title: '残卷纳息',
      minAge: 5, maxAge: 10,
      condition: (g) => !hasFlag(g, 'E019_done'),
      weight: (g) => 17 + Math.floor(g.stats.root / 25),
      text: (_g, rng) => {
        const where = rng.pickOne(['柴房角落', '旧书堆里', '路边沟渠旁的破布包'])
        return `你在${where}翻到一页残破的纸。\n上面写着几个歪歪扭扭的字：\n「纳息、静心、守一。」\n看不太懂，却莫名让你想试试。`
      },
      options: () => [
        {
          id: 'try',
          text: '照着做一遍',
          effect: (g2) => {
            let next = addFlag(g2, 'E019_done')
            const gain = 6 + Math.floor(g2.stats.root / 35)
            next = { ...next, cultivation: Math.min(100, next.cultivation + gain), stats: { ...next.stats, root: Math.min(100, next.stats.root + 1) } }
            return { ...next, logs: pushLog(next, `你学着盘腿坐好，呼吸一深一浅。\n片刻后，掌心竟微微发热。\n（修为+${gain}，根骨+1）`) }
          },
        },
        {
          id: 'burn',
          text: '怕惹祸，悄悄烧掉',
          effect: (g2) => {
            let next = addFlag(g2, 'E019_done')
            next = { ...next, stats: { ...next.stats, luck: Math.min(100, next.stats.luck + 1) } }
            return { ...next, logs: pushLog(next, '你把纸页烧成灰。\n可那几行字像在脑子里扎了根。\n（机缘+1）') }
          },
        },
      ],
    },
    {
      id: 'E020_moon_pool',
      title: '月下灵泉',
      minAge: 2, maxAge: 10,
      condition: (g) => !hasFlag(g, 'E020_done'),
      weight: (g) => 15 + Math.floor(g.stats.luck / 14),
      text: (_g, rng) => {
        const nights = ['月色很亮', '月色很淡', '云开月明', '月光像水一样']
        const n = rng.pickOne(nights)
        return `${n}的一晚，你追着萤火虫跑到村外。\n草丛深处有一眼很小的泉，映着月光，像一面碎镜。\n你蹲下去时，水面竟泛起一圈圈灵光。`
      },
      options: () => [
        {
          id: 'wash',
          text: '洗洗手脸',
          effect: (g2) => {
            let next = addFlag(g2, 'E020_done')
            next = { ...next, stats: { ...next.stats, body: Math.min(100, next.stats.body + 2) } }
            return { ...next, logs: pushLog(next, '泉水冰凉，却让你精神大振。\n（体魄+2）') }
          },
        },
        {
          id: 'bottle',
          text: '装一点回去',
          effect: (g2, rng2) => {
            let next = addFlag(g2, 'E020_done')
            const item = rng2.chance(0.7) ? '澄心露' : '小福符'
            next = { ...next, items: [...next.items, item] }
            return { ...next, logs: pushLog(next, `你装了一小瓶月下泉水。\n回家后，瓶里竟凝出一点清露。\n（获得「${item}」）`) }
          },
        },
      ],
    },

    // ===== 6岁：测灵根入宗门 =====
    {
      id: 'E100_test_root',
      title: '测灵根',
      minAge: 6, maxAge: 6,
      condition: (g) => !hasFlag(g, 'tested_root'),
      weight: () => 100,
      text: (g) => {
        const rootQuality = g.stats.root >= 80 ? '天灵根' : g.stats.root >= 60 ? '双灵根' : g.stats.root >= 40 ? '三灵根' : '杂灵根'
        return `你被带去测灵根。\n测灵石上光芒闪烁——\n「${rootQuality}！」\n${g.stats.root >= 80 ? '所有人都震惊了！好几个宗门长老当场抢人。' : g.stats.root >= 60 ? '还不错的资质，有几个宗门愿意收你。' : g.stats.root >= 40 ? '普通资质，勉强有宗门愿意要。' : '资质平平，很多人露出惋惜的表情。'}`
      },
      options: (g, rng) => {
        const opts: { id: string; text: string; effect: (g: GameState, rng: ReturnType<typeof makeRng>) => GameState }[] = []
        const shuffledSects = rng.shuffle(SECTS)
        
        if (g.stats.root >= 60) {
          opts.push({
            id: 'sect1',
            text: `加入${shuffledSects[0].name}（${shuffledSects[0].desc}）`,
            effect: (g2, rng2): GameState => {
              let next: GameState = { ...g2, sect: shuffledSects[0].name }
              next = addFlag(next, 'tested_root')
              next = addFlag(next, 'in_sect')
              // 分配师父
              let master = createPerson(rng2, 'master', {
                gender: rng2.chance(0.7) ? 'male' : 'female',
                realm: rng2.chance(0.7) ? 'nascent' : 'core',
                age: rng2.nextInt(300, 600),
                favor: rng2.nextInt(5, 20),
              }, !next.hasPastLover)
              const cameo = maybeApplyFriendCameo(rng2, next, master)
              next = cameo.g
              master = cameo.p
              next = addRelation(next, master)
              if (master.isPastLover) next = { ...next, hasPastLover: true }
              next = addFlag(next, `master_id_${master.id}`)
              const extraText = master.isPastLover ? '（他看你的第一眼，眼神就有些不对……）' : ''
              return { ...next, logs: pushLog(next, `你加入了${shuffledSects[0].name}，被分配给「${master.name}」为师。他${master.appearance}，${master.personality}。${extraText}`) }
            },
          })
        }
        if (g.stats.root >= 40) {
          opts.push({
            id: 'sect2',
            text: `加入${shuffledSects[1].name}（${shuffledSects[1].desc}）`,
            effect: (g2, rng2): GameState => {
              let next: GameState = { ...g2, sect: shuffledSects[1].name }
              next = addFlag(next, 'tested_root')
              next = addFlag(next, 'in_sect')
              let master = createPerson(rng2, 'master', {
                gender: rng2.chance(0.6) ? 'male' : 'female',
                realm: rng2.chance(0.5) ? 'core' : 'nascent',
                age: rng2.nextInt(300, 600),
                favor: rng2.nextInt(0, 15),
              }, !next.hasPastLover)
              const cameo2 = maybeApplyFriendCameo(rng2, next, master)
              next = cameo2.g
              master = cameo2.p
              next = addRelation(next, master)
              if (master.isPastLover) next = { ...next, hasPastLover: true }
              next = addFlag(next, `master_id_${master.id}`)
              const extraText = master.isPastLover ? '（初见之时，他的目光在你身上停留了很久……）' : ''
              return { ...next, logs: pushLog(next, `你加入了${shuffledSects[1].name}，拜「${master.name}」为师。${extraText}`) }
            },
          })
        }
        opts.push({
          id: 'loose',
          text: '不加入宗门，成为散修',
          effect: (g2) => {
            let next = addFlag(g2, 'tested_root')
            next = addFlag(next, 'is_loose_cultivator')
            return { ...next, logs: pushLog(next, '你没有加入任何宗门，决定自己闯荡。散修之路，艰难却自由。') }
          },
        })
        return opts
      },
    },

    // ===== 入门后：遇见师兄 =====
    {
      id: 'E110_meet_senior',
      title: '初见师兄',
      minAge: 6, maxAge: 10,
      condition: (g) => hasFlag(g, 'in_sect') && !hasFlag(g, 'met_senior'),
      weight: () => 50,
      text: (_g, rng) => {
        const type = rng.nextInt(1, 3)
        const name = genName(rng, 'male')
        const app = genAppearance(rng, 'male')
        const pers = genPersonality(rng)
        if (type === 1) {
          return `入门第一天，一个${app}的男子出现在你面前。\n「${name}。」他只报了名字，便不再说话。\n一路上沉默得让人窒息。\n[temp_senior:${name}|${app}|${pers}|cold]`
        } else if (type === 2) {
          return `「新来的小师妹！」\n还没反应过来，你就被一个热情的人拉住了。\n「我叫${name}，以后有什么事找我！」\n他${app}，笑起来很亮。\n[temp_senior:${name}|${app}|热情开朗|warm]`
        } else {
          return `「${name}。」\n一个${app}的男子看着你，笑意意味深长，让你有些捉摸不透。\n「师妹，以后……可以来找我哦。」\n[temp_senior:${name}|${app}|${pers}|mysterious]`
        }
      },
      options: (_g, _rng) => [
        { id: 'greet', text: '打招呼', effect: (g2, rng2) => {
          const match = g2.currentEvent?.rawText.match(/\[temp_senior:(.+?)\|(.+?)\|(.+?)\|(.+?)\]/)
          const name = match?.[1] || genName(rng2, 'male')
          const app = match?.[2] || genAppearance(rng2, 'male')
          const pers = match?.[3] || genPersonality(rng2)
          const type = match?.[4] || 'cold'
          const favor = type === 'warm' ? 25 : type === 'cold' ? 5 : 15
          let senior = createPerson(rng2, 'senior', { name, appearance: app, personality: pers, gender: 'male', realm: 'qi', age: g2.age + rng2.nextInt(3, 8), favor }, !g2.hasPastLover)
          let baseNext: GameState = g2
          if (senior.isPastLover) baseNext = { ...baseNext, hasPastLover: true }
          const cameo = maybeApplyFriendCameo(rng2, baseNext, senior)
          baseNext = cameo.g
          senior = cameo.p
          let next = addRelation(baseNext, senior)
          next = addFlag(next, 'met_senior')
          next = addFlag(next, `senior_id_${senior.id}`)
          const response = type === 'warm' ? '他笑得更开心了，拉着你介绍宗门。' : type === 'cold' ? '他点点头，没有多说什么。' : '他的笑容更深了。'
          return { ...next, logs: pushLog(next, `你向「${senior.name}」问好。${response}${senior.isPastLover ? '\n（你感觉他看你的眼神有些奇怪……）' : ''}`) }
        }},
      ],
    },

    // ===== 日常修炼 =====
    {
      id: 'E200_daily_train',
      title: '日常修炼',
      minAge: 7, maxAge: 150,
      condition: (g) => hasFlag(g, 'in_sect') || hasFlag(g, 'is_loose_cultivator'),
      weight: () => 20,
      text: () => '平静的一天，你在修炼中度过。',
      options: () => [
        { id: 'hard', text: '刻苦修炼', effect: (g) => {
          const gain = 5 + Math.floor(g.stats.root / 20)
          return { ...g, cultivation: Math.min(100, g.cultivation + gain), logs: pushLog(g, `你刻苦修炼，修为有所精进。（+${gain}修为）`) }
        }},
        { id: 'rest', text: '休息一下', effect: (g) => {
          return { ...g, stats: { ...g.stats, body: Math.min(100, g.stats.body + 2) }, logs: pushLog(g, '你休息了一天，感觉神清气爽。') }
        }},
      ],
    },

    // ===== 被欺负 =====
    {
      id: 'E201_bullied',
      title: '被人欺负',
      minAge: 7, maxAge: 15,
      condition: (g) => hasFlag(g, 'in_sect') && g.stats.root < 60,
      weight: () => 20,
      text: () => '几个资质好的弟子围住了你，嘲笑你的灵根。\n「就这资质也想修仙？」',
      options: (g) => {
        const senior = getRelation(g, 'senior')
        const opts: { id: string; text: string; effect: (g: GameState, rng: ReturnType<typeof makeRng>) => GameState }[] = [
          { id: 'endure', text: '忍着', effect: (g2) => ({ ...g2, stats: { ...g2.stats, luck: g2.stats.luck - 2 }, logs: pushLog(g2, '你咬着嘴唇忍了下来。他们笑着离开了。') }) },
          { id: 'fight', text: '反击', effect: (g2, rng2) => {
            if (rng2.chance(0.4)) {
              return { ...g2, stats: { ...g2.stats, body: g2.stats.body + 2 }, logs: pushLog(g2, '你挥拳打了回去！虽然被打得鼻青脸肿，但他们以后不敢再惹你了。') }
            } else {
              return { ...g2, stats: { ...g2.stats, body: g2.stats.body - 3 }, logs: pushLog(g2, '你被打得很惨，躺了好几天。') }
            }
          }},
        ]
        if (senior) {
          opts.push({ id: 'senior_help', text: `（${senior.name}出现）`, effect: (g2) => {
            let next = updateRelation(g2, senior.id, { favor: senior.favor + 15 })
            return { ...next, logs: pushLog(next, `「欺负我师妹？」${senior.name}出现在你身后，冷冷地看着那群人。他们吓得跑掉了。`) }
          }})
        }
        return opts
      },
    },

    // ===== 与师兄/师父的互动 =====
    {
      id: 'E210_senior_night',
      title: '深夜相遇',
      minAge: 10, maxAge: 30,
      condition: (g) => {
        const senior = getRelation(g, 'senior')
        return !!senior && senior.favor >= 20
      },
      weight: (g) => {
        const senior = getRelation(g, 'senior')
        return senior ? 15 + Math.floor(senior.favor / 5) : 0
      },
      text: (g) => {
        const senior = getRelation(g, 'senior')
        return `深夜，你睡不着，出来走走。\n没想到在月光下，遇到了「${senior?.name}」。\n他靠在栏杆上，看着月亮发呆。`
      },
      options: (g) => {
        const senior = getRelation(g, 'senior')!
        return [
          { id: 'approach', text: '走过去', effect: (g2) => {
            let next = updateRelation(g2, senior.id, { favor: senior.favor + 10 })
            return { ...next, logs: pushLog(next, `你走到他身边。他看了你一眼，没有说话，只是往旁边挪了挪，给你腾出位置。\n你们就这样并肩站着，看了很久的月亮。`) }
          }},
          { id: 'watch', text: '远远地看着他', effect: (g2) => {
            return { ...g2, logs: pushLog(g2, `你没有打扰他，只是远远地看着。月光把他的侧脸勾出清晰的轮廓。`) }
          }},
          { id: 'ask', text: '「睡不着吗？」', effect: (g2) => {
            let next = updateRelation(g2, senior.id, { favor: senior.favor + 15 })
            return { ...next, logs: pushLog(next, `他转头看你，眼神有些柔和。「嗯。你也是？」\n你们聊了很久，直到月亮西沉。`) }
          }},
        ]
      },
    },
    {
      id: 'E211_master_gift',
      title: '师父的礼物',
      minAge: 8, maxAge: 50,
      condition: (g) => {
        const master = getRelation(g, 'master')
        return !!master && master.favor >= 15
      },
      weight: () => 15,
      text: (g) => {
        const master = getRelation(g, 'master')
        return `「${master?.name}」把你叫去，递给你一个瓶子。\n「这是为师炼的丹药，对你修炼有帮助。」`
      },
      options: (g) => {
        const master = getRelation(g, 'master')!
        return [
          { id: 'take', text: '感激收下', effect: (g2) => {
            let next = updateRelation(g2, master.id, { favor: master.favor + 10 })
            next = { ...next, cultivation: Math.min(100, next.cultivation + 15) }
            return { ...next, logs: pushLog(next, `你收下丹药，服用后修为大涨。师父的嘴角似乎微微上扬。`) }
          }},
          { id: 'refuse', text: '「弟子不敢受」', effect: (g2) => {
            return { ...g2, logs: pushLog(g2, `师父皱眉：「让你拿着就拿着。」你只好收下。`) }
          }},
        ]
      },
    },

    // ===== 更多日常事件 =====
    {
      id: 'E220_strange_elder',
      title: '奇怪的老人',
      minAge: 4, maxAge: 8,
      condition: (g) => !hasFlag(g, 'met_strange_elder'),
      weight: () => 15,
      text: (_g, rng) => {
        const elderTypes = [
          { type: 'kind', desc: '一个白发苍苍的老人坐在村口，对你招手微笑。' },
          { type: 'drunk', desc: '一个衣衫褴褛的老头醉倒在路边，嘴里念叨着什么。' },
          { type: 'mysterious', desc: '一个穿着奇怪的老人盯着你看了很久。' },
        ]
        const elder = rng.pickOne(elderTypes)
        return `${elder.desc}\n[elder_type:${elder.type}]`
      },
      options: (g, rng) => {
        const match = g.currentEvent?.rawText.match(/\[elder_type:(.+?)\]/)
        const type = match?.[1] || 'kind'
        return [
          { id: 'approach', text: '走过去看看', effect: (g2) => {
            let next = addFlag(g2, 'met_strange_elder')
            if (type === 'kind') {
              next = { ...next, stats: { ...next.stats, luck: next.stats.luck + 3 } }
              return { ...next, logs: pushLog(next, '老人摸了摸你的头，从怀里掏出一颗糖给你。\n糖的味道很奇特，吃完后你感觉运气变好了。（机缘+3）') }
            } else if (type === 'drunk') {
              const item = rng.pickOne(['聚灵丹', '培元丹', '机缘丹'])
              next = { ...next, items: [...next.items, item] }
              return { ...next, logs: pushLog(next, `老头突然清醒过来，塞给你一个瓶子：「小娃娃，这个给你。」\n然后又醉倒了。\n（获得「${item}」）`) }
            } else {
              next = addFlag(next, 'strange_elder_watched')
              return { ...next, logs: pushLog(next, '老人看着你，意味深长地说：「有意思……」然后转身离开了。\n你总觉得以后还会再见到他。') }
            }
          }},
          { id: 'ignore', text: '绕道走开', effect: (g2) => {
            let next = addFlag(g2, 'met_strange_elder')
            return { ...next, logs: pushLog(next, '你没有理会，径直走了。也许错过了什么，也许什么都没错过。') }
          }},
        ]
      },
    },
    {
      id: 'E221_strange_elder_return',
      title: '再遇故人',
      minAge: 12, maxAge: 50,
      condition: (g) => hasFlag(g, 'strange_elder_watched') && !hasFlag(g, 'strange_elder_returned'),
      weight: () => 40,
      text: () => '你在路上遇到一个面善的老人。\n他看着你，笑道：「果然是你。当年我就觉得你不简单。」',
      options: (_g, rng) => [
        { id: 'ask', text: '「您是？」', effect: (g2) => {
          let next = addFlag(g2, 'strange_elder_returned')
          const reward = rng.pickOne(['洗髓丹', '破境丹'])
          next = { ...next, items: [...next.items, reward], stats: { ...next.stats, root: next.stats.root + 5 } }
          return { ...next, logs: pushLog(next, `「哈哈，小时候见过你一面。」\n他递给你一个玉瓶：「送你个礼物。」\n说完便消失了。\n（根骨+5，获得「${reward}」）`) }
        }},
      ],
    },
    {
      id: 'E230_competition',
      title: '门派比试',
      minAge: 10, maxAge: 50,
      condition: (g) => hasFlag(g, 'in_sect') && !hasFlag(g, 'competition_done'),
      weight: () => 25,
      text: (g) => `${g.sect}举行年度弟子比试。\n你的对手是一个和你修为相近的师兄弟。`,
      options: (g, rng) => {
        const winChance = 0.3 + g.stats.body / 200 + g.stats.root / 200
        return [
          { id: 'fight', text: `全力以赴（胜率约${Math.floor(winChance * 100)}%）`, effect: (g2) => {
            let next = addFlag(g2, 'competition_done')
            if (rng.chance(winChance)) {
              const reward = rng.nextInt(20, 50)
              next = { ...next, money: next.money + reward, stats: { ...next.stats, body: next.stats.body + 2 } }
              return { ...next, logs: pushLog(next, `经过激烈的战斗，你赢了！\n（获得灵石${reward}，体魄+2）`) }
            } else {
              next = { ...next, stats: { ...next.stats, body: Math.max(10, next.stats.body - 3) } }
              return { ...next, logs: pushLog(next, '你输了，但学到了不少经验。（体魄-3）') }
            }
          }},
          { id: 'forfeit', text: '认输', effect: (g2) => {
            let next = addFlag(g2, 'competition_done')
            return { ...next, logs: pushLog(next, '你主动认输。有人嘲笑你，但你不在乎。') }
          }},
        ]
      },
    },
    {
      id: 'E240_treasure',
      title: '意外收获',
      minAge: 10, maxAge: 100,
      condition: (g) => g.treasureCd <= 0,
      weight: (g) => 2 + Math.floor(g.stats.luck / 30),
      text: (_g, rng) => {
        const places = ['山洞里', '河边', '古树下', '废弃的屋子里', '草丛中']
        const place = rng.pickOne(places)
        return `你在${place}发现了一个破旧的包袱。\n里面似乎有什么东西……`
      },
      options: (_g, rng) => [
        { id: 'open', text: '打开看看', effect: (g2) => {
          const good = [
            { text: '里面是一堆灵石！', money: rng.nextInt(30, 80), item: null as null | string },
            { text: '是一瓶丹药！', money: 0, item: (rng.chance(0.2) ? '回天破境丹' : rng.pickOne(['聚灵丹', '培元丹', '洗髓丹'])) as string },
            { text: '是一本残缺的功法，虽然不完整，但让你有所领悟。', money: 0, item: null as null | string, cultivation: 10 },
            { text: '里面空空如也，只有一张纸条：「下次不要乱翻别人的东西。」', money: 0, item: null as null | string },
          ]
          const bad = [
            {
              text: '你刚一打开，一股腥甜粉尘扑面而来，喉间发苦。',
              money: 0,
              item: null as null | string,
              bodyDelta: -rng.nextInt(8, 15),
            },
            {
              text: '包袱夹层里藏着一枚阴针，划破了你的指尖，寒意直入经脉。',
              money: 0,
              item: null as null | string,
              bodyDelta: -rng.nextInt(5, 12),
              luckDelta: -rng.nextInt(1, 4),
            },
            {
              text: '你摸到一页残符，符上邪意缠手，差点让你气息紊乱。',
              money: 0,
              item: null as null | string,
              cultivationDelta: -rng.nextInt(3, 8),
              luckDelta: -rng.nextInt(1, 3),
            },
          ]
          const badP = clamp((35 - g2.stats.luck) / 90 + (g2.stats.luck < 20 ? 0.12 : 0), 0, 0.45)
          const outcome = rng.chance(badP) ? rng.pickOne(bad) : rng.pickOne(good)
          let next = g2
          if (outcome.money > 0) {
            next = { ...next, money: next.money + outcome.money }
          }
          if (outcome.item) {
            next = { ...next, items: [...next.items, outcome.item] }
          }
          if ('cultivation' in outcome && outcome.cultivation) {
            next = { ...next, cultivation: Math.min(100, next.cultivation + outcome.cultivation) }
          }
          if ('cultivationDelta' in outcome && outcome.cultivationDelta) {
            next = { ...next, cultivation: clamp(next.cultivation + outcome.cultivationDelta, 0, 100) }
          }
          if ('bodyDelta' in outcome && outcome.bodyDelta) {
            next = { ...next, stats: { ...next.stats, body: Math.max(1, next.stats.body + outcome.bodyDelta) } }
          }
          if ('luckDelta' in outcome && outcome.luckDelta) {
            next = { ...next, stats: { ...next.stats, luck: clamp(next.stats.luck + outcome.luckDelta, 0, 100) } }
          }
          const extra =
            outcome.money > 0
              ? `（获得灵石${outcome.money}）`
              : outcome.item
                ? `（获得「${outcome.item}」）`
                : ('cultivation' in outcome && outcome.cultivation)
                  ? '（修为+10）'
                  : ('cultivationDelta' in outcome && outcome.cultivationDelta)
                    ? `（修为${outcome.cultivationDelta}）`
                    : ''
          const badParts: string[] = []
          if ('bodyDelta' in outcome && outcome.bodyDelta) badParts.push(`体魄${outcome.bodyDelta}`)
          if ('luckDelta' in outcome && outcome.luckDelta) badParts.push(`机缘${outcome.luckDelta}`)
          if ('cultivationDelta' in outcome && outcome.cultivationDelta) badParts.push(`修为${outcome.cultivationDelta}`)
          const badExtra = badParts.length ? `（${badParts.join('，')}）` : ''
          // 冷却2年，避免连续刷同一个剧情
          next = { ...next, treasureCd: 2 }
          const suffix = [extra, badExtra].filter(Boolean).join('')
          return { ...next, logs: pushLog(next, `${outcome.text}${suffix}`) }
        }},
        { id: 'leave', text: '不是自己的东西，不拿', effect: (g2) => {
          return { ...g2, treasureCd: 1, logs: pushLog(g2, '你没有动那个包袱，转身离开了。') }
        }},
      ],
    },
    // ===== 10~15岁：坊市救妖（锚点）→ 偶发回礼/脚印 =====
    {
      id: 'E235_market_rescue_demon',
      title: '坊市一隅',
      minAge: 10, maxAge: 15,
      condition: (g) => !hasFlag(g, 'market_demon_rescued') && !hasFlag(g, 'life_swap_market_demon_used'),
      weight: (g) => 18 + Math.floor(g.stats.luck / 14),
      text: (_g, rng) => {
        const price = rng.chance(0.4) ? 500 : 200
        const gender: 'male' | 'female' = rng.chance(0.55) ? 'male' : 'female'
        const t = gender === 'female' ? '她' : '他'
        const trait = rng.pickOne(BEAST_TRAITS)
        return `坊市里人声鼎沸。\n你却在角落看见一个小铁笼，笼里蜷着一只瘦瘦的小妖兽。\n${t}身上妖气被符纸压得几乎散尽，眼睛却还亮。\n摊主不耐烦地敲着笼子：「要救就掏钱，不救就别挡路。」\n\n标价：${price}灵石。\n[market_demon_price:${price}][market_demon_gender:${gender}][market_demon_trait:${trait}]`
      },
      options: (g) => {
        const m = g.currentEvent?.rawText.match(/\[market_demon_price:(\d+)\]/)
        const price = m ? parseInt(m[1]) : 200
        const afford = g.money >= price
        return [
          {
            id: 'buy',
            text: afford ? `掏出${price}灵石，把它买下来放生` : `掏出${price}灵石把它买下来（灵石不足）`,
            effect: (g2) => {
              const m2 = g2.currentEvent?.rawText.match(/\[market_demon_price:(\d+)\]/)
              const p = m2 ? parseInt(m2[1]) : 200
              const gm = g2.currentEvent?.rawText.match(/\[market_demon_gender:(male|female)\]/)
              const gender = (gm?.[1] as 'male' | 'female') || 'male'
              const t = gender === 'female' ? '她' : '他'
              if (g2.money < p) {
                const next = { ...g2, stats: { ...g2.stats, luck: Math.max(0, g2.stats.luck - 1) } }
                return { ...next, logs: pushLog(next, `你摸了摸口袋，灵石不够。\n摊主嗤笑一声，把笼子拖回阴影里。\n你心里发闷。（机缘-1）`) }
              }
              let next: GameState = { ...g2, money: g2.money - p }
              next = addFlag(next, 'market_demon_rescued')
              next = addFlag(next, 'market_demon_anchor')
              if (gender === 'female') next = addFlag(next, 'market_demon_gender_female')
              next = { ...next, marketDemonCd: 1 } // 刚救下不立刻刷回礼
              next = { ...next, stats: { ...next.stats, luck: Math.min(100, next.stats.luck + 1) } }
              return { ...next, logs: pushLog(next, `你把灵石拍在摊前，抱起铁笼一路跑到坊市外。\n符纸被你撕下时，${t}抖得厉害，却没有咬你。\n你把它放回草丛里。\n${t}回头看了你一眼，像把你的气息记进骨头里。\n（灵石-${p}，机缘+1）`) }
            },
          },
          {
            id: 'ignore',
            text: '转身离开',
            effect: (g2) => {
              let next = addFlag(g2, 'market_demon_ignored')
              return { ...next, logs: pushLog(next, '你最终还是走开了。\n坊市的喧闹把那点呜咽吞得干干净净。') }
            },
          },
        ]
      },
    },
    {
      id: 'E236_market_demon_gifts',
      title: '屋外的脚印',
      minAge: 10, maxAge: 160,
      condition: (g) => hasFlag(g, 'market_demon_rescued') && (g.marketDemonCd || 0) <= 0 && !hasFlag(g, 'life_swap_market_demon_used'),
      weight: (g) => 7 + Math.floor(g.stats.luck / 25),
      text: (_g, rng) => {
        const signs = [
          '清晨你推开门，地上有一串很轻的脚印，绕着门槛转了一圈。',
          '夜里下了雨，院角留下几枚新鲜的爪印，像有人来过又匆匆离去。',
          '你回到住处，发现窗下的泥地被悄悄压出一道浅浅的痕。',
        ]
        const s = rng.pickOne(signs)
        return `${s}\n草丛里埋着一个小小的布包，像是刻意留给你的。`
      },
      options: (_g, _rng) => [
        {
          id: 'dig',
          text: '挖出来看看',
          effect: (g2, rng2) => {
            const t = taByFlagGender(g2, 'market_demon_gender_female')
            let next: GameState = { ...g2, marketDemonCd: rng2.nextInt(2, 4) }
            const roll = rng2.nextFloat()
            if (roll < 0.12) {
              next = { ...next, items: [...next.items, '回天破境丹'] }
              return { ...next, logs: pushLog(next, `你挖出一个玉瓶，瓶身还带着点温度。\n像是刚被${t}用爪尖推到这里。\n（获得「回天破境丹」）`) }
            }
            if (roll < 0.5) {
              const item = rng2.pickOne(['启灵草', '澄心露', '小福符', '聚灵丹', '洗髓丹'])
              next = { ...next, items: [...next.items, item] }
              return { ...next, logs: pushLog(next, `布包里放着一份很干净的东西，像被细心拣过。\n不远处草叶轻轻一晃，你听见一声几乎听不见的呜咽。\n（获得「${item}」）`) }
            }
            const money = rng2.nextInt(30, 120)
            next = { ...next, money: next.money + money }
            return { ...next, logs: pushLog(next, `布包里是几块零零碎碎的灵石，像从哪里一点点攒来的。\n你抬头时，脚印已经被风吹乱。\n（灵石+${money}）`) }
          },
        },
        {
          id: 'leave',
          text: '不动它，装作没看见',
          effect: (g2, rng2) => {
            let next: GameState = { ...g2, marketDemonCd: rng2.nextInt(1, 3) }
            next = { ...next, stats: { ...next.stats, luck: Math.min(100, next.stats.luck + 1) } }
            return { ...next, logs: pushLog(next, '你把门轻轻关上，假装什么都没发生。\n可那串脚印在你心里留了很久。（机缘+1）') }
          },
        },
      ],
    },
    {
      id: 'E250_encounter',
      title: '路遇佳人',
      minAge: 14, maxAge: 60,
      condition: (g) => !hasFlag(g, 'met_traveler'),
      weight: () => 12,
      text: (_g, rng) => {
        const name = genName(rng, 'male')
        const app = genAppearance(rng, 'male')
        const pers = genPersonality(rng)
        return `你在外出时遇到了一个陌生人。\n他叫「${name}」，${app}，看起来${pers}。\n他似乎也是修仙者，正在赶路。\n[temp_traveler:${name}|${app}|${pers}]`
      },
      options: (_g, _rng) => [
        { id: 'chat', text: '上前攀谈', effect: (g2, rng2) => {
          const match = g2.currentEvent?.rawText.match(/\[temp_traveler:(.+?)\|(.+?)\|(.+?)\]/)
          const name = match?.[1] || genName(rng2, 'male')
          const app = match?.[2] || genAppearance(rng2, 'male')
          const pers = match?.[3] || genPersonality(rng2)
          let person = createPerson(rng2, 'friend', { name, appearance: app, personality: pers, gender: 'male', realm: 'qi', age: g2.age + rng2.nextInt(-5, 10), favor: 15 }, !g2.hasPastLover)
          let baseNext: GameState = g2
          if (person.isPastLover) baseNext = { ...baseNext, hasPastLover: true }
          const cameo = maybeApplyFriendCameo(rng2, baseNext, person)
          baseNext = cameo.g
          person = cameo.p
          let next = addRelation(baseNext, person)
          next = addFlag(next, 'met_traveler')
          return { ...next, logs: pushLog(next, `你们聊得很投机，互相留下了联系方式。\n「${person.name}」成为了你的朋友。${person.isPastLover ? '\n（他看你的眼神有些奇怪……）' : ''}`) }
        }},
        { id: 'nod', text: '点头示意后离开', effect: (g2) => {
          let next = addFlag(g2, 'met_traveler')
          return { ...next, logs: pushLog(next, '你们互相点头致意，然后各自离去。江湖之大，也许还会再见。') }
        }},
      ],
    },

    // ===== 节日/同行（约会事件，可选关系NPC一起）=====
    {
      id: 'E370_festival',
      title: '人间灯会',
      minAge: 14, maxAge: 120,
      condition: (g) => (hasFlag(g, 'in_sect') || hasFlag(g, 'is_loose_cultivator')) && !hasFlag(g, 'festival_used_this_year'),
      weight: (g) => 18 + Math.floor(g.stats.luck / 12),
      text: (_g, rng) => {
        const festivals = [
          { name: '上元灯会', desc: '满街花灯，猜谜饮酒' },
          { name: '花朝节', desc: '踏青赏花，簪花祈福' },
          { name: '祭剑节', desc: '剑鸣如潮，市集热闹' },
          { name: '七夕', desc: '桥边许愿，红绳系铃' },
        ]
        const f = rng.pickOne(festivals)
        return `山下凡人城镇正逢${f.name}。\n${f.desc}。\n你忽然生出一点贪恋人间烟火的心。\n要不要约个人一起去？`
      },
      options: (g, _rng) => {
        const cands = g.relations
          .filter(r => r.status === 'alive' && r.role !== 'parent' && r.age >= 14)
          .sort((a, b) => b.favor - a.favor)
          .slice(0, 6)
        const opts = cands.map(p => ({
          id: `invite_${p.id}`,
          text: `约「${p.name}」同行`,
          effect: (g2: GameState, rng2: ReturnType<typeof makeRng>) => {
            let next = addFlag(g2, 'festival_used_this_year')
            const person = getRelationById(next, p.id)!
            const stage = getChatStage(next, person)
            const neutralSnips = [
              '你们并肩走在灯海里，人潮拥挤。',
              '你们在摊前停步，买了一串糖葫芦。',
              '你们猜灯谜猜到脸红，旁人都笑。',
              '你们在桥上听风，远处烟火亮起。',
            ]
            const ambigSnips = [
              '人潮挤来，对方下意识把你护到身侧，手却没立刻松开。',
              '灯火映在对方眼里，像一场不肯熄的雪。',
              '你转头时，恰好撞进对方的目光里——那一瞬像被烫到。',
              '对方低声说了句什么，你没听清，却听见自己心跳。',
            ]
            const scene = rng2.pickOne(stage === 'ambiguous' ? [...neutralSnips, ...ambigSnips] : neutralSnips)

            const favorGain = randRelGain(rng2, 8, 15)
            let affectionGain = 0
            if (person.favor >= 80 && person.age >= 14 && !isMarriedToOther(person) && !person.affectionLocked) {
              affectionGain = randRelGain(rng2, 8, 15)
            }
            next = updateRelation(next, p.id, { favor: clamp(person.favor + favorGain, 0, 100), affection: clamp((person.affection || 0) + affectionGain, 0, 100) })
            // 弹窗展示“约会剧情”，关闭后再写入日志
            const line = getChatText(rng2, next, { ...person, favor: clamp(person.favor + favorGain, 0, 100), affection: clamp((person.affection || 0) + affectionGain, 0, 100) })
            const text = `你与「${p.name}」一同下山赴灯会。\n${scene}\n\n${line}\n\n（好感+${favorGain}${affectionGain > 0 ? `，心动+${affectionGain}` : ''}）`
            next = { ...next, yearFlags: { ...next.yearFlags, popup: { title: '赴灯会', text } } }
            next = { ...next, logs: pushLog(next, `你与「${p.name}」一同下山赴灯会。（好感+${favorGain}${affectionGain > 0 ? `，心动+${affectionGain}` : ''}）`) }
            return next
          },
        }))
        opts.push({
          id: 'alone',
          text: '独自去走走',
          effect: (g2: GameState) => {
            let next = addFlag(g2, 'festival_used_this_year')
            const text = '你独自走进灯火里，听人间笑语。热闹与孤独同在，你却觉得心安。'
            next = { ...next, yearFlags: { ...next.yearFlags, popup: { title: '赴灯会', text } } }
            next = { ...next, logs: pushLog(next, '你独自下山赴灯会。') }
            return next
          },
        })
        return opts
      },
    },

    // ===== 青梅竹马重逢 =====
    {
      id: 'E300_childhood_return',
      title: '故人重逢',
      minAge: 15, maxAge: 40,
      condition: (g) => hasFlag(g, 'childhood_separated') && !hasFlag(g, 'childhood_returned'),
      weight: () => 50,
      text: (g) => {
        const childhood = g.relations.find(r => r.role === 'childhood')
        return `你以为再也见不到「${childhood?.name}」了。\n没想到在宗门外的坊市，你看到了一个熟悉的身影。\n他长大了，${genAppearance(makeRng(g.seed + g.age), 'male')}，但你一眼就认出了他。`
      },
      options: (g) => {
        const childhood = g.relations.find(r => r.role === 'childhood')!
        const hasKeepsake = hasFlag(g, 'gave_childhood_keepsake')
        const hadRegret = hasFlag(g, 'childhood_regret')
        
        const opts: { id: string; text: string; effect: (g: GameState, rng: ReturnType<typeof makeRng>) => GameState }[] = [
          { id: 'call', text: '叫他的名字', effect: (g2) => {
            let next = updateRelation(g2, childhood.id, { favor: childhood.favor + 30, status: 'alive', age: g2.age + 1 })
            next = addFlag(next, 'childhood_returned')
            return { ...next, logs: pushLog(next, `「${childhood.name}！」\n他转身，眼中满是惊喜。「是你！」\n他快步走来，握住你的手：「我找了你好久。」`) }
          }},
        ]
        
        if (hasKeepsake) {
          opts.push({ id: 'keepsake', text: '拿出当年的信物', effect: (g2) => {
            let next = updateRelation(g2, childhood.id, { favor: childhood.favor + 45, status: 'alive', age: g2.age + 1 })
            next = addFlag(next, 'childhood_returned')
            return { ...next, logs: pushLog(next, `你默默拿出那个他当年给你的小东西。\n他愣住了，然后笑了，眼眶有些红。\n「你还留着……」\n「当然。」`) }
          }})
        }
        
        if (hadRegret) {
          opts.push({ id: 'apologize', text: '「对不起，当年我跑掉了」', effect: (g2) => {
            let next = updateRelation(g2, childhood.id, { favor: childhood.favor + 35, status: 'alive', age: g2.age + 1 })
            next = addFlag(next, 'childhood_returned')
            return { ...next, logs: pushLog(next, `他愣了一下，然后温柔地笑了。\n「傻瓜，我怎么会怪你。」\n「能再见到你，就够了。」`) }
          }})
        }
        
        return opts
      },
    },
    {
      id: 'E305_beast_returns',
      title: '化形归来',
      minAge: 14, maxAge: 60,
      condition: (g) => hasFlag(g, 'saved_beast') && !hasFlag(g, 'met_beast_human'),
      weight: (g) => 55 + Math.floor(g.stats.luck / 8),
      text: (g, rng) => {
        const kind = g.flags.find(f => f.startsWith('beast_kind_'))?.replace('beast_kind_', '') || 'fox'
        const traitByKind: Record<string, string> = {
          fox: '雪白狐耳与一条蓬松长尾',
          cat: '乌黑猫耳与细长尾巴',
          wolf: '灰蓝狼耳与短尾',
          deer: '额间淡淡灵纹与一对尖耳',
        }
        const trait = traitByKind[kind] || rng.pickOne(BEAST_TRAITS)
        const gender: 'male' | 'female' = rng.chance(0.5) ? 'male' : 'female'
        const name = genName(rng, gender)
        const t = gender === 'female' ? '她' : '他'
        return `夜雨骤落，你在回廊下避雨。\n一人撑伞而来，衣袍微湿，眸色却亮得惊人。\n${t}站定，耳尖与尾影在灯下一晃。\n「原来是你。」${t}低头笑了一下，「我终于找到你了。」\n那双眼睛——和当年竹林里的小兽一模一样。\n[temp_beast_human:${name}|${trait}|${gender}]`
      },
      options: (_g, _rng) => [
        {
          id: 'ask',
          text: '「你……是谁？」',
          effect: (g2, rng2) => {
            const m = g2.currentEvent?.rawText.match(/\[temp_beast_human:(.+?)\|(.+?)\|(male|female)\]/)
            const name = m?.[1] || genName(rng2, 'male')
            const trait = m?.[2] || rng2.pickOne(BEAST_TRAITS)
            const gender = (m?.[3] as 'male' | 'female') || 'male'
            let person = createPerson(rng2, 'demon_friend', {
              name,
              gender,
              race: 'demon',
              realm: 'qi',
              age: g2.age + rng2.nextInt(0, 20),
              favor: rng2.nextInt(25, 45),
              beastTrait: trait,
              appearance: `眉眼清隽，衣袍带雨（化形仍保留：${trait}）`,
              personality: rng2.pickOne(PERSONALITIES),
              flags: ['beast_origin'],
            }, !g2.hasPastLover)
            let next: GameState = g2
            if (person.isPastLover) next = { ...next, hasPastLover: true }
            const cameo = maybeApplyFriendCameo(rng2, next, person)
            next = cameo.g
            person = cameo.p
            next = addRelation(next, person)
            next = addFlag(next, 'met_beast_human')
            next = addFlag(next, `beast_human_id_${person.id}`)
            return { ...next, logs: pushLog(next, `你终于明白：眼前这位，正是你小时候在竹林里救下的那只灵兽。\n「我欠你一命。」${person.name}轻声说。\n${tade(person)}尾巴不受控地轻轻一扫，又很快藏起。\n从此，你的关系里多了一个“旧缘”。`) }
          },
        },
        {
          id: 'run',
          text: '后退一步，保持距离',
          effect: (g2) => {
            let next = addFlag(g2, 'met_beast_human')
            next = addFlag(next, 'beast_human_avoided')
            return { ...next, logs: pushLog(next, '你本能地后退了一步。对方没有逼近，只是垂眸轻笑：「……我会等你不怕我那天。」') }
          },
        },
      ],
    },

    // ===== 妖族报恩/复仇 =====
    {
      id: 'E310_demon_return_good',
      title: '妖族报恩',
      minAge: 16, maxAge: 50,
      condition: (g) => hasFlag(g, 'saved_little_demon') && !hasFlag(g, 'demon_returned'),
      weight: () => 40,
      text: (_g, rng) => {
        const name = genName(rng, 'male')
        const app = genAppearance(rng, 'male')
        return `你在一次危机中，被一个陌生人救了。\n他${app}，周身有淡淡的妖气。\n「不记得我了？」他歪头看你，有点委屈。\n「你小时候救过我。」他指了指心口，「这里，一直记得。」\n[temp_demon:${name}|${app}]`
      },
      options: (_g, _rng) => [
        { id: 'remember', text: '「是你！那只小妖兽？」', effect: (g2, rng2) => {
          const match = g2.currentEvent?.rawText.match(/\[temp_demon:(.+?)\|(.+?)\]/)
          const name = match?.[1] || genName(rng2, 'male')
          const app = match?.[2] || genAppearance(rng2, 'male')
          let demon = createPerson(rng2, 'demon_friend', { name, appearance: app, gender: 'male', race: 'demon', realm: 'core', age: g2.age + 160, favor: 50 }, !g2.hasPastLover)
          // 避免初遇 40~100 的尴尬年龄段：妖族更常见为高龄化形
          demon = { ...demon, age: g2.age + 160 }
          let baseNext: GameState = g2
          if (demon.isPastLover) baseNext = { ...baseNext, hasPastLover: true }
          const cameo = maybeApplyFriendCameo(rng2, baseNext, demon)
          baseNext = cameo.g
          demon = cameo.p
          let next = addRelation(baseNext, demon)
          next = addFlag(next, 'demon_returned')
          next = addFlag(next, `demon_friend_id_${demon.id}`)
          return { ...next, logs: pushLog(next, `他笑了，露出一点点尖牙。「现在可以化形了。」\n「以后，我来保护你。」${demon.isPastLover ? '\n（他看着你的眼神……好像在看一个失而复得的宝贝。）' : ''}`) }
        }},
        { id: 'touch', text: '伸手摸摸他的头', effect: (g2, rng2) => {
          const match = g2.currentEvent?.rawText.match(/\[temp_demon:(.+?)\|(.+?)\]/)
          const name = match?.[1] || genName(rng2, 'male')
          const app = match?.[2] || genAppearance(rng2, 'male')
          let demon = createPerson(rng2, 'demon_friend', { name, appearance: app, gender: 'male', race: 'demon', realm: 'core', age: g2.age + 160, favor: 60 }, !g2.hasPastLover)
          demon = { ...demon, age: g2.age + 160 }
          let baseNext: GameState = g2
          if (demon.isPastLover) baseNext = { ...baseNext, hasPastLover: true }
          const cameo = maybeApplyFriendCameo(rng2, baseNext, demon)
          baseNext = cameo.g
          demon = cameo.p
          let next = addRelation(baseNext, demon)
          next = addFlag(next, 'demon_returned')
          next = addFlag(next, `demon_friend_id_${demon.id}`)
          return { ...next, logs: pushLog(next, `你下意识地伸手摸了摸他的头，就像小时候那样。\n他愣住了，耳朵尖红了，小声说：「……别摸了。」${demon.isPastLover ? '\n（他的眼中闪过一丝复杂的情绪……熟悉，又陌生。）' : ''}`) }
        }},
      ],
    },
    {
      id: 'E318_meet_demon_king',
      title: '妖王过境',
      minAge: 18, maxAge: 25,
      condition: (g) => !hasFlag(g, 'met_demon_king'),
      weight: (g) => 18 + Math.floor(g.stats.luck / 10),
      text: (_g, rng) => {
        const trait = rng.pickOne(BEAST_TRAITS)
        const app = `气势如山，眸色幽深（化形仍保留：${trait}）`
        const gender: 'male' | 'female' = rng.chance(0.6) ? 'male' : 'female'
        const name = genName(rng, gender)
        const t = gender === 'female' ? '她' : '他'
        return `你在坊市外的山道上，听见人群压低的惊呼。\n一行妖气如潮而来，众人纷纷避让。\n为首之人披着黑色大氅，步伐不疾不徐，却让四周灵气都静了下来。\n${t}停在你身前，目光落下，像把你从骨头到神魂都看了一遍。\n「人修？」${t}笑得很淡，「胆子不小。」\n[temp_demon_king:${name}|${app}|${gender}]`
      },
      options: (_g, _rng) => [
        {
          id: 'steady',
          text: '不卑不亢地回视',
          effect: (g2, rng2) => {
            const m = g2.currentEvent?.rawText.match(/\[temp_demon_king:(.+?)\|(.+?)\|(male|female)\]/)
            const name = m?.[1] || genName(rng2, 'male')
            const app = m?.[2] || `气势迫人`
            const gender = (m?.[3] as 'male' | 'female') || 'male'
            let king = createPerson(rng2, 'demon_friend', {
              name,
              gender,
              race: 'demon',
              realm: rng2.chance(0.65) ? 'nascent' : 'core',
              age: rng2.nextInt(320, 800),
              favor: rng2.nextInt(10, 30),
              appearance: app,
              personality: rng2.pickOne(PERSONALITIES),
              flags: ['demon_king'],
            }, !g2.hasPastLover)
            let next: GameState = g2
            if (king.isPastLover) next = { ...next, hasPastLover: true }
            const cameo = maybeApplyFriendCameo(rng2, next, king)
            next = cameo.g
            king = cameo.p
            next = addRelation(next, king)
            next = addFlag(next, 'met_demon_king')
            next = addFlag(next, `demon_king_id_${king.id}`)
            return { ...next, logs: pushLog(next, `妖王的目光在你身上停留片刻。\n「有意思。」${ta(king)}轻声道。\n从此，你的关系里多了一位“妖王”。`) }
          },
        },
        {
          id: 'avoid',
          text: '低头退开，避其锋芒',
          effect: (g2) => {
            let next = addFlag(g2, 'met_demon_king')
            next = addFlag(next, 'demon_king_avoided')
            return { ...next, logs: pushLog(next, '你压下心跳，退到人群后方。\n妖王没有为难你，只留下一声意味不明的轻笑。') }
          },
        },
        {
          id: 'draw',
          text: '握紧兵器，戒备',
          effect: (g2, rng2) => {
            let next = addFlag(g2, 'met_demon_king')
            next = addFlag(next, 'demon_king_hostile')
            const trait = rng2.pickOne(BEAST_TRAITS)
            let king = createPerson(rng2, 'enemy', {
              name: genName(rng2, rng2.chance(0.6) ? 'male' : 'female'),
              gender: rng2.chance(0.6) ? 'male' : 'female',
              race: 'demon',
              realm: rng2.chance(0.65) ? 'nascent' : 'core',
              age: rng2.nextInt(320, 800),
              favor: rng2.nextInt(0, 10),
              appearance: `气势逼人（化形仍保留：${trait}）`,
              personality: rng2.pickOne(PERSONALITIES),
              flags: ['demon_king'],
            }, !g2.hasPastLover)
            if (king.isPastLover) next = { ...next, hasPastLover: true }
            next = addRelation(next, king)
            next = addFlag(next, `demon_king_id_${king.id}`)
            return { ...next, logs: pushLog(next, `妖王看了眼你握紧的手，笑意更冷。\n「人修，真是麻烦。」\n${ta(king)}没有出手，却把你的名字记在了心上。`) }
          },
        },
      ],
    },
    {
      id: 'E319_meet_immortal_emperor',
      title: '天外仙临',
      minAge: 14, maxAge: 160,
      condition: (g) => g.stats.face >= 80 && !hasFlag(g, 'met_immortal_emperor'),
      weight: (g) => 8 + Math.floor((g.stats.face - 80) / 2) + Math.floor(g.stats.luck / 15),
      text: (_g, rng) => {
        const gender: 'male' | 'female' = rng.chance(0.65) ? 'male' : 'female'
        const name = genName(rng, gender)
        const pers = rng.pickOne(['高冷禁欲', '神秘莫测', '深情专一'] as const)
        const t = gender === 'female' ? '她' : '他'
        return `你在山巅回望人间，云海翻涌。\n忽有一道清光落下，天地间的灵气像被按住呼吸。\n${t}立在你身前，衣袂不染尘，眸光却像穿过千年。\n「你很漂亮。」${t}开口时语气平静，仿佛只是陈述一个事实。\n下一瞬，你竟有种荒诞的错觉：这一眼，足够他记你一生。\n[temp_immortal_emperor:${name}|${gender}|${pers}]`
      },
      options: (_g, _rng) => [
        {
          id: 'greet',
          text: '行礼相见',
          effect: (g2, rng2) => {
            const m = g2.currentEvent?.rawText.match(/\[temp_immortal_emperor:(.+?)\|(male|female)\|(.+?)\]/)
            const name = m?.[1] || genName(rng2, 'male')
            const gender = (m?.[2] as 'male' | 'female') || 'male'
            const pers = (m?.[3] as Person['personality']) || rng2.pickOne(PERSONALITIES)
            const age = rng2.nextInt(1000, 2000)
            const favor = rng2.nextInt(85, 100)
            const aff = rng2.nextInt(45, 70)
            let emperor = createPerson(
              rng2,
              'friend',
              {
                name,
                gender,
                race: 'human',
                realm: 'ascend',
                age,
                favor,
                affection: aff,
                appearance: '仙姿绝尘，眸色清寒（近看才知那冷里藏着极深的温）',
                personality: pers,
                flags: ['immortal_emperor'],
              },
              false
            )
            let next: GameState = g2
            // 仙帝不套用“好友复刻名”，避免剧情被奇怪名字破坏
            next = addRelation(next, emperor)
            next = addFlag(next, 'met_immortal_emperor')
            next = addFlag(next, `immortal_emperor_id_${emperor.id}`)
            return {
              ...next,
              logs: pushLog(
                next,
                `你行礼。对方只是抬了抬手，像把你从尘世里轻轻托起。\n「别怕。」${ta(emperor)}看着你，声音很低，「我会给你路。」\n从此，你的关系里多了一位……不该出现在人间的「仙帝」。`
              ),
            }
          },
        },
        {
          id: 'avoid',
          text: '屏息退后，装作没看见',
          effect: (g2) => {
            let next = addFlag(g2, 'met_immortal_emperor')
            next = addFlag(next, 'immortal_emperor_avoided')
            return { ...next, logs: pushLog(next, '你屏住呼吸，退入云雾。\n清光一闪而逝，仿佛从未有人来过。可你知道——那一眼，曾落在你身上。') }
          },
        },
      ],
    },
    {
      id: 'E311_demon_revenge',
      title: '妖族复仇',
      minAge: 16, maxAge: 60,
      condition: (g) => hasFlag(g, 'killed_little_demon') && !hasFlag(g, 'demon_revenge_done'),
      weight: () => 60,
      text: () => {
        return `一个陌生人拦住了你的去路。\n他周身妖气翻涌，眼中满是恨意。\n「你还记得，多年前你杀了一只小妖兽吗？」\n「那是我的弟弟。」`
      },
      options: (_g, _rng) => [
        { id: 'fight', text: '拔剑应战', effect: (g2, rng2) => {
          let next = addFlag(g2, 'demon_revenge_done')
          if (rng2.chance(0.3 + g2.stats.body / 200)) {
            return { ...next, stats: { ...next.stats, body: next.stats.body - 10 }, logs: pushLog(next, '你拼死一战，勉强逃脱，但身受重伤。') }
          } else {
            next = { ...next, stats: { ...next.stats, body: Math.max(1, next.stats.body - 30) } }
            return { ...next, logs: pushLog(next, '你被打得半死，他却没有杀你。「让你也尝尝失去的滋味。」他消失在夜色中。') }
          }
        }},
        { id: 'beg', text: '「对不起……」', effect: (g2) => {
          let next = addFlag(g2, 'demon_revenge_done')
          next = { ...next, stats: { ...next.stats, body: next.stats.body - 15 } }
          return { ...next, logs: pushLog(next, '「对不起有什么用？」他打伤了你，但没有取你性命。\n「活着赎罪吧。」') }
        }},
      ],
    },

    // ===== 神秘白衣人后续 =====
    {
      id: 'E320_mysterious_return',
      title: '白衣人再现',
      minAge: 18, maxAge: 40,
      condition: (g) => hasFlag(g, 'met_mysterious') && hasFlag(g, 'mysterious_looked_back') && !hasFlag(g, 'mysterious_revealed'),
      weight: () => 45,
      text: () => '你在一个意想不到的地方，又看到了那个白衣人。\n他站在人群中，却像是与世隔绝。\n他看到你，微微一笑：「果然是你。我等了你很久。」',
      options: (_g, _rng) => [
        { id: 'ask', text: '「你是谁？」', effect: (g2, rng2) => {
          const name = genName(rng2, 'male')
          let mysterious = createPerson(rng2, 'friend', { name, appearance: '白衣胜雪，不染尘埃', personality: '神秘莫测', gender: 'male', realm: 'nascent', age: 200, favor: 30 }, !g2.hasPastLover)
          let baseNext: GameState = g2
          if (mysterious.isPastLover) baseNext = { ...baseNext, hasPastLover: true }
          const cameo = maybeApplyFriendCameo(rng2, baseNext, mysterious)
          baseNext = cameo.g
          mysterious = cameo.p
          let next = addRelation(baseNext, mysterious)
          next = addFlag(next, 'mysterious_revealed')
          next = addFlag(next, `mysterious_id_${mysterious.id}`)
          const extraText = mysterious.isPastLover ? '他看着你的眼神，带着一丝心痛和怀念……' : ''
          return { ...next, logs: pushLog(next, `「我叫${name}。」他顿了顿，「你身上……有我在找的东西。」\n他没有解释更多，只是给了你一枚玉简。\n「有缘再见。」${extraText ? '\n' + extraText : ''}`) }
        }},
        { id: 'guard', text: '警惕后退', effect: (g2) => {
          let next = addFlag(g2, 'mysterious_revealed')
          return { ...next, logs: pushLog(next, '他叹了口气：「还是不信我。罢了，时机未到。」\n他转身消失在人群中。') }
        }},
      ],
    },

    // ===== 感情发展 =====
    {
      id: 'E400_confession',
      title: '月下表白',
      minAge: 16, maxAge: 80,
      condition: (g) => {
        const senior = getRelation(g, 'senior')
        const childhood = g.relations.find(r => r.role === 'childhood' && r.status === 'alive')
        const demon = g.relations.find(r => r.role === 'demon_friend' && r.status === 'alive')
        return !!(senior && senior.favor >= 60) || !!(childhood && childhood.favor >= 60) || !!(demon && demon.favor >= 60)
      },
      // 已由“每年满好感表白”机制替代；保留旧事件但不再抽取
      weight: () => 0,
      text: (g) => {
        const candidates = g.relations.filter(r => 
          (r.role === 'senior' || r.role === 'childhood' || r.role === 'demon_friend') && 
          r.status === 'alive' && r.favor >= 60
        ).sort((a, b) => b.favor - a.favor)
        const person = candidates[0]
        return `月光下，「${person?.name}」把你叫到一个僻静的地方。\n他看着你，神情紧张。\n「我……从很久之前就……」\n他顿了顿，深吸一口气。\n「我喜欢你。」`
      },
      options: (g) => {
        const candidates = g.relations.filter(r => 
          (r.role === 'senior' || r.role === 'childhood' || r.role === 'demon_friend') && 
          r.status === 'alive' && r.favor >= 60
        ).sort((a, b) => b.favor - a.favor)
        const person = candidates[0]
        if (!person) return []
        
        return [
          { id: 'accept', text: '「我也是。」', effect: (g2) => {
            const prevRole: PersonRole = person.role
            let next = updateRelation(g2, person.id, { favor: 100, role: 'lover', prevRole })
            next = addFlag(next, 'has_lover')
            next = addFlag(next, `lover_id_${person.id}`)
            next = { ...next, spouseId: person.id }
            return { ...next, logs: pushLog(next, `他愣住了，然后笑了，眼中满是光芒。\n「真的？」\n你点头。他小心翼翼地握住你的手。\n从此，你们成为了道侣。`) }
          }},
          { id: 'reject', text: '「对不起……」', effect: (g2) => {
            let next = updateRelation(g2, person.id, { favor: clamp(person.favor - 20, 0, 100) })
            return { ...next, logs: pushLog(next, `他的眼神黯淡了一瞬，但很快挤出一个笑容。\n「没关系……能说出来，我就满足了。」\n他转身离开，背影有些落寞。`) }
          }},
          { id: 'think', text: '「让我想想……」', effect: (g2) => {
            let next = addFlag(g2, `pending_confession_${person.id}`)
            return { ...next, logs: pushLog(next, `他点点头，「我等你。」\n你的心跳得很快，不知道该怎么办。`) }
          }},
        ]
      },
    },

    // ===== 转世重逢揭示（玩家上一世寿尽，长生者再遇转世）=====
    {
      id: 'E410_past_lover_reveal',
      title: '似曾相识',
      minAge: 12, maxAge: 100,
      condition: (g) => {
        const pastLover = g.relations.find(r => r.isPastLover && r.status === 'alive')
        return !!pastLover && !hasFlag(g, 'past_lover_revealed') && pastLover.affection >= 50
      },
      weight: (g) => {
        const pastLover = g.relations.find(r => r.isPastLover && r.status === 'alive')
        return pastLover ? 30 + Math.floor(pastLover.affection / 3) : 0
      },
      text: (g) => {
        const pastLover = g.relations.find(r => r.isPastLover && r.status === 'alive')
        return `「${pastLover?.name}」找到你，神情复杂。\n「有件事……我不知道该不该告诉你。」\n${taByGender(pastLover?.gender || 'male')}深吸一口气。\n「你身上的气息……我不会认错。」\n「不是我的前世，也不是你的前世——是你。」\n「只是你上一世走到寿尽那年……我没能留住你。」\n「后来我孤独了很多年。」\n「直到这一世，我终于又见到你。」\n${taByGender(pastLover?.gender || 'male')}的眼眶红了。`
      },
      options: (g) => {
        const pastLover = g.relations.find(r => r.isPastLover && r.status === 'alive')
        if (!pastLover) return []
        return [
          { id: 'touch', text: '握住他的手', effect: (g2) => {
            let next = updateRelation(g2, pastLover.id, { favor: pastLover.favor + 25, affection: Math.min(100, pastLover.affection + 20) })
            next = addFlag(next, 'past_lover_revealed')
            next = addFlag(next, 'past_lover_accepted')
            return { ...next, logs: pushLog(next, `你握住他的手。\n「我不记得上一世，也不想被过去束缚。」\n「但我愿意……从这一世开始，重新认识你。」\n他愣住了，然后紧紧握住你的手，泪水滑落。`) }
          }},
          { id: 'ask', text: '「上一世的我……是什么样？」', effect: (g2) => {
            let next = updateRelation(g2, pastLover.id, { favor: pastLover.favor + 15, affection: Math.min(100, pastLover.affection + 10) })
            next = addFlag(next, 'past_lover_revealed')
            return { ...next, logs: pushLog(next, `他露出一个怀念的笑容。\n「你很勇敢，也很倔强。」\n「你会在风雪里回头冲我笑，像什么都不怕。」\n他絮絮叨叨说了很多，像把压在心里多年的光一点点放出来。\n「你们很像。」他轻声说，「所以我……控制不住自己。」`) }
          }},
          { id: 'reject', text: '「别把我绑在过去」', effect: (g2) => {
            let next = updateRelation(g2, pastLover.id, { favor: clamp(pastLover.favor - 10, 0, 100), affection: Math.max(0, pastLover.affection - 15) })
            next = addFlag(next, 'past_lover_revealed')
            next = addFlag(next, 'past_lover_rejected')
            return { ...next, logs: pushLog(next, `他的表情僵住了。\n「我知道……对不起。」\n「你就是你。」他哑声说，「我不该把过去压在你肩上。」\n「只是……我等了太久，难免失态。」\n他转身离开，背影有些落寞。`) }
          }},
        ]
      },
    },
    {
      id: 'E411_past_lover_memory',
      title: '前世记忆',
      minAge: 15, maxAge: 120,
      condition: (g) => {
        const pastLover = g.relations.find(r => r.isPastLover && r.status === 'alive')
        return hasFlag(g, 'past_lover_accepted') && !!pastLover && pastLover.favor >= 70 && !hasFlag(g, 'past_memory_triggered')
      },
      weight: () => 50,
      text: (g) => {
        const pastLover = g.relations.find(r => r.isPastLover && r.status === 'alive')
        return `夜里，你做了一个奇怪的梦。\n梦里有个模糊的身影，他叫你的名字——\n不，那是另一个名字。\n「我会找到你的。」他在梦里说。\n「无论多少辈子。」\n你猛然惊醒，发现枕边全是泪水。\n而「${pastLover?.name}」就坐在床边，静静地看着你。`
      },
      options: (g) => {
        const pastLover = g.relations.find(r => r.isPastLover && r.status === 'alive')
        if (!pastLover) return []
        return [
          { id: 'remember', text: '「我好像……想起来了」', effect: (g2) => {
            const prevRole: PersonRole = pastLover.role
            let next = updateRelation(g2, pastLover.id, { favor: 100, affection: 100, role: 'lover', prevRole })
            next = addFlag(next, 'past_memory_triggered')
            next = addFlag(next, 'has_lover')
            next = addFlag(next, `lover_id_${pastLover.id}`)
            next = { ...next, spouseId: pastLover.id }
            return { ...next, logs: pushLog(next, `碎片般的记忆涌入脑海。\n那不是“谁”的人生——那是你上一世曾走过的路。\n你想起了一个名字，想起了风雪与灯火，想起了寿尽那一年的告别。\n「是你……」你看着他，泪流满面。\n他颤抖着把你抱进怀里。\n「找到你了……终于找到你了。」\n你们紧紧相拥，仿佛怕再次失去彼此。`) }
          }},
          { id: 'confused', text: '「那只是一个梦」', effect: (g2) => {
            let next = updateRelation(g2, pastLover.id, { favor: pastLover.favor + 10 })
            next = addFlag(next, 'past_memory_triggered')
            return { ...next, logs: pushLog(next, `「是吗……」他轻声说，眼中有一丝失落。\n「没关系。即使你不记得。」\n「这一世，我也会好好爱你。」`) }
          }},
        ]
      },
    },

    // ===== 突破 =====
    {
      id: 'E500_breakthrough',
      title: '突破契机',
      minAge: 10, maxAge: 150,
      condition: (g) => canBreakthrough(g) && !hasFlag(g, 'breakthrough_pending'),
      weight: () => 80,
      text: (g) => {
        const nextRealm = getNextRealm(g.realm)
        const rate = getBreakthroughRate(g)
        return `你感觉修为已经到了瓶颈。\n如果能突破到${REALM_NAMES[nextRealm!]}期，寿命和实力都会大涨。\n但突破有风险……失败可能受伤，甚至走火入魔。`
          + `\n\n【当前突破成功率】${Math.floor(rate * 100)}%（基础每突破一次-20%，境界越高越难，丹药可提升）`
      },
      options: (g) => {
        const nextRealm = getNextRealm(g.realm)!
        const successRate = getBreakthroughRate(g)
        const lover = g.relations.find(r => r.role === 'lover' && r.status === 'alive')
        
        const opts: { id: string; text: string; effect: (g: GameState, rng: ReturnType<typeof makeRng>) => GameState }[] = [
          { id: 'try', text: `尝试突破（成功率${Math.floor(successRate * 100)}%）`, effect: (g2, rng) => {
            // 破境丹：旧物品“自动生效”——这里给一次性+20%（不消耗物品）
            const hasAuto = g2.items.includes('破境丹')
            const rate = clamp(successRate + (hasAuto ? 0.2 : 0), 0.05, 1)

            if (rng.chance(rate)) {
              let next = { ...g2, realm: nextRealm, cultivation: 0, breakthroughDrops: g2.breakthroughDrops + 1 }
              next = maybeTriggerEarlyCoreGenius(rng, next, nextRealm)
              // 每突破一次基础-20%：通过breakthroughDrops体现
              return { ...next, logs: pushLog(next, `天降异象！你成功突破到了${REALM_NAMES[nextRealm]}期！\n（本局突破次数：${next.breakthroughDrops}）`) }
            }

            // 失败：小概率走火入魔死亡，否则重伤
            const deathChance = clamp(0.12 + getRealmIdx(g2.realm) * 0.05 + (0.35 - rate) * 0.4, 0.1, 0.5)
            if (!rng.chance(deathChance)) {
              let next = { ...g2, cultivation: Math.max(0, g2.cultivation - 30), stats: { ...g2.stats, body: Math.max(10, g2.stats.body - 20) } }
              return { ...next, logs: pushLog(next, '突破失败！你受了重伤，修为倒退。需要好好休养。') }
            }

            // 走火入魔死亡 → 换命救回
            let dead = killPlayer(g2, '突破失败，走火入魔……你的意识逐渐消散。')

            // 0) 坊市救下的小妖兽：必定来换命（100%）
            if (hasFlag(dead, 'market_demon_rescued') && !hasFlag(dead, 'life_swap_market_demon_used')) {
              let revived = addFlag(dead, 'life_swap_market_demon_used')
              const t = taByFlagGender(revived, 'market_demon_gender_female')
              revived = { ...revived, alive: true, realm: nextRealm, cultivation: 0, breakthroughDrops: revived.breakthroughDrops + 1 }
              revived = maybeTriggerEarlyCoreGenius(rng, revived, nextRealm)
              revived = { ...revived, logs: pushLog(revived, `黑暗里，你听见很轻的一声呜咽。\n像雨夜，像坊市里那只被你放回草丛的小妖兽。\n${t}不知道何时来到你身边，把最后一点妖血与魂火押给你。\n「……还你。」\n下一瞬，你的神魂被硬生生拽回。`) }
              revived = { ...revived, logs: pushLog(revived, `你从死亡边缘醒来，竟已突破至${REALM_NAMES[nextRealm]}期。\n而那点妖气，彻底散在风里。`) }
              return revived
            }

            // 1) 若存在心动>50的NPC：80%概率一命换一命
            const candidates = dead.relations
              .filter(r => r.status === 'alive' && r.role !== 'parent' && (r.affection || 0) > 50)
              .sort((a, b) => (b.affection || 0) - (a.affection || 0))
            if (candidates.length > 0 && rng.chance(0.8)) {
              const saver = candidates[0]
              const saveLineByRole: Record<PersonRole, string[]> = {
                parent: [],
                childhood: ['「我欠你一生。」他声音发颤，「这次换我来护你。」', '「别怕。」他把你抱紧，「我来。」'],
                master: ['「……胡闹。」他低声道，却把灵力渡给你，「命，我替你担。」', '「你是我弟子。」他闭眼，「我不会让你死。」'],
                senior: ['「别睡。」他咬牙，「听见没有？」', '「你敢死，我就……」他哽住，「我来换你。」'],
                junior: ['「不行！」他红着眼，「师姐，你不能死！」', '「我求你醒过来。」'],
                friend: ['「你别走。」他声音很轻，却像用尽力气。', '「我欠你。」他说，「现在还。」'],
                lover: ['「我来。」他把你抱进怀里，「别怕。」', '「你若走，我便随你。」'],
                enemy: ['他冷笑一声：「你死了，我找谁算账？」', '「别想逃。」他低声道。'],
                demon_friend: ['他尾巴死死缠住你：「不许死。」', '「你救过我。」他咬牙，「我还你。」'],
              }
              const byP = saveLineByRole[saver.role] || saveLineByRole.friend
              const line = rng.pickOne(byP.length ? byP : ['「我来。」'])
              let revived = dead
              revived = updateRelation(revived, saver.id, { status: 'dead' })
              revived = { ...revived, alive: true, realm: nextRealm, cultivation: 0, breakthroughDrops: revived.breakthroughDrops + 1 }
              revived = maybeTriggerEarlyCoreGenius(rng, revived, nextRealm)
              revived = { ...revived, logs: pushLog(revived, `生死一线之际，「${saver.name}」赶来。\n${line}\n${ta(saver)}以命换命，你的神魂被硬生生拉回。`) }
              revived = { ...revived, logs: pushLog(revived, `你在血与光中醒来——竟已突破至${REALM_NAMES[nextRealm]}期。\n「${saver.name}」却再也醒不过来。`) }
              return revived
            }

            // 2) 若小时候救过小妖兽：它必定来换命（100%）
            if (candidates.length === 0 && hasFlag(dead, 'saved_little_demon') && !hasFlag(dead, 'life_swap_beast_used')) {
              let revived = addFlag(dead, 'life_swap_beast_used')
              // 若已有妖友则用妖友，否则生成一个“旧妖缘”
              const existing = revived.relations.find(r => r.status === 'alive' && r.race === 'demon')
              let saver = existing
              if (!saver) {
                const rng2 = makeRng(revived.seed + revived.age * 1234 + revived.logs.length)
                saver = createPerson(rng2, 'demon_friend', {
                  name: genName(rng2, rng2.chance(0.5) ? 'male' : 'female'),
                  gender: rng2.chance(0.5) ? 'male' : 'female',
                  race: 'demon',
                  realm: 'core',
                  age: revived.age + 200,
                  favor: 60,
                  affection: 80,
                  appearance: `眉眼清隽，白发如雪（化形仍保留：${rng2.pickOne(BEAST_TRAITS)}）`,
                  personality: rng2.pickOne(PERSONALITIES),
                  flags: ['saved_origin_beast'],
                }, !revived.hasPastLover)
                revived = addRelation(revived, saver)
              }
              revived = updateRelation(revived, saver!.id, { status: 'dead' })
              revived = { ...revived, alive: true, realm: nextRealm, cultivation: 0, breakthroughDrops: revived.breakthroughDrops + 1 }
              revived = maybeTriggerEarlyCoreGenius(rng, revived, nextRealm)
              revived = { ...revived, logs: pushLog(revived, `黑暗中，你听见一声熟悉的呜咽。\n当年你救下的小妖兽，竟已化形归来。\n「欠你的，我还。」它（他/她）把命交给你。`) }
              revived = { ...revived, logs: pushLog(revived, `你从死亡边缘被拉回，转瞬间突破至${REALM_NAMES[nextRealm]}期。\n而它，魂飞魄散。`) }
              return revived
            }

            return dead
          }},
          { id: 'wait', text: '再准备准备', effect: (g2) => {
            return { ...g2, logs: pushLog(g2, '你决定再积累一下，等时机更成熟。') }
          }},
        ]
        
        if (lover) {
          opts.splice(1, 0, { id: 'with_lover', text: `和${lover.name}一起突破（成功率+15%）`, effect: (g2, rng) => {
            const hasAuto = g2.items.includes('破境丹')
            const rate = clamp(successRate + 0.15 + (hasAuto ? 0.2 : 0), 0.05, 1)
            if (rng.chance(rate)) {
              let next = { ...g2, realm: nextRealm, cultivation: 0, breakthroughDrops: g2.breakthroughDrops + 1 }
              next = maybeTriggerEarlyCoreGenius(rng, next, nextRealm)
              next = updateRelation(next, lover.id, { favor: clamp(lover.favor + 8, 0, 100) })
              return { ...next, logs: pushLog(next, `有${lover.name}在身边，你心神安定。\n天降异象！你成功突破到了${REALM_NAMES[nextRealm]}期！`) }
            }
            // 失败：比单人更安全，基本不致命
            let next = { ...g2, cultivation: Math.max(0, g2.cultivation - 20), stats: { ...g2.stats, body: Math.max(10, g2.stats.body - 10) } }
            next = updateRelation(next, lover.id, { favor: clamp(lover.favor + 10, 0, 100) })
            return { ...next, logs: pushLog(next, `突破失败……但${lover.name}一直守在你身边，替你稳住心神。`) }
          }})
        }
        
        return opts
      },
    },

    // ===== 生死 =====
    {
      id: 'E600_near_death',
      title: '生死一线',
      minAge: 20, maxAge: 150,
      condition: (g) => g.stats.body <= 30,
      weight: (g) => 20 + (30 - g.stats.body),
      text: () => '你在一次意外中身受重伤，命悬一线。\n昏迷中，你仿佛看到了曾经的一幕幕……',
      options: (g) => {
        const lover = g.relations.find(r => r.role === 'lover' && r.status === 'alive')
        const opts: { id: string; text: string; effect: (g: GameState, rng: ReturnType<typeof makeRng>) => GameState }[] = [
          { id: 'fight', text: '我不能死在这里！', effect: (g2, rng) => {
            // 意志挣扎：成功率固定20%，避免“每次都能活”
            if (rng.chance(0.2)) {
              return { ...g2, stats: { ...g2.stats, body: 40 }, logs: pushLog(g2, '凭借顽强的意志，你活了下来。') }
            } else {
              return killPlayer(g2, '你的意识渐渐模糊……一切归于黑暗。')
            }
          }},
        ]
        if (lover) {
          opts.push({ id: 'lover_save', text: `「${lover.name}……」`, effect: (g2) => {
            let next = { ...g2, stats: { ...g2.stats, body: 50 } }
            next = updateRelation(next, lover.id, { favor: lover.favor + 20 })
            return { ...next, logs: pushLog(next, `你喃喃念着他的名字，突然感觉有人握住了你的手。\n「我在。」\n是${lover.name}。他守了你三天三夜，直到你醒来。`) }
          }})
        }
        return opts
      },
    },

    // ===== 飞升 =====
    {
      id: 'E700_ascend',
      title: '飞升',
      minAge: 50, maxAge: 200,
      condition: (g) => g.realm === 'nascent' && g.cultivation >= 100,
      weight: () => 100,
      text: () => '你的修为已经到达了这个世界的顶点。\n天空中出现异象，仙界的大门似乎在向你敞开。\n你即将……飞升。',
      options: (g) => {
        const lover = g.relations.find(r => r.role === 'lover' && r.status === 'alive')
        const opts: { id: string; text: string; effect: (g: GameState, rng: ReturnType<typeof makeRng>) => GameState }[] = [
          { id: 'ascend', text: '飞升', effect: (g2) => {
            let next = { ...g2, realm: 'ascend' as Realm }
            return { ...next, logs: pushLog(next, '你踏入仙门，回头看了一眼人间。\n从此，你成为了传说。\n【飞升结局】') }
          }},
        ]
        if (lover) {
          if (getRelationById(g, lover.id)?.realm === 'nascent') {
            opts.push({ id: 'together', text: `和${lover.name}一起飞升`, effect: (g2) => {
              let next = { ...g2, realm: 'ascend' as Realm }
              return { ...next, logs: pushLog(next, `你握住${lover.name}的手。\n「一起。」\n「一起。」\n你们并肩踏入仙门，金光闪耀。\n【圆满结局】`) }
            }})
          } else {
            opts.push({ id: 'stay', text: `放弃飞升，留下陪他`, effect: (g2) => {
              let next = updateRelation(g2, lover.id, { favor: 100 })
              return { ...next, logs: pushLog(next, `你看着天上的仙门，又看了看${lover.name}。\n「我不走了。」\n他愣住了，眼眶红了。\n「傻瓜……」\n【相守结局】`) }
            }})
          }
        }
        return opts
      },
    },

    // ===== 金丹后：有人拜你为师（收徒/传承）=====
    {
      id: 'E810_disciple_seeks',
      title: '叩门求师',
      minAge: 18, maxAge: 160,
      condition: (g) =>
        g.alive &&
        !hasFlag(g, 'took_disciple') &&
        (hasFlag(g, 'in_sect') || hasFlag(g, 'is_loose_cultivator')) &&
        getRealmIdx(g.realm) >= getRealmIdx('core'),
      weight: (g) => 16 + Math.floor(g.stats.luck / 18),
      text: (_g, rng) => {
        const weather = rng.pickOne(['夜雨', '初雪', '暮色', '清晨薄雾'])
        return `${weather}时分，你住处门环被轻轻叩响。\n门外站着一个年轻修士，衣衫被风吹得猎猎。\n「前辈。」\nTA低声道：「我想拜您为师。」`
      },
      options: (_g, _rng) => [
        {
          id: 'accept',
          text: '收下徒弟',
          effect: (g2, rng2) => {
            const gender: 'male' | 'female' = rng2.chance(0.55) ? 'male' : 'female'
            const name = genName(rng2, gender)
            const app = genAppearance(rng2, gender)
            const pers = genPersonality(rng2)
            const age = rng2.nextInt(14, 22)
            const realm: Realm = rng2.chance(0.7) ? 'mortal' : 'qi'
            let disciple = createPerson(
              rng2,
              'junior',
              {
                name,
                gender,
                age,
                realm,
                favor: rng2.nextInt(25, 45),
                appearance: app,
                personality: pers,
                flags: ['disciple_of_player'],
              },
              false
            )
            const cameo = maybeApplyFriendCameo(rng2, g2, disciple)
            let next: GameState = cameo.g
            disciple = cameo.p
            next = addRelation(next, disciple)
            next = addFlag(next, 'took_disciple')
            next = { ...next, logs: pushLog(next, `你收下了${nameWithRole(disciple)}。\nTA跪下叩首，声音发颤：「弟子谨记师训。」\n从此，你也成了别人命里的一盏灯。`) }
            return next
          },
        },
        {
          id: 'refuse',
          text: '婉拒',
          effect: (g2, rng2) => {
            let next = addFlag(g2, 'took_disciple')
            if (rng2.chance(0.45)) next = { ...next, stats: { ...next.stats, luck: Math.min(100, next.stats.luck + 1) } }
            return { ...next, logs: pushLog(next, '你没有收徒。\n门外那人沉默良久，向你行了一礼，转身没入风里。') }
          },
        },
      ],
    },

    // ===== 特殊事件（由每年逻辑主动触发，不参与随机抽取）=====
    {
      id: 'S900_npc_marriage',
      title: '喜讯传来',
      minAge: 0, maxAge: 999,
      condition: () => false,
      weight: () => 0,
      text: (g) => g.currentEvent?.rawText || '',
      options: (g) => {
        const m = g.currentEvent?.rawText.match(/\[npc_marriage:(.+?)\|(.+?)\|(\d+)\]/)
        const pid = m?.[1] || ''
        const spouseName = m?.[2] || '某人'
        const gift = m?.[3] ? parseInt(m[3]) : 30
        const person = getRelationById(g, pid)
        if (!person) return [{ id: 'ok', text: '默默离开', effect: (g2) => ({ ...g2, logs: pushLog(g2, '你听到一些流言，却没能确认是谁的喜事。') }) }]
        return [
          {
            id: 'gift',
            text: `送上${gift}灵石`,
            effect: (g2) => {
              let next = updateRelation(g2, pid, { spouseName, affectionLocked: true })
              next = { ...next, logs: pushLog(next, `你听闻「${nameWithRole(person)}」与「${spouseName}」成婚。`) }
              if (next.money >= gift) {
                next = { ...next, money: next.money - gift }
                next = updateRelation(next, pid, { favor: clamp(person.favor + 5, 0, 100) })
                if ((person.affection || 0) > 60) {
                  next = { ...next, logs: pushLog(next, `你备了薄礼，托人送去。灵石-${gift}。\n听说那日风太大，${ta(person)}眼里进了沙子，别过头，竟没再看你一眼。`) }
                } else {
                  next = { ...next, logs: pushLog(next, `你备了薄礼，托人送去。灵石-${gift}。`) }
                }
              } else {
                next = { ...next, logs: pushLog(next, '你想送礼，却囊中羞涩，只能作罢。') }
              }
              return { ...next, currentEvent: null }
            },
          },
          {
            id: 'nogift',
            text: '不去打扰',
            effect: (g2) => {
              let next = updateRelation(g2, pid, { spouseName, affectionLocked: true })
              next = { ...next, logs: pushLog(next, `你听闻「${nameWithRole(person)}」与「${spouseName}」成婚。`) }
              if ((person.affection || 0) > 60) {
                next = { ...next, logs: pushLog(next, `你没有去打扰。\n后来听说${ta(person)}大婚那天，独自一人在门口站了很久，似乎是在等什么。`) }
              } else {
                next = { ...next, logs: pushLog(next, '你没有去打扰，只在心里道了一句：愿你安好。') }
              }
              return { ...next, currentEvent: null }
            },
          },
        ]
      },
    },
    {
      id: 'S901_full_favor_confess',
      title: '情意暗涌',
      minAge: 14, maxAge: 999,
      condition: () => false,
      weight: () => 0,
      text: (g) => g.currentEvent?.rawText || '',
      options: (g) => {
        const m = g.currentEvent?.rawText.match(/\[confess:(.+?)\]/)
        const pid = m?.[1] || ''
        const person = getRelationById(g, pid)
        if (!person) return [{ id: 'ok', text: '……', effect: (g2) => ({ ...g2, logs: pushLog(g2, '你听到一句表白，却没能看清是谁。') }) }]
        const alreadyMarried = hasAlivePlayerLover(g)
        const base = [
          {
            id: 'accept',
            text: alreadyMarried ? '我已有道侣……' : '收下心意',
            effect: (g2: GameState) => {
              if (alreadyMarried) {
                let next = updateRelation(g2, pid, { favor: clamp(person.favor - 15, 0, 100) })
                next = applyRejectConfessPenalty(next, pid)
                next = addPersonFlag(next, pid, `confess_block_until_${g2.age + 3}`)
                return { ...next, logs: pushLog(next, `你轻声拒绝了${ta(person)}。\n${person.name}的眼神黯淡了一瞬，却仍强撑着笑。\n（心动-30%，至少三年后才会再提）`), currentEvent: null }
              }
              const prevRole: PersonRole = person.role
              let next = updateRelation(g2, pid, { role: 'lover', prevRole, favor: 100 })
              next = addFlag(next, 'has_lover')
              next = addFlag(next, `lover_id_${pid}`)
              next = { ...next, spouseId: pid }
              return { ...next, logs: pushLog(next, `你点头。${person.name}像是终于松了口气，握住你的手。\n从此，你们结为道侣。`), currentEvent: null }
            },
          },
          {
            id: 'reject',
            text: '婉拒',
            effect: (g2: GameState) => {
              let next = updateRelation(g2, pid, { favor: clamp(person.favor - 10, 0, 100) })
              next = applyRejectConfessPenalty(next, pid)
              next = addPersonFlag(next, pid, `confess_block_until_${g2.age + 3}`)
              return { ...next, logs: pushLog(next, `你没有收下。\n${person.name}沉默片刻，只道：「是我唐突了。」\n（心动-30%，至少三年后才会再提）`), currentEvent: null }
            },
          },
          {
            id: 'think',
            text: '让我想想',
            effect: (g2: GameState) => {
              const next = addFlag(g2, `pending_confession_${pid}`)
              return { ...next, logs: pushLog(next, `你没有立刻回答。他垂眸一笑：「好，我等你。」`), currentEvent: null }
            },
          },
        ]
        return base
      },
    },
    {
      id: 'S906_affection_confess',
      title: '忽然心动',
      minAge: 14, maxAge: 999,
      condition: () => false,
      weight: () => 0,
      text: (g) => g.currentEvent?.rawText || '',
      options: (g) => {
        const m = g.currentEvent?.rawText.match(/\[aff_confess:(.+?)\]/)
        const pid = m?.[1] || ''
        const person = getRelationById(g, pid)
        if (!person) return [{ id: 'ok', text: '……', effect: (g2) => ({ ...g2, logs: pushLog(g2, '你听到一句表白，却没能看清是谁。') }) }]
        const alreadyMarried = hasAlivePlayerLover(g)
        return [
          {
            id: 'accept',
            text: alreadyMarried ? '我已有道侣……' : '收下心意',
            effect: (g2: GameState) => {
              if (alreadyMarried) {
                let next = updateRelation(g2, pid, { favor: clamp(person.favor - 12, 0, 100) })
                next = applyRejectConfessPenalty(next, pid)
                next = addPersonFlag(next, pid, `confess_block_until_${g2.age + 3}`)
                return { ...next, logs: pushLog(next, `你轻声拒绝了${ta(person)}。\n「抱歉……」\n${person.name}的笑意僵了一瞬，却还是点了点头。\n（心动-30%，至少三年后才会再提）`), currentEvent: null }
              }
              const prevRole: PersonRole = person.role
              let next = updateRelation(g2, pid, { role: 'lover', prevRole, favor: 100 })
              next = addFlag(next, 'has_lover')
              next = addFlag(next, `lover_id_${pid}`)
              next = { ...next, spouseId: pid }
              return { ...next, logs: pushLog(next, `你伸手握住${person.name}。\n${ta(person)}像是松了一口气，眼神亮得发烫。\n你们结为道侣。`), currentEvent: null }
            },
          },
          {
            id: 'reject',
            text: '婉拒',
            effect: (g2: GameState) => {
              let next = updateRelation(g2, pid, { favor: clamp(person.favor - 6, 0, 100) })
              next = applyRejectConfessPenalty(next, pid)
              next = addPersonFlag(next, pid, `confess_block_until_${g2.age + 3}`)
              return { ...next, logs: pushLog(next, `你婉转拒绝了${ta(person)}。\n${person.name}沉默了片刻，只说：「我明白。」\n（心动-30%，至少三年后才会再提）`), currentEvent: null }
            },
          },
          {
            id: 'think',
            text: '让我想想',
            effect: (g2: GameState) => {
              const next = updateRelation(g2, pid, { favor: clamp(person.favor + 3, 0, 100) })
              return { ...next, logs: pushLog(next, `你没有立刻回答。\n${person.name}点点头：「好。」`), currentEvent: null }
            },
          },
        ]
      },
    },
    {
      id: 'S950_rescue_npc',
      title: '生死抉择',
      minAge: 0, maxAge: 999,
      condition: () => false,
      weight: () => 0,
      text: (g) => g.currentEvent?.rawText || '',
      options: (g) => {
        const pending = g.pendingRescue[0]
        if (!pending) return [{ id: 'ok', text: '……', effect: (g2) => ({ ...g2, logs: pushLog(g2, '你听到噩耗，却没能确认是谁。') }) }]
        const person = getRelationById(g, pending.id)
        if (!person) return [{ id: 'ok', text: '……', effect: (g2) => ({ ...g2, pendingRescue: g2.pendingRescue.slice(1), logs: pushLog(g2, '噩耗很快被人潮淹没。') }) }]
        return [
          {
            id: 'save',
            text: `救${ta(person)}（体魄变为1）`,
            effect: (g2: GameState, rng2: ReturnType<typeof makeRng>) => {
              const gain = randRelGain(rng2, 8, 15)
              let next: GameState = { ...g2, pendingRescue: g2.pendingRescue.slice(1), stats: { ...g2.stats, body: 1 } }
              next = addPersonFlag(next, person.id, 'rescued_by_player')
              if (!hasPersonFlag(person, 'life_extended_10')) next = addPersonFlag(next, person.id, 'life_extended_10')
              next = updateRelation(next, person.id, { status: 'alive', favor: clamp(person.favor + gain, 0, 100) })
              const lifeLine = hasPersonFlag(person, 'life_extended_10') ? '' : `\n${ta(person)}的脉息终于稳下来，像被你硬生生从黄泉边拽回。`
              const msg = `你以灵力强行续住${nameWithRole(person)}的命脉。\n经脉像被火烧，你几乎站不稳。\n${person.name}醒来时，第一眼就抓住了你的手。\n「别这样……」${ta(person)}嗓音发哑。${lifeLine}\n（你的体魄降为1，今后每年都有猝死风险；${person.name}好感+${gain}）`
              next = { ...next, logs: pushLog(next, msg) }
              next = appendPopup(next, '救回一命', msg)
              const ce2 = makeRescueCurrentEvent(next)
              return ce2 ? { ...next, currentEvent: ce2 } : { ...next, currentEvent: null }
            },
          },
          {
            id: 'letgo',
            text: `送${ta(person)}最后一程`,
            effect: (g2: GameState) => {
              let next: GameState = { ...g2, pendingRescue: g2.pendingRescue.slice(1) }
              next = updateRelation(next, person.id, { status: 'dead' })
              next = addFlag(next, `mourned_${person.id}`)
              const farewell = `你去送了${nameWithRole(person)}一程。\n愿TA来世不再受苦，愿风雪不再压弯TA的肩。`
              next = { ...next, logs: pushLog(next, farewell) }
              next = appendPopup(next, '噩耗', pending.cause)
              if (next.spouseId === person.id) {
                next = clearPlayerLover(next, person.id, `你送走了${nameWithRole(person)}。\n道侣一位，从此成了旧梦。`)
              }
              const ce2 = makeRescueCurrentEvent(next)
              return ce2 ? { ...next, currentEvent: ce2 } : { ...next, currentEvent: null }
            },
          },
        ]
      },
    },
    {
      id: 'S902_wait_vow',
      title: '此心系君',
      minAge: 14, maxAge: 999,
      condition: () => false,
      weight: () => 0,
      text: (g) => g.currentEvent?.rawText || '',
      options: (g) => {
        const m = g.currentEvent?.rawText.match(/\[vow:(.+?)\]/)
        const pid = m?.[1] || ''
        const person = getRelationById(g, pid)
        if (!person) return [{ id: 'ok', text: '……', effect: (g2) => ({ ...g2, logs: pushLog(g2, '你听到一句誓言，却没能看清是谁。') }) }]
        return [
          {
            id: 'keep',
            text: '默默记下',
            effect: (g2: GameState) => {
              let next = updateRelation(g2, pid, { willWait: true })
              next = addFlag(next, 'vow_used')
              // 记录里保留誓言内容（重要信息不丢）
              const vowLine = (g2.currentEvent?.text || '').trim()
              return { ...next, logs: pushLog(next, `你没有回答，但那句话却像落在心上。\n${vowLine}\n「${person.name}」此后，不再提及旁人。`), currentEvent: null }
            },
          },
        ]
      },
    },

    {
      id: 'S920_npc_story',
      title: '夜谈旧事',
      minAge: 14, maxAge: 999,
      condition: () => false,
      weight: () => 0,
      text: (g) => g.currentEvent?.rawText || '',
      options: (g) => {
        const m = g.currentEvent?.rawText.match(/\[npc_story:(.+?)\]/)
        const pid = m?.[1] || ''
        const person = getRelationById(g, pid)
        if (!person) return [{ id: 'ok', text: '……', effect: (g2: GameState) => ({ ...g2, currentEvent: null, logs: pushLog(g2, '夜色里，你听见一些旧事，却没能确认是谁说的。') }) }]
        return [
          {
            id: 'comfort',
            text: `轻声安慰${ta(person)}`,
            effect: (g2: GameState, rng2: ReturnType<typeof makeRng>) => {
              let next = addPersonFlag(g2, pid, 'story_told_1')
              const gain = randRelGain(rng2, 8, 15)
              next = updateRelation(next, pid, { favor: clamp(person.favor + gain, 0, 100) })
              // 若已满足心动增长条件，也会微微上涨
              if (person.favor >= 80 && person.age >= 14 && !isMarriedToOther(person) && !person.affectionLocked) {
                const gainA = randRelGain(rng2, 8, 15)
                next = updateRelation(next, pid, { affection: clamp((person.affection || 0) + gainA, 0, 100) })
              }
              next = { ...next, logs: pushLog(next, `你轻声说：「我在。」\n${ta(person)}看了你很久，像是终于被温柔接住。`) }
              return { ...next, currentEvent: null }
            },
          },
          {
            id: 'listen',
            text: `静静陪着${ta(person)}`,
            effect: (g2: GameState, rng2: ReturnType<typeof makeRng>) => {
              let next = addPersonFlag(g2, pid, 'story_told_1')
              const gain = randRelGain(rng2, 8, 15)
              next = updateRelation(next, pid, { favor: clamp(person.favor + gain, 0, 100) })
              next = { ...next, logs: pushLog(next, `你没有打断，只把脚步放慢，让${ta(person)}把话说完。夜风很凉，你们却都没再觉得冷。`) }
              return { ...next, currentEvent: null }
            },
          },
        ]
      },
    },

    {
      id: 'S930_demon_conflict',
      title: '人妖对立',
      minAge: 14, maxAge: 999,
      condition: () => false,
      weight: () => 0,
      text: (g) => g.currentEvent?.rawText || '',
      options: (g) => {
        const m = g.currentEvent?.rawText.match(/\[demon_conflict:(.+?)\]/)
        const pid = m?.[1] || ''
        const demon = getRelationById(g, pid)
        if (!demon) return [{ id: 'ok', text: '……', effect: (g2: GameState) => ({ ...g2, currentEvent: null, logs: pushLog(g2, '风声很乱，你没能听清细节。') }) }]
        return [
          {
            id: 'protect',
            text: `暗中提醒「${demon.name}」`,
            effect: (g2: GameState) => {
              let next = addFlag(g2, 'demon_conflict_done')
              next = updateRelation(next, pid, { favor: clamp(demon.favor + 10, 0, 100) })
              const extra = demon.willWait ? `${ta(demon)}只看了你一眼，便懂了。` : `${ta(demon)}的尾巴轻轻一扫，眼底闪过一丝复杂。`
              next = { ...next, logs: pushLog(next, `你借着夜色递去一句话：「最近别出门。」\n${extra}\n「多谢。」${ta(demon)}低声说。`) }
              return { ...next, currentEvent: null }
            },
          },
          {
            id: 'stay',
            text: '装作不知',
            effect: (g2: GameState) => {
              let next = addFlag(g2, 'demon_conflict_done')
              next = addFlag(next, 'human_demon_war')
              // 人妖大战：被提起的妖在混战中身死
              next = updateRelation(next, pid, { favor: clamp(demon.favor - 10, 0, 100), status: 'dead' })
              const warText = `你选择沉默。\n几日后，围剿如期而至。\n正道与妖族在山门外爆发混战，血与妖气翻涌成潮。\n而「${nameWithRole(demon)}」再也没有回来。\n有人说${ta(demon)}是在混战里替同族断后，有人说${ta(demon)}被剑阵困死——真相无人敢讲。`
              next = addFlag(next, `mourned_${demon.id}`)
              next = { ...next, logs: pushLog(next, warText) }
              next = appendPopup(next, '人妖大战', warText)
              return { ...next, currentEvent: null }
            },
          },
        ]
      },
    },
  ]
}

// ============ 游戏逻辑 ============

function defaultNewGame(seed: number, gender: 'male' | 'female'): GameState {
  const rng = makeRng(seed)
  const familySurname = rng.pickOne(SURNAMES)
  const name = genNameWithSurname(rng, gender, familySurname)
  
  const stats: Stats = {
    body: clamp(rng.nextInt(30, 80) + rng.nextInt(-10, 10), 20, 100),
    root: clamp(rng.nextInt(20, 80) + rng.nextInt(-15, 15), 10, 100),
    face: clamp(rng.nextInt(40, 90) + rng.nextInt(-10, 10), 20, 100),
    luck: clamp(rng.nextInt(30, 70) + rng.nextInt(-10, 10), 10, 100),
  }
  
  const dad = createPerson(rng, 'parent', { gender: 'male', name: genNameWithSurname(rng, 'male', familySurname), age: rng.nextInt(25, 40), favor: 70 })
  const mom = createPerson(rng, 'parent', { gender: 'female', name: genNameWithSurname(rng, 'female', familySurname), age: rng.nextInt(22, 35), favor: 75 })
  
  const g: GameState = {
    version: 1,
    seed,
    name,
    gender,
    age: 0,
    alive: true,
    stats,
    cultivation: 0,
    realm: 'mortal',
    money: rng.nextInt(0, 100),
    sect: null,
    relations: [dad, mom],
    flags: (() => {
      const flags: string[] = []
      // 青梅竹马本局概率出现（否则走“竹林小兽→化形”线）
      if (rng.chance(0.35)) flags.push('world_childhood_yes')
      return flags
    })(),
    logs: [],
    items: [],
    currentEvent: null,
    yearFlags: { explored: false, chattedIds: [], popup: null },
    hasPastLover: false,
    spouseId: null,
    friendNames: [],
    usedFriendNames: [],
    lastEventId: null,
    treasureCd: 0,
    marketDemonCd: 0,
    breakthroughDrops: 0,
    breakthroughBonus: 0,
    pendingRescue: [],
  }
  
  return g
}

function pickEvent(rng: ReturnType<typeof makeRng>, g: GameState): EventDef | null {
  const defs = getEvents()
  const candidates = defs
    .filter(def => def.minAge <= g.age && g.age <= def.maxAge && def.condition(g))
    .filter(def => !g.lastEventId || def.id !== g.lastEventId) // 避免连续刷同一事件
    .map(def => ({ def, w: def.weight(g) }))
    .filter(x => x.w > 0)
  
  if (candidates.length === 0) return null
  
  const sum = candidates.reduce((s, x) => s + x.w, 0)
  const r = rng.nextFloat() * sum
  let acc = 0
  for (const x of candidates) {
    acc += x.w
    if (r <= acc) return x.def
  }
  return candidates[candidates.length - 1]?.def || null
}

function startYear(rng: ReturnType<typeof makeRng>, g: GameState): GameState {
  // 若道侣已亡（非“濒死待救”状态），解除唯一道侣锁，允许后续接受他人心意
  if (g.spouseId) {
    const lover = getRelationById(g, g.spouseId)
    if (lover && lover.status === 'dead') {
      g = clearPlayerLover(g, lover.id)
    }
  }

  // 身体被你强行压到“1”的代价：旧伤随时可能夺命
  if (g.alive && g.stats.body <= 1 && rng.chance(0.18)) {
    const text = '旧伤忽然翻涌，你的经脉像被撕开。\n你想撑住，却再也握不住那口气。'
    return killPlayer(g, text)
  }

  // 检查寿命
  const maxLife = getMaxLifespan(g.realm) + getPlayerLifeBonusYears(g)
  if (g.age >= maxLife) {
    return killPlayer(g, '你感觉大限将至……寿元耗尽，魂归天地。')
  }

  // 濒死救人：强制优先弹窗事件（不占用当年随机事件）
  if (g.pendingRescue.length > 0) {
    const ce = makeRescueCurrentEvent(g)
    if (ce) {
      const withPopup = appendPopup(g, '噩耗', g.pendingRescue[0].cause)
      return { ...withPopup, currentEvent: ce, lastEventId: ce.id }
    }
    // 兜底：队列坏数据就清空
    return { ...g, pendingRescue: [] }
  }

  // ===== 每年优先触发：誓言 / 满好感表白 / NPC与他人成婚 =====
  // 1) “此心系君”（每局最多一次）
  if (!hasFlag(g, 'vow_used')) {
    const candidates = g.relations
      .filter(r => r.status === 'alive' && r.role !== 'parent' && isAdultForRomance(r) && !r.willWait && !isMarriedToOther(r) && r.role !== 'lover')
      .filter(r => (r.favor >= 100 && (r.affection || 0) >= 80) || r.favor >= 90)
      .sort((a, b) => b.favor - a.favor)
    if (candidates.length > 0 && rng.chance(0.12)) {
      const p = candidates[0]
      const line = pickByPersonality(rng, p.personality, VOW_TEXTS, GENERIC_VOW)
      const rawText = `夜色深沉，「${p.name}」忽然停下脚步。\n${ta(p)}望着你，像是把所有话都咽进喉咙里。\n${line}\n[vow:${p.id}]`
      const ce: CurrentEvent = {
        id: 'S902_wait_vow',
        title: '此心系君',
        rawText,
        text: rawText.replace(/\[[^\]]+\]/g, ''),
        options: [{ id: 'keep', text: '默默记下', picked: false }],
        resolved: false,
      }
      return { ...g, currentEvent: ce, lastEventId: ce.id }
    }
  }

  // 1.5) 心动>50：每年20%概率表白（更早触发，不要求满好感）
  {
    const candidates = g.relations
      .filter(r => r.status === 'alive' && r.role !== 'parent' && isAdultForRomance(r))
      .filter(r => r.role !== 'lover' && !isMarriedToOther(r) && !r.affectionLocked)
      .filter(r => (r.affection || 0) > 50)
      .filter(r => g.age >= getConfessBlockUntil(r)) // 拒绝后至少3年才会再发起
    if (candidates.length > 0 && rng.chance(0.2)) {
      const p = rng.pickOne(candidates)
      const line = pickConfessionLine(rng, p)
      const rawText = `你们并肩走了一段路。\n「${p.name}」忽然停下，像是终于下定决心。\n${line}\n[aff_confess:${p.id}]`
      const ce: CurrentEvent = {
        id: 'S906_affection_confess',
        title: '忽然心动',
        rawText,
        text: rawText.replace(/\[[^\]]+\]/g, ''),
        options: [
          { id: 'accept', text: hasAlivePlayerLover(g) ? '我已有道侣……' : '收下心意', picked: false },
          { id: 'reject', text: '婉拒', picked: false },
          { id: 'think', text: '让我想想', picked: false },
        ],
        resolved: false,
      }
      return { ...g, currentEvent: ce, lastEventId: ce.id }
    }
  }

  // 2) 满好感表白（每年20~40%）
  const fullFavor = g.relations
    .filter(r => r.status === 'alive' && r.role !== 'parent' && isAdultForRomance(r) && !isMarriedToOther(r) && r.role !== 'lover' && r.favor >= 100)
    .filter(r => g.age >= getConfessBlockUntil(r)) // 拒绝后至少3年才会再发起
  if (fullFavor.length > 0) {
    const confessChance = 0.2 + rng.nextFloat() * 0.2
    if (rng.chance(confessChance)) {
      const p = rng.pickOne(fullFavor)
      const line = pickConfessionLine(rng, p)
      const rawText = `风停了。\n「${p.name}」站在你面前，指尖微微发颤。\n${line}\n[confess:${p.id}]`
      const ce: CurrentEvent = {
        id: 'S901_full_favor_confess',
        title: '情意暗涌',
        rawText,
        text: rawText.replace(/\[[^\]]+\]/g, ''),
        options: [
          { id: 'accept', text: hasAlivePlayerLover(g) ? '我已有道侣……' : '收下心意', picked: false },
          { id: 'reject', text: '婉拒', picked: false },
          { id: 'think', text: '让我想想', picked: false },
        ],
        resolved: false,
      }
      return { ...g, currentEvent: ce, lastEventId: ce.id }
    }
  }

  // 3) NPC与他人成婚（每年最多触发一次）
  {
    const candidates = rng.shuffle(
      g.relations.filter(r => r.status === 'alive' && r.role !== 'parent' && !isMarriedToOther(r) && r.role !== 'lover' && isAdultForRomance(r))
    )
    let chosen: Person | null = null
    for (const p of candidates) {
      const res = canNpcMarryOtherThisYear(g, p)
      if (!res.ok) continue
      if (rng.chance(res.p)) { chosen = p; break }
    }
    if (chosen) {
      const spouseGender = chosen.gender === 'male' ? 'female' : 'male'
      const spouseName = genName(rng, spouseGender)
      const gift = 30
      const rawText = `喜讯传来：\n听闻「${chosen.name}」与「${spouseName}」结为连理。\n有人说${ta(chosen)}眉眼含笑，也有人说${ta(chosen)}只在席间饮了三杯。\n你要不要送上一点灵石？\n[npc_marriage:${chosen.id}|${spouseName}|${gift}]`
      const ce: CurrentEvent = {
        id: 'S900_npc_marriage',
        title: '喜讯传来',
        rawText,
        text: rawText.replace(/\[[^\]]+\]/g, ''),
        options: [
          { id: 'gift', text: `送上${gift}灵石`, picked: false },
          { id: 'nogift', text: '不去打扰', picked: false },
        ],
        resolved: false,
      }
      return { ...g, currentEvent: ce, lastEventId: ce.id }
    }
  }

  // 4) NPC故事解锁（好感>=80：夜谈旧事/节后归途/微醺吐露）
  {
    const candidates = g.relations
      .filter(r => r.status === 'alive' && r.role !== 'parent' && r.age >= 14 && r.favor >= 80 && !hasPersonFlag(r, 'story_told_1'))
    if (candidates.length > 0 && rng.chance(0.22)) {
      const p = rng.pickOne(candidates)
      const story = generateNpcStory(rng, p)
      const rawText = `你和「${p.name}」并肩走着，夜色很深。\n${ta(p)}忽然开口，像是终于下定决心把旧事说给你听。\n\n${story}\n[npc_story:${p.id}]`
      const ce: CurrentEvent = {
        id: 'S920_npc_story',
        title: '夜谈旧事',
        rawText,
        text: rawText.replace(/\[[^\]]+\]/g, ''),
        options: [
          { id: 'comfort', text: '轻声安慰他', picked: false },
          { id: 'listen', text: '静静陪着他', picked: false },
        ],
        resolved: false,
      }
      return { ...g, currentEvent: ce, lastEventId: ce.id }
    }
  }

  // 5) 妖修对立（爱恨情仇）：有妖缘/妖友时可能引发宗门与妖族的冲突
  {
    const demon = g.relations.find(r => r.status === 'alive' && r.race === 'demon')
    if ((hasFlag(g, 'in_sect') || hasFlag(g, 'is_loose_cultivator')) && demon && rng.chance(0.12) && !hasFlag(g, 'demon_conflict_done')) {
      const rawText = `坊市传来风声：正道修士要围剿一位妖王。\n而你恰好听见有人提起「${demon.name}」。\n「妖与人，终究不同。」\n你心里一沉。\n[demon_conflict:${demon.id}]`
      const ce: CurrentEvent = {
        id: 'S930_demon_conflict',
        title: '人妖对立',
        rawText,
        text: rawText.replace(/\[[^\]]+\]/g, ''),
        options: [
          { id: 'protect', text: `暗中提醒「${demon.name}」`, picked: false },
          { id: 'stay', text: '装作不知', picked: false },
        ],
        resolved: false,
      }
      return { ...g, currentEvent: ce, lastEventId: ce.id }
    }
  }
  
  // 60%概率触发事件，或者有强制伏笔事件
  const hasEvent = rng.chance(0.65) || g.age === 0 || g.age === 6
  
  if (!hasEvent) {
    // 平淡的一年
    const gain = 2 + Math.floor(g.stats.root / 30)
    let next = { ...g, cultivation: Math.min(100, g.cultivation + gain) }
    next = { ...next, logs: pushLog(next, '平静的一年，你在修炼中度过。') }
      return { ...next, lastEventId: 'calm_year' }
  }
  
  const def = pickEvent(rng, g)
  if (!def) {
    const gain = 2 + Math.floor(g.stats.root / 30)
    let next = { ...g, cultivation: Math.min(100, g.cultivation + gain) }
    next = { ...next, logs: pushLog(next, '平静的一年。') }
    return { ...next, lastEventId: 'calm_year' }
  }
  
  const rawText = def.text(g, rng)
  const options = def.options(g, rng)
  
  const ce: CurrentEvent = {
    id: def.id,
    title: def.title,
    rawText,
    text: rawText.replace(/\[[^\]]+\]/g, ''), // 展示时移除临时标记
    options: options.map(o => ({ id: o.id, text: o.text, picked: false })),
    resolved: false,
  }

  // 修为满100：突破事件出现时额外弹窗确认（不替代选项，只提示“可以突破了”）
  if (ce.id === 'E500_breakthrough' && g.cultivation >= 100) {
    const tip = `你的修为已满（100/100）。\n是否现在突破？\n\n${ce.text}`
    const g2 = appendPopup(g, '突破确认', tip)
    return { ...g2, currentEvent: ce, lastEventId: ce.id }
  }

  return { ...g, currentEvent: ce, lastEventId: ce.id }
}

function resolveOption(rng: ReturnType<typeof makeRng>, g: GameState, optId: string): GameState {
  if (!g.currentEvent || g.currentEvent.resolved) return g
  
  const def = getEvents().find(e => e.id === g.currentEvent?.id)
  if (!def) return g
  
  const options = def.options(g, rng)
  const opt = options.find(o => o.id === optId)
  if (!opt) return g
  
  // 先把“发生了什么/是谁说了啥”写入日志，避免只看到效果却不知道过程
  let withSummary = g
  if (g.currentEvent?.title) {
    const lines = (g.currentEvent.text || '').trim()
    const snippet = lines
      ? lines.split('\n').slice(0, 6).join('\n') // 保留前几行关键信息（含人物台词）
      : ''
    withSummary = { ...withSummary, logs: pushLog(withSummary, `〔${g.currentEvent.title}〕${snippet ? '\n' + snippet : ''}`) }
  }

  let next = opt.effect(withSummary, rng)
  
  // 默认：选择完后事件框消失
  // 但如果 effect “真正生成了一个新的事件对象”（例如救人队列连续弹窗），则保留
  const shouldKeepEvent = !!next.currentEvent && next.currentEvent !== g.currentEvent
  return shouldKeepEvent ? next : { ...next, currentEvent: null }
}

function nextYear(rng: ReturnType<typeof makeRng>, g: GameState): GameState {
  if (!g.alive) return g
  if (g.currentEvent && !g.currentEvent.resolved) return g
  
  function deathReasonText(rng2: ReturnType<typeof makeRng>, p: Person, reason: '寿尽' | '横死' | '失踪') {
    const roleReason: Record<PersonRole, string[]> = {
      parent: ['寿终正寝'],
      childhood: ['旧疾复发', '走火入魔', '外出遇伏'],
      master: ['天劫余波', '闭关坐化', '旧伤再起'],
      senior: ['斗法受创', '外出历练折返无期', '心魔反噬'],
      junior: ['历练失手', '秘境崩塌', '灵脉暴走'],
      friend: ['路遇强敌', '意外遭难', '因缘尽了'],
      lover: ['为你挡劫', '与人斗法', '心魔缠身'],
      enemy: ['仇杀', '斗法身陨', '天道反噬'],
      demon_friend: ['妖族内斗', '天雷劫火', '被围剿时重伤不治'],
    }
    const personalityAddon: Record<string, string[]> = {
      '冷淡疏离': ['临终前只说了一句：「不必难过。」', '有人说TA走得很安静。'],
      '温柔体贴': ['临终前还托人给你带了一句话：「照顾好自己。」', 'TA最后仍在担心你。'],
      '腹黑狡诈': ['临终前笑了一下：「这局……我输得不冤。」', 'TA把最后一句话藏得很深。'],
      '毒舌傲娇': ['临终前还嘴硬：「别哭，丢人。」', 'TA骂得凶，眼神却软。'],
      '闷骚内敛': ['TA沉默很久，才轻声说：「……谢谢你。」', 'TA没说太多，却像把一生都说完了。'],
      '热情开朗': ['有人说TA还笑着，像不愿吓到任何人。', 'TA把痛藏进笑里。'],
      '深情专一': ['临终前只反复念你的名字。', 'TA像终于等到了结局。'],
      '神秘莫测': ['临终前望着天，像在听某个答案。', 'TA留下的线索，让人不寒而栗。'],
      '高冷禁欲': ['临终前只是把衣襟拢好，神情平静。', 'TA用最冷的表情，吞下最疼的事。'],
    }
    const core = rng2.pickOne(roleReason[p.role] || ['寿终正寝'])
    const addon = rng2.pickOne(personalityAddon[p.personality] || ['风很大。'])
    const taWord = ta(p)
    const who = nameWithRole(p)
    if (reason === '寿尽') return `噩耗传来：「${who}」寿元已尽，${core}。\n${addon.replace(/TA/g, taWord)}`
    if (reason === '失踪') return `噩耗传来：「${who}」外出失踪多日，最终传回死讯。\n${addon.replace(/TA/g, taWord)}`
    return `噩耗传来：「${who}」遭逢不测，${core}。\n${addon.replace(/TA/g, taWord)}`
  }

  // NPC老化和死亡检查（带弹窗/原因 + “要不要救他/她”）
  let next: GameState = { ...g, pendingRescue: [] }
  const aged = next.relations.map(r => (r.status === 'alive' ? { ...r, age: r.age + 1 } : r))
  const wouldDie = aged
    .filter(r => r.status === 'alive')
    .filter(r => r.age >= getPersonMaxLifespan(r))
    .sort((a, b) => (b.favor || 0) - (a.favor || 0))

  // 所有“非父母”的濒死者进入救人队列（可连续弹出）；父母仍直接寿尽
  // 续命规则：每个人只能被“续命十年”一次；已续命过的，寿尽时不再出现救人选项
  const rescueTargets = wouldDie.filter(r => r.role !== 'parent' && !hasPersonFlag(r, 'life_extended_10'))
  const rescueSet = new Set(rescueTargets.map(r => r.id))
  let relationsAfterDeath = aged.map(r => {
    if (r.status !== 'alive') return r
    if (r.age < getPersonMaxLifespan(r)) return r
    if (rescueSet.has(r.id)) return { ...r, status: 'injured' as const }
    return { ...r, status: 'dead' as const }
  })
  next = { ...next, relations: relationsAfterDeath }

  // 直接死亡的：写日志 + 弹窗
  for (const r of next.relations) {
    if (r.status === 'dead' && !hasFlag(next, `mourned_${r.id}`)) {
      next = addFlag(next, `mourned_${r.id}`)
      const reason = deathReasonText(rng, r, '寿尽')
      next = { ...next, logs: pushLog(next, reason) }
      next = appendPopup(next, '噩耗', reason)
      if (next.spouseId === r.id) {
        next = clearPlayerLover(next, r.id, `你听到噩耗时，手指僵在原地。\n道侣一位，从此成了旧梦。`)
      }
    }
  }

  // 濒死待救：本年开头强制弹出选择（可连续弹出）
  if (rescueTargets.length > 0) {
    const queue = rescueTargets.map(p => ({ id: p.id, cause: deathReasonText(rng, p, '寿尽') }))
    next = { ...next, pendingRescue: queue }
  }
  
  next = {
    ...next,
    age: next.age + 1,
    yearFlags: { explored: false, chattedIds: [], popup: next.yearFlags.popup },
    currentEvent: null,
    treasureCd: Math.max(0, (next.treasureCd || 0) - 1),
    marketDemonCd: Math.max(0, (next.marketDemonCd || 0) - 1),
  }
  // 每年清理“本年节日已用”标记
  next = removeFlag(next, 'festival_used_this_year')

  // NPC离婚：已与他人成婚者，每年小概率分开（最多一次）
  {
    const married = rng.shuffle(
      next.relations.filter(r => r.status === 'alive' && r.role !== 'parent' && r.role !== 'lover' && !!r.spouseName)
    )
    const target = married.find(() => rng.chance(0.05))
    if (target) {
      const spouse = target.spouseName || '对方'
      let n2 = updateRelation(next, target.id, { spouseName: null, affectionLocked: false })
      const msg = `坊间传来风声：「${target.name}」与「${spouse}」终究还是分开了。\n有人说是性情不合，也有人说是因果难断。`
      n2 = { ...n2, logs: pushLog(n2, msg) }
      n2 = appendPopup(n2, '风波', msg)
      next = n2
    }
  }

  // 仙帝来信：容貌极高的隐藏线触发后，TA会常常送你修为之物
  {
    const emperor = next.relations.find(r => r.status === 'alive' && hasPersonFlag(r, 'immortal_emperor'))
    if (emperor && rng.chance(0.65)) {
      const r = rng.nextFloat()
      const giftItem = r < 0.55 ? '太清仙露' : r < 0.85 ? '引灵丹' : '回天破境丹'
      let n2: GameState = next
      n2 = { ...n2, items: [...n2.items, giftItem] }

      const lines = [
        '「你还太慢。」TA淡声道，「但我会等。」',
        '「别把自己耗在尘泥里。」TA的字很冷，却像把你托起。',
        '「若你能早日成仙……」TA停了一息，「便不必再孤身面对千年。」',
        '「我送你此物。」TA道，「不为别的——只因我想看你更高处。」',
      ]
      const line = (rng.pickOne(lines) as string).replace(/TA/g, ta(emperor))
      const msg = `有人送来一封不署名的信，纸上只留一缕清冽的仙意。\n随信而来的是「${giftItem}」。\n${line}`
      n2 = { ...n2, logs: pushLog(n2, `「${nameWithRole(emperor)}」送来「${giftItem}」。`) }
      n2 = appendPopup(n2, '仙帝来信', msg)
      next = n2
    }
  }

  // NPC主动送礼/邀约：不占用当年事件，只弹窗提示（好感>=50才会发生）
  {
    const cands = next.relations.filter(r => r.status === 'alive' && r.role !== 'parent' && r.favor >= 50)
    if (cands.length > 0 && rng.chance(0.35)) {
      const p = rng.pickOne(cands)

      const giveItem = rng.chance(0.55)
      const giftItem = rng.pickOne(['聚灵丹', '培元丹', '洗髓丹', '回天破境丹'])
      const giftMoney = rng.nextInt(20, 80)

      const stage = getChatStage(next, p)
      const baseLines: Record<string, string[]> = {
        '冷淡疏离': ['「收下。」TA只留两个字。', '「别多想。」TA把东西放下就走。'],
        '温柔体贴': ['「怕你受苦。」TA声音很轻。', '「我路过，顺手。」TA笑得温。'],
        '腹黑狡诈': ['TA笑了一下：「欠我的，记着。」', '「收下吧。」TA语气像在布一局棋。'],
        '毒舌傲娇': ['「别误会。」TA别开脸，「只是……刚好多了一份。」', '「你要是不用，也别浪费。」'],
        '闷骚内敛': ['TA把东西递来，耳尖微红：「……给你。」', 'TA沉默很久：「你别拒绝。」'],
        '热情开朗': ['TA笑着挥手：「给你带的！」', '「走走走！」TA兴冲冲地塞给你。'],
        '深情专一': ['「我想让你过得好一点。」TA看着你。', '「我一直记着你。」TA低声说。'],
        '神秘莫测': ['TA把东西放下：「缘到了。」', '「别问来处。」TA轻笑。'],
        '高冷禁欲': ['TA淡声道：「拿着。」', '「别逞强。」TA把东西推到你手边。'],
      }
      const extraAmbig = stage === 'ambiguous' && (p.affection || 0) >= 60 ? '你与TA对视一瞬，谁都没先移开。' : ''
      const line = (rng.pickOne(baseLines[p.personality] || ['「收下吧。」']) as string).replace(/TA/g, ta(p))

      let n2: GameState = next
      if (giveItem) {
        n2 = { ...n2, items: [...n2.items, giftItem] }
      } else {
        n2 = { ...n2, money: n2.money + giftMoney }
      }
      const got = giveItem ? `「${giftItem}」` : `${giftMoney}灵石`
      const msg = `「${nameWithRole(p)}」托人送来${got}。\n${line}${extraAmbig ? '\n' + extraAmbig.replace(/TA/g, ta(p)) : ''}`
      n2 = { ...n2, logs: pushLog(n2, `「${nameWithRole(p)}」送来${got}。`) }
      n2 = appendPopup(n2, '来信', msg)
      next = n2
    }
  }

  // 救命后调养：被你救回的人，每年都会想办法送你补体魄的东西
  if (next.stats.body <= 1) {
    const rescuers = next.relations.filter(r => r.status === 'alive' && hasPersonFlag(r, 'rescued_by_player'))
    for (const p of rescuers) {
      const count = getRescueGiftCount(p)
      const item = count < 4 ? '护脉丹' : '引灵丹'
      const msg =
        count < 4
          ? `「${nameWithRole(p)}」托人送来一枚「护脉丹」。\n「别再硬撑。」${ta(p)}在信里只写了这一句。`
          : `「${nameWithRole(p)}」托人送来一枚「引灵丹」。\n「你要活下去。」${ta(p)}写得很慢，像怕你看不清。`
      next = { ...next, items: [...next.items, item] }
      next = incRescueGiftCount(next, p.id)
      next = { ...next, logs: pushLog(next, `「${nameWithRole(p)}」送来${item}。`) }
      next = appendPopup(next, '来信', msg)
    }
  }
  
  return startYear(rng, next)
}

// 聊天功能 - 返回更新后的状态和聊天内容
function handleChat(rng: ReturnType<typeof makeRng>, g: GameState, personId: string): { state: GameState; chatText: string; personName: string } | null {
  const person = g.relations.find(r => r.id === personId)
  if (!person || person.status !== 'alive') return null
  if (g.yearFlags.chattedIds.includes(personId)) return null
  
  let next = { ...g, yearFlags: { ...g.yearFlags, chattedIds: [...g.yearFlags.chattedIds, personId] } }
  
  // 根据阶段选取文本（确保：未开启心动且好感不高时不乱暧昧）
  let chatText = getChatText(rng, next, person)
  if (person.isPastLover && rng.chance(0.25)) {
    chatText += '\n' + rng.pickOne(PAST_LOVER_TEXTS)
  }
  // 救命后遗症：对方可能心疼你
  if (hasPersonFlag(person, 'rescued_by_player') && next.stats.body <= 1 && rng.chance(0.35)) {
    const pityByPer: Record<string, string[]> = {
      '冷淡疏离': ['「你太乱来了。」TA皱眉，语气却放得很轻。', 'TA沉默片刻：「下次……别再这样。」'],
      '温柔体贴': ['TA握住你的手，声音发颤：「你怎么这么傻。」', '「我宁可痛的人是我。」TA低声说。'],
      '腹黑狡诈': ['TA笑得很淡：「你欠我一条命。」可眼底却红。', '「别再拿自己开玩笑。」TA的声音有点哑。'],
      '毒舌傲娇': ['「蠢死了。」TA骂你一句，手却没松开。', '「下次不许。」TA别开脸。'],
      '闷骚内敛': ['TA喉结动了动：「……别再这样。」', '「我会怕。」TA低声承认。'],
      '热情开朗': ['TA红着眼笑：「你吓死我了。」', '「我以后盯着你！」TA故作凶。'],
      '深情专一': ['「你若再这样，我会疯。」TA看着你，一字一句。', '「我会一直还你。」TA轻声说。'],
      '神秘莫测': ['TA只说：「你的命，不该这样丢。」', '「你救了我一次。」TA低笑，「别逼我再失去。」'],
      '高冷禁欲': ['TA按住你脉门：「别逞强。」', '「你若死，我如何还？」TA声线很低。'],
    }
    const line = (rng.pickOne(pityByPer[person.personality] || ['「你怎么这么傻。」']) as string).replace(/TA/g, ta(person))
    chatText += '\n' + line
  }
  
  // 增加好感（更快：8~15）
  const favorGain = randRelGain(rng, 8, 15)
  // 心动值只有在好感度>=80且NPC>=14岁时才增加；与他人成婚后锁定不增长
  const canGainAffection =
    person.role !== 'parent' &&
    person.age >= 14 &&
    person.favor >= 80 &&
    !isMarriedToOther(person) &&
    !person.affectionLocked
  const affectionGain = canGainAffection ? randRelGain(rng, 8, 15) : 0
  
  next = {
    ...next,
    relations: next.relations.map(r => 
      r.id === personId 
        ? { ...r, favor: Math.min(100, r.favor + favorGain), affection: Math.min(100, (r.affection || 0) + affectionGain) }
        : r
    ),
  }
  
  const logText = `你和「${nameWithRole(person)}」聊了聊。（好感+${favorGain}${affectionGain > 0 ? `，心动+${affectionGain}` : ''}）`
  // 记录里保留关键对话内容（不丢信息）
  next = { ...next, logs: pushLog(next, `${logText}\n${chatText}`) }
  
  return { state: next, chatText, personName: person.name }
}

// 使用物品
function handleUseItem(g: GameState, itemName: string): GameState {
  const itemDef = ITEMS[itemName]
  if (!itemDef) return g
  
  const idx = g.items.indexOf(itemName)
  if (idx < 0) return g
  
  let next = itemDef.effect(g)
  next = { ...next, items: [...next.items.slice(0, idx), ...next.items.slice(idx + 1)] }
  next = { ...next, logs: pushLog(next, `你使用了「${itemName}」。${itemDef.desc}`) }
  
  return next
}

function makeDivorceText(rng: ReturnType<typeof makeRng>, _g: GameState, p: Person): string {
  const baseByPrev: Record<PersonRole, string[]> = {
    parent: ['他望着你，眼中满是无措。'],
    childhood: [
      '「还记得小时候吗……你摔倒了，我背你回家。那时候我就想，要一直护着你。」',
      '「我们一起长大，一起走到今天。」他喉结滚动了一下，「你真的要放开我的手吗？」',
    ],
    master: [
      '「你唤我一声师父，我便护你一程。」他低声道，「可如今……你连这一程也不要了？」',
      '他像是想装作淡然，却仍不自觉攥紧袖口：「为师……也会痛。」',
    ],
    senior: [
      '「你初入门时那么小一只，总跟在我身后。」他垂眸笑了笑，「我以为……我们会一直并肩。」',
      '「这些年，我见你从小师妹走到今日。」他声音发哑，「原来，终究留不住你。」',
    ],
    junior: [
      '「师姐……你别不要我。」他急得眼眶发红，「我会听话，我会努力变强。」',
      '「我一直把你当作唯一的光。」他咬唇，「你走了，我该往哪儿去？」',
    ],
    friend: [
      '「原来我们连‘道侣’二字也走不长。」他笑得很轻，却像压着碎裂的声音。',
      '「我以为，至少你会回头看我一眼。」他低声道，「可你连回忆都不愿带走。」',
    ],
    lover: [
      '他望着你，像是想把你的模样刻进骨血里。',
    ],
    enemy: [
      '他冷笑一声，却没敢看你：「……走吧，别回头。」',
    ],
    demon_friend: [
      '他耳尖发红，尾巴却无力地垂下：「你说过不会丢下我。」',
      '他努力笑着：「若你走……我也不拦。」可眼底像落了雪。',
    ],
  }

  const prev: PersonRole = p.prevRole || 'friend'
  const core = rng.pickOne(baseByPrev[prev] || baseByPrev.friend)

  const mod = PERSONALITY_MODIFIERS[p.personality]
  const modLine = mod ? rng.pickOne(mod) : ''

  const extra = p.isPastLover
    ? rng.pickOne([
      '「你上一世寿尽那年，我什么都做不了。」他声音发颤，「这一世……还要再错过吗？」',
      '他闭了闭眼：「我找了你很久……可原来，仍会害怕失去。」',
    ])
    : ''

  return applyGenderToLine([core, modLine, extra].filter(Boolean).join('\n'), p)
}

function handleExplore(rng: ReturnType<typeof makeRng>, g: GameState, placeId: string): GameState {
  const place = EXPLORE_PLACES.find(p => p.id === placeId)
  if (!place) return g
  
  let next = { ...g, yearFlags: { ...g.yearFlags, explored: true } }

  // 坠崖：自尽（直接结束这一世）
  if (place.id === 'cliff_fall') {
    const dead = killPlayer(next, '你走到断崖边，风很大。\n你忽然觉得，这一世太累了。\n你向前一步。', '坠崖')
    return dead
  }
  
  // 风险判定
  if (rng.chance(place.risk)) {
    // 遇到危险
    // 体魄越高越抗揍；机缘低更容易吃暗亏
    const base = rng.nextInt(5, 15)
    const mitigate = Math.floor(next.stats.body / 25) // 0~4
    const badLuck = next.stats.luck < 30 && rng.chance(0.35) ? rng.nextInt(2, 6) : 0
    const damage = clamp(base - mitigate + badLuck, 3, 20)
    next = { ...next, stats: { ...next.stats, body: Math.max(10, next.stats.body - damage) } }
    next = { ...next, logs: pushLog(next, `你在${place.name}遇到了危险，受了伤。（-${damage}体魄）`) }
    
    // 可能遇到妖族
    if (place.id === 'demon_mountain' && rng.chance(0.3) && !hasFlag(next, 'met_demon_explore')) {
      const demonName = genName(rng, 'male')
      next = addFlag(next, 'met_demon_explore')
      next = { ...next, logs: pushLog(next, `危急时刻，一个妖族青年救了你。「${demonName}」……他笑着消失在山林中。`) }
    }
  } else {
    // 安全收获
    // 根骨更容易“悟”；机缘更容易“捡”；容貌高也更容易得到“人情/照拂”
    const idx = EXPLORE_PLACES.indexOf(place)
    const moneyBase = rng.nextInt(20, 100) * (1 + idx)
    const moneyBonus = Math.floor(next.stats.luck / 20) + (next.stats.face >= 80 ? 2 : 0)
    const moneyGain = Math.max(10, moneyBase + moneyBonus * 5)
    const cultGain = clamp(rng.nextInt(3, 10) + Math.floor(next.stats.root / 30), 1, 20)
    next = { ...next, money: next.money + moneyGain, cultivation: Math.min(100, next.cultivation + cultGain) }
    next = { ...next, logs: pushLog(next, `你在${place.name}采集到了一些灵草，卖了${moneyGain}灵石。（+${cultGain}修为）`) }
    
    // 稀有收获
    if (rng.chance(0.1 + g.stats.luck / 500)) {
      next = { ...next, items: [...next.items, '聚灵丹'] }
      next = { ...next, logs: pushLog(next, '你还发现了一颗聚灵丹！') }
    }
    // 破境丹药：20%概率获得
    if (rng.chance(0.2)) {
      next = { ...next, items: [...next.items, '回天破境丹'] }
      next = { ...next, logs: pushLog(next, '你在灵草间翻出一枚「回天破境丹」。') }
    }

    // 15岁前：非最低难度地点，20%概率采到“修为+100”的奇物
    if (next.age <= 15 && place.id !== 'herb_valley' && rng.chance(0.2)) {
      next = { ...next, items: [...next.items, '归元灵髓'] }
      next = { ...next, logs: pushLog(next, '你在石缝里摸到一枚温润如玉的灵髓，握在手心就像有潮声。\n（获得「归元灵髓」）') }
    }

    // 忘情水：采药也可能遇到（稀有）
    if (rng.chance(place.id === 'herb_valley' ? 0.02 : 0.06)) {
      next = { ...next, items: [...next.items, '忘情水'] }
      next = { ...next, logs: pushLog(next, '你在一处冷泉旁捡到一只小瓷瓶，瓶口封着淡淡的苦香。\n（获得「忘情水」）') }
    }

    // 延寿丹：仅上古遗迹采药，10%概率
    if (place.id === 'ancient_ruins' && rng.chance(0.1)) {
      next = { ...next, items: [...next.items, '延寿丹'] }
      next = { ...next, logs: pushLog(next, '你在遗迹残阵的夹层里找到一枚金纹丹药，气息古老得让人心口发紧。\n（获得「延寿丹」）') }
    }
  }
  
  // 出门邂逅：各地点都有概率遇到人/妖；最高难度地点有20%概率遇到“妖王”
  {
    // 最高难度地点：20%遇妖王（很强）
    if (place.id === 'ancient_ruins' && next.age >= 18 && rng.chance(0.2) && !hasFlag(next, 'met_demon_king')) {
      const trait = rng.pickOne(BEAST_TRAITS)
      const gender: 'male' | 'female' = rng.chance(0.6) ? 'male' : 'female'
      const name = genName(rng, gender)
      const kind = (next.stats.face >= 80 || next.stats.luck >= 60) ? 'demon_friend' : (next.stats.luck < 25 && rng.chance(0.55) ? 'enemy' : 'demon_friend')
      let king = createPerson(
        rng,
        kind,
        {
          name,
          gender,
          race: 'demon',
          realm: rng.chance(0.45) ? 'ascend' : 'nascent',
          age: rng.nextInt(380, 900),
          favor: kind === 'enemy' ? rng.nextInt(0, 10) : rng.nextInt(12, 35),
          appearance: `妖气如海，眸色幽深（化形仍保留：${trait}）`,
          personality: rng.pickOne(PERSONALITIES),
          flags: ['demon_king'],
        },
        !next.hasPastLover
      )
      // 妖王也允许好友名字“客串”，但概率不高；这里不强制屏蔽
      const cameo = maybeApplyFriendCameo(rng, next, king)
      next = cameo.g
      king = cameo.p
      next = addRelation(next, king)
      next = addFlag(next, 'met_demon_king')
      next = addFlag(next, `demon_king_id_${king.id}`)
      const msg =
        kind === 'enemy'
          ? `你在遗迹深处看见一双幽冷的眼。\n「人修？」${ta(king)}笑意很淡，「别让我在这里再看到你。」`
          : `你在遗迹深处听见脚步声，像踏在你心跳上。\n${ta(king)}停在你面前，目光落下。\n「有意思。」${ta(king)}轻声道。\n从此，你的关系里多了一位“妖王”。`
      next = { ...next, logs: pushLog(next, msg) }
      next = appendPopup(next, '妖王现身', msg)
    } else {
      const base = 0.12
      const byLuck = next.stats.luck / 900
      const byFace = next.stats.face >= 80 ? 0.04 : next.stats.face >= 60 ? 0.02 : 0
      const byBody = next.stats.body >= 70 ? 0.01 : 0
      const meetP = clamp(base + byLuck + byFace + byBody, 0, 0.28)
      if (rng.chance(meetP)) {
        const isDemon = place.id === 'demon_mountain' && rng.chance(0.25)
        const gender: 'male' | 'female' = rng.chance(0.52) ? 'male' : 'female'
        const role: PersonRole = isDemon ? 'demon_friend' : 'friend'
        const age =
          isDemon
            ? rng.nextInt(120, 520) // 避免初遇 40~100 的尴尬
            : clamp(next.age + rng.nextInt(-2, 10), 14, 90)
        const realm: Realm = isDemon ? (rng.chance(0.45) ? 'core' : 'nascent') : (rng.chance(0.7) ? 'qi' : 'foundation')
        const favor = rng.nextInt(5, 25) + (next.stats.face >= 80 ? 8 : 0)
        const trait = isDemon ? rng.pickOne(BEAST_TRAITS) : ''
        const name = genName(rng, gender)
        let p = createPerson(
          rng,
          role,
          {
            name,
            gender,
            race: isDemon ? 'demon' : 'human',
            realm,
            age,
            favor: clamp(favor, 0, 100),
            appearance: isDemon ? `眉眼清隽（化形仍保留：${trait}）` : genAppearance(rng, gender),
            personality: rng.pickOne(PERSONALITIES),
            flags: isDemon ? ['beast_origin'] : [],
          },
          !next.hasPastLover
        )
        if (p.isPastLover) next = { ...next, hasPastLover: true }
        const cameo = maybeApplyFriendCameo(rng, next, p)
        next = cameo.g
        p = cameo.p
        next = addRelation(next, p)
        const line = isDemon
          ? `你在${place.name}的雾里遇见一位妖族行者。\n${tade(p)}的尾影一晃，又很快藏起。\n${tade(p)}看了你一眼，像记住了什么。`
          : `你在${place.name}遇见一位路过的修士。\n对方与你点头致意，随口提了几句路上的消息。`
        next = { ...next, logs: pushLog(next, `${line}\n从此，你的关系里多了「${nameWithRole(p)}」。`) }
      }
    }
  }

  return next
}

// ============ UI组件 ============

const STAT_LABELS: Record<StatKey, string> = {
  body: '体魄',
  root: '根骨',
  face: '容貌',
  luck: '机缘',
}

const STAT_COLORS: Record<StatKey, string> = {
  body: 'from-red-400 to-red-600',
  root: 'from-purple-400 to-purple-600',
  face: 'from-pink-400 to-pink-600',
  luck: 'from-yellow-400 to-yellow-600',
}

export default function LiaoliaoYishengScreen() {
  const { callLLM, llmConfig, playSong, pauseMusic, audioRef } = useOS()
  const [game, setGame] = useState<GameState | null>(null)
  const [selectedGender, setSelectedGender] = useState<'male' | 'female'>('female')
  const [showInvite, setShowInvite] = useState(false)
  const [invitedNames, setInvitedNames] = useState<string[]>([])
  const [inviteInput, setInviteInput] = useState('')
  const [savedStories, setSavedStories] = useState<SavedStory[]>(() => loadSavedStories())
  const [showSavedStories, setShowSavedStories] = useState(false)
  const [viewStory, setViewStory] = useState<SavedStory | null>(null)
  const [copyHint, setCopyHint] = useState<string>('')
  const [showRelations, setShowRelations] = useState(false)
  const [showExplore, setShowExplore] = useState(false)
  const [showItems, setShowItems] = useState(false)
  const [chatResult, setChatResult] = useState<{ personName: string; text: string } | null>(null)
  const [graveResult, setGraveResult] = useState<{ personId: string; personName: string; text: string } | null>(null)
  const [interactTargetId, setInteractTargetId] = useState<string | null>(null)
  const [giftTargetId, setGiftTargetId] = useState<string | null>(null)
  const [confessTargetId, setConfessTargetId] = useState<string | null>(null)
  const [interactResult, setInteractResult] = useState<{ personName: string; text: string } | null>(null)
  const [divorcePrompt, setDivorcePrompt] = useState<{ id: string; name: string; text: string } | null>(null)
  const [relTab, setRelTab] = useState<'parents' | 'friends' | 'sect' | 'lovers' | 'deceased'>('sect')

  // 死亡后“生成故事”（API）
  const [storyModalOpen, setStoryModalOpen] = useState(false)
  const [storyPickNpcOpen, setStoryPickNpcOpen] = useState(false)
  const [storyMode, setStoryMode] = useState<'life' | 'npc' | null>(null)
  const [storyNpcId, setStoryNpcId] = useState<string | null>(null)
  const [storyLoading, setStoryLoading] = useState(false)
  const [storyProgress, setStoryProgress] = useState(0)
  const [storyError, setStoryError] = useState('')
  const [storyText, setStoryText] = useState('')
  
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(false)
  const [needTapToPlay, setNeedTapToPlay] = useState(false)
  const [volumeOpen, setVolumeOpen] = useState(false)
  const prevVolumeRef = useRef<number | null>(null)
  const VOLUME_KEY = 'liaoliao_yisheng_bgm_volume'
  const ENABLE_KEY = 'liaoliao_yisheng_bgm_enabled'
  const [bgmVolume, setBgmVolume] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(VOLUME_KEY)
      const v = raw == null ? NaN : Number(raw)
      if (!Number.isFinite(v)) return 0.6
      return clamp(v, 0, 1)
    } catch {
      return 0.6
    }
  })
  const [bgmEnabled, setBgmEnabled] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(ENABLE_KEY)
      if (raw == null) return true
      return raw === 'true'
    } catch {
      return true
    }
  })
  const themeSong = useMemo<Song>(() => {
    return {
      id: 'liaoliao-theme-kioku',
      title: '-記憶-(ヨスガノソラ メインテーマ)',
      artist: '市川淳',
      cover: '/icons/music-cover.png',
      url: '/music/kioku.mp3',
      duration: 999,
      source: 'builtin',
    }
  }, [])

  // 同步音量到 audio 元素，并记住配置
  useEffect(() => {
    try {
      if (audioRef.current) audioRef.current.volume = clamp(bgmVolume, 0, 1)
    } catch {
      // ignore
    }
    try {
      localStorage.setItem(VOLUME_KEY, String(clamp(bgmVolume, 0, 1)))
    } catch {
      // ignore
    }
  }, [bgmVolume, audioRef])

  // 记住“是否开启背景音乐”
  useEffect(() => {
    try {
      localStorage.setItem(ENABLE_KEY, String(!!bgmEnabled))
    } catch {
      // ignore
    }
    // 关闭时：如果当前正在放主题曲，直接暂停
    if (!bgmEnabled) {
      try {
        const src = (audioRef.current?.src || '').toLowerCase()
        if (src.includes('kioku.mp3')) {
          pauseMusic()
        }
      } catch {
        // ignore
      }
      setNeedTapToPlay(false)
    }
  }, [bgmEnabled, audioRef, pauseMusic])

  // 进入页面自动播放主题曲（若浏览器拦截自动播放，则给一个“点一下播放”的兜底）
  useEffect(() => {
    // 保存进入前的全局音量，离开时还原（避免影响别的 App 播放音量）
    if (prevVolumeRef.current == null) {
      try {
        prevVolumeRef.current = audioRef.current?.volume ?? null
      } catch {
        prevVolumeRef.current = null
      }
    }

    if (!bgmEnabled) {
      return () => {
        // 还原进入前音量
        try {
          if (audioRef.current && prevVolumeRef.current != null) {
            audioRef.current.volume = clamp(prevVolumeRef.current, 0, 1)
          }
        } catch {
          // ignore
        }
      }
    }

    // loop 仅作用于主题曲播放期间
    const a = audioRef.current
    if (a) {
      a.loop = true
      try {
        a.volume = clamp(bgmVolume, 0, 1)
      } catch {
        // ignore
      }
    }
    setNeedTapToPlay(false)
    playSong(themeSong)

    const t = window.setTimeout(() => {
      const a2 = audioRef.current
      // 仍处于暂停：大概率是自动播放策略拦截，需要用户再点一下
      if (a2 && a2.paused) setNeedTapToPlay(true)
    }, 800)

    return () => {
      window.clearTimeout(t)
      const a3 = audioRef.current
      if (a3) a3.loop = false
      // 离开页面：如果当前播放的是主题曲，则暂停，避免“退回主页还在循环”
      try {
        const src = (audioRef.current?.src || '').toLowerCase()
        if (src.includes('kioku.mp3')) {
          pauseMusic()
        }
      } catch {
        // ignore
      }
      // 还原进入前音量
      try {
        if (audioRef.current && prevVolumeRef.current != null) {
          audioRef.current.volume = clamp(prevVolumeRef.current, 0, 1)
        }
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgmEnabled])
  
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.version === 1) {
          // 轻量存档迁移：补齐新增字段默认值
          const migrated: GameState = {
            ...parsed,
            yearFlags: {
              explored: !!parsed?.yearFlags?.explored,
              chattedIds: Array.isArray(parsed?.yearFlags?.chattedIds) ? parsed.yearFlags.chattedIds : [],
              popup: parsed?.yearFlags?.popup ?? null,
            },
            hasPastLover: !!parsed?.hasPastLover,
            spouseId: parsed?.spouseId ?? (Array.isArray(parsed?.relations) ? (parsed.relations.find((r: any) => r?.role === 'lover')?.id ?? null) : null),
            friendNames: Array.isArray(parsed?.friendNames) ? parsed.friendNames : [],
            usedFriendNames: Array.isArray(parsed?.usedFriendNames) ? parsed.usedFriendNames : [],
            lastEventId: parsed?.lastEventId ?? null,
            treasureCd: typeof parsed?.treasureCd === 'number' ? parsed.treasureCd : 0,
            marketDemonCd: typeof parsed?.marketDemonCd === 'number' ? parsed.marketDemonCd : 0,
            breakthroughDrops: typeof parsed?.breakthroughDrops === 'number' ? parsed.breakthroughDrops : 0,
            breakthroughBonus: typeof parsed?.breakthroughBonus === 'number' ? parsed.breakthroughBonus : 0,
            pendingRescue: Array.isArray(parsed?.pendingRescue)
              ? parsed.pendingRescue
              : (parsed?.pendingRescue && typeof parsed.pendingRescue === 'object' && parsed.pendingRescue.id)
                ? [parsed.pendingRescue]
                : [],
            relations: Array.isArray(parsed?.relations)
              ? parsed.relations.map((r: any) => ({
                ...r,
                favor: typeof r?.favor === 'number' ? r.favor : 0,
                affection: typeof r?.affection === 'number' ? r.affection : 0,
                affectionLocked: !!r?.affectionLocked || !!r?.spouseName,
                spouseName: r?.spouseName ?? null,
                willWait: !!r?.willWait,
                prevRole: r?.prevRole,
              }))
              : [],
            currentEvent: parsed?.currentEvent
              ? {
                ...parsed.currentEvent,
                rawText: parsed.currentEvent.rawText ?? parsed.currentEvent.text ?? '',
              }
              : null,
          }
          // 进入游戏时自动定位到日志最底部
          shouldAutoScroll.current = true
          setGame(migrated)
          return
        }
      }
    } catch { /* ignore */ }
    setGame(null)
  }, [])
  
  useEffect(() => {
    if (!game) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(game))
    } catch { /* ignore */ }
  }, [game])

  // 确保死亡当年一定写入“详细死亡描述”，让模型能准确识别死亡年龄与结尾
  useEffect(() => {
    if (!game) return
    if (game.alive) return
    if (hasFlag(game, 'death_detail_logged')) return
    const text = makeDeathDetailText(game)
    const next: GameState = addFlag({ ...game, logs: pushLog(game, text) }, 'death_detail_logged')
    setGame(next)
  }, [game?.alive])
  
  useEffect(() => {
    if (!shouldAutoScroll.current) return
    shouldAutoScroll.current = false
    requestAnimationFrame(() => {
      // 手机上 smooth 容易“抖/跳”导致点不到按钮，改为 auto 更稳
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' })
    })
  }, [game?.logs.length, game?.currentEvent?.id])
  
  const startGame = () => {
    const seed = Date.now() ^ Math.floor(Math.random() * 1e9)
    let g = defaultNewGame(seed, selectedGender)
    g = { ...g, friendNames: invitedNames, usedFriendNames: [] }
    const rng = makeRng(seed)
    g = startYear(rng, g)
    shouldAutoScroll.current = true
    setGame(g)
  }
  
  const handleOption = (optId: string) => {
    if (!game) return
    const rng = makeRng(game.seed + game.age * 100 + game.logs.length)
    shouldAutoScroll.current = true
    setGame(resolveOption(rng, game, optId))
  }
  
  const handleNextYear = () => {
    if (!game) return
    const rng = makeRng(game.seed + game.age * 100 + game.logs.length + 999)
    shouldAutoScroll.current = true
    setGame(nextYear(rng, game))
  }
  
  const handleExplorePlace = (placeId: string) => {
    if (!game) return
    const rng = makeRng(game.seed + game.age * 200 + game.logs.length)
    shouldAutoScroll.current = true
    setGame(handleExplore(rng, game, placeId))
    setShowExplore(false)
  }
  
  const handleChatWith = (personId: string) => {
    if (!game) return
    if (game.yearFlags.chattedIds.includes(personId)) return
    const rng = makeRng(game.seed + game.age * 300 + game.logs.length + personId.charCodeAt(0))
    const result = handleChat(rng, game, personId)
    if (result) {
      shouldAutoScroll.current = true
      setGame(result.state)
      setChatResult({ personName: result.personName, text: result.chatText })
    }
  }

  const handleGiftTo = (personId: string, itemName: string) => {
    if (!game) return
    const p = game.relations.find(r => r.id === personId)
    if (!p || p.status !== 'alive') return
    if (game.yearFlags.chattedIds.includes(personId)) return
    if (!game.items.includes(itemName)) return
    const rng = makeRng(game.seed + game.age * 333 + game.logs.length + personId.charCodeAt(0) + itemName.charCodeAt(0))

    let next = { ...game, yearFlags: { ...game.yearFlags, chattedIds: [...game.yearFlags.chattedIds, personId] } }
    next = removeOneItem(next, itemName)

    if (itemName === '忘情水') {
      const lineByPer: Record<string, string[]> = {
        '冷淡疏离': ['TA接过瓶子，没有多问，只低声道：「……好。」'],
        '温柔体贴': ['TA愣了一瞬，还是接过：「若你希望如此……」'],
        '腹黑狡诈': ['TA笑了笑：「你这是……想把我从你心里擦掉？」'],
        '毒舌傲娇': ['TA咬牙：「行。」可指尖在发抖。'],
        '闷骚内敛': ['TA沉默很久，才把瓶子收起。'],
        '热情开朗': ['TA强笑着：「好啊。」声音却有点哑。'],
        '深情专一': ['TA望着你，像被刀划过一样：「……原来你想要这个。」'],
        '神秘莫测': ['TA垂眸：「因果如水，既然你要断。」'],
        '高冷禁欲': ['TA只说：「如你所愿。」'],
      }
      const line = (rng.pickOne(lineByPer[p.personality] || ['TA接过忘情水。']) as string).replace(/TA/g, ta(p))
      next = updateRelation(next, p.id, { affection: 0 })
      next = { ...next, logs: pushLog(next, `你把「忘情水」交给了${nameWithRole(p)}。\n${line}\n（${p.name}的心动归零）`) }
      shouldAutoScroll.current = true
      setGame(next)
      setInteractResult({ personName: nameWithRole(p), text: `你送出了「忘情水」。\n${line}\n\nTA的心动归零。` })
      setGiftTargetId(null)
      setInteractTargetId(null)
      return
    }

    if (itemName === '延寿丹') {
      const beforeMax = getPersonMaxLifespan(p)
      next = addPersonLifeBonusYears(next, p.id, 10)
      const after = getRelationById(next, p.id) || p
      const afterMax = getPersonMaxLifespan(after)
      const replyByPer: Record<string, string[]> = {
        '冷淡疏离': ['TA接过丹药，语气淡淡：「你别再做这种事。」', 'TA把丹药收起：「……多谢。」'],
        '温柔体贴': ['TA轻声道：「你总替别人想。」', 'TA把丹药放好：「我会好好活着，不让你白费。」'],
        '腹黑狡诈': ['TA笑了笑：「想把我拴久一点？」', 'TA指尖转了转瓷瓶：「这份情，我记账了。」'],
        '毒舌傲娇': ['TA哼了一声：「你可真会乱花灵石。」', 'TA别开脸：「……行吧，我收下。」'],
        '闷骚内敛': ['TA攥紧瓶身：「……谢谢。」', 'TA很久才说：「我会珍惜。」'],
        '热情开朗': ['TA眼睛一亮：「你也太靠谱了！」', 'TA笑着凑近：「那我可得多陪你几年。」'],
        '深情专一': ['TA看着你：「你给的岁月，我都要。」', 'TA低声道：「我会活久一点……陪你久一点。」'],
        '神秘莫测': ['TA垂眸：「寿数也是因果。」', 'TA轻笑：「好，我接下这份因。」'],
        '高冷禁欲': ['TA淡声道：「别逞强。」', 'TA颔首：「嗯。」'],
      }
      const reply = (rng.pickOne(replyByPer[p.personality] || ['TA收下了。']) as string).replace(/TA/g, ta(p))
      next = { ...next, logs: pushLog(next, `你把「延寿丹」交给了${nameWithRole(p)}。\n${reply}\n（大限：${beforeMax}→${afterMax}，不避意外）`) }
      shouldAutoScroll.current = true
      setGame(next)
      setInteractResult({ personName: nameWithRole(p), text: `你送出了「延寿丹」。\n${reply}\n\nTA的大限从${beforeMax}延到${afterMax}（不避意外）。` })
      setGiftTargetId(null)
      setInteractTargetId(null)
      return
    }

    // 普通礼物：提升好感/（若满足条件）心动
    const favorGain = randRelGain(rng, 8, 15)
    const canGainAffection =
      p.role !== 'parent' &&
      p.age >= 14 &&
      p.favor >= 80 &&
      !isMarriedToOther(p) &&
      !p.affectionLocked
    const affectionGain = canGainAffection ? randRelGain(rng, 8, 15) : 0
    next = updateRelation(next, p.id, {
      favor: clamp(p.favor + favorGain, 0, 100),
      affection: clamp((p.affection || 0) + affectionGain, 0, 100),
    })
    const replyByPer: Record<string, string[]> = {
      '冷淡疏离': ['TA点点头：「……多谢。」', 'TA收下，却仍把你护在风口。'],
      '温柔体贴': ['TA认真收好：「我会珍惜的。」', 'TA笑了：「你总是这样细心。」'],
      '腹黑狡诈': ['TA挑眉：「贿赂我？」', 'TA笑得意味深长：「我记下了。」'],
      '毒舌傲娇': ['TA别过脸：「谁、谁稀罕。」', 'TA哼了一声，却把东西收得很稳。'],
      '闷骚内敛': ['TA低声说：「……谢谢。」', 'TA耳尖微红，把东西藏进袖里。'],
      '热情开朗': ['TA一下笑开：「你也太好了吧！」', 'TA拍了拍你肩：「走，我请你吃点好的！」'],
      '深情专一': ['TA望着你：「你给的，我都要。」', 'TA轻声道：「别总照顾我，也照顾照顾自己。」'],
      '神秘莫测': ['TA看了你一眼：「因果又添一笔。」', 'TA低笑：「好，我收下。」'],
      '高冷禁欲': ['TA颔首：「嗯。」', 'TA接过，指尖在你掌心停了一瞬。'],
    }
    const reply = (rng.pickOne(replyByPer[p.personality] || ['TA收下了。']) as string).replace(/TA/g, ta(p))
    const extra = `（好感+${favorGain}${affectionGain > 0 ? `，心动+${affectionGain}` : ''}）`
    next = { ...next, logs: pushLog(next, `你送给${nameWithRole(p)}「${itemName}」。\n${reply}\n${extra}`) }
    shouldAutoScroll.current = true
    setGame(next)
    setInteractResult({ personName: nameWithRole(p), text: `你送出了「${itemName}」。\n${reply}\n${extra}` })
    setGiftTargetId(null)
    setInteractTargetId(null)
  }

  const handlePlayerConfess = (personId: string) => {
    if (!game) return
    const p = game.relations.find(r => r.id === personId)
    if (!p || p.status !== 'alive') return
    if (p.role === 'parent') return
    if (game.yearFlags.chattedIds.includes(personId)) return
    if (!isAdultForRomance(p)) return
    if (isMarriedToOther(p) || p.affectionLocked) return

    const alreadyMarried = hasAlivePlayerLover(game)
    const rng = makeRng(game.seed + game.age * 377 + game.logs.length + personId.charCodeAt(0))
    let next: GameState = { ...game, yearFlags: { ...game.yearFlags, chattedIds: [...game.yearFlags.chattedIds, personId] } }
    if (alreadyMarried) {
      next = { ...next, logs: pushLog(next, `你想对${nameWithRole(p)}说出口，却在最后一刻把话咽了回去。\n你已有道侣。`) }
      shouldAutoScroll.current = true
      setGame(next)
      setInteractResult({ personName: nameWithRole(p), text: '你终究没能说出口。\n你已有道侣。' })
      setConfessTargetId(null)
      setInteractTargetId(null)
      return
    }
    const rate = clamp((p.affection || 0) / 100, 0, 1)
    const ok = rng.chance(rate)

    if (ok) {
      const prevRole: PersonRole = p.role
      const acceptByPer: Record<string, string[]> = {
        '冷淡疏离': ['TA沉默良久，才低声道：「好。」', 'TA别过头：「别反悔。」'],
        '温柔体贴': ['TA笑得很轻：「我等你很久了。」', 'TA握住你手：「那就一起走。」'],
        '腹黑狡诈': ['TA弯起眼：「终于说了？」', 'TA轻笑：「那你就别想逃。」'],
        '毒舌傲娇': ['TA红着耳尖：「……哼。」', 'TA咬牙：「你现在才说。」'],
        '闷骚内敛': ['TA指尖发抖，却还是把你抓紧。', 'TA低声：「我愿意。」'],
        '热情开朗': ['TA一下抱住你：「我就知道！」', 'TA笑得像要把天都点亮：「好啊！」'],
        '深情专一': ['TA眼底发红：「此生唯你。」', 'TA把你抱进怀里：「别再让我等。」'],
        '神秘莫测': ['TA像是叹气又像是笑：「因果落定。」', 'TA低声：「好。」'],
        '高冷禁欲': ['TA声音很低：「……嗯。」', 'TA伸手把你拉近：「别说第二遍。」'],
      }
      const line = (rng.pickOne(acceptByPer[p.personality] || ['TA点头。']) as string).replace(/TA/g, ta(p))
      next = updateRelation(next, p.id, { role: 'lover', prevRole, favor: 100 })
      next = addFlag(next, 'has_lover')
      next = addFlag(next, `lover_id_${p.id}`)
      next = { ...next, spouseId: p.id }
      next = { ...next, logs: pushLog(next, `你向${nameWithRole(p)}表白。\n${line}\n从此，你们结为道侣。`) }
      shouldAutoScroll.current = true
      setGame(next)
      setInteractResult({ personName: nameWithRole(p), text: `表白成功（成功率${Math.floor(rate * 100)}%）。\n${line}\n你们结为道侣。` })
      setConfessTargetId(null)
      setInteractTargetId(null)
      return
    }

    // 被拒：不按“心动-30%”重锤（那是你拒绝TA的规则），这里只做轻微回落 + 也进入三年沉默期
    const rejectByPer: Record<string, string[]> = {
      '冷淡疏离': ['TA垂眸：「抱歉。」', 'TA退后一步：「到此为止。」'],
      '温柔体贴': ['TA轻声道：「我……还没准备好。」', 'TA握了握你的手又松开：「别为难彼此。」'],
      '腹黑狡诈': ['TA笑得很淡：「你确定是现在？」', 'TA眯眼：「你还不够笃定。」'],
      '毒舌傲娇': ['TA咬牙：「你别闹。」', 'TA别过头：「……不行。」'],
      '闷骚内敛': ['TA沉默很久，才摇头。', 'TA喉结动了动：「对不起。」'],
      '热情开朗': ['TA笑容僵了一瞬：「别这样……」', 'TA挠挠头：「我怕我做不好。」'],
      '深情专一': ['TA看着你，眼底很痛：「我不敢赌。」', 'TA低声：「再等等。」'],
      '神秘莫测': ['TA轻叹：「时机未到。」', 'TA低声：「别逼我。」'],
      '高冷禁欲': ['TA只说：「不。」', 'TA移开视线：「够了。」'],
    }
    const line = (rng.pickOne(rejectByPer[p.personality] || ['TA拒绝了。']) as string).replace(/TA/g, ta(p))
    next = updateRelation(next, p.id, { favor: clamp(p.favor - 8, 0, 100), affection: clamp((p.affection || 0) - 10, 0, 100) })
    next = addPersonFlag(next, p.id, `confess_block_until_${game.age + 3}`)
    next = { ...next, logs: pushLog(next, `你向${nameWithRole(p)}表白。\n${line}\n（至少三年内，不再提起）`) }
    shouldAutoScroll.current = true
    setGame(next)
    setInteractResult({ personName: nameWithRole(p), text: `表白失败（成功率${Math.floor(rate * 100)}%）。\n${line}` })
    setConfessTargetId(null)
    setInteractTargetId(null)
  }

  const handleVisitGrave = (personId: string) => {
    if (!game) return
    const p = game.relations.find(r => r.id === personId)
    if (!p || p.status !== 'dead') return
    const rng = makeRng(game.seed + game.age * 701 + game.logs.length + personId.charCodeAt(0))
    const role = p.prevRole || p.role
    const relMem: Record<PersonRole, string[]> = {
      parent: ['你站了很久，想起小时候被抱在怀里的温度。', '你低头抹去碑上的尘，忽然有点不敢看那两个字。'],
      childhood: ['你想起小时候他塞给你的糖，甜得像从前。', '你想起那年分别，他欲言又止的眼神。'],
      master: ['你想起他曾替你挡过风雪，也曾用最冷的语气教你活下去。', '你想起他一句“为师在”，竟成了绝响。'],
      senior: ['你想起他曾在你被欺负时站到你身前。', '你想起月光下他沉默的侧脸。'],
      junior: ['你想起他喊你时总带着一点急。', '你想起他把最好的东西塞给你，说“师姐先用”。'],
      friend: ['你想起你们并肩走过的路，像不该这么短。', '你想起他笑着说“有我在”。'],
      lover: ['你想起你们结契那天，他握你手的力度。', '你想起他最后一次看你，像把你刻进骨血里。'],
      enemy: ['你本该不在意，可风一吹，心里还是空了一块。'],
      demon_friend: ['你想起他尾巴扫过门槛的痕迹，像还在。', '你想起他把你护在身后时那一瞬的慌。'],
    }
    const signPool = [
      '你说着说着，旁边的树叶忽然哗哗作响，像有人在应你。',
      '风从碑后绕出来，轻轻擦过你指尖，你忽然觉得那不是风。',
      '有一只小鸟落在枝头，叫了一声又飞走，像替谁把话带走。',
      '香灰在风里打了个旋，又落回原处，像被谁小心按住。',
      '你抬头时，云缝里漏下一束光，正好照在名字上。',
    ]
    const mem = rng.pickOne(relMem[role] || relMem.friend)
    const sign = rng.pickOne(signPool)
    let next = game
    let extra = ''
    const roll = rng.nextFloat()
    if (roll < 0.18) {
      next = { ...next, stats: { ...next.stats, luck: Math.min(100, next.stats.luck + 1) } }
      extra = '\n你离开时，心里忽然安静了一点。\n（机缘+1）'
    } else if (roll < 0.3) {
      const item = rng.pickOne(['小福符', '澄心露', '启灵草'])
      next = { ...next, items: [...next.items, item] }
      extra = `\n你在碑旁发现一个很小的布包，像被人仔细埋过。\n（获得「${item}」）`
    }
    const text =
      `你去探望了「${nameWithRole(p)}」。\n\n` +
      `${mem}\n\n` +
      `你低声把这一年的事讲给TA听。\n` +
      `${sign}${extra}`
    shouldAutoScroll.current = true
    setGame({ ...next, logs: pushLog(next, text) })
    setGraveResult({ personId: p.id, personName: nameWithRole(p), text })
  }

  const handleDieAtGrave = () => {
    if (!game || !graveResult) return
    const p = game.relations.find(r => r.id === graveResult.personId)
    const who = p ? nameWithRole(p) : 'TA'
    shouldAutoScroll.current = true
    setGraveResult(null)
    setGame(killPlayer(game, `你坐在${who}的碑前。\n风声很轻，树叶却像在回应你。\n你忽然觉得——若此生尽头能靠近一点，就靠近一点。\n你闭上眼，像终于回到一个无人能打扰的地方。`, '墓前长眠'))
  }
  
  const handleUseItemClick = (itemName: string) => {
    if (!game) return
    shouldAutoScroll.current = true
    setGame(handleUseItem(game, itemName))
  }

  const hasApiConfig = !!(llmConfig.apiBaseUrl && llmConfig.apiKey && llmConfig.selectedModel)

  type BuiltNpcStoryPrompt = {
    style: '顺叙' | '倒叙' | '梦境'
    npc: Person | undefined
    name: string
    relatedLogs: string
    timeline: string
    ages: { maxAge: number; minAge: number }
    deathInfo: { idx: number; playerAge: number; clue: string } | null
    timeAnchors: ReturnType<typeof buildNpcTimeAnchors> | null
    keySnippets: string
    earlyHints: string
    tags: { isPastLover: boolean; role: PersonRole; prevRole?: PersonRole; race: Person['race'] } | null
  }

  function buildLifeStoryPrompt(g: GameState) {
    const style = pickNarrativeStyle('life')
    const rels = g.relations.slice().sort((a, b) => (b.favor || 0) - (a.favor || 0))
    const relSummary = rels
      .filter(r => r.role !== 'parent')
      .slice(0, 18)
      .map(r => `${nameWithRole(r)}｜性别:${genderLabel(r.gender)}｜种族:${r.race === 'demon' ? '妖' : '人'}｜性格:${r.personality}｜境界:${REALM_NAMES[r.realm]}｜年龄:${r.age}｜好感:${r.favor}｜心动:${r.affection || 0}${r.isPastLover ? '｜转世重逢' : ''}${r.willWait ? '｜等你' : ''}${r.spouseName ? `｜已与他人成婚:${r.spouseName}` : ''}`)
      .join('\n')
    const timeline = (g.logs || []).slice(-150).join('\n')
    const ages = parseLogAges(g.logs || [])
    return {
      style,
      relSummary,
      timeline,
      ages,
    }
  }

  function buildNpcStoryPrompt(g: GameState, npcId: string): BuiltNpcStoryPrompt {
    const npc = getRelationById(g, npcId)
    const style = pickNarrativeStyle('npc')
    const name = npc ? nameWithRole(npc) : '（某人）'
    const allLogs = g.logs || []
    const deathInfo = npc ? findNpcDeathInfo(allLogs, npc) : null
    const usableLogs = deathInfo ? allLogs.slice(0, deathInfo.idx + 1) : allLogs
    const timeAnchors = npc ? buildNpcTimeAnchors(usableLogs, npc) : null
    const earlyHints = buildNpcEarlySceneHints(npc, timeAnchors)
    // NPC视角：只提供“与TA相关”的素材，并尽量把其他NPC姓名打码，避免模型串线/跑题
    const otherNames = Array.from(new Set((g.relations || []).map(r => r?.name).filter(Boolean)))
      .filter(n => npc && n !== npc.name)
      .sort((a, b) => b.length - a.length) // 先替换长名，避免短名误伤
    const sanitize = (s: string) => {
      let out = s
      for (const n of otherNames) {
        // 只做简单替换，避免把“我/你”以外的具体名字扩散进故事
        out = out.split(n).join('某人')
      }
      return out
    }

    const key = npc ? pickNpcKeySnippets(usableLogs, npc, 36) : []
    const keySnippets = key.map(x => sanitize(`【你${x.playerAge}岁】${x.text.replace(/^【\d+岁】/, '')}`)).join('\n')

    const relatedOnly = (usableLogs || []).filter(l => npc && l.includes(npc.name))
    const relatedLogs = sanitize(relatedOnly.slice(-120).join('\n'))
    return {
      style,
      npc,
      name,
      relatedLogs,
      // 注意：NPC视角不再提供“全局时间线”，避免模型乱提他人剧情
      timeline: '',
      ages: parseLogAges(usableLogs || []),
      deathInfo,
      timeAnchors,
      keySnippets,
      earlyHints,
      tags: npc ? { isPastLover: !!npc.isPastLover, role: npc.role, prevRole: npc.prevRole, race: npc.race } : null,
    }
  }

  const startGenerateStory = async (mode: 'life' | 'npc', npcId?: string) => {
    if (!game) return
    if (!hasApiConfig) {
      setStoryError('请先到：设置App → API 配置，填写 Base URL / API Key / 模型。')
      setStoryModalOpen(true)
      setStoryMode(mode)
      return
    }
    setStoryMode(mode)
    setStoryNpcId(npcId || null)
    setStoryModalOpen(true)
    setStoryError('')
    setStoryText('')
    setStoryLoading(true)
    setStoryProgress(5)

    let p = 5
    const timer = window.setInterval(() => {
      p = Math.min(92, p + (Math.random() < 0.7 ? 4 : 7))
      setStoryProgress(p)
    }, 350)

    try {
      const sys = [
        '你是一位写修仙言情/乙女风小说的作家。',
        '文风要求：有艺术感、节奏感、意象与细节，能牵扯人心；不要像写作业，不要条列总结。',
        '允许强烈情绪流露、留白、回环、反复，但禁止说教。',
        '输出必须是简体中文，纯正文，不要标题以外的说明，不要“作为AI”等话术。',
        '长度要求：800~2000字（尽量在1200~1700字）。',
      ].join('\n')

      let user = ''
      if (mode === 'life') {
        const { style, relSummary, timeline, ages } = buildLifeStoryPrompt(game)
        const deathAge = game.age || ages.maxAge
        const deathDetail = makeDeathDetailText(game)
        user =
          `写“这一世”的小说正文（主角第一人称）。叙事结构随机采用：${style}。\n` +
          `如果是倒叙：从死亡/落幕开场，再一步步倒回最初。\n` +
          `如果是梦境：用梦/幻境/回声把事件串起，时序可跳跃，但要清晰动人。\n\n` +
          `【硬性规则：年龄】日志里每条以“【X岁】”开头的记录，X都是玩家（主角）的年龄，不是NPC年龄。\n` +
          `【硬性规则：转世重逢】若关系人里出现“转世重逢”，表示该NPC是长生者：玩家上一世寿终正寝后，TA孤独多年才找到今生的你。不要写成“TA也死在你怀里/替身文学”。\n` +
          `【硬性规则：结尾年份】主角享年${deathAge}岁，故事必须在“这一年”结束（可以不写死的瞬间，但必须让读者明确：主角已逝/尘缘已尽）。\n` +
          `【硬性规则：写法】这是小说，不是流水账：不要连续写“多少岁发生什么”。“X岁”字样全篇最多出现3次，其余用意象与场景推进。\n\n` +
          `【硬性规则：开头禁套话】开头禁止使用“风很大/风声很轻/风吹过/夜色很深/月光下”等模板句；必须从一个具体动作或物件开场。\n` +
          `【硬性规则：前期存在感】必须写至少2个“告白/结契之前”的日常镜头（童年/入门/初见/并肩等），占全文至少30%。\n\n` +
          `主角信息：性别${game.gender === 'female' ? '女' : '男'}，享年${deathAge}，境界${REALM_NAMES[game.realm]}，体魄${game.stats.body}，根骨${game.stats.root}，容貌${game.stats.face}，机缘${game.stats.luck}。\n` +
          `关系人（供你理解，不要照抄成列表）：\n${relSummary}\n\n` +
          `死亡信息（用于严格对齐结尾年份，不要照抄成“总结”，要写进小说里）：\n${deathDetail}\n\n` +
          `时间线素材（是回忆碎片，你要写成小说）：\n${timeline}\n\n` +
          `硬性要求：必须出现若干次“（身份）名字”的称呼（例如（师父）xxx），并把情感写得大胆而真实。\n` +
          `加分项：如果主角比某些NPC死得早，允许写一点“你死后他们的日子”（不要像总结，要像真正活着的人）。`
      } else {
        const { style, npc, name, relatedLogs, deathInfo, timeAnchors, keySnippets, tags, earlyHints } = buildNpcStoryPrompt(game, npcId || '')
        const playerDeathAge = game.age || parseLogAges(game.logs || []).maxAge
        const npcDeathAge = (deathInfo && typeof deathInfo.playerAge === 'number') ? deathInfo.playerAge : null
        const npcDiedEarlier = !!npc && npcDeathAge != null && npcDeathAge > 0 && npcDeathAge < playerDeathAge
        const deathDetail = npcDiedEarlier ? '' : makeDeathDetailText(game)
        const npcSelfAge = npc?.age || 0
        const anchorsText = timeAnchors && npc
          ? [
              timeAnchors.meetAge ? `- 你${timeAnchors.meetAge}岁：我与你相遇（至少要写到）。` : '',
              timeAnchors.rejectAges.length ? `- 你${timeAnchors.rejectAges.join('岁、你')}岁：你拒绝过我的心意（必须写到并写清遗憾/退场）。` : '',
              timeAnchors.vowAge ? `- 你${timeAnchors.vowAge}岁：我立过誓/说过“等你”（必须写到）。` : '',
              timeAnchors.acceptAge ? `- 你${timeAnchors.acceptAge}岁：你我结为道侣（若出现则必须写到）。` : '',
              (npcDiedEarlier && npcDeathAge) ? `- 你${npcDeathAge}岁：我将离世（正文必须止步于此年，并写出我对死亡的意识）。` : '',
            ].filter(Boolean).join('\n')
          : ''
        user =
          `写一篇“某个NPC视角”的小说正文（第一人称），主角是“我”与“你”（玩家）。叙事结构随机采用：${style}。\n` +
          `如果是倒叙/梦境也可以，但必须有强烈的情绪线索贯穿。\n\n` +
          `【硬性规则：年龄】日志里每条以“【X岁】”开头的记录，X都是玩家（主角）的年龄。\n` +
          `【硬性规则：视角稳定】全篇只能使用“我”(NPC第一人称)与“你”(玩家第二人称)。禁止突然切换第三人称旁白；叙述主体只能是“我”，不得用“他/她/TA”指代我。\n` +
          `【硬性规则：自检】输出前请自检：全文不得出现“他/她/TA做了什么”来讲我的行为；若出现，必须改写为“我”。\n` +
          `【硬性规则：只写我看到的】正文只允许写“与我直接相关/我亲历/我确知”的事：只围绕我与“你”的相遇、相处、分别（或结契/拒绝/誓言等）。\n` +
          `禁止展开描写其他NPC的具体故事线；若素材里出现“某人”，可作为背景一笔带过，但不得抢戏。\n` +
          `【硬性规则：时间感】必须有清晰的“时间流动感”（四时/年岁/阶段/那一年等），并严格服从下方“时间锚点”。\n` +
          `【硬性规则：转世重逢开关】仅当NPC标签包含“转世重逢”时，才允许出现“前世/转世/轮回/终于找到你/找了你很久”这些表达；否则一律禁止提及前世转世，也禁止用“终于找到你”来形容师徒/同门早已相识的关系。\n` +
          `【硬性规则：开头禁套话】开头禁止使用“风很大/风声很轻/风吹过/夜色很深/月光下”等模板句；必须从一个具体动作或物件开场。\n` +
          `【硬性规则：结构】全文必须至少包含4段清晰阶段：A早期相处（≥35%，告白/结契前日常至少2个）→B转折（拒绝/誓言/错过）→C情感落点（结契或遗憾）→D结局（写清我对死亡或结局的意识）。\n` +
          `【硬性规则：写法】不要写成“多少岁发生什么”的流水账，年龄字样全篇最多出现2次。\n` +
          (npcDiedEarlier
            ? `【硬性规则：视角截止】我（NPC）在你${npcDeathAge}岁那一年就已死去/离世；正文必须在这一年结束。\n【硬性规则：禁止穿帮】我死后你发生的一切，我都不可能知道；禁止描写你在${npcDeathAge}岁之后的人生事件。\n\n`
            : `【硬性规则：我知道你已死】主角享年${playerDeathAge}岁；如果我活得更久，结尾要写出“我意识到你已死”的那一刻，以及之后我如何活（哪怕只是一小段）。\n\n`) +
          `NPC设定：${name}，性别${npc ? genderLabel(npc.gender) : '未知'}，种族${npc?.race === 'demon' ? '妖' : '人'}，性格${npc?.personality || '未知'}，境界${npc ? REALM_NAMES[npc.realm] : '未知'}，年龄${npcSelfAge}。\n` +
          `NPC标签：${tags?.isPastLover ? '转世重逢' : '无'}；与玩家关系起点：${tags?.prevRole ? ROLE_NAMES[tags.prevRole] : (tags?.role ? ROLE_NAMES[tags.role] : '未知')}。\n` +
          (earlyHints ? `早期片段提示（必须写到至少1条，不要照抄成列表）：\n${earlyHints}\n\n` : '') +
          (anchorsText ? `时间锚点（必须遵守，不要逐条照抄，但内容必须体现）：\n${anchorsText}\n\n` : '') +
          `你需要大胆补写：我遇见你之前的人生（符合身份/性格/种族），以及我在你看不见的地方做过的事。\n\n` +
          (npcDiedEarlier
            ? `NPC死亡线索（我将于此处前后离世，正文必须止步于此）：\n${deathInfo?.clue || '（无）'}\n\n`
            : `死亡信息（用于严格对齐结尾年份与“我知道你已死”）：\n${deathDetail}\n\n`) +
          `关键事件摘录（已经按“你X岁”标好时间，务必优先融入剧情，别遗漏）：\n${keySnippets || '（无）'}\n\n` +
          `与我相关的碎片（补充素材，禁止写成流水账）：\n${relatedLogs || '（几乎没有与我直接相关的日志，请你谨慎补写，但仍需只围绕我与你。）'}\n\n` +
          `硬性要求：必须多次用“（身份）名字”称呼彼此；文字要像小说，不要像总结。`
      }

      const out = await callLLM(
        [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        undefined,
        { temperature: 1.05, maxTokens: 1400, timeoutMs: 600000 }
      )

      setStoryText(out)
      // 自动存档到“前世今生”
      const now = Date.now()
      const dt = new Date(now)
      const pad = (n: number) => String(n).padStart(2, '0')
      const stamp = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
      const npc = mode === 'npc' && npcId ? getRelationById(game, npcId) : null
      const entry: SavedStory = {
        id: `story_${now}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: now,
        title: mode === 'life' ? `前世今生·这一世（${stamp}）` : `前世今生·${npc ? nameWithRole(npc) : '某人'}视角（${stamp}）`,
        mode,
        npcLabel: npc ? nameWithRole(npc) : undefined,
        text: out,
      }
      setSavedStories(prev => {
        const nextStories = [entry, ...(prev || [])].slice(0, 30)
        saveSavedStories(nextStories)
        return nextStories
      })
      setStoryProgress(100)
    } catch (e: any) {
      setStoryError(String(e?.message || e || '生成失败'))
      setStoryProgress(100)
    } finally {
      window.clearInterval(timer)
      setStoryLoading(false)
    }
  }

  const handleClosePopup = () => {
    if (!game) return
    setGame({ ...game, yearFlags: { ...game.yearFlags, popup: null } })
  }

  const handleAskDivorce = (personId: string) => {
    if (!game) return
    const person = game.relations.find(r => r.id === personId)
    if (!person) return
    const rng = makeRng(game.seed + game.age * 777 + game.logs.length + personId.charCodeAt(0))
    const text = makeDivorceText(rng, game, person)
    setDivorcePrompt({ id: personId, name: person.name, text })
  }

  const handleConfirmDivorce = () => {
    if (!game || !divorcePrompt) return
    const person = game.relations.find(r => r.id === divorcePrompt.id)
    if (!person) { setDivorcePrompt(null); return }
    const backRole: PersonRole = person.prevRole || 'friend'
    let next = updateRelation(game, person.id, {
      role: backRole,
      favor: clamp(person.favor - 30, 0, 100),
      affection: Math.max(0, Math.min(100, (person.affection || 0) - 25)),
    })
    next = removeFlag(next, 'has_lover')
    next = removeFlag(next, `lover_id_${person.id}`)
    next = { ...next, spouseId: null }
    next = { ...next, logs: pushLog(next, `「${person.name}」挽留道：\n${divorcePrompt.text}`) }
    next = { ...next, logs: pushLog(next, `你与「${person.name}」解除了道侣之约。`) }
    shouldAutoScroll.current = true
    setGame(next)
    setDivorcePrompt(null)
  }
  
  const canNextYear = game?.alive && !game?.currentEvent
  
  const aliveRelations = useMemo(() => {
    if (!game) return []
    return game.relations.filter(r => r.status === 'alive')
  }, [game?.relations])

  const deadRelations = useMemo(() => {
    if (!game) return []
    return game.relations.filter(r => r.status === 'dead')
  }, [game?.relations])

  const groupedRelations = useMemo(() => {
    if (!game) return { parents: [], friends: [], sect: [], lovers: [] as Person[], deceased: [] as Person[] }
    const parents = aliveRelations.filter(r => r.role === 'parent')
    const lovers = aliveRelations.filter(r => r.role === 'lover')
    const sect = aliveRelations
      .filter(r => r.role === 'master' || r.role === 'senior' || r.role === 'junior')
      .filter(r => !r.isPastLover) // 前世线归“朋友”
      .filter(r => r.race !== 'demon') // 妖怪归“朋友”
      .filter(r => r.role !== 'lover')
    const friends = aliveRelations
      .filter(r => r.role !== 'parent')
      .filter(r => r.role !== 'lover')
      .filter(r => !(r.role === 'master' || r.role === 'senior' || r.role === 'junior') || r.isPastLover || r.race === 'demon')
    const deceased = deadRelations.slice().sort((a, b) => (b.favor || 0) - (a.favor || 0))
    return { parents, friends, sect, lovers, deceased }
  }, [game, aliveRelations, deadRelations])
  
  return (
    <div
      className="relative h-full flex flex-col overflow-hidden"
      style={{
        backgroundImage: 'url(/icons/liaoliao-yisheng-bg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* 统一背景遮罩：保证文字可读 */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/35" />
      <div className="relative z-20 px-3 pt-2">
        <AppHeader
          title="寥寥一生·修仙"
          rightElement={
            <button
              type="button"
              onClick={() => { localStorage.removeItem(STORAGE_KEY); setGame(null) }}
              className="text-xs px-2 py-1 rounded-full bg-white/30 text-white/90"
            >
              重生
            </button>
          }
        />
      </div>

      {/* 音量/开关：独立悬浮按钮，避免被 AppHeader 的 w-14 挤没 */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setBgmEnabled((v) => !v)}
          className="text-xs px-2 py-1 rounded-full bg-black/40 text-white/90 backdrop-blur border border-white/15 active:bg-black/50"
        >
          {bgmEnabled ? '关BGM' : '开BGM'}
        </button>
        <button
          type="button"
          onClick={() => setVolumeOpen(true)}
          className="text-xs px-2 py-1 rounded-full bg-black/40 text-white/90 backdrop-blur border border-white/15 active:bg-black/50"
        >
          音量
        </button>
      </div>

      {/* 音量调节弹窗 */}
      {volumeOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-3" onClick={() => setVolumeOpen(false)}>
          <div
            className="w-full max-w-[420px] rounded-3xl bg-white/90 backdrop-blur border border-white/60 shadow-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-gray-800">背景音乐音量</div>
              <button type="button" onClick={() => setVolumeOpen(false)} className="text-sm text-gray-500">关闭</button>
            </div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-gray-600">背景音乐</div>
              <button
                type="button"
                onClick={() => setBgmEnabled((v) => !v)}
                className={`text-xs px-3 py-1 rounded-full border ${
                  bgmEnabled ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200'
                }`}
              >
                {bgmEnabled ? '开启中' : '已关闭'}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-gray-600 w-10">0%</div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(clamp(bgmVolume, 0, 1) * 100)}
                onChange={(e) => setBgmVolume(clamp(Number(e.target.value) / 100, 0, 1))}
                className="flex-1"
                disabled={!bgmEnabled}
              />
              <div className="text-xs text-gray-600 w-12 text-right">
                {Math.round(clamp(bgmVolume, 0, 1) * 100)}%
              </div>
            </div>
            <div className="mt-3 text-[11px] text-gray-500">
              提示：部分手机会拦截自动播放；若没声音，请先点一次页面中的“播放主题曲”按钮。
            </div>
          </div>
        </div>
      )}

      {/* 主题曲自动播放兜底：若被浏览器拦截，提示用户点一下 */}
      {needTapToPlay && (
        <div className="px-3 mt-1">
          <button
            type="button"
            onClick={() => { setNeedTapToPlay(false); playSong(themeSong) }}
            className="w-full rounded-2xl bg-black/40 text-white/90 text-xs font-semibold py-2 backdrop-blur border border-white/15 active:bg-black/50"
          >
            点击播放主题曲：{themeSong.title} - {themeSong.artist}
            <span className="ml-2 text-white/70 font-medium">（自动播放被系统拦截了）</span>
          </button>
        </div>
      )}
      
      <div className="relative z-10 flex-1 flex flex-col px-3 pb-3 min-h-0">
        {!game ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-full max-w-[360px] rounded-3xl bg-white/80 backdrop-blur border border-white/50 shadow-lg p-6">
              <div className="text-xl font-bold text-gray-800 mb-2 text-center">寥寥一生·修仙篇</div>
              <div className="text-sm text-gray-600 mb-6 text-center leading-relaxed">
                一朝入仙门，红尘皆过客。<br />
                你将经历怎样的人生？<br />
                遇见谁，爱上谁，又失去谁？
              </div>
              <div className="mb-4">
                <div className="text-xs text-gray-500 mb-2">主角性别</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedGender('female')}
                    className={`py-2 rounded-xl text-sm font-medium ${selectedGender === 'female' ? 'bg-purple-500 text-white' : 'bg-white/70 text-gray-700 border border-gray-200'}`}
                  >
                    女
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedGender('male')}
                    className={`py-2 rounded-xl text-sm font-medium ${selectedGender === 'male' ? 'bg-purple-500 text-white' : 'bg-white/70 text-gray-700 border border-gray-200'}`}
                  >
                    男
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInvite(true)}
                className="w-full py-2 rounded-2xl bg-white/70 border border-gray-200 text-gray-700 text-sm font-medium active:scale-[0.99]"
              >
                邀请好友进入平行世界
                <div className="text-[11px] text-gray-400 mt-0.5">
                  已选择 {invitedNames.length} 个名字（只复刻名字）
                </div>
              </button>
              <button
                type="button"
                onClick={() => setShowSavedStories(true)}
                disabled={savedStories.length === 0}
                className="w-full py-2 rounded-2xl bg-white/70 border border-gray-200 text-gray-700 text-sm font-medium active:scale-[0.99] disabled:opacity-50"
              >
                前世今生
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {savedStories.length ? `已存 ${savedStories.length} 篇` : '暂无存档'}
                </div>
              </button>
              <button
                type="button"
                onClick={startGame}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold active:scale-[0.98]"
              >
                踏入修仙之路
              </button>
              <div className="text-[11px] text-gray-400 mt-4 text-center">
                进度自动保存在本地，清理浏览器数据会丢失存档
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* 状态栏 */}
            <div className="rounded-2xl bg-white/70 backdrop-blur border border-white/50 p-3 mb-2">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-sm font-bold text-gray-800">{game.name}</span>
                  <span className="text-xs text-gray-500 ml-2">{game.age}岁</span>
                  <span className="text-xs text-purple-600 ml-2">{REALM_NAMES[game.realm]}</span>
                </div>
                <div className="text-xs text-gray-500">
                  灵石: <span className="text-yellow-600 font-bold">{game.money}</span>
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-2 mb-2">
                {(['body', 'root', 'face', 'luck'] as StatKey[]).map(k => (
                  <div key={k} className="text-center">
                    <div className="text-[10px] text-gray-500">{STAT_LABELS[k]}</div>
                    <div className="text-sm font-bold text-gray-800">{game.stats[k]}</div>
                    <div className="h-1 rounded-full bg-gray-200 mt-0.5">
                      <div className={`h-full rounded-full bg-gradient-to-r ${STAT_COLORS[k]}`} style={{ width: `${game.stats[k]}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex items-center gap-2">
                <div className="text-[10px] text-gray-500">修为</div>
                <div className="flex-1 h-2 rounded-full bg-gray-200">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-cyan-400" style={{ width: `${game.cultivation}%` }} />
                </div>
                <div className="text-[10px] text-gray-600">{game.cultivation}/100</div>
                <div className="text-[10px] text-gray-500 whitespace-nowrap">突破{getBreakthroughRateLabel(game)}</div>
              </div>
            </div>
            
            {/* 日志区域 */}
            <div
              ref={scrollRef}
              className="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-white/60 backdrop-blur border border-white/50 p-3 custom-scrollbar"
            >
              <div className="text-xs text-gray-400 mb-2">修仙记</div>
              <div className="space-y-2">
                {game.logs.slice(-60).map((line, idx) => (
                  <div key={idx} className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {line}
                  </div>
                ))}
              </div>
              
              {/* 当前事件 */}
              {game.alive && game.currentEvent && (
                <div className="mt-4 pt-3 border-t border-white/60">
                  <div className="rounded-xl bg-white/80 p-3">
                    <div className="text-sm font-bold text-gray-800 mb-1">{game.currentEvent.title}</div>
                    <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{game.currentEvent.text}</div>
                    {!!game.yearFlags.popup && (
                      <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        先关闭上方弹窗，才能选择本年事件。
                      </div>
                    )}
                    <div className="mt-3 space-y-2">
                      {game.currentEvent.options.map(o => (
                        <button
                          key={o.id}
                          type="button"
                          disabled={!!game.yearFlags.popup || game.currentEvent?.resolved}
                          onClick={() => handleOption(o.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                            game.currentEvent?.resolved
                              ? o.picked ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-gray-50 border-gray-200 text-gray-400'
                              : (!!game.yearFlags.popup ? 'bg-gray-50 border-gray-200 text-gray-400' : 'bg-white border-gray-200 hover:border-purple-300 active:bg-purple-50')
                          }`}
                        >
                          <div className="text-sm">{o.text}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              
              {/* 死亡 */}
              {!game.alive && (
                <div className="mt-4 pt-3 border-t border-white/60">
                  <div className="rounded-xl bg-gray-100 p-4 text-center">
                    <div className="text-sm font-bold text-gray-800">人生落幕</div>
                    <div className="text-xs text-gray-500 mt-1">你活了{game.age}岁，境界{REALM_NAMES[game.realm]}。</div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => startGenerateStory('life')}
                        className="py-2 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 active:bg-gray-50"
                      >
                        生成这一世的故事
                        <div className="text-[10px] text-gray-400 mt-0.5">800~2000字 · 随机顺叙/倒叙/梦境</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setStoryPickNpcOpen(true)}
                        className="py-2 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 active:bg-gray-50"
                      >
                        生成某位NPC视角
                        <div className="text-[10px] text-gray-400 mt-0.5">先选一个人</div>
                      </button>
                    </div>
                    {!hasApiConfig && (
                      <div className="text-[11px] text-orange-700 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 mt-3 text-left whitespace-pre-wrap">
                        需要先配置API：手机主屏 → 设置App → API 配置。
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* 底部操作栏 */}
            <div className="mt-2 rounded-2xl bg-white/70 backdrop-blur border border-white/50 p-2">
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setShowExplore(true)}
                  disabled={!game.alive || game.yearFlags.explored || game.age < 6 || !!game.currentEvent}
                  className="py-2 rounded-xl bg-green-500/80 text-white text-xs font-medium disabled:opacity-50"
                >
                  出门
                  <div className="text-[9px] opacity-80">{game.age < 6 ? '6岁后' : game.yearFlags.explored ? '已用' : '历练'}</div>
                </button>
                
                <button
                  type="button"
                  onClick={handleNextYear}
                  disabled={!canNextYear}
                  className="py-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-bold disabled:opacity-50"
                >
                  下一年
                  <div className="text-[9px] opacity-80">{game.currentEvent ? '先选' : '继续'}</div>
                </button>
                
                <button
                  type="button"
                  onClick={() => setShowRelations(true)}
                  disabled={!game.alive}
                  className="py-2 rounded-xl bg-pink-500/80 text-white text-xs font-medium disabled:opacity-50"
                >
                  关系
                  <div className="text-[9px] opacity-80">{aliveRelations.length}人</div>
                </button>
                
                <button
                  type="button"
                  onClick={() => setShowItems(true)}
                  disabled={!game.alive}
                  className="py-2 rounded-xl bg-yellow-500/80 text-white text-xs font-medium disabled:opacity-50"
                >
                  物品
                  <div className="text-[9px] opacity-80">{game.items.length}个</div>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      
      {/* 关系弹窗 */}
      {showRelations && game && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={() => setShowRelations(false)}>
          <div className="w-[92%] max-w-[420px] max-h-[75vh] rounded-3xl bg-white p-4 overflow-y-auto custom-scrollbar shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-gray-800">关系（每人每年可互动一次）</div>
              <button type="button" onClick={() => setShowRelations(false)} className="text-sm text-gray-500">关闭</button>
            </div>
            
            {/* 顶部分类 Tab */}
            <div className="grid grid-cols-5 gap-2 mb-3">
              {([
                { id: 'parents', label: `父母${groupedRelations.parents.length ? `(${groupedRelations.parents.length})` : ''}` },
                { id: 'friends', label: `朋友${groupedRelations.friends.length ? `(${groupedRelations.friends.length})` : ''}` },
                { id: 'sect', label: `宗门${groupedRelations.sect.length ? `(${groupedRelations.sect.length})` : ''}` },
                { id: 'lovers', label: `伴侣${groupedRelations.lovers.length ? `(${groupedRelations.lovers.length})` : ''}` },
                { id: 'deceased', label: `已故${groupedRelations.deceased.length ? `(${groupedRelations.deceased.length})` : ''}` },
              ] as const).map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setRelTab(t.id)}
                  className={`py-2 rounded-xl text-xs font-semibold border ${
                    relTab === t.id ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-gray-700 border-gray-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {game.relations.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-8">暂无关系人</div>
            ) : (
              <div className="space-y-2">
                {(groupedRelations[relTab] || []).length === 0 ? (
                  <div className="text-sm text-gray-400 text-center py-10">这一栏暂无关系人</div>
                ) : (
                  (groupedRelations[relTab] || []).map(r => {
                    const isDeceased = r.status === 'dead'
                    const canChat = !isDeceased && !game.yearFlags.chattedIds.includes(r.id) && !game.currentEvent
                    const hasChatted = game.yearFlags.chattedIds.includes(r.id)
                    const canVisit = isDeceased && !game.currentEvent && !game.yearFlags.popup
                    const isPlayerLover = r.role === 'lover' && game.spouseId === r.id
                    const maxAge = getPersonMaxLifespan(r)
                    return (
                      <div key={r.id} className={`rounded-2xl p-3 ${isDeceased ? 'bg-gray-100' : 'bg-gray-50'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className={`text-sm font-medium ${isDeceased ? 'text-gray-400' : 'text-gray-800'}`}>{r.name}（{r.age}/{maxAge}）</span>
                            <span className={`text-xs ml-2 ${isDeceased ? 'text-gray-400' : 'text-gray-500'}`}>{genderLabel(r.gender)}</span>
                            <span className={`text-xs ml-2 ${isDeceased ? 'text-gray-400' : 'text-purple-600'}`}>{roleLabelForLog(r)}</span>
                            {r.race === 'demon' && <span className="text-xs text-red-500 ml-1">妖</span>}
                            {r.isPastLover && <span className="text-xs text-pink-500 ml-1">✨</span>}
                            {r.willWait && <span className="text-xs text-amber-600 ml-1">等你</span>}
                            {!!r.spouseName && r.role !== 'lover' && <span className="text-xs text-gray-500 ml-1">有伴侣</span>}
                            {isDeceased && <span className="text-xs text-gray-400 ml-1">已故</span>}
                          </div>
                          <div className={`text-xs ${isDeceased ? 'text-gray-400' : 'text-gray-500'}`}>{r.age}岁 · {REALM_NAMES[r.realm]}</div>
                        </div>
                        {r.role !== 'parent' && !isDeceased && (
                          <>
                            <div className="text-xs text-gray-500 mt-1">{r.appearance}</div>
                            <div className="text-xs text-gray-400 mt-0.5">{r.personality}</div>
                          </>
                        )}
                        
                        <div className="flex items-center gap-2 mt-2">
                          <div className="text-[10px] text-gray-500 w-6">好感</div>
                          <div className="flex-1 h-1.5 rounded-full bg-gray-200">
                            <div
                              className={`h-full rounded-full ${r.favor >= 80 ? 'bg-pink-400' : r.favor >= 60 ? 'bg-blue-400' : r.favor >= 30 ? 'bg-blue-300' : 'bg-gray-400'}`}
                              style={{ width: `${Math.max(0, Math.min(100, r.favor))}%` }}
                            />
                          </div>
                          <div className="text-[10px] text-gray-600 w-6">{r.favor}</div>
                        </div>
                        
                        {r.role !== 'parent' && (r.role === 'childhood' || r.age >= 14) && (r.favor >= 80 || r.affection > 0 || r.affectionLocked) && (
                          <div className="flex items-center gap-2 mt-1">
                            <div className={`text-[10px] w-6 ${r.affectionLocked ? 'text-gray-500' : 'text-pink-500'}`}>心动</div>
                            <div className="flex-1 h-1.5 rounded-full bg-gray-200">
                              <div
                                className={`h-full rounded-full ${r.affectionLocked ? 'bg-gray-400' : 'bg-gradient-to-r from-pink-300 to-red-400'}`}
                                style={{ width: `${Math.max(0, Math.min(100, r.affection || 0))}%` }}
                              />
                            </div>
                            <div className={`text-[10px] w-10 ${r.affectionLocked ? 'text-gray-500' : 'text-pink-600'}`}>
                              {r.affectionLocked ? `锁${r.affection || 0}` : (r.affection || 0)}
                            </div>
                          </div>
                        )}
                        
                        {!isDeceased ? (
                          <button
                            type="button"
                            onClick={() => { setInteractTargetId(r.id); setGiftTargetId(null); setConfessTargetId(null) }}
                            disabled={!canChat}
                            className={`mt-2 w-full py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              hasChatted
                                ? 'bg-gray-200 text-gray-400'
                                : canChat
                                  ? 'bg-purple-100 text-purple-700 active:bg-purple-200'
                                  : 'bg-gray-200 text-gray-400'
                            }`}
                          >
                            {hasChatted ? '今年已互动' : canChat ? '聊一聊' : '先完成当前事件'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleVisitGrave(r.id)}
                            disabled={!canVisit}
                            className={`mt-2 w-full py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              canVisit ? 'bg-slate-100 text-slate-700 active:bg-slate-200' : 'bg-gray-200 text-gray-400'
                            }`}
                          >
                            {canVisit ? '探望' : '先处理当前弹窗/事件'}
                          </button>
                        )}

                        {isPlayerLover && (
                          <button
                            type="button"
                            onClick={() => handleAskDivorce(r.id)}
                            className="mt-2 w-full py-1.5 rounded-lg text-xs font-medium bg-red-100 text-red-700 active:bg-red-200"
                          >
                            解除道侣
                          </button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 选择NPC生成视角 */}
      {storyPickNpcOpen && game && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-3" onClick={() => setStoryPickNpcOpen(false)}>
          <div className="w-[92%] max-w-[420px] max-h-[75vh] rounded-3xl bg-white p-4 overflow-y-auto custom-scrollbar shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-gray-800">选择一个NPC（写TA的视角）</div>
              <button type="button" onClick={() => setStoryPickNpcOpen(false)} className="text-sm text-gray-500">关闭</button>
            </div>
            <div className="space-y-2">
              {game.relations.filter(r => r.role !== 'parent').map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setStoryPickNpcOpen(false); startGenerateStory('npc', r.id) }}
                  className="w-full text-left rounded-2xl border border-gray-200 bg-white p-3 hover:border-purple-300 active:bg-purple-50"
                >
                  <div className="text-sm font-semibold text-gray-800">{nameWithRole(r)}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {genderLabel(r.gender)} · {r.race === 'demon' ? '妖' : '人'} · {r.personality} · {REALM_NAMES[r.realm]}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 生成故事弹窗 */}
      {storyModalOpen && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/40 p-3" onClick={() => setStoryModalOpen(false)}>
          <div className="w-[92%] max-w-[520px] max-h-[80vh] rounded-3xl bg-white p-4 overflow-y-auto custom-scrollbar shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-gray-800">
                {storyMode === 'npc' ? 'TA的视角' : '这一世的故事'}
              </div>
              <button type="button" onClick={() => setStoryModalOpen(false)} className="text-sm text-gray-500">关闭</button>
            </div>

            {storyLoading && (
              <div className="mb-3">
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2 whitespace-pre-wrap">
                  正在生成中，请勿退出此页面。\n（本次将消耗 API 调用）
                </div>
                <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all" style={{ width: `${storyProgress}%` }} />
                </div>
                <div className="text-[11px] text-gray-500 mt-1">{storyProgress}%</div>
              </div>
            )}

            {storyError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-2xl px-3 py-2 whitespace-pre-wrap">
                {storyError}
              </div>
            )}

            {storyText && (
              <>
                <div className="rounded-2xl bg-gray-50 border border-gray-200 p-3 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {storyText}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyToClipboard(storyText)
                      setCopyHint(ok ? '已复制到剪贴板' : '复制失败（浏览器限制）')
                      window.setTimeout(() => setCopyHint(''), 1500)
                    }}
                    className="py-2 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 active:bg-gray-50"
                  >
                    复制全文
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (storyMode === 'npc') startGenerateStory('npc', storyNpcId || undefined)
                      else startGenerateStory('life')
                    }}
                    disabled={storyLoading}
                    className="py-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-bold disabled:opacity-50"
                  >
                    再生成一篇（结构可能不同）
                  </button>
                </div>
                {!!copyHint && (
                  <div className="mt-2 text-[11px] text-gray-500 text-center">{copyHint}</div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 前世今生：本地存档 */}
      {showSavedStories && (
        <div className="fixed inset-0 z-[78] flex items-center justify-center bg-black/40 p-3" onClick={() => setShowSavedStories(false)}>
          <div className="w-[92%] max-w-[520px] max-h-[80vh] rounded-3xl bg-white p-4 overflow-y-auto custom-scrollbar shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-gray-800">前世今生（本地存档）</div>
              <button type="button" onClick={() => setShowSavedStories(false)} className="text-sm text-gray-500">关闭</button>
            </div>
            {savedStories.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-10">暂无存档</div>
            ) : (
              <div className="space-y-2">
                {savedStories.map(s => (
                  <div key={s.id} className="rounded-2xl border border-gray-200 bg-white p-3">
                    <div className="text-sm font-semibold text-gray-800">{s.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{new Date(s.createdAt).toLocaleString('zh-CN')}</div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setViewStory(s)}
                        className="py-1.5 rounded-xl bg-purple-50 border border-purple-200 text-xs font-semibold text-purple-700 active:bg-purple-100"
                      >
                        打开
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await copyToClipboard(s.text)
                          setCopyHint(ok ? '已复制到剪贴板' : '复制失败（浏览器限制）')
                          window.setTimeout(() => setCopyHint(''), 1500)
                        }}
                        className="py-1.5 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 active:bg-gray-50"
                      >
                        复制
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = savedStories.filter(x => x.id !== s.id)
                          setSavedStories(next)
                          saveSavedStories(next)
                          if (viewStory?.id === s.id) setViewStory(null)
                        }}
                        className="py-1.5 rounded-xl bg-white border border-red-200 text-xs font-semibold text-red-600 active:bg-red-50"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
                {!!copyHint && (
                  <div className="mt-2 text-[11px] text-gray-500 text-center">{copyHint}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 查看存档全文 */}
      {viewStory && (
        <div className="fixed inset-0 z-[79] flex items-center justify-center bg-black/40 p-3" onClick={() => setViewStory(null)}>
          <div className="w-[92%] max-w-[520px] max-h-[80vh] rounded-3xl bg-white p-4 overflow-y-auto custom-scrollbar shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-gray-800">{viewStory.title}</div>
              <button type="button" onClick={() => setViewStory(null)} className="text-sm text-gray-500">关闭</button>
            </div>
            <div className="rounded-2xl bg-gray-50 border border-gray-200 p-3 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {viewStory.text}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={async () => {
                  const ok = await copyToClipboard(viewStory.text)
                  setCopyHint(ok ? '已复制到剪贴板' : '复制失败（浏览器限制）')
                  window.setTimeout(() => setCopyHint(''), 1500)
                }}
                className="py-2 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 active:bg-gray-50"
              >
                复制全文
              </button>
              <button
                type="button"
                onClick={() => setViewStory(null)}
                className="py-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-bold active:scale-[0.99]"
              >
                返回列表
              </button>
            </div>
            {!!copyHint && (
              <div className="mt-2 text-[11px] text-gray-500 text-center">{copyHint}</div>
            )}
          </div>
        </div>
      )}
      
      {/* 出门弹窗 */}
      {showExplore && game && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowExplore(false)}>
          <div className="w-full max-w-[420px] max-h-[70vh] rounded-t-3xl bg-white p-4 overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-gray-800">出门历练</div>
              <button type="button" onClick={() => setShowExplore(false)} className="text-sm text-gray-500">取消</button>
            </div>
            <div className="space-y-2">
              {EXPLORE_PLACES.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleExplorePlace(p.id)}
                  className="w-full text-left px-3 py-3 rounded-xl bg-gray-50 border border-gray-100 active:bg-gray-100"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">{p.name}</span>
                    <span className={`text-xs ${p.risk >= 0.5 ? 'text-red-500' : p.risk >= 0.3 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {p.risk >= 0.5 ? '危险' : p.risk >= 0.3 ? '中等' : '安全'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* 物品弹窗 */}
      {showItems && game && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowItems(false)}>
          <div className="w-full max-w-[420px] max-h-[70vh] rounded-t-3xl bg-white p-4 overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-gray-800">物品</div>
              <button type="button" onClick={() => setShowItems(false)} className="text-sm text-gray-500">关闭</button>
            </div>
            {game.items.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-8">背包空空</div>
            ) : (
              <div className="space-y-2">
                {game.items.map((item, idx) => {
                  const itemDef = ITEMS[item]
                  const canUse = !!itemDef && itemDef.id !== '破境丹' && itemDef.id !== '忘情水' // 破境丹自动生效；忘情水用于送人
                  return (
                    <div key={idx} className="rounded-xl bg-gray-50 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-gray-800">{item}</span>
                          {itemDef && <span className="text-xs text-gray-500 ml-2">{itemDef.desc}</span>}
                        </div>
                      </div>
                      {canUse && (
                        <button
                          type="button"
                          onClick={() => handleUseItemClick(item)}
                          className="mt-2 w-full py-1.5 rounded-lg text-xs font-medium bg-green-100 text-green-700 active:bg-green-200"
                        >
                          使用
                        </button>
                      )}
                      {itemDef?.id === '破境丹' && (
                        <div className="mt-2 text-xs text-gray-400 text-center">（突破时自动生效）</div>
                      )}
                      {itemDef?.id === '忘情水' && (
                        <div className="mt-2 text-xs text-gray-400 text-center">（只能送给NPC使用）</div>
                      )}
                      {!itemDef && (
                        <div className="mt-1 text-xs text-gray-400">特殊物品，无法使用</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* 聊天结果弹窗 */}
      {chatResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setChatResult(null)}>
          <div className="w-[90%] max-w-[360px] rounded-2xl bg-white p-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-bold text-gray-800 mb-3">与「{chatResult.personName}」的对话</div>
            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-xl p-3 max-h-[40vh] overflow-y-auto custom-scrollbar">
              {chatResult.text}
            </div>
            <button
              type="button"
              onClick={() => setChatResult(null)}
              className="mt-3 w-full py-2 rounded-xl bg-purple-500 text-white text-sm font-medium active:bg-purple-600"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 探望/扫墓弹窗 */}
      {graveResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setGraveResult(null)}>
          <div className="w-[92%] max-w-[380px] rounded-2xl bg-white p-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-bold text-gray-800 mb-3">探望「{graveResult.personName}」</div>
            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-xl p-3 max-h-[48vh] overflow-y-auto custom-scrollbar">
              {graveResult.text}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGraveResult(null)}
                className="py-2 rounded-xl bg-slate-700 text-white text-sm font-medium active:bg-slate-800"
              >
                离开
              </button>
              <button
                type="button"
                onClick={handleDieAtGrave}
                className="py-2 rounded-xl bg-black text-white text-sm font-medium active:bg-gray-900"
              >
                留在墓前
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 互动菜单：聊一聊 / 送东西 / 表白 */}
      {interactTargetId && game && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={() => setInteractTargetId(null)}>
          <div className="w-[92%] max-w-[380px] rounded-2xl bg-white p-4 shadow-xl" onClick={e => e.stopPropagation()}>
            {(() => {
              const p = game.relations.find(r => r.id === interactTargetId)
              if (!p || p.status !== 'alive') return <div className="text-sm text-gray-500">这个人不在了。</div>
              const hasInteracted = game.yearFlags.chattedIds.includes(p.id)
              const canAct = !hasInteracted && !game.currentEvent && !game.yearFlags.popup
              const confessRate = clamp(p.affection || 0, 0, 100)
              const canConfess = canAct && isAdultForRomance(p) && !isMarriedToOther(p) && !p.affectionLocked && p.role !== 'parent'
              const canGift = canAct && game.items.length > 0 && p.role !== 'parent'
              return (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-bold text-gray-800">与「{p.name}」</div>
                    <button type="button" onClick={() => setInteractTargetId(null)} className="text-sm text-gray-500">关闭</button>
                  </div>
                  <div className="text-xs text-gray-500 mb-3">
                    {roleLabelForLog(p)} · {genderLabel(p.gender)} · {p.age}岁 · {REALM_NAMES[p.realm]}
                  </div>
                  {hasInteracted && (
                    <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
                      今年你已经与TA互动过了。
                    </div>
                  )}
                  {!hasInteracted && (!!game.currentEvent || !!game.yearFlags.popup) && (
                    <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
                      先处理当前事件/弹窗，再来互动。
                    </div>
                  )}
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={!canAct}
                      onClick={() => { setInteractTargetId(null); handleChatWith(p.id) }}
                      className="w-full py-2 rounded-xl bg-purple-100 text-purple-700 text-sm font-semibold disabled:opacity-50"
                    >
                      聊一聊
                    </button>
                    <button
                      type="button"
                      disabled={!canGift}
                      onClick={() => setGiftTargetId(p.id)}
                      className="w-full py-2 rounded-xl bg-green-100 text-green-700 text-sm font-semibold disabled:opacity-50"
                    >
                      送东西
                      <div className="text-[10px] text-green-700/70 mt-0.5">背包 {game.items.length} 个</div>
                    </button>
                    <button
                      type="button"
                      disabled={!canConfess}
                      onClick={() => setConfessTargetId(p.id)}
                      className="w-full py-2 rounded-xl bg-pink-100 text-pink-700 text-sm font-semibold disabled:opacity-50"
                    >
                      表白
                      <div className="text-[10px] text-pink-700/70 mt-0.5">成功率≈{confessRate}%（按心动）</div>
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* 送东西：选择物品 */}
      {giftTargetId && game && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-3" onClick={() => setGiftTargetId(null)}>
          <div className="w-[92%] max-w-[420px] max-h-[70vh] rounded-2xl bg-white p-4 overflow-y-auto custom-scrollbar shadow-xl" onClick={e => e.stopPropagation()}>
            {(() => {
              const p = game.relations.find(r => r.id === giftTargetId)
              if (!p || p.status !== 'alive') return <div className="text-sm text-gray-500">这个人不在了。</div>
              return (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-bold text-gray-800">送给「{p.name}」</div>
                    <button type="button" onClick={() => setGiftTargetId(null)} className="text-sm text-gray-500">关闭</button>
                  </div>
                  {game.items.length === 0 ? (
                    <div className="text-sm text-gray-400 text-center py-8">背包空空</div>
                  ) : (
                    <div className="space-y-2">
                      {game.items.map((it, idx) => (
                        <button
                          key={`${it}_${idx}`}
                          type="button"
                          onClick={() => handleGiftTo(p.id, it)}
                          className="w-full text-left rounded-2xl border border-gray-200 bg-white p-3 hover:border-green-300 active:bg-green-50"
                        >
                          <div className="text-sm font-semibold text-gray-800">{it}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{ITEMS[it]?.desc || '特殊物品'}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* 表白确认 */}
      {confessTargetId && game && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-3" onClick={() => setConfessTargetId(null)}>
          <div className="w-[92%] max-w-[380px] rounded-2xl bg-white p-4 shadow-xl" onClick={e => e.stopPropagation()}>
            {(() => {
              const p = game.relations.find(r => r.id === confessTargetId)
              if (!p || p.status !== 'alive') return <div className="text-sm text-gray-500">这个人不在了。</div>
              const hasInteracted = game.yearFlags.chattedIds.includes(p.id)
              const canAct = !hasInteracted && !game.currentEvent && !game.yearFlags.popup
              const ok = canAct && isAdultForRomance(p) && !isMarriedToOther(p) && !p.affectionLocked && p.role !== 'parent'
              const rate = clamp(p.affection || 0, 0, 100)
              return (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-bold text-gray-800">向「{p.name}」表白</div>
                    <button type="button" onClick={() => setConfessTargetId(null)} className="text-sm text-gray-500">关闭</button>
                  </div>
                  <div className="text-xs text-gray-500 mb-3">
                    成功率≈{rate}%（按心动值）
                  </div>
                  {!ok && (
                    <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
                      现在不适合表白：可能是未成年/对方已成婚/心动锁定/你已有道侣/今年已互动等原因。
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={!ok}
                    onClick={() => handlePlayerConfess(p.id)}
                    className="w-full py-2 rounded-xl bg-pink-500 text-white text-sm font-bold disabled:opacity-50 active:bg-pink-600"
                  >
                    说出口
                  </button>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* 互动结果弹窗（送礼/表白） */}
      {interactResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setInteractResult(null)}>
          <div className="w-[90%] max-w-[360px] rounded-2xl bg-white p-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-bold text-gray-800 mb-3">与「{interactResult.personName}」</div>
            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-xl p-3 max-h-[40vh] overflow-y-auto custom-scrollbar">
              {interactResult.text}
            </div>
            <button
              type="button"
              onClick={() => setInteractResult(null)}
              className="mt-3 w-full py-2 rounded-xl bg-purple-500 text-white text-sm font-medium active:bg-purple-600"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 事件/约会弹窗（来自yearFlags.popup） */}
      {game?.yearFlags.popup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleClosePopup}>
          <div className="w-[92%] max-w-[380px] rounded-2xl bg-white p-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-bold text-gray-800 mb-3">{game.yearFlags.popup.title}</div>
            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-xl p-3 max-h-[48vh] overflow-y-auto custom-scrollbar">
              {game.yearFlags.popup.text}
            </div>
            <button
              type="button"
              onClick={handleClosePopup}
              className="mt-3 w-full py-2 rounded-xl bg-purple-500 text-white text-sm font-medium active:bg-purple-600"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 解除道侣弹窗 */}
      {divorcePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDivorcePrompt(null)}>
          <div className="w-[90%] max-w-[380px] rounded-2xl bg-white p-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-bold text-gray-800 mb-2">解除道侣 · 「{divorcePrompt.name}」</div>
            <div className="text-xs text-gray-500 mb-3">他试图挽留你。</div>
            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-xl p-3 max-h-[42vh] overflow-y-auto custom-scrollbar">
              {divorcePrompt.text}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                type="button"
                onClick={() => setDivorcePrompt(null)}
                className="py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium active:bg-gray-200"
              >
                算了
              </button>
              <button
                type="button"
                onClick={handleConfirmDivorce}
                className="py-2 rounded-xl bg-red-500 text-white text-sm font-medium active:bg-red-600"
              >
                确认解除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 邀请好友弹窗（只复刻名字） */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowInvite(false)}>
          <div className="w-full max-w-[420px] max-h-[75vh] rounded-t-3xl bg-white p-4 overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-gray-800">邀请好友进入平行世界</div>
              <button type="button" onClick={() => setShowInvite(false)} className="text-sm text-gray-500">关闭</button>
            </div>

            <div className="text-xs text-gray-500 mb-2">从微信角色名单快速选择（仅复刻名字，不搬人设）</div>
            <div className="flex flex-wrap gap-2 mb-3">
              {(() => {
                let names: string[] = []
                try {
                  const raw = localStorage.getItem('wechat_characters_backup')
                  if (raw) {
                    const parsed = JSON.parse(raw)
                    if (Array.isArray(parsed)) {
                      names = parsed.map((x: any) => String(x?.name || '')).filter(Boolean)
                    }
                  }
                } catch { /* ignore */ }
                names = Array.from(new Set(names)).slice(0, 30)
                if (names.length === 0) {
                  return <div className="text-xs text-gray-400">（未找到微信角色备份，可手动输入名字）</div>
                }
                return names.map(n => {
                  const picked = invitedNames.includes(n)
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setInvitedNames(picked ? invitedNames.filter(x => x !== n) : [...invitedNames, n])}
                      className={`px-3 py-1 rounded-full text-xs border ${picked ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-700 border-gray-200'}`}
                    >
                      {n}
                    </button>
                  )
                })
              })()}
            </div>

            <div className="text-xs text-gray-500 mb-2">或手动输入（每行一个名字）</div>
            <textarea
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              placeholder="例如：\n小明\n阿雪\n清玄"
              className="w-full h-24 p-3 rounded-xl border border-gray-200 text-sm outline-none"
            />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  const list = inviteInput
                    .split(/\r?\n/)
                    .map(s => s.trim())
                    .filter(Boolean)
                  if (list.length > 0) {
                    setInvitedNames(Array.from(new Set([...invitedNames, ...list])).slice(0, 50))
                    setInviteInput('')
                  }
                }}
                className="py-2 rounded-xl bg-purple-100 text-purple-700 text-sm font-medium active:bg-purple-200"
              >
                加入选择
              </button>
              <button
                type="button"
                onClick={() => setInvitedNames([])}
                className="py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium active:bg-gray-200"
              >
                清空
              </button>
            </div>

            <div className="mt-3 text-xs text-gray-500">
              已选择：<span className="text-gray-800 font-medium">{invitedNames.length}</span> 个
            </div>
          </div>
        </div>
      )}
    </div>
  )
}