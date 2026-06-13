/**
 * 2026医师节「以赛促学，砺技求精」— 全流程自动化测试
 *
 * 启动一个独立的测试服务器，模拟 Admin/Host/Stage 三个角色，
 * 覆盖：开幕 → 签到 → 队伍配置 → 抽签 → 答题(3轮) → 抽奖(4轮) → 结算
 *
 * 运行: cd server && npx tsx src/test-flow.ts
 */
import { io as ioc, Socket } from 'socket.io-client';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== Config ====================
const PORT = 3457;
const BASE_URL = `http://localhost:${PORT}`;
const POLL_MS = 50;
const TIMEOUT_MS = 15000;

// ==================== Globals ====================
let passed = 0;
let failed = 0;
let stepCount = 0;
let serverProc: ChildProcess | null = null;

function assert(ok: boolean, msg: string) {
  stepCount++;
  if (ok) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ [FAIL] ${msg}`); }
}

function heading(title: string) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(50)}`);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Poll an expression function repeatedly until it matches the predicate.
 * Uses the GS/LV/DRAW global holders that are updated by socket listeners.
 */
async function waitFor<T>(
  label: string,
  getter: () => T,
  predicate: (val: T) => boolean,
  timeout = TIMEOUT_MS,
): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const val = getter();
    if (predicate(val)) return val;
    await sleep(POLL_MS);
  }
  const last = getter();
  throw new Error(`⏰ "${label}" 超时 (${timeout}ms), last value: ${JSON.stringify(last).slice(0, 200)}`);
}

