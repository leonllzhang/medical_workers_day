import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

// ==================== Types ====================
interface Team {
  id: string;
  name: string;
  buzzerNumber: number;
  score: number;
  color: string;
  round: number;          // 0=not participating, 1-4=assigned round
}

interface Question {
  id: number;
  text: string;
  type: 'choice' | 'fill';
  options?: string[];
  answer?: string;
  group: number;           // 1-4
}

interface RoundTeamConfig {
  id: string;
  round: number;
  buzzerNumber: number;
}

interface Danmaku {
  id: string;
  userName: string;
  text: string;
  timestamp: number;
}

type GameMode = 'waiting' | 'reading' | 'quizzing' | 'buzzed' | 'result' | 'settlement' | 'lottery' | 'round-intro' | 'opening' | 'countdown' | 'lottery-v2';

interface LastResult {
  correct: boolean;
  teamId: string;
  teamName: string;
  points: number;
}

interface Prize {
  id: string;
  name: string;
  icon: string;
  description: string;
}

interface LotteryDrawResult {
  prize: Prize;
  winners: Team[];
}

interface DrawSession {
  active: boolean;
  phase: 'setup' | 'drawing' | 'animation' | 'complete';
  pool: Team[];
  rounds: Team[][];
  currentLeader: number;
  totalLeaders: number;
  leaderLabels: string[];
  teamsPerRound: number[];
  animatingTeams: Team[];
  drawHistory: { teamId: string; roundIndex: number }[];
  drawnTeamIds: string[];
}

interface CheckInPerson {
  id: string;
  name: string;
  department: string;
  timestamp: number;
}

interface LotteryV2RoundData {
  roundNumber: number;
  winners: CheckInPerson[];
  absentIds: string[];
  completed: boolean;
}

interface LotteryV2State {
  active: boolean;
  currentRound: number;
  phase: 'idle' | 'ready' | 'animating' | 'revealed' | 'all-complete';
  currentWinners: CheckInPerson[];
  pool: CheckInPerson[];
  allCheckInNames: string[];
  roundResults: Record<number, LotteryV2RoundData | null>;
  allWinnerIds: string[];
}

interface GameState {
  mode: GameMode;
  previousMode: GameMode;
  currentQuestion: Question | null;
  questionIndex: number;
  teams: Team[];               // ALL teams with cumulative scores
  buzzedTeam: Team | null;
  lastResult: LastResult | null;
  lotteryActive: boolean;
  lotteryDraw: LotteryDrawResult | null;
  currentRound: number;        // 1-4
  totalRounds: number;         // calculated from round config
  questionGroup: number;       // which question group (= currentRound typically)
  countdownEndTime: number;    // 0 = not started, otherwise timestamp when countdown ends
}

// ==================== Default Teams (buzzer 1-10) ====================
const COLORS_32 = [
  '#4d96ff','#ff6b6b','#6bcb77','#ff8fab','#ffd93d','#c084fc','#fb923c','#34d399',
  '#f472b6','#38bdf8','#a78bfa','#fbbf24','#f87171','#60a5fa','#f59e0b',
  '#10b981','#ec4899','#8b5cf6','#14b8a6','#f97316','#06b6d4','#84cc16','#d946ef',
  '#0ea5e9','#eab308','#22c55e','#ef4444','#3b82f6','#e11d48','#7c3aed','#0891b2',
  '#dc2626',
];

const DEPT_NAMES = [
  '病理科','放射科','超声科','心电图室','数字化技术中心','麻醉科','皮肤科','口腔科',
  '重症医学科','减重与代谢外科','神经外科','内科','神经内科','骨科','儿科','心血管内科',
  '唇腭裂整形科','血管瘤与脉管畸形整形科','颅颌面整形科','外耳整形再造科','综合整形科一病区','面颈整形科','乳房整形科','乳腺综合整形科',
  '脂肪整形科','创伤修复与组织再生中心','鼻整形再造科','会阴整形与性别重塑科','瘢痕与创面治疗科','综合整形科二病区','急诊医学中心','激光美容中心',
];

const DEFAULT_TEAMS: Team[] = DEPT_NAMES.map((name, i) => ({
  id: `team-${i + 1}`,
  name,
  buzzerNumber: 0,
  score: 60,
  color: COLORS_32[i],
  round: 0,
}));

