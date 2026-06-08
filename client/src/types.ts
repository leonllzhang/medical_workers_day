export interface Team {
  id: string
  name: string
  buzzerNumber: number
  score: number
  color: string
}

export interface Question {
  id: number
  text: string
  image?: string
  options?: string[]
}

export interface Danmaku {
  id: string
  userName: string
  text: string
  timestamp: number
}

export interface Prize {
  id: string
  name: string
  icon: string
  description: string
}

export interface LotteryDraw {
  prize: Prize
  winners: Team[]
}

export type GameMode = 'waiting' | 'reading' | 'quizzing' | 'buzzed' | 'result' | 'settlement' | 'lottery'

export interface GameStateData {
  mode: GameMode
  currentQuestion: Question | null
  questionIndex: number
  teams: Team[]
  buzzedTeam: Team | null
  lastResult: { correct: boolean; teamId: string; teamName: string; points: number } | null
  lotteryActive: boolean
  lotteryDraw: LotteryDraw | null
  previousMode: GameMode  // to restore after lottery
}

export interface ScoreEntry {
  teamId: string
  name: string
  buzzerNumber: number
  score: number
  color: string
}
