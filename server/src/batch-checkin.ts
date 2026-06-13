/**
 * 批量签到工具 (仅供测试)
 * 快速生成100个签到人员，用于测试抽奖排除逻辑
 *
 * 运行: npx tsx server/src/batch-checkin.ts
 */
const BASE_URL = process.argv[2] || 'http://localhost:3001';
const COUNT = 100;
const DEPTS = ['内科','外科','儿科','骨科','眼科','耳鼻喉科','皮肤科','麻醉科','口腔科','急诊科'];

async function main() {
  console.log(`📋 批量签到: ${COUNT} 人 → ${BASE_URL}\n`);

  let success = 0;
  let failed = 0;

  // Generate 100 unique names
  const names = Array.from({ length: COUNT }, (_, i) => {
    const num = String(i + 1).padStart(3, '0');
    const surname = ['张','王','李','赵','陈','杨','黄','周','吴','徐','孙','胡','朱','高','林','何','郭','马','罗','梁'][i % 20];
    return `${surname}测试${num}`;
  });

  const results = await Promise.allSettled(
    names.map((name, i) => {
      const dept = DEPTS[i % DEPTS.length];
      return fetch(`${BASE_URL}/api/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, department: dept }),
      }).then(r => r.json());
    })
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value.success) {
      success++;
    } else {
      failed++;
      const reason = r.status === 'rejected' ? r.reason?.message : (r.value?.error || 'unknown');
      if (failed <= 3) console.log(`  ❌ ${names[i]}: ${reason}`);
    }
  }

  // Verify via API
  const list = await fetch(`${BASE_URL}/api/checkin/list`).then(r => r.json());

  console.log(`\n✅ 成功: ${success}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`📊 签到总数: ${list.length}`);
  console.log(`\n现在可以去 HostConsole 点击 "开始抽奖" 测试抽奖排除逻辑了。`);
}

main().catch(console.error);
