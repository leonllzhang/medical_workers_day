import { useState } from 'react'
import { getSocket } from '../socket'
import './MobileController.css'

const MEME_PHRASES = [
  '这题我会！快选我！', '院长快发红包！', '医生小姐姐最美！',
  '内科永远的神！', '外科今天不加班！', '今天食堂加鸡腿了吗？',
  '主任别皱眉，笑一个！', '这题太难了，告辞！', '在线等，急！',
  '为科室争光的时候到了！', '实习生表示很慌', '规培生瑟瑟发抖',
]

export default function MobileController() {
  const [userName, setUserName] = useState('')
  const [joined, setJoined] = useState(false)
  const [danmakuText, setDanmakuText] = useState('')
  const [sentCount, setSentCount] = useState(0)

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!userName.trim()) return
    setJoined(true)
  }

  function sendDanmaku(text: string) {
    if (!text.trim()) return
    const socket = getSocket()
    socket.emit('danmaku:send', { text: text.trim(), userName: userName.trim() || '匿名' })
    setSentCount(c => c + 1)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!danmakuText.trim()) return
    sendDanmaku(danmakuText)
    setDanmakuText('')
  }

  // Join screen
  if (!joined) {
    return (
      <div className="mob-container">
        <div className="mob-join">
          <div className="mob-join-icon">💬</div>
          <h1>弹幕互动</h1>
          <p className="mob-join-desc">扫码加入，发送弹幕上大屏！</p>
          <form onSubmit={handleJoin} className="mob-join-form">
            <input
              type="text"
              placeholder="输入你的昵称..."
              value={userName}
              onChange={e => setUserName(e.target.value)}
              maxLength={16}
              className="mob-input"
            />
            <button type="submit" className="mob-join-btn" disabled={!userName.trim()}>
              进入
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Danmaku screen
  return (
    <div className="mob-container">
      <div className="mob-header">
        <span className="mob-user">👤 {userName}</span>
        <span className="mob-count">已发送 {sentCount} 条</span>
      </div>

      <div className="mob-content">
        <div className="mob-hint">
          <span className="mob-hint-icon">📢</span>
          <span>随时发送弹幕，内容将显示在大屏幕上</span>
        </div>

        <div className="mob-memes">
          <p className="mob-section-title">快捷梗词</p>
          <div className="mob-meme-grid">
            {MEME_PHRASES.map(p => (
              <button key={p} className="mob-meme-btn" onClick={() => sendDanmaku(p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <form className="mob-input-bar" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="输入弹幕内容..."
          value={danmakuText}
          onChange={e => setDanmakuText(e.target.value)}
          maxLength={50}
        />
        <button type="submit" disabled={!danmakuText.trim()}>发送</button>
      </form>
    </div>
  )
}
