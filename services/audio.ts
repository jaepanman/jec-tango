
import { GoogleGenAI, Modality } from "@google/genai";

const audioCache: Record<string, AudioBuffer> = {};
let audioContext: AudioContext | null = null;

/**
 * Decodes a base64 string to a Uint8Array.
 * Following the provided SDK examples for raw PCM handling.
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
 * Handles potential alignment issues with ArrayBuffer by creating a clean copy.
 */
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  // Ensure the underlying buffer is aligned for Int16Array (2-byte alignment)
  // We create a copy to avoid "offset is not a multiple of 2" errors on some browsers
  const pcmData = new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  
  const frameCount = pcmData.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Normalize 16-bit PCM to float [-1, 1]
      channelData[i] = pcmData[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Main function to play text-to-speech using Gemini API.
 */
export async function playTextToSpeech(text: string): Promise<void> {
  // Initialize or resume AudioContext
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioContext = new AudioContextClass({ sampleRate: 24000 });
  }

  // Resume context if suspended (required by browser autoplay policies)
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  // Return from cache if we already generated this word
  if (audioCache[text]) {
    playBuffer(audioCache[text]);
    return;
  }

  // Detect missing API key in production
  if (!process.env.API_KEY || process.env.API_KEY === 'undefined') {
    console.error("Gemini API Key is missing. Ensure it is set in your environment variables at build time.");
    return;
  }

  try {
    // CRITICAL: Use process.env.API_KEY directly for Vite to find and replace the string during build.
    // Do not use (process.env as any).API_KEY or other variations.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Read this English word clearly: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Puck' }, // Energetic voice for learning
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (base64Audio) {
      const audioBuffer = await decodeAudioData(
        decodeBase64(base64Audio),
        audioContext,
        24000,
        1,
      );
      audioCache[text] = audioBuffer;
      playBuffer(audioBuffer);
    } else {
      console.warn("No audio data received from Gemini TTS for text:", text);
    }
  } catch (error) {
    console.error("TTS Generation failed in production:", error);
  }
}

/**
 * Creates a source node and plays the decoded buffer.
 */
function playBuffer(buffer: AudioBuffer) {
  if (!audioContext) return;
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start();
}