// ==================== Main ====================
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   2026 医师节「以赛促学，砺技求精」全流程自动测试  ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  // ---- Start server ----
  console.log('\n📦 启动测试服务器...');
  const proc: ChildProcess = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
  serverProc = proc;
  proc.stdout?.on('data', (d: Buffer) => {
    const line = d.toString().trim();
    if (line) console.log(`  [server] ${line}`);
  });
  proc.stderr?.on('data', (d: Buffer) => {
    const line = d.toString().trim();
    if (line) console.log(`  [server] ${line}`);
  });

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('服务器启动超时')), 20000);
    const handler = (d: Buffer) => {
      if (d.toString().includes('Server running')) { clearTimeout(t); resolve(); }
    };
    proc.stdout!.on('data', handler);
    proc.stderr!.on('data', handler);
  });
  console.log('  ✅ 服务器已启动\n');

  // ---- Connect sockets with listeners pre-registered ----
  console.log('🔌 连接客户端...');

  // Global state holders (updated by socket listeners)
  let GS: any = null;
  let LV: any = null;
  let DS: any = null;

  // Helper getters for waitFor
  const getGS = () => GS;
  const getLV = () => LV;
  const getDS = () => DS;

  const host = ioc(BASE_URL);
  host.on('game:state', (s: any) => { GS = s; });
  host.on('lottery-v2:state', (s: any) => { LV = s; });
  host.on('draw:state', (s: any) => { DS = s; });

  const stage = ioc(BASE_URL);
  const admin = ioc(BASE_URL);

  await Promise.all([
    new Promise(r => host.on('connect', r)),
    new Promise(r => stage.on('connect', r)),
    new Promise(r => admin.on('connect', r)),
  ]);

  // Wait for initial state to arrive
  await waitFor('初始 state', getGS, (s: any) => s?.mode === 'opening');
  console.log('  ✅ Host / Stage / Admin 已连接\n');

  // ==================================================================
  //  PHASE 1: Opening
  // ==================================================================
  heading('阶段 1: 开幕');
  assert(GS?.mode === 'opening', '初始模式为 opening');

  // ==================================================================
  //  PHASE 2: Check-in (prepare for lottery)
  // ==================================================================
  heading('阶段 2: 签到 (35人)');
  const CHECKIN_NAMES = [
    '张伟','王芳','李娜','刘洋','陈静','杨帆','赵敏','黄磊','周杰','吴昊',
    '徐婷','孙悦','马超','朱丽','胡涛','郭强','林峰','何欣','高峰','罗琳',
    '梁宇','宋雨','唐亮','韩晶','曹阳','邓超','许晴','彭磊','苏慧','潘达',
    '田甜','范冰','蒋涛','蔡琳','余欢',
  ];
  const DEPTS = ['内科','外科','儿科','骨科','眼科','耳鼻喉科','皮肤科','麻醉科'];

  for (const name of CHECKIN_NAMES) {
    const dept = DEPTS[Math.floor(Math.random() * DEPTS.length)];
    const res = await fetch(`${BASE_URL}/api/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, department: dept }),
    });
    const data = await res.json();
    assert(data.success === true, `签到: ${name} (${dept})`);
  }

  // Verify duplicate detection
  const dup = await fetch(`${BASE_URL}/api/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '张伟', department: '内科' }),
  });
  assert(dup.status === 409, '重复签到被拦截 (409)');

  const list = await fetch(`${BASE_URL}/api/checkin/list`).then(r => r.json());
  assert(list.length === CHECKIN_NAMES.length, `签到列表共 ${CHECKIN_NAMES.length} 人`);

  // ==================================================================
  //  PHASE 3: Admin — Team Configuration
  // ==================================================================
  heading('阶段 3: 队伍配置 (24队, 3轮)');
  const CONFIG_TEAMS = 24;
  const ROUNDS = 3;
  const teamsPerRound = CONFIG_TEAMS / ROUNDS;

  const teamConfig = [];
  for (let i = 1; i <= CONFIG_TEAMS; i++) {
    const round = Math.ceil(i / teamsPerRound);
    const buzzer = ((i - 1) % teamsPerRound) + 1;
    teamConfig.push({ id: `team-${i}`, round, buzzerNumber: buzzer });
  }

  // Save team config (this sets mode → 'round-intro')
  admin.emit('admin:save-round-config', { teams: teamConfig });
  await waitFor('保存配置→round-intro', getGS, (s: any) => s?.mode === 'round-intro');
  assert(GS.mode === 'round-intro', '保存配置 → round-intro 模式');
  assert(GS.totalRounds === ROUNDS, `总轮次 = ${ROUNDS}`);
  assert(GS.currentRound === 1, '当前轮次 = 1');

  // Verify teams have correct round assignments
  for (let r = 1; r <= ROUNDS; r++) {
    const count = GS.teams.filter((t: any) => t.round === r).length;
    assert(count === teamsPerRound, `第${r}轮队伍数 = ${teamsPerRound}`);
  }

  // ==================================================================
  //  PHASE 4: Draw Ceremony
  // ==================================================================
  heading('阶段 4: 抽签分组 (仪式环节)');
  const participatingIds = teamConfig.map((t: any) => t.id);

  // Start draw
  admin.emit('admin:draw-start', { participatingIds });
  await waitFor('抽签激活', getDS, (d: any) => d?.active === true);
  assert(DS.active === true, '抽签会话已激活');
  assert(DS.phase === 'drawing', '抽签阶段为 drawing');
  assert(DS.totalLeaders === ROUNDS, `领导人数 = ${ROUNDS} (即${ROUNDS}轮)`);

  // Draw teams round by round
  for (let r = 0; r < ROUNDS; r++) {
    admin.emit('admin:draw-team');
    await waitFor(`第${r+1}轮抽签动画`, getDS, (d: any) => d?.phase === 'animation');
    assert(DS.phase === 'animation', `第${r + 1}轮抽签动画中`);
    assert(DS.animatingTeams.length > 0, `第${r + 1}轮抽中 ${DS.animatingTeams.length} 队`);

    // Signal animation complete
    stage.emit('draw:animation-complete');
    if (r < ROUNDS - 1) {
      await waitFor(`第${r+1}轮抽签完成`, getDS, (d: any) => d?.phase === 'drawing');
    } else {
      await waitFor(`抽签全部完成`, getDS, (d: any) => d?.phase === 'complete');
    }
  }
  assert(DS.phase === 'complete', '抽签全部完成');

  // Re-save config after draw (assigns actual rounds from ceremony)
  admin.emit('admin:save-round-config', { teams: teamConfig });
  await waitFor('重新保存配置', getGS, (s: any) => s?.mode === 'round-intro');
  await sleep(300);
  assert(DS === null || !DS.active, '抽签会话已清理');

  // ==================================================================
  //  PHASE 5: Round 1 — Quiz
  // ==================================================================
  heading('阶段 5: 第一轮答题');
  // Start round from round-intro → waiting
  host.emit('host:set-mode', 'waiting');
  await waitFor('waiting模式', getGS, (s: any) => s?.mode === 'waiting');

  async function doQuizCycle(buzzerNum: number, correct: boolean = true, points?: number) {
    // Next question
    host.emit('host:next-question');
    await waitFor('读题模式', getGS,
      (s: any) => s?.mode === 'reading' && s?.currentQuestion !== null);
    assert(GS.mode === 'reading', `  Q: 读题模式 (抢答器#${buzzerNum})`);
    assert(GS.currentQuestion !== null, `  Q: 题目已加载`);

    // Start quizzing
    host.emit('host:start-quizzing');
    await waitFor('抢答模式', getGS, (s: any) => s?.mode === 'quizzing');
    assert(GS.mode === 'quizzing', `  Q: 抢答模式`);

    // Buzzer
    host.emit('host:buzzer-winner', buzzerNum);
    await waitFor('抢答命中', getGS,
      (s: any) => s?.mode === 'buzzed' && s?.buzzedTeam?.buzzerNumber === buzzerNum);
    assert(GS.mode === 'buzzed', `  Q: 抢答命中 #${buzzerNum}`);
    assert(GS.buzzedTeam?.buzzerNumber === buzzerNum, `  Q: 正确队伍被选中`);

    const teamId = GS.buzzedTeam.id;
    const teamObj = GS.teams.find((t: any) => t.id === teamId);
    const prevScore = teamObj?.score;

    if (correct) {
      const pts = points || 10;
      host.emit('host:judge', { correct: true, teamId, points: pts });
      await waitFor('判定结果', getGS, (s: any) => s?.mode === 'result');
      await sleep(100); // let score update propagate
      const newScore = GS.teams.find((t: any) => t.id === teamId)?.score;
      assert(newScore === prevScore + pts, `  Q: 回答正确 +${pts}分 (${prevScore}→${newScore})`);
    } else {
      // Wrong answer, then re-buzz
      host.emit('host:judge', { correct: false, teamId });
      await waitFor('错误判定', getGS, (s: any) => s?.mode === 'result');
      assert(GS.lastResult?.correct === false, `  Q: 回答错误`);

      // Re-buzz (re-open for others)
      host.emit('host:re-buzz');
      await waitFor('重新抢答', getGS, (s: any) => s?.mode === 'quizzing');

      // Second team buzzes
      const buzzer2 = buzzerNum + 1;
      host.emit('host:buzzer-winner', buzzer2);
      await waitFor('重抢命中', getGS,
        (s: any) => s?.mode === 'buzzed' && s?.buzzedTeam?.buzzerNumber === buzzer2);
      assert(GS.mode === 'buzzed', `  Q: 重新抢答命中 #${buzzer2}`);

      const teamId2 = GS.buzzedTeam.id;
      const prev2 = GS.teams.find((t: any) => t.id === teamId2)?.score;
      host.emit('host:judge', { correct: true, teamId: teamId2, points: 10 });
      await waitFor('重抢判定', getGS, (s: any) => s?.mode === 'result');
      await sleep(100);
      const new2 = GS.teams.find((t: any) => t.id === teamId2)?.score;
      assert(new2 === prev2 + 10, `  Q: 重抢回答 +10分 (${prev2}→${new2})`);
    }
  }

  // Round 1: 3 questions
  await doQuizCycle(1, true);     // team-1 correct +10
  await doQuizCycle(2, true, 20); // team-2 correct +20 (难题)
  await doQuizCycle(3, false);    // team-3 wrong → re-buzz → team-4 correct +10

  // ==================================================================
  //  PHASE 6: Round 1 — Lottery
  // ==================================================================
  heading('阶段 6: 第一轮抽奖');

  async function doLotteryRound(
    expectedRound: number,
    absentIds: string[],
  ): Promise<'quiz' | 'lottery-complete' | 'lottery-round4'> {
    // Start / Resume
    host.emit('host:lottery-v2-start');
    await waitFor('抽奖开始', getGS, (s: any) => s?.mode === 'lottery-v2');
    await waitFor('抽奖就绪', getLV, (l: any) => l?.phase === 'ready');
    assert(LV.currentRound === expectedRound, `第${expectedRound}轮抽奖已就绪`);

    // Stage draws
    stage.emit('stage:lottery-v2-draw');
    await waitFor('抽奖动画中', getLV, (l: any) => l?.phase === 'animating');
    assert(LV.phase === 'animating', '抽奖动画中');
    assert(LV.currentWinners.length > 0, `抽中 ${LV.currentWinners.length} 人`);

    // Animation done
    stage.emit('stage:lottery-v2-animation-done');
    await waitFor('结果揭晓', getLV, (l: any) => l?.phase === 'revealed');
    assert(LV.phase === 'revealed', '结果已揭晓');

    // Confirm
    host.emit('host:lottery-v2-confirm-round', { absentIds });

    if (expectedRound <= 2) {
      // Should exit to quiz mode, phase='idle', active=false
      await waitFor('退出抽奖', getGS, (s: any) => s?.mode !== 'lottery-v2');
      await waitFor('抽奖idle', getLV,
        (l: any) => l?.phase === 'idle' && l?.active === false);
      assert(GS.mode !== 'lottery-v2', '退出抽奖 → 返回答题');
      assert(LV.phase === 'idle', '抽奖状态 idle');
      assert(LV.active === false, '抽奖未激活');
      return 'quiz';
    } else if (expectedRound === 3) {
      if (absentIds.length > 0) {
        // Need round 4 (补抽)
        await waitFor('退出抽奖', getGS, (s: any) => s?.mode !== 'lottery-v2');
        await waitFor('补抽就绪', getLV,
          (l: any) => l?.phase === 'idle' && l?.active === false && l?.currentRound === 4);
        assert(LV.currentRound === 4, '第4轮补抽已准备');
        assert(LV.phase === 'idle', '抽奖状态 idle');
        return 'lottery-round4';
      } else {
        // All complete
        await waitFor('抽奖全部完成', getLV, (l: any) => l?.phase === 'all-complete');
        assert(LV.phase === 'all-complete', '抽奖全部完成');
        return 'lottery-complete';
      }
    } else {
      // Round 4 → all-complete
      await waitFor('抽奖全部完成', getLV, (l: any) => l?.phase === 'all-complete');
      assert(LV.phase === 'all-complete', '抽奖全部完成');
      return 'lottery-complete';
    }
  }

  const r1Result = await doLotteryRound(1, []);
  assert(r1Result === 'quiz', '第一轮抽奖完成 → 返回答题');

  // ==================================================================
  //  PHASE 7: Round 2 — Quiz
  // ==================================================================
  heading('阶段 7: 第二轮答题');
  host.emit('host:next-round');
  await waitFor('第二轮', getGS, (s: any) => s?.mode === 'round-intro' && s?.currentRound === 2);
  assert(GS.currentRound === 2, '切换到第二轮');

  host.emit('host:set-mode', 'waiting');
  await waitFor('waiting', getGS, (s: any) => s?.mode === 'waiting');

  await doQuizCycle(1, true);
  await doQuizCycle(2, true, 20);

  // ==================================================================
  //  PHASE 8: Round 2 — Lottery
  // ==================================================================
  heading('阶段 8: 第二轮抽奖');
  const r2Result = await doLotteryRound(2, []);
  assert(r2Result === 'quiz', '第二轮抽奖完成 → 返回答题');

  // ==================================================================
  //  PHASE 9: Round 3 — Quiz
  // ==================================================================
  heading('阶段 9: 第三轮答题');
  host.emit('host:next-round');
  await waitFor('第三轮', getGS,
    (s: any) => s?.mode === 'round-intro' && s?.currentRound === 3);
  assert(GS.currentRound === 3, '切换到第三轮');

  host.emit('host:set-mode', 'waiting');
  await waitFor('waiting', getGS, (s: any) => s?.mode === 'waiting');

  await doQuizCycle(1, true);
  await doQuizCycle(2, true, 20);

  // ==================================================================
  //  PHASE 10: Round 3 — Lottery (with absentees to trigger R4)
  // ==================================================================
  heading('阶段 10: 第三轮抽奖 (标记缺席以触发补抽)');

  host.emit('host:lottery-v2-start');
  await waitFor('抽奖开始', getGS, (s: any) => s?.mode === 'lottery-v2');
  await waitFor('抽奖就绪', getLV, (l: any) => l?.phase === 'ready');
  assert(LV.currentRound === 3, '第三轮抽奖已就绪');

  stage.emit('stage:lottery-v2-draw');
  await waitFor('动画中', getLV, (l: any) => l?.phase === 'animating');
  const r3Winners = LV.currentWinners.slice();
  assert(r3Winners.length > 0, `第三轮抽中 ${r3Winners.length} 人`);

  stage.emit('stage:lottery-v2-animation-done');
  await waitFor('已揭晓', getLV, (l: any) => l?.phase === 'revealed');

  // Mark first 2 winners as absent (to trigger round 4)
  const r3AbsentIds = r3Winners.slice(0, 2).map((w: any) => w.id);
  host.emit('host:lottery-v2-confirm-round', { absentIds: r3AbsentIds });

  // Since round 3 with absentees → exit to quiz, currentRound=4
  await waitFor('退出抽奖', getGS, (s: any) => s?.mode !== 'lottery-v2');
  await waitFor('补抽就绪', getLV,
    (l: any) => l?.phase === 'idle' && l?.active === false && l?.currentRound === 4);
  assert(LV.currentRound === 4, '补抽第4轮已准备 (因为标记了2人缺席)');
  assert(LV.phase === 'idle', '抽奖状态 idle');
  console.log(`  📋 第3轮缺席 ${r3AbsentIds.length} 人 → 自动创建第4轮补抽`);

  // ==================================================================
  //  PHASE 11: Round 4 — Lottery (补抽)
  // ==================================================================
  heading('阶段 11: 第四轮补抽');
  const r4Result = await doLotteryRound(4, []);
  assert(r4Result === 'lottery-complete', '第四轮补抽完成');

  // ==================================================================
  //  PHASE 12: End lottery + Settlement
  // ==================================================================
  heading('阶段 12: 结束抽奖 + 结算');

  // If still in lottery-v2 mode, end it
  if (GS?.mode === 'lottery-v2') {
    host.emit('host:lottery-v2-end');
    await sleep(300);
  }

  // Settlement
  host.emit('host:set-mode', 'settlement');
  await waitFor('结算', getGS, (s: any) => s?.mode === 'settlement');
  assert(GS.mode === 'settlement', '结算模式');
  assert(GS.teams.length > 0, '队伍数据存在');

  // Verify scores accumulated correctly
  const scorers = GS.teams.filter((t: any) => t.score > 60);
  assert(scorers.length > 0, '有队伍获得加分');
  console.log('  📊 积分榜前5:');
  [...GS.teams]
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 5)
    .forEach((t: any, i: number) => {
      console.log(`     ${i + 1}. ${t.name} — ${t.score}分`);
    });

  // ==================================================================
  //  SUMMARY
  // ==================================================================
  console.log(`\n${'═'.repeat(50)}`);
  if (failed === 0) {
    console.log(`  🎉 全部 ${passed} 项测试通过!`);
  } else {
    console.log(`  😢 ${passed} 通过, ${failed} 失败 (共 ${stepCount} 项)`);
  }
  console.log(`${'═'.repeat(50)}\n`);

  // Cleanup
  host.close();
  stage.close();
  admin.close();
  proc.kill();
  serverProc = null;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\n💥 测试异常:', err);
  if (serverProc) { try { serverProc.kill(); } catch {} }
  process.exit(1);
});
