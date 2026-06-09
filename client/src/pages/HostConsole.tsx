import { useEffect, useState } from 'react'
import { getSocket } from '../socket'
import type { GameStateData, Team, Prize, Question } from '../types'
import './HostConsole.css'

const PRIZES: Prize[] = [
  { id: 'prize-1',  name: '院长茶水卡',    icon: '🍵', description: '去院长办公室蹭名牌茶叶一壶' },
  { id: 'prize-2',  name: '主任咖啡券',    icon: '☕', description: '科室主任买单大杯星巴克' },
  { id: 'prize-3',  name: '食堂加腿卡',    icon: '🍗', description: '打饭阿姨手不抖多加鸡腿' },
  { id: 'prize-4',  name: '病历消消乐',    icon: '📋', description: '主任帮你改5份疑难病历' },
  { id: 'prize-5',  name: '免迟到金牌',    icon: '🏅', description: '当月迟到5分钟内免处罚' },
  { id: 'prize-6',  name: '优雅带教券',    icon: '😊', description: '主任带教只微笑不皱眉' },
  { id: 'prize-7',  name: '免夜班护身符',  icon: '🌙', description: '一次免值夜班的机会' },
  { id: 'prize-8',  name: '院长合影券',    icon: '📸', description: '和院长单独合影装裱送框' },
  { id: 'prize-9',  name: '准时下班卡',    icon: '⏰', description: '今天到点就走绝不拦你' },
  { id: 'prize-10', name: '锦鲤附体券',   icon: '🐟', description: '本周所有考试考核60分飘过' },
]

