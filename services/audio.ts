
import { GoogleGenAI, Modality } from "@google/genai";

const audioCache: Record<string, AudioBuffer> = {};
let audioContext: AudioContext | null = null;
let isUnlocked = false;

/**
 * Unlocks audio on iOS/mobile browsers. 
 * Needs to be called once during a user-initiated event.
 */
export async function primeAudio() {
  if (typeof window === 'undefined') return;
  
  if (!audioContext) {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioContext = new AudioContextClass();
    }
  }
  
  const ctx = audioContext;
  if (!ctx) return;
  
  if (isUnlocked && ctx.state !== 'suspended') return;
  
  // Create and play a silent buffer to "prime" the audio engine
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    
    // Prime Speech Synthesis for iOS
    if ('speechSynthesis' in window) {
      const silent = new SpeechSynthesisUtterance('');
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
    }

    isUnlocked = true;
    console.log("[TTS] Audio engine primed and unlocked.");
  } catch (e) {
    console.warn("[TTS] Failed to prime audio:", e);
  }
}

async function unlockAudio(ctx: AudioContext) {
  await primeAudio();
}

/**
 * Decodes base64 string to Uint8Array safely.
 */
function decodeBase64(base64: string): Uint8Array {
  try {
    const binaryString = atob(base64.trim());
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error("[TTS] Base64 decode failed:", e);
    return new Uint8Array(0);
  }
}

/**
 * Native Fallback: Browser Web Speech API.
 */
function playNativeFallback(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.error("[TTS] Web Speech API not supported.");
    return;
  }
  
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 1.0;
  
  // Ensure we pick an English voice explicitly if available
  const voices = window.speechSynthesis.getVoices();
  const enVoice = voices.find(v => v.lang.startsWith('en-US')) || voices.find(v => v.lang.startsWith('en'));
  if (enVoice) utterance.voice = enVoice;
  
  window.speechSynthesis.speak(utterance);
}

/**
 * PCM Decoding for Gemini 2.5 TTS (Mono, 24kHz).
 */
async function decodePCM(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number
): Promise<AudioBuffer> {
  const alignedLength = Math.floor(data.byteLength / 2) * 2;
  const bufferSlice = data.buffer.slice(data.byteOffset, data.byteOffset + alignedLength);
  const pcmData = new Int16Array(bufferSlice);
  
  const buffer = ctx.createBuffer(1, pcmData.length, sampleRate);
  const channelData = buffer.getChannelData(0);
  
  for (let i = 0; i < pcmData.length; i++) {
    channelData[i] = pcmData[i] / 32768.0;
  }
  return buffer;
}

/**
 * Main TTS logic with robust fallback mechanism.
 */
export async function playTextToSpeech(text: string): Promise<void> {
  try {
    // 1. Initialize/Get AudioContext
    if (!audioContext) {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      audioContext = new AudioContextClass();
    }

    const ctx = audioContext;
    if (!ctx) throw new Error("AudioContext init failed");

    // 2. Critical for iOS: Resume context IMMEDIATELY in the user gesture call stack
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    
    // Unlock if not already done
    await unlockAudio(ctx);

    // 3. Check Cache
    if (audioCache[text]) {
      const source = ctx.createBufferSource();
      source.buffer = audioCache[text];
      source.connect(ctx.destination);
      source.start(0);
      return;
    }

    // 4. Primary Path: Gemini AI TTS
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'undefined' || apiKey === '') {
       console.error("[TTS] GEMINI_API_KEY is not set. Falling back to native TTS.");
       throw new Error("Missing GEMINI_API_KEY");
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            // 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Data) throw new Error("Empty audio payload from Gemini");

    const decoded = await decodePCM(decodeBase64(base64Data), ctx, 24000);
    audioCache[text] = decoded;

    // Re-check context state before playing (iOS can suspend it if there's a long delay)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const source = ctx.createBufferSource();
    source.buffer = decoded;
    source.connect(ctx.destination);
    source.start(0);

  } catch (err: any) {
    console.warn(`[TTS] Gemini AI voice failed: ${err?.message}. Using native fallback.`);
    playNativeFallback(text);
  }
}
