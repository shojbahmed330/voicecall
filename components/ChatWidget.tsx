import React, { useState, useEffect, useRef } from 'react';
import { User, Message, ReplyInfo } from '../types';
import { firebaseService } from '../services/firebaseService';
import { geminiService } from '../services/geminiService';
import Icon from './Icon';
import MessageBubble from './MessageBubble';
import Waveform from './Waveform';

const EMOJIS = ['😂', '❤️', '👍', '😢', '😡', '🔥', '😊', '😮'];

interface ChatWidgetProps {
  currentUser: User;
  peerUser: User;
  onClose: (peerId: string) => void;
  onMinimize: (peerId: string) => void;
  onHeaderClick: (peerId: string) => void;
  isMinimized: boolean;
  unreadCount: number;
}

const ChatWidget: React.FC<ChatWidgetProps> = ({ currentUser, peerUser, onClose, onMinimize, onHeaderClick, isMinimized, unreadCount }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const chatId = firebaseService.getChatId(currentUser.id, peerUser.id);
  
  useEffect(() => {
    const unsubscribe = firebaseService.listenToMessages(chatId, (newMessages) => {
      setMessages(newMessages);
    });
    return () => unsubscribe();
  }, [chatId]);

  useEffect(() => {
    if (!isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      firebaseService.markMessagesAsRead(chatId, currentUser.id);
    }
  }, [messages, isMinimized, chatId, currentUser.id]);
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    let replyInfo: ReplyInfo | undefined = undefined;
    if (replyingTo) {
      const senderName = replyingTo.senderId === currentUser.id ? currentUser.name : peerUser.name;
      replyInfo = geminiService.createReplySnippet(replyingTo);
      replyInfo.senderName = senderName; // Correct sender name
    }

    await firebaseService.sendMessage(chatId, currentUser, peerUser, {
      type: 'text',
      text: newMessage.trim(),
      replyTo: replyInfo,
    });
    setNewMessage('');
    setReplyingTo(null);
  };
  
  const handleReactToMessage = (messageId: string, emoji: string) => {
    firebaseService.reactToMessage(chatId, messageId, currentUser.id, emoji);
  };
  
  const handleEmojiSelect = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
  };

  if (isMinimized) {
    return (
      <button onClick={() => onHeaderClick(peerUser.id)} className="w-60 h-12 bg-slate-800 border-t-2 border-lime-500/50 rounded-t-lg flex items-center px-3 gap-2 shadow-lg hover:bg-slate-700">
        <div className="relative">
          <img src={peerUser.avatarUrl} alt={peerUser.name} className="w-8 h-8 rounded-full" />
          <div
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border border-slate-800 ${
                  peerUser.onlineStatus === 'online' ? 'bg-green-500' : 'bg-slate-500'
              }`}
          />
        </div>
        <span className="text-white font-semibold truncate flex-grow text-left">{peerUser.name}</span>
        {unreadCount > 0 && <span className="bg-rose-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">{unreadCount}</span>}
        <button onClick={(e) => { e.stopPropagation(); onClose(peerUser.id); }} className="p-1 rounded-full hover:bg-slate-600 text-slate-400">
          <Icon name="close" className="w-4 h-4" />
        </button>
      </button>
    );
  }

  return (
    <div className="w-80 h-[450px] bg-slate-800 rounded-t-lg flex flex-col shadow-2xl border border-b-0 border-slate-700">
      <header onClick={() => onMinimize(peerUser.id)} className="flex-shrink-0 flex items-center justify-between p-2 bg-slate-700 rounded-t-lg cursor-pointer">
        <div className="flex items-center gap-2">
          <div className="relative">
            <img src={peerUser.avatarUrl} alt={peerUser.name} className="w-8 h-8 rounded-full" />
             <div
                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border border-slate-700 ${
                    peerUser.onlineStatus === 'online' ? 'bg-green-500' : 'bg-slate-500'
                }`}
            />
          </div>
          <span className="text-white font-semibold">{peerUser.name}</span>
        </div>
        <div className="flex items-center">
          <button onClick={(e) => e.stopPropagation()} className="p-2 rounded-full hover:bg-slate-600 text-slate-400"><Icon name="phone" className="w-5 h-5"/></button>
          <button onClick={(e) => e.stopPropagation()} className="p-2 rounded-full hover:bg-slate-600 text-slate-400"><Icon name="video-camera" className="w-5 h-5"/></button>
          <button onClick={(e) => { e.stopPropagation(); onMinimize(peerUser.id); }} className="p-2 rounded-full hover:bg-slate-600 text-slate-400">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onClose(peerUser.id); }} className="p-2 rounded-full hover:bg-slate-600 text-slate-400">
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>
      </header>
      <main className="flex-grow overflow-y-auto p-3 space-y-1">
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            currentUser={currentUser}
            peerUser={peerUser}
            onReply={setReplyingTo}
            onReact={handleReactToMessage}
          />
        ))}
        <div ref={messagesEndRef} />
      </main>
      <footer className="p-2 border-t border-slate-700">
        {replyingTo && (
            <div className="text-xs text-slate-300 px-3 pb-2 flex justify-between items-center bg-slate-700/50 rounded-t-md -mx-2 -mt-2 mb-2 p-2">
                <div>
                    <span>Replying to {replyingTo.senderId === currentUser.id ? 'yourself' : peerUser.name}</span>
                    <p className="line-clamp-1 italic text-slate-400">"{replyingTo.text || 'Media message'}"</p>
                </div>
                <button onClick={() => setReplyingTo(null)} className="p-1 rounded-full hover:bg-slate-600"><Icon name="close" className="w-4 h-4"/></button>
            </div>
        )}
        <form onSubmit={handleSendMessage} className="flex items-end gap-2 relative">
            <button type="button" className="p-2 text-slate-400 hover:text-rose-400"><Icon name="add-circle" className="w-6 h-6"/></button>
            <div className="flex-grow relative">
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Aa"
                    className="w-full bg-slate-600 text-slate-100 rounded-2xl py-2 pl-3 pr-10 focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
                />
                 <button type="button" onClick={() => setShowEmojiPicker(p => !p)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-rose-400">😊</button>
            </div>
            {newMessage.trim() ? (
              <button type="submit" className="p-2 text-rose-500 hover:text-rose-400"><Icon name="paper-airplane" className="w-6 h-6"/></button>
            ) : (
               <button type="button" className="p-2 text-slate-400 hover:text-rose-400"><Icon name="mic" className="w-6 h-6"/></button>
            )}

            {showEmojiPicker && (
                <div ref={emojiPickerRef} className="absolute bottom-full right-0 mb-2 bg-slate-900 border border-slate-700 p-2 rounded-lg grid grid-cols-4 gap-2">
                    {EMOJIS.map(emoji => <button key={emoji} onClick={() => handleEmojiSelect(emoji)} className="text-2xl p-1 rounded-md hover:bg-slate-700">{emoji}</button>)}
                </div>
            )}
        </form>
      </footer>
    </div>
  );
};
export default ChatWidget;