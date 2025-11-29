import React, { useState, useRef, useEffect } from 'react';
import { Message } from './types';
import { ChatMessage } from './components/ChatMessage';
import { editImage, blobToBase64 } from './services/geminiService';

interface Attachment {
  id: string;
  data: string; // base64
  mimeType: string;
}

type EngineType = 'HTL-1' | 'Qwalc-3' | 'Snapic-gen3';

const LOCAL_STORAGE_KEY = 'SMAPIC_DATA_V1';

const App: React.FC = () => {
  // --- STATE INITIALIZATION (Lazy load from LocalStorage) ---
  
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      return saved ? JSON.parse(saved).messages : [];
    } catch (e) {
      console.error("Failed to load messages", e);
      return [];
    }
  });

  const [isPremiumUnlocked, setIsPremiumUnlocked] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      return saved ? JSON.parse(saved).isPremiumUnlocked : false;
    } catch (e) {
      return false;
    }
  });

  // Application State
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null); // For Lightbox
  
  // Sidebar / Engine State
  const [selectedEngine, setSelectedEngine] = useState<EngineType>('HTL-1');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Default CLOSED as requested
  const [showLockedModal, setShowLockedModal] = useState(false);
  const [showIntroModal, setShowIntroModal] = useState(false); // Quality Service Intro
  const [showCodeModal, setShowCodeModal] = useState(false); // Code Redemption
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemError, setRedeemError] = useState('');
  const [adminMode, setAdminMode] = useState(false);

  // Attachments state for multi-image support
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragActive, setDragActive] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- EFFECTS ---

  // Persistence Effect
  useEffect(() => {
    const dataToSave = {
      messages,
      isPremiumUnlocked
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToSave));
  }, [messages, isPremiumUnlocked]);

  // Splash Screen Logic
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAppLoading(false);
      // Only show intro modal if no messages exist (first time user)
      if (messages.length === 0) {
        setShowIntroModal(true);
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, attachments]);

  // --- HANDLERS ---

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    const userText = input.trim();
    setInput('');
    
    // STRICT IMAGE POLICY CHECK
    if (attachments.length === 0) {
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        text: userText,
      };
      const rejectionMsg: Message = {
        id: crypto.randomUUID(),
        role: 'model',
        text: "⚠️ **Archivo Requerido**\n\nPor favor ingresa tu imagen primero. Mi arquitectura no me permite procesar solicitudes de texto sin una referencia visual (\"ingrediente\").",
      };
      setMessages(prev => [...prev, userMsg, rejectionMsg]);
      return;
    }

    const currentAttachments = [...attachments];
    setAttachments([]); // Clear attachments after sending
    
    // Create User Message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text: userText,
      image: currentAttachments.length > 0 ? `data:${currentAttachments[0].mimeType};base64,${currentAttachments[0].data}` : undefined // Preview first image in chat bubble for context
    };
    
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      // ALWAYS EDIT IMAGE MODE
      const responseMsg = await editImage(currentAttachments, userText || "Mejora esta imagen", selectedEngine);
      setMessages(prev => [...prev, responseMsg]);

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'model',
        text: "⚠️ Error de conexión de los motores en la nube ☁️. Intenta más tarde.",
        isError: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // File Upload Handlers
  const handleFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newAttachments: Attachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      
      try {
        const base64 = await blobToBase64(file);
        newAttachments.push({
          id: crypto.randomUUID(),
          data: base64,
          mimeType: file.type
        });
      } catch (e) {
        console.error("File upload error", e);
      }
    }

    if (newAttachments.length > 0) {
      setAttachments(prev => [...prev, ...newAttachments]);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  // Drag & Drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  // Lightbox Handler
  const openLightbox = (url: string) => setSelectedImage(url);
  const closeLightbox = () => setSelectedImage(null);

  // Engine Selection Handler
  const handleEngineSelect = (engine: EngineType) => {
    if (engine === 'Snapic-gen3' && !isPremiumUnlocked) {
      setShowLockedModal(true);
    } else {
      setSelectedEngine(engine);
    }
  };

  // Code Redemption Logic
  const handleVerifyCode = () => {
    const code = redeemCode.trim();
    if (code === "samcpic") {
      setIsPremiumUnlocked(true);
      setAdminMode(true);
      setShowCodeModal(false);
      setSelectedEngine('Snapic-gen3');
      setRedeemCode('');
      setRedeemError('');
    } else if (code === "102938XMAS2025") {
      setIsPremiumUnlocked(true);
      setShowCodeModal(false);
      setSelectedEngine('Snapic-gen3');
      setRedeemCode('');
      setRedeemError('');
    } else {
      setRedeemError("Código inválido o expirado.");
    }
  };

  // Clear Chat History
  const clearHistory = () => {
    if(window.confirm("¿Borrar historial? Esta acción no se puede deshacer.")) {
      setMessages([]);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ messages: [], isPremiumUnlocked }));
    }
  }

  // --- RENDER ---

  if (isAppLoading) {
    return (
      <div className="fixed inset-0 bg-[#030303] flex items-center justify-center z-[100] flex-col">
        <div className="relative w-28 h-28 mb-8">
           <div className="absolute inset-0 rounded-full border-t border-r border-pink-500/50 animate-spin blur-sm"></div>
           <div className="absolute inset-2 rounded-full border-b border-l border-cyan-500/50 animate-[spin_reverse_1.5s_linear_infinite] blur-sm"></div>
           <div className="absolute inset-0 flex items-center justify-center">
             <span className="text-4xl font-bold text-white tracking-widest">S</span>
           </div>
        </div>
        <h1 className="text-4xl font-bold tracking-[0.2em] text-white animate-pulse font-mono-space">
          SMAPic
        </h1>
        <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-gray-500 to-transparent mt-4 mb-2"></div>
        <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em]">Engine Initializing</p>
      </div>
    );
  }

  return (
    <div 
      className="flex h-screen w-full text-[#e3e3e3] overflow-hidden font-sans selection:bg-pink-500/30 selection:text-white"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      
      {/* --- SIDEBAR TOGGLE (When Closed) --- */}
      {!isSidebarOpen && (
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="fixed top-6 left-6 z-30 p-3 bg-black/40 backdrop-blur-md border border-white/10 rounded-full text-white hover:bg-white/10 transition-all hover:scale-105 group"
        >
          <svg className="w-5 h-5 group-hover:text-cyan-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
      )}

      {/* --- PRO SIDEBAR --- */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-[280px] bg-[#050505]/95 backdrop-blur-2xl border-r border-white/5 transform transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) flex flex-col shadow-[10px_0_30px_-10px_rgba(0,0,0,0.5)]
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Sidebar Header */}
        <div className="p-8 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
               <div className="absolute inset-0 bg-gradient-to-tr from-pink-500 to-cyan-500 blur-lg opacity-20 rounded-full"></div>
               <div className="w-10 h-10 rounded-full bg-[#111] border border-white/10 flex items-center justify-center relative z-10">
                 <span className="text-sm font-bold text-white">S</span>
               </div>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white font-mono-space">SMAPic</h1>
              <p className="text-[10px] text-gray-500 tracking-wider uppercase">SAM IA • v2.5</p>
            </div>
          </div>
          {/* CLOSE BUTTON */}
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-2 text-gray-500 hover:text-white transition-colors"
          >
             <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        {adminMode && <div className="px-8"><span className="text-[9px] bg-green-500/10 text-green-400 px-2 py-0.5 rounded border border-green-500/20 font-mono-space tracking-wider">ROOT ACCESS GRANTED</span></div>}

        {/* Modules List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-8">
           <div>
             <div className="flex items-center gap-2 mb-4 opacity-50">
               <div className="w-1 h-1 rounded-full bg-white"></div>
               <h2 className="text-[9px] uppercase tracking-[0.2em] font-bold">Motores de Renderizado</h2>
             </div>
             
             <div className="space-y-3">
               {/* Engine Module Component */}
               {[
                 { id: 'HTL-1', name: 'HTL-1', label: 'Standard Core', color: 'green', desc: 'Optimizado para velocidad' },
                 { id: 'Qwalc-3', name: 'Qwalc-3', label: 'Enhanced Core', color: 'blue', desc: 'Iluminación detallada' },
                 { id: 'Snapic-gen3', name: 'Snapic-gen3', label: 'Ultra Core', color: 'purple', desc: 'Fidelidad Máxima' }
               ].map((engine) => (
                 <button 
                   key={engine.id}
                   onClick={() => handleEngineSelect(engine.id as EngineType)}
                   className={`
                     w-full text-left p-4 rounded-xl border transition-all duration-300 relative overflow-hidden group
                     ${selectedEngine === engine.id
                       ? 'bg-white/5 border-white/10 shadow-[0_0_30px_-10px_rgba(255,255,255,0.1)]' 
                       : 'bg-transparent border-white/5 hover:bg-white/[0.02] hover:border-white/10 opacity-60 hover:opacity-100'
                     }
                   `}
                 >
                   {/* Selection Indicator Line */}
                   {selectedEngine === engine.id && (
                     <div className={`absolute left-0 top-0 bottom-0 w-[2px] bg-${engine.color}-500 shadow-[0_0_10px_currentColor]`}></div>
                   )}

                   <div className="flex items-center justify-between relative z-10">
                     <div>
                       <div className="flex items-center gap-2">
                         <span className="font-mono-space font-bold text-sm tracking-wide text-gray-200">{engine.name}</span>
                         {engine.id === 'Snapic-gen3' && !isPremiumUnlocked && (
                            <svg className="w-3 h-3 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                         )}
                         {engine.id === 'Snapic-gen3' && isPremiumUnlocked && <span className="text-yellow-400 text-[10px]">★</span>}
                       </div>
                       <p className="text-[11px] text-gray-500 mt-1 font-light">{engine.desc}</p>
                     </div>
                     <div className={`w-2 h-2 rounded-full ${selectedEngine === engine.id ? `bg-${engine.color}-500 shadow-[0_0_8px_currentColor]` : 'bg-gray-800'}`}></div>
                   </div>
                 </button>
               ))}
             </div>
           </div>
        </div>
        
        {/* Footer Actions */}
        <div className="p-6 border-t border-white/5 space-y-3">
           {!isPremiumUnlocked && (
               <button 
                 onClick={() => setShowCodeModal(true)}
                 className="w-full py-3 text-[10px] uppercase tracking-wider font-bold text-gray-400 hover:text-white hover:bg-white/5 rounded-lg border border-dashed border-white/10 hover:border-pink-500/30 transition-all flex items-center justify-center gap-2"
               >
                 Canjear Código
               </button>
           )}
           <button 
              onClick={clearHistory}
              className="w-full py-2 text-[10px] text-gray-600 hover:text-red-400 transition-colors uppercase tracking-widest"
           >
             Reiniciar Sistema
           </button>
        </div>
      </div>

      {/* --- MAIN CONTENT AREA --- */}
      <div className="flex-1 flex flex-col relative z-0 h-full w-full">
        
        {/* Chat Scroll Area */}
        <div className="flex-1 overflow-y-auto px-4 md:px-12 py-8 space-y-8 scroll-smooth w-full">
          {/* HERO EMPTY STATE */}
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center animate-fade-in opacity-0" style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}>
               <div className="relative w-32 h-32 mb-8 group">
                  <div className="absolute inset-0 bg-gradient-to-r from-pink-500 to-cyan-500 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-1000"></div>
                  <div className="w-full h-full rounded-full border border-white/10 flex items-center justify-center relative bg-[#050505]">
                    <span className="text-6xl font-bold bg-gradient-to-br from-white to-gray-500 bg-clip-text text-transparent select-none">S</span>
                  </div>
               </div>
               <h2 className="text-3xl md:text-5xl font-bold text-center tracking-tight text-white mb-4">
                 ¿Qué vamos a <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-cyan-400">crear</span> hoy?
               </h2>
               <p className="text-gray-500 text-center max-w-md mb-8 font-light text-sm md:text-base">
                 Sube una imagen ("ingrediente") y deja que el motor <span className="font-mono-space text-gray-400">{selectedEngine}</span> haga el resto.
               </p>
               <button 
                 onClick={() => fileInputRef.current?.click()}
                 className="group relative px-8 py-4 bg-white text-black rounded-full overflow-hidden transition-transform hover:scale-105"
               >
                 <div className="absolute inset-0 bg-gradient-to-r from-pink-500 to-cyan-500 opacity-0 group-hover:opacity-20 transition-opacity"></div>
                 <span className="relative font-bold text-sm tracking-widest uppercase flex items-center gap-2">
                   <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14m-7-7h14" strokeLinecap="round" strokeLinejoin="round"/></svg>
                   Subir Ingrediente
                 </span>
               </button>
            </div>
          )}

          {/* MESSAGES */}
          <div className="w-full max-w-4xl mx-auto pb-32">
            {messages.map((msg) => (
              <ChatMessage 
                key={msg.id} 
                message={msg} 
                onImageClick={openLightbox}
              />
            ))}
            {isLoading && (
              <div className="flex w-full mb-8 animate-pulse pl-4">
                 <div className="flex items-center gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-pink-500"></div>
                   <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 delay-100"></div>
                   <span className="text-xs font-mono-space text-gray-500 ml-2 uppercase tracking-widest">Procesando...</span>
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* --- FLOATING INPUT BAR --- */}
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 z-20 pointer-events-none">
          <div className="absolute bottom-0 left-0 w-full h-48 bg-gradient-to-t from-[#030303] via-[#030303]/80 to-transparent pointer-events-none"></div>
          
          <div className="max-w-3xl mx-auto relative pointer-events-auto">
             <div className={`
                glass-panel input-glow rounded-[2rem] p-2 flex items-end gap-3 transition-all duration-300
                ${dragActive ? 'ring-2 ring-pink-500 scale-[1.02]' : ''}
             `}>
                
                {/* Image Previews (Floating above) */}
                {attachments.length > 0 && (
                  <div className="absolute -top-20 left-4 flex gap-3">
                    {attachments.map(att => (
                      <div key={att.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/20 shadow-lg animate-fade-in group">
                        <img src={`data:${att.mimeType};base64,${att.data}`} className="w-full h-full object-cover" />
                        <button 
                          onClick={() => removeAttachment(att.id)}
                          className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <span className="text-white text-lg">×</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* File Upload Trigger */}
                <input 
                  type="file" 
                  multiple
                  ref={fileInputRef} 
                  onChange={(e) => handleFile(e.target.files)} 
                  className="hidden" 
                  accept="image/*"
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-12 h-12 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
                  title="Añadir imagen"
                >
                   <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </button>

                {/* Text Area */}
                <textarea
                   value={input}
                   onChange={(e) => setInput(e.target.value)}
                   onKeyDown={handleKeyDown}
                   placeholder={attachments.length > 0 ? "Describe tus cambios..." : "Sube una imagen para comenzar..."}
                   rows={1}
                   className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none py-3 px-2 resize-none max-h-32 text-base font-light tracking-wide leading-relaxed"
                   style={{ minHeight: '48px' }}
                />

                {/* Send Button */}
                <button 
                  onClick={handleSend}
                  disabled={isLoading || (!input.trim() && attachments.length === 0)}
                  className={`
                    w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300
                    ${(input.trim() || attachments.length > 0) && !isLoading 
                       ? 'bg-white text-black hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)]' 
                       : 'bg-white/5 text-gray-600 cursor-not-allowed'
                    }
                  `}
                >
                   <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                </button>
             </div>
             
             <div className="text-center mt-3">
               <p className="text-[9px] text-gray-600 uppercase tracking-widest font-mono-space">
                 SMAPic AI v2.5 • Engine: {selectedEngine}
               </p>
             </div>
          </div>
        </div>

      </div>

      {/* --- MODALS (Re-styled for Pro Look) --- */}

      {/* Intro Modal */}
      {showIntroModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setShowIntroModal(false)}></div>
          <div className="relative glass-panel rounded-[24px] w-full max-w-md p-1 shadow-2xl animate-fade-in overflow-hidden border border-white/10">
             <div className="bg-[#0a0a0a] rounded-[20px] overflow-hidden">
                <div className="relative h-56 w-full">
                   <img 
                     src="https://fluxai.pro/_next/image?url=https%3A%2F%2Fs.detools.dev%2Fassets%2Fal-164y8tnqh.jpeg&w=3840&q=75" 
                     className="w-full h-full object-cover opacity-80"
                   />
                   <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent"></div>
                   <div className="absolute bottom-4 left-6">
                      <h3 className="text-2xl font-bold text-white tracking-tight">Experiencia Visual</h3>
                      <div className="h-1 w-12 bg-pink-500 mt-2"></div>
                   </div>
                </div>
                <div className="p-6 pt-4">
                  <p className="text-sm text-gray-400 font-light leading-relaxed mb-6">
                    Bienvenido a <strong className="text-white">SMAPic</strong>. Hemos calibrado nuestros motores neuronales para ofrecerte la máxima calidad de edición.
                  </p>
                  <div className="grid grid-cols-3 gap-2 mb-6">
                    {['HTL-1', 'Qwalc-3', 'Snapic-gen3'].map(e => (
                      <div key={e} className="bg-white/5 rounded-lg p-2 text-center border border-white/5">
                        <span className="block text-[9px] text-gray-500 uppercase tracking-wider">Engine</span>
                        <span className="text-[10px] font-bold text-gray-200">{e.split('-')[0]}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setShowIntroModal(false)} className="w-full bg-white text-black font-bold py-3.5 rounded-xl hover:bg-gray-200 transition-colors text-xs uppercase tracking-widest">
                    Iniciar Sistema
                  </button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Locked Modal */}
      {showLockedModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowLockedModal(false)}></div>
           <div className="relative glass-panel rounded-2xl p-8 max-w-sm text-center shadow-[0_0_50px_-10px_rgba(168,85,247,0.3)] animate-fade-in border border-purple-500/20">
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-purple-500/20 to-pink-500/20 mx-auto flex items-center justify-center mb-6 text-2xl border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.3)]">🔒</div>
              <h3 className="text-xl font-bold text-white mb-2">Acceso Restringido</h3>
              <p className="text-sm text-gray-400 mb-8 font-light">
                El motor <strong>Snapic-gen3</strong> está reservado para usuarios verificados.
              </p>
              <a 
                href="https://instagram.com/sam.ttx3" 
                target="_blank" 
                rel="noreferrer"
                className="block w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-3 rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all text-xs uppercase tracking-wider mb-4"
              >
                Solicitar Acceso (@sam.ttx3)
              </a>
              <button onClick={() => setShowLockedModal(false)} className="text-gray-500 text-xs hover:text-white transition-colors">Cancelar</button>
           </div>
        </div>
      )}

      {/* Code Modal */}
      {showCodeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-black/90 backdrop-blur-lg" onClick={() => setShowCodeModal(false)}></div>
           <div className="relative bg-[#0f0f0f] border border-white/10 rounded-2xl p-8 w-full max-w-sm shadow-2xl animate-fade-in">
              <h3 className="text-lg font-bold text-white mb-2 font-mono-space">Terminal de Acceso</h3>
              <p className="text-xs text-gray-500 mb-6 font-light">Introduce el código de autorización para desbloquear funciones.</p>
              
              <div className="relative mb-4">
                 <input 
                   type="text" 
                   value={redeemCode}
                   onChange={(e) => setRedeemCode(e.target.value)}
                   placeholder="CODE_INPUT..." 
                   className="w-full bg-[#050505] border border-white/10 rounded-lg p-4 text-white text-sm focus:border-pink-500 focus:outline-none font-mono-space tracking-widest placeholder-gray-700"
                 />
                 <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] rounded-lg"></div>
              </div>
              
              {redeemError && <p className="text-red-500 text-xs mb-4 flex items-center gap-2"><span>✕</span> {redeemError}</p>}

              <div className="flex gap-3">
                <button onClick={() => setShowCodeModal(false)} className="flex-1 bg-white/5 text-gray-400 py-3 rounded-lg text-xs hover:bg-white/10">CANCELAR</button>
                <button onClick={handleVerifyCode} className="flex-1 bg-white text-black font-bold py-3 rounded-lg text-xs hover:bg-gray-200 uppercase tracking-wide">EJECUTAR</button>
              </div>
           </div>
        </div>
      )}

      {/* Lightbox */}
      {selectedImage && (
        <div className="fixed inset-0 z-[70] bg-[#030303]/98 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in">
           <button onClick={closeLightbox} className="absolute top-6 right-6 text-white/30 hover:text-white transition-colors p-4 z-50">
             <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/></svg>
           </button>
           
           <div className="relative max-w-7xl max-h-[90vh] w-full h-full flex items-center justify-center">
              <img src={selectedImage} className="max-w-full max-h-full object-contain rounded-lg shadow-[0_0_100px_-20px_rgba(255,46,99,0.1)]" alt="Full view" />
           </div>

           <a 
             href={selectedImage} 
             download="smapic-edit.png"
             className="absolute bottom-10 bg-white text-black px-8 py-3 rounded-full font-bold hover:scale-105 transition-transform flex items-center gap-2 shadow-[0_0_30px_rgba(255,255,255,0.1)]"
           >
             <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeLinecap="round" strokeLinejoin="round"/></svg>
             Guardar Imagen
           </a>
        </div>
      )}

    </div>
  );
};

export default App;