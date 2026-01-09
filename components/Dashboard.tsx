import React from 'react';
import { Deck, StudentProgress } from '../types';

interface DashboardProps {
  decks: Deck[];
  userProgress: StudentProgress[];
  onSelectDeck: (deck: Deck) => void;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  decks, userProgress, onSelectDeck, isLoading, error, onRefresh
}) => {
  const getProgressForDeck = (deckName: string) => {
    const records = userProgress.filter(p => p.deckName === deckName);
    if (records.length === 0) return null;
    return records.sort((a, b) => new Date(b.lastAttempted).getTime() - new Date(a.lastAttempted).getTime())[0];
  };

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      {error && (
        <div className="p-4 bg-red-500/10 text-red-500 rounded-2xl border border-red-500/20 text-xs font-black flex items-center gap-3 animate-pulse">
          <i className="fas fa-exclamation-triangle"></i>
          {error}
        </div>
      )}

      <section>
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <h3 className="text-4xl font-black text-gray-900 dark:text-white tracking-tighter uppercase italic">
              Training <span className="text-jec-yellow">Fields</span>
            </h3>
            <p className="text-xs font-bold text-gray-400 dark:text-zinc-500 mt-2 uppercase tracking-widest">モジュールを選択してトレーニングを開始</p>
          </div>
          <button 
            onClick={onRefresh} 
            disabled={isLoading} 
            className="flex items-center gap-2 px-6 py-3 bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-zinc-400 rounded-2xl font-black hover:bg-jec-yellow hover:text-black transition-all shadow-sm active:scale-95 disabled:opacity-50 text-xs uppercase tracking-widest border border-transparent dark:border-white/5"
          >
            {isLoading ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-sync-alt"></i>}
            {isLoading ? '同期中...' : '最新データに同期'}
          </button>
        </div>

        {decks.length === 0 && !isLoading ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="py-20 text-center bg-gray-50 dark:bg-zinc-900/50 rounded-[3.5rem] border-2 border-dashed border-gray-200 dark:border-white/5">
              <div className="w-20 h-20 bg-white dark:bg-black rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl rotate-3">
                <i className="fas fa-folder-open text-3xl text-gray-300 dark:text-zinc-700"></i>
              </div>
              <p className="text-gray-400 dark:text-zinc-500 font-black uppercase tracking-widest text-sm mb-2">単語帳が見つかりません</p>
              <p className="text-jec-orange text-[10px] font-black uppercase tracking-[0.2em]">Googleスプレッドシートの構成を確認してください</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-8 bg-jec-yellow/5 border border-jec-yellow/10 rounded-[2.5rem]">
                <h5 className="text-jec-yellow font-black uppercase tracking-widest text-xs mb-4 flex items-center gap-2">
                  <i className="fas fa-info-circle"></i>
                  スプレッドシートの確認事項
                </h5>
                <ul className="space-y-3">
                  {[
                    "「Users」「Progress」以外のタブ名が学習セットになります",
                    "各シートの1行目はヘッダーとしてスキップされます",
                    "A列に英語、B列に日本語を入力してください",
                    "シートが空、または1行しかない場合は表示されません"
                  ].map((text, i) => (
                    <li key={i} className="flex items-start gap-3 text-xs font-bold text-gray-500 dark:text-zinc-400">
                      <i className="fas fa-check-circle text-jec-green mt-0.5"></i>
                      {text}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-8 bg-jec-orange/5 border border-jec-orange/10 rounded-[2.5rem]">
                <h5 className="text-jec-orange font-black uppercase tracking-widest text-xs mb-4 flex items-center gap-2">
                  <i className="fas fa-redo"></i>
                  スクリプトの更新手順
                </h5>
                <ul className="space-y-3">
                  {[
                    "Apps Scriptで「デプロイ」>「デプロイを管理」をクリック",
                    "現在のデプロイを選択し、編集（ペン）ボタンをクリック",
                    "バージョンを「新バージョン」にして「デプロイ」",
                    "URLが変わった場合は App.tsx を更新して保存"
                  ].map((text, i) => (
                    <li key={i} className="flex items-start gap-3 text-xs font-bold text-gray-500 dark:text-zinc-400">
                      <i className="fas fa-arrow-circle-right text-jec-orange mt-0.5"></i>
                      {text}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {decks.map(deck => {
              const stats = getProgressForDeck(deck.name);
              const mastery = stats ? stats.masteryPercentage : 0;
              
              return (
                <div 
                  key={deck.id} 
                  onClick={() => onSelectDeck(deck)} 
                  className="group relative bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-2xl dark:hover:shadow-jec-yellow/5 hover:border-jec-yellow dark:hover:border-jec-yellow/30 transition-all cursor-pointer flex flex-col h-full overflow-hidden"
                >
                  <div className="absolute -top-4 -right-4 w-24 h-24 bg-jec-yellow/5 dark:bg-jec-yellow/10 rounded-full blur-2xl group-hover:bg-jec-yellow/20 transition-colors"></div>
                  
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-14 h-14 bg-gray-50 dark:bg-black text-gray-400 dark:text-zinc-600 rounded-2xl flex items-center justify-center text-2xl group-hover:bg-jec-yellow group-hover:text-black transition-all">
                      <i className="fas fa-chevron-right"></i>
                    </div>
                    <div className="text-right">
                       <span className="block text-[10px] font-black text-gray-300 dark:text-zinc-700 uppercase tracking-widest mb-1">単語数</span>
                       <span className="text-xl font-black text-gray-900 dark:text-white italic">{deck.cards.length}</span>
                    </div>
                  </div>
                  
                  <h4 className="text-2xl font-black text-gray-900 dark:text-white mb-6 tracking-tighter group-hover:text-jec-yellow transition-colors">{deck.name}</h4>
                  
                  <div className="mt-auto space-y-6">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                         <span className="text-[10px] font-black text-gray-400 dark:text-zinc-600 uppercase tracking-widest">習得率</span>
                         <span className="text-xs font-black text-jec-orange">{mastery}%</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-black h-3 rounded-full overflow-hidden p-0.5 border border-white/5">
                        <div 
                          className="bg-gradient-to-r from-jec-green via-jec-yellow to-jec-orange h-full rounded-full transition-all duration-1000" 
                          style={{ width: `${mastery}%` }}
                        ></div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between pt-4 border-t border-gray-50 dark:border-white/5">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-300 dark:text-zinc-700 uppercase font-black tracking-widest">最終学習日</span>
                        <span className="text-xs font-bold text-gray-500 dark:text-zinc-400 italic">{stats ? new Date(stats.lastAttempted).toLocaleDateString() : '未着手'}</span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-gray-50 dark:bg-black flex items-center justify-center text-gray-300 dark:text-zinc-800 group-hover:text-jec-orange transition-colors shadow-inner">
                         <i className="fas fa-play text-[10px]"></i>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default Dashboard;