// ==================== Question Bank ====================
const DEFAULT_QUESTIONS_TEXT = `
首诊医师接诊患者后，如刚好要下班，可以将患者做何处理？____|A.让患者到它院诊治|B.移交给接班医师|C.等上班后再继续诊治
主治医师应对所管病人每 ____ 天查房一次|A.1 天|B.2 天|C.3 天|D.4 天
新技术 (新项目) 引进，医政 (务) 科组织学术委员会专家进行论证，提出意见，报 ____ 批准后方可开展实施。|A.主管院长|B.财务科|C.相关科室科主任
对新入院普通病人，住院医师应在 ____ 小时内进行诊治并开具医嘱。|A.1 小时|B.2 小时|C.6 小时|D.12 小时
按手术分级管理制度，住院医师可单独完成的手术是 ____|A.一级手术|B.二级手术|C.三级手术|D.四级手术
急诊会诊，相关科室在接到会诊通知后，应在多长时间内到位？____|A.10 分钟|B.15 分钟|C.20 分钟|D.30 分钟
给药前，注意询问有无过敏史；使用剧、毒、麻、限药时要经过反复核对；静脉给药要注意有无变质，瓶口有无松动、裂缝；给多种药物时，要注意 ____。|A.药物剂量|B.药物浓度|C.配伍禁忌
在抢救危重症时，未能及时记录的，有关医务人员应当在抢救结束后几小时内据实补记并加以说明。____|A.2 小时|B.6 小时|C.4 小时|D.5 小时
死亡病例，一般情况下应在 ____ 内组织讨论，特殊病例 (存在医疗纠纷) 应在____内进行讨论。|A.1 天、6 小时|B.3 天、12 小时|C.1 周、1 天|D.5 天、1 天
不属于医疗核心制度的是：____|A.首诊负责制|B.三级医生查房制|C.医院感染管理制度
手术记录应当在术后 ____ 内完成。|A.6 小时|B.12 小时|C.24 小时|D.三天
科内会诊原则上应 ____, 全科人员参加。主要对本科的疑难病例、危重病例、手术病例、出现严重并发症病例或具有科研教学价值的病例等进行全科会诊。|A.每周举行两次|B.每周举行一次|C.每两周举行一次|D.每月举行一次
填空题：第一次接诊的医师或科室为首诊医师和首诊科室，首诊医师对患者的____、____、____、____、____和____等工作负责。
填空题：首诊医师必须详细询问病史，进行体格检查、必要的辅助检查和处理，并认真记录什么文书？____
填空题：首诊医师下班前，应将患者移交接班医师，把患者的病情及需注意的事项交待清楚，并认真做好什么记录。____
填空题：危重症患者如需检查、住院或转院者，首诊医师应怎样做？____
填空题：三级查房制度是指哪三级？____
填空题：医疗机构应严格明确查房周期，工作日每天至少查房几次？____ 非工作日每天至少查房几次？____
填空题：术者必须亲自在术前及术后多长时间内查房？____
填空题：三级查房中最高级别医师每周至少查房几次？____
填空题：急会诊应在会诊请求发出后多长时间内到位？____
填空题：普通会诊应当在会诊发出后多长时间内完成？____
填空题：因病情危重且不属于本科室疾病，首诊医生应等待其他科医师会诊抢救。正确？错误？
填空题：科主任查房时要听取医师、护士对医疗、护理工作及管理方面的意见，提出解决问题的方法、建议。正确？错误？
入院 3 天未确诊，治疗效果不佳，病情严重的患者应：____|A.转入上级医院诊疗|B.组织会诊讨论|C.上报院领导处理
病区值班需有一、二线和三线值班人员 ____ 值班人员为主治医师或副主任医师。|A.一线|B.二线|C.三线
一般患者每周应有 2 次 ____ 查房记录，并加以注明|A.住院医师|B.主治医师|C.主任医师 (或副主任医师)
重危患者的病程记录每天至少 1 次，病情发生变化时，随时记录，记录时间应具体到分钟，对病情稳定患者至少 ____ 天记录一次病程记录|A.2|B.3|C.4
____ 医师夜间必须在值班室留宿，不得擅自离开工作岗位，遇到需要处理的情况时应立即前往诊治。|A.听班医师|B.值班医师|C.值、听班医师
新入院患者，____ 小时内应有主治医师以上职称医师查房记录|A.24|B.48|C.72
主治医师应在 ____ 小时内对新入院病人完成检诊，提出诊断和治疗意见。|A.6 小时 (节假日 8 小时)|B.12 小时 (节假日 24 小时)|C.24 小时 (节假日 48 小时)|D.72 小时
一次用血、备血量超过 ____ 时，《输血申请单》需要科主任和输血科主任签字，并报医务科批准|A.800ml|B.1600ml|C.2500ml|D.5000ml
住院医师应在病人出院前 ____ 小时内完成出院小结。|A.6 小时|B.12 小时|C.24 小时|D.48 小时
入院 10 天仍诊断不明或治疗效果不好的，应组织 ____ 会诊。|A.科内会诊|B.科间会诊|C.全院会诊|D.院外会诊
下列关于首诊负责制，理解正确的是：____|A.谁首诊，谁负责；首诊医生应仔细询问病史，进行体格检查，认真进行诊治，做好病历记录|B.首诊医生发现患者所患疾病不属于本专业范畴，可以建议转相关科室，无需做病历记录|C.对于新入院患者必须在 1 小时内诊治；危、急、重患者必须立即接诊，并报告上级医生
一般情况下，择期手术的麻醉术前谈话和手术前谈话及签字应在什么时间进行？____|A.必须在手术前一日完成|B.必须在手术前二日完成|C.必须在手术前三日完成|D.必须在手术前四日完成
填空题：按紧急程度，会诊分为____ 和____ 。
填空题：按会诊范围，会诊分为____ 和____ 。
填空题：护理级别分为哪四个级别？____ 
填空题：未取得____ 的本院医师、进修医师、实习医师不得独立承担值班任务。
填空题：交接班内容应当专册记录，并由____和____签字确认。
填空题：急危重症患者及四级手术患者手术当日必须____ 交班 共同签字。
填空题：疑难病例均应由科室或医疗管理部门组织开展讨论。讨论原则上应由____ 主持，全科人员参加。
填空题：参加疑难病例讨论成员中应当至少有2人具有____及以上专业技术职务任职资格。
填空题：抢救过程应由责任医师及时、详实、准确记录，抢救过程中来不及记录的，应在抢救结束后____ 内补记
填空题：临床科室急危重患者的抢救，由现场____ 和____ 最高的医师主持。
填空题：住院医师上、下午下班前未巡视病房。正确？错误？
填空题：住院医师对危急、疑难的新入院病人和特殊病人应及时报告上级医师。正确？错误？
二线值班医师在接到病区有紧急抢救任务后，必须在____分钟内赶到抢救病房。 |A.5分钟|B.10分钟|C.15分钟|D.20分钟
院区内急会诊要求会诊医师在多长时间内到位？____|A.5 分钟|B.10 分钟|C.15 分钟|D.20 分钟
病人入院 7 天仍诊断不明或治疗效果不好的，应组织 ____ 会诊。|A.科内会诊|B.科间会诊|C.全院会诊|D.院外会诊
高年资副主任医师：担任副主任医师 ____ 年以上。|A.3|B.4|C.5
紧急情况下住院医师可越级使用高于权限的抗菌药物多长时间的用量？____|A.1 天|B.2 天|C.3 天|D.4 天
医嘱必须每日总查对多少次？____|A.1 次|B.2 次|C.3 次|D.4 次
每张门诊处方不得超过多少种药品？____|A.3 种|B.4 种|C.5 种|D.7 种
关于 “三级查房”, 正确的是 ____|A.副主任以上医师每周查房 1 次|B.主治医师每周查房两次|C.主治医师遇有疑难、危急病例，及时向上级医师或科主任报告|D.主治医师无需检查住院医师、进修医师的医嘱
病人出院前，哪级医师必须查房？____|A.住院医师|B.经治医师|C.主治医师|D.经治医师和上级医师
高级专业技术职务医师每周查房至少：____|A.1 次|B.2 次|C.3 次|D.4 次
病人入院 3 天仍诊断不明或治疗效果不好的，应组织 ____ 会诊。|A.科内会诊|B.科间会诊|C.全院会诊|D.院外会诊
会诊时错误的做法是____|A.值班医师提出急会诊时，应在申请单上注明“急”字|B.申请医师须全程陪同，配合会诊抢救工作|C.本院医师外出会诊必须经医务处同意，办理外出会诊审批手续，方可外出会诊|D.会诊医师遇到困难，未报告上级医师，建议将病人转院治疗
填空题：什么手术需要术前讨论？____
填空题：术前讨论的范围包括手术组讨论、医师团队讨论、____和____讨论。
填空题：死亡病例讨论原则上应当在患者死亡____内完成。尸检报告出具后____天内必须再次讨论。
填空题：死亡病例讨论应当在____范围内进行，由科主任主持，必要时邀请医疗管理部门和相关科室参加。
填空题：讨论情况及结论应由____详实记录在病历和《疑难、危重、死亡病例讨论登记本》中，讨论____应审核、签名。
填空题：为无名患者进行诊疗活动时，必须____人核对，确保对正确的患者实施正确的治疗。
填空题：三查制度是指____、____、____。
填空题：三方核查是指由____、____、____三方核对患者姓名、诊断、手术部位、手术方式等。
填空题：三方核查需要在____、____、____，对患者身份、手术部位、手术方式等进行多方参与的核查。
填空题：低年资住院医师可以在上级指导下主持____。
填空题：实习（轮转）医师的日常病程记录，带教医师应在48小时内审查、修改并签字以示负责。正确？错误？
填空题：电子病历必须符合卫生部颁发的《电子病历基本规范》。正确？错误？
关于病历书写哪项是错误的 ____|A.药名不能用符号或缩写，一种药名不能中英文混写|B.患者姓名、性别、联系电话等基本信息由挂号人员或患者本人填写，但接诊医师应予以核实、完善|C.医务人员应签全名，随机 3 人不能辨认即认为不合格 (潦草签名)|D.冒用或临摹代替他人签名
死亡病例讨论由 ____ 汇报病情、诊治及抢救经过、死亡原因初步分析及死亡初步诊断等。|A.主管医师|B.二线医师|C.科主任
关于分级护理的描述，下列哪项是正确的？____|A.特级护理：严密观察病情变化，一般每 15-30min 巡视病人一次|B.一级护理：制定护理计划，严格执行各项诊疗及护理措施及时准确逐项填写危重患者护理记录|C.二级护理：适用于病情较轻，生活能基本自理的病人|D.三级护理：给予卫生保健指导，督促病人遵守院规，满足病人身心需求
术后患者必须连续3天查房，参加查房人员不包括____|A.科主任|B.术者|C.经治医师、上级医师
关于首诊负责制，哪项是正确的 ____|A.首诊医师诊治困难，请上级医师指导|B.因存在他科疾病，在未请求会诊的情况下转入他科|C.经会诊明确为他科疾病，首诊护士不予处理病人|D.因家属强烈要求将病人转送他院，未派医护人员护送
会诊医师必须具备的最低职称条件是 ____|A.住院医师|B.主治医师|C.副主任医师|D.主任医师
一般处方不得超过 ____ 天用药量；急诊处方不得超过 ____ 天用药量。|A.3 天，1 天|B.7 天，3 天|C.7 天，5 天|D.7 天，1 天
关于电子病历哪种说法错误 ____|A.电子病历必须符合卫生部的《电子病历基本规范》|B.目前病历电子档与纸本档并存，不属于电子病历|C.不得将病情记录病历内容存储在电脑中一次性打印|D.病历电子化过程可以不按《病历书写规范》执行
关于病历质量控制错误的是 ____|A.上级医师要履行职责，及时对病历进行督查、修改、考核|B.护理人员按照有关要求做好护理病历书写，粘贴检查报告等|C.医务部、护理部定期对在院病历、出院病历抽查考核|D.病案室对病历存在的问题未通知当事人修改
严格落实门诊会诊制度，凡疑难疾病、症状 (体征) 难以确诊、____ 次含以上门诊未能确诊或不明原因治疗效果欠佳时，应按照会诊管理规定组织门诊会诊。|A.2 次|B.3 次|C.5 次|D.6 次
初步诊断时，对待查病历应列出 ____|A.全部诊断|B.3 个以上诊断|C.可能性较大的诊断|D.2 个以下诊断
关于会诊说法错误的是 ____|A.会诊医师接通知单后应签收并注明时间，应 24 小时内完成会诊|B.会诊时申请医师应全程陪同，介绍病情，听取会诊意见|C.会诊医师遇疑难问题或病情复杂时，应请上级医师协助会诊，尽快提出处理意见|D.急会诊时，会诊医师必须在 15 分钟内到达申请科室会诊
填空题：高年资主治医师最高可主持____级手术。
填空题：医疗机构应当建立新技术和新项目审批流程，所有新技术和新项目必须经过本机构相关 ____ 委员会和 ____ 委员会审核同意后，方可开展临床应用。
填空题：根据抗菌药物的安全性、疗效、细菌耐药性和价格等因素，抗菌药物分为 ____ 使用级、 ____ 使用级与 ____ 使用级三级。
填空题：具有 ____ 以上专业技术职务任职资格的医师，经培训并考核合格后，方可授予限制使用级抗菌药物处方权。
填空题：具有 ____ 专业技术职务任职资格的医师，经培训并考核合格后，方可授予特殊使用级抗菌药物处方权。
填空题： ____ 使用级抗菌药物不得在门诊使用。
填空题：在输血过程中或输血之后，受血者发生了与输血有关的新的异常表现或疾病称为 ____ 。
填空题：患者到院外会诊，如病情需要， ____ 应陪同前往。
填空题：医嘱分 ____ 和 ____ ，前者是医务人员为患者进行较长时间的常规性医疗处置开具的医嘱，后者是医务人员为患者进行一次性医疗处置开具的医嘱。
填空题：长期医嘱一般应在患者住院后或每日查房后 ____ 内开出，临时医嘱要根据病情需要随时开具。
填空题：各临床科室成立的质量管理小组，应负责对病历质量进行全程监控。正确？错误？
填空题：诊断不明确或疗效较差的；检查有重要异常发现而临床无法解救的；本地区罕见的疾病均应按疑难危重病例进行讨论。正确？错误？
`.trim();

