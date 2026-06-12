import { useEffect, useState, useRef } from 'react'
import { getSocket } from '../socket'
import DanmakuOverlay from '../components/DanmakuOverlay'
import { QRCodeCanvas } from 'qrcode.react'
import type { GameStateData, Team, Question, DrawSession, LotteryV2State as LV2State } from '../types'
import './StageScreen.css'

const MOBILE_URL = `${window.location.protocol}//${window.location.hostname}:${window.location.port}/mobile`

// Sound effects using Web Audio API
function playCorrectSound() {
  try {
    const ctx = new AudioContext()
    const notes = [523, 659, 784, 1047]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12)
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.12)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.3)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.12)
      osc.stop(ctx.currentTime + i * 0.12 + 0.3)
    })
  } catch {}
}

function playWrongSound() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(300, ctx.currentTime)
    osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.5)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
  } catch {}
}

function playLotterySound() {
  try {
    const ctx = new AudioContext()
    const notes = [523, 587, 659, 784, 880, 1047, 1175, 1319]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1)
      gain.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.1)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.25)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.1)
      osc.stop(ctx.currentTime + i * 0.1 + 0.25)
    })
  } catch {}
}

function playDrawTickSound() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(800, ctx.currentTime)
    gain.gain.setValueAtTime(0.06, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.05)
  } catch {}
}

function playDrawRevealSound() {
  try {
    const ctx = new AudioContext()
    const notes = [523, 659, 784, 1047, 1319]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12)
      gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.12)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.5)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.12)
      osc.stop(ctx.currentTime + i * 0.12 + 0.5)
    })
  } catch {}
}

function playBuzzedSound() {
  try {
    const ctx = new AudioContext()
    for (let i = 0; i < 5; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      const freq = 400 + Math.random() * 400
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08)
      gain.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.08)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.15)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.08)
      osc.stop(ctx.currentTime + i * 0.08 + 0.15)
    }
  } catch {}
}

