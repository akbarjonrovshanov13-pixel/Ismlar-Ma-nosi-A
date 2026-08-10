import React, { useState, useEffect } from 'react';
import { AppState, ImageMode, VideoData, VoiceType, HookStyle, CaptionStyle, WatermarkPosition, AdConfig } from './types';
import { generateAudio, generateImages, generateScript, findImages, generateTopicIdeas } from './services/geminiService';
import { CATEGORIZED_TOPICS, TOPIC_CATEGORIES } from './constants';
import VideoPlayer from './components/VideoPlayer';
import { ScriptEditorModal } from './components/ScriptEditorModal';
import { SavedProjectsModal } from './components/SavedProjectsModal';
import { PricingModal } from './components/PricingModal';
import { AdminModal } from './components/AdminModal';
import { AdSettingsModal } from './components/AdSettingsModal';
import { 
  auth, 
  signInWithGoogle, 
  logOut, 
  saveVideoToFirestore, 
  getUserSavedVideos, 
  deleteSavedVideoFromFirestore,
  SavedVideoDocument,
  getUserProfileData,
  deductUserCreditInFirestore,
  UserProfileDocument
} from './lib/firebase';
import { User, onAuthStateChanged } from 'firebase/auth';

const DEFAULT_OUTRO_TEXT = "Ismni eslab qoldingiz. Endi bizni ham eslab qoling: Luxe Core — qadoqlash uchun kerakli hamma narsa.";

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [topic, setTopic] = useState('');
  const [imageMode, setImageMode] = useState<ImageMode>(ImageMode.GENERATE);
  const [useSearch, setUseSearch] = useState(true);
  const [voice, setVoice] = useState<VoiceType>(VoiceType.FRIENDLY);
  const [hookStyle, setHookStyle] = useState<HookStyle>(HookStyle.RANDOM);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>(CaptionStyle.TIKTOK_YELLOW);
  const [userImages, setUserImages] = useState<string[]>([]);
  const [customOutroImages, setCustomOutroImages] = useState<string[]>([]);
  const [showIdeas, setShowIdeas] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [displayedIdeas, setDisplayedIdeas] = useState<string[]>([]);
  const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
  
  // Script Editor states
  const [isScriptEditorOpen, setIsScriptEditorOpen] = useState(false);
  const [draftSegments, setDraftSegments] = useState<string[]>([]);
  const [draftOutroText, setDraftOutroText] = useState<string>(DEFAULT_OUTRO_TEXT);
  const [draftHashtags, setDraftHashtags] = useState<string[]>([]);
  const [draftImagePrompts, setDraftImagePrompts] = useState<string[]>([]);
  const [isGeneratingScriptOnly, setIsGeneratingScriptOnly] = useState(false);

  // Firebase Saved Projects, Admin & Ad Settings states
  const [isSavedProjectsOpen, setIsSavedProjectsOpen] = useState(false);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isAdSettingsOpen, setIsAdSettingsOpen] = useState(false);
  const [adConfig, setAdConfig] = useState<AdConfig>({
    watermarkText: "✨ @luxe_core_uz",
    watermarkPosition: WatermarkPosition.TOP_RIGHT,
    adTitle: "LUXE CORE",
    adSubtitle: "Qutilar • Paketlar • Qadoqlash • HoReCa",
    adHandle: "@luxe_core_uz",
    customOutroImages: []
  });
  const [userProfile, setUserProfile] = useState<UserProfileDocument | null>(null);
  const [savedVideosList, setSavedVideosList] = useState<SavedVideoDocument[]>([]);
  const [isLoadingSavedVideos, setIsLoadingSavedVideos] = useState(false);
  const [isSavingToCloud, setIsSavingToCloud] = useState(false);
  const [cloudNotification, setCloudNotification] = useState<string | null>(null);

  const [state, setState] = useState<AppState>({
    isLoading: false,
    loadingStep: '',
    error: null,
    videoData: null,
  });

  const fetchUserProfile = async (targetUser: User | null = user) => {
    if (targetUser) {
      const p = await getUserProfileData(targetUser.uid);
      setUserProfile(p);
    } else {
      setUserProfile(null);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      fetchUserProfile(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleFetchSavedVideos = async () => {
    if (!user) return;
    setIsLoadingSavedVideos(true);
    try {
      const videos = await getUserSavedVideos();
      setSavedVideosList(videos);
    } catch (err) {
      console.error("Failed to fetch saved videos:", err);
    } finally {
      setIsLoadingSavedVideos(false);
    }
  };

  const handleSaveCurrentVideo = async () => {
    if (!user) {
      try {
        await signInWithGoogle();
      } catch (err) {
        return;
      }
    }
    if (!state.videoData) return;

    setIsSavingToCloud(true);
    try {
      await saveVideoToFirestore({
        topic: state.videoData.topic,
        script: state.videoData.script,
        fullScript: state.videoData.fullScript,
        hashtags: state.videoData.hashtags,
        imageUrls: state.videoData.imageUrls,
        captionStyle,
        voice
      });
      setCloudNotification("Loyiha bulutga saqlandi! ☁️✨");
      setTimeout(() => setCloudNotification(null), 3500);
    } catch (err: any) {
      alert("Xatolik: " + (err.message || "Videoni saqlab bo'lmadi"));
    } finally {
      setIsSavingToCloud(false);
    }
  };

  const handleSelectSavedVideo = (videoDoc: SavedVideoDocument) => {
    setTopic(videoDoc.topic);
    setState({
      isLoading: false,
      loadingStep: '',
      error: null,
      videoData: {
        topic: videoDoc.topic,
        script: videoDoc.script,
        fullScript: videoDoc.fullScript,
        hashtags: videoDoc.hashtags,
        imageUrls: videoDoc.imageUrls,
        audioBase64: "", // regenerates on player if needed
        imagePrompts: [],
        sources: []
      }
    });
    setIsSavedProjectsOpen(false);
  };

  const handleDeleteSavedVideo = async (videoId: string) => {
    try {
      await deleteSavedVideoFromFirestore(videoId);
      setSavedVideosList(prev => prev.filter(v => v.id !== videoId));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  // Uploaded photos come in every aspect ratio, but the video canvas is a fixed 1080x1920.
  // Pad to 9:16 with a blurred, cover-scaled copy of the photo itself so nothing is cropped
  // away and no letterbox bars appear. An already-9:16 image comes back untouched, since the
  // sharp copy then covers the blurred one exactly.
  const normalizeTo916 = (dataUrl: string): Promise<string> => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const W = 1080;
      const H = 1920;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx || !img.naturalWidth || !img.naturalHeight) return resolve(dataUrl);

      const coverScale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const cw = img.naturalWidth * coverScale;
      const ch = img.naturalHeight * coverScale;
      ctx.filter = 'blur(40px)';
      ctx.drawImage(img, (W - cw) / 2, (H - ch) / 2, cw, ch);
      ctx.filter = 'none';

      const fitScale = Math.min(W / img.naturalWidth, H / img.naturalHeight);
      const fw = img.naturalWidth * fitScale;
      const fh = img.naturalHeight * fitScale;
      ctx.drawImage(img, (W - fw) / 2, (H - fh) / 2, fw, fh);

      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

  const handleUserImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = Array.from(input.files || []);
    if (!files.length) return;

    const remainingSlots = 6 - userImages.length;
    if (remainingSlots <= 0) return;

    const read = (file: File) => new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });

    const dataUrls = await Promise.all(files.slice(0, remainingSlots).map(read));
    const normalized = await Promise.all(dataUrls.filter(Boolean).map(normalizeTo916));

    setUserImages(prev => [...prev, ...normalized].slice(0, 6));
    input.value = ''; // let the same file be picked again after a removal
  };

  const handleOutroImagesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    
    const remainingSlots = 4 - customOutroImages.length;
    if (remainingSlots <= 0) return;
    
    const filesToProcess = files.slice(0, remainingSlots);
    
    filesToProcess.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setCustomOutroImages(prev => [...prev, reader.result as string].slice(0, 4));
        }
      };
      reader.readAsDataURL(file as Blob);
    });
  };

  const removeOutroImage = (indexToRemove: number) => {
    setCustomOutroImages(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleStaticShuffle = (category: string = selectedCategory) => {
    const pool = category === "ALL" ? Object.values(CATEGORIZED_TOPICS).flat() : CATEGORIZED_TOPICS[category] || [];
    setDisplayedIdeas([...pool].sort(() => 0.5 - Math.random()).slice(0, 8));
  };

  const handleAiIdeaGeneration = async () => {
      setIsGeneratingIdeas(true);
      try {
          const newIdeas = await generateTopicIdeas(selectedCategory === "ALL" ? "Popular Names" : TOPIC_CATEGORIES[selectedCategory]);
          setDisplayedIdeas(newIdeas.length > 0 ? newIdeas : []);
      } catch (e) {
          handleStaticShuffle();
      } finally {
          setIsGeneratingIdeas(false);
      }
  };

  const checkCreditsAndAuthorize = async (): Promise<boolean> => {
    return true;
  };

  const handleConsumeCredit = async () => {
    if (!user) return;
    const isPrimaryAdmin = user.email?.toLowerCase() === 'akbarjonrovshanov13@gmail.com';
    if (isPrimaryAdmin) return;

    if (userProfile && userProfile.credits > 0) {
      const newCredit = await deductUserCreditInFirestore(user.uid, userProfile.credits);
      setUserProfile(prev => prev ? { ...prev, credits: newCredit } : null);
    }
  };

  const handleOpenScriptEditor = async () => {
    if (!topic) return;

    // Check credits before generating script
    const isAuthorized = await checkCreditsAndAuthorize();
    if (!isAuthorized) return;

    // If videoData already exists for this topic, load current segments
    if (state.videoData && state.videoData.topic.toLowerCase() === topic.toLowerCase()) {
      setDraftSegments(state.videoData.script);
      setIsScriptEditorOpen(true);
      return;
    }

    // Otherwise generate script first
    setIsGeneratingScriptOnly(true);
    try {
      const scriptData = await generateScript(topic, useSearch, hookStyle);
      setDraftSegments(scriptData.script_segments || []);
      setDraftOutroText(DEFAULT_OUTRO_TEXT);
      setDraftHashtags(scriptData.hashtags || []);
      setDraftImagePrompts(scriptData.image_prompts_en || []);
      setIsScriptEditorOpen(true);
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message || "Ssenariyni yaratib bo'lmadi" }));
    } finally {
      setIsGeneratingScriptOnly(false);
    }
  };

  const handleGenerateFromCustomScript = async (customSegments: string[], customOutro: string) => {
    if (!topic) return;
    const isAuthorized = await checkCreditsAndAuthorize();
    if (!isAuthorized) return;

    setState({ isLoading: true, loadingStep: "O'zgartirilgan ssenariyga ovoz berilmoqda...", error: null, videoData: state.videoData });

    try {
      const fullScriptWithOutro = `${customSegments.join(" ")} ${customOutro}`.trim();
      
      const audioBase64 = await generateAudio(fullScriptWithOutro, voice);
      
      setState(prev => ({ ...prev, loadingStep: 'Rasmlar moslashtirilmoqda...' }));
      let finalImages: string[] = [];
      if (state.videoData && state.videoData.imageUrls.length > 0 && imageMode !== ImageMode.GENERATE) {
        finalImages = state.videoData.imageUrls;
      } else if (imageMode === ImageMode.GENERATE) {
        finalImages = await generateImages(draftImagePrompts.length ? draftImagePrompts : [topic], topic);
      } else if (imageMode === ImageMode.FIND) {
        finalImages = await findImages(topic);
      } else {
        finalImages = userImages;
      }

      setState({
        isLoading: false,
        loadingStep: '',
        error: null,
        videoData: {
          topic,
          script: customSegments,
          fullScript: fullScriptWithOutro,
          hashtags: draftHashtags.length ? [...draftHashtags, "#luxecore", "#qadoqlash"] : ["#ismlar", "#luxecore", "#qadoqlash"],
          imageUrls: finalImages.length ? finalImages : ["/fallback/cup.jpg"],
          audioBase64,
          imagePrompts: draftImagePrompts,
          sources: state.videoData?.sources || []
        }
      });
      setIsScriptEditorOpen(false);
      await handleConsumeCredit();
    } catch (err: any) {
      setState(prev => ({ ...prev, isLoading: false, loadingStep: '', error: err.message }));
    }
  };

  const handleGenerate = async () => {
    if (!topic) return;
    if (imageMode === ImageMode.UPLOAD && userImages.length === 0) {
      setState(prev => ({ ...prev, error: "O'z rasmlaringizni tanlagansiz — kamida bitta rasm yuklang yoki 'AI yaratadi' rejimiga o'ting." }));
      return;
    }
    const isAuthorized = await checkCreditsAndAuthorize();
    if (!isAuthorized) return;

    setState({ isLoading: true, loadingStep: `${topic} ismining sirlari o'rganilmoqda...`, error: null, videoData: null });

    try {
      const scriptData = await generateScript(topic, useSearch, hookStyle);
      const outroText = DEFAULT_OUTRO_TEXT;
      const fullScriptWithOutro = `${scriptData.full_script} ${outroText}`;
      
      setState(prev => ({ ...prev, loadingStep: 'Yoqimli ovoz yozilmoqda...' }));
      const audioBase64 = await generateAudio(fullScriptWithOutro, voice);
      await new Promise(r => setTimeout(r, 800));
      
      setState(prev => ({ ...prev, loadingStep: 'Sehrli rasmlar va kadrlar chizilmoqda...' }));
      let finalImages: string[] = [];
      if (imageMode === ImageMode.GENERATE) {
        finalImages = await generateImages(scriptData.image_prompts_en || [topic], topic);
      } else if (imageMode === ImageMode.FIND) {
        finalImages = await findImages(topic);
      } else {
        finalImages = userImages;
      }
      await new Promise(r => setTimeout(r, 800));

      setState({
        isLoading: false,
        loadingStep: '',
        error: null,
        videoData: {
          topic,
          script: scriptData.script_segments,
          fullScript: fullScriptWithOutro,
          hashtags: [...scriptData.hashtags, "#luxecore", "#qadoqlash"],
          imageUrls: finalImages.length ? finalImages : ["/fallback/cup.jpg"],
          audioBase64,
          imagePrompts: scriptData.image_prompts_en,
          sources: scriptData.sources
        }
      });
      setDraftSegments(scriptData.script_segments);
      setDraftOutroText(DEFAULT_OUTRO_TEXT);
      setDraftHashtags(scriptData.hashtags);
      setDraftImagePrompts(scriptData.image_prompts_en || []);

      await handleConsumeCredit();
    } catch (err: any) {
      setState({ isLoading: false, loadingStep: '', error: err.message, videoData: null });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-brand-500 selection:text-white">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-brand-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/20 flex-shrink-0">
              <span className="text-base sm:text-xl">✨</span>
            </div>
            <div className="leading-tight">
              <h1 className="font-extrabold text-xs sm:text-base text-white whitespace-nowrap">Ismlar Ma'nosi</h1>
              <p className="text-[8px] sm:text-[10px] text-brand-300 uppercase tracking-widest font-mono">AI Generator</p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
             <button
               onClick={() => setIsAdSettingsOpen(true)}
               className="p-1.5 sm:px-3 sm:py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition flex items-center gap-1 shadow-sm"
               title="Reklama joyi va Watermark"
             >
               <span className="text-xs">📢</span>
               <span className="hidden sm:inline">Reklama</span>
             </button>

             {user?.email?.toLowerCase() === 'akbarjonrovshanov13@gmail.com' && (
               <button
                 onClick={() => setIsAdminOpen(true)}
                 className="p-1.5 sm:px-3 sm:py-1.5 rounded-xl text-xs font-bold bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 shadow-sm transition flex items-center gap-1"
                 title="Admin Panel"
               >
                 <span className="text-xs">👑</span>
                 <span className="hidden sm:inline">Admin</span>
               </button>
             )}

             <button
               onClick={() => setIsPricingOpen(true)}
               className="px-2 sm:px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500/20 to-purple-500/20 hover:from-amber-500/30 hover:to-purple-500/30 text-amber-300 border border-amber-500/40 shadow-sm transition flex items-center gap-1"
             >
               <span className="text-xs">💎</span>
               <span className="text-[10px] sm:text-xs">
                 {user?.email?.toLowerCase() === 'akbarjonrovshanov13@gmail.com' ? 'Admin' : `${userProfile?.credits || 0} ta`}
               </span>
             </button>

             {user ? (
               <div className="flex items-center gap-1">
                 <button
                   onClick={() => {
                     handleFetchSavedVideos();
                     setIsSavedProjectsOpen(true);
                   }}
                   className="p-1.5 sm:px-3 sm:py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 transition flex items-center gap-1"
                   title="Loyihalarim"
                 >
                   <span className="text-xs">☁️</span>
                   <span className="hidden md:inline">Loyihalarim</span>
                 </button>

                 <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 sm:pl-1.5 sm:pr-3 sm:py-1 rounded-xl sm:rounded-2xl">
                   {user.photoURL ? (
                     <img src={user.photoURL} alt={user.displayName || "User"} className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-slate-700" />
                   ) : (
                     <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-brand-500/30 flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-brand-300">
                       {user.displayName?.charAt(0) || "U"}
                     </div>
                   )}
                   <button
                     onClick={logOut}
                     className="text-slate-400 hover:text-red-400 p-0.5 text-xs transition"
                     title="Chiqish"
                   >
                     🚪
                   </button>
                 </div>
               </div>
                 ) : (
                <button
                  onClick={() => signInWithGoogle()}
                  className="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white shadow-lg shadow-brand-500/20 border border-brand-500/30 transition flex items-center gap-1"
                >
                  <span className="text-xs">🚀</span>
                  <span className="text-[10px] sm:text-xs">Kirish</span>
                </button>
              )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-10">
        <div className="lg:col-span-5 space-y-5 sm:space-y-8">
          <section className="bg-slate-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
            
            <label className="block text-[10px] sm:text-xs font-bold text-brand-400 uppercase tracking-widest mb-3 sm:mb-4">Kimning ismini tahlil qilamiz?</label>
            <div className="relative">
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Ism yozing (masalan: Malika)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 text-white focus:ring-2 focus:ring-brand-500 transition-all text-base sm:text-lg font-medium placeholder:text-slate-600 outline-none"
                />
                <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-xl sm:text-2xl animate-pulse">🔮</div>
            </div>
            
            <button onClick={() => { handleStaticShuffle("ALL"); setShowIdeas(true); }} className="mt-4 w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-brand-300 transition flex items-center justify-center gap-2 border border-slate-700 hover:border-brand-500/30">
               📜 Ismlar Ro'yxatidan Tanlash
            </button>
          </section>

          <section className="bg-slate-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-800 space-y-4 sm:space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                 <label className="text-[10px] font-bold text-slate-500 uppercase">Ovoz Uslubi</label>
                 <select value={voice} onChange={(e) => setVoice(e.target.value as VoiceType)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs outline-none focus:border-brand-500 text-slate-300">
                    <option value={VoiceType.FRIENDLY}>😊 Do'stona (Ayol)</option>
                    <option value={VoiceType.CALM}>🌙 Sokina (Erkak)</option>
                    <option value={VoiceType.ENERGETIC}>⚡ G'ayratli (Erkak)</option>
                    <option value={VoiceType.PROFESSIONAL}>🎙 Professional (Ayol)</option>
                 </select>
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-bold text-slate-500 uppercase">Ma'lumotlar</label>
                 <button onClick={() => setUseSearch(!useSearch)} className={`w-full p-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${useSearch ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20' : 'bg-slate-950 text-slate-500 border border-slate-800'}`}>
                    {useSearch ? '🌐 Internetdan' : '🤖 Faqat AI'}
                 </button>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="text-[10px] font-bold text-brand-400 uppercase tracking-wider block">Viral Hook Uslubi (Kirish qismi)</label>
              <select 
                value={hookStyle} 
                onChange={(e) => setHookStyle(e.target.value as HookStyle)} 
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs outline-none focus:border-brand-500 text-slate-300"
              >
                <option value={HookStyle.RANDOM}>🎲 Tasodifiy (AI tanlovi - Eng yaxshisi)</option>
                <option value={HookStyle.SHOCK}>😱 Shok va Sirli (O'chirib yubormang...)</option>
                <option value={HookStyle.FRIEND}>👥 Do'stni chaqirish (Ushbu do'stingizga yuboring...)</option>
                <option value={HookStyle.PSYCHOLOGY}>🧠 Psixologik haqiqat (Psixologlar aytishicha...)</option>
                <option value={HookStyle.INTRIGUE}>✨ Maxfiy joziba (Nega hamma qizg'anadi?)</option>
                <option value={HookStyle.WARNING}>⚠️ Ogohlantirish (Hech qachon aldamang...)</option>
                <option value={HookStyle.QUESTION}>❓ Qiziqarli savol (Bilarmidingiz?...)</option>
              </select>
              <p className="text-[9px] text-slate-500 leading-tight">Video tomoshabinini dastlabki 3 soniyada ushlab qolish uchun eng yangicha viral uslubni tanlang.</p>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">🔤 Subtitr Stili (Custom Captions)</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setCaptionStyle(CaptionStyle.TIKTOK_YELLOW)}
                  className={`p-2.5 rounded-xl text-left border transition flex flex-col justify-between ${
                    captionStyle === CaptionStyle.TIKTOK_YELLOW
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md shadow-amber-500/10'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span className="text-xs font-bold block">🟨 TikTok</span>
                  <span className="text-[9px] opacity-75 mt-1">Sariq ta'kidlash</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCaptionStyle(CaptionStyle.INSTAGRAM_WHITE)}
                  className={`p-2.5 rounded-xl text-left border transition flex flex-col justify-between ${
                    captionStyle === CaptionStyle.INSTAGRAM_WHITE
                      ? 'bg-brand-500/20 border-brand-400 text-brand-300 shadow-md shadow-brand-500/10'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span className="text-xs font-bold block">🤍 Instagram</span>
                  <span className="text-[9px] opacity-75 mt-1">Klassik Oq Pill</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCaptionStyle(CaptionStyle.NEON_GLOW)}
                  className={`p-2.5 rounded-xl text-left border transition flex flex-col justify-between ${
                    captionStyle === CaptionStyle.NEON_GLOW
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-md shadow-cyan-500/10'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span className="text-xs font-bold block">💜 Neon Glow</span>
                  <span className="text-[9px] opacity-75 mt-1">Yorqin nur aks</span>
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">🖼 Rasmlar Manbasi</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setImageMode(ImageMode.GENERATE)}
                  className={`p-2.5 rounded-xl text-left border transition flex flex-col justify-between ${
                    imageMode === ImageMode.GENERATE
                      ? 'bg-brand-500/20 border-brand-400 text-brand-300 shadow-md shadow-brand-500/10'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span className="text-xs font-bold block">✨ AI yaratadi</span>
                  <span className="text-[9px] opacity-75 mt-1">Ism va fon avtomatik</span>
                </button>

                <button
                  type="button"
                  onClick={() => setImageMode(ImageMode.UPLOAD)}
                  className={`p-2.5 rounded-xl text-left border transition flex flex-col justify-between ${
                    imageMode === ImageMode.UPLOAD
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-md shadow-emerald-500/10'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span className="text-xs font-bold block">📁 O'z rasmlarim</span>
                  <span className="text-[9px] opacity-75 mt-1">6 tagacha, 9:16</span>
                </button>
              </div>

              {imageMode === ImageMode.UPLOAD && (
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-3 gap-2">
                    {userImages.map((url, idx) => (
                      <div key={idx} className="relative aspect-[9/16] rounded-lg overflow-hidden border border-slate-700 bg-slate-950">
                        <img src={url} alt={`Rasm ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setUserImages(prev => prev.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-950/80 text-slate-300 text-[11px] leading-none flex items-center justify-center border border-slate-700 hover:text-white"
                          aria-label={`${idx + 1}-rasmni o'chirish`}
                        >
                          ×
                        </button>
                      </div>
                    ))}

                    {userImages.length < 6 && (
                      <label className="aspect-[9/16] rounded-lg border border-dashed border-slate-700 bg-slate-950 flex flex-col items-center justify-center gap-1 cursor-pointer text-slate-500 hover:text-emerald-300 hover:border-emerald-500/40 transition">
                        <span className="text-lg leading-none">+</span>
                        <span className="text-[9px]">Yuklash</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={handleUserImagesUpload}
                        />
                      </label>
                    )}
                  </div>
                  <p className="text-[9px] text-slate-500 leading-tight">
                    {userImages.length > 0
                      ? `${userImages.length}/6 rasm tanlandi. Har biri avtomatik 9:16 (1080×1920) formatiga keltiriladi.`
                      : "Istalgan o'lchamdagi rasmlarni yuklang — ular avtomatik 9:16 (1080×1920) formatiga keltiriladi."}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Pricing Banner */}
          <section className="bg-gradient-to-br from-amber-500/10 via-purple-500/10 to-slate-900 p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-amber-500/30 space-y-3">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <span className="text-xl">💎</span>
                   <div>
                      <h4 className="font-extrabold text-sm text-white">Video Yaratish Tariflari</h4>
                      <p className="text-[10px] text-amber-300">Cheksiz imkoniyatlar va yuqori tezlik</p>
                   </div>
                </div>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2.5 py-1 rounded-full border border-amber-500/30">
                   Paynet
                </span>
             </div>

             <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                   <span className="text-[10px] text-slate-400 block">3 ta Ism (Paket)</span>
                   <span className="font-black text-amber-400 text-sm">50 000 so'm</span>
                </div>
                <div className="bg-slate-950/80 p-3 rounded-xl border border-purple-500/30">
                   <span className="text-[10px] text-purple-300 block font-bold">10 ta Ism (Kreator)</span>
                   <span className="font-black text-purple-400 text-sm">100 000 so'm</span>
                </div>
             </div>

             <button
               type="button"
               onClick={() => setIsPricingOpen(true)}
               className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2"
             >
               <span>💳</span>
               <span>To'lov qilish & Chekni yuborish (@Akramjon1984)</span>
             </button>
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            <button
              disabled={state.isLoading || isGeneratingScriptOnly || !topic}
              onClick={handleGenerate}
              className={`py-4 px-4 rounded-2xl font-black text-xs uppercase tracking-wider shadow-xl transition-all active:scale-95 border ${
                state.isLoading || isGeneratingScriptOnly || !topic
                  ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'
                  : 'bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white shadow-brand-500/30 border-brand-500/50'
              }`}
            >
              {state.isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="truncate">{state.loadingStep}</span>
                </div>
              ) : (
                "⚡ Tezkor Video Yaratish"
              )}
            </button>

            <button
              disabled={state.isLoading || isGeneratingScriptOnly || !topic}
              onClick={handleOpenScriptEditor}
              className={`py-4 px-4 rounded-2xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 border ${
                state.isLoading || isGeneratingScriptOnly || !topic
                  ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'
                  : 'bg-slate-900 hover:bg-slate-800 text-amber-300 border-amber-500/40 hover:border-amber-400 shadow-lg'
              }`}
            >
              {isGeneratingScriptOnly ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                  <span>Ssenariy tayyorlanmoqda...</span>
                </div>
              ) : (
                "✍️ Ssenariyni Tahrirlash"
              )}
            </button>
          </div>

          {state.error && <div className="p-5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-xs leading-relaxed">⚠️ {state.error}</div>}
        </div>

        <div className="lg:col-span-7">
           {state.isLoading ? (
             (() => {
               const stepIdx = state.loadingStep.toLowerCase().includes("ovoz") || state.loadingStep.toLowerCase().includes("diksiya")
                 ? 2
                 : state.loadingStep.toLowerCase().includes("rasm") || state.loadingStep.toLowerCase().includes("kadr") || state.loadingStep.toLowerCase().includes("moslashtirilmoqda")
                 ? 3
                 : 1;

               return (
                 <div className="bg-slate-900/90 backdrop-blur-xl p-5 sm:p-7 rounded-2xl sm:rounded-3xl border border-slate-800 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-300">
                   {/* Topic Title Badge */}
                   <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                     <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-2xl bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-xl text-brand-400 animate-pulse">
                         ✨
                       </div>
                       <div>
                         <h3 className="font-extrabold text-sm sm:text-base text-white flex items-center gap-2">
                           <span>"{topic}" Video Generatsiyasi</span>
                           <span className="text-[10px] bg-brand-500/20 text-brand-300 px-2.5 py-0.5 rounded-full border border-brand-500/30">AI Active</span>
                         </h3>
                         <p className="text-[11px] text-slate-400">Sun'iy intellekt videongizni tayyorlamoqda...</p>
                       </div>
                     </div>
                   </div>

                   {/* 3 Step Pipeline Cards */}
                   <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                     {/* Step 1 */}
                     <div className={`p-3.5 rounded-2xl border transition-all ${
                       stepIdx > 1
                         ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                         : stepIdx === 1
                         ? 'bg-brand-500/15 border-brand-500/50 text-brand-200 shadow-lg shadow-brand-500/10 animate-pulse'
                         : 'bg-slate-950/60 border-slate-800 text-slate-500'
                     }`}>
                       <div className="flex items-center justify-between mb-1.5">
                         <span className="text-[10px] font-bold uppercase tracking-wider">Bosqich 1</span>
                         {stepIdx > 1 ? (
                           <span className="text-emerald-400 font-bold text-xs">✓ Tayyor</span>
                         ) : stepIdx === 1 ? (
                           <div className="w-3.5 h-3.5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                         ) : (
                           <span className="text-[10px] text-slate-600">Kutmoqda</span>
                         )}
                       </div>
                       <div className="font-extrabold text-xs sm:text-sm text-white mb-0.5">📜 Ssenariy & Hook</div>
                       <p className="text-[10px] text-slate-400">Viral hook va psixologik tahlil</p>
                     </div>

                     {/* Step 2 */}
                     <div className={`p-3.5 rounded-2xl border transition-all ${
                       stepIdx > 2
                         ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                         : stepIdx === 2
                         ? 'bg-brand-500/15 border-brand-500/50 text-brand-200 shadow-lg shadow-brand-500/10 animate-pulse'
                         : 'bg-slate-950/60 border-slate-800 text-slate-500'
                     }`}>
                       <div className="flex items-center justify-between mb-1.5">
                         <span className="text-[10px] font-bold uppercase tracking-wider">Bosqich 2</span>
                         {stepIdx > 2 ? (
                           <span className="text-emerald-400 font-bold text-xs">✓ Tayyor</span>
                         ) : stepIdx === 2 ? (
                           <div className="w-3.5 h-3.5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                         ) : (
                           <span className="text-[10px] text-slate-600">Kutmoqda</span>
                         )}
                       </div>
                       <div className="font-extrabold text-xs sm:text-sm text-white mb-0.5">🎙 AI Ovoz Yozish</div>
                       <p className="text-[10px] text-slate-400">Hissiyotli diksiya va audio</p>
                     </div>

                     {/* Step 3 */}
                     <div className={`p-3.5 rounded-2xl border transition-all ${
                       stepIdx === 3
                         ? 'bg-brand-500/15 border-brand-500/50 text-brand-200 shadow-lg shadow-brand-500/10 animate-pulse'
                         : 'bg-slate-950/60 border-slate-800 text-slate-500'
                     }`}>
                       <div className="flex items-center justify-between mb-1.5">
                         <span className="text-[10px] font-bold uppercase tracking-wider">Bosqich 3</span>
                         {stepIdx === 3 ? (
                           <div className="w-3.5 h-3.5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                         ) : (
                           <span className="text-[10px] text-slate-600">Kutmoqda</span>
                         )}
                       </div>
                       <div className="font-extrabold text-xs sm:text-sm text-white mb-0.5">🎨 HD Kadrlar</div>
                       <p className="text-[10px] text-slate-400">Sehrli rasmlar va montaj</p>
                     </div>
                   </div>

                   {/* Skeleton Smartphone Player Preview */}
                   <div className="flex flex-col sm:flex-row gap-6 items-center justify-center pt-2">
                     <div className="relative w-[240px] h-[400px] bg-slate-950 rounded-3xl border-2 border-slate-800 overflow-hidden shadow-2xl flex flex-col items-center justify-between p-5">
                       <div className="w-full space-y-2.5 z-10">
                         <div className="h-3 bg-slate-800/80 rounded-full w-3/4 animate-pulse" />
                         <div className="h-2.5 bg-slate-800/60 rounded-full w-1/2 animate-pulse" />
                       </div>

                       <div className="z-10 flex flex-col items-center gap-3 text-center">
                         <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-brand-600 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/30 animate-bounce">
                           <span className="text-2xl">⚡</span>
                         </div>
                         <p className="text-xs font-bold text-brand-300 tracking-wide max-w-[200px] leading-tight">{state.loadingStep}</p>
                       </div>

                       <div className="w-full space-y-2 z-10">
                         <div className="h-2.5 bg-brand-500/30 rounded-full w-full animate-pulse" />
                         <div className="h-2.5 bg-amber-500/30 rounded-full w-4/5 animate-pulse" />
                       </div>
                     </div>

                     {/* Tips and Facts Widget */}
                     <div className="flex-1 w-full bg-slate-950/80 p-4 sm:p-5 rounded-2xl border border-slate-800/80 space-y-3">
                       <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                         <span>💡</span>
                         <span>Bilasizmi?</span>
                       </div>
                       <p className="text-xs text-slate-300 leading-relaxed font-medium">
                         "Ismlar ma'nosi videolari TikTok va Instagram Reels algoritmida eng tez va eng ko'p do'stlarga ulashiladigan (Share qilinadigan) viral kontent turiga kiradi."
                       </p>
                       <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
                         <span>Kutish vaqti: ~20-35 soniya</span>
                         <span className="text-brand-400 font-mono font-bold">1080p Ultra HD</span>
                       </div>
                     </div>
                   </div>
                 </div>
               );
             })()
           ) : state.videoData ? (
             <div className="flex flex-col lg:grid lg:grid-cols-2 gap-5 sm:gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <VideoPlayer 
                  images={state.videoData.imageUrls} 
                  audioBase64={state.videoData.audioBase64 || ""} 
                  scriptSegments={state.videoData.script} 
                  topic={state.videoData.topic} 
                  customOutroImages={adConfig.customOutroImages} 
                  captionStyle={captionStyle}
                  watermarkText={adConfig.watermarkText}
                  watermarkPosition={adConfig.watermarkPosition}
                  adTitle={adConfig.adTitle}
                  adSubtitle={adConfig.adSubtitle}
                  adHandle={adConfig.adHandle}
                />
                <div className="space-y-4 sm:space-y-6">
                    <div className="bg-slate-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-800 space-y-3 sm:space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <h3 className="text-brand-400 text-[10px] font-black uppercase tracking-tighter">AI Tahlili & Matn</h3>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={handleSaveCurrentVideo}
                                disabled={isSavingToCloud}
                                className="text-[10px] bg-brand-500/10 hover:bg-brand-500/20 text-brand-300 px-3 py-1.5 rounded-xl border border-brand-500/30 font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                              >
                                {isSavingToCloud ? (
                                  <>
                                    <div className="w-3 h-3 border border-brand-300 border-t-transparent rounded-full animate-spin" />
                                    <span>Saqlanmoqda...</span>
                                  </>
                                ) : (
                                  <>
                                    <span>☁️</span>
                                    <span>Bulutga Saqlash</span>
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => {
                                  setDraftSegments(state.videoData?.script || []);
                                  setIsScriptEditorOpen(true);
                                }}
                                className="text-[10px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 px-3 py-1.5 rounded-xl border border-amber-500/30 font-bold transition flex items-center gap-1.5"
                              >
                                <span>✍️</span> Ssenariyni Tahrirlash
                              </button>
                            </div>
                        </div>
                        <p className="text-slate-300 text-sm leading-relaxed font-medium italic">"{state.videoData.fullScript}"</p>
                        <div className="pt-2 flex flex-wrap gap-2">
                            {state.videoData.hashtags.map((t, i) => <span key={i} className="text-[10px] bg-brand-500/10 text-brand-300 px-3 py-1.5 rounded-lg border border-brand-500/20">{t}</span>)}
                        </div>
                    </div>
                </div>
             </div>
           ) : (
             <div className="h-full min-h-[300px] sm:min-h-[500px] border-2 border-dashed border-slate-800 rounded-3xl sm:rounded-[40px] flex flex-col items-center justify-center text-slate-600 bg-slate-900/20 p-6">
                <div className="w-16 h-16 sm:w-24 sm:h-24 bg-slate-900 rounded-full flex items-center justify-center mb-4 sm:mb-6 shadow-inner text-3xl sm:text-4xl">🎬</div>
                <p className="text-xs sm:text-sm font-medium tracking-wide text-center">Videoni ko'rish uchun ism kiriting</p>
             </div>
           )}
        </div>
      </main>

      {/* Script Editor Modal */}
      <ScriptEditorModal
        isOpen={isScriptEditorOpen}
        onClose={() => setIsScriptEditorOpen(false)}
        topic={topic}
        initialSegments={draftSegments}
        initialOutroText={draftOutroText}
        onSaveAndGenerate={handleGenerateFromCustomScript}
        isLoading={state.isLoading}
        loadingStep={state.loadingStep}
      />

      {showIdeas && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6">
           <div className="bg-slate-900 rounded-t-3xl sm:rounded-[32px] max-w-2xl w-full border border-slate-800 shadow-2xl overflow-hidden max-h-[90vh] sm:max-h-[85vh] flex flex-col">
               <div className="p-5 sm:p-8 border-b border-slate-800 flex justify-between items-center bg-gradient-to-r from-slate-900 to-slate-800 flex-shrink-0">
                   <h3 className="text-base sm:text-xl font-black text-white uppercase tracking-tighter flex items-center gap-2">
                      <span className="text-brand-500">★</span> Ismlar Bazasi
                   </h3>
                   <button onClick={() => setShowIdeas(false)} className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 transition text-sm">✕</button>
               </div>
               
               <div className="p-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide border-b border-slate-800 bg-slate-950/50">
                  {Object.keys(TOPIC_CATEGORIES).map(cat => (
                      <button 
                        key={cat}
                        onClick={() => { setSelectedCategory(cat); handleStaticShuffle(cat); }}
                        className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition ${selectedCategory === cat ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                      >
                          {TOPIC_CATEGORIES[cat as keyof typeof TOPIC_CATEGORIES]}
                      </button>
                  ))}
               </div>

               <div className="p-4 sm:p-8 space-y-2.5 sm:space-y-3 overflow-y-auto flex-1 min-h-0">
                   {isGeneratingIdeas ? <div className="py-14 sm:py-20 text-center text-brand-500 animate-pulse font-mono text-sm">AI yangi ismlarni qidirmoqda...</div> : displayedIdeas.map((idea, i) => (
                       <button key={i} onClick={() => { setTopic(idea); setShowIdeas(false); }} className="w-full text-left p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-950 hover:bg-brand-500/10 border border-slate-800 hover:border-brand-500/40 transition-all group flex items-center justify-between">
                          <span className="text-sm sm:text-base font-semibold text-slate-300 group-hover:text-white transition-colors">{idea}</span>
                          <span className="text-brand-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0 text-xs sm:text-sm">Tanlash →</span>
                       </button>
                   ))}
               </div>
               <div className="p-4 sm:p-6 bg-slate-950/50 flex gap-3 sm:gap-4 flex-shrink-0">
                   <button onClick={() => handleStaticShuffle(selectedCategory)} className="flex-1 py-3 sm:py-4 bg-slate-800 hover:bg-slate-700 rounded-xl sm:rounded-2xl text-xs font-bold text-slate-400 transition">🔄 Boshqa ismlar</button>
                   <button onClick={handleAiIdeaGeneration} className="flex-1 py-3 sm:py-4 bg-brand-600 hover:bg-brand-500 rounded-xl sm:rounded-2xl text-xs font-bold text-white transition shadow-lg shadow-brand-500/20">✨ AI Topib bersin</button>
               </div>
           </div>
        </div>
      )}
      {/* Saved Projects Modal */}
      <SavedProjectsModal
        isOpen={isSavedProjectsOpen}
        onClose={() => setIsSavedProjectsOpen(false)}
        videos={savedVideosList}
        onSelectVideo={handleSelectSavedVideo}
        onDeleteVideo={handleDeleteSavedVideo}
        isLoading={isLoadingSavedVideos}
      />

      {/* Pricing & Subscriptions Modal */}
      <PricingModal
        isOpen={isPricingOpen}
        onClose={() => setIsPricingOpen(false)}
        onPaymentSubmitted={() => fetchUserProfile()}
      />

      {/* Admin Panel Modal */}
      <AdminModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        currentUserEmail={user?.email}
        onRefreshUserProfile={() => fetchUserProfile()}
      />

      {/* Ad & Watermark Settings Modal */}
      <AdSettingsModal
        isOpen={isAdSettingsOpen}
        onClose={() => setIsAdSettingsOpen(false)}
        adConfig={adConfig}
        onUpdateAdConfig={(newConfig) => setAdConfig(prev => ({ ...prev, ...newConfig }))}
      />

      {/* Cloud Toast Notification */}
      {cloudNotification && (
        <div className="fixed bottom-6 right-6 z-[200] bg-brand-500 text-white font-bold text-xs px-5 py-3.5 rounded-2xl shadow-2xl border border-brand-400 animate-in fade-in slide-in-from-bottom-5 duration-300 flex items-center gap-2">
          <span>✨</span>
          <span>{cloudNotification}</span>
        </div>
      )}
    </div>
  );
};

export default App;