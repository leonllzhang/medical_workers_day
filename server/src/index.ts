import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());

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

type GameMode = 'waiting' | 'reading' | 'quizzing' | 'buzzed' | 'result' | 'settlement' | 'lottery';

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
  '内科','外科','儿科','妇产科','急诊科','麻醉科','检验科','影像科',
  '药剂科','护理部','骨科','神经内科','神经外科','心血管内科','呼吸内科','消化内科',
  '内分泌科','肾内科','泌尿外科','眼科','耳鼻喉科','口腔科','皮肤科','康复科',
  '肿瘤科','病理科','超声科','核医学科','输血科','营养科','中医科','感染科',
];

const DEFAULT_TEAMS: Team[] = DEPT_NAMES.map((name, i) => ({
  id: `team-${i + 1}`,
  name,
  buzzerNumber: 0,
  score: 0,
  color: COLORS_32[i],
  round: 0,
}));

// ==================== Question Bank ====================
let questions: Question[] = [
  { id: 1, type: 'choice', text: '人体最大的器官是什么？', options: ['心脏', '肝脏', '皮肤', '大脑'], answer: 'C', group: 1 },
  { id: 2, type: 'choice', text: '正常成人的静息心率范围是多少？（次/分钟）', options: ['40-60', '60-100', '100-120', '120-140'], answer: 'B', group: 1 },
  { id: 3, type: 'choice', text: '以下哪种维生素可以通过阳光照射在皮肤中合成？', options: ['维生素A', '维生素B', '维生素C', '维生素D'], answer: 'D', group: 1 },
  { id: 4, type: 'choice', text: '"白大褂"的发明最初是为了什么？', options: ['彰显权威', '便于清洁消毒', '区分科室', '保暖'], answer: 'B', group: 1 },
  { id: 5, type: 'choice', text: '人体中含量最多的物质是什么？', options: ['蛋白质', '脂肪', '水', '钙'], answer: 'C', group: 1 },
  { id: 6, type: 'choice', text: '世界卫生组织的缩写是什么？', options: ['WTO', 'WHO', 'WTF', 'WIPO'], answer: 'B', group: 1 },
  { id: 7, type: 'choice', text: '"医者仁心"最早出自哪本古籍？', options: ['《黄帝内经》', '《本草纲目》', '《千金要方》', '《伤寒杂病论》'], answer: 'A', group: 1 },
  { id: 8, type: 'choice', text: '护理人员"三查七对"中的"七对"不包括以下哪项？', options: ['床号', '姓名', '年龄', '药品'], answer: 'C', group: 1 },
  { id: 9, type: 'choice', text: '医生在病历上写的"QD"是什么意思？', options: ['每天一次', '每四小时', '紧急', '停止'], answer: 'A', group: 1 },
  { id: 10, type: 'choice', text: '以下哪个不是医院常见的科室？', options: ['内科', '外科', '天文科', '儿科'], answer: 'C', group: 1 },
  { id: 11, type: 'choice', text: '"手术室"的无菌级别是？', options: ['Ⅰ级', 'Ⅱ级', 'Ⅲ级', 'Ⅳ级'], answer: 'A', group: 1 },
  { id: 12, type: 'choice', text: '哪项检查被称为"医生的听诊器延伸"？', options: ['CT', 'MRI', '超声', '心电图'], answer: 'C', group: 1 },
  { id: 13, type: 'fill', text: '医院里用于求助的紧急呼叫号码是____', answer: '120', group: 1 },
  { id: 14, type: 'choice', text: '医学上"生命体征"不包括以下哪项？', options: ['体温', '脉搏', '体重', '血压'], answer: 'C', group: 1 },
  { id: 15, type: 'choice', text: '"希波克拉底誓言"是哪个职业的职业道德准则？', options: ['护士', '医生', '药师', '技师'], answer: 'B', group: 1 },
];
let nextQuestionId = 16;

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
  mode: 'waiting',
  previousMode: 'waiting',
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
};