const GROUP_LINE_COUNTS = [24, 24, 24, 24]; // Questions per group
let nextQuestionId = 1;
let questions: Question[] = [];

function loadDefaultQuestions() {
  questions = [];
  nextQuestionId = 1;
  const lines = DEFAULT_QUESTIONS_TEXT.split('\n');
  let lineIdx = 0;
  for (let g = 0; g < 4; g++) {
    const groupLines = lines.slice(lineIdx, lineIdx + GROUP_LINE_COUNTS[g]).join('\n');
    const parsed = parseQuestionsFromText(groupLines, g + 1);
    questions.push(...parsed);
    lineIdx += GROUP_LINE_COUNTS[g];
  }
}
loadDefaultQuestions();

// ==================== Prizes ====================
const PRIZES: Prize[] = [
  { id: 'prize-1',  name: '院长茶水卡',    icon: '🍵', description: '去院长办公室蹭名牌茶叶一壶，听院长夸奖5分钟' },
  { id: 'prize-2',  name: '主任咖啡券',    icon: '☕', description: '科室主任买单，大杯星巴克一杯' },
  { id: 'prize-3',  name: '食堂加腿卡',    icon: '🍗', description: '食堂打饭阿姨手不抖，多加一只鸡腿' },
  { id: 'prize-4',  name: '病历消消乐',    icon: '📋', description: '主任帮你审阅修改5份疑难病历' },
  { id: 'prize-5',  name: '免迟到金牌',    icon: '🏅', description: '当月迟到5分钟内免行政处罚一次' },
  { id: 'prize-6',  name: '优雅带教券',    icon: '😊', description: '今天主任带教只微笑不皱眉' },
  { id: 'prize-7',  name: '免夜班护身符',  icon: '🌙', description: '获得一次免值夜班的机会' },
  { id: 'prize-8',  name: '院长合影券',    icon: '📸', description: '和院长单独合影一张，装裱送框' },
  { id: 'prize-9',  name: '准时下班卡',    icon: '⏰', description: '今天到点就走，主任绝不拦你' },
  { id: 'prize-10', name: '锦鲤附体券',   icon: '🐟', description: '本周所有考试考核全部60分飘过' },
];

