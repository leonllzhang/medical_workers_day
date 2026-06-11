import { useState, useRef, useEffect } from 'react'
import './CheckInPage.css'

export default function CheckInPage() {
  const [name, setName] = useState('')
  const [department, setDepartment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/checkin/list')
      .then(r => r.json())
      .then(list => setCount(list.length))
      .catch(() => {})
    nameRef.current?.focus()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedDept = department.trim()
    if (!trimmedName || !trimmedDept) {
      setError('请填写姓名和科室')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, department: trimmedDept }),
      })
      const data = await res.json()
      if (data.success) {
        setDone(true)
        setCount(c => (c ?? 0) + 1)
      } else {
        setError(data.error || '签到失败')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="checkin-page">
        <div className="checkin-card">
          <div className="checkin-success-icon">✅</div>
          <h1 className="checkin-success-title">签到成功！</h1>
          <p className="checkin-success-name">{name}</p>
          <p className="checkin-success-dept">{department}</p>
          {count !== null && <p className="checkin-success-count">已签到 {count} 人</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="checkin-page">
      <div className="checkin-card">
        <div className="checkin-header">
          <span className="checkin-icon">📋</span>
          <h1>活动签到</h1>
          <p className="checkin-subtitle">2026年医师节「以赛促学，砺技求精」</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="checkin-field">
            <label htmlFor="name">姓名</label>
            <input
              ref={nameRef}
              id="name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="请输入您的姓名"
              maxLength={20}
              autoComplete="name"
            />
          </div>
          <div className="checkin-field">
            <label htmlFor="department">科室</label>
            <input
              id="department"
              type="text"
              value={department}
              onChange={e => setDepartment(e.target.value)}
              placeholder="请输入您所在的科室"
              maxLength={30}
              autoComplete="organization"
            />
          </div>
          {error && <p className="checkin-error">{error}</p>}
          <button type="submit" className="checkin-btn checkin-btn-primary" disabled={submitting}>
            {submitting ? '签到中...' : '✏️ 签到'}
          </button>
        </form>
        {count !== null && <p className="checkin-footer">已有 {count} 人签到</p>}
      </div>
    </div>
  )
}
