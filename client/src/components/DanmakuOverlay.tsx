import { useEffect, useRef, useState } from 'react'
import { getSocket } from '../socket'
import type { Danmaku } from '../types'
import './DanmakuOverlay.css'

interface DanmakuItem extends Danmaku {
  y: number
  color: string
}

const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff8fab', '#c084fc', '#fb923c']

export default function DanmakuOverlay({ mode }: { mode?: string }) {
  const [danmakuList, setDanmakuList] = useState<DanmakuItem[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const nextY = useRef(0)

  useEffect(() => {
    const socket = getSocket()
    const h = containerRef.current?.clientHeight || 400
    const laneH = 36
    const maxLanes = Math.floor(h / laneH)

    const handler = (d: Danmaku) => {
      const lane = nextY.current % Math.max(maxLanes, 5)
      nextY.current++
      const item: DanmakuItem = {
        ...d,
        y: lane * laneH,
        color: colors[Math.floor(Math.random() * colors.length)],
      }
      setDanmakuList(prev => [...prev.slice(-30), item])
    }

    socket.on('danmaku:new', handler)
    return () => { socket.off('danmaku:new', handler) }
  }, [])

  const isQuizMode = mode && mode !== 'waiting' && mode !== 'settlement'

  return (
    <div className={`danmaku-overlay ${isQuizMode ? 'quiz-mode' : ''}`} ref={containerRef}>
      {danmakuList.map(d => (
        <div
          key={d.id}
          className="danmaku-item"
          style={{
            top: d.y,
            color: d.color,
            animationDuration: `${6 + Math.random() * 3}s`,
          }}
        >
          <span className="danmaku-name">[{d.userName}]</span>
          <span className="danmaku-text">{d.text}</span>
        </div>
      ))}
    </div>
  )
}
