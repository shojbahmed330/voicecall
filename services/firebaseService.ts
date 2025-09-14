import firebase from 'firebase/compat/app';
import { db, auth, storage } from './firebaseConfig';
import { 
    User, Post, Comment, FriendshipStatus, Campaign, Message, 
    Conversation, ChatSettings, LiveAudioRoom, LiveVideoRoom, Group, 
    Story, Event, GroupChat, JoinRequest, GroupCategory, StoryPrivacy, 
    PollOption, AdminUser, NLUResponse, CategorizedExploreFeed, Report, Lead,
    Author,
    VideoParticipantState,
    ReplyInfo
} from '../types';
import { DEFAULT_AVATARS, DEFAULT_COVER_PHOTOS, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from '../constants';

// This is a placeholder for a real slug generation library
const slugify = (text: string) => text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');


// Helper to extract a minimal Author object from a full User object
const getAuthorFromUser = (user: User): Author => ({
    id: user.id,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
    privacySettings: user.privacySettings
});

const uploadToCloudinary = async (file: File | Blob, resourceType: 'image' | 'video' | 'raw' = 'auto'): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
        });
        const data = await response.json();
        if (data.secure_url) {
            return data.secure_url;
        } else {
            throw new Error(data.error.message || 'Cloudinary upload failed');
        }
    } catch (error) {
        console.error('Error uploading to Cloudinary:', error);
        throw error;
    }
};


