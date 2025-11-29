import React from 'react';
import { Message } from '../types';

interface ChatMessageProps {
  message: Message;
  onImageClick: (url: string) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onImageClick }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex w-full mb-8 animate-fade-in group ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div 
        className={`
          max-w-[90%] md:max-w-[80%] lg:max-w-[70%] relative flex flex-col
          ${isUser ? 'items-end' : 'items-start'}
        `}
      >
        {/* Role Indicator / Avatar */}
        {!isUser && (
          <div className="flex items-center gap-3 mb-2 select-none opacity-80 pl-1">
             <div className="relative">
                <div className="absolute inset-0 bg-pink-500 blur-sm opacity-20 rounded-full"></div>
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#1a1a1a] to-black border border-white/10 flex items-center justify-center relative z-10">
                  <span className="text-[9px] font-bold bg-gradient-to-tr from-pink-400 to-cyan-400 bg-clip-text text-transparent">S</span>
                </div>
             </div>
             <span className="text-xs font-mono-space tracking-widest text-gray-500 uppercase">SMAPic AI</span>
          </div>
        )}

        {/* Bubble Container */}
        <div 
          className={`
            relative px-6 py-4 rounded-3xl backdrop-blur-md transition-all duration-300
            ${isUser 
              ? 'bg-white/5 border border-white/10 text-white rounded-tr-sm shadow-[0_4px_20px_-5px_rgba(0,0,0,0.3)] hover:bg-white/10' 
              : 'bg-transparent text-gray-100 pl-0 border-l-2 border-pink-500/20' 
            }
          `}
        >
          {/* Text Content */}
          {message.text && (
            <div className={`prose prose-invert max-w-none leading-7 font-light ${isUser ? 'text-[15px]' : 'text-[16px] text-gray-300'}`}>
              {message.text.split('\n').map((line, i) => (
                <p key={i} className={`mb-2 last:mb-0 ${!isUser && 'first-letter:text-xl first-letter:text-pink-400 first-letter:font-light'}`}>{line}</p>
              ))}
            </div>
          )}

          {/* Image Content - Premium Card Look */}
          {message.image && (
            <div className={`mt-4 group/image relative inline-block overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-2xl`}>
               {/* Hover Glow */}
               <div className="absolute -inset-10 bg-gradient-to-tr from-pink-500/20 via-purple-500/10 to-cyan-500/20 opacity-0 group-hover/image:opacity-100 blur-2xl transition-opacity duration-700 pointer-events-none"></div>
               
               <img 
                 src={message.image} 
                 alt="Generated content" 
                 onClick={() => onImageClick(message.image!)}
                 className="relative z-10 max-h-[400px] w-auto object-cover cursor-zoom-in transition-transform duration-700 ease-out group-hover/image:scale-[1.02]"
               />
               
               {/* Action Overlay */}
               <div className="absolute top-3 right-3 z-20 flex gap-2 opacity-0 group-hover/image:opacity-100 transition-all duration-300 transform translate-y-2 group-hover/image:translate-y-0">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onImageClick(message.image!);
                    }}
                    className="bg-black/60 backdrop-blur-md text-white p-2 rounded-full hover:bg-white hover:text-black transition-colors"
                  >
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                  </button>
               </div>
            </div>
          )}

          {/* Search Sources */}
          {message.groundingLinks && message.groundingLinks.length > 0 && (
            <div className="mt-5 pt-4 border-t border-white/5">
              <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2 font-mono-space">Fuentes de Información</p>
              <div className="flex flex-wrap gap-2">
                {message.groundingLinks.map((link, idx) => (
                  <a 
                    key={idx} 
                    href={link.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#252525] text-gray-400 hover:text-pink-300 text-xs px-3 py-2 rounded-lg border border-white/5 transition-all duration-300 group/link"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500/50 group-hover/link:bg-cyan-400 transition-colors"></span>
                    <span className="truncate max-w-[150px] font-mono-space">{link.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};