import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, Message, ChatSettings, ReplyInfo, ChatTheme } from '../types';
import { firebaseService } from '../services/firebaseService';
import MessageBubble from './MessageBubble';
import Icon from './Icon';
import Waveform from './Waveform';
import { CHAT_THEMES } from '../constants';

interface ChatWidgetProps {
  currentUser: User;
  peerUser: User;
  onClose: (peerId: string) => void;
  onMinimize: (peerId: string) => void;
  onHeaderClick: (peerId: string) => void;
  isMinimized: boolean;
  unreadCount: number;
  onInitiateCall: (peer: User, type: 'audio' | 'video') => void;
  onSetVoiceCommandSuppression: (isSuppressed: boolean) => void;
}

const ChatWidget: React.FC<ChatWidgetProps> = ({
  currentUser,
  peerUser,
  onClose,
  onMinimize,
  onHeaderClick,
  isMinimized,
  unreadCount,
  onInitiateCall,
  onSetVoiceCommandSuppression,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [chatSettings, setChatSettings] = useState<Partial<ChatSettings>>({ theme: 'default' });
  const [replyTo, setReplyTo] = useState<ReplyInfo | null>(null);
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  
  // Media file state
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chatId = firebaseService.getChatId(currentUser.id, peerUser.id);
  const theme = CHAT_THEMES[chatSettings.theme || 'default'];

  useEffect(() => {
    const unsubscribe = firebaseService.listenToMessages(chatId, setMessages);
    return () => unsubscribe();
  }, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (!isMinimized) {
      // FIX: Corrected call to firebaseService as this method was not passed through geminiService.
      firebaseService.markMessagesAsRead(chatId, currentUser.id);
    }
  }, [messages, isMinimized, chatId, currentUser.id]);

  useEffect(() => {
    onSetVoiceCommandSuppression(isRecording);
    return () => onSetVoiceCommandSuppression(false);
  }, [isRecording, onSetVoiceCommandSuppression]);

  const handleSendMessage = (messageContent: Partial<Message> & { audioBlob?: Blob, mediaFile?: File }) => {
    firebaseService.sendMessage(chatId, currentUser, peerUser, {
      ...messageContent,
      replyTo: replyTo || undefined,
    });
    setInputText('');
    setReplyTo(null);
    setMediaFile(null);
    if(mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaPreview(null);
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mediaFile && mediaPreview) {
        handleSendMessage({ mediaFile });
    } else if (inputText.trim()) {
      handleSendMessage({ type: 'text', text: inputText });
    }
  };

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setRecordingDuration(d => d + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = e => audioChunksRef.current.push(e.data);
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        handleSendMessage({ type: 'audio', audioBlob, duration: recordingDuration });
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
      startTimer();
    } catch (err) {
      console.error("Mic permission error:", err);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    stopTimer();
    setRecordingDuration(0);
  };
  
  const handleCancelRecording = () => {
      if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
          mediaRecorderRef.current = null;
      }
      setIsRecording(false);
      stopTimer();
      setRecordingDuration(0);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          setMediaFile(file);
          setMediaPreview(URL.createObjectURL(file));
      }
  };
  
  const cancelMediaPreview = () => {
      setMediaFile(null);
      if(mediaPreview) URL.revokeObjectURL(mediaPreview);
      setMediaPreview(null);
  }

  if (isMinimized) {
    return (
      <button onClick={() => onHeaderClick(peerUser.id)} className="w-16 h-16 rounded-full relative shadow-lg">
        <img src={peerUser.avatarUrl} alt={peerUser.name} className="w-full h-full rounded-full" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-slate-900">{unreadCount}</span>
        )}
      </button>
    );
  }

  return (
    <div className={`w-80 h-[450px] bg-gradient-to-br ${theme.bgGradient} border border-slate-700 rounded-t-lg shadow-2xl flex flex-col`}>
      <header onClick={() => onHeaderClick(peerUser.id)} className="flex-shrink-0 p-2 flex items-center justify-between bg-black/20 cursor-pointer">
        <div className="flex items-center gap-2">
          <div className="relative">
            <img src={peerUser.avatarUrl} alt={peerUser.name} className="w-9 h-9 rounded-full" />
            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-800 ${peerUser.onlineStatus === 'online' ? 'bg-green-500' : 'bg-slate-500'}`} />
          </div>
          <p className={`font-bold ${theme.headerText}`}>{peerUser.name}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); onInitiateCall(peerUser, 'audio'); }} className={`p-2 rounded-full ${theme.headerText} hover:bg-black/20`}><Icon name="phone" className="w-5 h-5"/></button>
          <button onClick={(e) => { e.stopPropagation(); onInitiateCall(peerUser, 'video'); }} className={`p-2 rounded-full ${theme.headerText} hover:bg-black/20`}><Icon name="video-camera" className="w-5 h-5"/></button>
          <button onClick={(e) => { e.stopPropagation(); onClose(peerUser.id); }} className={`p-2 rounded-full ${theme.headerText} hover:bg-black/20`}><Icon name="close" className="w-5 h-5"/></button>
        </div>
      </header>

      <main className="flex-grow overflow-y-auto p-3 space-y-3">
        {messages.map(msg => (
          // FIX: Corrected calls to firebaseService for react and unsend as these methods were not passed through geminiService.
          <MessageBubble key={msg.id} message={msg} currentUser={currentUser} peerUser={peerUser} chatSettings={chatSettings} onReact={(id, emoji) => firebaseService.reactToMessage(chatId, id, currentUser.id, emoji)} onReply={()=>{}} onUnsend={(id) => firebaseService.unsendMessage(chatId, id, currentUser.id)} />
        ))}
        <div ref={messagesEndRef} />
      </main>
      
      {mediaPreview && (
          <div className="p-2 border-t border-slate-700/50 bg-black/20 relative">
              <img src={mediaPreview} alt="Preview" className="max-h-24 rounded-md" />
              <button onClick={cancelMediaPreview} className="absolute top-3 right-3 bg-black/50 p-1 rounded-full text-white"><Icon name="close" className="w-4 h-4"/></button>
          </div>
      )}

      <footer className="flex-shrink-0 p-2 border-t border-slate-700/50">
        {isRecording ? (
             <div className="flex items-center justify-between h-10 px-2">
                <button onClick={handleCancelRecording} className="text-red-400 font-semibold">Cancel</button>
                <div className="w-24 h-full"><Waveform isPlaying={true} isRecording={true} /></div>
                <div className="font-mono text-sm text-slate-300">0:{recordingDuration.toString().padStart(2, '0')}</div>
                <button onClick={handleStopRecording} className="p-2 bg-rose-600 rounded-full text-white"><Icon name="paper-airplane" className="w-5 h-5"/></button>
             </div>
        ) : (
             <form onSubmit={handleTextSubmit} className="flex items-center gap-2">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,video/*" className="hidden"/>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-300 hover:text-white"><Icon name="add-circle" className="w-6 h-6"/></button>
                <input ref={inputRef} type="text" value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Type a message..." className="flex-grow bg-slate-700 rounded-full py-2 px-4 text-sm focus:ring-rose-500 focus:border-rose-500 text-white"/>
                {inputText || mediaFile ? (
                    <button type="submit" className="p-2 rounded-full bg-rose-600 text-white"><Icon name="paper-airplane" className="w-5 h-5"/></button>
                ) : (
                    <button type="button" onClick={handleStartRecording} className="p-2 text-slate-300 hover:text-white"><Icon name="mic" className="w-6 h-6"/></button>
                )}
            </form>
        )}
      </footer>
    </div>
  );
};

export default ChatWidget;