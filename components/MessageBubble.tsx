import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Message, User, ChatSettings, ReplyInfo } from '../types';
import Waveform from './Waveform';
import Icon from './Icon';
import { CHAT_THEMES } from '../constants';

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

const AudioPlayer: React.FC<{ src: string, duration: number, isMe: boolean }> = ({ src, duration, isMe }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const audioRef = useRef<HTMLAudioElement>(null);

    const togglePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        const audio = audioRef.current;
        if (!audio) return;
        if (isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
        setIsPlaying(!isPlaying);
    };

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const handleTimeUpdate = () => {
            setProgress((audio.currentTime / audio.duration) * 100);
        };
        const handleEnded = () => {
            setIsPlaying(false);
            setProgress(0);
        };
        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('ended', handleEnded);
        return () => {
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('ended', handleEnded);
        };
    }, []);

    return (
        <div className="flex items-center gap-2 w-48">
            <audio ref={audioRef} src={src} preload="metadata" />
            <button onClick={togglePlay} className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Icon name={isPlaying ? 'pause' : 'play'} className="w-4 h-4" />
            </button>
            <div className="flex-grow h-1 bg-white/20 rounded-full">
                <div className="h-1 bg-white rounded-full" style={{ width: `${progress}%` }}></div>
            </div>
            <span className="text-xs font-mono">{duration}s</span>
        </div>
    );
};


const MessageBubble: React.FC<MessageBubbleProps> = ({ message, currentUser, peerUser, chatSettings, onReact, onReply, onUnsend }) => {
  const isMe = message.senderId === currentUser.id;
  const [isMenuOpen, setMenuOpen] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const theme = CHAT_THEMES[chatSettings.theme || 'default'];

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
        return <p className={`text-sm italic ${theme.text}/70`}>Message unsent</p>;
    }
    switch (message.type) {
      case 'text':
        return <p className={`whitespace-pre-wrap ${theme.text}`}>{message.text}</p>;
      case 'image':
        return <img src={message.mediaUrl} alt="Sent" className="rounded-lg max-w-xs" />;
      case 'video':
        return <video src={message.mediaUrl} controls className="rounded-lg max-w-xs" />;
      case 'audio':
        return <AudioPlayer src={message.audioUrl || ''} duration={message.duration || 0} isMe={isMe} />;
      default:
        return null;
    }
  };

  const myReaction = message.reactions ? Object.entries(message.reactions).find(([, userIds]) => userIds.includes(currentUser.id))?.[0] : null;

  return (
    <div className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
        {!isMe && <img src={peerUser.avatarUrl} alt="avatar" className="w-7 h-7 rounded-full mb-1" />}
        <div ref={bubbleRef} className="relative group">
            <div className={`px-3 py-2 rounded-xl max-w-xs ${isMe ? `${theme.myBubble} rounded-br-none` : `${theme.theirBubble} rounded-bl-none`}`}>
                {message.replyTo && (
                    <div className="border-l-2 border-white/30 pl-2 mb-1 opacity-80">
                        <p className={`text-xs font-semibold ${theme.text}`}>{message.replyTo.senderName}</p>
                        <p className={`text-xs truncate ${theme.text}/80`}>{message.replyTo.content}</p>
                    </div>
                )}
                {renderContent()}
            </div>
             {!message.isDeleted && (
                <div className={`absolute top-1/2 -translate-y-1/2 ${isMe ? 'left-0 -translate-x-full' : 'right-0 translate-x-full'} opacity-0 group-hover:opacity-100 transition-opacity flex items-center`}>
                    <button onClick={() => setMenuOpen(p => !p)} className="p-1 rounded-full text-slate-400 hover:bg-black/20"><Icon name="ellipsis-vertical" className="w-4 h-4" /></button>
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
