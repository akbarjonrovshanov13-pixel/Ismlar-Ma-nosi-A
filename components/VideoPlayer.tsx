import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { ScriptSegment, CaptionStyle, WatermarkPosition, VoiceSpeed } from '../types';

interface VideoPlayerProps {
  images: string[];
  audioBase64: string;
  scriptSegments: string[];
  topic: string;
  customOutroImages?: string[];
  outroText?: string;
  // Real per-word timings from Speech-to-Text, grouped per script segment. Absent or
  // mismatched, the character-count estimate below takes over.
  wordTimings?: ({ start: number; end: number } | null)[][] | null;
  captionStyle?: CaptionStyle;
  watermarkText?: string;
  watermarkPosition?: WatermarkPosition;
  adTitle?: string;
  adSubtitle?: string;
  adHandle?: string;
  voiceSpeed?: VoiceSpeed;
  onVoiceSpeedChange?: (speed: VoiceSpeed) => void;
}

interface WordTiming {
  word: string;
  start: number;
  end: number;
  width?: number; // calculated later
}

interface SubtitleLine {
  words: WordTiming[];
  totalWidth: number;
}

interface PreparedSubtitle {
  start: number;
  end: number;
  lines: SubtitleLine[];
}

// New interface for Motion Vectors
interface MotionVector {
    startX: number;
    startY: number;
    startScale: number;
    endX: number;
    endY: number;
    endScale: number;
    focusY?: number;
}

interface ProcessedImageLayer {
    canvas: HTMLCanvasElement;
    motion: MotionVector;
    transitionType: number;
}

interface Particle {
    x: number;
    y: number;
    size: number;
    speedY: number;
    speedX: number;
    opacity: number;
    phase: number;
    color: string;
    pulseSpeed: number;
    isSparkle?: boolean;
}

const OUTRO_DURATION = 9.0; // 9 seconds for Luxe Core branding & advert showcase

// The active-word highlight badge is drawn this far past the word on each side. A plain
// space (~14px at 54px Inter) is narrower than that, so laying words out by space width
// made every badge paint over the tail of the previous word.
const CAPTION_BADGE_PAD_X = 20;
const CAPTION_WORD_GAP = CAPTION_BADGE_PAD_X + 12;

