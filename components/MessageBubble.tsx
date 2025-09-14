import React, { useState, useMemo } from 'react';
import { Message, User } from '../types';
import Icon from './Icon';

interface MessageBubbleProps {
  message: Message;
  currentUser: User;
  peerUser: User;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
}

const EMOJIS = ['❤️', '😂', '👍', '😢', '😡', '🔥'];

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, currentUser, peerUser, onReply, onReact }) => {
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const isMe = message.senderId === currentUser.id;

  const reactionsSummary = useMemo(() => {
    if (!message.reactions || Object.keys(message.reactions).length === 0) {
      return null;
    }
    const reactionEntries = Object.entries(message.reactions).filter(([, userIds]) => userIds.length > 0);
    if (reactionEntries.length === 0) return null;
    
    const total = reactionEntries.reduce((sum, [, userIds]) => sum + userIds.length, 0);
    const topEmoji = reactionEntries.sort((a,b) => b[1].length - a[1].length)[0][0];
    
    return { topEmoji, total };
  }, [message.reactions]);

  const handleReact = (e: React.MouseEvent, emoji: string) => {
    e.stopPropagation();
    onReact(message.id, emoji);
    setShowEmojiPicker(false);
    setShowActions(false);
  };
  
  if (message.isDeleted) {
    return (
        <div className={`flex items-center gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
            <div className="px-3 py-2 rounded-xl text-sm italic text-slate-400 border border-slate-700">
                {isMe ? 'You unsent a message' : 'Message unsent'}
            </div>
        </div>
    );
  }

  return (
    <div 
        className={`flex items-end gap-2 group ${isMe ? 'justify-end' : 'justify-start'}`}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => { setShowActions(false); setShowEmojiPicker(false); }}
    >
        {!isMe && <img src={peerUser.avatarUrl} alt={peerUser.name} className="w-6 h-6 rounded-full self-end mb-1"/>}
        
        <div className={`flex items-center gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`max-w-[80%] rounded-xl relative ${isMe ? 'bg-rose-600 text-white rounded-br-none' : 'bg-slate-600 text-slate-100 rounded-bl-none'}`}>
                {message.replyTo && (
                    <div className="px-3 pt-2 opacity-80 border-b border-white/20">
                        <p className="text-xs font-semibold">Replying to {message.replyTo.senderName}</p>
                        <p className="text-xs line-clamp-1 italic">"{message.replyTo.content}"</p>
                    </div>
                )}
                <p className="text-sm break-words px-3 py-2">{message.text}</p>
                {reactionsSummary && (
                    <div className="absolute -bottom-3 right-2 bg-slate-700 rounded-full px-1.5 py-0.5 text-xs flex items-center gap-1 border border-slate-800">
                        <span>{reactionsSummary.topEmoji}</span>
                        <span>{reactionsSummary.total}</span>
                    </div>
                )}
            </div>

            <div className={`relative flex items-center transition-opacity duration-200 ${showActions ? 'opacity-100' : 'opacity-0'}`}>
                <button onClick={() => setShowEmojiPicker(p => !p)} className="p-1 rounded-full hover:bg-slate-700 text-slate-400">😊</button>
                <button onClick={() => onReply(message)} className="p-1 rounded-full hover:bg-slate-700 text-slate-400">↩️</button>
                {showEmojiPicker && (
                     <div className="absolute bottom-full mb-1 bg-slate-900 border border-slate-700 p-1 rounded-full flex items-center gap-0.5 shadow-lg">
                        {EMOJIS.map(emoji => <button key={emoji} onClick={(e) => handleReact(e, emoji)} className="text-xl p-1 rounded-full hover:bg-slate-700/50">{emoji}</button>)}
                    </div>
                )}
            </div>
        </div>

        {isMe && <div className="w-6 h-6 flex-shrink-0" />}
    </div>
  );
};

export default MessageBubble;