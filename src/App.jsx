import { useState, useEffect, useCallback, useRef } from 'react'
import { getAllCards, getDueCards, saveCard, importCards, getSetting, saveSetting, getStarredCards } from './db'
import { calcSM2 } from './sm2'
import jyutDict from './data/jyutping_dict.json'

const TABS = [
  { id: 'study', label: '學習', icon: '📖' },
  { id: 'review', label: '複習', icon: '🔄' },
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
    
    // Get cards in the current level range
    const levelMax = Math.min(levelStart + 1, 5)
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

  // Unified audio player that handles Android Chrome restrictions
  const [audioCtx, setAudioCtx] = useState(null)
  
  // Initialize AudioContext on first user interaction
  const ensureAudio = useCallback(async () => {
    if (!audioCtx || audioCtx.state === 'closed') {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      setAudioCtx(ctx)
      if (ctx.state === 'suspended') await ctx.resume()
      return ctx
    }
    if (audioCtx.state === 'suspended') await audioCtx.resume()
    return audioCtx
  }, [audioCtx])

  // Play audio URL with Android Chrome workaround
  const playAudio = useCallback(async (url) => {
    // Try direct Audio element first (works on desktop)
    const audio = new Audio(url)
    audio.setAttribute('playsinline', '')
    audio.setAttribute('webkit-playsinline', '')
    
    try {
      await audio.play()
      return
    } catch (e) {
      if (e.name !== 'NotAllowedError') throw e
    }
    
    // Android Chrome workaround: use AudioContext to unlock
    const ctx = await ensureAudio()
    // Create a silent buffer to "consume" the user gesture
    const buffer = ctx.createBuffer(1, 1, 22050)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(0)
    
    // Now try playing again
    const audio2 = new Audio(url)
    audio2.setAttribute('playsinline', '')
    audio2.setAttribute('webkit-playsinline', '')
    await audio2.play()
  }, [ensureAudio])

  // TTS speak — browser-native Edge TTS via WebSocket (no server needed!)
  // Uses Microsoft Edge's free TTS service directly from the browser
  const speak = async (text) => {
    // Try Edge TTS via browser WebSocket (works on mobile Chrome)
    try {
      await playEdgeTTS(text)
      return
    } catch (e) {
      console.log('Edge TTS WebSocket failed, trying alternatives...', e)
    }
    
    // Fallback: local TTS server
    try {
      const url = `http://${window.location.hostname}:9876/tts?text=${encodeURIComponent(text)}`
      await playAudio(url)
      return
    } catch (e) {}
    
    // Last resort: Google TTS
    try {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=yue&client=tw-ob&ttsspeed=0.9`
      await playAudio(url)
      return
    } catch (e) {}
    
    // Absolute last resort: browser native TTS
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'yue-HK'
      u.rate = 0.85
      window.speechSynthesis.speak(u)
    }
  }

  // Edge TTS browser-native implementation
  // Connects directly to Microsoft's Edge TTS WebSocket
  function playEdgeTTS(text) {
    return new Promise((resolve, reject) => {
      try {
        const token = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
        const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${token}&ConnectionId=${crypto.randomUUID().replace(/-/g, '')}`
        
        const ws = new WebSocket(wsUrl)
        const audioChunks = []
        
        ws.onopen = () => {
          // Send speech config
          const config = JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
                  outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
                }
              }
            }
          })
          ws.send(`X-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${config}`)
          
          // Send SSML
          const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-HK'><voice name='zh-HK-HiuMaanNeural'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`
          ws.send(`X-RequestId:${crypto.randomUUID().replace(/-/g, '')}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toISOString()}Z\r\nPath:ssml\r\n\r\n${ssml}`)
        }
        
        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            // Binary audio data
            const data = new Uint8Array(event.data)
            const separator = 'Path:audio\r\n'
            const sepBytes = new TextEncoder().encode(separator)
            
            // Find separator in binary data
            let idx = -1
            for (let i = 0; i < data.length - sepBytes.length; i++) {
              let match = true
              for (let j = 0; j < sepBytes.length; j++) {
                if (data[i + j] !== sepBytes[j]) { match = false; break }
              }
              if (match) { idx = i + sepBytes.length; break }
            }
            
            if (idx >= 0) {
              audioChunks.push(data.slice(idx))
            }
          } else if (typeof event.data === 'string') {
            if (event.data.includes('turn.end')) {
              ws.close()
              // Play the audio
              if (audioChunks.length > 0) {
                const totalLen = audioChunks.reduce((s, c) => s + c.length, 0)
                const combined = new Uint8Array(totalLen)
                let offset = 0
                for (const chunk of audioChunks) {
                  combined.set(chunk, offset)
                  offset += chunk.length
                }
                const blob = new Blob([combined], { type: 'audio/mpeg' })
                const url = URL.createObjectURL(blob)
                playAudio(url).then(() => {
                  URL.revokeObjectURL(url)
                  resolve()
                }).catch(() => {
                  URL.revokeObjectURL(url)
                  reject(new Error('Audio playback failed'))
                })
              } else {
                reject(new Error('No audio data received'))
              }
            }
          }
        }
        
        ws.onerror = (e) => {
          reject(new Error('WebSocket connection failed'))
        }
        
        ws.onclose = (e) => {
          if (audioChunks.length === 0 && e.code !== 1000) {
            reject(new Error(`WebSocket closed: ${e.code}`))
          }
        }
        
        // Timeout after 10s
        setTimeout(() => {
          if (audioChunks.length === 0) {
            ws.close()
            reject(new Error('Edge TTS timeout'))
          }
        }, 10000)
      } catch (e) {
        reject(e)
      }
    })
  }

  function escapeXml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

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

        {/* STAR TAB */}
        {tab === 'star' && (
          <>
            <div className="section-title">生詞本</div>
            {starredCards.length > 0 ? (
              <div className="word-list">
                {starredCards.map(c => (
                  <div key={c.char} className="word-item" onClick={() => speak(c.char)}>
                    <div>
                      <div className="char">{c.char}</div>
                      <div className="jp">{c.jyutping}</div>
                    </div>
                    <div className="meta">
                      Level {c.level}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="study-card">
                <div style={{ fontSize: '36px', margin: '16px 0' }}>📌</div>
                <div className="hint">尚未標記任何生詞</div>
                <div className="hint" style={{ marginTop: '8px' }}>
                  學習時點擊 ☆ 即可加入生詞本
                </div>
              </div>
            )}
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
                Lv.1: 最常用1000字 (日常90%)<br />
                Lv.2: 常用1000字 (日常98%)<br />
                Lv.3-5: 進階3000字
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
              <h3>語音提示</h3>
              <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                <label style={{ fontSize: '13px', lineHeight: 1.6 }}>
                  📢 粵讀使用 Google TTS 提供粵語發音。<br /><br />
                  ✅ <strong>推薦使用 Chrome 瀏覽器</strong> — 粵語發音最佳<br />
                  ❌ 部分瀏覽器（如微信內置瀏覽器）可能唔支援<br /><br />
                  如果用 Chrome 仲係冇聲，試下：<br />
                  ① 確保網絡可以訪問 Google<br />
                  ② 或者用美依嘅本地TTS服務器（同Wi-Fi下自動連接）
                </label>
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