// ==================== State ====================
let state: GameState = {
  mode: 'opening',
  previousMode: 'opening',
  currentQuestion: null,
  questionIndex: -1,
  teams: DEFAULT_TEAMS.map(t => ({ ...t })),
  buzzedTeam: null,
  lastResult: null,
  lotteryActive: false,
  lotteryDraw: null,
  currentRound: 0,
  totalRounds: 0,
  questionGroup: 1,
  countdownEndTime: 0,
};

const danmakuQueue: Danmaku[] = [];
const MAX_DANMAKU = 50;

let drawSession: DrawSession | null = null;
let drawAnimationTimer: NodeJS.Timeout | null = null;

const checkIns: CheckInPerson[] = [];
let lotteryV2State: LotteryV2State | null = null;

function broadcastLotteryV2State() {
  io.emit('lottery-v2:state', lotteryV2State);
}

// Built-in meme phrases
const memePhrases = [
  '这题我会！快选我！',
  '张医生手速单身30年',
  '院长快发红包！',
  '医生小姐姐最美！',
  '今天食堂加鸡腿了吗？',
  '主任别皱眉，笑一个！',
  '这题太难了，告辞！',
  '我选择狗带！',
  '在线等，急！',
  '为科室争光的时候到了！',
  '全场最佳今晚是谁？',
  '这题送分题啊！',
  '抢答器在哪？我要按！',
];

// ==================== Helpers ====================
function broadcastState() {
  io.emit('game:state', {
    mode: state.mode,
    previousMode: state.previousMode,
    currentQuestion: state.currentQuestion,
    questionIndex: state.questionIndex,
    teams: state.teams,
    buzzedTeam: state.buzzedTeam,
    lastResult: state.lastResult,
    lotteryActive: state.lotteryActive,
    lotteryDraw: state.lotteryDraw,
    currentRound: state.currentRound,
    totalRounds: state.totalRounds,
    questionGroup: state.questionGroup,
    countdownEndTime: state.countdownEndTime,
  });
}

function getSortedTeams(): Team[] {
  return [...state.teams].sort((a, b) => b.score - a.score);
}

function resetForNewQuestion() {
  state.buzzedTeam = null;
  state.lastResult = null;
}

function broadcastDrawState() {
  io.emit('draw:state', drawSession);
}

function calcRoundDistribution(n: number): number[] {
  if (n <= 0) return [];
  const maxPerRound = 10;
  const numRounds = Math.ceil(n / maxPerRound);
  const baseSize = Math.floor(n / numRounds);
  const remainder = n % numRounds;
  const result: number[] = [];
  for (let r = 1; r <= numRounds; r++) {
    result.push(baseSize + (r <= remainder ? 1 : 0));
  }
  return result;
}

// Parse pipe-delimited question text into Question objects
function parseQuestionsFromText(text: string, group: number): Question[] {
  const lines = text.split('\n').filter((l: string) => l.trim());
  const result: Question[] = [];
  const cleanOpt = (s: string) => s.replace(/^[A-D]\.\s*/, '');

  for (const line of lines) {
    const parts = line.split('|').map((s: string) => s.trim());

    // 6 parts: text|A|B|C|D|answerLetter → 4 options with answer
    if (parts.length === 6 && /^[A-D]$/i.test(parts[5])) {
      result.push({ id: nextQuestionId++, text: parts[0], options: parts.slice(1, 5).map(cleanOpt), type: 'choice', answer: parts[5].toUpperCase(), group });
      continue;
    }

    // 5 parts: text|A|B|C|D (4 options, no answer) OR text|A|B|C|answer (3 options with answer)
    if (parts.length === 5) {
      if (/^[A-D]$/i.test(parts[4])) {
        // 3 options with answer
        result.push({ id: nextQuestionId++, text: parts[0], options: parts.slice(1, 4).map(cleanOpt), type: 'choice', answer: parts[4].toUpperCase(), group });
      } else {
        // 4 options no answer
        result.push({ id: nextQuestionId++, text: parts[0], options: parts.slice(1, 5).map(cleanOpt), type: 'choice', group });
      }
      continue;
    }

    // 4 parts: text|A|B|C → 3 options no answer
    if (parts.length === 4) {
      result.push({ id: nextQuestionId++, text: parts[0], options: parts.slice(1, 4).map(cleanOpt), type: 'choice', group });
      continue;
    }

    // 2 parts with ____: text_with____|answer → fill
    if (parts.length === 2 && parts[0].includes('____')) {
      result.push({ id: nextQuestionId++, text: parts[0], type: 'fill', answer: parts[1], group });
      continue;
    }

    // 1 part → display-only fill
    if (parts.length === 1 && parts[0]) {
      result.push({ id: nextQuestionId++, text: parts[0], type: 'fill', group });
      continue;
    }
  }

  return result;
}

