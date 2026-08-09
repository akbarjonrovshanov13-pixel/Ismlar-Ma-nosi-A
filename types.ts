
export enum ImageMode {
  GENERATE = 'GENERATE',
  FIND = 'FIND',
  UPLOAD = 'UPLOAD',
}

export enum HookStyle {
  RANDOM = 'RANDOM',
  SHOCK = 'SHOCK',
  FRIEND = 'FRIEND',
  PSYCHOLOGY = 'PSYCHOLOGY',
  INTRIGUE = 'INTRIGUE',
  WARNING = 'WARNING',
  QUESTION = 'QUESTION'
}

export enum CaptionStyle {
  TIKTOK_YELLOW = 'TIKTOK_YELLOW',
  INSTAGRAM_WHITE = 'INSTAGRAM_WHITE',
  NEON_GLOW = 'NEON_GLOW'
}

export enum WatermarkPosition {
  TOP_RIGHT = 'TOP_RIGHT',
  TOP_LEFT = 'TOP_LEFT',
  BOTTOM_RIGHT = 'BOTTOM_RIGHT',
  BOUNCING = 'BOUNCING',
  DISABLED = 'DISABLED'
}

export interface AdConfig {
  watermarkText: string;
  watermarkPosition: WatermarkPosition;
  adTitle: string;
  adSubtitle: string;
  adHandle: string;
  customOutroImages: string[];
}

export enum VoiceType {
  FRIENDLY = 'Friendly', // Kore
  SERIOUS = 'Serious',   // Fenrir
  ENERGETIC = 'Energetic', // Puck
  CALM = 'Calm',         // Charon
  PROFESSIONAL = 'Professional' // Aoede
}

export interface ScriptSegment {
  text: string;
  duration?: number; // Calculated roughly or via audio timing
}

export interface VideoData {
  topic: string;
  script: string[]; // Array of sentences
  fullScript: string;
  hashtags: string[];
  imagePrompts: string[]; // For debugging or regeneration
  imageUrls: string[]; // Can be base64 or remote URLs
  audioBase64: string | null;
  sources?: { title: string; uri: string }[];
}

export interface AppState {
  isLoading: boolean;
  loadingStep: string;
  error: string | null;
  videoData: VideoData | null;
}

export interface GenerationConfig {
  topic: string;
  imageMode: ImageMode;
  useSearch: boolean;
  voice: VoiceType;
  userImages: File[];
}
