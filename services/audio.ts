
import { GoogleGenAI, Modality } from "@google/genai";

const audioCache: Record<string, AudioBuffer> = {};
let audioContext: AudioContext | null = null;

/**
 * Initializes and resumes the AudioContext.
 * Must be called in response to a user gesture.
 */
async function ensureAudioContext(): Promise<AudioContext> {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioContext = new AudioContextClass({ sampleRate: 24000 });
  }
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
  return audioContext;
}

/**
 * Decodes a base64 string to a Uint8Array.
 */
function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decodes raw PCM 16-bit audio data into an AudioBuffer.
 * Gemini TTS returns raw mono PCM data at 24kHz.
 */
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  // Ensure we are working with a 2-byte aligned buffer for Int16Array
  const bufferCopy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const pcmData = new Int16Array(bufferCopy);
  
  const frameCount = pcmData.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Normalize 16-bit PCM (Short) to Float [-1.0, 1.0]
      channelData[i] = pcmData[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Main function to play text-to-speech using Gemini API.
 */
export async function playTextToSpeech(text: string): Promise<void> {
  try {
    // 1. Ensure context is ready immediately (important for browser user gesture chain)
    const ctx = await ensureAudioContext();

    // 2. Cache check
    if (audioCache[text]) {
      playBuffer(audioCache[text]);
      return;
    }

    // 3. API Key Diagnostic
    // process.env.API_KEY is replaced by Vite at build time.
    const apiKey = process.env.API_KEY;
    if (!apiKey || apiKey === 'undefined' || apiKey === '') {
      console.error("Gemini API Key is missing. Audio playback will fail.");
    }

    // 4. Request Audio from Gemini
    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    // We send a direct prompt for TTS
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            // Using 'Puck' for clear, energetic educational tone
            prebuiltVoiceConfig: { voiceName: 'Puck' }, 
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (base64Audio) {
      const audioBuffer = await decodeAudioData(
        decodeBase64(base64Audio),
        ctx,
        24000,
        1,
      );
      audioCache[text] = audioBuffer;
      playBuffer(audioBuffer);
    } else {
      console.warn("Gemini API returned success but no inline audio data found in response.");
    }
  } catch (error) {
    console.error("playTextToSpeech failed:", error);
  }
}

/**
 * Creates a source node and plays the decoded buffer.
 */
function playBuffer(buffer: AudioBuffer) {
  if (!audioContext) return;
  
  // Extra safeguard: Resume context if it somehow suspended during the async fetch
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start(0);
}
