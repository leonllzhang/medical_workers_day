import { useEffect, useState, useCallback } from 'react'
import { getSocket } from '../socket'
import type { Team, Question } from '../types'
import './AdminPage.css'

export default function AdminPage() {
  const [tab, setTab] = useState<'teams' | 'questions'>('teams')
  const [teams, setTeams] = useState<Team[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [importText, setImportText] = useState('')
  const [importResult, setImportResult] = useState<{ success: boolean; count: number; errors: number; message?: string } | null>(null)
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editBuzzer, setEditBuzzer] = useState('')
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  const loadQuestions = useCallback(() => {
    getSocket().emit('admin:get-questions')
  }, [])

  const loadTeams = useCallback(() => {
    getSocket().emit('admin:get-teams')
  }, [])

  useEffect(() => {
    const socket = getSocket()

    socket.on('admin:questions', (qs: Question[]) => {
      setQuestions(qs)
    })
    socket.on('admin:teams', (ts: Team[]) => {
      setTeams(ts)
    })
    socket.on('admin:import-result', (r: { success: boolean; count: number; errors: number; message?: string }) => {
      setImportResult(r)
      if (r.success) loadQuestions()
    })
    socket.on('game:state', (data: { teams: Team[] }) => {
      setTeams(data.teams)
    })

    loadQuestions()
    loadTeams()

    return () => {
      socket.off('admin:questions')
      socket.off('admin:teams')
      socket.off('admin:import-result')
      socket.off('game:state')
    }
  }, [loadQuestions, loadTeams])

  function showStatus(msg: string) {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(null), 2000)
  }

  function handleImport() {
    if (!importText.trim()) return
    getSocket().emit('admin:import-questions', { lines: importText })
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

  function startEdit(t: Team) {
    setEditingTeamId(t.id)
    setEditName(t.name)
    setEditBuzzer(String(t.buzzerNumber))
  }

  function saveEdit() {
    if (!editingTeamId) return
    const buzzerNum = parseInt(editBuzzer)
    if (isNaN(buzzerNum) || buzzerNum < 1 || buzzerNum > 10) {
      showStatus('抢答器编号必须在 1-10 之间')
      return
    }
    getSocket().emit('admin:update-team', {
      teamId: editingTeamId,
      name: editName.trim() || undefined,
      buzzerNumber: buzzerNum,
    })
    setEditingTeamId(null)
    showStatus('已更新')
  }

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
            <p className="admin-hint">10 支队伍对应 10 个抢答器（1-10 号），可修改队伍名称和抢答器编号</p>
            <div className="team-admin-list">
              {teams.map(t => (
                <div key={t.id} className="team-admin-row">
                  <div className="team-admin-color" style={{ backgroundColor: t.color }} />
                  {editingTeamId === t.id ? (
                    <div className="team-admin-edit">
                      <input value={editName} onChange={e => setEditName(e.target.value)}
                        className="admin-input" placeholder="队伍名称" />
                      <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>抢答器 #</label>
                      <input value={editBuzzer} onChange={e => setEditBuzzer(e.target.value)}
                        className="admin-input" type="number" min={1} max={10}
                        style={{ width: 64 }} />
                      <button className="admin-btn sm primary" onClick={saveEdit}>✓</button>
                      <button className="admin-btn sm" onClick={() => setEditingTeamId(null)}>✕</button>
                    </div>
                  ) : (
                    <>
                      <span className="team-admin-badge">#{t.buzzerNumber}</span>
                      <span className="team-admin-name">{t.name}</span>
                      <span className="team-admin-score" style={{ color: t.color }}>{t.score} 分</span>
                      <button className="admin-btn sm" onClick={() => startEdit(t)}>✏️</button>
                    </>
                  )}
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
                每行一题，用 <code>|</code> 分隔题目和四个选项。例如：
              </p>
              <div className="admin-format-example">
                人体最大的器官是什么？|心脏|肝脏|皮肤|大脑<br />
                正常成人的心率是多少？|60-100|40-60|100-120|120-140
              </div>
              <textarea
                className="admin-import-area"
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder={"人体最大的器官是什么？|心脏|肝脏|皮肤|大脑\n正常成人的心率是多少？|60-100|40-60|100-120|120-140"}
                rows={10}
              />
              <div className="admin-import-actions">
                <button className="admin-btn primary" onClick={handleImport}
                  disabled={!importText.trim()}>
                  📥 导入
                </button>
                <button className="admin-btn" onClick={() => setImportText('')}>清空</button>
              </div>
              {importResult && (
                <div className={`admin-import-result ${importResult.success ? 'ok' : 'fail'}`}>
                  {importResult.success
                    ? `✅ 成功导入 ${importResult.count} 题${importResult.errors ? `，${importResult.errors} 行格式错误被跳过` : ''}`
                    : `❌ ${importResult.message || '导入失败'}`}
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
              <div className="admin-q-list">
                {questions.map((q, i) => (
                  <div key={q.id} className="admin-q-item">
                    <span className="admin-q-num">{q.id}</span>
                    <span className="admin-q-text">{q.text}</span>
                    {q.options && (
                      <span className="admin-q-options">
                        {q.options.map((o, j) => (
                          <span key={j} className="admin-q-option">{['A','B','C','D'][j]}. {o}</span>
                        ))}
                      </span>
                    )}
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