export default function StageScreen() {
  const [state, setState] = useState<GameStateData | null>(null)
  const [sparkles, setSparkles] = useState<{ id: number; x: number; y: number }[]>([])
  const [burstType, setBurstType] = useState<'correct' | 'wrong' | null>(null)
  const sparkleIdRef = useRef(0)
  const videoFilesRef = useRef<string[]>([])
  const [drawSession, setDrawSession] = useState<DrawSession | null>(null)
  const [lotteryV2State, setLotteryV2State] = useState<LV2State | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const audioFilesRef = useRef<string[]>([])
  const [currentAudio, setCurrentAudio] = useState<string>('')
  const [audioUnlocked, setAudioUnlocked] = useState(false)

  function unlockAudio() {
    if (audioUnlocked) return
    setAudioUnlocked(true)
    // Create and resume AudioContext to satisfy browser autoplay policy
    try { const ctx = new AudioContext(); ctx.resume() } catch {}
  }

  // Probe for video and audio files
  useEffect(() => {
    fetch('/api/media/videos')
      .then(r => r.json())
      .then(files => { videoFilesRef.current = files })
      .catch(() => {})
    fetch('/api/media/audio')
      .then(r => r.json())
      .then(files => { audioFilesRef.current = files })
      .catch(() => {})
  }, [])

  function triggerBurst(type: 'correct' | 'wrong') {
    setBurstType(type)
    const newSparkles = []
    const count = type === 'correct' ? 40 : 20
    for (let i = 0; i < count; i++) {
      newSparkles.push({
        id: sparkleIdRef.current++,
        x: Math.random() * 100,
        y: Math.random() * 100,
      })
    }
    setSparkles(newSparkles)
    if (type === 'correct') playCorrectSound()
    else playWrongSound()
    setTimeout(() => { setBurstType(null); setSparkles([]) }, 2500)
  }

  useEffect(() => {
    const socket = getSocket()
    socket.on('game:state', (data: GameStateData) => {
      setState(data)
      if (data.mode === 'buzzed') {
        playBuzzedSound()
      }
      if (data.mode === 'lottery' && data.lotteryDraw) {
        playLotterySound()
      }
      if (data.mode === 'result' && data.lastResult) {
        triggerBurst(data.lastResult.correct ? 'correct' : 'wrong')
      }
      // When quizzing starts: pick random audio
      if (data.mode === 'quizzing') {
        const audios = audioFilesRef.current
        if (audios.length > 0) {
          setCurrentAudio(`/media/audio/${encodeURIComponent(audios[Math.floor(Math.random() * audios.length)])}`)
        } else {
          setCurrentAudio('')
        }
      } else {
        // Leaving quizzing — clear audio
        setCurrentAudio('')
      }
    })
    // Auto-advance from result back to reading mode after showing animation
    socket.on('result:continue', () => {
      setBurstType(null)
      setSparkles([])
    })
    socket.on('draw:state', (ds: DrawSession | null) => {
      setDrawSession(ds)
    })
    socket.on('lottery-v2:state', (lv: LV2State | null) => {
      setLotteryV2State(lv)
      if (lv?.phase === 'animating') {
        playLotterySound()
      }
    })
    return () => {
      socket.off('game:state')
      socket.off('result:continue')
      socket.off('draw:state')
    }
  }, [])

  // Play/pause audio when quizzing mode or source changes
  useEffect(() => {
    if (!state || state.mode !== 'quizzing') {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.removeAttribute('src') }
      return
    }
    // Play audio only if unlocked by user gesture
    if (currentAudio && audioRef.current && audioUnlocked) {
      audioRef.current.src = currentAudio
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {})
    }
  }, [state?.mode, currentAudio, audioUnlocked])

  if (!state) {
    return (
      <div className="stage-container">
        <div className="stage-loading">连接中...</div>
      </div>
    )
  }

  const sortedTeams = [...state.teams].sort((a, b) => b.score - a.score)

  return (
    <div className="stage-container">
      {/* Event title — centered on background image */}
      <div className="stage-event-title">2026年医师节「以赛促学，砺技求精」</div>
      {burstType && (
        <div className={`burst-overlay ${burstType}`}>
          <div className={`burst-bg ${burstType}`} />
          {[...Array(burstType === 'correct' ? 40 : 20)].map((_, i) => (
            <div
              key={sparkleIdRef.current++}
              className={burstType === 'correct' ? 'sparkle-correct' : 'sparkle-wrong'}
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 0.5}s`,
              }}
            />
          ))}
          <div className="burst-text">
            {burstType === 'correct' ? '🎉 回答正确！' : '💥 回答错误'}
          </div>
        </div>
      )}

      {state.mode === 'opening' || state.mode === 'countdown' ? (
        <main className="stage-content">
          {state.mode === 'opening' ? <OpeningMode /> : <CountdownMode countdownEndTime={state.countdownEndTime} />}
        </main>
      ) : (
        <>
          {/* Hidden audio element for quizzing background music */}
          <audio ref={audioRef} loop style={{ display: 'none' }} />

          {/* Mode badge only */}
          <header className="stage-header">
            <span />
            {!drawSession?.active && (
              <div className="stage-mode-badge">
                {state.totalRounds > 0 && <span className="round-badge">第{state.currentRound}/{state.totalRounds}轮</span>}
                {modeLabel(state.mode)}
              </div>
            )}
          </header>

          {/* Main content area */}
          <main className={`stage-content ${state.mode === 'quizzing' ? 'quizzing-mode' : ''}`}>
            {/* Scoreboard — always visible as side panel */}
            <div className="scoreboard-panel">
              <h3 className="scoreboard-title">🏆 积分榜</h3>
              <div className="scoreboard-list">
                {sortedTeams.map((t, i) => (
                  <div
                    key={t.id}
                    className={`scoreboard-item ${state.buzzedTeam?.id === t.id ? 'highlighted' : ''}`}
                    style={{ borderLeftColor: t.color }}
                  >
                    <span className="sb-rank">{rankEmoji(i)}</span>
                    <span className="sb-name">{t.name}</span>
                    <span className="sb-buzzer">组{t.round} #{t.buzzerNumber}</span>
                    <span className="sb-score" style={{ color: t.color }}>{t.score}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Center content */}
            <div className={`stage-center${drawSession?.active ? ' draw-mode' : ''}`}>
              {drawSession?.active ? (
                <DrawCeremonyMode session={drawSession} onDrawTeam={() => getSocket().emit('admin:draw-team')} />
              ) : state.mode === 'waiting' ? (
                <WaitingMode />
              ) : state.mode === 'reading' ? (
                <ReadingMode question={state.currentQuestion} />
              ) : state.mode === 'quizzing' ? (
                <QuizzingMode question={state.currentQuestion} />
              ) : state.mode === 'buzzed' ? (
                <BuzzedMode team={state.buzzedTeam} question={state.currentQuestion} />
              ) : state.mode === 'result' && state.lastResult ? (
                <ResultMode result={state.lastResult} />
              ) : state.mode === 'lottery' && state.lotteryDraw ? (
                <LotteryMode draw={state.lotteryDraw} />
              ) : state.mode === 'round-intro' ? (
                <RoundIntroMode teams={state.teams} round={state.currentRound} />
              ) : state.mode === 'settlement' ? (
                <SettlementMode teams={sortedTeams} />
              ) : state.mode === 'lottery-v2' && lotteryV2State ? (
                <LotteryV2Mode lvState={lotteryV2State} />
              ) : null}
            </div>
          </main>

          {/* Danmaku — positioned at bottom when quiz is active */}
          {!drawSession?.active && <DanmakuOverlay mode={state.mode} />}

          {/* Audio unlock button (shown until user clicks once) */}
          {!audioUnlocked && (
            <div className="audio-unlock-btn" onClick={unlockAudio}>
              🔊 点击开启音效
            </div>
          )}

          {/* Floating QR code — shown in bottom-right during quiz modes */}
          {!drawSession?.active && state.mode !== 'waiting' && state.mode !== 'settlement' && (
            <FloatingQR />
          )}
        </>
      )}
    </div>
  )
}

// ===================== Sub-components =====================

function WaitingMode() {
  const hostname = window.location.hostname
  const port = window.location.port
  const url = `${hostname}${port ? ':' + port : ''}/mobile`
  return (
    <div className="mode-waiting fade-in">
      <div className="waiting-content">
        <div className="waiting-qr-box">
          <QRCodeCanvas value={`${window.location.protocol}//${url}`} size={220} bgColor="#ffffff" fgColor="#0a0e27" />
          <p className="waiting-hint">扫码发送弹幕</p>
          <p className="waiting-url">或访问 <strong>/{url.split('/').pop()}</strong></p>
        </div>
        <div className="waiting-decoration">
          <div className="floating-docs">
            <span className="doc-emoji" style={{ animationDelay: '0s' }}>👨‍⚕️</span>
            <span className="doc-emoji" style={{ animationDelay: '0.5s' }}>👩‍⚕️</span>
            <span className="doc-emoji" style={{ animationDelay: '1s' }}>🩺</span>
            <span className="doc-emoji" style={{ animationDelay: '1.5s' }}>💊</span>
            <span className="doc-emoji" style={{ animationDelay: '2s' }}>🏥</span>
          </div>
          <p className="waiting-quote">"医者仁心，妙手回春"</p>
        </div>
      </div>
    </div>
  )
}

function ReadingMode({ question }: { question: Question | null }) {
  if (!question) return <div className="mode-empty">请主持人选择题目</div>

  if (question.type === 'fill') {
    const parts = question.text.split('____')
    return (
      <div className="mode-reading fade-in">
        <div className="reading-card">
          <div className="reading-badge">第 {question.id} 题 · 填空题</div>
          <h2 className="reading-text fill-text">
            {parts.map((part, i) => (
              <span key={i}>
                {part}
                {i < parts.length - 1 && <span className="fill-blank">______</span>}
              </span>
            ))}
          </h2>
        </div>
      </div>
    )
  }

  return (
    <div className="mode-reading fade-in">
      <div className="reading-card">
        <div className="reading-badge">第 {question.id} 题 · 选择题</div>
        <h2 className="reading-text">{question.text}</h2>
        {question.options && (
          <div className="reading-options">
            {question.options.map((opt, i) => (
              <div key={i} className="reading-option">
                <span className="reading-option-label">{['A', 'B', 'C', 'D'][i]}</span>
                <span>{opt}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function QuizzingMode({ question }: { question: Question | null }) {
  return (
    <div className="mode-quizzing fade-in">
      {question && (
        <div className="quiz-question-card">
          <div className="quiz-question-badge">
            🔴 抢答中 · 第 {question.id} 题{question.type === 'fill' ? ' · 填空题' : ' · 选择题'}
          </div>
          <div className="quiz-question-text">{question.text}</div>
          {question.options && (
            <div className="quiz-options">
              {question.options.map((opt, i) => (
                <div key={i} className="quiz-option">
                  <span className="quiz-option-label">{['A', 'B', 'C', 'D'][i]}</span>
                  <span>{opt}</span>
                </div>
              ))}
            </div>
          )}
          <div className="quiz-waiting">
            <span className="quiz-dot">.</span>
            <span className="quiz-dot" style={{ animationDelay: '0.5s' }}>.</span>
            <span className="quiz-dot" style={{ animationDelay: '1s' }}>.</span>
          </div>
        </div>
      )}
    </div>
  )
}

function BuzzedMode({ team, question }: { team: Team | null; question: Question | null }) {
  if (!team) return null
  return (
    <div className="mode-buzzed fade-in">
      <div className="buzzed-card" style={{ borderColor: team.color }}>
        <div className="buzzed-corner">🎯</div>
        <div className="buzzed-team-color" style={{ backgroundColor: team.color }} />
        <div className="buzzed-info">
          <p className="buzzed-buzzer">抢答器 #{team.buzzerNumber}</p>
          <h2 className="buzzed-team-name" style={{ color: team.color }}>{team.name}</h2>
          <p className="buzzed-waiting">请作答</p>
        </div>
      </div>
      {question && (
        <div className="buzzed-question-card">
          <div className="buzzed-q-badge">第 {question.id} 题{question.type === 'fill' ? ' · 填空题' : ' · 选择题'}</div>
          <h2 className="buzzed-q-text">{question.text}</h2>
          {question.options && (
            <div className="buzzed-q-options">
              {question.options.map((opt, i) => (
                <div key={i} className="buzzed-q-option">
                  <span className="buzzed-q-opt-label">{['A','B','C','D'][i]}</span>
                  <span>{opt}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ResultMode({ result }: { result: { correct: boolean; teamId: string; teamName: string; points: number } }) {
  return (
    <div className={`mode-result fade-in ${result.correct ? 'result-correct' : 'result-wrong'}`}>
      <div className="result-card">
        <div className="result-icon">{result.correct ? '🎉' : '💥'}</div>
        <h2 className="result-team">{result.teamName}</h2>
        <div className={`result-verdict ${result.correct ? 'correct' : 'wrong'}`}>
          {result.correct ? '回答正确！' : '回答错误！'}
        </div>
        <div className="result-points">
          {result.points > 0 ? `+${result.points} 分` : '不加分'}
        </div>
      </div>
    </div>
  )
}

function RoundIntroMode({ teams, round }: { teams: Team[]; round: number }) {
  const roundTeams = teams.filter(t => t.round === round).sort((a, b) => a.buzzerNumber - b.buzzerNumber)
  return (
    <div className="mode-round-intro fade-in">
      <h2 className="intro-round-title">📋 第 {round} 轮 — 队伍入座</h2>
      <p className="intro-round-hint">请以下队伍按对应号码就座抢答器</p>
      <div className="intro-buzzer-grid">
        {roundTeams.map(t => (
          <div key={t.id} className="intro-buzzer-card" style={{ borderColor: t.color }}>
            <div className="intro-buzzer-num" style={{ backgroundColor: t.color }}>#{t.buzzerNumber}</div>
            <div className="intro-team-name" style={{ color: t.color }}>{t.name}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LotteryMode({ draw }: { draw: { prize: { id: string; name: string; icon: string; description: string }; winners: Team[] } }) {
  return (
    <div className="mode-lottery fade-in">
      <div className="lottery-stage">
        <div className="lottery-stage-header">
          <span className="lottery-stage-icon">🎊</span>
          <h2>幸运抽奖</h2>
        </div>
        <div className="lottery-stage-prize">
          <span className="lottery-prize-icon">{draw.prize.icon}</span>
          <span className="lottery-prize-name">{draw.prize.name}</span>
          <p className="lottery-prize-desc">{draw.prize.description}</p>
        </div>
        <div className="lottery-stage-divider">
          {draw.winners.length > 1 ? `🎉 恭喜 ${draw.winners.length} 位中奖者 🎉` : '🎉 恭喜中奖 🎉'}
        </div>
        <div className={`lottery-stage-winners ${draw.winners.length > 1 ? 'multi' : ''}`}>
          {draw.winners.map((w, i) => (
            <div key={w.id} className="lottery-winner-chip" style={{ borderColor: w.color }}>
              <div className="lottery-winner-badge" style={{ backgroundColor: w.color }}>
                #{w.buzzerNumber}
              </div>
              <span className="lottery-winner-name" style={{ color: w.color }}>{w.name}</span>
              <span className="lottery-winner-order">🏅</span>
            </div>
          ))}
        </div>
        <div className="lottery-stage-confetti">
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} className="lottery-confetti-piece" style={{
              left: `${Math.random() * 100}%`,
              backgroundColor: ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c084fc', '#ff8fab'][i % 6],
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${2 + Math.random() * 2}s`,
            }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function DrawCeremonyMode({ session, onDrawTeam }: { session: DrawSession; onDrawTeam?: () => void }) {
  const [highlightedTeamIds, setHighlightedTeamIds] = useState<string[]>([])
  const [revealedTeams, setRevealedTeams] = useState<string[]>([])
  const [celebrating, setCelebrating] = useState(false)
  const [animDone, setAnimDone] = useState(false)
  const animFrameRef = useRef<number>(0)

  // Sequential reveal animation: highlight each team → fly out → next
  useEffect(() => {
    const teams = session.animatingTeams
    if (teams.length === 0) {
      if (animDone) return
      if (highlightedTeamIds.length > 0 || revealedTeams.length > 0) {
        setHighlightedTeamIds([])
        setRevealedTeams([])
        setCelebrating(false)
        setAnimDone(false)
      }
      return
    }

    setHighlightedTeamIds([])
    setRevealedTeams([])
    setCelebrating(false)
    setAnimDone(false)

    let idx = 0

    function processNext() {
      if (idx >= teams.length) {
        // All teams done — celebrate + signal server
        setCelebrating(true)
        setAnimDone(true)
        playDrawRevealSound()
        animFrameRef.current = window.setTimeout(() => {
          getSocket().emit('draw:animation-complete')
        }, 1000)
        animFrameRef.current = window.setTimeout(() => setCelebrating(false), 2500)
        return
      }

      const team = teams[idx]
      // Step 1: highlight this team in the pool
      setHighlightedTeamIds([team.id])
      playDrawTickSound()

      // Step 2: after brief highlight, mark as revealed → triggers fly-out
      animFrameRef.current = window.setTimeout(() => {
        setRevealedTeams(prev => [...prev, team.id])
        setHighlightedTeamIds([])
        idx++
        // Wait for fly animation (~700ms), then next team
        animFrameRef.current = window.setTimeout(processNext, 750)
      }, 500)
    }

    // Small initial pause, then start
    animFrameRef.current = window.setTimeout(processNext, 400)

    return () => {
      if (animFrameRef.current) {
        clearTimeout(animFrameRef.current)
        animFrameRef.current = 0
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.animatingTeams])

  const drawnSet = new Set(session.drawnTeamIds)
  const animatingTeamIds = new Set(session.animatingTeams.map(t => t.id))
  const undrawnCount = session.pool.filter(t => !drawnSet.has(t.id)).length
  const isAnimating = session.phase === 'animation'

  const roundsToDisplay = session.rounds.map((roundTeams, rIdx) => {
    // During animation, show animating teams in current leader's panel
    if (rIdx === session.currentLeader && isAnimating && session.animatingTeams.length > 0) {
      // Only show teams that have been revealed so far
      const visibleAnimated = session.animatingTeams.filter(t => revealedTeams.includes(t.id))
      return { roundIndex: rIdx, teams: [...roundTeams, ...visibleAnimated] }
    }
    // After animation done but before server broadcasts: show animating teams + rounds
    if (rIdx === session.currentLeader && animDone && !isAnimating) {
      return { roundIndex: rIdx, teams: [...roundTeams, ...session.animatingTeams] }
    }
    return { roundIndex: rIdx, teams: roundTeams }
  })

  if (session.phase === 'complete') {
    return (
      <div className="draw-stage fade-in draw-complete">
        <div className="draw-header">
          <div className="draw-complete-badge">🎉 抽签分组完成</div>
        </div>
        <div className="draw-panels complete">
          {session.teamsPerRound.map((_count, rIdx) => {
            const roundTeams = session.rounds[rIdx] || []
            return (
              <div key={rIdx} className="draw-panel done">
                <div className="draw-panel-header">第 {rIdx + 1} 轮 ✓</div>
                <div className="draw-panel-teams">
                  {roundTeams.map((t, tIdx) => (
                    <div key={t.id} className="draw-panel-team" style={{ color: t.color }}>
                      <span className="draw-panel-tnum">#{tIdx + 1}</span>
                      <span>{t.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="draw-stage fade-in">
      {/* Header */}
      <div className="draw-header">
        <div className="draw-leader-badge">
          👤 {session.leaderLabels[session.currentLeader]}
        </div>
        <div className="draw-header-info">
          第 {session.currentLeader + 1} 轮 · 剩余 {undrawnCount} 队
        </div>
      </div>

      {/* Pool grid — ALL teams shown, drawn ones become gray + ✓ */}
      <div className="draw-pool-area">
        <div className="draw-pool-grid">
          {session.pool.map(t => {
            const isDrawn = drawnSet.has(t.id) && !animatingTeamIds.has(t.id)
            const isAnimatingTeam = animatingTeamIds.has(t.id)
            const isRevealed = revealedTeams.includes(t.id)
            return (
              <div
                key={t.id}
                className={`draw-pool-card ${
                  isRevealed && isAnimatingTeam ? 'flying-out' : ''
                } ${
                  highlightedTeamIds.includes(t.id) && !isRevealed ? 'highlighted' : ''
                } ${
                  isDrawn ? 'drawn' : ''
                }`}
                style={{ borderLeftColor: t.color }}
              >
                {isDrawn ? (
                  <span className="draw-pool-drawn-marker">{t.name}</span>
                ) : (
                  t.name
                )}
              </div>
            )
          })}
          {session.pool.length === 0 && (
            <div className="draw-pool-empty">所有队伍已抽完</div>
          )}
        </div>
      </div>

      {/* Draw button */}
      {onDrawTeam && (
        <button
          className="draw-btn-big"
          onClick={onDrawTeam}
          disabled={isAnimating}
        >
          🎯 抽签
        </button>
      )}

      {/* Panels area */}
      <div className="draw-panels">
        {session.teamsPerRound.map((_count, rIdx) => {
          const roundData = roundsToDisplay.find(r => r.roundIndex === rIdx)
          const roundTeams = roundData?.teams || []
          const isActive = rIdx === session.currentLeader
          const isDone = rIdx < session.currentLeader
          return (
            <div key={rIdx} className={`draw-panel ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}>
              <div className="draw-panel-header">
                <span>第 {rIdx + 1} 轮</span>
                {isDone && <span className="draw-panel-check">✓</span>}
              </div>
              <div className="draw-panel-teams">
                {roundTeams.map((t, tIdx) => {
                  const justRevealed = revealedTeams.includes(t.id) && animatingTeamIds.has(t.id)
                  return (
                    <div
                      key={t.id}
                      className={`draw-panel-team ${justRevealed ? 'flying-in' : ''} ${celebrating && justRevealed ? 'celebrated' : ''}`}
                      style={{ color: t.color }}
                    >
                      <span className="draw-panel-tnum">#{tIdx + 1}</span>
                      <span>{t.name}</span>
                    </div>
                  )
                })}
                {roundTeams.length === 0 && !isDone && (
                  <div className="draw-panel-empty">等待抽签</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Confetti */}
      {celebrating && (
        <div className="draw-confetti">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="draw-confetti-piece" style={{
              left: `${Math.random() * 100}%`,
              backgroundColor: ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#c084fc','#ff8fab'][i % 6],
              animationDelay: `${Math.random() * 0.5}s`,
              animationDuration: `${1.5 + Math.random() * 1.5}s`,
            }} />
          ))}
        </div>
      )}
    </div>
  )
}

function OpeningMode() {
  const [audioReady, setAudioReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const trackRef = useRef<string[]>([])
  const trackIdxRef = useRef(0)
  const spinRef = useRef<number>(0)

  useEffect(() => {
    fetch('/api/media/audio/backmusic')
      .then(r => r.json())
      .then(files => {
        trackRef.current = files
        setAudioReady(files.length > 0)
      })
      .catch(() => {})
  }, [])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio || trackRef.current.length === 0) return
    if (playing) {
      audio.pause()
      setPlaying(false)
      if (spinRef.current) { cancelAnimationFrame(spinRef.current); spinRef.current = 0 }
    } else {
      playTrack(trackIdxRef.current)
    }
  }

  function playTrack(index: number) {
    const audio = audioRef.current
    if (!audio || trackRef.current.length === 0) return
    const track = trackRef.current[index % trackRef.current.length]
    audio.loop = false
    audio.onended = () => {
      trackIdxRef.current = (trackIdxRef.current + 1) % trackRef.current.length
      playTrack(trackIdxRef.current)
    }
    audio.src = `/media/audio/backmusic/${encodeURIComponent(track)}`
    audio.play().then(() => setPlaying(true)).catch(() => {})
  }

  return (
    <div className="mode-opening">
      <audio ref={audioRef} />
      <div className="opening-top-right">
        <button className={`opening-music-btn ${playing ? 'playing' : ''}`}
          onClick={togglePlay}
          title={playing ? '暂停背景音乐' : '播放背景音乐'}>
          ♪
        </button>
        <div className="opening-checkin-qr">
          <QRCodeCanvas value={`${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}/checkin`} size={100} bgColor="#ffffff" fgColor="#0a0e27" />
          <span className="opening-checkin-label">扫码签到</span>
        </div>
      </div>
    </div>
  )
}

function CountdownMode({ countdownEndTime }: { countdownEndTime: number }) {
  const [remaining, setRemaining] = useState(countdownEndTime > 0 ? Math.max(0, Math.floor((countdownEndTime - Date.now()) / 1000)) : 0)
  const [started, setStarted] = useState(countdownEndTime > 0)
  const [expired, setExpired] = useState(false)
  const endTimeRef = useRef(countdownEndTime)
  const timerRef = useRef<ReturnType<typeof setInterval>>(0)
  // Music state
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const trackRef = useRef<string[]>([])
  const missionSwitchedRef = useRef(false)
  const alarmPlayedRef = useRef(false)

  // Fetch music files
  useEffect(() => {
    fetch('/api/media/audio/backmusic')
      .then(r => r.json())
      .then(files => { trackRef.current = files })
      .catch(() => {})
  }, [])

  // Sync endTime when server broadcasts (e.g. another client started it)
  useEffect(() => {
    if (countdownEndTime > 0) {
      endTimeRef.current = countdownEndTime
      setStarted(true)
    }
  }, [countdownEndTime])

  // Tick every second
  useEffect(() => {
    if (!started) return
    function tick() {
      const diff = Math.max(0, Math.floor((endTimeRef.current - Date.now()) / 1000))
      setRemaining(diff)
      // Switch to mission_impossible at 5-minute mark
      if (diff > 0 && diff <= 300 && !missionSwitchedRef.current) {
        missionSwitchedRef.current = true
        switchToMissionImpossible()
      }
      if (diff <= 0) {
        setExpired(true)
        clearInterval(timerRef.current)
        if (!alarmPlayedRef.current) {
          alarmPlayedRef.current = true
          playAlarmSound()
        }
      }
    }
    tick()
    timerRef.current = setInterval(tick, 1000)
    return () => clearInterval(timerRef.current)
  }, [started])

  function switchToMissionImpossible() {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.loop = false
    audio.onended = null
    audio.src = '/media/audio/mission_impossible.mp3'
    audio.play().then(() => setPlaying(true)).catch(() => {})
  }

  function playAlarmSound() {
    const audio = audioRef.current
    if (audio) { audio.pause(); audio.removeAttribute('src') }
    setPlaying(false)
    // Web Audio API alarm beeps
    try {
      const ctx = new AudioContext()
      for (let i = 0; i < 10; i++) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.setValueAtTime(880, ctx.currentTime + i * 0.3)
        gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.3)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.3 + 0.25)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(ctx.currentTime + i * 0.3)
        osc.stop(ctx.currentTime + i * 0.3 + 0.25)
      }
    } catch {}
  }

  function handleStart() {
    getSocket().emit('host:start-countdown')
    // Set end time locally so countdown starts immediately (no wait for server)
    endTimeRef.current = Date.now() + 20 * 60 * 1000
    setStarted(true)
    setRemaining(20 * 60)
  }

  const cIdxRef = useRef(0)
  function toggleMusic() {
    if (missionSwitchedRef.current) return  // can't override mission_impossible
    const audio = audioRef.current
    if (!audio || trackRef.current.length === 0) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      playCtrack(cIdxRef.current)
    }
  }
  function playCtrack(index: number) {
    const audio = audioRef.current
    if (!audio || trackRef.current.length === 0) return
    const track = trackRef.current[index % trackRef.current.length]
    audio.loop = false
    audio.onended = () => {
      cIdxRef.current = (cIdxRef.current + 1) % trackRef.current.length
      playCtrack(cIdxRef.current)
    }
    audio.src = `/media/audio/backmusic/${encodeURIComponent(track)}`
    audio.play().then(() => setPlaying(true)).catch(() => {})
  }

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  // Color transitions: golden #FEDAA5 > 10min, then warm amber > 5min, red <= 1min
  let color = '#FEDAA5'
  if (started) {
    if (remaining <= 60) color = '#ef4444'
    else if (remaining <= 300) color = '#f59e0b'
    else if (remaining <= 600) color = '#eab308'
  }

  return (
    <div className="mode-countdown">
      <audio ref={audioRef} />
      <button className={`opening-music-btn ${playing ? 'playing' : ''}`}
        onClick={toggleMusic}
        title={playing ? '暂停背景音乐' : '播放背景音乐'}>
        ♪
      </button>
      <div className="countdown-center">
        <div className="countdown-label">倒计时</div>
        {started ? (
          <div className={`countdown-timer ${expired ? 'expired' : ''}`} style={{ color }}>
            {expired ? '⏰ 时间到！' : display}
          </div>
        ) : (
          <div className="countdown-timer countdown-ready" style={{ color: '#FEDAA5' }}>20:00</div>
        )}
        {!started && (
          <button className="countdown-start-btn" onClick={handleStart}>
            ▶ 开始 20 分钟倒计时
          </button>
        )}
      </div>
    </div>
  )
}

const LOTUS_COLORS = ['#ff6b9d', '#c084fc', '#4d96ff', '#6bcb77']

type PrizeTier = { label: string; icon: string; color: string; count: number }

const PRIZE_TIERS: PrizeTier[] = [
  { label: '一等奖', icon: '🥇', color: '#ff6b35', count: 2 },
  { label: '二等奖', icon: '🥈', color: '#4a6fa5', count: 4 },
  { label: '三等奖', icon: '🥉', color: '#cd7f32', count: 6 },
]

function SettlementMode({ teams }: { teams: Team[] }) {
  let teamIdx = 0
  return (
    <div className="mode-settlement fade-in">
      <div className="settlement-board-full">
        <h2 className="settlement-title">🏆 最终排名</h2>
        <div className="settlement-tiers">
          {PRIZE_TIERS.map((tier) => {
            const tierTeams = teams.slice(teamIdx, teamIdx + tier.count)
            teamIdx += tier.count
            if (tierTeams.length === 0) return null
            return (
              <div key={tier.label} className="settlement-tier">
                <div className="settlement-tier-header" style={{ color: tier.color }}>
                  <span className="settlement-tier-icon">{tier.icon}</span>
                  <span className="settlement-tier-label">{tier.label}</span>
                  <span className="settlement-tier-count">（{tierTeams.length}名）</span>
                </div>
                <div className="settlement-tier-teams">
                  {tierTeams.map((t) => (
                    <div key={t.id} className="settlement-tier-team" style={{ borderColor: t.color }}>
                      <span className="settlement-tier-rank">#{tierTeams.indexOf(t) + 1}</span>
                      <span className="settlement-tier-name" style={{ color: t.color }}>{t.name}</span>
                      <span className="settlement-tier-score">{t.score}分</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ===================== Lottery V2 Mode =====================
function LotteryV2Mode({ lvState }: { lvState: LV2State }) {
  const [slotNames, setSlotNames] = useState<string[]>(Array(10).fill('?'))
  const [slotStopped, setSlotStopped] = useState<boolean[]>(Array(10).fill(false))
  const [showWinners, setShowWinners] = useState(false)
  const slotsRef = useRef<{ intervals: number[]; timers: number[] }>({ intervals: [], timers: [] })

  useEffect(() => {
    // Cleanup previous animation
    slotsRef.current.intervals.forEach(id => clearInterval(id))
    slotsRef.current.timers.forEach(id => clearTimeout(id))
    slotsRef.current = { intervals: [], timers: [] }

    if (lvState.phase === 'animating') {
      setShowWinners(false)
      setSlotNames(Array(10).fill('?'))
      setSlotStopped(Array(10).fill(false))

      const allNames = lvState.pool.map(p => p.name)
      if (allNames.length === 0) return

      // Start all 10 slots spinning
      for (let i = 0; i < 10; i++) {
        const idx = i
        const id = window.setInterval(() => {
          setSlotNames(prev => {
            const next = [...prev]
            next[idx] = allNames[Math.floor(Math.random() * allNames.length)]
            return next
          })
        }, 50)
        slotsRef.current.intervals.push(id)
      }

      // Stop slots with staggering
      const winnerNames = lvState.currentWinners.map(w => w.name)
      const decelIntervals = [80, 120, 200, 350, 500]

      for (let i = 0; i < 10; i++) {
        const idx = i
        const stopDelay = 2000 + idx * 400

        const timerId = window.setTimeout(() => {
          clearInterval(slotsRef.current.intervals[idx])

          // Deceleration: 5 steps with increasing interval
          let step = 0
          function decel() {
            if (step >= 5) {
              const finalName = idx < winnerNames.length ? winnerNames[idx] : allNames[Math.floor(Math.random() * allNames.length)]
              setSlotNames(prev => {
                const next = [...prev]
                next[idx] = finalName
                return next
              })
              setSlotStopped(prev => {
                const next = [...prev]
                next[idx] = true
                return next
              })
              return
            }
            setSlotNames(prev => {
              const next = [...prev]
              next[idx] = allNames[Math.floor(Math.random() * allNames.length)]
              return next
            })
            step++
            setTimeout(decel, decelIntervals[step - 1])
          }
          decel()
        }, stopDelay)
        slotsRef.current.timers.push(timerId)
      }

      // Signal animation done after last slot stops + deceleration + buffer
      const totalAnimTime = 2000 + 9 * 400 + 5 * 500 + 500
      const doneTimer = window.setTimeout(() => {
        getSocket().emit('stage:lottery-v2-animation-done')
      }, totalAnimTime)

      return () => {
        slotsRef.current.intervals.forEach(id => clearInterval(id))
        slotsRef.current.timers.forEach(id => clearTimeout(id))
        clearTimeout(doneTimer)
      }
    }

    if (lvState.phase === 'revealed') {
      setShowWinners(true)
    }
  }, [lvState.phase, lvState.currentRound])

  // All-complete
  if (lvState.phase === 'all-complete') {
    return <LotteryV2CompleteView lvState={lvState} />
  }

  // Ready phase
  if (lvState.phase === 'ready') {
    const roundLabel = lvState.currentRound <= 3 ? `第 ${lvState.currentRound} 轮抽奖` : '补抽第4轮'
    return (
      <div className="lottery-v2-stage fade-in">
        <div className="lv2-stage-title">🎊 幸运抽奖</div>
        <div className="lv2-round-badge">{roundLabel}</div>
        <div className="lv2-pool-info">
          签到人数 {lvState.pool.length + lvState.allWinnerIds.length} ·
          可抽 {lvState.pool.length} 人
        </div>
        {lvState.currentRound === 4 && (
          <div className="lv2-round4-note">第1-3轮未到场奖品补抽</div>
        )}
        <button className="lv2-draw-btn" onClick={() => getSocket().emit('stage:lottery-v2-draw')}>
          🎰 开始抽奖
        </button>
      </div>
    )
  }

  // Animating or revealed
  const winnerNames = lvState.currentWinners.map(w => w.name)
  const gridSlots = Array.from({ length: 10 }, (_, i) => i)

  return (
    <div className="lottery-v2-stage fade-in">
      <div className="lv2-stage-title">🎊 幸运抽奖</div>
      <div className="lv2-round-badge">第 {lvState.currentRound} 轮</div>
      <div className={`lv2-slot-grid ${lvState.phase === 'revealed' ? 'revealed' : ''}`}>
        {gridSlots.map(i => (
          <div key={i} className={`lv2-slot-cell ${slotStopped[i] ? 'stopped' : 'spinning'} ${showWinners && i < winnerNames.length ? 'winner' : ''}`}>
            <span className="lv2-slot-name">{slotNames[i] || '?'}</span>
            {slotStopped[i] && showWinners && i < winnerNames.length && (
              <span className="lv2-slot-check">🎉</span>
            )}
          </div>
        ))}
      </div>
      {showWinners && (
        <div className="lv2-revealed">
          <p className="lv2-revealed-text">🎊 恭喜以上中奖者！</p>
        </div>
      )}
      {/* Confetti when revealed */}
      {showWinners && (
        <div className="lottery-stage-confetti">
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} className="lottery-confetti-piece" style={{
              left: `${Math.random() * 100}%`,
              backgroundColor: ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#c084fc','#ff8fab'][i % 6],
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${2 + Math.random() * 2}s`,
            }} />
          ))}
        </div>
      )}
    </div>
  )
}

function LotteryV2CompleteView({ lvState }: { lvState: LV2State }) {
  const roundOrder = [1, 2, 3, 4].filter(r => lvState.roundResults[r])
  const absentCount = [1, 2, 3].reduce((sum, r) => {
    const rr = lvState.roundResults[r]
    return sum + (rr ? rr.absentIds.length : 0)
  }, 0)

  return (
    <div className="lottery-v2-stage fade-in">
      <div className="lv2-stage-title">🎊 抽奖完成</div>
      <div className="lv2-complete-summary">
        {roundOrder.map(r => {
          const rd = lvState.roundResults[r]!
          return (
            <div key={r} className="lv2-complete-round">
              <h3>{r <= 3 ? `第 ${r} 轮` : '补抽第4轮'}</h3>
              <div className="lv2-complete-winners">
                {rd.winners.map(w => (
                  <div key={w.id} className={`lv2-complete-winner ${rd.absentIds.includes(w.id) ? 'absent' : ''}`}>
                    <span className="lv2-cw-name">{w.name}</span>
                    <span className="lv2-cw-dept">{w.department}</span>
                    {rd.absentIds.includes(w.id) && <span className="lv2-cw-absent">缺席</span>}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {absentCount > 0 && (
        <p className="lv2-complete-note">共 {absentCount} 人缺席，已通过第4轮补抽</p>
      )}
    </div>
  )
}

// ===================== Helpers =====================

function FloatingQR() {
  const hostname = window.location.hostname
  const port = window.location.port
  const url = `${hostname}${port ? ':' + port : ''}/mobile`
  return (
    <div className="floating-qr">
      <QRCodeCanvas value={`${window.location.protocol}//${url}`} size={80} bgColor="#ffffff" fgColor="#0a0e27" />
      <span className="floating-qr-label">扫码发弹幕</span>
    </div>
  )
}

function modeLabel(mode: string): string {
  const map: Record<string, string> = {
    opening: '🎬 开幕', waiting: '等待中', reading: '读题中', quizzing: '抢答中',
    buzzed: '已抢中', result: '判定', settlement: '结算',
    lottery: '🎊 抽奖中', 'round-intro': '📋 队伍入座',
    countdown: '⏱ 倒计时', 'lottery-v2': '🎊 签到抽奖',
  }
  return map[mode] || mode
}

function rankEmoji(i: number): string {
  return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''
}