// ==================== Socket Handlers ====================
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // Send full state to newly connected client
  socket.emit('game:state', {
    mode: state.mode,
    previousMode: state.previousMode,
    currentQuestion: state.currentQuestion,
    questionIndex: state.questionIndex,
    teams: state.teams,
    buzzedTeam: state.buzzedTeam,
    lastResult: state.lastResult,
    lotteryActive: state.lotteryActive,
    lotteryDraw: state.lotteryDraw,
    currentRound: state.currentRound,
    totalRounds: state.totalRounds,
    questionGroup: state.questionGroup,
    countdownEndTime: state.countdownEndTime,
  });

  // Send questions to newly connected client
  socket.emit('questions', questions);

  // Send current draw session state if active
  if (drawSession) {
    socket.emit('draw:state', drawSession);
  }

  // Send current lottery v2 state if active
  if (lotteryV2State) {
    socket.emit('lottery-v2:state', lotteryV2State);
  }

  // ---- Danmaku ----
  socket.on('danmaku:send', (data: { text: string; userName: string }) => {
    if (!data.text?.trim()) return;
    const d: Danmaku = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userName: data.userName || '匿名',
      text: data.text.trim(),
      timestamp: Date.now(),
    };
    danmakuQueue.push(d);
    if (danmakuQueue.length > MAX_DANMAKU) danmakuQueue.shift();
    io.emit('danmaku:new', d);
  });

  socket.on('danmaku:meme', (userName?: string) => {
    const text = memePhrases[Math.floor(Math.random() * memePhrases.length)];
    const d: Danmaku = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userName: userName || '匿名',
      text,
      timestamp: Date.now(),
    };
    danmakuQueue.push(d);
    if (danmakuQueue.length > MAX_DANMAKU) danmakuQueue.shift();
    io.emit('danmaku:new', d);
  });

  // ---- Host: get questions ----
  socket.on('host:get-questions', () => {
    socket.emit('questions', questions);
  });

  // ---- Host: next question ----
  socket.on('host:next-question', () => {
    const groupQs = questions.filter(q => q.group === state.questionGroup);
    if (groupQs.length === 0) {
      socket.emit('host:error', `第 ${state.questionGroup} 组没有题目，请先导入`);
      return;
    }
    // Check if all questions in this group have been used
    if (state.questionIndex >= groupQs.length - 1) {
      socket.emit('host:error', state.currentRound < state.totalRounds
        ? `第${state.currentRound}轮题目已答完，请进行抽奖或点击"下一轮"`
        : '本轮题目已答完，请进行抽奖或点击"结算"');
      return;
    }
    state.questionIndex++;
    state.currentQuestion = groupQs[state.questionIndex];
    resetForNewQuestion();
    state.mode = 'reading';
    broadcastState();
    console.log(`[host] → reading, Q#${state.currentQuestion.id} (group ${state.questionGroup})`);
  });

  // ---- Host: start quizzing (enter quiz mode, video plays) ----
  socket.on('host:start-quizzing', () => {
    if (!state.currentQuestion) return;
    resetForNewQuestion();
    state.mode = 'quizzing';
    broadcastState();
    console.log(`[host] → quizzing`);
  });

  // ---- Host: enter buzzer winner manually (which buzzer 1-8 won) ----
  socket.on('host:buzzer-winner', (buzzerNumber: number) => {
    // Search within current round first, then fallback to any team
    let team = state.teams.find(t => t.buzzerNumber === buzzerNumber && t.round === state.currentRound);
    if (!team) team = state.teams.find(t => t.buzzerNumber === buzzerNumber);
    if (!team) {
      const debug = state.teams.filter(t => t.round > 0).map(t => `${t.name}(R${t.round}#${t.buzzerNumber})`).join(', ');
      console.log(`[buzzer] #${buzzerNumber} not found. Current round ${state.currentRound}. Active teams: [${debug || 'none'}]`);
      socket.emit('host:error', `未找到抢答器 #${buzzerNumber} 对应的队伍`);
      return;
    }
    state.buzzedTeam = team;
    state.mode = 'buzzed';
    broadcastState();
    console.log(`[host] → buzzed, winner: ${team.name} (#${buzzerNumber}, R${team.round})`);
  });

  // ---- Host: judge answer ----
  socket.on('host:judge', (data: { correct: boolean; teamId: string; points?: number }) => {
    const team = state.teams.find(t => t.id === data.teamId);
    if (!team) return;
    if (data.correct) {
      const pts = data.points || 10;
      team.score += pts;
      state.lastResult = { correct: true, teamId: team.id, teamName: team.name, points: pts };
    } else {
      state.lastResult = { correct: false, teamId: team.id, teamName: team.name, points: 0 };
    }
    state.mode = 'result';
    broadcastState();
    console.log(`[host] judge: ${team.name} ${data.correct ? '✓ +' : '✗ 0'} (total: ${team.score})`);
  });

  // ---- Host: re-buzz (re-open question for re-buzzing after wrong answer) ----
  socket.on('host:re-buzz', () => {
    if (!state.currentQuestion) return;
    state.buzzedTeam = null;
    state.lastResult = null;
    state.mode = 'quizzing';
    broadcastState();
    console.log(`[host] re-buzz for question #${state.currentQuestion.id}`);
  });

  // ---- Host: set team score manually ----
  socket.on('host:set-score', (data: { teamId: string; score: number }) => {
    const team = state.teams.find(t => t.id === data.teamId);
    if (!team) return;
    team.score = Math.max(0, data.score);
    broadcastState();
    console.log(`[host] score set: ${team.name} = ${team.score}`);
  });

  // ---- Host: change team name ----
  socket.on('host:update-team', (data: { teamId: string; name?: string; buzzerNumber?: number }) => {
    const team = state.teams.find(t => t.id === data.teamId);
    if (!team) return;
    if (data.name) team.name = data.name;
    if (data.buzzerNumber) team.buzzerNumber = data.buzzerNumber;
    broadcastState();
  });

  // ---- Host: set mode ----
  socket.on('host:set-mode', (mode: GameMode) => {
    state.mode = mode;
    if (mode === 'waiting') {
      state.currentQuestion = null;
      state.questionIndex = -1;
      state.buzzedTeam = null;
      state.lastResult = null;
      state.lotteryActive = false;
      state.lotteryDraw = null;
      if (state.teams.every(t => t.score === 60)) {
        // only reset scores if they were already 60
      } else {
        state.teams.forEach(t => { t.score = 60; });
      }
    }
    if (mode === 'settlement') {
      state.buzzedTeam = null;
      state.lastResult = null;
    }
    if (mode === 'countdown') {
      state.countdownEndTime = 0;  // reset, waiting to start
    }
    broadcastState();
    console.log(`[host] set mode: ${mode}`);
  });

  // ---- Host: start countdown ----
  socket.on('host:start-countdown', () => {
    if (state.mode !== 'countdown') {
      socket.emit('host:error', '当前不在倒计时模式');
      return;
    }
    state.countdownEndTime = Date.now() + 20 * 60 * 1000;  // 20 minutes from now
    broadcastState();
    console.log(`[host] countdown started, ends at ${new Date(state.countdownEndTime).toLocaleTimeString()}`);
  });

  // ---- Host: lottery draw ----
  socket.on('host:lottery-draw', (data: { prizeId: string; winnerCount: number }) => {
    const prize = PRIZES.find(p => p.id === data.prizeId);
    if (!prize) {
      socket.emit('host:error', '请先选择奖品');
      return;
    }
    const count = Math.max(1, Math.min(data.winnerCount || 1, 5));
    // Shuffle teams and pick winners
    const shuffled = [...state.teams].sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, count);

    state.previousMode = state.mode;
    state.lotteryDraw = { prize, winners };
    state.mode = 'lottery';
    state.lotteryActive = true;

    broadcastState();
    console.log(`[host] lottery: ${prize.name} × ${count} winners: ${winners.map(w => w.name).join(', ')}`);
  });

  // ---- Host: lottery end (restore previous mode) ----
  socket.on('host:lottery-end', () => {
    state.lotteryActive = false;
    state.lotteryDraw = null;
    state.mode = state.previousMode;
    broadcastState();
    console.log(`[host] lottery ended, restored: ${state.mode}`);
  });

  // ==================== Lottery V2 Events ====================

  socket.on('host:lottery-v2-start', () => {
    if (!lotteryV2State) {
      lotteryV2State = {
        active: true,
        currentRound: 1,
        phase: 'ready',
        currentWinners: [],
        pool: [],
        allCheckInNames: [],
        roundResults: {},
        allWinnerIds: [],
      };
    } else if (!lotteryV2State.active && lotteryV2State.phase === 'idle') {
      // Resume from idle (interleaved mode)
      lotteryV2State.active = true;
      lotteryV2State.phase = 'ready';
    } else {
      return; // Already in progress, ignore
    }
    // Compute pool for display (exclude already-won)
    lotteryV2State.pool = checkIns.filter(p => !lotteryV2State!.allWinnerIds.includes(p.id));
    state.previousMode = state.mode;
    state.mode = 'lottery-v2';
    broadcastState();
    broadcastLotteryV2State();
    console.log(`[lottery-v2] started, round ${lotteryV2State.currentRound}`);
  });

  socket.on('stage:lottery-v2-draw', () => {
    if (!lotteryV2State || lotteryV2State.phase !== 'ready') return;

    let pool: CheckInPerson[];
    let drawCount: number;

    if (lotteryV2State.currentRound <= 3) {
      // Rounds 1-3: pool = all check-ins minus already-won, draw up to 10
      pool = checkIns.filter(p => !lotteryV2State!.allWinnerIds.includes(p.id));
      drawCount = Math.min(10, pool.length);
    } else {
      // Round 4: pool = all check-ins minus already-won (from rounds 1-3)
      pool = checkIns.filter(p => !lotteryV2State!.allWinnerIds.includes(p.id));
      // Draw count = number of absent winners from rounds 1-3
      let absentCount = 0;
      for (let r = 1; r <= 3; r++) {
        const rr = lotteryV2State.roundResults[r];
        if (rr) absentCount += rr.absentIds.length;
      }
      drawCount = Math.min(absentCount, pool.length);
      if (drawCount <= 0) {
        lotteryV2State.phase = 'all-complete';
        broadcastLotteryV2State();
        return;
      }
    }

    // Shuffle pool and pick winners
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, drawCount);

    lotteryV2State.currentWinners = winners;
    lotteryV2State.pool = pool;
    lotteryV2State.phase = 'animating';

    broadcastLotteryV2State();
    console.log(`[lottery-v2] round ${lotteryV2State.currentRound} draw: ${winners.map(w => w.name).join(', ')}`);
  });

  socket.on('stage:lottery-v2-animation-done', () => {
    if (!lotteryV2State || lotteryV2State.phase !== 'animating') return;
    lotteryV2State.phase = 'revealed';
    broadcastLotteryV2State();
    console.log(`[lottery-v2] round ${lotteryV2State.currentRound} animation done`);
  });

  socket.on('host:lottery-v2-confirm-round', (data: { absentIds: string[] }) => {
    if (!lotteryV2State || lotteryV2State.phase !== 'revealed') return;

    const round = lotteryV2State.currentRound;
    const absentIds = data.absentIds || [];

    // Save round result
    lotteryV2State.roundResults[round] = {
      roundNumber: round,
      winners: [...lotteryV2State.currentWinners],
      absentIds,
      completed: true,
    };

    // Add winners to allWinnerIds (winners can't be drawn again)
    for (const w of lotteryV2State.currentWinners) {
      if (!lotteryV2State.allWinnerIds.includes(w.id)) {
        lotteryV2State.allWinnerIds.push(w.id);
      }
    }

    lotteryV2State.currentWinners = [];

    // Determine next step
    if (round >= 4) {
      // Last round done — show summary in lottery-v2 mode
      lotteryV2State.phase = 'all-complete';
    } else if (round === 3) {
      // Check if round 4 (补抽) is needed
      let absentCount = 0;
      for (let r = 1; r <= 3; r++) {
        const rr = lotteryV2State.roundResults[r];
        if (rr) absentCount += rr.absentIds.length;
      }
      if (absentCount > 0) {
        lotteryV2State.currentRound = 4;
        lotteryV2State.phase = 'idle';
        lotteryV2State.active = false;
        state.mode = state.previousMode;
      } else {
        // All done — stay in lottery-v2 mode for summary
        lotteryV2State.phase = 'all-complete';
      }
    } else {
      // Rounds 1, 2: save and exit to quiz (interleaved flow)
      lotteryV2State.currentRound++;
      lotteryV2State.phase = 'idle';
      lotteryV2State.active = false;
      lotteryV2State.currentWinners = [];
      state.mode = state.previousMode;
    }

    broadcastState();
    broadcastLotteryV2State();
    console.log(`[lottery-v2] round ${round} confirmed, absent: ${absentIds.length}, next phase: ${lotteryV2State.phase}`);
  });

  socket.on('host:lottery-v2-exit', () => {
    if (!lotteryV2State) return;
    state.mode = state.previousMode;
    broadcastState();
    broadcastLotteryV2State();
    console.log(`[lottery-v2] exited, restored: ${state.previousMode}`);
  });

  socket.on('host:lottery-v2-end', () => {
    state.mode = state.previousMode || 'waiting';
    lotteryV2State = null;
    broadcastState();
    io.emit('lottery-v2:state', null);
    console.log(`[lottery-v2] ended`);
  });

  // ---- Host: clear check-in records ----
  socket.on('host:clear-checkins', () => {
    checkIns.length = 0;
    lotteryV2State = null;
    io.emit('lottery-v2:state', null);
    io.emit('game:state', { ...state }); // trigger re-fetch
    console.log(`[host] check-ins cleared`);
  });

  // ---- Host: show opening (save previous mode) ----
  socket.on('host:show-opening', () => {
    state.previousMode = state.mode;
    state.mode = 'opening';
    broadcastState();
    console.log(`[host] show opening, previous: ${state.previousMode}`);
  });

  // ---- Host: hide opening (restore previous mode) ----
  socket.on('host:hide-opening', () => {
    state.mode = state.previousMode;
    broadcastState();
    console.log(`[host] hide opening, restored: ${state.mode}`);
  });

  // ---- Host: reset scores ----
  socket.on('host:reset-scores', () => {
    state.teams.forEach(t => { t.score = 60; });
    broadcastState();
    console.log(`[host] scores reset`);
  });

  // ==================== Draw Ceremony Events ====================

  // ---- Admin: draw start ----
  socket.on('admin:draw-start', (data: { participatingIds?: string[] }) => {
    if (drawSession) {
      socket.emit('host:error', '抽签已在进行中');
      return;
    }
    // If participatingIds provided, mark those teams as participating
    if (data?.participatingIds) {
      state.teams.forEach(t => {
        t.round = data.participatingIds!.includes(t.id) ? 1 : 0;
      });
    }
    const participating = state.teams.filter(t => t.round > 0);
    if (participating.length === 0) {
      socket.emit('host:error', '没有参赛队伍，请先在队伍管理中勾选参赛科室');
      return;
    }
    // Shuffle participating teams
    const shuffled = [...participating].sort(() => Math.random() - 0.5);
    const teamsPerRound = calcRoundDistribution(participating.length);
    const numRounds = teamsPerRound.length;
    const leaderLabels = Array.from({ length: numRounds }, (_, i) => `第${i + 1}位领导`);

    drawSession = {
      active: true,
      phase: 'drawing',
      pool: shuffled,
      rounds: Array.from({ length: numRounds }, () => [] as Team[]),
      currentLeader: 0,
      totalLeaders: numRounds,
      leaderLabels,
      teamsPerRound,
      animatingTeams: [],
      drawHistory: [],
      drawnTeamIds: [],
    };

    broadcastDrawState();
    console.log(`[draw] started: ${participating.length} teams, ${numRounds} rounds, ${teamsPerRound.join('+')} per round`);
  });

  // ---- Shared: finish animation (move animating teams to rounds, advance) ----
  function finishDrawAnimation() {
    if (!drawSession || drawSession.phase !== 'animation') return;
    const l = drawSession.currentLeader;
    for (const team of drawSession.animatingTeams) {
      drawSession.rounds[l].push(team);
      drawSession.drawHistory.push({ teamId: team.id, roundIndex: l });
    }
    if (l + 1 < drawSession.totalLeaders) {
      drawSession.currentLeader++;
      drawSession.phase = 'drawing';
    } else {
      drawSession.phase = 'complete';
    }
    drawSession.animatingTeams = [];
    broadcastDrawState();
    console.log(`[draw] animation done → round ${l + 1}`);
  }

  // ---- Admin: draw team (draw all teams for current round at once) ----
  socket.on('admin:draw-team', () => {
    if (!drawSession || !drawSession.active) {
      socket.emit('host:error', '抽签未开始');
      return;
    }
    if (drawSession.phase === 'animation') {
      socket.emit('host:error', '正在动画中，请稍候');
      return;
    }
    // Check remaining undrawn teams
    const undrawn = drawSession.pool.filter(t => !drawSession!.drawnTeamIds.includes(t.id));
    if (undrawn.length === 0) {
      socket.emit('host:error', '抽签池已空');
      return;
    }

    const leader = drawSession.currentLeader;
    const needed = drawSession.teamsPerRound[leader] - drawSession.rounds[leader].length;
    const toDraw = Math.min(needed, undrawn.length);

    // Pick random teams from pool (keep pool intact, mark as drawn)
    const picked: Team[] = [];
    const available = [...undrawn];
    for (let i = 0; i < toDraw; i++) {
      const randomIdx = Math.floor(Math.random() * available.length);
      picked.push(available.splice(randomIdx, 1)[0]);
    }
    for (const team of picked) {
      drawSession.drawnTeamIds.push(team.id);
    }

    drawSession.animatingTeams = picked;
    drawSession.phase = 'animation';

    broadcastDrawState();
    console.log(`[draw] ${picked.length} teams picked, waiting for animation-complete`);
  });

  // ---- Client signals animation is done ----
  socket.on('draw:animation-complete', () => {
    finishDrawAnimation();
  });

  // ---- Admin: skip current animation ----
  socket.on('admin:draw-skip-animation', () => {
    if (!drawSession || drawSession.phase !== 'animation') return;
    finishDrawAnimation();
  });

  // ---- Admin: undo last draw batch (entire round) ----
  socket.on('admin:draw-undo', () => {
    if (!drawSession || !drawSession.active) return;
    if (drawSession.phase === 'animation') {
      // Cancel current animation, return all animating teams to drawn pool
      for (const team of drawSession.animatingTeams) {
        const idx = drawSession.drawnTeamIds.indexOf(team.id);
        if (idx >= 0) drawSession.drawnTeamIds.splice(idx, 1);
      }
      drawSession.animatingTeams = [];
      drawSession.phase = 'drawing';
      broadcastDrawState();
      return;
    }
    if (drawSession.drawHistory.length === 0) return;

    // Find the last round that has history entries
    const lastRoundIdx = drawSession.drawHistory[drawSession.drawHistory.length - 1].roundIndex;

    // Remove all history entries for that round and unmark teams
    const remaining: { teamId: string; roundIndex: number }[] = [];
    for (const entry of drawSession.drawHistory) {
      if (entry.roundIndex === lastRoundIdx) {
        const didx = drawSession.drawnTeamIds.indexOf(entry.teamId);
        if (didx >= 0) drawSession.drawnTeamIds.splice(didx, 1);
      } else {
        remaining.push(entry);
      }
    }
    drawSession.drawHistory = remaining;
    drawSession.rounds[lastRoundIdx] = [];
    drawSession.currentLeader = lastRoundIdx;
    drawSession.phase = 'drawing';
    broadcastDrawState();
  });

  // ---- Admin: cancel entire draw ceremony ----
  socket.on('admin:draw-cancel', () => {
    if (drawAnimationTimer) {
      clearTimeout(drawAnimationTimer);
      drawAnimationTimer = null;
    }
    drawSession = null;
    broadcastDrawState();
    console.log(`[draw] cancelled`);
  });

  // ==================== Admin Events ====================

  // ---- Admin: get full question bank ----
  socket.on('admin:get-questions', () => {
    socket.emit('admin:questions', questions);
  });

  // ---- Admin: import questions (batch, with group) ----
  socket.on('admin:import-questions', (data: { lines: string; group?: number }) => {
    const group = data.group || 1;
    const rawLines = data.lines.split('\n');
    const lines = rawLines.filter((l: string) => l.trim());
    const imported: Question[] = [];
    const errorLines: { line: number; text: string; reason: string }[] = [];

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const parsed = parseQuestionsFromText(line, group);
      if (parsed.length > 0) {
        imported.push(...parsed);
      } else {
        // Determine reason
        const parts = line.split('|').map((s: string) => s.trim());
        let reason = '格式不匹配';
        if (parts.length === 2 && !parts[0].includes('____')) reason = '填空题需包含____占位符';
        else if (parts.length === 6 && !/^[A-D]$/i.test(parts[5])) reason = '答案须为A/B/C/D';
        else if (parts.length > 6) reason = `分隔符|过多(${parts.length}段)`;
        errorLines.push({ line: lineIdx + 1, text: line.substring(0, 40) + (line.length > 40 ? '...' : ''), reason });
      }
    }

    if (imported.length > 0) {
      questions.push(...imported);
      socket.emit('admin:import-result', {
        success: true,
        count: imported.length,
        errorLines,
        questions: imported,
      });
      io.emit('questions', questions);
      console.log(`[admin] imported ${imported.length} questions (${errorLines.length} errors)`);
    } else {
      socket.emit('admin:import-result', {
        success: false,
        count: 0,
        errorLines: [{ line: 0, text: data.lines.substring(0, 40), reason: '所有行均无法解析' }],
        message: '没有有效的题目，请检查格式',
      });
    }
  });

  // ---- Admin: delete question ----
  socket.on('admin:delete-question', (questionId: number) => {
    const idx = questions.findIndex(q => q.id === questionId);
    if (idx === -1) return;
    questions.splice(idx, 1);
    socket.emit('admin:questions', questions);
    io.emit('questions', questions);
    console.log(`[admin] deleted question #${questionId}`);
  });

  // ---- Admin: get teams ----
  socket.on('admin:get-teams', () => {
    socket.emit('admin:teams', state.teams);
  });

  // ---- Admin: update team ----
  socket.on('admin:update-team', (data: { teamId: string; name?: string; buzzerNumber?: number }) => {
    const team = state.teams.find(t => t.id === data.teamId);
    if (!team) return;
    if (data.name) team.name = data.name;
    if (data.buzzerNumber) team.buzzerNumber = data.buzzerNumber;
    broadcastState();
    socket.emit('admin:teams', state.teams);
    console.log(`[admin] updated team ${team.id}: ${team.name} (#${team.buzzerNumber})`);
  });

  // ---- Admin: get round config ----
  socket.on('admin:get-round-config', () => {
    socket.emit('admin:round-config', {
      teams: state.teams.map(t => ({ id: t.id, name: t.name, color: t.color, round: t.round, buzzerNumber: t.buzzerNumber, score: t.score })),
      totalRounds: state.totalRounds,
      currentRound: state.currentRound,
    });
  });

  // ---- Admin: save round config ----
  socket.on('admin:save-round-config', (data: { teams: { id: string; round: number; buzzerNumber: number }[] }) => {
    for (const tc of data.teams) {
      const team = state.teams.find(t => t.id === tc.id);
      if (team) { team.round = tc.round; team.buzzerNumber = tc.buzzerNumber; }
    }
    const activeRounds = new Set(state.teams.filter(t => t.round > 0).map(t => t.round));
    state.totalRounds = activeRounds.size;
    state.currentRound = state.totalRounds > 0 ? 1 : 0;
    state.questionGroup = state.currentRound || 1;
    state.questionIndex = -1;
    state.currentQuestion = null;
    resetForNewQuestion();
    state.mode = 'round-intro';
    broadcastState();
    // Clear draw session so stage exits draw ceremony mode
    if (drawAnimationTimer) { clearTimeout(drawAnimationTimer); drawAnimationTimer = null; }
    drawSession = null;
    io.emit('draw:state', null);
    console.log(`[admin] round config saved: ${state.totalRounds} rounds, starting round ${state.currentRound}`);
  });

  // ---- Host: next round ----
  socket.on('host:next-round', () => {
    if (state.currentRound >= state.totalRounds) {
      socket.emit('host:error', '已经是最后一轮了');
      return;
    }
    state.currentRound++;
    state.questionGroup = state.currentRound;
    state.questionIndex = -1;
    state.currentQuestion = null;
    resetForNewQuestion();
    state.mode = 'round-intro';
    broadcastState();
    console.log(`[host] → round ${state.currentRound}/${state.totalRounds}`);
  });

  // ---- Admin: reset questions to default ----
  socket.on('admin:reset-questions', () => {
    loadDefaultQuestions();
    io.emit('questions', questions);
    console.log(`[admin] questions reset to defaults (${questions.length} questions)`);
  });
});

