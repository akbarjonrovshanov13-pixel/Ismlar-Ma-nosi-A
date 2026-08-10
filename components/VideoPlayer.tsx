import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { ScriptSegment, CaptionStyle, WatermarkPosition } from '../types';

interface VideoPlayerProps {
  images: string[];
  audioBase64: string;
  scriptSegments: string[];
  topic: string;
  customOutroImages?: string[];
  captionStyle?: CaptionStyle;
  watermarkText?: string;
  watermarkPosition?: WatermarkPosition;
  adTitle?: string;
  adSubtitle?: string;
  adHandle?: string;
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
}

const OUTRO_DURATION = 9.0; // 9 seconds for Luxe Core branding & advert showcase

const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  images, 
  audioBase64, 
  scriptSegments, 
  topic, 
  customOutroImages,
  captionStyle = CaptionStyle.TIKTOK_YELLOW,
  watermarkText = "✨ @luxe_core_uz",
  watermarkPosition = WatermarkPosition.TOP_RIGHT,
  adTitle = "LUXE CORE",
  adSubtitle = "Qutilar • Paketlar • Qadoqlash • HoReCa",
  adHandle = "@luxe_core_uz"
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // We use a Ref for tracking play time to avoid re-renders during the loop
  const currentTimeRef = useRef(0);
  const [duration, setDuration] = useState(0);
  
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [bgmBuffer, setBgmBuffer] = useState<AudioBuffer | null>(null);
  const [isBgmEnabled, setIsBgmEnabled] = useState(true);
  const [bgmVolume, setBgmVolume] = useState(0.20); // 20% background music volume
  const [startTime, setStartTime] = useState<number>(0);
  
  const speechSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bgmSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bgmGainRef = useRef<GainNode | null>(null);
  
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

  // Helper: Convert Raw PCM to AudioBuffer
  const pcmToAudioBuffer = (data: Uint8Array, ctx: AudioContext) => {
    const sampleRate = 24000;
    const numChannels = 1;
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  };

  // Helper: Generate Procedural Royalty-Free Mystical Ambient Background Music
  const createAmbientBGMBuffer = (ctx: AudioContext, targetDuration: number): AudioBuffer => {
    const sampleRate = ctx.sampleRate;
    const numChannels = 2;
    const safeDuration = Math.max(10, targetDuration + 10);
    const frameCount = Math.floor(sampleRate * safeDuration);
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    // Mystical C minor & Ab major chord progression: Cm7, Abmaj7, Fm7, G7
    const chords = [
      [130.81, 155.56, 196.00, 233.08], // Cm7
      [103.83, 130.81, 155.56, 196.00], // Abmaj7
      [174.61, 207.65, 261.63, 311.13], // Fm7
      [146.83, 185.00, 220.00, 293.66]  // G7
    ];

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const chordIndex = Math.floor(t / 6.0) % chords.length;
      const currentChord = chords[chordIndex];

      let sampleL = 0;
      let sampleR = 0;

      // Soft ambient synth pad
      currentChord.forEach((freq, idx) => {
        const lfo = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.12 * t + idx * 0.8);
        const wave = Math.sin(2 * Math.PI * freq * t) * 0.25 + 0.12 * Math.sin(2 * Math.PI * freq * 2 * t);
        sampleL += wave * lfo * (idx % 2 === 0 ? 0.75 : 0.4);
        sampleR += wave * lfo * (idx % 2 === 1 ? 0.75 : 0.4);
      });

      // Gentle bell chime accent every 3 seconds
      const chimePeriod = t % 3.0;
      if (chimePeriod < 1.2) {
        const chimeFreq = 523.25 * (1 + (chordIndex % 3) * 0.2); // C5 accent
        const env = Math.exp(-3.5 * chimePeriod);
        const chime = Math.sin(2 * Math.PI * chimeFreq * t) * env * 0.12;
        sampleL += chime;
        sampleR += chime;
      }

      // Smooth master fade in & fade out
      let masterEnv = 1.0;
      if (t < 2.5) masterEnv = t / 2.5;
      if (t > safeDuration - 2.5) masterEnv = Math.max(0, (safeDuration - t) / 2.5);

      left[i] = Math.max(-1, Math.min(1, sampleL * 0.16 * masterEnv));
      right[i] = Math.max(-1, Math.min(1, sampleR * 0.16 * masterEnv));
    }

    return buffer;
  };

  // 1. Initialize Audio
  useEffect(() => {
    const initAudio = async () => {
      if (!audioBase64) return;
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const bytes = decode(audioBase64);
        const buffer = pcmToAudioBuffer(bytes, ctx);
        const bgm = createAmbientBGMBuffer(ctx, buffer.duration);
        
        setAudioContext(ctx);
        setAudioBuffer(buffer);
        setBgmBuffer(bgm);
        setDuration(buffer.duration);
      } catch (e) {
        console.error("Audio decoding failed:", e);
      }
    };
    initAudio();
    
    // Initialize particles
    const particles: Particle[] = [];
    for (let i = 0; i < 60; i++) {
        particles.push({
            x: Math.random() * WIDTH,
            y: Math.random() * HEIGHT,
            size: Math.random() * 3 + 1,
            speedY: Math.random() * -3 - 1,
            speedX: Math.random() * 2 - 1,
            opacity: Math.random() * 0.5 + 0.1
        });
    }
    particlesRef.current = particles;
    
    return () => { audioContext?.close(); };
  }, [audioBase64]);

  // 2. Pre-process Images (Resize & Generate Random Motion)
  useEffect(() => {
    const processImages = async () => {
      const promises = images.map((src, index) => {
        return new Promise<ProcessedImageLayer>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
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
            const motionType = index % 8; 
            const transitionType = index % 5;

            let startX = 0, startY = 0, startScale = 1.0;
            let endX = 0, endY = 0, endScale = 1.15; 

            // Motion Logic (Dynamic Ken Burns)
            switch (motionType) {
                case 0: // Pan Right
                    startX = 0; startY = -maxOffsetY / 2; startScale = 1.05; 
                    endX = -maxOffsetX; endY = -maxOffsetY / 2; endScale = 1.05;
                    break;
                case 1: // Zoom In
                    startX = -maxOffsetX / 2; startY = -maxOffsetY / 2; startScale = 1.0;
                    endX = -maxOffsetX / 2; endY = -maxOffsetY / 2; endScale = 1.25; 
                    break;
                case 2: // Pan Left
                    startX = -maxOffsetX; startY = -maxOffsetY / 2; startScale = 1.05;
                    endX = 0; endY = -maxOffsetY / 2; endScale = 1.05;
                    break;
                case 3: // Pan Down
                    startX = -maxOffsetX / 2; startY = 0; startScale = 1.05;
                    endX = -maxOffsetX / 2; endY = -maxOffsetY; endScale = 1.15;
                    break;
                case 4: // Zoom Out
                    startX = -maxOffsetX / 2; startY = -maxOffsetY / 2; startScale = 1.25;
                    endX = -maxOffsetX / 2; endY = -maxOffsetY / 2; endScale = 1.0; 
                    break;
                case 5: // Diagonal Top-Left to Bottom-Right
                    startX = 0; startY = 0; startScale = 1.1;
                    endX = -maxOffsetX; endY = -maxOffsetY; endScale = 1.1;
                    break;
                case 6: // Pan Up
                    startX = -maxOffsetX / 2; startY = -maxOffsetY; startScale = 1.15;
                    endX = -maxOffsetX / 2; endY = 0; endScale = 1.05;
                    break;
                case 7: // Diagonal Bottom-Right to Top-Left
                    startX = -maxOffsetX; startY = -maxOffsetY; startScale = 1.1;
                    endX = 0; endY = 0; endScale = 1.1;
                    break;
            }

            resolve({
                canvas: offCanvas,
                motion: { startX, startY, startScale, endX, endY, endScale },
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
      setProcessedLayers(loaded);
    };
    if (images.length > 0) processImages();
  }, [images]);

  // 3. Subtitle Calculation (Same logic)
  const preparedSubtitles = useMemo<PreparedSubtitle[]>(() => {
    if (!scriptSegments.length || duration === 0) return [];

    // All name meaning subtitles will end OUTRO_DURATION before the audio ends, giving space to the Luxe Core outro
    const nameDuration = Math.max(1, duration - OUTRO_DURATION);
    const totalCharsInScript = scriptSegments.reduce((acc, seg) => acc + seg.length, 0);
    let globalElapsed = 0;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    
    const fontSize = 54; 
    ctx.font = `900 ${fontSize}px Inter, sans-serif`;
    const maxWidth = WIDTH - 160; 
    const spaceWidth = ctx.measureText(' ').width;

    return scriptSegments.map(segmentText => {
      const segmentCharCount = segmentText.length;
      const segmentProportion = segmentCharCount / totalCharsInScript;
      const segmentDuration = nameDuration * segmentProportion;
      const segmentStart = globalElapsed;
      const segmentEnd = segmentStart + segmentDuration;
      globalElapsed += segmentDuration;

      const rawWords = segmentText.split(/\s+/);
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

      const lines: SubtitleLine[] = [];
      let currentLineWords: WordTiming[] = [];
      let currentLineWidth = 0;

      wordTimings.forEach((wt) => {
         const wWidth = wt.width || 0;
         const potentialWidth = currentLineWidth + wWidth + (currentLineWords.length > 0 ? spaceWidth : 0);

         if (potentialWidth > maxWidth && currentLineWords.length > 0) {
             lines.push({ words: currentLineWords, totalWidth: currentLineWidth });
             currentLineWords = [wt];
             currentLineWidth = wWidth;
         } else {
             if (currentLineWords.length > 0) currentLineWidth += spaceWidth;
             currentLineWords.push(wt);
             currentLineWidth += wWidth;
         }
      });
      if (currentLineWords.length > 0) {
          lines.push({ words: currentLineWords, totalWidth: currentLineWidth });
      }

      return { start: segmentStart, end: segmentEnd, lines };
    });
  }, [scriptSegments, duration]);


  const drawLayer = useCallback((ctx: CanvasRenderingContext2D, layer: ProcessedImageLayer, progress: number, opacity: number) => {
    const { canvas, motion } = layer;
    const { startX, startY, startScale, endX, endY, endScale } = motion;

    // Linear Interpolation
    const currentX = startX + (endX - startX) * progress;
    const currentY = startY + (endY - startY) * progress;
    const currentScale = startScale + (endScale - startScale) * progress;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(WIDTH / 2, HEIGHT / 2);
    ctx.scale(currentScale, currentScale);
    ctx.translate(-WIDTH / 2, -HEIGHT / 2);
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

    // --- Luxe Core Outro Check (last OUTRO_DURATION seconds) ---
    const isOutro = duration > OUTRO_DURATION && time >= (duration - OUTRO_DURATION);

    if (isOutro) {
        const outroTime = time - (duration - OUTRO_DURATION); // ranges from 0 to OUTRO_DURATION
        
        if (outroTime < 5.0) {
            // "Avval quti, paket, lenta va bir martalik idishlardan tez kadrlar ko‘rinsin"
            // Show product advert frames for 5.0 seconds (3 seconds longer so viewers can clearly see products)
            const activeImages = outroImagesRef.current.filter(img => img && img.complete);
            const imgCount = activeImages.length;
            
            if (imgCount > 0) {
                const frameDuration = 5.0 / imgCount;
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
            
            // Outro logo transition (starts at 5.0s, smooth 1.5s entrance transition)
            const sceneProgress = Math.min(1.0, (outroTime - 5.0) / 1.5); // Slower, smoother 1.5s entrance
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
    const nameDuration = duration > OUTRO_DURATION ? duration - OUTRO_DURATION : (duration > 0 ? duration : 5);
    const slotDuration = nameDuration / totalImages;
    
    let currentIndex = Math.floor(time / slotDuration);
    if (currentIndex >= totalImages) currentIndex = totalImages - 1;
    if (currentIndex < 0) currentIndex = 0;

    const nextIndex = (currentIndex + 1) < totalImages ? currentIndex + 1 : currentIndex;
    const timeInSlot = time - (currentIndex * slotDuration);
    const progress = timeInSlot / slotDuration;

    drawLayer(ctx, processedLayers[currentIndex], progress, 1);

    if (timeInSlot > (slotDuration - FADE_DURATION) && nextIndex !== currentIndex) {
       const fadeTime = timeInSlot - (slotDuration - FADE_DURATION);
       const fadeProgress = fadeTime / FADE_DURATION;
       
       const transType = processedLayers[nextIndex].transitionType;
       
       ctx.save();
       if (transType === 0) {
           // Crossfade
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
           // Zoom Fade
           ctx.translate(WIDTH / 2, HEIGHT / 2);
           const scale = 0.8 + 0.2 * fadeProgress;
           ctx.scale(scale, scale);
           ctx.translate(-WIDTH / 2, -HEIGHT / 2);
           drawLayer(ctx, processedLayers[nextIndex], 0, fadeProgress);
       } else if (transType === 4) {
           // Flash
           drawLayer(ctx, processedLayers[nextIndex], 0, fadeProgress);
           ctx.fillStyle = `rgba(255, 255, 255, ${Math.sin(fadeProgress * Math.PI)})`;
           ctx.fillRect(0, 0, WIDTH, HEIGHT);
       }
       ctx.restore();
    }

    // Add Vignette for cinematic look
    const gradient = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.3, WIDTH / 2, HEIGHT / 2, HEIGHT * 0.8);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Draw Particles
    ctx.fillStyle = 'white';
    particlesRef.current.forEach(p => {
        ctx.globalAlpha = p.opacity;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        
        // Update
        p.y += p.speedY;
        p.x += p.speedX;
        if (p.y < 0) {
            p.y = HEIGHT;
            p.x = Math.random() * WIDTH;
        }
        if (p.x < 0) p.x = WIDTH;
        if (p.x > WIDTH) p.x = 0;
    });
    ctx.globalAlpha = 1;

    // --- Subtitles ---
    const activeSubtitle = preparedSubtitles.find(s => time >= s.start && time < s.end);

    if (activeSubtitle) {
        const fontSize = 54;
        ctx.font = `900 ${fontSize}px Inter, sans-serif`;
        ctx.textBaseline = 'middle';
        const spaceWidth = ctx.measureText(' ').width;

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

             line.words.forEach((wt) => {
                const isWordActive = time >= wt.start && time < wt.end;
                
                ctx.save();
                
                let wordScale = 1.0;
                let yOffset = 0;

                if (isWordActive) {
                    // CapCut / TikTok Spring Pop & Bounce Animation
                    const wordDuration = Math.max(0.1, wt.end - wt.start);
                    const activeProgress = Math.min(1, Math.max(0, (time - wt.start) / wordDuration));
                    wordScale = 1.0 + 0.22 * Math.sin(activeProgress * Math.PI); // Elastic pop curve
                    yOffset = -4 * Math.sin(activeProgress * Math.PI); // Subtle float
                }
                
                const wWidth = wt.width || 0;
                const wordCenterX = currentX + wWidth / 2;
                const wordCenterY = yPos + yOffset;
                
                ctx.translate(wordCenterX, wordCenterY);
                ctx.scale(wordScale, wordScale);
                ctx.translate(-wordCenterX, -wordCenterY);

                if (captionStyle === CaptionStyle.INSTAGRAM_WHITE) {
                  ctx.font = `900 ${fontSize}px "Inter", sans-serif`;
                  if (isWordActive) {
                    // CapCut Instagram Active White Badge
                    const badgePadX = 18;
                    const badgePadY = 14;
                    const bW = wWidth + badgePadX * 2;
                    const bH = fontSize + badgePadY;
                    const bX = currentX - badgePadX;
                    const bY = (yPos + yOffset) - bH / 2;

                    ctx.save();
                    ctx.fillStyle = '#ffffff';
                    ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
                    ctx.shadowBlur = 22;
                    ctx.beginPath();
                    if (ctx.roundRect) {
                      ctx.roundRect(bX, bY, bW, bH, 16);
                    } else {
                      ctx.rect(bX, bY, bW, bH);
                    }
                    ctx.fill();
                    ctx.restore();

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
                  ctx.font = `900 ${fontSize}px "Inter", sans-serif`;
                  if (isWordActive) {
                    // CapCut Neon Cyan Active Badge
                    const badgePadX = 18;
                    const badgePadY = 14;
                    const bW = wWidth + badgePadX * 2;
                    const bH = fontSize + badgePadY;
                    const bX = currentX - badgePadX;
                    const bY = (yPos + yOffset) - bH / 2;

                    ctx.save();
                    ctx.fillStyle = '#06b6d4'; // Cyan neon badge
                    ctx.shadowColor = 'rgba(6, 182, 212, 0.9)';
                    ctx.shadowBlur = 30;
                    ctx.beginPath();
                    if (ctx.roundRect) {
                      ctx.roundRect(bX, bY, bW, bH, 16);
                    } else {
                      ctx.rect(bX, bY, bW, bH);
                    }
                    ctx.fill();
                    ctx.restore();

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
                  ctx.font = `900 ${fontSize}px "Inter", sans-serif`;
                  if (isWordActive) {
                    const badgePadX = 20;
                    const badgePadY = 14;
                    const bW = wWidth + badgePadX * 2;
                    const bH = fontSize + badgePadY;
                    const bX = currentX - badgePadX;
                    const bY = (yPos + yOffset) - bH / 2;

                    ctx.save();
                    ctx.fillStyle = '#facc15'; // High-contrast TikTok Yellow
                    ctx.shadowColor = 'rgba(250, 204, 21, 0.75)';
                    ctx.shadowBlur = 24;
                    ctx.beginPath();
                    if (ctx.roundRect) {
                      ctx.roundRect(bX, bY, bW, bH, 18);
                    } else {
                      ctx.rect(bX, bY, bW, bH);
                    }
                    ctx.fill();
                    ctx.restore();

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

                currentX += wWidth + spaceWidth;
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

  }, [processedLayers, duration, preparedSubtitles, drawLayer]);

  // 5. Animation Loop (Playback)
  const animate = useCallback(() => {
    if (!isPlaying || !audioContext) return;
    
    const now = audioContext.currentTime;
    const time = now - startTime;
    
    if (time >= duration + 0.2) { 
      setIsPlaying(false);
      currentTimeRef.current = 0;
      draw(0);
      return;
    }

    currentTimeRef.current = time;
    draw(time);
    reqRef.current = requestAnimationFrame(animate);
  }, [isPlaying, audioContext, startTime, duration, draw]);

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
    if (!audioContext || !audioBuffer) return;

    if (isPlaying) {
      await audioContext.suspend();
      setIsPlaying(false);
    } else {
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      } else {
          // 1. Speech Audio
          const speechSource = audioContext.createBufferSource();
          speechSource.buffer = audioBuffer;
          speechSource.connect(audioContext.destination);
          speechSource.start(0, currentTimeRef.current);
          speechSourceRef.current = speechSource;

          // 2. Background Music (if enabled)
          if (isBgmEnabled && bgmBuffer) {
            const bgmSource = audioContext.createBufferSource();
            bgmSource.buffer = bgmBuffer;
            const bgmGain = audioContext.createGain();
            bgmGain.gain.value = bgmVolume;
            bgmSource.connect(bgmGain);
            bgmGain.connect(audioContext.destination);
            bgmSource.start(0, currentTimeRef.current);
            bgmSourceRef.current = bgmSource;
            bgmGainRef.current = bgmGain;
          }

          setStartTime(audioContext.currentTime - currentTimeRef.current);
      }
      setIsPlaying(true);
    }
  };

  const handleDownload = async () => {
      const canvas = canvasRef.current;
      if (!canvas || !audioBuffer) return;
      if (downloadProgress !== null) return;

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
      
      const recCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (recCtx.state === 'suspended') {
        await recCtx.resume();
      }

      const dest = recCtx.createMediaStreamDestination();
      
      // 1. Speech Audio
      const speechSource = recCtx.createBufferSource();
      speechSource.buffer = audioBuffer;
      speechSource.connect(dest);
      speechSource.start(0);

      // 2. Background Music Mixing (if enabled)
      if (isBgmEnabled && bgmBuffer) {
        const bgmSource = recCtx.createBufferSource();
        bgmSource.buffer = bgmBuffer;
        const bgmGain = recCtx.createGain();
        bgmGain.gain.value = bgmVolume;
        bgmSource.connect(bgmGain);
        bgmGain.connect(dest);
        bgmSource.start(0);
      }
      
      const tracks = dest.stream.getAudioTracks();
      if (tracks.length > 0) stream.addTrack(tracks[0]);

      const recorder = new MediaRecorder(stream, {
          mimeType: mimeType,
          videoBitsPerSecond: 14000000 // 14 Mbps HD Quality
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
          const a = document.createElement('a');
          a.href = url;
          
          const safeFilename = topic.replace(/[^a-z0-9а-яёўқғҳ ]/gi, '').trim().replace(/\s+/g, '_').substring(0, 50);
          a.download = `${safeFilename || 'ism_manosi_video'}_1080p.${fileExt}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
          recCtx.close();
          URL.revokeObjectURL(url);
          setDownloadProgress(null);
          currentTimeRef.current = 0;
          draw(0);
      };

      recorder.start();
      
      const recStartTime = performance.now();
      let lastProgressUpdate = 0;

      const recordFrame = () => {
          if (finished) return;

          const now = performance.now();
          const elapsed = (now - recStartTime) / 1000;

          if (elapsed >= duration) {
               finished = true;
               stopTicker();
               setDownloadProgress(100);
               setTimeout(() => recorder.stop(), 300);
               return;
          }

          draw(elapsed);

          if (now - lastProgressUpdate > 80) {
             const pct = Math.min(99, Math.round((elapsed / Math.max(1, duration)) * 100));
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
      
      {/* Fon Musiqasi Control Box */}
      <div className="mt-4 w-full max-w-[300px] bg-slate-900/80 backdrop-blur-md p-3.5 rounded-2xl border border-slate-800 space-y-2.5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">🎵</span>
            <span className="text-xs font-bold text-slate-200">Fon Musiqasi</span>
          </div>
          <button
            onClick={() => {
              setIsBgmEnabled(!isBgmEnabled);
              if (bgmGainRef.current) {
                bgmGainRef.current.gain.value = !isBgmEnabled ? bgmVolume : 0;
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

        {isBgmEnabled && (
          <div className="flex items-center gap-3 pt-1">
            <span className="text-[10px] font-medium text-slate-400">Ovoz:</span>
            <input
              type="range"
              min="0.05"
              max="0.40"
              step="0.05"
              value={bgmVolume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setBgmVolume(v);
                if (bgmGainRef.current) {
                  bgmGainRef.current.gain.value = v;
                }
              }}
              className="w-full accent-brand-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <span className="text-[10px] font-bold text-amber-300 w-7">{Math.round(bgmVolume * 100)}%</span>
          </div>
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
            disabled={!audioBuffer || processedLayers.length === 0}
            className="mt-4 w-full max-w-[300px] bg-gradient-to-r from-brand-600 via-purple-600 to-indigo-600 hover:from-brand-500 hover:to-purple-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-bold py-4 px-6 rounded-2xl shadow-xl transition flex items-center justify-center gap-2.5 group active:scale-95 border border-brand-400/20"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 group-hover:animate-bounce text-amber-300">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            <span>Instagram / TikTok (HD MP4)</span>
        </button>
      )}
    </div>
  );
};

export default VideoPlayer;