// Wraps a segment's words into rendered lines. Shared by both timing paths so real and
// estimated captions break identically.
function buildLines(words: WordTiming[], maxWidth: number): SubtitleLine[] {
  const lines: SubtitleLine[] = [];
  let current: WordTiming[] = [];
  let width = 0;

  words.forEach((wt) => {
    const wWidth = wt.width || 0;
    const potential = width + wWidth + (current.length > 0 ? CAPTION_WORD_GAP : 0);

    if (potential > maxWidth && current.length > 0) {
      lines.push({ words: current, totalWidth: width });
      current = [wt];
      width = wWidth;
    } else {
      if (current.length > 0) width += CAPTION_WORD_GAP;
      current.push(wt);
      width += wWidth;
    }
  });
  if (current.length > 0) lines.push({ words: current, totalWidth: width });

  return lines;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  images, 
  audioBase64, 
  scriptSegments, 
  topic, 
  customOutroImages,
  outroText,
  wordTimings,
  captionStyle = CaptionStyle.TIKTOK_YELLOW,
  watermarkText = "✨ @luxe_core_uz",
  watermarkPosition = WatermarkPosition.TOP_RIGHT,
  adTitle = "LUXE CORE",
  adSubtitle = "Qutilar • Paketlar • Qadoqlash • HoReCa",
  adHandle = "@luxe_core_uz",
  voiceSpeed = 1.1,
  onVoiceSpeedChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState<VoiceSpeed>(voiceSpeed || 1.1);

  // Sync if voiceSpeed prop updates from parent
  useEffect(() => {
    if (voiceSpeed) {
      setCurrentSpeed(voiceSpeed);
    }
  }, [voiceSpeed]);
  
  // We use a Ref for tracking play time to avoid re-renders during the loop
  const currentTimeRef = useRef(0);
  const [duration, setDuration] = useState(0);
  
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [bgmBuffer, setBgmBuffer] = useState<AudioBuffer | null>(null);
  const [bgmStyle, setBgmStyle] = useState<'sharqona' | 'kinematik' | 'osuda' | 'lofi' | 'custom'>('sharqona');
  const [customBgmBuffer, setCustomBgmBuffer] = useState<AudioBuffer | null>(null);
  const [customBgmName, setCustomBgmName] = useState<string | null>(null);
  const [isBgmEnabled, setIsBgmEnabled] = useState(true);
  const [bgmVolume, setBgmVolume] = useState(0.35); // 35% background music volume default
  const [isPreviewingBgm, setIsPreviewingBgm] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  
  const speechSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bgmSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bgmGainRef = useRef<GainNode | null>(null);
  const previewBgmSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const previewBgmGainRef = useRef<GainNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Store pre-rendered canvases and their motion vectors
  const [processedLayers, setProcessedLayers] = useState<ProcessedImageLayer[]>([]);
  const reqRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);
  const outroImagesRef = useRef<HTMLImageElement[]>([]);

  // Preload Luxe Core Outro Images
  useEffect(() => {
    const defaultUrls = [
      "/fallback/outro-boxes.jpg", // Qutilar
      "/fallback/outro-bags.jpg",  // Paketlar
      "/fallback/outro-wrap.jpg",  // Lenta
      "/fallback/outro-cups.jpg"   // Bir martalik idishlar
    ];
    const urls = customOutroImages && customOutroImages.length > 0 ? customOutroImages : defaultUrls;
    const loaded: HTMLImageElement[] = [];
    urls.forEach((url, i) => {
      const img = new Image();
      if (url && !url.startsWith("data:")) {
        img.crossOrigin = "anonymous";
      }
      img.src = url;
      img.onload = () => {
        loaded[i] = img;
      };
    });
    outroImagesRef.current = loaded;
  }, [customOutroImages]);

  // Download Progress State
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

  // Ready Video Data for Mobile / Instagram Web Share & In-App Player
  interface ReadyVideoData {
    url: string;
    blob: Blob;
    file?: File;
    fileName: string;
  }
  const [readyVideo, setReadyVideo] = useState<ReadyVideoData | null>(null);
  const [isReadyModalOpen, setIsReadyModalOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Clean up object URL when component unmounts
  useEffect(() => {
    return () => {
      if (readyVideo?.url) {
        URL.revokeObjectURL(readyVideo.url);
      }
    };
  }, [readyVideo?.url]);

  // Instagram Reels Standard: 1080x1920 @ 30FPS
  const WIDTH = 1080; 
  const HEIGHT = 1920;
  const FPS = 30; // Fixed 30 FPS for smooth recording
  const FADE_DURATION = 0.8; 

  // Internal scale buffer for Panning
  const BUFFER_SCALE = 1.3; // Reduced slightly for better performance
  const BUFFER_W = WIDTH * BUFFER_SCALE; 
  const BUFFER_H = HEIGHT * BUFFER_SCALE;

  // Helper: Decode Base64 to Uint8Array
  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  // Helper: Convert Raw PCM to AudioBuffer safely without byte alignment or offset errors
  const pcmToAudioBuffer = (data: Uint8Array, ctx: AudioContext): AudioBuffer => {
    const sampleRate = 24000;
    const numChannels = 1;
    // Align to 2-byte boundary to prevent RangeError: byte length of Int16Array should be a multiple of 2
    const safeBytes = data.byteLength - (data.byteLength % 2);
    const frameCount = Math.floor(safeBytes / 2);
    const buffer = ctx.createBuffer(numChannels, Math.max(1, frameCount), sampleRate);
    const channelData = buffer.getChannelData(0);
    
    // Use DataView with explicit little-endian: robust against any start offset or slice boundaries
    const view = new DataView(data.buffer, data.byteOffset, safeBytes);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = view.getInt16(i * 2, true) / 32768.0;
    }
    return buffer;
  };

  // Helper: Create a procedural silent audio buffer when voice audio is missing or empty
  const createSilentAudioBuffer = (ctx: AudioContext, targetDuration: number = 20): AudioBuffer => {
    const sampleRate = ctx.sampleRate || 24000;
    const safeDur = Math.max(5, targetDuration);
    const frameCount = Math.floor(sampleRate * safeDur);
    return ctx.createBuffer(1, frameCount, sampleRate);
  };

  // Helper: Generate Procedural Royalty-Free Background Music based on Style
  const createProceduralBGMBuffer = (ctx: AudioContext, targetDuration: number, style: string): AudioBuffer => {
    const sampleRate = ctx.sampleRate;
    const numChannels = 2;
    const safeDuration = Math.max(10, targetDuration + 10);
    const frameCount = Math.floor(sampleRate * safeDuration);
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    if (style === 'sharqona') {
      // 🕌 Sharqona / Sufiyona (Hijaz scale)
      const droneFreq = 73.42; // D2 sub drone
      const scale = [146.83, 155.56, 185.00, 196.00, 220.00, 233.08, 261.63, 293.66];
      for (let i = 0; i < frameCount; i++) {
        const t = i / sampleRate;
        const droneLfo = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.15 * t);
        const drone = (Math.sin(2 * Math.PI * droneFreq * t) * 0.35 + Math.sin(2 * Math.PI * droneFreq * 2 * t) * 0.15) * droneLfo;
        const noteStep = Math.floor(t * 3.5);
        const noteIdx = (noteStep * 3 + Math.floor(t * 0.7)) % scale.length;
        const freq = scale[noteIdx];
        const noteT = (t * 3.5) % 1.0;
        const env = Math.exp(-4.0 * noteT);
        const wave = (Math.sin(2 * Math.PI * freq * t) * 0.3 + 0.15 * Math.sin(2 * Math.PI * freq * 2 * t)) * env;
        const beatT = t % 0.6;
        const isKick = (Math.floor(t / 0.6) % 2 === 0);
        let drum = 0;
        if (isKick) {
          drum = Math.sin(2 * Math.PI * 65.0 * Math.exp(-8.0 * beatT) * t) * Math.exp(-12.0 * beatT) * 0.30;
        } else {
          drum = (Math.random() * 2 - 1) * Math.exp(-25.0 * beatT) * 0.12;
        }
        const panL = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.2 * t);
        const panR = 1.0 - panL;
        let sampleL = drone * 0.4 + wave * panL * 0.5 + drum * 0.3;
        let sampleR = drone * 0.4 + wave * panR * 0.5 + drum * 0.3;
        let envM = 1.0;
        if (t < 2.0) envM = t / 2.0;
        if (t > safeDuration - 2.0) envM = Math.max(0, (safeDuration - t) / 2.0);
        left[i] = Math.max(-1, Math.min(1, sampleL * 0.75 * envM));
        right[i] = Math.max(-1, Math.min(1, sampleR * 0.75 * envM));
      }
    } else if (style === 'kinematik') {
      // 🎹 Kinematik & Hissiyotli Piano
      const chords = [
        [130.81, 155.56, 196.00, 233.08], // Cm7
        [103.83, 130.81, 155.56, 196.00], // Abmaj7
        [155.56, 196.00, 233.08, 311.13], // Ebmaj7
        [116.54, 146.83, 174.61, 233.08]  // Bb7
      ];
      for (let i = 0; i < frameCount; i++) {
        const t = i / sampleRate;
        const chordIdx = Math.floor(t / 4.0) % chords.length;
        const chord = chords[chordIdx];
        const arpStep = Math.floor(t * 4.0);
        const arpNote = chord[arpStep % chord.length] * 2.0;
        const arpT = (t * 4.0) % 1.0;
        const arpEnv = Math.exp(-5.0 * arpT);
        const pianoSample = Math.sin(2 * Math.PI * arpNote * t) * arpEnv * 0.35;
        let padL = 0, padR = 0;
        chord.forEach((f, idx) => {
          const lfo = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.1 * t + idx);
          const s = Math.sin(2 * Math.PI * f * t) * 0.15;
          padL += s * lfo;
          padR += s * (1 - lfo);
        });
        const beatT = t % 1.0;
        const kick = Math.sin(2 * Math.PI * 55 * Math.exp(-10 * beatT) * t) * Math.exp(-15 * beatT) * 0.25;
        let sampleL = pianoSample * 0.5 + padL * 0.4 + kick * 0.3;
        let sampleR = pianoSample * 0.5 + padR * 0.4 + kick * 0.3;
        let envM = 1.0;
        if (t < 2.0) envM = t / 2.0;
        if (t > safeDuration - 2.0) envM = Math.max(0, (safeDuration - t) / 2.0);
        left[i] = Math.max(-1, Math.min(1, sampleL * 0.70 * envM));
        right[i] = Math.max(-1, Math.min(1, sampleR * 0.70 * envM));
      }
    } else if (style === 'osuda') {
      // 🌿 Osuda Ambient
      const scale = [174.61, 196.00, 220.00, 261.63, 293.66, 349.23];
      for (let i = 0; i < frameCount; i++) {
        const t = i / sampleRate;
        const lfo1 = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.08 * t);
        const lfo2 = 0.5 + 0.5 * Math.cos(2 * Math.PI * 0.08 * t);
        const pad1 = Math.sin(2 * Math.PI * 174.61 * t) * 0.25;
        const pad2 = Math.sin(2 * Math.PI * 220.00 * t) * 0.20;
        const pad3 = Math.sin(2 * Math.PI * 261.63 * t) * 0.20;
        const chimeT = t % 2.5;
        const chimeNote = scale[Math.floor(t / 2.5) % scale.length] * 2.0;
        const chimeEnv = Math.exp(-3.0 * chimeT);
        const chime = Math.sin(2 * Math.PI * chimeNote * t) * chimeEnv * 0.25;
        let sampleL = (pad1 + pad2) * lfo1 * 0.5 + chime * 0.4;
        let sampleR = (pad1 + pad3) * lfo2 * 0.5 + chime * 0.4;
        let envM = 1.0;
        if (t < 2.0) envM = t / 2.0;
        if (t > safeDuration - 2.0) envM = Math.max(0, (safeDuration - t) / 2.0);
        left[i] = Math.max(-1, Math.min(1, sampleL * 0.70 * envM));
        right[i] = Math.max(-1, Math.min(1, sampleR * 0.70 * envM));
      }
    } else {
      // ⚡ Zamonaviy Lofi Beat
      for (let i = 0; i < frameCount; i++) {
        const t = i / sampleRate;
        const beatT = t % 0.6;
        const step = Math.floor(t / 0.6) % 8;
        let kick = 0;
        if (step === 0 || step === 3) {
          kick = Math.sin(2 * Math.PI * 60 * Math.exp(-12 * beatT) * t) * Math.exp(-10 * beatT) * 0.35;
        }
        let snare = 0;
        if (step === 2 || step === 6) {
          snare = (Math.random() * 2 - 1) * Math.exp(-20 * beatT) * 0.25;
        }
        const subBeatT = t % 0.3;
        const hihat = (Math.random() * 2 - 1) * Math.exp(-40 * subBeatT) * 0.08;
        const chords = [
          [174.61, 220.00, 261.63, 329.63],
          [146.83, 174.61, 220.00, 261.63],
          [220.00, 261.63, 329.63, 392.00]
        ];
        const currentChord = chords[Math.floor(t / 2.4) % chords.length];
        let chordSample = 0;
        currentChord.forEach(f => {
          chordSample += Math.sin(2 * Math.PI * f * t) * 0.08;
        });
        const vinyl = (Math.random() * 2 - 1) * 0.015;
        let sampleL = kick * 0.4 + snare * 0.3 + hihat * 0.2 + chordSample * 0.4 + vinyl;
        let sampleR = kick * 0.4 + snare * 0.3 + hihat * 0.2 + chordSample * 0.4 + vinyl;
        let envM = 1.0;
        if (t < 2.0) envM = t / 2.0;
        if (t > safeDuration - 2.0) envM = Math.max(0, (safeDuration - t) / 2.0);
        left[i] = Math.max(-1, Math.min(1, sampleL * 0.70 * envM));
        right[i] = Math.max(-1, Math.min(1, sampleR * 0.70 * envM));
      }
    }

    return buffer;
  };

  const stopPreviewBgm = () => {
    if (previewBgmSourceRef.current) {
      try { previewBgmSourceRef.current.stop(); } catch {}
      previewBgmSourceRef.current = null;
    }
    setIsPreviewingBgm(false);
  };

  const togglePreviewBgm = async () => {
    if (!audioContext) return;
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    if (isPreviewingBgm) {
      stopPreviewBgm();
    } else {
      if (isPlaying) stopAudioSources();

      const targetBuffer = bgmStyle === 'custom' ? customBgmBuffer : bgmBuffer;
      if (!targetBuffer) return;

      const source = audioContext.createBufferSource();
      source.buffer = targetBuffer;
      source.loop = true;
      const gain = audioContext.createGain();
      gain.gain.value = bgmVolume;
      source.connect(gain);
      gain.connect(audioContext.destination);
      source.start(0);

      previewBgmSourceRef.current = source;
      previewBgmGainRef.current = gain;
      setIsPreviewingBgm(true);
    }
  };

  const handleCustomBgmUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const arrayBuffer = evt.target?.result as ArrayBuffer;
        const ctx = audioContext || new (window.AudioContext || (window as any).webkitAudioContext)();
        const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);
        setAudioContext(ctx);
        setCustomBgmBuffer(decodedBuffer);
        setCustomBgmName(file.name);
        setBgmStyle('custom');
        setBgmBuffer(decodedBuffer);
      } catch (err) {
        console.error("Custom BGM upload failed:", err);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Re-generate or switch BGM when style changes
  useEffect(() => {
    if (!audioContext || !audioBuffer) return;
    if (bgmStyle === 'custom') {
      if (customBgmBuffer) {
        setBgmBuffer(customBgmBuffer);
      }
      return;
    }
    const bgm = createProceduralBGMBuffer(audioContext, audioBuffer.duration, bgmStyle);
    setBgmBuffer(bgm);
  }, [bgmStyle, audioContext, audioBuffer, customBgmBuffer]);

  // 1. Initialize Audio
  useEffect(() => {
    let isCancelled = false;
    const initAudio = async () => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        
        let buffer: AudioBuffer;
        if (audioBase64 && audioBase64.trim().length > 0) {
          try {
            const bytes = decode(audioBase64.trim());
            buffer = pcmToAudioBuffer(bytes, ctx);
          } catch (pcmErr) {
            console.warn("PCM audio parsing failed, creating fallback buffer:", pcmErr);
            const estDur = Math.max(16, (scriptSegments?.length || 4) * 5.5);
            buffer = createSilentAudioBuffer(ctx, estDur);
          }
        } else {
          // No voice audio provided (e.g., loaded saved project or TTS offline)
          const estDur = Math.max(16, (scriptSegments?.length || 4) * 5.5);
          buffer = createSilentAudioBuffer(ctx, estDur);
        }

        const bgm = createProceduralBGMBuffer(ctx, buffer.duration, bgmStyle);
        
        if (!isCancelled) {
          setAudioContext(ctx);
          setAudioBuffer(buffer);
          setBgmBuffer(bgm);
          setDuration(buffer.duration);
        }
      } catch (e) {
        console.error("Audio initialization failed:", e);
      }
    };
    initAudio();
    
    // Initialize rich golden particles & shimmering dust
    const particles: Particle[] = [];
    const goldPalette = ['#ffffff', '#fef08a', '#fbbf24', '#f59e0b', '#d97706'];
    for (let i = 0; i < 75; i++) {
        particles.push({
            x: Math.random() * WIDTH,
            y: Math.random() * HEIGHT,
            size: Math.random() * 3.5 + 1.2,
            speedY: Math.random() * -2.2 - 0.8,
            speedX: (Math.random() - 0.5) * 1.4,
            opacity: Math.random() * 0.6 + 0.25,
            phase: Math.random() * Math.PI * 2,
            color: goldPalette[Math.floor(Math.random() * goldPalette.length)],
            pulseSpeed: Math.random() * 3.5 + 2.0,
            isSparkle: Math.random() > 0.60
        });
    }
    particlesRef.current = particles;
    
    return () => {
      isCancelled = true;
      // Do NOT close audioContext here! Closing it permanently disables audio upon component re-render.
    };
  }, [audioBase64, scriptSegments]);

  // 2. Pre-process Images (Resize & Generate Random Motion)
  useEffect(() => {
    let isCancelled = false;
    const fallbackWallpapers = [
      "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=1080&q=80",
      "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1080&q=80",
      "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1080&q=80",
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1080&q=80"
    ];
    const validImages = (images && images.length > 0) ? images : fallbackWallpapers;

    const processImages = async () => {
      const promises = validImages.map((src, index) => {
        return new Promise<ProcessedImageLayer>((resolve) => {
          const img = new Image();
          if (src && !src.startsWith("data:")) {
            img.crossOrigin = "anonymous";
          }
          img.src = src;
          
          img.onload = () => {
            const offCanvas = document.createElement('canvas');
            // Use Buffer Size
            offCanvas.width = BUFFER_W;
            offCanvas.height = BUFFER_H;
            const ctx = offCanvas.getContext('2d');
            
            if(ctx) {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'medium'; // Optimized for performance

                // "Cover" fit logic for the buffer size
                const imgRatio = img.naturalWidth / img.naturalHeight;
                const targetRatio = BUFFER_W / BUFFER_H;
                let dw, dh, dx, dy;
                
                if (imgRatio > targetRatio) {
                    dh = BUFFER_H;
                    dw = BUFFER_H * imgRatio;
                    dy = 0;
                    dx = (BUFFER_W - dw) / 2;
                } else {
                    dw = BUFFER_W;
                    dh = BUFFER_W / imgRatio;
                    dx = 0;
                    dy = (BUFFER_H - dh) / 2;
                }
                ctx.drawImage(img, dx, dy, dw, dh);
            }

            const maxOffsetX = BUFFER_W - WIDTH;
            const maxOffsetY = BUFFER_H - HEIGHT;
            const transitionType = index % 5;

            // Name frames: Frame 0 (intro hook) and Frame 3 / last frame (climax outro)
            const isNameFrame = (index === 0 || index === (validImages.length - 1) || index === 3);

            let startX = 0, startY = 0, startScale = 1.0;
            let endX = 0, endY = 0, endScale = 1.15;
            let focusY = HEIGHT * 0.42;

            if (isNameFrame) {
                if (index === 0) {
                    // Majestic, slow, cinematic push-in toward the 3D name art sculpture
                    startX = -maxOffsetX / 2; startY = -maxOffsetY * 0.35; startScale = 1.0;
                    endX = -maxOffsetX / 2; endY = -maxOffsetY * 0.35; endScale = 1.20;
                    focusY = HEIGHT * 0.42;
                } else {
                    // Triumphant outro zoom-in & gentle rising camera toward the horizon name
                    startX = -maxOffsetX / 2; startY = -maxOffsetY * 0.45; startScale = 1.02;
                    endX = -maxOffsetX / 2; endY = -maxOffsetY * 0.28; endScale = 1.22;
                    focusY = HEIGHT * 0.42;
                }
            } else {
                // Atmospheric scenery frames: smooth horizontal cinematic panning & drift
                focusY = HEIGHT / 2;
                if (index % 2 === 1) {
                    // Pan left to right with gentle scale
                    startX = -maxOffsetX * 0.85; startY = -maxOffsetY / 2; startScale = 1.08;
                    endX = -maxOffsetX * 0.15; endY = -maxOffsetY / 2; endScale = 1.13;
                } else {
                    // Pan right to left with gentle scale
                    startX = -maxOffsetX * 0.15; startY = -maxOffsetY / 2; startScale = 1.13;
                    endX = -maxOffsetX * 0.85; endY = -maxOffsetY / 2; endScale = 1.08;
                }
            }

            resolve({
                canvas: offCanvas,
                motion: { startX, startY, startScale, endX, endY, endScale, focusY },
                transitionType
            });
          };

          img.onerror = () => {
            const c = document.createElement('canvas');
            c.width = BUFFER_W; c.height = BUFFER_H;
            const ctx = c.getContext('2d');
            if (ctx) {
              // Rich 3D Black & Gold Radial Gradient
              const grad = ctx.createRadialGradient(BUFFER_W / 2, BUFFER_H / 2, 100, BUFFER_W / 2, BUFFER_H / 2, BUFFER_H * 0.7);
              grad.addColorStop(0, '#2d1f0d');
              grad.addColorStop(1, '#050302');
              ctx.fillStyle = grad;
              ctx.fillRect(0, 0, BUFFER_W, BUFFER_H);

              // Golden sparkles
              ctx.fillStyle = '#fbbf24';
              for (let p = 0; p < 40; p++) {
                ctx.globalAlpha = Math.random() * 0.5 + 0.2;
                ctx.beginPath();
                ctx.arc(Math.random() * BUFFER_W, Math.random() * BUFFER_H, Math.random() * 4 + 1, 0, Math.PI * 2);
                ctx.fill();
              }
              ctx.globalAlpha = 1.0;

              // Glowing Gold Name Typography
              const goldGrad = ctx.createLinearGradient(BUFFER_W / 2 - 200, 0, BUFFER_W / 2 + 200, 0);
              goldGrad.addColorStop(0, '#fef08a');
              goldGrad.addColorStop(0.5, '#fbbf24');
              goldGrad.addColorStop(1, '#d97706');
              ctx.fillStyle = goldGrad;
              ctx.font = '900 110px Inter, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.shadowColor = 'rgba(251, 191, 36, 0.5)';
              ctx.shadowBlur = 30;
              ctx.fillText(topic || 'ISMLAR MA\'NOSI', BUFFER_W / 2, BUFFER_H / 2);
            }
            resolve({
                canvas: c,
                motion: { startX:0, startY:0, startScale:1, endX:0, endY:0, endScale:1 },
                transitionType: 0
            });
          };
        });
      });
      const loaded = await Promise.all(promises);
      if (!isCancelled) {
        setProcessedLayers(loaded);
      }
    };
    processImages();
    return () => {
      isCancelled = true;
    };
  }, [images, topic]);

  // How long the closing Luxe Core line takes to speak. Subtitles are laid out across the time
  // before it, so this value decides where every caption lands.
  //
  // Measured against the live TTS: the closing line runs at ~12.5 characters per second, while
  // the script body averages ~11.2 — it is plain narration where the script is full of
  // exclamations and dramatic pauses. Sizing the outro from its share of the script therefore
  // overshoots (8.89s against a true 7.96s in a real export); sizing it from its own character
  // count and its own rate lands within a few hundredths, and still tracks an edited outro.
  const OUTRO_CHARS_PER_SECOND = 12.5;
  const outroDuration = useMemo(() => {
    if (!duration) return OUTRO_DURATION;
    const outroChars = (outroText || "").trim().length;
    if (!outroChars) return Math.min(OUTRO_DURATION, duration * 0.25);
    // Clamp so an empty or runaway outro can't swallow the video or vanish entirely.
    return Math.min(Math.max(outroChars / OUTRO_CHARS_PER_SECOND, 2), duration * 0.4);
  }, [duration, outroText]);

  // 3. Subtitle Calculation (scaled by currentSpeed)
  const preparedSubtitles = useMemo<PreparedSubtitle[]>(() => {
    if (!scriptSegments.length || duration === 0) return [];

    const effectiveDuration = duration / currentSpeed;
    const effectiveOutroDuration = outroDuration / currentSpeed;

    // Subtitles cover everything up to the point the outro line starts being spoken.
    const nameDuration = Math.max(1, effectiveDuration - effectiveOutroDuration);
    const totalCharsInScript = scriptSegments.reduce((acc, seg) => acc + seg.length, 0);
    let globalElapsed = 0;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    
    const fontSize = 54; 
    ctx.font = `900 ${fontSize}px Inter, sans-serif`;
    const maxWidth = WIDTH - 160;

    // Only trust the aligner if it covers every segment; a partial result would mix real and
    // estimated timings on the same line and read worse than either on its own.
    const aligned = wordTimings && wordTimings.length === scriptSegments.length
      ? wordTimings
      : null;

    return scriptSegments.map((segmentText, segmentIndex) => {
      const rawWords = segmentText.split(/\s+/).filter(Boolean);
      const realTimes = aligned && aligned[segmentIndex]?.length === rawWords.length
        ? aligned[segmentIndex]
        : null;

      if (realTimes) {
        const first = realTimes.find(Boolean);
        const last = [...realTimes].reverse().find(Boolean);
        const wordTimingsForSegment: WordTiming[] = rawWords.map((word, i) => {
          const t = realTimes[i];
          const rawStart = t ? t.start : (first ? first.start : 0);
          const rawEnd = t ? t.end : (last ? last.end : 0);
          return {
            word,
            start: rawStart / currentSpeed,
            end: rawEnd / currentSpeed,
            width: ctx.measureText(word).width,
          };
        });
        return {
          start: (first ? first.start : 0) / currentSpeed,
          end: (last ? last.end : 0) / currentSpeed,
          lines: buildLines(wordTimingsForSegment, maxWidth),
        };
      }

      const segmentCharCount = segmentText.length;
      const segmentProportion = segmentCharCount / totalCharsInScript;
      const segmentDuration = nameDuration * segmentProportion;
      const segmentStart = globalElapsed;
      const segmentEnd = segmentStart + segmentDuration;
      globalElapsed += segmentDuration;

      const totalCharsInSeg = segmentText.replace(/\s/g, '').length;

      let currentWordTime = segmentStart;

      const wordTimings: WordTiming[] = rawWords.map(word => {
         const wLen = word.length;
         const wDuration = (wLen / totalCharsInSeg) * segmentDuration;
         const start = currentWordTime;
         const end = start + wDuration;
         currentWordTime = end;
         return { word, start, end, width: ctx.measureText(word).width };
      });

      return { start: segmentStart, end: segmentEnd, lines: buildLines(wordTimings, maxWidth) };
    });
  }, [scriptSegments, duration, outroDuration, wordTimings, currentSpeed]);


  const drawLayer = useCallback((ctx: CanvasRenderingContext2D, layer: ProcessedImageLayer, progress: number, opacity: number) => {
    const { canvas, motion } = layer;
    const { startX, startY, startScale, endX, endY, endScale, focusY = HEIGHT / 2 } = motion;

    // Sinusoidal ease-in-out curve for cinematic, organic camera motion
    const p = Math.max(0, Math.min(1, progress));
    const ease = (1 - Math.cos(p * Math.PI)) / 2;
    // Micro parallax drift on secondary axis
    const subtleParallax = Math.sin(p * Math.PI) * 4;

    const currentX = startX + (endX - startX) * ease + subtleParallax;
    const currentY = startY + (endY - startY) * ease - subtleParallax * 0.5;
    const currentScale = startScale + (endScale - startScale) * ease;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(WIDTH / 2, focusY);
    ctx.scale(currentScale, currentScale);
    ctx.translate(-WIDTH / 2, -focusY);
    ctx.drawImage(canvas, currentX, currentY);
    ctx.restore();
  }, [BUFFER_W, BUFFER_H]); 

  // 4. Main Draw Function
  const draw = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas || processedLayers.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const effectiveDuration = duration > 0 ? duration / currentSpeed : 0;
    const effectiveOutroDuration = outroDuration / currentSpeed;

    // --- Luxe Core Outro Check (starts when the closing line starts being spoken) ---
    const isOutro = effectiveDuration > effectiveOutroDuration && time >= (effectiveDuration - effectiveOutroDuration);

    if (isOutro) {
        const outroTime = time - (effectiveDuration - effectiveOutroDuration); // ranges from 0 to effectiveOutroDuration
        const productDuration = Math.min(5.0 / currentSpeed, effectiveOutroDuration * 0.55);
        
        if (outroTime < productDuration) {
            // "Avval quti, paket, lenta va bir martalik idishlardan tez kadrlar ko‘rinsin"
            // Show product advert frames for 5.0 seconds (3 seconds longer so viewers can clearly see products)
            const activeImages = outroImagesRef.current.filter(img => img && img.complete);
            const imgCount = activeImages.length;
            
            if (imgCount > 0) {
                const frameDuration = productDuration / imgCount;
                const frameIndex = Math.floor(outroTime / frameDuration) % imgCount;
                const img = activeImages[frameIndex];
                
                if (img) {
                    const imgRatio = img.naturalWidth / img.naturalHeight;
                    const targetRatio = WIDTH / HEIGHT;
                    let dw, dh, dx, dy;
                    
                    if (imgRatio > targetRatio) {
                        dh = HEIGHT;
                        dw = HEIGHT * imgRatio;
                        dy = 0;
                        dx = (WIDTH - dw) / 2;
                    } else {
                        dw = WIDTH;
                        dh = WIDTH / imgRatio;
                        dx = 0;
                        dy = (HEIGHT - dh) / 2;
                    }
                    
                    // Add a very subtle zoom-in/pan for a dynamic look
                    const localProgress = (outroTime % frameDuration) / frameDuration;
                    const scale = 1.0 + 0.08 * localProgress;
                    
                    ctx.save();
                    ctx.translate(WIDTH / 2, HEIGHT / 2);
                    ctx.scale(scale, scale);
                    ctx.translate(-WIDTH / 2, -HEIGHT / 2);
                    
                    // Smooth crossfades between the ad frames
                    if (outroTime < 0.4) {
                        ctx.globalAlpha = outroTime / 0.4;
                    } else if (outroTime % frameDuration < 0.25 && frameIndex > 0) {
                        ctx.globalAlpha = (outroTime % frameDuration) / 0.25;
                    }
                    
                    ctx.drawImage(img, dx, dy, dw, dh);
                    ctx.restore();
                }
            } else {
                ctx.fillStyle = '#050302';
                ctx.fillRect(0, 0, WIDTH, HEIGHT);
            }
        } else {
            // "so‘ng qora-oltin fonda logo va akkaunt nomi chiqsin."
            // Black-and-gold luxury gradient background
            const bgGradient = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 100, WIDTH / 2, HEIGHT / 2, HEIGHT * 0.7);
            bgGradient.addColorStop(0, '#1d150b'); // Warm glowing amber-black center
            bgGradient.addColorStop(1, '#050302'); // Rich deep black edges
            ctx.fillStyle = bgGradient;
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
            
            // Draw luxury golden floating dust/particles
            ctx.fillStyle = '#fbbf24';
            particlesRef.current.forEach(p => {
                ctx.globalAlpha = p.opacity * 0.7;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * 1.5, 0, Math.PI * 2);
                ctx.fill();
                
                // slow gold particle drift
                p.y += p.speedY * 0.35;
                p.x += p.speedX * 0.2;
                if (p.y < 0) {
                    p.y = HEIGHT;
                    p.x = Math.random() * WIDTH;
                }
            });
            ctx.globalAlpha = 1;
            
            // Outro logo transition (starts after product frames, smooth entrance transition)
            const entranceDuration = Math.min(1.5 / currentSpeed, (effectiveOutroDuration - productDuration) * 0.4);
            const sceneProgress = Math.min(1.0, Math.max(0, (outroTime - productDuration) / Math.max(0.1, entranceDuration)));
            const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
            const animatedProgress = easeOut(sceneProgress);
            
            ctx.save();
            ctx.translate(0, 40 * (1 - animatedProgress));
            ctx.globalAlpha = animatedProgress;
            
            // 1. Luxury Concentric Gold Circular Logo Emblem (Enlarged and refined)
            const centerY = HEIGHT * 0.31;
            
            const goldGrad = ctx.createLinearGradient(WIDTH / 2 - 170, centerY - 170, WIDTH / 2 + 170, centerY + 170);
            goldGrad.addColorStop(0, '#fef08a'); // gold light
            goldGrad.addColorStop(0.3, '#fbbf24'); // gold medium
            goldGrad.addColorStop(0.5, '#f59e0b'); // gold dark
            goldGrad.addColorStop(0.7, '#d97706'); // gold shadow
            goldGrad.addColorStop(1, '#fef08a'); // gold light reflection

            // Shadows for luxury glowing feel
            ctx.shadowColor = 'rgba(251, 191, 36, 0.45)';
            ctx.shadowBlur = 24;

            // Outer circle (enlarged: 205px radius)
            ctx.strokeStyle = goldGrad;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(WIDTH / 2, centerY, 205, 0, Math.PI * 2);
            ctx.stroke();

            // Inner circle (enlarged: 198px radius)
            ctx.lineWidth = 5.5;
            ctx.beginPath();
            ctx.arc(WIDTH / 2, centerY, 198, 0, Math.PI * 2);
            ctx.stroke();

            // Sparkle on top-right circle border
            ctx.fillStyle = '#ffffff';
            ctx.font = '40px "Inter", sans-serif';
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'rgba(255,255,255,0.9)';
            ctx.fillText('✨', WIDTH / 2 + 140, centerY - 140);

            // Draw Monogram "L" and "C" beautifully overlapping (Enlarged font 175px)
            ctx.fillStyle = goldGrad;
            ctx.font = '500 175px "Playfair Display", "Georgia", serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // "L" (Left aligned, slightly up)
            ctx.fillText('L', WIDTH / 2 - 45, centerY - 28);
            
            // "C" (Right aligned, slightly down and overlapping the L)
            ctx.fillText('C', WIDTH / 2 + 35, centerY + 22);

            // "LUXE CORE" bottom-centered inside the circles
            ctx.font = '600 30px "Inter", "Playfair Display", sans-serif';
            ctx.fillText('L U X E   C O R E', WIDTH / 2, centerY + 115);

            // "— UZ —" bottom-centered inside the circles
            ctx.font = '500 20px "Inter", "Playfair Display", sans-serif';
            ctx.fillText('—   U Z   —', WIDTH / 2, centerY + 152);

            // --- Reset Shadows for Next Texts ---
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;

            // 2. Main Title Name under emblem with golden linear gradient
            const goldGradText = ctx.createLinearGradient(WIDTH / 2 - 220, 0, WIDTH / 2 + 220, 0);
            goldGradText.addColorStop(0, '#fef08a');
            goldGradText.addColorStop(0.5, '#fbbf24');
            goldGradText.addColorStop(1, '#d97706');
            
            ctx.fillStyle = goldGradText;
            ctx.font = '900 90px "Inter", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.65)';
            ctx.shadowBlur = 12;
            ctx.shadowOffsetY = 4;
            ctx.fillText(adTitle || 'LUXE CORE', WIDTH / 2, HEIGHT * 0.54);
            
            // 3. Subtitle
            ctx.fillStyle = '#f1f5f9';
            ctx.font = '600 36px "Inter", sans-serif';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetY = 2;
            ctx.fillText(adSubtitle || 'Qutilar  •  Paketlar  •  Qadoqlash  •  HoReCa', WIDTH / 2, HEIGHT * 0.60);
            
            // 4. Contact / Account capsule
            const handleText = adHandle || '@luxe_core_uz';
            ctx.font = 'bold 38px "Inter", sans-serif';
            const handleMetrics = ctx.measureText(handleText + '  📱');
            
            const capY = HEIGHT * 0.68;
            const capW = Math.max(480, handleMetrics.width + 100);
            const capH = 88;
            const capX = WIDTH / 2 - capW / 2;
            
            ctx.shadowBlur = 24;
            ctx.shadowColor = 'rgba(245, 158, 11, 0.4)';
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 3.5;
            
            ctx.beginPath();
            const capR = capH / 2;
            ctx.moveTo(capX + capR, capY);
            ctx.lineTo(capX + capW - capR, capY);
            ctx.quadraticCurveTo(capX + capW, capY, capX + capW, capY + capR);
            ctx.lineTo(capX + capW, capY + capH - capR);
            ctx.quadraticCurveTo(capX + capW, capY + capH, capX + capW - capR, capY + capH);
            ctx.lineTo(capX + capR, capY + capH);
            ctx.quadraticCurveTo(capX, capY + capH, capX, capY + capH - capR);
            ctx.lineTo(capX, capY + capR);
            ctx.quadraticCurveTo(capX, capY, capX + capR, capY);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 38px "Inter", sans-serif';
            ctx.shadowBlur = 0;
            ctx.fillText(`📱 ${handleText}`, WIDTH / 2, capY + capH / 2);
            
            ctx.restore();
        }
        return; // Early return for outro
    }

    // --- Normal Slides Presentation ---
    const totalImages = processedLayers.length;
    const nameDuration = effectiveDuration > effectiveOutroDuration ? effectiveDuration - effectiveOutroDuration : (effectiveDuration > 0 ? effectiveDuration : 5);
    const slotDuration = nameDuration / totalImages;
    const effectiveFade = Math.min(FADE_DURATION / currentSpeed, slotDuration * 0.35);
    
    let currentIndex = Math.floor(time / slotDuration);
    if (currentIndex >= totalImages) currentIndex = totalImages - 1;
    if (currentIndex < 0) currentIndex = 0;

    const nextIndex = (currentIndex + 1) < totalImages ? currentIndex + 1 : currentIndex;
    const timeInSlot = time - (currentIndex * slotDuration);
    const progress = timeInSlot / slotDuration;

    drawLayer(ctx, processedLayers[currentIndex], progress, 1);

    if (timeInSlot > (slotDuration - effectiveFade) && nextIndex !== currentIndex) {
       const fadeTime = timeInSlot - (slotDuration - effectiveFade);
       const fadeProgress = fadeTime / effectiveFade;
       
       const transType = processedLayers[nextIndex].transitionType;
       
       ctx.save();
       if (transType === 0) {
           // Crossfade with smooth zoom-through
           ctx.translate(WIDTH / 2, HEIGHT / 2);
           const zoom = 1.0 + 0.05 * (1 - fadeProgress);
           ctx.scale(zoom, zoom);
           ctx.translate(-WIDTH / 2, -HEIGHT / 2);
           drawLayer(ctx, processedLayers[nextIndex], 0, fadeProgress);
       } else if (transType === 1) {
           // Slide Left
           ctx.translate(WIDTH * (1 - fadeProgress), 0);
           drawLayer(ctx, processedLayers[nextIndex], 0, 1);
       } else if (transType === 2) {
           // Slide Up
           ctx.translate(0, HEIGHT * (1 - fadeProgress));
           drawLayer(ctx, processedLayers[nextIndex], 0, 1);
       } else if (transType === 3) {
           // Zoom-Through Dissolve
           ctx.translate(WIDTH / 2, HEIGHT / 2);
           const scale = 0.85 + 0.15 * fadeProgress;
           ctx.scale(scale, scale);
           ctx.translate(-WIDTH / 2, -HEIGHT / 2);
           drawLayer(ctx, processedLayers[nextIndex], 0, fadeProgress);
       } else if (transType === 4) {
           // Warm Lens Flare Burst & Crossfade
           drawLayer(ctx, processedLayers[nextIndex], 0, fadeProgress);
           const flareGrad = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 40, WIDTH / 2, HEIGHT / 2, HEIGHT * 0.6);
           flareGrad.addColorStop(0, `rgba(255, 245, 225, ${Math.sin(fadeProgress * Math.PI) * 0.85})`);
           flareGrad.addColorStop(0.4, `rgba(251, 191, 36, ${Math.sin(fadeProgress * Math.PI) * 0.45})`);
           flareGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
           ctx.fillStyle = flareGrad;
           ctx.fillRect(0, 0, WIDTH, HEIGHT);
       }
       ctx.restore();

       // Anamorphic Golden Light Leak streak across transition
       const leakIntensity = Math.sin(fadeProgress * Math.PI);
       if (leakIntensity > 0.02) {
         ctx.save();
         const leakGrad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
         leakGrad.addColorStop(0, `rgba(251, 191, 36, ${leakIntensity * 0.45})`);
         leakGrad.addColorStop(0.3, `rgba(245, 158, 11, ${leakIntensity * 0.3})`);
         leakGrad.addColorStop(0.7, `rgba(254, 240, 138, ${leakIntensity * 0.2})`);
         leakGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
         ctx.fillStyle = leakGrad;
         ctx.fillRect(0, 0, WIDTH, HEIGHT);
         ctx.restore();
       }
    }

    // Add Vignette for cinematic look
    const gradient = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.3, WIDTH / 2, HEIGHT / 2, HEIGHT * 0.85);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // --- Golden Sparks & Particle FX (Yaltirash va Uchqunlar) ---
    const isNameSlide = (currentIndex === 0 || currentIndex === 3 || totalImages <= 2);

    // 1. Soft breathing volumetric golden aura behind the 3D name art
    if (isNameSlide) {
      const auraPulse = 0.88 + 0.12 * Math.sin(time * 2.5);
      const auraGrad = ctx.createRadialGradient(
        WIDTH / 2, HEIGHT * 0.42, 25,
        WIDTH / 2, HEIGHT * 0.42, 450 * auraPulse
      );
      auraGrad.addColorStop(0, 'rgba(254, 240, 138, 0.20)');
      auraGrad.addColorStop(0.35, 'rgba(251, 191, 36, 0.12)');
      auraGrad.addColorStop(0.70, 'rgba(217, 119, 6, 0.04)');
      auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.save();
      ctx.fillStyle = auraGrad;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.restore();
    }

    // 2. Rich floating golden dust, embers & sparkling particles
    particlesRef.current.forEach(p => {
        const flicker = 0.65 + 0.35 * Math.sin(time * p.pulseSpeed + p.phase);
        const alpha = Math.min(1, Math.max(0, p.opacity * flicker));

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = p.size * 3.5;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        // Mini sparkle cross on glittering particles
        if (p.isSparkle && p.size > 2.0 && flicker > 0.82) {
            const s = p.size * 2.2;
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#fef08a';
            ctx.shadowBlur = 8;
            ctx.fillRect(p.x - s, p.y - 0.75, s * 2, 1.5);
            ctx.fillRect(p.x - 0.75, p.y - s, 1.5, s * 2);
        }
        ctx.restore();

        // Organic physics: gentle upward drift with soft horizontal sine-wave breeze
        p.y += p.speedY;
        p.x += p.speedX + Math.sin(time * 1.6 + p.phase) * 0.65;

        if (p.y < -20) {
            p.y = HEIGHT + 15;
            p.x = Math.random() * WIDTH;
        }
        if (p.x < -20) p.x = WIDTH + 10;
        if (p.x > WIDTH + 20) p.x = -10;
    });

    // 3. Twinkling Starburst Flares directly across the 3D name typography
    if (isNameSlide) {
      const glints = [
        { x: WIDTH * 0.35, y: HEIGHT * 0.40, phase: 0.0, baseSize: 15 },
        { x: WIDTH * 0.65, y: HEIGHT * 0.38, phase: 2.1, baseSize: 17 },
        { x: WIDTH * 0.50, y: HEIGHT * 0.43, phase: 4.2, baseSize: 19 },
        { x: WIDTH * 0.26, y: HEIGHT * 0.42, phase: 1.3, baseSize: 14 },
        { x: WIDTH * 0.74, y: HEIGHT * 0.41, phase: 3.4, baseSize: 16 },
      ];

      glints.forEach(g => {
        const wave = Math.sin(time * 3.4 + g.phase);
        if (wave > 0.25) {
          const intensity = (wave - 0.25) / 0.75; // 0 to 1
          const glintSize = g.baseSize * (0.6 + 0.4 * intensity);
          const glintAlpha = Math.min(1, intensity * 1.3);
          const rotAngle = (time * 0.75 + g.phase);

          ctx.save();
          ctx.translate(g.x, g.y);
          ctx.rotate(rotAngle);
          ctx.globalAlpha = glintAlpha;
          ctx.shadowColor = '#fef08a';
          ctx.shadowBlur = 18;
          ctx.fillStyle = '#ffffff';

          // Horizontal diamond beam
          ctx.beginPath();
          ctx.ellipse(0, 0, glintSize * 2.5, glintSize * 0.26, 0, 0, Math.PI * 2);
          ctx.fill();

          // Vertical diamond beam
          ctx.beginPath();
          ctx.ellipse(0, 0, glintSize * 0.26, glintSize * 2.5, 0, 0, Math.PI * 2);
          ctx.fill();

          // Diagonal soft secondary glints
          ctx.rotate(Math.PI / 4);
          ctx.globalAlpha = glintAlpha * 0.55;
          ctx.beginPath();
          ctx.ellipse(0, 0, glintSize * 1.4, glintSize * 0.2, 0, 0, Math.PI * 2);
          ctx.ellipse(0, 0, glintSize * 0.2, glintSize * 1.4, 0, 0, Math.PI * 2);
          ctx.fill();

          // Brilliant central core
          ctx.globalAlpha = glintAlpha;
          ctx.beginPath();
          ctx.arc(0, 0, glintSize * 0.45, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        }
      });
    }

    // --- Subtitles ---
    const activeSubtitle = preparedSubtitles.find(s => time >= s.start && time < s.end);

    if (activeSubtitle) {
        const fontSize = 54;
        ctx.font = `900 ${fontSize}px Inter, sans-serif`;
        ctx.textBaseline = 'middle';

        ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 4;

        const activeLineIndex = activeSubtitle.lines.findIndex(line => {
            const lineStart = line.words[0].start;
            const lineEnd = line.words[line.words.length - 1].end;
            return time >= lineStart && time <= lineEnd + 0.2;
        });

        const indexToShow = activeLineIndex !== -1 ? activeLineIndex : 
                            (time > activeSubtitle.lines[0].words[0].start ? activeSubtitle.lines.length - 1 : 0);

        const line = activeSubtitle.lines[indexToShow];
        
        if (line) {
             // Instagram Reels Safe Zone: ~450px from bottom
             const yPos = HEIGHT - 450; 
             let currentX = (WIDTH - line.totalWidth) / 2;

             // Optional backdrop pill for Instagram Classic White mode
             if (captionStyle === CaptionStyle.INSTAGRAM_WHITE) {
               const padX = 32;
               const padY = 22;
               const pillW = line.totalWidth + padX * 2;
               const pillH = fontSize + padY;
               const pillX = (WIDTH - pillW) / 2;
               const pillY = yPos - pillH / 2;
               
               ctx.save();
               ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
               ctx.beginPath();
               if (ctx.roundRect) {
                 ctx.roundRect(pillX, pillY, pillW, pillH, 24);
               } else {
                 ctx.rect(pillX, pillY, pillW, pillH);
               }
               ctx.fill();
               ctx.restore();
             }

             // Lay the line out up front, then paint the active word's highlight badge before
             // any glyphs. Drawn inline, the badge lands on top of whichever neighbour it
             // overlaps once the word pops past its own box.
             const wordX: number[] = [];
             {
                let x = currentX;
                line.words.forEach((wt) => { wordX.push(x); x += (wt.width || 0) + CAPTION_WORD_GAP; });
             }

             const popFor = (wt: WordTiming) => {
                if (!(time >= wt.start && time < wt.end)) return { scaleX: 1.0, scaleY: 1.0, yOffset: 0 };
                // CapCut / TikTok Spring Pop & Bounce Animation
                const wordDuration = Math.max(0.1, wt.end - wt.start);
                const activeProgress = Math.min(1, Math.max(0, (time - wt.start) / wordDuration));
                const curve = Math.sin(activeProgress * Math.PI);

                // Grow freely upwards, but cap sideways growth: a wide word scaled 1.22x pushes
                // its badge far past the inter-word gap and collides with its neighbours.
                // Free space per side is the gap minus the padding the badge already occupies.
                const badgeW = (wt.width || 0) + CAPTION_BADGE_PAD_X * 2;
                const slack = Math.max(0, CAPTION_WORD_GAP - CAPTION_BADGE_PAD_X);
                const maxGrowX = Math.min(0.22, (slack * 2) / Math.max(1, badgeW));

                return {
                    scaleX: 1.0 + maxGrowX * curve,
                    scaleY: 1.0 + 0.22 * curve,
                    yOffset: -4 * curve // Subtle float
                };
             };

             const badgeFill: Record<string, { fill: string; glow: string }> = {
                [CaptionStyle.INSTAGRAM_WHITE]: { fill: '#ffffff', glow: 'rgba(255, 255, 255, 0.8)' },
                [CaptionStyle.NEON_GLOW]: { fill: '#06b6d4', glow: 'rgba(6, 182, 212, 0.9)' },
                [CaptionStyle.TIKTOK_YELLOW]: { fill: '#facc15', glow: 'rgba(250, 204, 21, 0.75)' },
                [CaptionStyle.HORMOZI_GREEN]: { fill: '#22c55e', glow: 'rgba(34, 197, 94, 0.95)' },
                [CaptionStyle.ROYAL_GOLD]: { fill: '#fbbf24', glow: 'rgba(251, 191, 36, 0.95)' }
             };

             line.words.forEach((wt, idx) => {
                if (!(time >= wt.start && time < wt.end)) return;
                const style = badgeFill[captionStyle] || badgeFill[CaptionStyle.TIKTOK_YELLOW];
                const { scaleX, scaleY, yOffset } = popFor(wt);
                const wWidth = wt.width || 0;
                const cx = wordX[idx] + wWidth / 2;
                const cy = yPos + yOffset;
                const bW = wWidth + CAPTION_BADGE_PAD_X * 2;
                const bH = fontSize + 14;

                ctx.save();
                ctx.translate(cx, cy);
                ctx.scale(scaleX, scaleY);
                ctx.translate(-cx, -cy);
                ctx.fillStyle = style.fill;
                ctx.shadowColor = style.glow;
                ctx.shadowBlur = 24;
                ctx.beginPath();
                if (ctx.roundRect) {
                  ctx.roundRect(wordX[idx] - CAPTION_BADGE_PAD_X, cy - bH / 2, bW, bH, 18);
                } else {
                  ctx.rect(wordX[idx] - CAPTION_BADGE_PAD_X, cy - bH / 2, bW, bH);
                }
                ctx.fill();
                ctx.restore();
             });

             line.words.forEach((wt, idx) => {
                const isWordActive = time >= wt.start && time < wt.end;

                ctx.save();

                const { scaleX, scaleY, yOffset } = popFor(wt);

                currentX = wordX[idx];
                const wWidth = wt.width || 0;
                const wordCenterX = currentX + wWidth / 2;
                const wordCenterY = yPos + yOffset;

                ctx.translate(wordCenterX, wordCenterY);
                ctx.scale(scaleX, scaleY);
                ctx.translate(-wordCenterX, -wordCenterY);

                // Badges were already painted in the pass above, so this only draws glyphs.
                ctx.font = `900 ${fontSize}px "Inter", sans-serif`;

                if (captionStyle === CaptionStyle.HORMOZI_GREEN) {
                  // Alex Hormozi Signature Style (Ultra-Vibrant Green Badge + Punchy Contrast)
                  if (isWordActive) {
                    ctx.shadowColor = 'transparent';
                    ctx.fillStyle = '#000000'; // High contrast black on green badge
                    ctx.fillText(wt.word, currentX, yPos + yOffset);
                  } else {
                    ctx.lineWidth = 14;
                    ctx.strokeStyle = '#000000';
                    ctx.lineJoin = 'round';
                    ctx.strokeText(wt.word, currentX, yPos + yOffset);

                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(wt.word, currentX, yPos + yOffset);
                  }
                } else if (captionStyle === CaptionStyle.ROYAL_GOLD) {
                  // Royal Gold Luxury Style (Glowing Amber & Gold)
                  if (isWordActive) {
                    ctx.shadowColor = 'transparent';
                    ctx.fillStyle = '#1c1305'; // Deep obsidian on gold badge
                    ctx.fillText(wt.word, currentX, yPos + yOffset);
                  } else {
                    ctx.shadowColor = '#d97706';
                    ctx.shadowBlur = 14;
                    ctx.lineWidth = 10;
                    ctx.strokeStyle = '#78350f';
                    ctx.lineJoin = 'round';
                    ctx.strokeText(wt.word, currentX, yPos + yOffset);

                    ctx.fillStyle = '#fef3c7'; // Rich warm cream
                    ctx.fillText(wt.word, currentX, yPos + yOffset);
                  }
                } else if (captionStyle === CaptionStyle.INSTAGRAM_WHITE) {
                  if (isWordActive) {
                    ctx.shadowColor = 'transparent';
                    ctx.fillStyle = '#000000';
                    ctx.fillText(wt.word, currentX, yPos + yOffset);
                  } else {
                    ctx.shadowColor = 'rgba(0,0,0,0.8)';
                    ctx.shadowBlur = 8;
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
                    ctx.fillText(wt.word, currentX, yPos + yOffset);
                  }
                } else if (captionStyle === CaptionStyle.NEON_GLOW) {
                  if (isWordActive) {
                    ctx.shadowColor = 'transparent';
                    ctx.fillStyle = '#0f172a'; // Dark obsidian text on cyan
                    ctx.fillText(wt.word, currentX, yPos + yOffset);
                  } else {
                    ctx.shadowColor = '#8b5cf6'; // Violet glow
                    ctx.shadowBlur = 16;
                    ctx.lineWidth = 8;
                    ctx.strokeStyle = '#4c1d95';
                    ctx.lineJoin = 'round';
                    ctx.strokeText(wt.word, currentX, yPos + yOffset);
                    ctx.fillStyle = '#e0e7ff';
                    ctx.fillText(wt.word, currentX, yPos + yOffset);
                  }
                } else {
                  // CaptionStyle.TIKTOK_YELLOW (CapCut Standard TikTok Style)
                  if (isWordActive) {
                    ctx.shadowColor = 'transparent';
                    ctx.fillStyle = '#000000';
                    ctx.fillText(wt.word, currentX, yPos + yOffset);
                  } else {
                    ctx.lineWidth = 14;
                    ctx.strokeStyle = '#000000';
                    ctx.lineJoin = 'round';
                    ctx.strokeText(wt.word, currentX, yPos + yOffset);

                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(wt.word, currentX, yPos + yOffset);
                  }
                }
                
                ctx.restore();
              });
        }
    }
    ctx.shadowColor = "transparent";

    // --- Watermark Badge ---
    if (watermarkPosition !== WatermarkPosition.DISABLED) {
        ctx.font = 'bold 30px "Inter", sans-serif';
        const wText = watermarkText || "✨ @luxe_core_uz";
        const wMetrics = ctx.measureText(wText);
        const boxW = Math.max(300, wMetrics.width + 60);
        const boxH = 75;
        
        let x = 0;
        let y = 0;
        let activeColor = { stroke: '#fbbf24', glow: 'rgba(251, 191, 36, 0.7)', bg: 'rgba(15, 23, 42, 0.88)' };

        if (watermarkPosition === WatermarkPosition.TOP_RIGHT) {
            x = WIDTH - boxW - 50;
            y = 100;
        } else if (watermarkPosition === WatermarkPosition.TOP_LEFT) {
            x = 50;
            y = 100;
        } else if (watermarkPosition === WatermarkPosition.BOTTOM_RIGHT) {
            x = WIDTH - boxW - 50;
            y = HEIGHT - 550;
        } else {
            // BOUNCING mode
            const maxValX = WIDTH - boxW;
            const maxValY = HEIGHT - boxH;
            const speedX = 320; 
            const speedY = 240; 
            const startX = 150;
            const startY = 300;
            
            const distX = startX + speedX * time;
            const distY = startY + speedY * time;
            
            const tempX = distX % (2 * maxValX);
            x = tempX < maxValX ? tempX : (2 * maxValX) - tempX;
            
            const tempY = distY % (2 * maxValY);
            y = tempY < maxValY ? tempY : (2 * maxValY) - tempY;
            
            const bouncesX = Math.floor(distX / maxValX);
            const bouncesY = Math.floor(distY / maxValY);
            const colorIndex = (bouncesX + bouncesY) % 4;
            
            const colors = [
                { stroke: '#a78bfa', glow: 'rgba(167, 139, 250, 0.8)', bg: 'rgba(15, 23, 42, 0.85)' },
                { stroke: '#22d3ee', glow: 'rgba(34, 211, 238, 0.8)', bg: 'rgba(15, 23, 42, 0.85)' },
                { stroke: '#facc15', glow: 'rgba(250, 204, 21, 0.8)', bg: 'rgba(15, 23, 42, 0.85)' },
                { stroke: '#34d399', glow: 'rgba(52, 211, 153, 0.8)', bg: 'rgba(15, 23, 42, 0.85)' }
            ];
            activeColor = colors[colorIndex];
        }
        
        ctx.save();
        
        // Shadow for capsule glow
        ctx.shadowColor = activeColor.glow;
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Capsule background
        ctx.fillStyle = activeColor.bg;
        ctx.strokeStyle = activeColor.stroke;
        ctx.lineWidth = 3.5;
        
        ctx.beginPath();
        const radius = boxH / 2;
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + boxW - radius, y);
        ctx.quadraticCurveTo(x + boxW, y, x + boxW, y + radius);
        ctx.lineTo(x + boxW, y + boxH - radius);
        ctx.quadraticCurveTo(x + boxW, y + boxH, x + boxW - radius, y + boxH);
        ctx.lineTo(x + radius, y + boxH);
        ctx.quadraticCurveTo(x, y + boxH, x, y + boxH - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Draw Text
        ctx.shadowBlur = 4;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowOffsetY = 2;
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 30px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(wText, x + boxW / 2, y + boxH / 2);
        
        ctx.restore();
    }

  }, [processedLayers, duration, preparedSubtitles, drawLayer, outroDuration, currentSpeed]);

  const startAudioSources = (
    offset: number, 
    speedOverride?: VoiceSpeed, 
    ctxOverride?: AudioContext, 
    bufOverride?: AudioBuffer
  ) => {
    const ctx = ctxOverride || audioContext;
    const buf = bufOverride || audioBuffer;
    if (!ctx || !buf) return;
    const speed = speedOverride || currentSpeed;

    if (speechSourceRef.current) {
      try { speechSourceRef.current.stop(); } catch {}
      speechSourceRef.current = null;
    }
    if (bgmSourceRef.current) {
      try { bgmSourceRef.current.stop(); } catch {}
      bgmSourceRef.current = null;
    }

    stopPreviewBgm();

    // 1. Speech Audio
    const speechSource = ctx.createBufferSource();
    speechSource.buffer = buf;
    speechSource.playbackRate.value = speed;
    speechSource.connect(ctx.destination);
    const bufferOffset = Math.min(Math.max(0, buf.duration - 0.05), Math.max(0, offset * speed));
    speechSource.start(0, bufferOffset);
    speechSourceRef.current = speechSource;

    // 2. Background Music (if enabled)
    const activeBgm = bgmStyle === 'custom' ? customBgmBuffer : (bgmBuffer || createProceduralBGMBuffer(ctx, buf.duration, bgmStyle));
    if (isBgmEnabled && activeBgm) {
      const bgmSource = ctx.createBufferSource();
      bgmSource.buffer = activeBgm;
      bgmSource.loop = true;
      const bgmGain = ctx.createGain();
      bgmGain.gain.value = bgmVolume;
      bgmSource.connect(bgmGain);
      bgmGain.connect(ctx.destination);
      const bgmOffset = offset % activeBgm.duration;
      bgmSource.start(0, bgmOffset);
      bgmSourceRef.current = bgmSource;
      bgmGainRef.current = bgmGain;
    }

    setStartTime(ctx.currentTime - offset);
  };

  const stopAudioSources = () => {
    if (speechSourceRef.current) {
      try { speechSourceRef.current.stop(); } catch {}
      speechSourceRef.current = null;
    }
    if (bgmSourceRef.current) {
      try { bgmSourceRef.current.stop(); } catch {}
      bgmSourceRef.current = null;
    }
    stopPreviewBgm();
  };

  // Speed Switcher with Smooth Timeline Translation
  const handleSpeedSelect = (newSpeed: VoiceSpeed) => {
    if (newSpeed === currentSpeed) return;
    const wasPlaying = isPlaying;
    if (isPlaying) {
      stopAudioSources();
      setIsPlaying(false);
    }
    const currentVideoTime = currentTimeRef.current;
    // Map current video time to buffer time, then to new speed video time
    const bufferTime = currentVideoTime * currentSpeed;
    const newVideoTime = bufferTime / newSpeed;
    currentTimeRef.current = newVideoTime;

    setCurrentSpeed(newSpeed);
    onVoiceSpeedChange?.(newSpeed);

    if (wasPlaying && audioContext) {
      setTimeout(() => {
        startAudioSources(newVideoTime, newSpeed);
        setIsPlaying(true);
      }, 50);
    } else {
      setTimeout(() => draw(newVideoTime), 0);
    }
  };

  // 5. Animation Loop (Playback)
  const animate = useCallback(() => {
    if (!isPlaying || !audioContext) return;
    
    const now = audioContext.currentTime;
    const time = now - startTime;
    const effectiveDuration = duration > 0 ? duration / currentSpeed : 0;
    
    if (time >= effectiveDuration + 0.15) { 
      setIsPlaying(false);
      currentTimeRef.current = 0;
      stopAudioSources();
      draw(0);
      return;
    }

    currentTimeRef.current = time;

    // Smart Audio Ducking: subtly lower BGM while narration speech is active
    if (bgmGainRef.current && isBgmEnabled) {
      const isSpeaking = preparedSubtitles.some(s => time >= s.start && time < s.end);
      const targetGain = isSpeaking ? bgmVolume * 0.45 : bgmVolume;
      try {
        bgmGainRef.current.gain.setTargetAtTime(targetGain, now, 0.08);
      } catch {}
    }

    draw(time);
    reqRef.current = requestAnimationFrame(animate);
  }, [isPlaying, audioContext, startTime, duration, currentSpeed, draw, preparedSubtitles, isBgmEnabled, bgmVolume]);

  useEffect(() => {
    reqRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(reqRef.current!);
  }, [animate]);

  useEffect(() => {
      if (!isPlaying && processedLayers.length > 0) {
          draw(currentTimeRef.current);
      }
  }, [isPlaying, draw, processedLayers]);

  const togglePlay = async () => {
    try {
      let ctx = audioContext;
      if (!ctx || ctx.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        ctx = new AudioCtx();
        setAudioContext(ctx);
      }

      let buf = audioBuffer;
      if (!buf) {
        const estDur = Math.max(16, (scriptSegments?.length || 4) * 5.5);
        buf = createSilentAudioBuffer(ctx, estDur);
        setAudioBuffer(buf);
        setDuration(buf.duration);
        if (!bgmBuffer) {
          const bgm = createProceduralBGMBuffer(ctx, buf.duration, bgmStyle);
          setBgmBuffer(bgm);
        }
      }

      if (isPlaying) {
        stopAudioSources();
        if (ctx.state === 'running') {
          await ctx.suspend();
        }
        setIsPlaying(false);
      } else {
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        startAudioSources(currentTimeRef.current, currentSpeed, ctx, buf);
        setIsPlaying(true);
      }
    } catch (err) {
      console.error("togglePlay error:", err);
    }
  };

  const handleDownload = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (downloadProgress !== null) return;

      // Clean up previous ready video if exists
      if (readyVideo?.url) {
        URL.revokeObjectURL(readyVideo.url);
        setReadyVideo(null);
      }
      setIsReadyModalOpen(false);

      setDownloadProgress(0);
      if (isPlaying) setIsPlaying(false);

      const types = [
          "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
          "video/mp4;codecs=h264,aac",
          "video/mp4",
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/webm"
      ];
      const mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || "video/webm";
      const fileExt = mimeType.includes("mp4") ? "mp4" : "webm";

      const stream = canvas.captureStream(FPS);
      
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const recCtx = new AudioCtx();
      if (recCtx.state === 'suspended') {
        await recCtx.resume();
      }

      let buf = audioBuffer;
      if (!buf) {
        const estDur = Math.max(16, (scriptSegments?.length || 4) * 5.5);
        buf = createSilentAudioBuffer(recCtx, estDur);
        setAudioBuffer(buf);
        setDuration(buf.duration);
      }

      const dest = recCtx.createMediaStreamDestination();
      
      // 1. Speech Audio
      const speechSource = recCtx.createBufferSource();
      speechSource.buffer = buf;
      speechSource.playbackRate.value = currentSpeed;
      speechSource.connect(dest);
      speechSource.start(0);

      // 2. Background Music Mixing (if enabled) with Smart Ducking
      const activeBgm = bgmStyle === 'custom' ? customBgmBuffer : (bgmBuffer || createProceduralBGMBuffer(recCtx, buf.duration, bgmStyle));
      if (isBgmEnabled && activeBgm) {
        const bgmSource = recCtx.createBufferSource();
        bgmSource.buffer = activeBgm;
        bgmSource.loop = true;
        const bgmGain = recCtx.createGain();
        bgmGain.gain.setValueAtTime(bgmVolume, 0);

        // Schedule ducking for each subtitle narration segment
        preparedSubtitles.forEach(sub => {
          try {
            bgmGain.gain.setTargetAtTime(bgmVolume * 0.45, sub.start, 0.08);
            bgmGain.gain.setTargetAtTime(bgmVolume, sub.end, 0.15);
          } catch {}
        });

        bgmSource.connect(bgmGain);
        bgmGain.connect(dest);
        bgmSource.start(0);
      }
      
      const tracks = dest.stream.getAudioTracks();
      if (tracks.length > 0) stream.addTrack(tracks[0]);

      const recorder = new MediaRecorder(stream, {
          mimeType: mimeType,
          // 6 Mbps: the frames are slow Ken Burns pans over stills, so the extra headroom
          // 14 Mbps bought was spent on a ~3x larger file (187MB for ~2min) with no visible
          // gain. This still exceeds Instagram/TikTok's own re-encode target for 1080x1920.
          videoBitsPerSecond: 6000000,
          audioBitsPerSecond: 128000
      });

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      // Frame ticks are driven by a Worker rather than requestAnimationFrame: browsers pause
      // rAF (and throttle main-thread timers) while a tab is hidden, which would freeze both
      // the recording and its stop condition if the user switches tabs mid-download.
      let ticker: Worker | null = null;
      let rafId: number | null = null;
      let finished = false;

      const stopTicker = () => {
          if (ticker) { ticker.terminate(); ticker = null; }
          if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      };

      recorder.onstop = () => {
          stopTicker();
          const blob = new Blob(chunks, { type: mimeType });
          const url = URL.createObjectURL(blob);
          
          const safeFilename = topic.replace(/[^a-z0-9а-яёўқғҳ ]/gi, '').trim().replace(/\s+/g, '_').substring(0, 50);
          const finalFileName = `${safeFilename || 'ism_manosi_video'}_1080p.${fileExt}`;

          let file: File | undefined;
          try {
            file = new File([blob], finalFileName, { type: mimeType });
          } catch (e) {
            console.warn("File constructor unavailable:", e);
          }

          setReadyVideo({
            url,
            blob,
            file,
            fileName: finalFileName
          });
          setIsReadyModalOpen(true);
          
          recCtx.close();
          setDownloadProgress(null);
          currentTimeRef.current = 0;
          draw(0);

          // For standard desktop browsers (Chrome, Firefox, Edge on PC/Mac), trigger direct download
          const isMobileOrInApp = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Instagram|FBAN|FBAV|TikTok/i.test(navigator.userAgent);
          if (!isMobileOrInApp) {
            try {
              const a = document.createElement('a');
              a.href = url;
              a.download = finalFileName;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            } catch (err) {
              console.warn("Desktop direct download err:", err);
            }
          }
      };

  const handleShareOrSave = async () => {
    if (!readyVideo) return;
    setIsSharing(true);
    try {
      if (readyVideo.file && navigator.canShare && navigator.canShare({ files: [readyVideo.file] })) {
        await navigator.share({
          files: [readyVideo.file],
          title: readyVideo.fileName,
          text: `${topic} ismining ma'nosi videosi`
        });
        setIsSharing(false);
        return;
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.warn("Web Share failed, attempting fallback download:", e);
      } else {
        setIsSharing(false);
        return;
      }
    } finally {
      setIsSharing(false);
    }

    // Fallback: trigger standard download anchor
    const a = document.createElement('a');
    a.href = readyVideo.url;
    a.download = readyVideo.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

      recorder.start();
      
      const recStartTime = performance.now();
      let lastProgressUpdate = 0;

      const recordFrame = () => {
          if (finished) return;

          const now = performance.now();
          const elapsed = (now - recStartTime) / 1000;

          const effectiveDuration = (buf && buf.duration > 0 ? buf.duration : (duration > 0 ? duration : 20)) / currentSpeed;

          if (elapsed >= effectiveDuration) {
               finished = true;
               stopTicker();
               setDownloadProgress(100);
               setTimeout(() => recorder.stop(), 300);
               return;
          }

          draw(elapsed);

          if (now - lastProgressUpdate > 80) {
              const pct = Math.min(99, Math.round((elapsed / Math.max(1, effectiveDuration)) * 100));
              setDownloadProgress(pct);
              lastProgressUpdate = now;
          }
      };

      try {
          const tickerSrc = `let id=null;onmessage=(e)=>{if(e.data==='start'){id=setInterval(()=>postMessage(0),${Math.round(1000 / FPS)});}else{clearInterval(id);}};`;
          const tickerUrl = URL.createObjectURL(new Blob([tickerSrc], { type: "application/javascript" }));
          ticker = new Worker(tickerUrl);
          URL.revokeObjectURL(tickerUrl);
          ticker.onmessage = recordFrame;
          ticker.postMessage("start");
      } catch (e) {
          // Worker unavailable — fall back to rAF, which still works while the tab stays visible.
          console.warn("Recording ticker worker unavailable, falling back to rAF:", e);
          const rafLoop = () => {
              recordFrame();
              if (!finished) rafId = requestAnimationFrame(rafLoop);
          };
          rafId = requestAnimationFrame(rafLoop);
      }
  };

  return (
    <div className="flex flex-col items-center w-full">
      <div className="relative rounded-lg overflow-hidden shadow-2xl border border-slate-700 bg-black ring-4 ring-brand-900/50 w-full max-w-[300px]">
        <canvas 
            ref={canvasRef} 
            width={WIDTH} 
            height={HEIGHT} 
            className="w-full aspect-[9/16] bg-black"
        />
        <div className="absolute bottom-0 w-full p-4 flex justify-center gap-4">
           <button 
             onClick={togglePlay}
             disabled={downloadProgress !== null}
             className="bg-white/20 hover:bg-white/40 backdrop-blur-md p-4 rounded-full text-white transition border border-white/10 disabled:opacity-50 active:scale-95 shadow-lg"
           >
             {isPlaying ? (
                 <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-6 h-6">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                 </svg>
             ) : (
                 <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-6 h-6">
                   <path d="M8 5v14l11-7z" />
                 </svg>
             )}
           </button>
        </div>
      </div>
      
      {/* ⚡ Ovoz Tezligi (Speed Control) */}
      <div className="mt-3 w-full max-w-[340px] bg-slate-900/90 backdrop-blur-md px-3 py-2 rounded-2xl border border-slate-800 shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">⚡</span>
          <span className="text-[11px] font-bold text-slate-200">Sur'at:</span>
        </div>
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => handleSpeedSelect(1.0)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
              currentSpeed === 1.0
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
            title="Oddiy sur'at (1.0x)"
          >
            <span>1.0x</span>
            <span className="text-[9px] opacity-80 font-normal">Oddiy</span>
          </button>
          <button
            type="button"
            onClick={() => handleSpeedSelect(1.1)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
              currentSpeed === 1.1
                ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
            title="Reels & TikTok uchun tavsiya etiladi (1.1x)"
          >
            <span>⭐ 1.1x</span>
            <span className="text-[9px] font-extrabold">Chaqqon</span>
          </button>
          <button
            type="button"
            onClick={() => handleSpeedSelect(1.15)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
              currentSpeed === 1.15
                ? 'bg-gradient-to-r from-rose-500 to-amber-500 text-white font-black shadow-md shadow-rose-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
            title="Yuqori dinamika va tomoshabinni ushlab qolish (1.15x)"
          >
            <span>🔥 1.15x</span>
            <span className="text-[9px] font-extrabold">Shiddatli</span>
          </button>
        </div>
      </div>

      {/* Fon Musiqasi Control Box */}
      <div className="mt-4 w-full max-w-[340px] bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl border border-slate-800 space-y-3 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🎵</span>
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Fon Musiqasi</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={togglePreviewBgm}
              title="Fon musiqasini tinglab ko'rish"
              className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition flex items-center gap-1 ${
                isPreviewingBgm
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              {isPreviewingBgm ? '⏹ To\'xtatish' : '▶ Eshitib ko\'rish'}
            </button>
            <button
              onClick={() => {
                const nextState = !isBgmEnabled;
                setIsBgmEnabled(nextState);
                if (bgmGainRef.current) {
                  bgmGainRef.current.gain.value = nextState ? bgmVolume : 0;
                }
                if (previewBgmGainRef.current) {
                  previewBgmGainRef.current.gain.value = nextState ? bgmVolume : 0;
                }
              }}
              className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition ${
                isBgmEnabled
                  ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {isBgmEnabled ? '✓ Yoqilgan' : 'O\'chirilgan'}
            </button>
          </div>
        </div>

        {isBgmEnabled && (
          <>
            {/* Genre / Style Selection */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-medium text-slate-400">Musiqa uslubi:</span>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <button
                  onClick={() => { setBgmStyle('sharqona'); stopPreviewBgm(); }}
                  className={`px-2.5 py-1.5 rounded-xl font-medium border text-left flex items-center gap-1.5 transition ${
                    bgmStyle === 'sharqona'
                      ? 'bg-brand-500/30 text-amber-300 border-brand-500/60 font-bold'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-800'
                  }`}
                >
                  <span>🕌 Sharqona / Sufiyona</span>
                </button>
                <button
                  onClick={() => { setBgmStyle('kinematik'); stopPreviewBgm(); }}
                  className={`px-2.5 py-1.5 rounded-xl font-medium border text-left flex items-center gap-1.5 transition ${
                    bgmStyle === 'kinematik'
                      ? 'bg-brand-500/30 text-amber-300 border-brand-500/60 font-bold'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-800'
                  }`}
                >
                  <span>🎹 Kinematik (Piano)</span>
                </button>
                <button
                  onClick={() => { setBgmStyle('osuda'); stopPreviewBgm(); }}
                  className={`px-2.5 py-1.5 rounded-xl font-medium border text-left flex items-center gap-1.5 transition ${
                    bgmStyle === 'osuda'
                      ? 'bg-brand-500/30 text-amber-300 border-brand-500/60 font-bold'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-800'
                  }`}
                >
                  <span>🌿 Osuda Ambient</span>
                </button>
                <button
                  onClick={() => { setBgmStyle('lofi'); stopPreviewBgm(); }}
                  className={`px-2.5 py-1.5 rounded-xl font-medium border text-left flex items-center gap-1.5 transition ${
                    bgmStyle === 'lofi'
                      ? 'bg-brand-500/30 text-amber-300 border-brand-500/60 font-bold'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-800'
                  }`}
                >
                  <span>⚡ Zamonaviy Lofi</span>
                </button>
              </div>

              {/* Custom MP3 File Upload Option */}
              <div className="pt-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleCustomBgmUpload}
                  accept="audio/*"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full px-2.5 py-1.5 rounded-xl text-[10px] font-medium border text-center flex items-center justify-center gap-1.5 transition ${
                    bgmStyle === 'custom'
                      ? 'bg-purple-500/30 text-purple-300 border-purple-500/60 font-bold'
                      : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300 border-slate-700/60'
                  }`}
                >
                  <span>📂</span>
                  <span>{customBgmName ? `Fayl: ${customBgmName.substring(0, 22)}...` : "O'z MP3 musiqa faylingizni yuklang"}</span>
                </button>
              </div>
            </div>

            {/* Volume Slider */}
            <div className="flex items-center gap-3 pt-1">
              <span className="text-[10px] font-medium text-slate-400">Ovoz:</span>
              <input
                type="range"
                min="0.05"
                max="0.80"
                step="0.05"
                value={bgmVolume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setBgmVolume(v);
                  if (bgmGainRef.current) {
                    bgmGainRef.current.gain.value = v;
                  }
                  if (previewBgmGainRef.current) {
                    previewBgmGainRef.current.gain.value = v;
                  }
                }}
                className="w-full accent-brand-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <span className="text-[10px] font-bold text-amber-300 w-8">{Math.round(bgmVolume * 100)}%</span>
            </div>
          </>
        )}
      </div>

      {downloadProgress !== null ? (
        <div className="mt-4 w-full max-w-[300px] space-y-3 bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-xl">
            <div className="flex justify-between text-xs text-slate-300 font-medium">
               <span>🎬 HD Video Tayyorlanmoqda...</span>
               <span className="text-brand-400 font-bold">{downloadProgress}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700">
                <div 
                    className="bg-gradient-to-r from-brand-500 via-purple-500 to-amber-500 h-2.5 rounded-full transition-all duration-100 ease-linear shadow-[0_0_12px_rgba(139,92,246,0.6)]"
                    style={{ width: `${downloadProgress}%` }}
                ></div>
            </div>
            <p className="text-[10px] text-center text-slate-400">1080x1920 HD tayyorlanmoqda, iltimos kuting...</p>
        </div>
      ) : (
        <button
            onClick={handleDownload}
            disabled={downloadProgress !== null}
            className="mt-4 w-full max-w-[300px] bg-gradient-to-r from-brand-600 via-purple-600 to-indigo-600 hover:from-brand-500 hover:to-purple-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-bold py-4 px-6 rounded-2xl shadow-xl transition flex items-center justify-center gap-2.5 group active:scale-95 border border-brand-400/20"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 group-hover:animate-bounce text-amber-300">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            <span>Instagram / TikTok (HD MP4)</span>
        </button>
      )}

      {readyVideo && !isReadyModalOpen && (
        <button
          onClick={() => setIsReadyModalOpen(true)}
          className="mt-3 w-full max-w-[300px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold py-2.5 px-4 rounded-2xl text-xs shadow-lg transition flex items-center justify-center gap-2 active:scale-95"
        >
          <span className="text-base">🎉</span>
          <span>Tayyor videoni ochish va saqlash</span>
        </button>
      )}

      {/* 🎉 Instagram & Mobile Ready Video Modal */}
      {isReadyModalOpen && readyVideo && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-sm w-full max-h-[92vh] overflow-y-auto p-4 sm:p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-1 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎉</span>
                <h3 className="text-base font-extrabold text-white">Videongiz Tayyor!</h3>
              </div>
              <button
                onClick={() => setIsReadyModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg text-lg transition"
                title="Yopish"
              >
                ✕
              </button>
            </div>

            {/* Video Player Preview */}
            <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-800 aspect-[9/16] max-h-[380px] flex items-center justify-center mx-auto shadow-inner">
              <video
                src={readyVideo.url}
                controls
                playsInline
                autoPlay
                loop
                className="w-full h-full object-contain"
              />
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-1">
              <button
                onClick={handleShareOrSave}
                disabled={isSharing}
                className="w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-white font-extrabold py-3.5 px-4 rounded-2xl shadow-xl shadow-emerald-500/20 transition flex items-center justify-center gap-2 active:scale-95 text-sm"
              >
                <span className="text-base">📲</span>
                <span>{isSharing ? "Yuklanmoqda..." : "Galereyaga Saqlash / Ulashish"}</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <a
                  href={readyVideo.url}
                  download={readyVideo.fileName}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold py-2.5 px-3 rounded-xl text-xs text-center transition flex items-center justify-center gap-1.5"
                >
                  <span>⬇️</span>
                  <span>Yuklab olish</span>
                </a>
                <button
                  onClick={() => window.open(readyVideo.url, '_blank')}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold py-2.5 px-3 rounded-xl text-xs text-center transition flex items-center justify-center gap-1.5"
                >
                  <span>↗️</span>
                  <span>Yangi oynada</span>
                </button>
              </div>
            </div>

            {/* In-App / Instagram Instruction Card */}
            <div className="bg-gradient-to-br from-pink-500/10 via-purple-500/10 to-amber-500/10 border border-pink-500/30 rounded-2xl p-3.5 space-y-2 text-left">
              <div className="flex items-center gap-1.5 text-pink-300 font-bold text-xs">
                <span>💡</span>
                <span>Instagram / Telefon foydalanuvchilariga:</span>
              </div>
              <ul className="text-[11px] text-slate-300 space-y-1.5 pl-3 border-l-2 border-pink-500/40 leading-relaxed">
                <li>
                  <strong>1-usul:</strong> Yashil <strong>"📲 Galereyaga Saqlash"</strong> tugmasini bosing va menyudan <em>"Videoni saqlash" (Save Video)</em> ni tanlang.
                </li>
                <li>
                  <strong>2-usul:</strong> Videoning ustiga <strong>2 soniya bosib turing</strong> (Long-press) va chiqqan menyudan <em>"Videoni saqlash"</em> ni bosing.
                </li>
                <li>
                  <strong>3-usul:</strong> Agar Instagram ichida yuklanmasa, yuqori o'ngdagi <strong>(⋯) uch nuqta</strong>ni bosib <em>"Brauzerda ochish" (Safari / Chrome)</em> ni tanlang.
                </li>
              </ul>
            </div>

            <button
              onClick={() => setIsReadyModalOpen(false)}
              className="w-full py-2 text-xs text-slate-400 hover:text-white transition text-center font-medium"
            >
              Yopish
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;