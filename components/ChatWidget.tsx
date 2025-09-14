import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, Message, ChatSettings, ReplyInfo } from '../types';
import { firebaseService } from '../services/firebaseService';
import MessageBubble from './MessageBubble';
import Icon from './Icon';
import Waveform from './Waveform';

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
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chatId = firebaseService.getChatId(currentUser.id, peerUser.id);

  useEffect(() => {
    const unsubscribe = firebaseService.listenToMessages(chatId, setMessages);
    return () => unsubscribe();
  }, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (!isMinimized) {
        firebaseService.markMessagesAsRead(chatId, currentUser.id);
    }
  }, [messages, isMinimized, chatId, currentUser.id]);

  useEffect(() => {
      onSetVoiceCommandSuppression(isRecording);
      return () => onSetVoiceCommandSuppression(false);
  }, [isRecording, onSetVoiceCommandSuppression]);

  const handleSendMessage = (messageContent: Partial<Message>) => {
    firebaseService.sendMessage(chatId, currentUser, peerUser, {
        ...messageContent,
        replyTo: replyTo || undefined,
    });
    setInputText('');
    setReplyTo(null);
  };
  
  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
        handleSendMessage({ type: 'text', text: inputText });
    }
  };

  const handleReact = (messageId: string, emoji: string) => {
    firebaseService.reactToMessage(chatId, messageId, currentUser.id, emoji);
  };

  const handleUnsend = (messageId: string) => {
    firebaseService.unsendMessage(chatId, messageId, currentUser.id);
  };

  const handleReply = (message: Message) => {
      let content = '';
      switch(message.type) {
        case 'text': content = message.text || ''; break;
        case 'image': content = 'Image'; break;
        case 'video': content = 'Video'; break;
        case 'audio': content = `Voice Message · ${message.duration}s`; break;
        default: content = 'Message';
      }

      setReplyTo({
          messageId: message.id,
          senderName: message.senderId === currentUser.id ? 'You' : peerUser.name.split(' ')[0],
          content: content
      });
      inputRef.current?.focus();
  };

  const handleStartRecording = async () => {
    // ... recording logic ...
  };
  
  const handleStopRecording = () => {
    // ... recording logic ...
  };

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
    <div className="w-80 h-[450px] bg-slate-800 border border-slate-700 rounded-t-lg shadow-2xl flex flex-col">
      <header onClick={() => onHeaderClick(peerUser.id)} className="flex-shrink-0 p-2 flex items-center justify-between bg-slate-700/50 cursor-pointer">
        <div className="flex items-center gap-2">
            <div className="relative">
                <img src={peerUser.avatarUrl} alt={peerUser.name} className="w-9 h-9 rounded-full" />
                 <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-800 ${peerUser.onlineStatus === 'online' ? 'bg-green-500' : 'bg-slate-500'}`} />
            </div>
            <p className="font-bold text-slate-200">{peerUser.name}</p>
        </div>
        <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); onInitiateCall(peerUser, 'audio'); }} className="p-2 rounded-full text-slate-300 hover:bg-slate-600"><Icon name="phone" className="w-5 h-5"/></button>
            <button onClick={(e) => { e.stopPropagation(); onInitiateCall(peerUser, 'video'); }} className="p-2 rounded-full text-slate-300 hover:bg-slate-600"><Icon name="video-camera" className="w-5 h-5"/></button>
            <button onClick={(e) => { e.stopPropagation(); onClose(peerUser.id); }} className="p-2 rounded-full text-slate-300 hover:bg-slate-600"><Icon name="close" className="w-5 h-5"/></button>
        </div>
      </header>

      <main className="flex-grow overflow-y-auto p-3 space-y-3">
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} currentUser={currentUser} peerUser={peerUser} chatSettings={chatSettings} onReact={handleReact} onReply={handleReply} onUnsend={handleUnsend} />
        ))}
        <div ref={messagesEndRef} />
      </main>
      
      <footer className="flex-shrink-0 p-2 border-t border-slate-700">
        {replyTo && (
             <div className="text-xs text-slate-400 px-2 pb-1 flex justify-between items-center">
                <span>Replying to {replyTo.senderName}</span>
                <button onClick={() => setReplyTo(null)} className="font-bold">×</button>
            </div>
        )}
        <form onSubmit={handleTextSubmit} className="flex items-center gap-2">
            <input ref={inputRef} type="text" value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Type a message..." className="flex-grow bg-slate-700 rounded-full py-2 px-4 text-sm focus:ring-rose-500 focus:border-rose-500"/>
            <button type="submit" className="p-2 rounded-full bg-rose-600 text-white"><Icon name="paper-airplane" className="w-5 h-5"/></button>
        </form>
      </footer>
    </div>
  );
};

export default ChatWidget;
