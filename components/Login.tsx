import React, { useState } from 'react';
import { hashPassword, loginUser, registerUser } from '../services/googleSheets';

interface LoginProps {
  onLogin: (username: string, studentName?: string, email?: string) => void;
  scriptUrl: string;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, scriptUrl, isDarkMode, toggleDarkMode }) => {
  const [username, setUsername] = useState('');
  const [studentName, setStudentName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    if (isRegistering && (!studentName.trim() || !email.trim())) return;

    setIsLoading(true);
    setError(null);

    try {
      const pHash = await hashPassword(password);
      
      if (isRegistering) {
        const result = await registerUser(scriptUrl, {
          username,
          studentName,
          email,
          passwordHash: pHash,
          rawPassword: password 
        });
        if (result.includes("SUCCESS")) {
          onLogin(username, studentName, email);
        } else if (result.includes("EXISTS")) {
          setError("このユーザーIDは既に使用されています。");
        } else {
          setError("登録に失敗しました。もう一度お試しください。");
        }
      } else {
        const result = await loginUser(scriptUrl, username, pHash);
        try {
          const data = JSON.parse(result);
          if (data.status === "SUCCESS") {
            onLogin(username, data.studentName, data.email);
          } else {
            setError("ユーザーIDまたはパスワードが正しくありません。");
          }
        } catch {
          if (result.includes("SUCCESS")) {
            onLogin(username);
          } else {
            setError("ユーザーIDまたはパスワードが正しくありません。");
          }
        }
      }
    } catch (err) {
      setError("接続エラーが発生しました。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4 font-sans overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
         <div className="absolute top-1/4 -left-20 w-80 h-1 bg-jec-yellow -rotate-12 blur-sm"></div>
         <div className="absolute top-1/2 -right-20 w-96 h-2 bg-jec-orange rotate-12 blur-sm"></div>
         <div className="absolute bottom-1/4 left-1/2 w-64 h-1 bg-jec-green -rotate-45 blur-sm"></div>
      </div>

      <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden p-10 border border-white/10 relative z-10">
        <div className="text-center mb-10">
          <div className="relative inline-block mb-6">
            <div className="w-24 h-24 bg-black rounded-full flex flex-col items-center justify-center shadow-xl border-4 border-jec-yellow">
               <div className="text-2xl font-black leading-none">
                  <span className="text-jec-green">J</span>
                  <span className="text-jec-yellow">E</span>
                  <span className="text-jec-orange">C</span>
               </div>
               <div className="text-white text-xs font-black italic tracking-tighter mt-1">単GO!</div>
            </div>
            <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-jec-orange rounded-full flex items-center justify-center shadow-lg animate-bounce">
              <i className="fas fa-arrow-right text-white"></i>
            </div>
          </div>
          
          <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter">
            {isRegistering ? '新規アカウント作成' : "Welcome! Let's begin!"}
          </h2>
          <p className="text-gray-400 dark:text-zinc-500 mt-2 text-xs font-bold uppercase tracking-widest">
            {isRegistering ? '最速の学習体験を始めましょう' : 'サインインして学習を再開'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-black rounded-2xl flex items-center gap-3">
            <i className="fas fa-bolt"></i>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {isRegistering && (
            <div className="space-y-5">
              <div>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="w-full px-6 py-4 bg-gray-100 dark:bg-black border-none rounded-2xl focus:ring-2 focus:ring-jec-orange outline-none text-gray-900 dark:text-white font-bold"
                  placeholder="氏名（ニックネーム可）"
                  required={isRegistering}
                />
              </div>
              <div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-6 py-4 bg-gray-100 dark:bg-black border-none rounded-2xl focus:ring-2 focus:ring-jec-orange outline-none text-gray-900 dark:text-white font-bold"
                  placeholder="メールアドレス"
                  required={isRegistering}
                />
              </div>
            </div>
          )}

          <div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-6 py-4 bg-gray-100 dark:bg-black border-none rounded-2xl focus:ring-2 focus:ring-jec-yellow outline-none text-gray-900 dark:text-white font-bold"
              placeholder="ユーザーID"
              required
              autoComplete="username"
            />
          </div>

          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-6 py-4 bg-gray-100 dark:bg-black border-none rounded-2xl focus:ring-2 focus:ring-jec-green outline-none text-gray-900 dark:text-white font-bold"
              placeholder="パスワード"
              required
              autoComplete={isRegistering ? "new-password" : "current-password"}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-4 bg-black dark:bg-jec-orange text-white dark:text-black font-black py-5 rounded-2xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3 text-lg uppercase tracking-tighter"
          >
            {isLoading ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              <>
                {isRegistering ? 'アカウント登録' : '学習を開始'}
                <i className="fas fa-chevron-right text-xs"></i>
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button 
            onClick={() => { setIsRegistering(!isRegistering); setError(null); }}
            className="text-gray-400 dark:text-zinc-500 font-black hover:text-jec-yellow transition-colors text-[10px] uppercase tracking-widest"
          >
            {isRegistering ? '既にアカウントをお持ちですか？ ログイン' : "アカウントをお持ちでないですか？ 新規登録"}
          </button>
        </div>
      </div>
      
      <div className="fixed bottom-10 flex items-center gap-6 opacity-30">
        <span className="text-jec-green text-xs font-black">SPEED</span>
        <span className="text-jec-yellow text-xs font-black">PRECISION</span>
        <span className="text-jec-orange text-xs font-black">MASTERY</span>
      </div>
    </div>
  );
};

export default Login;