const danmakuQueue: Danmaku[] = [];
const MAX_DANMAKU = 50;

// Built-in meme phrases
const memePhrases = [
  '这题我会！快选我！',
  '张医生手速单身30年',
  '院长快发红包！',
  '护士小姐姐最美！',
  '内科永远的神！',
  '外科今天不加班！',
  '今天食堂加鸡腿了吗？',
  '主任别皱眉，笑一个！',
  '这题太难了，告辞！',
  '我选择狗带！',
  '在线等，急！',
  '为科室争光的时候到了！',
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
  });
}

function getSortedTeams(): Team[] {
  return [...state.teams].sort((a, b) => b.score - a.score);
}

function resetForNewQuestion() {
  state.buzzedTeam = null;
  state.lastResult = null;
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
  });

  // Send questions to newly connected client
  socket.emit('questions', questions);

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
    state.questionIndex++;
    if (state.questionIndex >= groupQs.length) state.questionIndex = 0;
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
    const points = data.points || (data.correct ? 10 : -5);
    team.score = Math.max(0, team.score + (data.correct ? points : -Math.abs(points)));
    state.lastResult = {
      correct: data.correct,
      teamId: team.id,
      teamName: team.name,
      points: data.correct ? points : -Math.abs(points),
    };
    state.mode = 'result';
    broadcastState();
    console.log(`[host] judge: ${team.name} ${data.correct ? '✓ +' : '✗ '}${points} (total: ${team.score})`);
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
      if (state.teams.every(t => t.score === 0)) {
        // only reset scores if they were already zero
      } else {
        state.teams.forEach(t => { t.score = 0; });
      }
    }
    if (mode === 'settlement') {
      state.buzzedTeam = null;
      state.lastResult = null;
    }
    broadcastState();
    console.log(`[host] set mode: ${mode}`);
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

  // ---- Host: reset scores ----
  socket.on('host:reset-scores', () => {
    state.teams.forEach(t => { t.score = 0; });
    broadcastState();
    console.log(`[host] scores reset`);
  });

  // ==================== Admin Events ====================

  // ---- Admin: get full question bank ----
  socket.on('admin:get-questions', () => {
    socket.emit('admin:questions', questions);
  });

  // ---- Admin: import questions (batch, with group) ----
  socket.on('admin:import-questions', (data: { lines: string; group?: number }) => {
    const group = data.group || 1;
    const lines = data.lines.split('\n').filter((l: string) => l.trim());
    const imported: Question[] = [];
    let errors = 0;

    for (const line of lines) {
      const parts = line.split('|').map((s: string) => s.trim());
      // 6 parts: text|optA|optB|optC|optD|answerLetter → choice with answer
      if (parts.length === 6 && /^[A-D]$/i.test(parts[5])) {
        const text = parts[0];
        const options = parts.slice(1, 5);
        if (text && options.every((o: string) => o)) {
          imported.push({ id: nextQuestionId++, text, options, type: 'choice', answer: parts[5].toUpperCase(), group });
          continue;
        }
      }

      // 5 parts: text|optA|optB|optC|optD → choice (backward compat)
      if (parts.length === 5) {
        const text = parts[0];
        const options = parts.slice(1, 5);
        if (text && options.every((o: string) => o)) {
          imported.push({ id: nextQuestionId++, text, options, type: 'choice', group });
          continue;
        }
      }

      // 2 parts with ____: text_with____|answer1,answer2 → fill
      if (parts.length === 2 && parts[0].includes('____')) {
        const text = parts[0];
        const answer = parts[1];
        if (text) {
          imported.push({ id: nextQuestionId++, text, type: 'fill', answer, group });
          continue;
        }
      }

      // Single text → display-only fill (backward compat)
      if (parts.length === 1 && parts[0]) {
        imported.push({ id: nextQuestionId++, text: parts[0], type: 'fill', group });
        continue;
      }

      errors++;
    }

    if (imported.length > 0) {
      questions.push(...imported);
      socket.emit('admin:import-result', {
        success: true,
        count: imported.length,
        errors,
        questions: imported,
      });
      io.emit('questions', questions);
      console.log(`[admin] imported ${imported.length} questions (${errors} errors)`);
    } else {
      socket.emit('admin:import-result', {
        success: false,
        count: 0,
        errors,
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
    broadcastState();
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
    state.mode = 'waiting';
    broadcastState();
    console.log(`[host] → round ${state.currentRound}/${state.totalRounds}`);
  });

  // ---- Admin: reset questions to default ----
  socket.on('admin:reset-questions', () => {
    questions.length = 0;
    questions.push(
      { id: 1, type: 'choice', text: '人体最大的器官是什么？', options: ['心脏', '肝脏', '皮肤', '大脑'], answer: 'C', group: 1 },
      { id: 2, type: 'choice', text: '正常成人的静息心率范围是多少？（次/分钟）', options: ['40-60', '60-100', '100-120', '120-140'], answer: 'B', group: 1 },
      { id: 3, type: 'choice', text: '以下哪种维生素可以通过阳光照射在皮肤中合成？', options: ['维生素A', '维生素B', '维生素C', '维生素D'], answer: 'D', group: 1 },
      { id: 4, type: 'choice', text: '"白大褂"的发明最初是为了什么？', options: ['彰显权威', '便于清洁消毒', '区分科室', '保暖'], answer: 'B', group: 1 },
      { id: 5, type: 'choice', text: '人体中含量最多的物质是什么？', options: ['蛋白质', '脂肪', '水', '钙'], answer: 'C', group: 1 },
      { id: 6, type: 'choice', text: '世界卫生组织的缩写是什么？', options: ['WTO', 'WHO', 'WTF', 'WIPO'], answer: 'B', group: 1 },
      { id: 7, type: 'choice', text: '"医者仁心"最早出自哪本古籍？', options: ['《黄帝内经》', '《本草纲目》', '《千金要方》', '《伤寒杂病论》'], answer: 'A', group: 1 },
      { id: 8, type: 'choice', text: '护理人员"三查七对"中的"七对"不包括以下哪项？', options: ['床号', '姓名', '年龄', '药品'], answer: 'C', group: 1 },
      { id: 9, type: 'choice', text: '医生在病历上写的"QD"是什么意思？', options: ['每天一次', '每四小时', '紧急', '停止'], answer: 'A', group: 1 },
      { id: 10, type: 'choice', text: '以下哪个不是医院常见的科室？', options: ['内科', '外科', '天文科', '儿科'], answer: 'C', group: 1 },
      { id: 11, type: 'choice', text: '"手术室"的无菌级别是？', options: ['Ⅰ级', 'Ⅱ级', 'Ⅲ级', 'Ⅳ级'], answer: 'A', group: 1 },
      { id: 12, type: 'choice', text: '哪项检查被称为"医生的听诊器延伸"？', options: ['CT', 'MRI', '超声', '心电图'], answer: 'C', group: 1 },
      { id: 13, type: 'fill', text: '医院里用于求助的紧急呼叫号码是____', answer: '120', group: 1 },
      { id: 14, type: 'choice', text: '医学上"生命体征"不包括以下哪项？', options: ['体温', '脉搏', '体重', '血压'], answer: 'C', group: 1 },
      { id: 15, type: 'choice', text: '"希波克拉底誓言"是哪个职业的职业道德准则？', options: ['护士', '医生', '药师', '技师'], answer: 'B', group: 1 },
    );
    nextQuestionId = 16;
    socket.emit('admin:questions', questions);
    console.log(`[admin] questions reset to defaults`);
  });
});

// ==================== Serve Static ====================
// Serve media files
const mediaPath = path.resolve(__dirname, '../../media');
app.use('/media', express.static(mediaPath));

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
