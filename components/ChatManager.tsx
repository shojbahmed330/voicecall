import React, { useMemo } from 'react';
import { User } from '../types';
import ChatWidget from './ChatWidget';
import { firebaseService } from '../services/firebaseService';

interface ChatManagerProps {
  currentUser: User;
  activeChats: User[];
  friends: User[];
  minimizedChats: Set<string>;
  chatUnreadCounts: Record<string, number>;
  onCloseChat: (peerId: string) => void;
  onMinimizeToggle: (peerId: string) => void;
  onInitiateCall: (peer: User, type: 'audio' | 'video') => void;
  onSetVoiceCommandSuppression: (isSuppressed: boolean) => void;
}

const ChatManager: React.FC<ChatManagerProps> = ({
  currentUser,
  activeChats,
  friends,
  minimizedChats,
  chatUnreadCounts,
  onCloseChat,
  onMinimizeToggle,
  onInitiateCall,
  onSetVoiceCommandSuppression,
}) => {
  const friendsMap = useMemo(() => {
    const map = new Map<string, User>();
    friends.forEach(friend => map.set(friend.id, friend));
    return map;
  }, [friends]);

  const upToDateActiveChats = useMemo(() => {
    return activeChats.map(peer => {
      const freshFriendData = friendsMap.get(peer.id);
      return freshFriendData ? { ...peer, ...freshFriendData } : peer;
    });
  }, [activeChats, friendsMap]);


  const openChats = upToDateActiveChats.filter(c => !minimizedChats.has(c.id));
  const minimizedChatUsers = upToDateActiveChats.filter(c => minimizedChats.has(c.id));

  return (
    <div className="fixed bottom-0 right-0 z-50 flex items-end gap-4 pr-[312px] pointer-events-none">
      <div className="flex items-end gap-4 pointer-events-auto">
        {minimizedChatUsers.map(peer => (
          <ChatWidget
            key={peer.id}
            currentUser={currentUser}
            peerUser={peer}
            onClose={onCloseChat}
            onMinimize={onMinimizeToggle}
            onHeaderClick={onMinimizeToggle}
            isMinimized={true}
            unreadCount={chatUnreadCounts[firebaseService.getChatId(currentUser.id, peer.id)] || 0}
            onInitiateCall={onInitiateCall}
            onSetVoiceCommandSuppression={onSetVoiceCommandSuppression}
          />
        ))}
        {openChats.map(peer => (
          <ChatWidget
            key={peer.id}
            currentUser={currentUser}
            peerUser={peer}
            onClose={onCloseChat}
            onMinimize={onMinimizeToggle}
            onHeaderClick={onMinimizeToggle}
            isMinimized={false}
            unreadCount={0}
            onInitiateCall={onInitiateCall}
            onSetVoiceCommandSuppression={onSetVoiceCommandSuppression}
          />
        ))}
      </div>
    </div>
  );
};

export default ChatManager;
