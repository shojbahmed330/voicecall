import React, { useState, useRef, useEffect } from 'react';
import { Message, User, ChatSettings } from '../types';
import Waveform from './Waveform';
import Icon from './Icon';

interface MessageBubbleProps {
  message: Message;
  currentUser: User;
  peerUser: User;
  chatSettings: Partial<ChatSettings>;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (message: Message) => void;
  onUnsend: (messageId: string) => void;
}

const EMOJI_REACTIONS = ['❤️', '😂', '😮', '😢', '👍'];

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, currentUser, peerUser, chatSettings, onReact, onReply, onUnsend }) => {
  const isMe = message.senderId === currentUser.id;
  const [isMenuOpen, setMenuOpen] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (bubbleRef.current && !bubbleRef.current.contains(event.target as Node)) {
            setMenuOpen(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const renderContent = () => {
    if (message.isDeleted) {
        return <p className="text-sm italic text-slate-400">Message unsent</p>;
    }
    switch (message.type) {
      case 'text':
        return <p className="whitespace-pre-wrap">{message.text}</p>;
      case 'image':
        return <img src={message.mediaUrl} alt="Sent" className="rounded-lg max-w-xs" />;
      case 'audio':
        return <div className="w-48 h-10"><Waveform isPlaying={false} /> <span className="text-xs">{message.duration}s</span></div>;
      default:
        return null;
    }
  };

  const myReaction = message.reactions ? Object.entries(message.reactions).find(([, userIds]) => userIds.includes(currentUser.id))?.[0] : null;

  return (
    <div className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
        <img src={isMe ? currentUser.avatarUrl : peerUser.avatarUrl} alt="avatar" className="w-7 h-7 rounded-full mb-1" />
        <div ref={bubbleRef} className="relative group">
            <div className={`px-3 py-2 rounded-xl max-w-xs ${isMe ? 'bg-rose-600 text-white rounded-br-none' : 'bg-slate-600 text-slate-100 rounded-bl-none'}`}>
                {message.replyTo && (
                    <div className="border-l-2 border-rose-200/50 pl-2 mb-1 opacity-80">
                        <p className="text-xs font-semibold">{message.replyTo.senderName}</p>
                        <p className="text-xs truncate">{message.replyTo.content}</p>
                    </div>
                )}
                {renderContent()}
            </div>
             {!message.isDeleted && (
                <div className={`absolute top-1/2 -translate-y-1/2 ${isMe ? 'left-0 -translate-x-full' : 'right-0 translate-x-full'} opacity-0 group-hover:opacity-100 transition-opacity flex items-center`}>
                    <button onClick={() => setMenuOpen(p => !p)} className="p-1 rounded-full text-slate-400 hover:bg-slate-700"><Icon name="ellipsis-vertical" className="w-4 h-4" /></button>
                </div>
             )}
             {isMenuOpen && (
                <div className={`absolute top-full mt-1 z-10 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-1 text-sm text-slate-200 ${isMe ? 'right-0' : 'left-0'}`}>
                    <div className="flex items-center gap-1 p-1">
                        {EMOJI_REACTIONS.map(emoji => (
                             <button key={emoji} onClick={() => { onReact(message.id, emoji); setMenuOpen(false); }} className={`p-1.5 rounded-full hover:bg-slate-700/50 ${myReaction === emoji ? 'bg-rose-500/20' : ''}`}>{emoji}</button>
                        ))}
                    </div>
                    <button onClick={() => { onReply(message); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 hover:bg-slate-700/50 rounded">Reply</button>
                    {isMe && <button onClick={() => { onUnsend(message.id); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 text-red-400 hover:bg-red-500/10 rounded">Unsend</button>}
                </div>
             )}
            {message.reactions && Object.keys(message.reactions).length > 0 && (
                <div className="absolute -bottom-2 right-1 bg-slate-700 rounded-full px-1.5 text-xs flex items-center gap-1 border border-slate-800">
                    {Object.entries(message.reactions).map(([emoji, userIds]) => userIds.length > 0 ? <span key={emoji}>{emoji}</span> : null)}
                </div>
            )}
        </div>
    </div>
  );
};

export default MessageBubble;
