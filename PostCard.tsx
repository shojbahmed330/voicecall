import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { Post, User, Comment, GroupRole } from './types';
import Icon from './components/Icon';
import Waveform from './components/Waveform';
import TaggedContent from './components/TaggedContent';
import GroupRoleBadge from './components/GroupRoleBadge';
import { REEL_TEXT_FONTS } from './constants';
import ReactionListModal from './components/ReactionListModal';

interface PostCardProps {
  post: Post;
  currentUser?: User;
  isActive: boolean;
  isPlaying: boolean;
  onPlayPause: () => void;
  onReact: (postId: string, emoji: string) => void;
  onViewPost: (postId: string) => void;
  onAuthorClick: (username: string) => void;
  onStartComment: (postId: string, commentToReplyTo?: Comment) => void;
  onSharePost?: (post: Post) => void;
  onAdClick?: (post: Post) => void;
  onDeletePost?: (postId: string) => void;
  onOpenPhotoViewer?: (post: Post) => void;
  groupRole?: GroupRole;
  isGroupAdmin?: boolean;
  isPinned?: boolean;
  onPinPost?: (postId: string) => void;
  onUnpinPost?: (postId: string) => void;
  onVote?: (postId: string, optionIndex: number) => void;
}

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'];
const REACTION_COLORS: { [key: string]: string } = {
    '👍': 'text-blue-500',
    '❤️': 'text-red-500',
    '😂': 'text-yellow-500',
    '😮': 'text-yellow-500',
    '😢': 'text-yellow-500',
    '😡': 'text-orange-500',
};

