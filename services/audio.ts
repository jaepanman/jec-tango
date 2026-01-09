
import { GoogleGenAI, Modality } from "@google/genai";

const audioCache: Record<string, AudioBuffer> = {};
let audioContext: AudioContext | null = null;

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
 * Guarantees playback in any environment even without an API key.
 */
function playNativeFallback(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.error("[TTS] Web Speech API not supported in this browser.");
    return;
  }
  
  // Clean up previous speech to avoid queueing
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 1.0;
  
  // Optional: find a specific English voice if available
  const voices = window.speechSynthesis.getVoices();
  const enVoice = voices.find(v => v.lang.startsWith('en'));
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
  const pcmData = new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + alignedLength));
  
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
    // 1. Initialize AudioContext (must be within user gesture)
    let ctx = audioContext;
    if (!ctx) {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      ctx = new AudioContextClass({ sampleRate: 24000 });
      audioContext = ctx;
    }

    // Type guard for TypeScript
    if (!ctx) {
      throw new Error("Failed to initialize AudioContext");
    }

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // 2. Check Cache
    if (audioCache[text]) {
      const source = ctx.createBufferSource();
      source.buffer = audioCache[text];
      source.connect(ctx.destination);
      source.start(0);
      return;
    }

    // 3. Primary Path: Gemini AI TTS
    const apiKey = process.env.API_KEY;
    
    if (!apiKey || apiKey === 'undefined' || apiKey === '') {
       throw new Error("API Key is missing - checking fallback...");
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Puck' },
          },
        },
      },
    });

    const base64Data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Data) throw new Error("No audio payload in Gemini response");

    const decoded = await decodePCM(decodeBase64(base64Data), ctx, 24000);
    audioCache[text] = decoded;

    const source = ctx.createBufferSource();
    source.buffer = decoded;
    source.connect(ctx.destination);
    source.start(0);

  } catch (err: any) {
    // 4. Secondary Path: Native Fallback
    console.warn(`[TTS] AI voice failed (${err?.message}), falling back to browser speech synthesis.`);
    playNativeFallback(text);
  }
}
