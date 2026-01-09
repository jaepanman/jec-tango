import React from 'react';
import { User } from '../types';

interface HeaderProps {
  user: User;
  onLogout: () => void;
  onSettingsClick: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

const Header: React.FC<HeaderProps> = ({ user, onLogout, onSettingsClick, isDarkMode, onToggleDarkMode }) => {
  return (
    <header className="bg-white dark:bg-black border-b border-gray-100 dark:border-white/10 sticky top-0 z-50 transition-colors duration-300">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div 
          className="flex items-center gap-3 cursor-pointer group"
          onClick={onSettingsClick}
        >
          <div className="relative w-10 h-10 bg-black dark:bg-white rounded-full flex items-center justify-center overflow-hidden shadow-lg group-active:scale-95 transition-transform">
             <i className="fas fa-bolt text-jec-yellow text-xl"></i>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-black leading-none tracking-tighter flex items-center">
              <span className="text-jec-green">J</span>
              <span className="text-jec-yellow">E</span>
              <span className="text-jec-orange mr-1">C</span>
              <span className="text-black dark:text-white">単GO!</span>
            </h1>
            <span className="text-[8px] font-black text-gray-400 dark:text-slate-600 uppercase tracking-[0.2em]">英単語マスター</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex flex-col items-end mr-2">
            <span className="text-xs font-black text-gray-900 dark:text-slate-100 uppercase tracking-wider">{user.studentName || user.username} 様</span>
            <div className="flex items-center gap-1">
               <div className="w-1.5 h-1.5 bg-jec-green rounded-full animate-pulse"></div>
               <span className="text-[8px] text-jec-green font-black uppercase tracking-widest">学習中</span>
            </div>
          </div>
          
          <div className="flex items-center bg-gray-50 dark:bg-white/5 p-1 rounded-2xl border border-gray-100 dark:border-white/5">
            <button 
              onClick={onToggleDarkMode}
              className="w-10 h-10 flex items-center justify-center text-gray-500 dark:text-slate-400 hover:text-jec-yellow transition-all"
              title="テーマ切替"
            >
              <i className={`fas ${isDarkMode ? 'fa-sun' : 'fa-moon'} text-sm`}></i>
            </button>
            <button 
              onClick={onLogout}
              className="w-10 h-10 flex items-center justify-center text-gray-500 dark:text-slate-400 hover:text-jec-orange transition-all"
              title="ログアウト"
            >
              <i className="fas fa-power-off text-sm"></i>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;