export default function HostConsole() {
  const [state, setState] = useState<GameStateData | null>(null)
  const [selectedBuzzer, setSelectedBuzzer] = useState<number>(1)
  const [lastAction, setLastAction] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [editingTeam, setEditingTeam] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editScore, setEditScore] = useState('')
  const [videoFiles, setVideoFiles] = useState<string[]>([])
  const [selectedVideo, setSelectedVideo] = useState('')
  const [selectedPrizeId, setSelectedPrizeId] = useState(PRIZES[0].id)
  const [winnerCount, setWinnerCount] = useState(1)
  const [questions, setQuestions] = useState<Question[]>([])

  useEffect(() => {
    const socket = getSocket()

    socket.on('game:state', (data: GameStateData) => {
      setState(data)
    })

    socket.on('host:error', (msg: string) => {
      setErrorMsg(msg)
      setTimeout(() => setErrorMsg(null), 3000)
    })

    // Load questions
    socket.on('questions', (qs: Question[]) => setQuestions(qs))
    socket.emit('host:get-questions')

    // Probe video files via API
    fetch('/api/media/videos')
      .then(r => r.json())
      .then(files => {
        setVideoFiles(files)
        if (files.length > 0) setSelectedVideo(files[0])
      })
      .catch(() => {})

    return () => { socket.off('game:state'); socket.off('host:error'); socket.off('questions') }
  }, [])

  function emit(event: string, data?: any) {
    getSocket().emit(event, data)
    setLastAction(event)
    setTimeout(() => setLastAction(null), 2000)
  }

  function emitJudge(correct: boolean, points?: number) {
    const buzzed = state?.buzzedTeam
    if (!buzzed) {
      setErrorMsg('没有抢中的队伍')
      setTimeout(() => setErrorMsg(null), 3000)
      return
    }
    emit('host:judge', { correct, teamId: buzzed.id, points })
  }

  function updateTeam(teamId: string, name?: string, buzzerNumber?: number) {
    emit('host:update-team', { teamId, name, buzzerNumber })
  }

  function setTeamScore(teamId: string, score: number) {
    emit('host:set-score', { teamId, score })
  }

  const showBuzzedPanel = (state?.mode === 'buzzed' && state.buzzedTeam) || (state?.mode === 'result' && state.lastResult && !state.lastResult.correct)

  return (
    <div className="host-container">
      <header className="host-header">
        <h1>🎮 主持人控制台</h1>
        <div className="host-mode-bar">
          {state && state.totalRounds > 0 && (
            <span className="round-indicator">
              🔄 第 {state.currentRound}/{state.totalRounds} 轮
            </span>
          )}
          <span>模式: <strong>{modeLabel(state?.mode || 'waiting')}</strong></span>
          {lastAction && <span className="last-action">↪ {lastAction}</span>}
        </div>
      </header>

      {errorMsg && <div className="host-error">{errorMsg}</div>}

      <div className="host-grid">
        {/* ===== Left: Main Controls ===== */}
        <div className="host-column">
          {/* Flow */}
          <section className="host-card">
            <h2>🎬 流程控制</h2>
            <div className="flow-buttons">
              <button className="hbtn primary" onClick={() => emit('host:next-question')}>
                📖 下一题
              </button>
              <button className="hbtn danger" onClick={() => emit('host:start-quizzing')}
                disabled={!state?.currentQuestion || state?.mode === 'quizzing'}>
                🎬 开始抢答（播放视频）
              </button>
              <button className="hbtn gold" onClick={() => emit('host:set-mode', 'settlement')}>
                🏆 结算
              </button>
              {state && state.currentRound < state.totalRounds && (
                <button className="hbtn" style={{ background: '#f59e0b', color: 'white' }}
                  onClick={() => emit('host:next-round')}>
                  ➡️ 下一轮 (第{state.currentRound + 1}轮)
                </button>
              )}
              <button className="hbtn outline" onClick={() => emit('host:set-mode', 'waiting')}>
                🔄 重置
              </button>
              <button className="hbtn outline" onClick={() => emit('host:reset-scores')}>
                🔢 重置积分
              </button>
            </div>
          </section>

          {/* Buzzer Winner Input */}
          <section className="host-card">
            <h2>🔔 抢答器命中</h2>
            <p className="card-hint">在物理抢答器显示命中号码后，在此选择并按确认</p>
            <div className="buzzer-grid">
              {Array.from({ length: 8 }, (_, i) => i + 1).map(n => {
                const team = state?.teams.find(t => t.buzzerNumber === n && t.round === state?.currentRound)
                return (
                  <button
                    key={n}
                    className={`buzzer-btn ${selectedBuzzer === n ? 'selected' : ''}`}
                    style={team ? { borderColor: team.color } : {}}
                    onClick={() => setSelectedBuzzer(n)}
                  >
                    <span className="buzzer-num">#{n}</span>
                    <span className="buzzer-team">{team?.name || '---'}</span>
                  </button>
                )
              })}
            </div>
            <button className="hbtn primary confirm-btn"
              onClick={() => emit('host:buzzer-winner', selectedBuzzer)}>
              ✅ 确认 #{selectedBuzzer} 抢中
            </button>
          </section>

          {/* Judge Panel (shown when buzzed) */}
          {showBuzzedPanel && (
            <section className="host-card judge-card">
              <h2>⚖️ 判定</h2>
              <div className="judge-team-info">
                <span className="judge-dot" style={{ backgroundColor: state.buzzedTeam!.color }} />
                <span className="judge-team-name">{state.buzzedTeam!.name}</span>
                <span className="judge-buzzer-label">抢答器 #{state.buzzedTeam!.buzzerNumber}</span>
              </div>
              <div className="judge-buttons">
                <button className="hbtn success" onClick={() => emitJudge(true)}>
                  ✅ 正确 (+10分)
                </button>
                <button className="hbtn danger" onClick={() => emitJudge(false)}>
                  ❌ 错误 (不扣分)
                </button>
                <button className="hbtn outline" onClick={() => emitJudge(true, 20)}>
                  ⭐ 正确 (+20分, 难题)
                </button>
                <button className="hbtn" style={{ background: '#f59e0b', color: 'white' }} onClick={() => emit('host:re-buzz')}>
                  🔄 重新抢答
                </button>
              </div>
            </section>
          )}

          {/* Manual score adjust */}
          <section className="host-card">
            <h2>✏️ 手动调分</h2>
            {state?.teams.filter(t => t.round === state.currentRound || t.score > 0).map(t => (
              <div key={t.id} className="score-adjust-row">
                <span className="adjust-team" style={{ color: t.color }}>{t.name}</span>
                <span className="adjust-current">{t.score}分</span>
                <button className="hbtn-small green" onClick={() => setTeamScore(t.id, t.score + 5)}>+5</button>
                <button className="hbtn-small red" onClick={() => setTeamScore(t.id, Math.max(0, t.score - 5))}>-5</button>
                <button className="hbtn-small gold" onClick={() => setTeamScore(t.id, t.score + 10)}>+10</button>
              </div>
            ))}
          </section>
        </div>

        {/* ===== Right: Teams & Questions ===== */}
        <div className="host-column">
          {/* Teams */}
          <section className="host-card">
            <h2>👥 积分榜（全部队伍）</h2>
            <div className="team-list-all">
              {[...(state?.teams || [])]
                .filter(t => t.score > 0 || t.round > 0)
                .sort((a, b) => b.score - a.score)
                .map(t => (
                <div key={t.id} className={`team-row ${t.round === state?.currentRound ? 'current-round' : ''}`}>
                  <div className="team-badge" style={{ backgroundColor: t.color }}>
                    #{t.buzzerNumber || '—'}
                  </div>
                  {t.round > 0 && <span className="team-round-tag">R{t.round}</span>}
                  <span className="team-name">{t.name}</span>
                  <span className="team-score" style={{ color: t.color }}>{t.score}</span>
                  <button className="hbtn-small outline" onClick={() => {
                    setEditingTeam(t.id); setEditName(t.name); setEditScore(String(t.score))
                  }}>✏️</button>
                  {editingTeam === t.id && (
                    <div className="team-edit" style={{ position: 'absolute', right: 0, top: '100%', zIndex: 10, background: '#161b22', padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
                      <input value={editName} onChange={e => setEditName(e.target.value)}
                        className="tiny-input" placeholder="队名" />
                      <input value={editScore} onChange={e => setEditScore(e.target.value)}
                        className="tiny-input" type="number" placeholder="分数" style={{ width: 64 }} />
                      <button className="hbtn-small primary" onClick={() => {
                        if (editName.trim()) updateTeam(t.id, editName.trim())
                        if (editScore !== '') setTeamScore(t.id, parseInt(editScore) || 0)
                        setEditingTeam(null)
                      }}>✓</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Video selection */}
          <section className="host-card">
            <h2>🎬 背景视频</h2>
            {videoFiles.length > 0 ? (
              <div className="video-select">
                <select value={selectedVideo} onChange={e => setSelectedVideo(e.target.value)}>
                  {videoFiles.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="card-hint">将视频放入 <code>media/videos/</code> 目录</p>
            )}
          </section>

          {/* Questions */}
          <section className="host-card">
            <h2>📋 题目列表 {questions.length > 0 && <span className="q-count">({questions.length}题)</span>}</h2>
            <div className="q-list">
              {questions.length === 0 ? (
                <p className="card-hint">暂无题目，请在管理页面导入</p>
              ) : (
                questions.map(q => (
                  <div key={q.id} className={`q-item ${state?.currentQuestion?.id === q.id ? 'active' : ''}`}>
                    <span className="q-num">{q.id}</span>
                    <span className="q-group-badge">G{q.group}</span>
                    <span className="q-text">{q.text}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Lottery: Prize selection + draw */}
          <section className="host-card">
            <h2>🎁 抽奖</h2>
            {state?.mode === 'lottery' ? (
              <div className="lottery-active">
                <p className="lottery-drawing-hint">🎊 抽奖进行中，大屏正在显示结果</p>
                <button className="hbtn outline" onClick={() => emit('host:lottery-end')}
                  style={{ width: '100%', marginTop: 8 }}>
                  ✕ 关闭抽奖，返回上一模式
                </button>
              </div>
            ) : (
              <>
                <div className="lottery-prize-select">
                  <label>选择奖品</label>
                  <div className="prize-grid">
                    {PRIZES.map(p => (
                      <button
                        key={p.id}
                        className={`prize-card ${selectedPrizeId === p.id ? 'selected' : ''}`}
                        onClick={() => setSelectedPrizeId(p.id)}
                      >
                        <span className="prize-icon">{p.icon}</span>
                        <span className="prize-name">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="lottery-winner-count">
                  <label>中奖人数</label>
                  <div className="count-btns">
                    {[1, 2, 3, 5].map(n => (
                      <button
                        key={n}
                        className={`count-btn ${winnerCount === n ? 'selected' : ''}`}
                        onClick={() => setWinnerCount(n)}
                      >{n} 人</button>
                    ))}
                  </div>
                </div>
                <button className="hbtn lottery-draw-btn" onClick={() => emit('host:lottery-draw', { prizeId: selectedPrizeId, winnerCount })}>
                  🎲 抽奖
                </button>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function modeLabel(mode: string): string {
  const map: Record<string, string> = {
    waiting: '等待中', reading: '读题中', quizzing: '抢答中',
    buzzed: '已抢中', result: '判定', settlement: '结算',
    lottery: '🎊 抽奖',
  }
  return map[mode] || mode
}
