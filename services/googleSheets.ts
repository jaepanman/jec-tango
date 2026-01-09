import { Deck, Flashcard, StudentProgress } from '../types';

export async function hashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function postToScript(url: string, data: object): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return response.text();
}

export async function registerUser(scriptUrl: string, data: { username: string, studentName: string, email: string, passwordHash: string, rawPassword: string }): Promise<string> {
  return postToScript(scriptUrl, { action: 'register', ...data });
}

export async function loginUser(scriptUrl: string, username: string, passwordHash: string): Promise<string> {
  return postToScript(scriptUrl, { action: 'login', username, passwordHash });
}

export async function fetchFullData(scriptUrl: string): Promise<{ decks: Deck[], progress: StudentProgress[] }> {
  const url = new URL(scriptUrl);
  url.searchParams.set('_t', Date.now().toString());
  
  const response = await fetch(url.toString(), { method: 'GET', mode: 'cors' });
  if (!response.ok) throw new Error("Failed to fetch data from Apps Script");
  
  const data = await response.json();
  // Logging for debugging - visible in Browser Console
  console.log("Sheet Data Received:", data);
  return data;
}

export async function saveStudentProgress(scriptUrl: string, progress: Partial<StudentProgress>): Promise<void> {
  try {
    await fetch(scriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'saveProgress', ...progress })
    });
  } catch (e) {
    console.error("Progress save failed", e);
  }
}