export const firebaseService = {
    // --- User Management ---
    async signUpWithEmail(email: string, password: string, fullName: string, username: string): Promise<boolean> {
        try {
            const isTaken = await this.isUsernameTaken(username);
            if (isTaken) {
                throw new Error("Username is already taken.");
            }
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            if (userCredential.user) {
                const newUser: User = {
                    id: userCredential.user.uid,
                    name: fullName,
                    username: username,
                    name_lowercase: fullName.toLowerCase(),
                    email: email,
                    password: password, // For mock verification only
                    avatarUrl: DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)],
                    coverPhotoUrl: DEFAULT_COVER_PHOTOS[Math.floor(Math.random() * DEFAULT_COVER_PHOTOS.length)],
                    bio: 'Hey there! I am using VoiceBook.',
                    createdAt: new Date().toISOString(),
                    friendIds: [],
                    privacySettings: {
                        postVisibility: 'public',
                        friendRequestPrivacy: 'everyone',
                        friendListVisibility: 'friends',
                    },
                    notificationSettings: {
                        likes: true,
                        comments: true,
                        friendRequests: true,
                        campaignUpdates: true,
                        groupPosts: true,
                    },
                    blockedUserIds: [],
                    voiceCoins: 100, // Welcome bonus
                    role: 'user',
                };
                await db.collection('users').doc(newUser.id).set(newUser);
                return true;
            }
            return false;
        } catch (error) {
            console.error("Error signing up:", error);
            return false;
        }
    },
    
    async signInWithEmail(identifier: string, password: string): Promise<void> {
        let email = identifier;
        if (!identifier.includes('@')) {
            const userQuery = await db.collection('users').where('username', '==', identifier).limit(1).get();
            if (userQuery.empty) {
                throw new Error("User not found.");
            }
            email = userQuery.docs[0].data().email;
        }
        await auth.signInWithEmailAndPassword(email, password);
    },

    async isUsernameTaken(username: string): Promise<boolean> {
        const query = await db.collection('users').where('username', '==', username).limit(1).get();
        return !query.empty;
    },

    onAuthStateChanged(callback: (user: { id: string, email: string | null } | null) => void): () => void {
        return auth.onAuthStateChanged(user => {
            if (user) {
                callback({ id: user.uid, email: user.email });
            } else {
                callback(null);
            }
        });
    },

    async signOutUser(userId: string | null): Promise<void> {
        if (userId) {
            await this.updateUserOnlineStatus(userId, 'offline');
        }
        await auth.signOut();
    },

    listenToCurrentUser(userId: string, callback: (user: User | null) => void): () => void {
        return db.collection('users').doc(userId).onSnapshot(doc => {
            callback(doc.exists ? doc.data() as User : null);
        });
    },
    
    async getUserProfile(username: string): Promise<User | null> {
        const query = await db.collection('users').where('username', '==', username).limit(1).get();
        if (query.empty) return null;
        return query.docs[0].data() as User;
    },
    
    async getUserProfileById(userId: string): Promise<User | null> {
        const doc = await db.collection('users').doc(userId).get();
        return doc.exists ? doc.data() as User : null;
    },
    
    async updateUserOnlineStatus(userId: string, status: 'online' | 'offline'): Promise<void> {
        const userRef = db.collection('users').doc(userId);
        const updateData: any = { onlineStatus: status };
        if (status === 'offline') {
            updateData.lastActiveTimestamp = new Date().toISOString();
        }
        await userRef.update(updateData);
    },

    async getFriends(userId: string): Promise<User[]> {
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data() as User;
        if (!userData || !userData.friendIds || userData.friendIds.length === 0) {
            return [];
        }
        return this.getUsersByIds(userData.friendIds);
    },

    // --- Posts ---
    listenToFeedPosts(userId: string, friendIds: string[], blockedUserIds: string[], callback: (posts: Post[]) => void): () => void {
        const userAndFriends = [userId, ...friendIds];
        
        let query = db.collection('posts')
            .where('status', '==', 'approved')
            .orderBy('createdAt', 'desc')
            .limit(50);

        return query.onSnapshot(snapshot => {
            const posts = snapshot.docs.map(doc => doc.data() as Post)
                .filter(post => {
                    if (!post || !post.author) return false;
                    if (blockedUserIds.includes(post.author.id)) return false;
                    
                    if (post.postType?.includes('change')) return true;
                    if (post.isSponsored) return true;
                    if (post.author.id === userId) return true;
                    if (post.author.privacySettings?.postVisibility === 'public') return true;
                    if (post.author.privacySettings?.postVisibility === 'friends' && userAndFriends.includes(post.author.id)) return true;
                    if (post.groupId && userAndFriends.includes(userId)) return true;

                    return false;
                });
            callback(posts);
        });
    },
    
    async getAllUsersForAdmin(): Promise<User[]> {
        const snapshot = await db.collection('users').get();
        return snapshot.docs.map(doc => doc.data() as User);
    },

    async getPostsByUser(userId: string): Promise<Post[]> {
        const snapshot = await db.collection('posts')
            .where('author.id', '==', userId)
            .where('status', '==', 'approved')
            .orderBy('createdAt', 'desc')
            .get();
        return snapshot.docs.map(doc => doc.data() as Post);
    },

    async createPost(postData: Partial<Post>, media: { mediaFile?: File | null, audioBlobUrl?: string | null, generatedImageBase64?: string | null }): Promise<void> {
        const postRef = db.collection('posts').doc();
        const user = await this.getUserProfileById(postData.author!.id);
        if (!user) throw new Error("Author not found");

        const fullPost: Post = {
            id: postRef.id,
            author: getAuthorFromUser(user),
            caption: postData.caption || '',
            captionStyle: postData.captionStyle,
            duration: postData.duration || 0,
            createdAt: new Date().toISOString(),
            commentCount: 0,
            comments: [],
            reactions: {},
            poll: postData.poll,
            status: postData.groupId ? 'pending' : 'approved',
            ...postData
        };

        if (media.mediaFile) {
            const resourceType = media.mediaFile.type.startsWith('video') ? 'video' : 'image';
            const mediaUrl = await uploadToCloudinary(media.mediaFile, resourceType);
            if (resourceType === 'video') {
                fullPost.videoUrl = mediaUrl;
            } else {
                fullPost.imageUrl = mediaUrl;
            }
        } else if (media.audioBlobUrl) {
            const audioBlob = await fetch(media.audioBlobUrl).then(r => r.blob());
            fullPost.audioUrl = await uploadToCloudinary(audioBlob, 'raw');
        } else if (media.generatedImageBase64) {
            fullPost.imageUrl = await uploadToCloudinary(media.generatedImageBase64, 'image');
        }

        await postRef.set(fullPost);
    },
    
    listenToPost(postId: string, callback: (post: Post | null) => void): () => void {
        const postUnsubscribe = db.collection('posts').doc(postId).onSnapshot(async doc => {
            if (!doc.exists) {
                callback(null);
                return;
            }
            const postData = doc.data() as Post;
            
            // Fetch comments
            const commentsSnapshot = await db.collection('posts').doc(postId).collection('comments').orderBy('createdAt', 'asc').get();
            postData.comments = commentsSnapshot.docs.map(commentDoc => commentDoc.data() as Comment);
            
            callback(postData);
        });
        
        return () => {
            postUnsubscribe();
        };
    },

    async createComment(user: User, postId: string, commentData: { text?: string, parentId?: string | null, imageFile?: File, audioBlob?: Blob, duration?: number }): Promise<Comment | null> {
        const postRef = db.collection('posts').doc(postId);
        const commentRef = postRef.collection('comments').doc();

        const newComment: Comment = {
            id: commentRef.id,
            postId: postId,
            author: getAuthorFromUser(user),
            createdAt: new Date().toISOString(),
            type: 'text', // default
            reactions: {},
            parentId: commentData.parentId || null,
        };

        if (commentData.text) {
            newComment.type = 'text';
            newComment.text = commentData.text;
        } else if (commentData.imageFile) {
            newComment.type = 'image';
            newComment.imageUrl = await uploadToCloudinary(commentData.imageFile, 'image');
        } else if (commentData.audioBlob) {
            newComment.type = 'audio';
            newComment.duration = commentData.duration;
            newComment.audioUrl = await uploadToCloudinary(commentData.audioBlob, 'raw');
        }

        await commentRef.set(newComment);
        await postRef.update({ commentCount: firebase.firestore.FieldValue.increment(1) });
        return newComment;
    },
    
    async reactToPost(postId: string, userId: string, emoji: string): Promise<boolean> {
        const postRef = db.collection('posts').doc(postId);
        const postDoc = await postRef.get();
        if (!postDoc.exists) return false;

        const post = postDoc.data() as Post;
        const currentReaction = post.reactions?.[userId];
        
        if (currentReaction === emoji) {
            await postRef.update({
                [`reactions.${userId}`]: firebase.firestore.FieldValue.delete()
            });
        } else {
            await postRef.update({
                [`reactions.${userId}`]: emoji
            });
        }
        return true;
    },
    
    async reactToComment(postId: string, commentId: string, userId: string, emoji: string): Promise<void> {
        const commentRef = db.collection('posts').doc(postId).collection('comments').doc(commentId);
         const commentDoc = await commentRef.get();
        if (!commentDoc.exists) return;

        const comment = commentDoc.data() as Comment;
        const currentReaction = comment.reactions?.[userId];

        if (currentReaction === emoji) {
            await commentRef.update({
                [`reactions.${userId}`]: firebase.firestore.FieldValue.delete()
            });
        } else {
            await commentRef.update({
                [`reactions.${userId}`]: emoji
            });
        }
    },
    
    async editComment(postId: string, commentId: string, newText: string): Promise<void> {
      const commentRef = db.collection('posts').doc(postId).collection('comments').doc(commentId);
      await commentRef.update({ text: newText, updatedAt: new Date().toISOString() });
    },

    async deleteComment(postId: string, commentId: string): Promise<void> {
      const commentRef = db.collection('posts').doc(postId).collection('comments').doc(commentId);
      await commentRef.update({ isDeleted: true, text: '', audioUrl: '', imageUrl: '' });
    },
    
    async getUsersByIds(userIds: string[]): Promise<User[]> {
        if (userIds.length === 0) return [];
        const snapshot = await db.collection('users').where(firebase.firestore.FieldPath.documentId(), 'in', userIds).get();
        return snapshot.docs.map(doc => doc.data() as User);
    },

    listenToFriendRequests(userId: string, callback: (users: User[]) => void): () => void {
        return db.collection('users').doc(userId).onSnapshot(async doc => {
            const userData = doc.data();
            const requestIds = userData?.friendRequestsReceived || [];
            if (requestIds.length > 0) {
                const requestUsers = await this.getUsersByIds(requestIds);
                callback(requestUsers);
            } else {
                callback([]);
            }
        });
    },

    async listenToConversations(userId: string, callback: (conversations: Conversation[]) => void): Promise<() => void> {
        const unsubscribe = db.collection('users').doc(userId).collection('chats').orderBy('lastMessage.createdAt', 'desc')
            .onSnapshot(async (snapshot) => {
                const convos: Conversation[] = [];
                for (const doc of snapshot.docs) {
                    const data = doc.data();
                    const peer = await this.getUserProfileById(doc.id);
                    if (peer && data.lastMessage) {
                        convos.push({
                            peer,
                            lastMessage: data.lastMessage,
                            unreadCount: data.unreadCount || 0
                        });
                    }
                }
                callback(convos);
            });
        return unsubscribe;
    },

    async ensureChatDocumentExists(user1: User, user2: User) {
        // Create chat doc for user1
        await db.collection('users').doc(user1.id).collection('chats').doc(user2.id).set({
            peerId: user2.id
        }, { merge: true });
        // Create chat doc for user2
        await db.collection('users').doc(user2.id).collection('chats').doc(user1.id).set({
            peerId: user1.id
        }, { merge: true });
    },
    
    getChatId(user1Id: string, user2Id: string): string {
        return [user1Id, user2Id].sort().join('_');
    },
    
     listenToMessages(chatId: string, callback: (messages: Message[]) => void): () => void {
        return db.collection('chats').doc(chatId).collection('messages').orderBy('createdAt', 'asc')
            .onSnapshot(snapshot => {
                const messages = snapshot.docs.map(doc => doc.data() as Message);
                callback(messages);
            });
    },
    
    async sendMessage(chatId: string, sender: User, recipient: User, messageContent: Partial<Message> & { audioBlob?: Blob, mediaFile?: File }): Promise<void> {
        const messageRef = db.collection('chats').doc(chatId).collection('messages').doc();

        const newMessage: Message = {
            id: messageRef.id,
            senderId: sender.id,
            recipientId: recipient.id,
            type: messageContent.type || 'text',
            createdAt: new Date().toISOString(),
            read: false,
            ...messageContent
        };
        
        if (messageContent.audioBlob) {
            newMessage.audioUrl = await uploadToCloudinary(messageContent.audioBlob, 'raw');
            newMessage.type = 'audio';
        }

        if (messageContent.mediaFile) {
            const resourceType = messageContent.mediaFile.type.startsWith('video') ? 'video' : 'image';
            newMessage.mediaUrl = await uploadToCloudinary(messageContent.mediaFile, resourceType);
            newMessage.type = resourceType;
        }

        await messageRef.set(newMessage);

        // Update last message for both users' conversation lists
        const updateLastMessage = { lastMessage: newMessage, unreadCount: firebase.firestore.FieldValue.increment(1) };
        await db.collection('users').doc(sender.id).collection('chats').doc(recipient.id).set({ lastMessage: newMessage }, { merge: true });
        await db.collection('users').doc(recipient.id).collection('chats').doc(sender.id).set(updateLastMessage, { merge: true });
    },

    // All other functions...
    async updateProfile(userId: string, updates: Partial<User>): Promise<void> {
        await db.collection('users').doc(userId).update(updates);
    },
    
     async updateProfilePicture(userId: string, base64: string, caption?: string, captionStyle?: Post['captionStyle']): Promise<{ updatedUser: User; newPost: Post } | null> {
        const avatarUrl = await uploadToCloudinary(base64, 'image');
        await db.collection('users').doc(userId).update({ avatarUrl });
        
        const user = await this.getUserProfileById(userId);
        if (!user) return null;

        const post: Post = {
            id: db.collection('posts').doc().id,
            author: getAuthorFromUser(user),
            caption: caption || `${user.name} updated their profile picture.`,
            captionStyle,
            createdAt: new Date().toISOString(),
            postType: 'profile_picture_change',
            newPhotoUrl: avatarUrl,
            duration: 0,
            commentCount: 0,
            comments: [],
            reactions: {},
            status: 'approved',
        };
        await db.collection('posts').doc(post.id).set(post);

        return { updatedUser: user, newPost: post };
    },

    async updateCoverPhoto(userId: string, base64: string, caption?: string, captionStyle?: Post['captionStyle']): Promise<{ updatedUser: User; newPost: Post } | null> {
        const coverPhotoUrl = await uploadToCloudinary(base64, 'image');
        await db.collection('users').doc(userId).update({ coverPhotoUrl });

        const user = await this.getUserProfileById(userId);
        if (!user) return null;

        const post: Post = {
            id: db.collection('posts').doc().id,
            author: getAuthorFromUser(user),
            caption: caption || `${user.name} updated their cover photo.`,
            captionStyle,
            createdAt: new Date().toISOString(),
            postType: 'cover_photo_change',
            newPhotoUrl: coverPhotoUrl,
            duration: 0,
            commentCount: 0,
            comments: [],
            reactions: {},
            status: 'approved'
        };
        await db.collection('posts').doc(post.id).set(post);

        return { updatedUser: user, newPost: post };
    },
    
    // Stubs for brevity
    async listenToReelsPosts(callback: (posts: Post[]) => void): Promise<() => void> {
      const query = db.collection('posts').where('videoUrl', '!=', null).orderBy('videoUrl').orderBy('createdAt', 'desc').limit(20);
      return query.onSnapshot(snapshot => {
          callback(snapshot.docs.map(doc => doc.data() as Post));
      });
    },
    async getInjectableAd(user: User): Promise<Post | null> { return null; },
    async getInjectableStoryAd(user: User): Promise<Story | null> { return null; },
    async listenToNotifications(userId: string, callback: (notifications: any[]) => void): Promise<() => void> { return () => {}; },
    async markNotificationsAsRead(userId: string, notificationIds: string[]): Promise<void> {},
    async submitLead(lead: Partial<Lead>): Promise<void> {},
    async trackAdClick(campaignId: string): Promise<void> {},
    async trackAdView(campaignId: string): Promise<void> {},
    async updateVoiceCoins(userId: string, amount: number): Promise<boolean> { return true; },
    async blockUser(currentUserId: string, targetUserId: string): Promise<boolean> { return true; },
    async unblockUser(currentUserId: string, targetUserId: string): Promise<boolean> { return true; },
    async deactivateAccount(userId: string): Promise<boolean> { return true; },
    async checkFriendshipStatus(currentUserId: string, profileUserId: string): Promise<FriendshipStatus> { return FriendshipStatus.NOT_FRIENDS; },
    async acceptFriendRequest(currentUserId: string, requestingUserId: string): Promise<void> {},
    async declineFriendRequest(currentUserId: string, requestingUserId: string): Promise<void> {},
    async addFriend(currentUserId: string, targetUserId: string): Promise<{ success: boolean; reason?: string }> { return { success: true }; },
    async unfriendUser(currentUserId: string, targetUserId: string): Promise<boolean> { return true; },
    async cancelFriendRequest(currentUserId: string, targetUserId: string): Promise<boolean> { return true; },
    async getCommonFriends(userId1: string, userId2: string): Promise<User[]> { return []; },
    async getStories(userId: string): Promise<any[]> { return []; },
    async createStory(storyData: any, mediaFile: File | null): Promise<Story | null> { return null; },
    async markStoryAsViewed(storyId: string, userId: string): Promise<void> {},
    async searchUsers(query: string): Promise<User[]> { return []; },
};