export const PostCard: React.FC<PostCardProps> = ({ post, currentUser, isActive, isPlaying, onPlayPause, onReact, onViewPost, onAuthorClick, onStartComment, onSharePost, onAdClick, onDeletePost, onOpenPhotoViewer, groupRole, isGroupAdmin, isPinned, onPinPost, onUnpinPost, onVote }) => {
  // FIX: Added a null-check for post and post.author to prevent crashes on malformed data.
  if (!post || !post.author) {
    return null;
  }
    
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isMenuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isPickerOpen, setPickerOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const pickerTimeout = useRef<number | null>(null);
  const [isReactionModalOpen, setIsReactionModalOpen] = useState(false);


  const myReaction = React.useMemo(() => {
    if (!currentUser || !post.reactions) return null;
    return post.reactions[currentUser.id] || null;
  }, [currentUser, post.reactions]);

  const topReactions = React.useMemo(() => {
    if (!post.reactions) return [];
    const emojiCounts: { [emoji: string]: number } = {};
    for (const userId in post.reactions) {
        const emoji = post.reactions[userId];
        emojiCounts[emoji] = (emojiCounts[emoji] || 0) + 1;
    }
    return Object.entries(emojiCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(entry => entry[0]);
  }, [post.reactions]);

  const reactionCount = useMemo(() => {
    if (!post.reactions) return 0;
    return Object.keys(post.reactions).length;
  }, [post.reactions]);

  const userVotedOptionIndex = currentUser && post.poll ? post.poll.options.findIndex(opt => opt.votedBy.includes(currentUser.id)) : -1;
  const totalVotes = post.poll ? post.poll.options.reduce((sum, opt) => sum + opt.votes, 0) : 0;
  const isAuthor = currentUser?.id === post.author.id;
  const canShowMenu = isAuthor || isGroupAdmin;


  const timeAgo = new Date(post.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });

  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement) {
      if (isActive && post.isSponsored) { // Only autoplay sponsored content
        videoElement.play().catch(error => console.log("Autoplay prevented:", error));
      } else {
        videoElement.pause();
      }
    }
  }, [isActive, post.isSponsored]);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (audioElement) {
        if (isPlaying && isActive) {
            audioElement.play().catch(e => console.error("Audio playback error:", e));
        } else {
            audioElement.pause();
        }
    }
  }, [isPlaying, isActive, post.audioUrl]);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
            setMenuOpen(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  const handleReaction = (e: React.MouseEvent, emoji: string) => {
      e.stopPropagation();
      onReact(post.id, emoji);
      setPickerOpen(false);
  }

  const handleDefaultReact = (e: React.MouseEvent) => {
    e.stopPropagation();
    onReact(post.id, myReaction === '👍' ? '👍' : '👍');
  };
  
  const handleMouseEnter = () => {
    if (pickerTimeout.current) clearTimeout(pickerTimeout.current);
    setPickerOpen(true);
  };

  const handleMouseLeave = () => {
    pickerTimeout.current = window.setTimeout(() => {
        setPickerOpen(false);
    }, 300);
  };
  
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    longPressTimer.current = window.setTimeout(() => {
        setPickerOpen(true);
    }, 500);
  };
  
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleView = () => {
      onViewPost(post.id);
  }

  const handleAuthor = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!post.isSponsored) {
        onAuthorClick(post.author.username);
      }
  }

  const handleAdClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (post.campaignId && onAdClick) {
        onAdClick(post);
    }
  };
  
  const getAdButtonText = () => {
    if (post.websiteUrl) return "Visit Site";
    if (post.allowDirectMessage) return "Send Message";
    return "Learn More";
  };

  const getPostTypeString = () => {
    if (post.isSponsored) return 'Sponsored';
    return timeAgo;
  }
  
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (window.confirm("Are you sure you want to permanently delete this post? This action cannot be undone.")) {
      onDeletePost?.(post.id);
    }
  }

  const handlePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPinned) {
      onUnpinPost?.(post.id);
    } else {
      onPinPost?.(post.id);
    }
    setMenuOpen(false);
  }

  const handleVote = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (userVotedOptionIndex === -1 && onVote) {
      onVote(post.id, index);
    }
  }
  
  const renderVisualMedia = () => {
    if (post.postType === 'profile_picture_change' && post.newPhotoUrl) {
        return (
             <div className="mb-4 flex justify-center">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenPhotoViewer?.(post);
                    }}
                    className='w-48 h-48 rounded-full overflow-hidden bg-slate-800'
                    aria-label="View image full screen"
                >
                     <img src={post.newPhotoUrl} alt="Updated profile" className="w-full h-full object-cover" />
                </button>
            </div>
        );
    }

    if (post.postType === 'cover_photo_change' && post.newPhotoUrl) {
        return (
             <div className="rounded-lg overflow-hidden aspect-video bg-slate-800 mb-4">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenPhotoViewer?.(post);
                    }}
                    className="w-full h-full block"
                    aria-label="View image full screen"
                >
                    <img src={post.newPhotoUrl} alt="Updated cover" className="w-full h-full object-cover" />
                </button>
            </div>
        );
    }

    if (post.videoUrl) {
      return (
        <div className="rounded-lg overflow-hidden aspect-video bg-black -mx-6 mb-4">
            <video
                ref={videoRef}
                src={post.videoUrl}
                muted={post.isSponsored}
                loop={post.isSponsored}
                playsInline
                controls={!post.isSponsored}
                className="w-full h-full object-contain"
            />
        </div>
      );
    }
    if (post.imageUrl) {
      return (
        <div className="rounded-lg overflow-hidden bg-black -mx-6 mb-4">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onOpenPhotoViewer?.(post);
                }}
                className="w-full h-auto block"
                aria-label="View image full screen"
            >
                <img src={post.imageUrl} alt={post.imagePrompt || 'Post image'} className="w-full h-auto object-contain" />
            </button>
        </div>
      );
    }

    return null;
  }
  
  const renderAudioPlayer = () => {
    if (post.audioUrl && post.audioUrl !== '#') {
      return (
        <div className="relative h-24 bg-slate-800 rounded-xl overflow-hidden group/waveform mb-4">
            <audio ref={audioRef} src={post.audioUrl} onEnded={onPlayPause} />
            <Waveform isPlaying={isPlaying && isActive} />
            <div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 group-hover/waveform:opacity-100 transition-opacity duration-300">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onPlayPause();
                }}
                className="w-16 h-16 rounded-full bg-lime-600/70 text-black flex items-center justify-center transform scale-75 group-hover/waveform:scale-100 transition-transform duration-300 ease-in-out hover:bg-lime-500"
                aria-label={isPlaying ? "Pause post" : "Play post"}
            >
                <Icon name={isPlaying && isActive ? 'pause' : 'play'} className="w-8 h-8" />
            </button>
            </div>
        </div>
      );
    }
    return null;
  }

  const renderPoll = () => {
    if (!post.poll) return null;

    return (
      <div className="space-y-2 mb-4">
        <p className="font-semibold text-lime-200 text-lg">{post.poll.question}</p>
        {post.poll.options.map((option, index) => {
          const percentage = totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0;
          const hasVotedThis = userVotedOptionIndex === index;
          return (
            <button
              key={index}
              onClick={(e) => handleVote(e, index)}
              disabled={userVotedOptionIndex !== -1}
              className={`w-full text-left p-2.5 rounded-md border transition-colors relative overflow-hidden ${
                hasVotedThis
                  ? 'bg-lime-900/50 border-lime-400'
                  : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
              } ${userVotedOptionIndex === -1 ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div
                className="absolute top-0 left-0 h-