export interface Flashcard {
  id: string;
  front: string;
  back: string;
  notes?: string;
  masteryScore: number;
}

export interface Deck {
  id: string;
  name: string;
  cards: Flashcard[];
}

export interface StudentProgress {
  username: string;
  deckName: string;
  masteryPercentage: number;
  lastAttempted: string;
  cardsMastered: number;
  totalCards: number;
  memoryTime?: number; // Time in seconds
}

export interface User {
  username: string;
  studentName?: string;
  email?: string;
  isLoggedIn: boolean;
}

export enum SessionMode {
  FLASHCARD = 'FLASHCARD',
  MEMORY = 'MEMORY',
  LISTENING = 'LISTENING'
}