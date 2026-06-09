import { useEffect, useState, useCallback } from 'react'
import { getSocket } from '../socket'
import type { Team, Question } from '../types'
import './AdminPage.css'

// Round allocation algorithm
function calcRoundDistribution(n: number): { round: number; size: number }[] {
  if (n <= 0) return []
  const maxPerRound = 8
  const numRounds = Math.ceil(n / maxPerRound)
  const baseSize = Math.floor(n / numRounds)
  const remainder = n % numRounds
  const rounds: { round: number; size: number }[] = []
  for (let r = 1; r <= numRounds; r++) {
    rounds.push({ round: r, size: baseSize + (r <= remainder ? 1 : 0) })
  }
  return rounds
}

function autoAllocate(teams: Team[], participatingIds: Set<string>): Team[] {
  const participating = teams.filter(t => participatingIds.has(t.id))
  const distribution = calcRoundDistribution(participating.length)
  const result = teams.map(t => ({ ...t, round: participatingIds.has(t.id) ? 1 : 0, buzzerNumber: 0 }))
  let idx = 0
  for (const rd of distribution) {
    for (let i = 0; i < rd.size; i++) {
      const t = result.find(x => x.id === participating[idx].id)
      if (t) { t.round = rd.round; t.buzzerNumber = i + 1 }
      idx++
    }
  }
  return result
}