// ==================== Serve Static ====================
// Serve media files
const mediaPath = path.resolve(__dirname, '../../media');
app.use('/media', express.static(mediaPath));

// API endpoints to list media files (directory listing isn't enabled by default)
app.get('/api/media/videos', (_req, res) => {
  try {
    const dir = path.resolve(__dirname, '../../media/videos');
    const files = fs.readdirSync(dir).filter(f => /\.(mp4|webm|mov|avi)$/i.test(f));
    res.json(files);
  } catch { res.json([]); }
});
app.get('/api/media/audio', (_req, res) => {
  try {
    const dir = path.resolve(__dirname, '../../media/audio');
    const files = fs.readdirSync(dir).filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f));
    res.json(files);
  } catch { res.json([]); }
});
app.get('/api/media/audio/backmusic', (_req, res) => {
  try {
    const dir = path.resolve(__dirname, '../../media/audio/backmusic');
    const files = fs.readdirSync(dir).filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f));
    res.json(files);
  } catch { res.json([]); }
});

// ==================== Check-in REST API ====================
app.post('/api/checkin', (req, res) => {
  const { name, department } = req.body;
  if (!name?.trim() || !department?.trim()) {
    res.status(400).json({ error: '姓名和科室不能为空' });
    return;
  }
  // 同名去重
  if (checkIns.some(p => p.name === name.trim())) {
    res.status(409).json({ error: `"${name.trim()}" 已签到，请勿重复签到` });
    return;
  }
  const person: CheckInPerson = {
    id: `checkin-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: name.trim(),
    department: department.trim(),
    timestamp: Date.now(),
  };
  checkIns.push(person);
  io.emit('checkin:new', person);
  res.json({ success: true, person });
});

app.get('/api/checkin/list', (_req, res) => {
  res.json(checkIns);
});

// In production, serve built client
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Media served from ${mediaPath}`);
});
