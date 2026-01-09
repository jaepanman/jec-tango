import React, { useState, useEffect, useCallback } from 'react';
import { User, Deck, StudentProgress } from './types';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import StudySession from './components/StudySession';
import Header from './components/Header';
import { fetchFullData, saveStudentProgress } from './services/googleSheets';

// Latest URL provided by the user
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw2ke6s8AcvRXKXK8IZVVyvbHcYE5KH25idViBZxlvcEvTXor1UF5Y7h3HmTml_JMU/exec';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [allProgress, setAllProgress] = useState<StudentProgress[]>([]);
  const [activeDeck, setActiveDeck] = useState<Deck | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('lm_dark_mode');
    return saved ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    const savedUser = localStorage.getItem('lm_user');
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  useEffect(() => {
    localStorage.setItem('lm_dark_mode', JSON.stringify(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchFullData(SCRIPT_URL);
      setDecks(data.decks || []);
      setAllProgress(data.progress || []);
    } catch (err) {
      setError('データの同期に失敗しました。Apps Scriptの「公開設定」と「シート名」を確認してください。');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSessionComplete = async (masteryPercentage: number, cardsMastered: number, totalCards: number, memoryTime?: number) => {
    if (user && activeDeck) {
      await saveStudentProgress(SCRIPT_URL, {
        username: user.username,
        deckName: activeDeck.name,
        masteryPercentage,
        cardsMastered,
        totalCards,
        memoryTime
      });
      loadData();
    }
    setActiveDeck(null);
  };

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  if (!user) return <Login scriptUrl={SCRIPT_URL} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode} onLogin={(u, name, email) => {
    const newUser = { username: u, studentName: name, email, isLoggedIn: true };
    setUser(newUser);
    localStorage.setItem('lm_user', JSON.stringify(newUser));
  }} />;

  return (
    <div className="min-h-screen bg-white dark:bg-black transition-colors duration-300 flex flex-col">
      <Header 
        user={user} 
        onLogout={() => { setUser(null); localStorage.removeItem('lm_user'); }} 
        onSettingsClick={() => setActiveDeck(null)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />
      <main className="flex-grow container mx-auto px-4 py-8">
        {activeDeck ? (
          <StudySession 
            deck={activeDeck} 
            user={user}
            allProgress={allProgress}
            onClose={(stats) => stats ? handleSessionComplete(stats.progress, stats.mastered, stats.total, stats.memoryTime) : setActiveDeck(null)} 
          />
        ) : (
          <Dashboard 
            decks={decks}
            userProgress={allProgress.filter(p => p.username === user.username)}
            onSelectDeck={setActiveDeck}
            isLoading={isLoading}
            error={error}
            onRefresh={loadData}
          />
        )}
      </main>
      <footer className="py-8 text-center text-gray-400 dark:text-slate-800 text-xs font-bold tracking-widest uppercase">
        &copy; {new Date().getFullYear()} JEC単GO! • FAST TRACK TO FLUENCY
      </footer>
    </div>
  );
};

export default App;