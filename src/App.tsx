/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, 
  MicOff, 
  Send, 
  MessageSquare, 
  Sparkles, 
  Volume2, 
  VolumeX,
  Heart,
  Coffee,
  Moon,
  Sun
} from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";
import Markdown from 'react-markdown';
import { cn } from './lib/utils';
import { useAudioRecorder, useAudioPlayer } from './hooks/useAudio';
import { SYSTEM_INSTRUCTION, MODEL_NAME } from './constants';

interface Message {
  role: 'user' | 'model';
  text: string;
  id: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [modelStatus, setModelStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<any>(null);
  const { isRecording, startRecording, stopRecording } = useAudioRecorder();
  const { playChunk, stopAll: stopAudioPlayback } = useAudioPlayer();

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, transcription, scrollToBottom]);

  const connectLive = async () => {
    if (isLive) {
      stopLive();
      return;
    }

    setIsConnecting(true);
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    try {
      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
        },
        callbacks: {
          onopen: () => {
            setIsLive(true);
            setIsConnecting(false);
            setModelStatus('listening');
            startRecording((base64Data) => {
              sessionRef.current?.sendRealtimeInput({
                media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
              });
            });
          },
          onmessage: async (message) => {
            if (message.serverContent?.modelTurn) {
              setModelStatus('speaking');
              const parts = message.serverContent.modelTurn.parts;
              for (const part of parts) {
                if (part.inlineData) {
                  playChunk(part.inlineData.data);
                }
                if (part.text) {
                  setTranscription(prev => prev + part.text);
                }
              }
            }

            if (message.serverContent?.turnComplete) {
              setModelStatus('listening');
              if (transcription) {
                setMessages(prev => [...prev, { 
                  role: 'model', 
                  text: transcription, 
                  id: Math.random().toString(36).substring(7) 
                }]);
                setTranscription('');
              }
            }

            if (message.serverContent?.interrupted) {
              stopAudioPlayback();
              setModelStatus('listening');
            }
          },
          onclose: () => {
            stopLive();
          },
          onerror: (err) => {
            console.error('Live API Error:', err);
            stopLive();
          }
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error('Failed to connect:', err);
      setIsConnecting(false);
    }
  };

  const stopLive = () => {
    stopRecording();
    stopAudioPlayback();
    sessionRef.current?.close();
    sessionRef.current = null;
    setIsLive(false);
    setIsConnecting(false);
    setModelStatus('idle');
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;

    const userMsg: Message = { 
      role: 'user', 
      text: inputText, 
      id: Math.random().toString(36).substring(7) 
    };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setModelStatus('thinking');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [...messages, userMsg].map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        })),
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        }
      });

      const modelText = response.text || "I'm here for you, but I couldn't find the words just now.";
      setMessages(prev => [...prev, { 
        role: 'model', 
        text: modelText, 
        id: Math.random().toString(36).substring(7) 
      }]);
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setModelStatus('idle');
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden">
      <div className="atmosphere" />
      
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 p-6 flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
            <Sparkles className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-medium tracking-tight text-white">ProfX</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-mono">Soul Companion</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isLive ? "bg-emerald-500 animate-pulse" : "bg-stone-600"
            )} />
            <span className="text-xs font-mono text-stone-400">
              {isLive ? "Live Session" : "Offline"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Interaction Area */}
      <main className="w-full max-w-4xl flex-1 flex flex-col gap-8 pt-24 pb-32">
        
        {/* Visualizer / Avatar */}
        <div className="flex-1 flex flex-col items-center justify-center relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={modelStatus}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.2, opacity: 0 }}
              className="relative"
            >
              {/* Central Orb */}
              <div className={cn(
                "w-48 h-48 rounded-full transition-all duration-1000 relative z-10",
                modelStatus === 'idle' && "bg-stone-800 border border-stone-700",
                modelStatus === 'listening' && "bg-orange-500/20 border-2 border-orange-500/50 shadow-[0_0_50px_rgba(249,115,22,0.3)]",
                modelStatus === 'thinking' && "bg-indigo-500/20 border-2 border-indigo-500/50 shadow-[0_0_50px_rgba(99,102,241,0.3)]",
                modelStatus === 'speaking' && "bg-emerald-500/20 border-2 border-emerald-500/50 shadow-[0_0_50px_rgba(16,185,129,0.3)]"
              )}>
                {/* Internal Glows */}
                <motion.div 
                  animate={{ 
                    scale: modelStatus === 'speaking' ? [1, 1.1, 1] : 1,
                    opacity: modelStatus === 'idle' ? 0.2 : 0.6
                  }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute inset-4 rounded-full bg-gradient-to-tr from-white/10 to-transparent" 
                />
              </div>

              {/* Orbiting Rings */}
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute inset-[-20px] border border-white/5 rounded-full"
              />
              <motion.div 
                animate={{ rotate: -360 }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                className="absolute inset-[-40px] border border-white/5 rounded-full"
              />
            </motion.div>
          </AnimatePresence>

          <div className="mt-12 text-center">
            <h2 className="font-serif text-3xl text-stone-100 italic">
              {modelStatus === 'idle' && "I'm here, whenever you're ready."}
              {modelStatus === 'listening' && "I'm listening..."}
              {modelStatus === 'thinking' && "Thinking..."}
              {modelStatus === 'speaking' && "..."}
            </h2>
          </div>
        </div>

        {/* Chat History (Scrollable) */}
        <div 
          ref={scrollRef}
          className="glass-panel h-64 overflow-y-auto p-6 space-y-6 mask-fade-edges"
        >
          {messages.length === 0 && !transcription && (
            <div className="h-full flex flex-col items-center justify-center text-stone-500 gap-4">
              <Coffee className="w-8 h-8 opacity-20" />
              <p className="text-sm italic">Start a conversation or click the mic to talk.</p>
            </div>
          )}
          
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex flex-col max-w-[85%]",
                msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
              )}
            >
              <span className="text-[10px] uppercase tracking-widest text-stone-500 mb-1 font-mono">
                {msg.role === 'user' ? "You" : "ProfX"}
              </span>
              <div className={cn(
                "px-4 py-3 rounded-2xl text-sm leading-relaxed",
                msg.role === 'user' 
                  ? "bg-stone-800 text-stone-200 rounded-tr-none" 
                  : "bg-white/5 text-stone-300 rounded-tl-none border border-white/5"
              )}>
                <div className="markdown-body">
                  <Markdown>{msg.text}</Markdown>
                </div>
              </div>
            </motion.div>
          ))}

          {transcription && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-start mr-auto max-w-[85%]"
            >
              <span className="text-[10px] uppercase tracking-widest text-stone-500 mb-1 font-mono">ProfX (Speaking)</span>
              <div className="px-4 py-3 rounded-2xl text-sm bg-emerald-500/10 text-emerald-200/80 border border-emerald-500/20 rounded-tl-none italic">
                {transcription}
              </div>
            </motion.div>
          )}
        </div>
      </main>

      {/* Controls */}
      <footer className="fixed bottom-0 left-0 right-0 p-6 md:p-8 flex flex-col items-center gap-6 z-10">
        <div className="w-full max-w-2xl flex items-center gap-4">
          {/* Voice Toggle */}
          <button
            onClick={connectLive}
            disabled={isConnecting}
            className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 shadow-lg",
              isLive 
                ? "bg-red-500 hover:bg-red-600 shadow-red-500/20" 
                : "bg-stone-100 hover:bg-white text-stone-900 shadow-white/10"
            )}
          >
            {isConnecting ? (
              <div className="w-6 h-6 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
            ) : isLive ? (
              <MicOff className="w-6 h-6" />
            ) : (
              <Mic className="w-6 h-6" />
            )}
          </button>

          {/* Text Input */}
          <form 
            onSubmit={handleSendMessage}
            className="flex-1 relative"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Share your thoughts..."
              className="w-full bg-white/5 border border-white/10 rounded-full py-4 px-6 pr-14 text-stone-200 placeholder-stone-600 focus:outline-none focus:border-orange-500/50 transition-colors"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isLive}
              className="absolute right-2 top-2 w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

        <div className="flex items-center gap-6 text-stone-500">
          <button className="hover:text-stone-300 transition-colors flex items-center gap-2 text-xs font-mono uppercase tracking-widest">
            <Heart className="w-3 h-3" />
            Empathy Mode
          </button>
          <div className="w-px h-4 bg-white/10" />
          <p className="text-[10px] font-mono uppercase tracking-[0.3em]">Bilingual Companion (EN/BN)</p>
        </div>
      </footer>

      <style>{`
        .mask-fade-edges {
          mask-image: linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%);
        }
      `}</style>
    </div>
  );
}
