import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Deck, Flashcard, SessionMode, User, StudentProgress } from '../types';
import { playTextToSpeech } from '../services/audio';

interface StudySessionProps {
  deck: Deck;
  user: User;
  allProgress: StudentProgress[];
  onClose: (stats?: { progress: number, mastered: number, total: number, memoryTime?: number }) => void;
}

interface DragState {
  x: number;
  y: number;
  isDragging: boolean;
}

const SWIPE_THRESHOLD = 80;
const TAP_THRESHOLD = 10;
const MEMORY_PAIR_COUNT = 6;
const MEMORY_PERFECT_CLICKS = 12; // 6 pairs * 2 clicks

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

const StudySession: React.FC<StudySessionProps> = ({ deck, user, allProgress, onClose }) => {
  const [mode, setMode] = useState<SessionMode | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [animationClass, setAnimationClass] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  
  const [drag, setDrag] = useState<DragState>({ x: 0, y: 0, isDragging: false });
  const touchStartPos = useRef<{ x: number, y: number } | null>(null);

  // Memory Game State
  const [memoryCards, setMemoryCards] = useState<{id: string, content: string, type: 'front'|'back', isFlipped: boolean, isMatched: boolean}[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [timer, setTimer] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [memoryClickCount, setMemoryClickCount] = useState(0);
  const timerRef = useRef<number | null>(null);
  
  // Listening Game State
  const [listeningOptions, setListeningOptions] = useState<string[]>([]);
  const [listeningFeedback, setListeningFeedback] = useState<'correct' | 'wrong' | null>(null);

  useEffect(() => {
    const shuffled = [...deck.cards].sort(() => Math.random() - 0.5);
    setCards(shuffled.map(c => ({ ...c, masteryScore: 0 })));
  }, [deck]);

  useEffect(() => {
    if (isTimerActive) {
      const start = performance.now();
      timerRef.current = window.setInterval(() => {
        setTimer((performance.now() - start) / 1000);
      }, 50);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isTimerActive]);

  const currentCard = cards[currentIndex];

  const selectNextCard = useCallback((updatedCards: Flashcard[]) => {
    const nextIdx = updatedCards.findIndex((c, i) => i > currentIndex && c.masteryScore < 5);
    
    setTimeout(() => {
      setIsResetting(true);
      if (nextIdx === -1) {
        const wrapIdx = updatedCards.findIndex(c => c.masteryScore < 5);
        if (wrapIdx === -1) setShowStats(true);
        else { setCurrentIndex(wrapIdx); setIsFlipped(false); }
      } else {
        setCurrentIndex(nextIdx);
        setIsFlipped(false);
      }
      setAnimationClass('');
      setDrag({ x: 0, y: 0, isDragging: false });
      setTimeout(() => setIsResetting(false), 50);
    }, 300);
  }, [currentIndex]);

  const handleGrade = useCallback((scoreChange: number, isMastered: boolean = false) => {
    if (animationClass) return;

    if (isMastered) setAnimationClass('anim-fly-up');
    else if (scoreChange > 0) setAnimationClass('anim-fly-left');
    else setAnimationClass('anim-fly-right');

    const updated = cards.map((c, i) => 
      i === currentIndex ? { ...c, masteryScore: isMastered ? 5 : Math.min(5, Math.max(-1, c.masteryScore + scoreChange)) } : c
    );
    
    setCards(updated);
    setHistoryCount(h => h + 1);
    
    if (scoreChange > 0 || isMastered) setStreak(s => s + 1);
    else setStreak(0);

    selectNextCard(updated);
  }, [cards, currentIndex, selectNextCard, animationClass]);

  const onTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (mode !== SessionMode.FLASHCARD || showStats || animationClass) return;
    
    // Check if the click target is the speaker button to avoid flipping
    if ((e.target as HTMLElement).closest('.speaker-btn')) return;

    const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
    touchStartPos.current = { x: clientX, y: clientY };
  };

  const onTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!touchStartPos.current || mode !== SessionMode.FLASHCARD) return;
    const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
    const dx = clientX - touchStartPos.current.x;
    const dy = clientY - touchStartPos.current.y;
    if (Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD) {
      setDrag({ x: dx, y: dy, isDragging: true });
    }
  };

  const onTouchEnd = (e: React.TouchEvent | React.MouseEvent) => {
    if (!touchStartPos.current || mode !== SessionMode.FLASHCARD) return;
    const { x, y, isDragging } = drag;
    const absX = Math.abs(x);
    const absY = Math.abs(y);

    if (!isDragging) {
      const nextFlipState = !isFlipped;
      setIsFlipped(nextFlipState);
      if (!nextFlipState) playTextToSpeech(currentCard.front);
    } else if (absY > absX && y < -SWIPE_THRESHOLD) {
      handleGrade(0, true);
    } else if (absX > absY && x < -SWIPE_THRESHOLD) {
      handleGrade(1);
    } else if (absX > absY && x > SWIPE_THRESHOLD) {
      handleGrade(-1);
    }

    setDrag({ x: 0, y: 0, isDragging: false });
    touchStartPos.current = null;
  };

  const handleSpeakerClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (currentCard) {
      playTextToSpeech(currentCard.front);
    }
  };

  const startMemoryGame = () => {
    const selected = [...deck.cards].sort(() => Math.random() - 0.5).slice(0, MEMORY_PAIR_COUNT);
    const pairs = [
      ...selected.map(c => ({ id: c.id, content: c.front, type: 'front' as const, isFlipped: false, isMatched: false })),
      ...selected.map(c => ({ id: c.id, content: c.back, type: 'back' as const, isFlipped: false, isMatched: false }))
    ].sort(() => Math.random() - 0.5);
    setMemoryCards(pairs);
    setMode(SessionMode.MEMORY);
    setTimer(0);
    setMemoryClickCount(0);
    setIsTimerActive(false);
  };

  const handleMemoryClick = (index: number) => {
    if (selectedIndices.length === 2 || memoryCards[index].isFlipped || memoryCards[index].isMatched) return;

    if (!isTimerActive) setIsTimerActive(true);
    setMemoryClickCount(prev => prev + 1);

    const newCards = [...memoryCards];
    newCards[index].isFlipped = true;
    setMemoryCards(newCards);

    const newSelected = [...selectedIndices, index];
    setSelectedIndices(newSelected);

    if (newSelected.length === 2) {
      const [first, second] = newSelected;
      if (memoryCards[first].id === memoryCards[second].id && memoryCards[first].type !== memoryCards[second].type) {
        setTimeout(() => {
          const matchedCards = [...newCards];
          matchedCards[first].isMatched = true;
          matchedCards[second].isMatched = true;
          setMemoryCards(matchedCards);
          setSelectedIndices([]);
          if (matchedCards.every(c => c.isMatched)) {
            setIsTimerActive(false);
            setShowStats(true);
          }
        }, 600);
      } else {
        setTimeout(() => {
          const resetCards = [...newCards];
          resetCards[first].isFlipped = false;
          resetCards[second].isFlipped = false;
          setMemoryCards(resetCards);
          setSelectedIndices([]);
        }, 800);
      }
    }
  };

  const startListeningGame = () => {
    setMode(SessionMode.LISTENING);
    setupListeningTurn(0);
  };

  const setupListeningTurn = (idx: number) => {
    const correct = cards[idx];
    const others = cards.filter(c => c.id !== correct.id).sort(() => Math.random() - 0.5).slice(0, 3);
    const options = [correct.back, ...others.map(o => o.back)].sort(() => Math.random() - 0.5);
    setListeningOptions(options);
    setListeningFeedback(null);
    playTextToSpeech(correct.front);
  };

  const handleListeningAnswer = (answer: string) => {
    if (listeningFeedback) return;
    const isCorrect = answer === cards[currentIndex].back;
    setListeningFeedback(isCorrect ? 'correct' : 'wrong');
    
    // IMMUTABLE UPDATE: Mark card as mastered if correct so the progress bar updates
    const updated = cards.map((c, i) => 
      i === currentIndex ? { ...c, masteryScore: isCorrect ? 5 : 0 } : c
    );
    setCards(updated);
    setHistoryCount(h => h + 1);
    if (isCorrect) setStreak(s => s + 1);
    else setStreak(0);

    setTimeout(() => {
      if (currentIndex + 1 >= cards.length) setShowStats(true);
      else {
        const next = currentIndex + 1;
        setCurrentIndex(next);
        setupListeningTurn(next);
      }
    }, 1200);
  };

  const stats = useMemo(() => {
    const mastered = cards.filter(c => c.masteryScore >= 5).length;
    let progressValue = cards.length > 0 ? Math.round((mastered / cards.length) * 100) : 0;
    
    if (mode === SessionMode.MEMORY) {
      progressValue = memoryClickCount > 0 ? Math.min(100, Math.round((MEMORY_PERFECT_CLICKS / memoryClickCount) * 100)) : 0;
    }

    return { 
      mastered, total: cards.length, progress: progressValue, 
      memoryTime: mode === SessionMode.MEMORY ? timer : undefined 
    };
  }, [cards, mode, timer, memoryClickCount]);

  const leaderboardData = useMemo(() => {
    if (mode !== SessionMode.MEMORY) return null;
    const deckRecords = allProgress.filter(p => p.deckName === deck.name && p.memoryTime);
    const myRecords = deckRecords.filter(p => p.username === user.username);
    const pb = myRecords.length > 0 ? Math.min(...myRecords.map(r => r.memoryTime!)) : null;
    const isNewPB = pb ? timer < pb : true;
    const userBestTimes: Record<string, number> = {};
    deckRecords.forEach(r => {
      if (!userBestTimes[r.username] || r.memoryTime! < userBestTimes[r.username]) {
        userBestTimes[r.username] = r.memoryTime!;
      }
    });
    const top3 = Object.entries(userBestTimes)
      .map(([username, time]) => ({ username, time }))
      .sort((a, b) => a.time - b.time).slice(0, 3);
    return { pb, top3, isNewPB };
  }, [allProgress, deck.name, mode, user.username, timer]);

  const cardStyle = {
    transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 10}deg) rotateY(${isFlipped ? 180 : 0}deg)`,
    transition: `transform ${isResetting || drag.isDragging ? '0s' : '0.4s'} cubic-bezier(0.34, 1.56, 0.64, 1)`
  };

  if (!mode) {
    return (
      <div className="max-w-4xl mx-auto py-10 px-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-black text-white italic tracking-tighter mb-2 uppercase">SELECT MODE</h2>
          <p className="text-jec-yellow text-xs font-bold tracking-widest uppercase">トレーニングモードを選択してください</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <button onClick={() => setMode(SessionMode.FLASHCARD)} className="group bg-zinc-900 border border-white/5 p-10 rounded-[2.5rem] hover:border-jec-green transition-all text-center flex flex-col items-center shadow-xl">
            <div className="w-20 h-20 bg-jec-green/10 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"><i className="fas fa-clone text-jec-green text-3xl"></i></div>
            <h3 className="text-white font-black text-xl mb-2">単語カード</h3>
            <p className="text-zinc-500 text-xs font-bold">直感的なスワイプ学習</p>
          </button>
          <button onClick={startMemoryGame} className="group bg-zinc-900 border border-white/5 p-10 rounded-[2.5rem] hover:border-jec-yellow transition-all text-center flex flex-col items-center shadow-xl">
            <div className="w-20 h-20 bg-jec-yellow/10 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"><i className="fas fa-brain text-jec-yellow text-3xl"></i></div>
            <h3 className="text-white font-black text-xl mb-2">神経衰弱</h3>
            <p className="text-zinc-500 text-xs font-bold">遊びながら記憶を定着</p>
          </button>
          <button onClick={startListeningGame} className="group bg-zinc-900 border border-white/5 p-10 rounded-[2.5rem] hover:border-jec-orange transition-all text-center flex flex-col items-center shadow-xl">
            <div className="w-20 h-20 bg-jec-orange/10 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"><i className="fas fa-headphones text-jec-orange text-3xl"></i></div>
            <h3 className="text-white font-black text-xl mb-2">リスニング</h3>
            <p className="text-zinc-500 text-xs font-bold">AI音声で発音をマスター</p>
          </button>
        </div>
      </div>
    );
  }

  if (showStats) {
    return (
      <div className="max-w-xl mx-auto text-center space-y-6 animate-in fade-in zoom-in duration-500">
        <div className="bg-white dark:bg-zinc-900 p-10 rounded-[3rem] shadow-2xl border border-gray-100 dark:border-white/10 overflow-hidden relative">
          {mode === SessionMode.MEMORY && leaderboardData?.isNewPB && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-jec-yellow via-jec-orange to-jec-yellow animate-pulse"></div>}
          <div className="w-20 h-20 bg-jec-yellow text-black rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-3xl shadow-lg rotate-6"><i className="fas fa-flag-checkered"></i></div>
          <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter uppercase italic">トレーニング完了</h2>
          <div className="grid grid-cols-2 gap-4 mt-8">
            <div className="p-6 bg-gray-50 dark:bg-black rounded-[2rem] border border-transparent dark:border-white/5">
              <span className="block text-3xl font-black text-jec-orange italic">{mode === SessionMode.MEMORY ? formatTime(timer) : historyCount}</span>
              <span className="text-[9px] text-gray-400 uppercase font-black tracking-widest mt-1">{mode === SessionMode.MEMORY ? 'FINISH TIME' : '回答数'}</span>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-black rounded-[2rem] border border-transparent dark:border-white/5">
              <span className="block text-3xl font-black text-jec-green italic">{stats.progress}%</span>
              <span className="text-[9px] text-gray-400 uppercase font-black tracking-widest mt-1">{mode === SessionMode.MEMORY ? '正解率 (効率)' : '習得率'}</span>
            </div>
          </div>
          {mode === SessionMode.MEMORY && (
            <div className="mt-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">クリック数: <span className="text-gray-900 dark:text-white text-sm">{memoryClickCount}</span> <span className="ml-2 opacity-50">(最短: 12)</span></div>
          )}
          {mode === SessionMode.MEMORY && leaderboardData && (
            <div className="mt-8 space-y-6 text-left">
              <div className="p-4 bg-jec-yellow/5 border border-jec-yellow/20 rounded-2xl flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-jec-yellow tracking-widest">PERSONAL BEST</span>
                <span className="text-white font-black italic text-xl">{leaderboardData.pb && !leaderboardData.isNewPB ? formatTime(leaderboardData.pb) : formatTime(timer)}</span>
              </div>
              <div className="bg-black/30 p-6 rounded-[2.5rem] border border-white/5">
                <h4 className="text-[10px] font-black uppercase text-gray-500 tracking-[0.3em] mb-4 text-center">TOP 3 HALL OF FAME</h4>
                <div className="space-y-2">
                  {leaderboardData.top3.map((entry, i) => (
                    <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${entry.username === user.username ? 'bg-jec-yellow/10 border-jec-yellow/30' : 'bg-white/5 border-white/5'}`}>
                      <div className="flex items-center gap-3"><span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${i === 0 ? 'bg-jec-yellow text-black' : i === 1 ? 'bg-gray-400 text-black' : 'bg-jec-orange text-white'}`}>{i + 1}</span><span className="text-xs font-black text-gray-300">@{entry.username}</span></div>
                      <span className="text-xs font-black text-white italic">{formatTime(entry.time)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <button onClick={() => onClose(stats)} className="w-full mt-8 bg-black dark:bg-jec-orange text-white dark:text-black font-black py-5 rounded-2xl text-lg uppercase tracking-tighter shadow-xl active:scale-95 transition-all">ダッシュボードへ戻る</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4">
      <div className="flex items-center justify-between mb-8">
        <button onClick={() => onClose()} className="w-12 h-12 flex items-center justify-center bg-zinc-900 rounded-2xl text-zinc-500 hover:text-jec-orange transition-colors border border-white/5"><i className="fas fa-times"></i></button>
        <div className="flex-grow mx-8 flex flex-col items-center">
          {mode === SessionMode.MEMORY ? (
            <div className="text-center"><span className="text-[10px] font-black uppercase text-jec-yellow tracking-[0.4em]">TIME ELAPSED</span><div className="text-2xl font-black text-white italic tracking-tighter mt-1">{formatTime(timer)}</div></div>
          ) : (
            <div className="w-full">
              <div className="flex justify-between text-[10px] text-gray-400 font-black uppercase mb-2 tracking-widest"><span>Progress</span><span className="text-jec-yellow">{stats.progress}%</span></div>
              <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5"><div className="h-full bg-gradient-to-r from-jec-green to-jec-yellow transition-all duration-1000 ease-out rounded-full" style={{ width: `${stats.progress}%` }}></div></div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {mode === SessionMode.MEMORY && <div className="text-[10px] font-black text-zinc-500 uppercase">Clicks: {memoryClickCount}</div>}
          <div className="bg-black dark:bg-jec-yellow dark:text-black px-4 py-2 rounded-2xl font-black italic text-sm shadow-lg">{currentIndex + 1} / {cards.length}</div>
        </div>
      </div>

      {mode === SessionMode.FLASHCARD && (
        <div className="max-w-2xl mx-auto">
          <div className={`relative h-[480px] perspective-1000 mb-10 select-none touch-none ${animationClass}`}
            onMouseDown={onTouchStart} onMouseMove={onTouchMove} onMouseUp={onTouchEnd} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
            <div className="flip-card-inner preserve-3d shadow-2xl rounded-[3rem] h-full w-full relative" style={cardStyle}>
              <div className="flip-card-front absolute inset-0 backface-hidden bg-white dark:bg-zinc-900 rounded-[3rem] border-2 border-gray-50 dark:border-white/10 p-10 flex flex-col items-center justify-center text-center preserve-3d">
                <span className="absolute top-8 left-1/2 -translate-x-1/2 text-[10px] font-black text-gray-300 dark:text-zinc-800 uppercase tracking-[0.4em] italic">表面 (ENGLISH)</span>
                
                <h3 className="text-5xl md:text-6xl font-black text-gray-900 dark:text-white tracking-tighter leading-tight italic">{currentCard?.front}</h3>
                
                <button 
                  onClick={handleSpeakerClick}
                  className="speaker-btn absolute bottom-10 right-10 w-14 h-14 bg-jec-yellow/10 dark:bg-white/5 rounded-full flex items-center justify-center text-jec-yellow hover:scale-110 active:scale-90 transition-all border border-jec-yellow/20"
                >
                  <i className="fas fa-volume-up text-xl"></i>
                </button>
              </div>
              <div className="flip-card-back absolute inset-0 backface-hidden bg-black text-white rounded-[3rem] p-10 flex flex-col items-center justify-center text-center shadow-inner border-4 border-jec-yellow preserve-3d" style={{ transform: 'rotateY(180deg)' }}>
                <span className="absolute top-8 left-1/2 -translate-x-1/2 text-[10px] font-black text-jec-yellow uppercase tracking-[0.4em] italic">裏面 (JAPANESE)</span>
                <h3 className="text-5xl md:text-6xl font-black text-white tracking-tighter leading-tight italic">{currentCard?.back}</h3>

                <button 
                  onClick={handleSpeakerClick}
                  className="speaker-btn absolute bottom-10 right-10 w-14 h-14 bg-white/10 rounded-full flex items-center justify-center text-jec-yellow hover:scale-110 active:scale-90 transition-all border border-white/10"
                >
                  <i className="fas fa-volume-up text-xl"></i>
                </button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <button onClick={() => handleGrade(-1)} className="bg-zinc-900 text-jec-orange py-6 rounded-[2rem] font-black uppercase tracking-widest hover:bg-jec-orange hover:text-white transition-all border border-white/5"><i className="fas fa-times mr-2"></i> 苦手</button>
            <button onClick={() => handleGrade(1)} className="bg-zinc-900 text-jec-green py-6 rounded-[2rem] font-black uppercase tracking-widest hover:bg-jec-green hover:text-black transition-all border border-white/5"><i className="fas fa-check mr-2"></i> 正解</button>
            <button onClick={() => handleGrade(0, true)} className="bg-jec-yellow text-black py-6 rounded-[2rem] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-all"><i className="fas fa-star mr-2"></i> 習得</button>
          </div>
        </div>
      )}

      {mode === SessionMode.MEMORY && (
        <div className="grid grid-cols-3 md:grid-cols-4 gap-4 animate-in fade-in zoom-in duration-500">
          {memoryCards.map((card, i) => (
            <div key={i} onClick={() => handleMemoryClick(i)} className={`h-32 rounded-2xl cursor-pointer transition-all duration-300 ${card.isMatched ? 'opacity-0 scale-90 pointer-events-none' : ''}`}>
              <div className={`relative w-full h-full transition-transform duration-500 preserve-3d ${card.isFlipped ? 'rotate-y-180' : ''}`} style={{ transform: card.isFlipped ? 'rotateY(180deg)' : '' }}>
                <div className="absolute inset-0 backface-hidden bg-zinc-800 rounded-2xl border border-white/5 flex items-center justify-center"><i className="fas fa-bolt text-jec-yellow/20 text-2xl"></i></div>
                <div className="absolute inset-0 backface-hidden bg-white dark:bg-zinc-900 rounded-2xl border-2 border-jec-yellow flex items-center justify-center p-3 text-center" style={{ transform: 'rotateY(180deg)' }}><span className={`text-xs font-black ${card.type === 'front' ? 'text-jec-green' : 'text-jec-orange'}`}>{card.content}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {mode === SessionMode.LISTENING && (
        <div className="max-w-xl mx-auto space-y-10 py-10">
          <div className="text-center">
            <button onClick={() => playTextToSpeech(cards[currentIndex].front)} className={`w-40 h-40 bg-zinc-900 rounded-full flex items-center justify-center shadow-2xl hover:scale-105 transition-all border-4 ${listeningFeedback === 'correct' ? 'border-jec-green' : listeningFeedback === 'wrong' ? 'border-jec-orange' : 'border-jec-yellow'}`}>
              <i className={`fas fa-volume-up text-5xl ${listeningFeedback === 'correct' ? 'text-jec-green' : listeningFeedback === 'wrong' ? 'text-jec-orange' : 'text-jec-yellow'}`}></i>
            </button>
            <p className="mt-8 text-zinc-500 font-black uppercase tracking-widest text-[10px]">音声を聞いて正しい意味を選択してください</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {listeningOptions.map((option, i) => (
              <button key={i} disabled={!!listeningFeedback} onClick={() => handleListeningAnswer(option)} className={`p-6 rounded-3xl font-black text-lg transition-all border-2 border-transparent shadow-lg ${listeningFeedback === 'correct' && option === cards[currentIndex].back ? 'bg-jec-green text-black border-jec-green' : listeningFeedback === 'wrong' && option === cards[currentIndex].back ? 'bg-jec-green text-black' : listeningFeedback === 'wrong' ? 'bg-zinc-800 text-zinc-600 opacity-50' : 'bg-zinc-900 text-white hover:border-jec-yellow'}`}>{option}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudySession;