
import { GoogleGenAI, Modality } from "@google/genai";

const audioCache: Record<string, AudioBuffer> = {};
let audioContext: AudioContext | null = null;

/**
 * Ensures the AudioContext is initialized and in a running state.
 * This should be triggered by a user gesture.
 */
async function ensureAudioContext(): Promise<AudioContext> {
  if (!audioContext) {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    audioContext = new AudioContextClass({ sampleRate: 24000 });
    console.log("AudioContext initialized at 24kHz");
  }
  
  if (audioContext!.state === 'suspended') {
    await audioContext!.resume();
    console.log("AudioContext resumed");
  }
  return audioContext!;
}

/**
 * Decodes a base64 string into a Uint8Array.
 * Uses a manual loop for maximum compatibility across environments.
 */
function decodeBase64(base64: string): Uint8Array {
  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error("Base64 decoding failed:", e);
    return new Uint8Array(0);
  }
}

/**
 * Decodes raw PCM 16-bit (Little Endian) data into an AudioBuffer.
 * Gemini 2.5 TTS returns raw mono PCM at 24000Hz.
 */
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  // PCM 16-bit data must have an even number of bytes.
  // We slice to ensure we don't have an orphaned byte at the end.
  const alignedLength = Math.floor(data.byteLength / 2) * 2;
  const bufferCopy = data.buffer.slice(data.byteOffset, data.byteOffset + alignedLength);
  const pcmData = new Int16Array(bufferCopy);
  
  const frameCount = pcmData.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Convert Int16 (-32768 to 32767) to Float32 (-1.0 to 1.0)
      channelData[i] = pcmData[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Plays text-to-speech for the provided English text using Gemini API.
 */
export async function playTextToSpeech(text: string): Promise<void> {
  console.log(`Attempting TTS for: "${text}"`);
  
  try {
    // 1. Prepare AudioContext (must be within user gesture)
    const ctx = await ensureAudioContext();

    // 2. Check Cache
    if (audioCache[text]) {
      console.log("Playing from cache...");
      playBuffer(audioCache[text]);
      return;
    }

    // 3. API Client Initialization
    // Check if API key is defined and not a placeholder string
    const apiKey = process.env.API_KEY;
    if (!apiKey || apiKey === 'undefined' || apiKey === '') {
      console.error("CRITICAL: Gemini API Key is missing or undefined in production environment.");
      return;
    }

    const ai = new GoogleGenAI({ apiKey });

    // 4. Request TTS Content
    // We use a very explicit prompt to ensure the model focuses on pronunciation
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Pronounce the following English word or phrase clearly: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Puck' }, // Clear energetic voice
          },
        },
      },
    });

    // 5. Extract and Decode Audio
    const parts = response.candidates?.[0]?.content?.parts || [];
    const audioPart = parts.find(p => p.inlineData && p.inlineData.data);
    const base64Audio = audioPart?.inlineData?.data;

    if (base64Audio) {
      console.log("Audio data received, decoding...");
      const rawBytes = decodeBase64(base64Audio);
      const audioBuffer = await decodeAudioData(rawBytes, ctx, 24000, 1);
      
      // Cache the result
      audioCache[text] = audioBuffer;
      playBuffer(audioBuffer);
    } else {
      console.warn("No audio data found in Gemini response parts:", parts);
    }
  } catch (error) {
    console.error("playTextToSpeech failed:", error);
  }
}

/**
 * Plays a decoded AudioBuffer.
 */
function playBuffer(buffer: AudioBuffer) {
  if (!audioContext) return;
  
  // Create source and play
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  
  // Ensure we are not playing into a suspended context
  if (audioContext.state === 'suspended') {
    audioContext.resume().then(() => source.start(0));
  } else {
    source.start(0);
  }
}
