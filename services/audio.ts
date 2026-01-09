
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
 * Guarantees playback in any environment.
 */
function playNativeFallback(text: string) {
  if (!('speechSynthesis' in window)) return;
  
  // Clean up previous speech
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 1.0;
  
  // Browsers usually have at least one English voice
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
  // Ensure alignment for 16-bit PCM
  const alignedLength = Math.floor(data.byteLength / 2) * 2;
  const pcmData = new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + alignedLength));
  
  const buffer = ctx.createBuffer(1, pcmData.length, sampleRate);
  const channelData = buffer.getChannelData(0);
  
  for (let i = 0; i < pcmData.length; i++) {
    // Normalize Int16 range to [-1.0, 1.0]
    channelData[i] = pcmData[i] / 32768.0;
  }
  return buffer;
}

/**
 * Main TTS logic with robust fallback mechanism.
 */
export async function playTextToSpeech(text: string): Promise<void> {
  try {
    // Ensure AudioContext is available
    if (!audioContext) {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      audioContext = new AudioContextClass({ sampleRate: 24000 });
    }

    // Handle browser's required user-gesture state
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // 1. Check Cache
    if (audioCache[text]) {
      const source = audioContext.createBufferSource();
      source.buffer = audioCache[text];
      source.connect(audioContext.destination);
      source.start(0);
      return;
    }

    // 2. Primary Path: Gemini AI TTS
    // Attempt to get API key from environment
    const apiKey = typeof process !== 'undefined' ? process.env.API_KEY : undefined;
    
    if (!apiKey || apiKey === 'undefined' || apiKey === '') {
       throw new Error("Missing API Key");
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Read this word clearly: ${text}` }] }],
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
    if (!base64Data) throw new Error("No audio payload");

    const decoded = await decodePCM(decodeBase64(base64Data), audioContext, 24000);
    audioCache[text] = decoded;

    const source = audioContext.createBufferSource();
    source.buffer = decoded;
    source.connect(audioContext.destination);
    source.start(0);

  } catch (err: any) {
    // 3. Secondary Path: Native Fallback (Immediate & Guaranteed)
    console.warn(`[TTS] AI voice failed (${err?.message}), falling back to system voice.`);
    playNativeFallback(text);
  }
}
