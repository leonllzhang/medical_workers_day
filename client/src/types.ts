export interface Team {
  id: string
  name: string
  buzzerNumber: number
  score: number
  color: string
  round: number          // 0 = not participating, 1-4 = assigned round
}

export interface Question {
  id: number
  text: string
  type: 'choice' | 'fill'
  options?: string[]
  answer?: string
  group: number          // 1-4, which round's question set
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

export interface CheckInPerson {
  id: string
  name: string
  department: string
  timestamp: number
}

export interface LotteryV2RoundData {
  roundNumber: number
  winners: CheckInPerson[]
  absentIds: string[]
  completed: boolean
}

export interface LotteryV2State {
  active: boolean
  currentRound: number
  phase: 'idle' | 'ready' | 'animating' | 'revealed' | 'all-complete'
  currentWinners: CheckInPerson[]
  pool: CheckInPerson[]
  allCheckInNames: string[]
  roundResults: Record<number, LotteryV2RoundData | null>
  allWinnerIds: string[]
}

export type GameMode = 'waiting' | 'reading' | 'quizzing' | 'buzzed' | 'result' | 'settlement' | 'lottery' | 'round-intro' | 'opening' | 'countdown' | 'lottery-v2'

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
  currentRound: number    // 1-4
  totalRounds: number     // total rounds in this session
  questionGroup: number   // which question group to use (= currentRound typically)
  countdownEndTime: number // 0 = not started, timestamp when countdown ends
}

export interface DrawSession {
  active: boolean
  phase: 'setup' | 'drawing' | 'animation' | 'complete'
  pool: Team[]
  rounds: Team[][]
  currentLeader: number
  totalLeaders: number
  leaderLabels: string[]
  teamsPerRound: number[]
  animatingTeams: Team[]
  drawHistory: { teamId: string; roundIndex: number }[]
  drawnTeamIds: string[]
}

export interface ScoreEntry {
  teamId: string
  name: string
  buzzerNumber: number
  score: number
  color: string
}