export default function AdminPage() {
  const [tab, setTab] = useState<'teams' | 'questions'>('teams')
  const [teams, setTeams] = useState<Team[]>([])
  const [localTeams, setLocalTeams] = useState<Team[]>([])
  const [participating, setParticipating] = useState<Set<string>>(new Set())
  const [questions, setQuestions] = useState<Question[]>([])
  const [importText, setImportText] = useState('')
  const [importGroup, setImportGroup] = useState(1)
  const [filterGroup, setFilterGroup] = useState(0)
  const [importResult, setImportResult] = useState<{ success: boolean; count: number; errorLines?: { line: number; text: string; reason: string }[]; message?: string } | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [editNameMap, setEditNameMap] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  const loadQuestions = useCallback(() => {
    getSocket().emit('admin:get-questions')
  }, [])

  useEffect(() => {
    const socket = getSocket()

    socket.on('admin:questions', (qs: Question[]) => {
      setQuestions(qs)
    })
    socket.on('admin:import-result', (r: { success: boolean; count: number; errorLines?: { line: number; text: string; reason: string }[]; message?: string }) => {
      setImportResult(r)
      if (r.success) loadQuestions()
    })
    socket.on('game:state', (data: { teams: Team[]; totalRounds: number; currentRound: number }) => {
      // Only update from server if we haven't made local changes
      if (!saved) {
        setTeams(data.teams)
      }
    })
    socket.on('admin:round-config', (data: { teams: Team[]; totalRounds: number; currentRound: number }) => {
      setTeams(data.teams)
      setSaved(false)
    })

    loadQuestions()
    getSocket().emit('admin:get-round-config')

    return () => {
      socket.off('admin:questions')
      socket.off('admin:import-result')
      socket.off('game:state')
      socket.off('admin:round-config')
    }
  }, [loadQuestions, saved])

  // Initialize local state from server teams
  useEffect(() => {
    if (teams.length > 0 && localTeams.length === 0) {
      setLocalTeams(teams.map(t => ({ ...t })))
      const p = new Set(teams.filter(t => t.round > 0).map(t => t.id))
      setParticipating(p)
      const nameMap: Record<string, string> = {}
      teams.forEach(t => { nameMap[t.id] = t.name })
      setEditNameMap(nameMap)
    }
  }, [teams, localTeams.length])

  function showStatus(msg: string) {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(null), 2000)
  }

  function toggleParticipate(teamId: string) {
    const next = new Set(participating)
    if (next.has(teamId)) next.delete(teamId)
    else next.add(teamId)
    setParticipating(next)
    // Reset round/buzzer for this team
    setLocalTeams(prev => prev.map(t => t.id === teamId ? { ...t, round: 0, buzzerNumber: 0 } : t))
  }

  function handleAutoAllocate() {
    const allocated = autoAllocate(localTeams, participating)
    setLocalTeams(allocated)
    showStatus(`已分配 ${participating.size} 队，共 ${calcRoundDistribution(participating.size).length} 轮`)
  }

  function changeTeamRound(teamId: string, round: number) {
    setLocalTeams(prev => prev.map(t => t.id === teamId ? { ...t, round, buzzerNumber: round > 0 ? t.buzzerNumber || 1 : 0 } : t))
  }

  function changeTeamBuzzer(teamId: string, buzzerNumber: number) {
    setLocalTeams(prev => prev.map(t => t.id === teamId ? { ...t, buzzerNumber } : t))
  }

  function changeTeamName(teamId: string, name: string) {
    setEditNameMap(prev => ({ ...prev, [teamId]: name }))
    setLocalTeams(prev => prev.map(t => t.id === teamId ? { ...t, name } : t))
  }

  function saveRoundConfig() {
    const config = localTeams.filter(t => t.round > 0).map(t => ({ id: t.id, round: t.round, buzzerNumber: t.buzzerNumber }))
    // Also save name changes
    for (const t of localTeams) {
      if (editNameMap[t.id] && editNameMap[t.id] !== teams.find(x => x.id === t.id)?.name) {
        getSocket().emit('admin:update-team', { teamId: t.id, name: editNameMap[t.id] })
      }
    }
    // Save name changes separately, then round config
    setTimeout(() => {
      getSocket().emit('admin:save-round-config', { teams: config })
      setSaved(true)
      showStatus('轮次配置已保存')
    }, 100)
  }

  function handleImport() {
    if (!importText.trim()) return
    getSocket().emit('admin:import-questions', { lines: importText, group: importGroup })
  }

  function handleDeleteQ(id: number) {
    getSocket().emit('admin:delete-question', id)
    showStatus('已删除')
  }

  function handleResetQuestions() {
    if (confirm('确定恢复默认题目？自定义题目将被删除')) {
      getSocket().emit('admin:reset-questions')
      showStatus('已恢复默认题库')
    }
  }

  const distribution = calcRoundDistribution(participating.size)
  const participatingTeams = localTeams.filter(t => t.round > 0)

  return (
    <div className="admin-container">
      <header className="admin-header">
        <h1>⚙️ 系统管理</h1>
        <div className="admin-header-links">
          <a href="/stage" target="_blank">大屏</a>
          <a href="/host" target="_blank">主持</a>
          <a href="/mobile" target="_blank">手机</a>
        </div>
      </header>

      {statusMsg && <div className="admin-toast">{statusMsg}</div>}

      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'teams' ? 'active' : ''}`} onClick={() => setTab('teams')}>
          👥 队伍管理
        </button>
        <button className={`admin-tab ${tab === 'questions' ? 'active' : ''}`} onClick={() => setTab('questions')}>
          📋 题库管理
        </button>
      </div>

      <div className="admin-content">
        {tab === 'teams' && (
          <section className="admin-section">
            <div className="round-config-bar">
              <div className="round-config-stats">
                <span>总科室：<strong>{localTeams.length}</strong></span>
                <span>参赛：<strong className="text-gold">{participating.size}</strong></span>
                <span>轮次：<strong>{distribution.length > 0 ? distribution.map(d => `第${d.round}轮 ${d.size}队`).join(' | ') : '—'}</strong></span>
              </div>
              <div className="round-config-actions">
                <button className="admin-btn" onClick={handleAutoAllocate} disabled={participating.size === 0}>
                  🔄 自动分配轮次
                </button>
                <button className="admin-btn primary" onClick={saveRoundConfig}
                  disabled={participating.size === 0}>
                  💾 保存配置
                </button>
              </div>
            </div>

            {/* Round groups display */}
            {distribution.length > 0 && (
              <div className="round-groups">
                {distribution.map(rd => {
                  const roundTeams = participatingTeams.filter(t => t.round === rd.round)
                    .sort((a, b) => a.buzzerNumber - b.buzzerNumber)
                  return (
                    <div key={rd.round} className="round-group-card">
                      <div className="round-group-header">第 {rd.round} 轮</div>
                      <div className="round-group-teams">
                        {roundTeams.map(t => (
                          <div key={t.id} className="round-group-team" style={{ borderLeftColor: t.color }}>
                            <span className="rgt-buzzer">#{t.buzzerNumber}</span>
                            <span className="rgt-name">{t.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <p className="admin-hint" style={{ marginTop: 16 }}>
              勾选参赛科室，点击"自动分配轮次"，可手动调整，最后点击"保存配置"
            </p>
            <div className="team-admin-list">
              {localTeams.map(t => (
                <div key={t.id} className={`team-admin-row ${t.round > 0 ? 'active' : ''}`}>
                  <div className="team-admin-color" style={{ backgroundColor: t.color }} />
                  <input type="checkbox" className="team-checkbox"
                    checked={participating.has(t.id)}
                    onChange={() => toggleParticipate(t.id)} />
                  <input className="team-name-input" value={editNameMap[t.id] || t.name}
                    onChange={e => changeTeamName(t.id, e.target.value)} />
                  {participating.has(t.id) && (
                    <>
                      <select className="admin-select sm" value={t.round}
                        onChange={e => changeTeamRound(t.id, parseInt(e.target.value))}>
                        {distribution.map(rd => (
                          <option key={rd.round} value={rd.round}>第{rd.round}轮</option>
                        ))}
                      </select>
                      <select className="admin-select sm" value={t.buzzerNumber}
                        onChange={e => changeTeamBuzzer(t.id, parseInt(e.target.value))}>
                        {Array.from({ length: 8 }, (_, i) => i + 1).map(n => (
                          <option key={n} value={n}>抢答器 #{n}</option>
                        ))}
                      </select>
                    </>
                  )}
                  {!participating.has(t.id) && (
                    <span className="team-not-playing">不参赛</span>
                  )}
                  <span className="team-admin-score" style={{ color: t.color }}>{t.score} 分</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'questions' && (
          <>
            <section className="admin-section">
              <h2>📥 批量导入题目</h2>
              <p className="admin-hint">
                每行一题，用 <code>|</code> 分隔。支持两种题型：
              </p>
              <div className="admin-format-example">
                <strong>选择题：</strong>题目|A.选项|B.选项|C.选项|D.选项|正确答案字母<br />
                人体最大的器官是什么？|A.心脏|B.肝脏|C.皮肤|D.大脑|C<br />
                <strong>填空题：</strong>题目（用 ____ 表示空）|答案1,答案2<br />
                三查制度是指____查、____查、____查|操作前,操作中,操作后
              </div>
              <div className="admin-import-group-select">
                <label>导入到分组：</label>
                {[1, 2, 3, 4].map(g => (
                  <button key={g}
                    className={`admin-btn sm ${importGroup === g ? 'primary' : ''}`}
                    onClick={() => setImportGroup(g)}>
                    第 {g} 组
                  </button>
                ))}
              </div>
              <textarea
                className="admin-import-area"
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder={"人体最大的器官是什么？|A.心脏|B.肝脏|C.皮肤|D.大脑|C\n三查制度是指____查、____查、____查|操作前,操作中,操作后"}
                rows={10}
              />
              <div className="admin-import-actions">
                <button className="admin-btn primary" onClick={handleImport}
                  disabled={!importText.trim()}>
                  📥 导入到第 {importGroup} 组
                </button>
                <button className="admin-btn" onClick={() => setImportText('')}>清空</button>
              </div>
              {importResult && (
                <div className={`admin-import-result ${importResult.success ? 'ok' : 'fail'}`}>
                  <div>
                    {importResult.success
                      ? `✅ 成功导入 ${importResult.count} 题${importResult.errorLines?.length ? `，${importResult.errorLines.length} 行格式错误被跳过` : ''}`
                      : `❌ ${importResult.message || '导入失败'}`}
                  </div>
                  {importResult.errorLines && importResult.errorLines.length > 0 && (
                    <div className="import-error-detail">
                      {importResult.errorLines.map((e, i) => (
                        <div key={i} className="import-error-line">
                          <span className="err-line-num">第{e.line}行</span>
                          <span className="err-line-text">{e.text}</span>
                          <span className="err-line-reason">{e.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="admin-section">
              <div className="admin-q-header">
                <h2>📖 当前题库（{questions.length} 题）</h2>
                <button className="admin-btn danger" onClick={handleResetQuestions}>
                  恢复默认
                </button>
              </div>
              {/* Group filter tabs */}
              <div className="admin-q-group-filter">
                <button className={`admin-btn sm ${filterGroup === 0 ? 'primary' : ''}`}
                  onClick={() => setFilterGroup(0)}>全部</button>
                {[1, 2, 3, 4].map(g => (
                  <button key={g} className={`admin-btn sm ${filterGroup === g ? 'primary' : ''}`}
                    onClick={() => setFilterGroup(g)}>第{g}组</button>
                ))}
              </div>
              <div className="admin-q-list">
                {questions.filter(q => filterGroup === 0 || q.group === filterGroup).map((q, i) => (
                  <div key={q.id} className="admin-q-item">
                    <span className="admin-q-num">{q.id}</span>
                    <span className={`admin-q-type ${q.type === 'fill' ? 'type-fill' : 'type-choice'}`}>
                      {q.type === 'fill' ? '填空' : '选择'}
                    </span>
                    <span className="admin-q-group-badge">G{q.group}</span>
                    <span className="admin-q-text">{q.text}</span>
                    {q.options && (
                      <span className="admin-q-options">
                        {q.options.map((o, j) => (
                          <span key={j} className="admin-q-option">{['A','B','C','D'][j]}. {o}</span>
                        ))}
                      </span>
                    )}
                    {q.answer && <span className="admin-q-answer">✓ {q.answer}</span>}
                    <button className="admin-btn sm danger" onClick={() => handleDeleteQ(q.id)}>✕</button>
                  </div>
                ))}
                {questions.length === 0 && <p className="admin-empty">题库为空，请导入题目</p>}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
