import { useState, useEffect, useCallback, useRef } from 'react'
import { getAllCards, saveCard, importCards, getSetting, saveSetting, getStarredCards } from './db'
import { calcSM2 } from './sm2'
import jyutDict from './data/jyutping_dict.json'
import corpusData from './data/corpus.json'

const TABS = [
  { id: 'study', label: '學習', icon: '📖' },
  { id: 'review', label: '複習', icon: '🔄' },
  { id: 'corpus', label: '語料', icon: '📚' },
  { id: 'star', label: '生詞本', icon: '⭐' },
  { id: 'settings', label: '設置', icon: '⚙️' }
]

export default function App() {
  const [tab, setTab] = useState('study')
  const [cards, setCards] = useState([])
  const [currentCard, setCurrentCard] = useState(null)
  const [showJyutping, setShowJyutping] = useState(false)
  const [dailyGoal, setDailyGoal] = useState(20)
  const [levelStart, setLevelStart] = useState(1)
  const [isReady, setIsReady] = useState(false)
  const [starredCards, setStarredCards] = useState([])
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewCards, setReviewCards] = useState([])
  const [reviewIndex, setReviewIndex] = useState(0)
  const [todayLearned, setTodayLearned] = useState(0)
  const [studiedChars, setStudiedChars] = useState(new Set())
  const [corpusFilter, setCorpusFilter] = useState('all')
  const [starredCorpus, setStarredCorpus] = useState([])  // starred corpus items
  const ttsRef = useRef(null)

  // Initialize
  useEffect(() => {
    async function init() {
      // Load settings
      const goal = await getSetting('dailyGoal') || 20
      const level = await getSetting('levelStart') || 1
      setDailyGoal(goal)
      setLevelStart(level)

      // Import cards
      await importCards(jyutDict)

      // Load all cards
      const allCards = await getAllCards()
      setCards(allCards)
      setIsReady(true)

      // Load starred
      const starred = await getStarredCards()
      setStarredCards(starred)

      // Load today learned count
      const todayLearnedStr = await getSetting('todayLearned')
      const todayLearnedDate = await getSetting('todayLearnedDate')
      const today = new Date().toDateString()
      if (todayLearnedDate === today) {
        setTodayLearned(todayLearnedStr || 0)
      } else {
        setTodayLearned(0)
        await saveSetting('todayLearned', 0)
        await saveSetting('todayLearnedDate', today)
      }
    }
    init()
  }, [])

  // Pick next study card
  const pickNextStudyCard = useCallback(() => {
    if (!cards.length) return null
    
    // Get cards in the current level range (rank 1-9900 -> level 1-10)
    const levelMax = Math.min(levelStart + 1, 10)
    const levelCards = cards.filter(c => c.level >= levelStart && c.level <= levelMax && !c.nextReview)
    
    if (levelCards.length > 0) {
      // Pick a new card from current level
      const idx = Math.floor(Math.random() * Math.min(levelCards.length, 10))
      return levelCards[idx]
    }

    // If no new cards in level, find the one with lowest rank that hasn't been studied
    const unstudied = cards.filter(c => !c.nextReview).sort((a, b) => a.rank - b.rank)
    return unstudied.length > 0 ? unstudied[0] : null
  }, [cards, levelStart])

  // Start studying a new card
  const startStudy = useCallback(() => {
    const card = pickNextStudyCard()
    if (card) {
      setCurrentCard(card)
      setShowJyutping(false)
      setReviewMode(false)
    }
  }, [pickNextStudyCard])

  // Handle study response
  const handleStudy = async (quality) => {
    if (!currentCard) return

    const result = calcSM2(quality, {
      ease: currentCard.ease,
      interval: currentCard.interval,
      repetitions: currentCard.repetitions
    })

    const updatedCard = {
      ...currentCard,
      ...result,
      history: [...(currentCard.history || []), {
        date: new Date().toISOString(),
        quality,
        ease: result.ease
      }]
    }

    await saveCard(updatedCard)

    // Update today's count
    const newCount = todayLearned + 1
    setTodayLearned(newCount)
    await saveSetting('todayLearned', newCount)

    // Update cards
    const allCards = await getAllCards()
    setCards(allCards)

    // Pick next
    const next = pickNextStudyCard()
    if (next) {
      setCurrentCard(next)
      setShowJyutping(false)
    } else {
      setCurrentCard(null)
    }
  }

  // Start review session
  const startReview = useCallback(async () => {
    const allCards = await getAllCards()
    const due = allCards.filter(c => {
      if (!c.nextReview) return false
      return new Date(c.nextReview) <= new Date()
    }).sort((a, b) => new Date(a.nextReview) - new Date(b.nextReview))
    
    if (due.length > 0) {
      setReviewCards(due)
      setReviewIndex(0)
      setCurrentCard(due[0])
      setShowJyutping(false)
      setReviewMode(true)
    } else {
      setCurrentCard(null)
      setReviewMode(true)
    }
  }, [])

  // Handle review response
  const handleReview = async (quality) => {
    if (!currentCard) return

    const result = calcSM2(quality, {
      ease: currentCard.ease,
      interval: currentCard.interval,
      repetitions: currentCard.repetitions
    })

    const updatedCard = {
      ...currentCard,
      ...result,
      history: [...(currentCard.history || []), {
        date: new Date().toISOString(),
        quality,
        ease: result.ease
      }]
    }

    await saveCard(updatedCard)

    const nextIdx = reviewIndex + 1
    if (nextIdx < reviewCards.length) {
      setReviewIndex(nextIdx)
      setCurrentCard(reviewCards[nextIdx])
      setShowJyutping(false)
    } else {
      // Review done
      setCurrentCard(null)
      setReviewMode(false)
      const allCards = await getAllCards()
      setCards(allCards)
    }
  }

  // Toggle star
  const toggleStar = async () => {
    if (!currentCard) return
    const updated = { ...currentCard, starred: !currentCard.starred }
    await saveCard(updated)
    setCurrentCard(updated)
    const starred = await getStarredCards()
    setStarredCards(starred)
  }

  // TTS state
  const [ttsState, setTtsState] = useState({ supported: false, yue: false, zh: false, voices: 0 })
  const [ttsLang, setTtsLang] = useState('yue-HK')

  // Speak text using Web Speech API
  const speak = useCallback((text) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-HK'
    utterance.rate = 0.9
    window.speechSynthesis.speak(utterance)
  }, [])

  // Check TTS support
  useEffect(() => {
    const checkTTS = () => {
      const supported = 'speechSynthesis' in window
      if (!supported) {
        setTtsState({ supported: false, yue: false, zh: false, voices: 0 })
        return
      }
      
      const check = () => {
        const voices = speechSynthesis.getVoices()
        const hasYue = voices.some(v => v.lang.startsWith('yue') || v.lang.includes('HK'))
        const hasZh = voices.some(v => v.lang.startsWith('zh'))
        setTtsState({ supported: true, yue: hasYue, zh: hasZh, voices: voices.length })
        
        // Auto-detect best language
        if (hasYue) setTtsLang('yue-HK')
        else if (hasZh) setTtsLang('zh-HK')
        else setTtsLang('yue-HK')
      }
      
      // Voices might load async
      if (speechSynthesis.getVoices().length === 0) {
        speechSynthesis.addEventListener('voiceschanged', check, { once: true })
        // Fallback timeout
        setTimeout(check, 1000)
      } else {
        check()
      }
    }
    
    checkTTS()
  }, [])



  // Change level
  const changeLevel = async (lvl) => {
    setLevelStart(lvl)
    await saveSetting('levelStart', lvl)
  }

  // Change daily goal
  const changeGoal = async (g) => {
    setDailyGoal(g)
    await saveSetting('dailyGoal', g)
  }

  // Toggle star for corpus item
  const toggleStarCorpus = (item) => {
    setStarredCorpus(prev => {
      const exists = prev.find(i => i.text === item.text)
      if (exists) {
        return prev.filter(i => i.text !== item.text)
      } else {
        return [...prev, item]
      }
    })
  }

  // Check if corpus item is starred
  const isCorpusStarred = (item) => {
    return starredCorpus.some(i => i.text === item.text)
  }

  if (!isReady) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
        載入中...
      </div>
    )
  }

  const todayRemaining = Math.max(0, dailyGoal - todayLearned)

  // Stats
  const totalStudied = cards.filter(c => c.nextReview).length
  const dueCount = cards.filter(c => c.nextReview && new Date(c.nextReview) <= new Date()).length
  const masteredCount = cards.filter(c => c.repetitions >= 5).length

  return (
    <>
      {/* Tab Bar */}
      <div className="tab-bar">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => {
              setTab(t.id)
              if (t.id === 'review') startReview()
              if (t.id === 'star') getStarredCards().then(setStarredCards)
            }}
          >
            <span className="icon">{t.icon}</span>
            {t.label}
            {t.id === 'review' && dueCount > 0 && (
              <span className="badge">{dueCount > 99 ? '99+' : dueCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="content">
        {/* STUDY TAB */}
        {tab === 'study' && (
          <>
            {/* Stats */}
            <div className="stats-row">
              <div className="stat-item">
                <div className="num">{totalStudied}</div>
                <div className="label">已學</div>
              </div>
              <div className="stat-item">
                <div className="num">{todayLearned}</div>
                <div className="label">今日</div>
              </div>
              <div className="stat-item">
                <div className="num">{todayRemaining}</div>
                <div className="label">剩餘</div>
              </div>
              <div className="stat-item">
                <div className="num">{masteredCount}</div>
                <div className="label">熟練</div>
              </div>
            </div>

            {/* Progress */}
            <div className="progress-bar">
              <div className="fill" style={{ width: `${Math.min(100, (todayLearned / dailyGoal) * 100)}%` }} />
            </div>
            <div className="progress-text">
              今日進度 {todayLearned}/{dailyGoal}
            </div>

            {/* Study Card */}
            {currentCard ? (
              <div className="study-card">
                <div className="level-badge">LEVEL {currentCard.level}</div>
                <div className="character">{currentCard.char}</div>
                <div className={`jyutping ${!showJyutping ? 'hidden' : ''}`}>
                  {showJyutping ? currentCard.jyutping : '點擊顯示粵拼'}
                </div>
                {!showJyutping && (
                  <div className="hint">點擊中間揭曉答案</div>
                )}
                
                <div className="action-row">
                  <button className="action-btn outline" onClick={() => speak(currentCard.char)}>
                    🔊 聽
                  </button>
                  <button 
                    className="action-btn outline" 
                    onClick={toggleStar}
                  >
                    {currentCard.starred ? '⭐' : '☆'}
                  </button>
                </div>

                {!showJyutping ? (
                  <div className="action-row">
                    <button className="action-btn primary" onClick={() => setShowJyutping(true)}>
                      👀 顯示粵拼
                    </button>
                  </div>
                ) : (
                  <div className="action-row">
                    <button className="action-btn warning" onClick={() => handleStudy(0)}>
                      ❌ 忘記了
                    </button>
                    <button className="action-btn secondary" onClick={() => handleStudy(2)}>
                      ✓ 記住了
                    </button>
                    <button className="action-btn success" onClick={() => handleStudy(3)}>
                      🎯 好簡單
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="study-card">
                <div className="level-badge">今日已完成 🎉</div>
                <div style={{ fontSize: '48px', margin: '20px 0' }}>🌟</div>
                <div className="hint">
                  {todayLearned >= dailyGoal 
                    ? '今日目標已達成！去複習或者加量繼續吧～' 
                    : '暫無新字，試試增加每日目標或調整等級'}
                </div>
                {todayLearned >= dailyGoal && dueCount > 0 && (
                  <div className="action-row">
                    <button className="action-btn primary" onClick={() => { setTab('review'); startReview() }}>
                      🔄 還有 {dueCount} 個待複習
                    </button>
                  </div>
                )}
              </div>
            )}

            {!currentCard && (
              <div className="action-row">
                <button className="action-btn primary" onClick={() => startStudy()}>
                  開始學習新字
                </button>
              </div>
            )}
          </>
        )}

        {/* REVIEW TAB */}
        {tab === 'review' && (
          <>
            <div className="section-title">待複習字詞</div>
            
            {reviewCards.length > 0 && currentCard ? (
              <div className="study-card">
                <div className="level-badge">
                  複習 {reviewIndex + 1}/{reviewCards.length}
                </div>
                <div className="character">{currentCard.char}</div>
                <div className={`jyutping ${!showJyutping ? 'hidden' : ''}`}>
                  {showJyutping ? currentCard.jyutping : '顯示粵拼'}
                </div>

                <div className="action-row">
                  <button className="action-btn outline" onClick={() => speak(currentCard.char)}>
                    🔊 聽
                  </button>
                  <button className="action-btn outline" onClick={toggleStar}>
                    {currentCard.starred ? '⭐' : '☆'}
                  </button>
                </div>

                {!showJyutping ? (
                  <div className="action-row">
                    <button className="action-btn primary" onClick={() => setShowJyutping(true)}>
                      👀 顯示粵拼
                    </button>
                  </div>
                ) : (
                  <div className="action-row">
                    <button className="action-btn warning" onClick={() => handleReview(0)}>
                      ❌ 忘記了
                    </button>
                    <button className="action-btn secondary" onClick={() => handleReview(1)}>
                      🤔 模糊
                    </button>
                    <button className="action-btn success" onClick={() => handleReview(2)}>
                      ✓ 記得
                    </button>
                    <button className="action-btn success" onClick={() => handleReview(3)}>
                      🎯 好熟
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="study-card">
                <div style={{ fontSize: '48px', margin: '20px 0' }}>✅</div>
                <div className="hint">暫無待複習的字詞，繼續學新字吧！</div>
              </div>
            )}
          </>
        )}

        {/* CORPUS TAB */}
        {tab === 'corpus' && (
          <>
            <div className="section-title">常用語料</div>

            {/* Filter buttons */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {['all', 'phrase', 'word'].map(f => (
                <button
                  key={f}
                  className={`action-btn ${corpusFilter === f ? 'primary' : 'secondary'}`}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                  onClick={() => setCorpusFilter(f)}
                >
                  {f === 'all' ? '全部' : f === 'phrase' ? '短句' : '詞語'}
                </button>
              ))}
            </div>

            {/* Corpus list */}
            <div className="word-list">
              {corpusData
                .filter(item => corpusFilter === 'all' || item.type === corpusFilter)
                .map((item, idx) => (
                  <div key={idx} className="word-item">
                    <div style={{ flex: 1 }}>
                      <div className="char">{item.text}</div>
                      <div className="jp">{item.jyutping}</div>
                      {item.translation && (
                        <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>
                          {item.translation}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        className="action-btn outline"
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                        onClick={() => speak(item.text)}
                      >
                        🔊
                      </button>
                      <button
                        className="action-btn outline"
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                        onClick={() => toggleStarCorpus(item)}
                      >
                        {isCorpusStarred(item) ? '⭐' : '☆'}
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}

        {/* STAR TAB */}
        {tab === 'star' && (
          <>
            <div className="section-title">生詞本</div>

            {/* Starred corpus items */}
            {starredCorpus.length > 0 && (
              <>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '8px' }}>語料</div>
                <div className="word-list">
                  {starredCorpus.map(item => (
                    <div key={`corpus-${item.text}`} className="word-item">
                      <div style={{ flex: 1 }}>
                        <div className="char">{item.text}</div>
                        <div className="jp">{item.jyutping}</div>
                      </div>
                      <button
                        className="action-btn outline"
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                        onClick={() => speak(item.text)}
                      >
                        🔊
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Starred cards */}
            {starredCards.length > 0 ? (
              <>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '8px', marginTop: starredCorpus.length > 0 ? '16px' : '0' }}>漢字</div>
                <div className="word-list">
                  {starredCards.map(c => (
                    <div key={c.char} className="word-item" onClick={() => speak(c.char)}>
                      <div>
                        <div className="char">{c.char}</div>
                        <div className="jp">{c.jyutping}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : starredCorpus.length === 0 ? (
              <div className="study-card">
                <div style={{ fontSize: '36px', margin: '16px 0' }}>📌</div>
                <div className="hint">尚未標記任何生詞</div>
                <div className="hint" style={{ marginTop: '8px' }}>
                  學習或語料庫中點擊 ☆ 即可加入生詞本
                </div>
              </div>
            ) : null}
          </>
        )}

        {/* SETTINGS TAB */}
        {tab === 'settings' && (
          <>
            <div className="setting-group">
              <h3>學習設定</h3>
              
              <div className="setting-row">
                <label>每日學習目標</label>
                <div className="slider-wrap">
                  <span className="value">{dailyGoal} 字</span>
                  <input 
                    type="range" 
                    min="5" 
                    max="100" 
                    step="5"
                    value={dailyGoal}
                    onChange={(e) => changeGoal(parseInt(e.target.value))}
                  />
                </div>
              </div>

              <div className="setting-row">
                <label>起始等級</label>
                <div className="slider-wrap">
                  <button 
                    className="action-btn secondary" 
                    style={{ flex: 0, padding: '6px 16px', fontSize: '13px' }}
                    onClick={() => changeLevel(Math.max(1, levelStart - 1))}
                  >◀</button>
                  <span className="value" style={{ width: '40px', textAlign: 'center' }}>
                    Lv.{levelStart}
                  </span>
                  <button 
                    className="action-btn secondary"
                    style={{ flex: 0, padding: '6px 16px', fontSize: '13px' }}
                    onClick={() => changeLevel(Math.min(5, levelStart + 1))}
                  >▶</button>
                </div>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '8px', lineHeight: 1.6 }}>
                Lv.1-2: 最常用2000字 (日常90%)<br />
                Lv.3-5: 常用3000字 (日常98%)<br />
                Lv.6-10: 進階4900字
              </div>
            </div>

            <div className="setting-group">
              <h3>統計</h3>
              <div className="setting-row">
                <label>累積學習</label>
                <span className="value">{totalStudied} 字</span>
              </div>
              <div className="setting-row">
                <label>熟練掌握</label>
                <span className="value">{masteredCount} 字</span>
              </div>
              <div className="setting-row">
                <label>待複習</label>
                <span className="value">{dueCount} 字</span>
              </div>
              <div className="setting-row">
                <label>總詞庫</label>
                <span className="value">{cards.length} 字</span>
              </div>
              <div className="setting-row">
                <label>生詞本</label>
                <span className="value">{starredCards.length} 個</span>
              </div>
            </div>

            <div className="setting-group">
              <h3>關於</h3>
              <div className="setting-row">
                <label style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                  粵讀 JyutRead v1.0<br />
                  基於LSHK粵拼表 + SM-2間隔重複算法<br />
                  數據來自香港語言學學會粵拼表
                </label>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Hidden TTS element */}
      <div ref={ttsRef} style={{ display: 'none' }} />
    </>
  )
}
