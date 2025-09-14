
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RecordingState, User, Post, PollOption, AppView } from '../types';
import { IMAGE_GENERATION_COST, getTtsPrompt, REEL_TEXT_FONTS } from '../constants';
import Waveform from './Waveform';
import Icon from './Icon';
import { geminiService } from '../services/geminiService';
import { firebaseService } from '../services/firebaseService';
import { useSettings } from '../contexts/SettingsContext';

interface CreatePostScreenProps {
  user: User;
  onPostCreated: (newPost: Post | null) => void;
  onSetTtsMessage: (message: string) => void;
  lastCommand: string | null;
  onDeductCoinsForImage: () => Promise<boolean>;
  onCommandProcessed: () => void;
  onGoBack: () => void;
  groupId?: string;
  groupName?: string;
  startRecording?: boolean;
  selectMedia?: 'image' | 'video';
}

const EMOJIS = ['😂', '❤️', '👍', '😢', '😡', '🔥', '😊', '😮'];

const CreatePostScreen: React.FC<CreatePostScreenProps> = ({ user, onPostCreated, onSetTtsMessage, lastCommand, onDeductCoinsForImage, onCommandProcessed, onGoBack, groupId, groupName, startRecording, selectMedia }) => {
  const [recordingState, setRecordingState] = useState<RecordingState>(RecordingState.IDLE);
  const [duration, setDuration] = useState(0);
  const [caption, setCaption] = useState('');
  const [captionStyle, setCaptionStyle] = useState<Post['captionStyle']>({
      fontFamily: 'Sans',
      fontWeight: 'normal',
      fontStyle: 'normal',
  });
  
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [isPosting, setIsPosting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { language } = useSettings();

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    setDuration(0);
    timerRef.current = setInterval(() => {
      setDuration(d => d + 1);
    }, 1000);
  }, [stopTimer]);
  
  const clearVisualMedia = () => {
    setGeneratedImageUrl(null);
    setImagePrompt('');
    setMediaFile(null);
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    setMediaPreviewUrl(null);
    setMediaType(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setShowPollCreator(false);
  };

  const clearAudio = () => {
    stopTimer();
    mediaRecorderRef.current?.stream?.getTracks().forEach(track => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setRecordingState(RecordingState.IDLE);
    setDuration(0);
  };

  const handleFileSelectClick = (type: 'image' | 'video') => {
    clearVisualMedia();
    if (fileInputRef.current) {
        fileInputRef.current.accept = type === 'image' ? 'image/*' : 'video/*';
        fileInputRef.current.click();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
        clearVisualMedia(); // A new file replaces any existing visual media
        setMediaFile(file);
        setMediaType(file.type.startsWith('video') ? 'video' : 'image');
        setMediaPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleStartRecording = useCallback(async () => {
    if (recordingState === RecordingState.RECORDING) return;
    clearAudio(); // Clear any previous recording to start fresh
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (event) => {
            audioChunksRef.current.push(event.data);
        };

        recorder.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const newAudioUrl = URL.createObjectURL(audioBlob);
            setAudioUrl(newAudioUrl);
            stream.getTracks().forEach(track => track.stop());
            onSetTtsMessage(getTtsPrompt('record_stopped', language, { duration }));
        };
        
        recorder.start();
        setRecordingState(RecordingState.RECORDING);
        onSetTtsMessage(getTtsPrompt('record_start', language));
        startTimer();

    } catch (err: any) {
        console.error("Mic permission error:", err);
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            onSetTtsMessage(getTtsPrompt('error_mic_not_found', language));
        } else {
            onSetTtsMessage(getTtsPrompt('error_mic_permission', language));
        }
    }
  }, [onSetTtsMessage, startTimer, duration, recordingState, language]);

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        stopTimer();
        setRecordingState(RecordingState.PREVIEW);
    }
  }, [stopTimer]);

 useEffect(() => {
    if (startRecording) {
      handleStartRecording();
    } else if (selectMedia) {
      handleFileSelectClick(selectMedia);
    } else {
      onSetTtsMessage(getTtsPrompt('create_post_prompt', language, { cost: IMAGE_GENERATION_COST }));
    }
    return () => {
      stopTimer();
      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      mediaRecorderRef.current?.stream?.getTracks().forEach(track => track.stop());
    };
  }, [startRecording, selectMedia, onSetTtsMessage, stopTimer, handleStartRecording, language]);
  
  const handleGenerateImage = useCallback(async () => {
    if (!imagePrompt.trim() || isGeneratingImage) return;

    if ((user.voiceCoins || 0) < IMAGE_GENERATION_COST) {
        onSetTtsMessage(getTtsPrompt('image_generation_insufficient_coins', language, { cost: IMAGE_GENERATION_COST, balance: user.voiceCoins || 0 }));
        return;
    }

    const paymentSuccess = await onDeductCoinsForImage();
    if (!paymentSuccess) {
        return;
    }
    
    clearVisualMedia();
    setIsGeneratingImage(true);
    onSetTtsMessage("Generating your masterpiece...");
    const imageUrl = await geminiService.generateImageForPost(imagePrompt);
    setIsGeneratingImage(false);
    
    if(imageUrl) {
        setGeneratedImageUrl(imageUrl);
        onSetTtsMessage(`Image generated! You can now add a caption.`);
    } else {
        onSetTtsMessage(`Sorry, I couldn't generate an image for that prompt. Please try another one.`);
    }
  }, [imagePrompt, isGeneratingImage, onSetTtsMessage, user.voiceCoins, onDeductCoinsForImage, language]);

  const handlePost = useCallback(async () => {
    const hasPoll = showPollCreator && pollQuestion.trim() && pollOptions.every(opt => opt.trim());
    const hasVisualMedia = mediaFile || generatedImageUrl;
    const hasAudio = recordingState === RecordingState.PREVIEW && audioUrl;
    const hasContent = caption.trim() || hasAudio || hasVisualMedia || hasPoll;

    if (isPosting || !hasContent) {
        onSetTtsMessage("Please add some content before posting.");
        return;
    };
    
    setIsPosting(true);
    setRecordingState(RecordingState.UPLOADING);
    onSetTtsMessage("Publishing your post...");

    try {
        const postBaseData: any = {
            author: user,
            duration: hasAudio ? duration : 0,
            caption: caption,
            captionStyle: captionStyle,
            status: groupId ? 'pending' : 'approved',
        };
        
        if (generatedImageUrl) {
            postBaseData.imagePrompt = imagePrompt;
        }
        if (groupId) {
            postBaseData.groupId = groupId;
        }
        if (groupName) {
            postBaseData.groupName = groupName;
        }
        if (hasPoll) {
            postBaseData.poll = {
                question: pollQuestion,
                options: pollOptions.filter(opt => opt.trim()).map(opt => ({ text: opt, votes: 0, votedBy: [] }))
            };
        }
        
        await firebaseService.createPost(
            postBaseData, 
            {
                mediaFile: mediaFile,
                audioBlobUrl: audioUrl,
                generatedImageBase64: generatedImageUrl
            }
        );

        if (postBaseData.status === 'pending') {
            onSetTtsMessage(getTtsPrompt('post_pending_approval', language));
            setTimeout(() => onGoBack(), 1500); 
        } else {
            onPostCreated(null);
        }
    } catch (error: any) {
        console.error("Failed to create post:", error);
        onSetTtsMessage(`Failed to create post: ${error.message}`);
        setIsPosting(false);
        setRecordingState(RecordingState.IDLE);
    }
  }, [isPosting, caption, captionStyle, duration, user, onSetTtsMessage, onPostCreated, onGoBack, generatedImageUrl, imagePrompt, groupId, groupName, showPollCreator, pollQuestion, pollOptions, mediaFile, audioUrl, recordingState, language]);
  
  const handlePollOptionChange = (index: number, value: string) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };
  
  const addPollOption = () => {
    if (pollOptions.length < 5) {
      setPollOptions([...pollOptions, '']);
    }
  };

  const removePollOption = (index: number) => {
    if (pollOptions.length > 2) {
      const newOptions = [...pollOptions];
      newOptions.splice(index, 1);
      setPollOptions(newOptions);
    }
  };

  useEffect(() => {
    if (!lastCommand) return;
    
    const processCommand = async () => {
        try {
            const intentResponse = await geminiService.processIntent(lastCommand);
            
            switch(intentResponse.intent) {
                case 'intent_go_back':
                    onGoBack();
                    break;
                case 'intent_create_post': 
                    handleStartRecording();
                    break;
                case 'intent_stop_recording':
                    if (recordingState === RecordingState.RECORDING) handleStopRecording();
                    break;
                case 'intent_re_record':
                     if (recordingState === RecordingState.PREVIEW) {
                         setDuration(0);
                         handleStartRecording();
                     }
                     break;
                case 'intent_post_confirm':
                    handlePost();
                    break;
                case 'intent_generate_image':
                    if (intentResponse.slots?.prompt) {
                        const promptText = intentResponse.slots.prompt as string;
                        setImagePrompt(promptText);
                        setTimeout(() => handleGenerateImage(), 100);
                    }
                    break;
                case 'intent_clear_image':
                    clearVisualMedia();
                    onSetTtsMessage('Image cleared.');
                    break;
                case 'intent_create_poll':
                    clearVisualMedia();
                    clearAudio();
                    setShowPollCreator(true);
                    onSetTtsMessage("Poll creator opened. Please type the question and options.");
                    break;
            }
        } catch (error) {
            console.error("Error processing command in CreatePostScreen:", error);
        } finally {
            onCommandProcessed();
        }
    };
    
    processCommand();
  }, [lastCommand, recordingState, handleStartRecording, handleStopRecording, handlePost, handleGenerateImage, onCommandProcessed, onGoBack, onSetTtsMessage]);

  const canAffordImage = (user.voiceCoins || 0) >= IMAGE_GENERATION_COST;
  const hasContent = caption.trim() || audioUrl || mediaFile || generatedImageUrl || (showPollCreator && pollQuestion.trim());
  
  const cycleFont = () => {
    const currentIndex = REEL_TEXT_FONTS.findIndex(f => f.name === captionStyle.fontFamily);
    const nextIndex = (currentIndex + 1) % REEL_TEXT_FONTS.length;
    setCaptionStyle(s => ({ ...s, fontFamily: REEL_TEXT_FONTS[nextIndex].name }));
  };
  const toggleBold = () => setCaptionStyle(s => ({ ...s, fontWeight: s.fontWeight === 'bold' ? 'normal' : 'bold' }));
  const toggleItalic = () => setCaptionStyle(s => ({ ...s, fontStyle: s.fontStyle === 'italic' ? 'normal' : 'italic' }));

  const font = REEL_TEXT_FONTS.find(f => f.name === captionStyle.fontFamily);
  const fontClass = font ? font.class : 'font-sans';
  const fontWeightClass = captionStyle.fontWeight === 'bold' ? 'font-bold' : '';
  const fontStyleClass = captionStyle.fontStyle === 'italic' ? 'italic' : '';


  return (
    <div className="flex flex-col items-center justify-center h-full text-center text-slate-100 p-4 sm:p-8">
      <div className="w-full max-w-lg bg-slate-800 rounded-2xl p-6 flex flex-col gap-4">
        <h2 className="text-3xl font-bold">Create Post</h2>
        {groupName && (
            <div className="text-sm text-center bg-slate-700/50 p-2 rounded-md text-slate-300">
                Posting in <span className="font-bold text-rose-400">{groupName}</span>
            </div>
        )}
        
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

        <div className="flex items-start gap-4">
             <img src={user.avatarUrl} alt={user.name} className="w-12 h-12 rounded-full" />
             <div className="flex-grow bg-slate-700/50 rounded-lg">
                <div className="flex gap-2 items-center border-b border-slate-700 p-2">
                    <button onClick={cycleFont} className="p-2 bg-slate-800 rounded-md font-semibold text-xs text-white">{captionStyle.fontFamily}</button>
                    <button onClick={toggleBold} className={`p-2 w-8 h-8 rounded-md font-bold text-xs ${captionStyle.fontWeight === 'bold' ? 'bg-lime-500 text-black' : 'bg-slate-800 text-white'}`}>B</button>
                    <button onClick={toggleItalic} className={`p-2 w-8 h-8 rounded-md italic text-xs ${captionStyle.fontStyle === 'italic' ? 'bg-lime-500 text-black' : 'bg-slate-800 text-white'}`}>I</button>
                    <div className="flex-grow" />
                    <div className="flex gap-1">
                        {EMOJIS.map(emoji => (
                            <button key={emoji} onClick={() => setCaption(t => t + emoji)} className="text-xl p-1 rounded-md hover:bg-slate-700/50 transition-transform hover:scale-110">
                                {emoji}
                            </button>
                        ))}
                    </div>
                </div>
                <textarea
                    value={caption}
                    onChange={e => setCaption(e.target.value)}
                    placeholder={`What's on your mind, ${user.name.split(' ')[0]}?`}
                    className={`w-full bg-transparent text-slate-100 rounded-b-lg p-3 focus:outline-none resize-none min-h-[80px] text-lg ${fontClass} ${fontWeightClass} ${fontStyleClass}`}
                    rows={3}
                />
             </div>
        </div>
        
        {/* --- PREVIEW AREA --- */}
        <div className="space-y-4">
            {/* Visual Media Preview */}
            {(mediaPreviewUrl || generatedImageUrl) && (
                 <div className="relative group/media">
                    <div className="aspect-video bg-black rounded-lg flex items-center justify-center">
                        {mediaType === 'video' ? (
                            <video src={mediaPreviewUrl!} controls className="max-h-full max-w-full rounded-lg" />
                        ) : (
                            <img src={mediaPreviewUrl || generatedImageUrl} alt="Preview" className="max-h-full max-w-full object-contain rounded-lg" />
                        )}
                    </div>
                    <button onClick={clearVisualMedia} className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white opacity-50 group-hover/media:opacity-100 transition-opacity" aria-label="Clear media">
                        <Icon name="close" className="w-5 h-5"/>
                    </button>
                </div>
            )}

            {/* Audio Preview */}
            {(recordingState !== RecordingState.IDLE || audioUrl) && (
                <div className="relative group/audio p-4 bg-slate-700/50 rounded-lg">
                    {recordingState === RecordingState.RECORDING ? (
                        <div className="w-full flex flex-col items-center gap-2">
                            <div className="w-full h-16"><Waveform isPlaying={true} isRecording={true} /></div>
                            <p className="text-lg font-mono text-slate-300">00:{duration.toString().padStart(2, '0')}</p>
                            <button onClick={handleStopRecording} className="mt-2 p-3 rounded-full bg-rose-600 hover:bg-rose-500 text-white"><Icon name="pause" className="w-6 h-6" /></button>
                        </div>
                    ) : audioUrl ? (
                         <div className="w-full flex flex-col items-center gap-3">
                            <p className="font-semibold text-slate-200">Voice Note ({duration}s)</p>
                            <audio src={audioUrl} controls className="w-full" />
                         </div>
                    ) : null}
                     <button onClick={clearAudio} className="absolute top-2 right-2 p-1.5 bg-black/40 hover:bg-black/70 rounded-full text-white opacity-50 group-hover/audio:opacity-100 transition-opacity" aria-label="Clear audio">
                        <Icon name="close" className="w-4 h-4"/>
                    </button>
                </div>
            )}
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex justify-around items-center border-y border-slate-700 py-2">
            <button onClick={handleStartRecording} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700/50 transition-colors">
                <Icon name="mic" className={`w-6 h-6 transition-colors ${audioUrl || recordingState !== RecordingState.IDLE ? 'text-rose-400' : 'text-slate-400'}`}/> <span className="font-semibold text-slate-300">Voice</span>
            </button>
             <button onClick={() => handleFileSelectClick('image')} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700/50 transition-colors">
                <Icon name="photo" className={`w-6 h-6 transition-colors ${mediaType === 'image' ? 'text-green-400' : 'text-slate-400'}`}/> <span className="font-semibold text-slate-300">Photo</span>
            </button>
             <button onClick={() => handleFileSelectClick('video')} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700/50 transition-colors">
                <Icon name="video-camera" className={`w-6 h-6 transition-colors ${mediaType === 'video' ? 'text-sky-400' : 'text-slate-400'}`}/> <span className="font-semibold text-slate-300">Video</span>
            </button>
            <button onClick={() => { clearVisualMedia(); clearAudio(); setShowPollCreator(s => !s); }} className={`flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700/50 transition-colors ${showPollCreator ? 'bg-rose-500/20' : ''}`}>
                 <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transition-colors ${showPollCreator ? 'text-emerald-400' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                 <span className="font-semibold text-slate-300">Poll</span>
            </button>
        </div>
        
        <button 
          onClick={handlePost} 
          disabled={isPosting || !hasContent}
          className="w-full bg-rose-600 hover:bg-rose-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors text-lg"
        >
            {isPosting ? 'Publishing...' : 'Post'}
        </button>
      </div>
    </div>
  );
};

export default CreatePostScreen;
