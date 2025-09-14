import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Post } from '../types';
import { REEL_TEXT_FONTS } from '../constants';
import Icon from './Icon';

interface ImageCropperProps {
  imageUrl: string;
  aspectRatio: number;
  onSave: (base64: string, caption?: string, captionStyle?: Post['captionStyle']) => void;
  onCancel: () => void;
  isUploading: boolean;
}

const EMOJIS = ['😂', '❤️', '👍', '😢', '😡', '🔥', '😊', '😮'];

const ImageCropper: React.FC<ImageCropperProps> = ({ imageUrl, aspectRatio, onSave, onCancel, isUploading }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [caption, setCaption] = useState('Updated my photo!');
  const [captionStyle, setCaptionStyle] = useState<Post['captionStyle']>({
      fontFamily: 'Sans',
      fontWeight: 'normal',
      fontStyle: 'normal',
  });

  // Load the image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      setImage(img);
      setPan({ x: 0, y: 0 });
      // Calculate the minimum zoom to fill the crop area
      const canvas = canvasRef.current;
      if (!canvas) return;

      let cropWidth, cropHeight;
      if (canvas.width / canvas.height > aspectRatio) {
          cropHeight = canvas.height * 0.9;
          cropWidth = cropHeight * aspectRatio;
      } else {
          cropWidth = canvas.width * 0.9;
          cropHeight = cropWidth / aspectRatio;
      }
      
      const scaleX = cropWidth / img.width;
      const scaleY = cropHeight / img.height;
      const initialZoom = Math.max(scaleX, scaleY);
      setZoom(initialZoom);
      setMinZoom(initialZoom);
    };
  }, [imageUrl, aspectRatio]);

  const getRenderParameters = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return null;

    const { width: canvasWidth, height: canvasHeight } = canvas;

    let cropWidth, cropHeight;
    if (canvasWidth / canvasHeight > aspectRatio) {
        cropHeight = canvasHeight * 0.9;
        cropWidth = cropHeight * aspectRatio;
    } else {
        cropWidth = canvasWidth * 0.9;
        cropHeight = cropWidth / aspectRatio;
    }
    const cropX = (canvasWidth - cropWidth) / 2;
    const cropY = (canvasHeight - cropHeight) / 2;
    
    const imgWidth = image.width * zoom;
    const imgHeight = image.height * zoom;

    const centerX = (canvasWidth - imgWidth) / 2;
    const centerY = (canvasHeight - imgHeight) / 2;
    
    return {
        canvas, ctx: canvas.getContext('2d'),
        canvasWidth, canvasHeight,
        cropWidth, cropHeight, cropX, cropY,
        imgWidth, imgHeight, centerX, centerY,
    };
  }, [image, aspectRatio, zoom]);

  const getClampedPan = useCallback((newPan: {x: number, y: number}) => {
    const params = getRenderParameters();
    if (!params) return newPan;
    const { cropX, cropY, cropWidth, cropHeight, imgWidth, imgHeight, centerX, centerY } = params;

    const minPanX = (cropX + cropWidth) - imgWidth - centerX;
    const maxPanX = cropX - centerX;
    const minPanY = (cropY + cropHeight) - imgHeight - centerY;
    const maxPanY = cropY - centerY;
    
    return {
        x: Math.max(minPanX, Math.min(newPan.x, maxPanX)),
        y: Math.max(minPanY, Math.min(newPan.y, maxPanY)),
    };
  }, [getRenderParameters]);
  
  // Re-clamp pan whenever zoom changes
  useEffect(() => {
    setPan(currentPan => getClampedPan(currentPan));
  }, [zoom, getClampedPan]);

  // Main drawing function
  const drawCanvas = useCallback(() => {
    const params = getRenderParameters();
    if (!params || !params.ctx || !image) return;
    const { ctx, canvasWidth, canvasHeight, cropX, cropY, cropWidth, cropHeight, centerX, centerY, imgWidth, imgHeight } = params;

    const imageX = centerX + pan.x;
    const imageY = centerY + pan.y;

    // Fill background
    ctx.fillStyle = '#1e293b'; // slate-800
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw the image
    ctx.drawImage(image, imageX, imageY, imgWidth, imgHeight);

    // Draw the overlay (dimming effect outside the crop area)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvasWidth, cropY); // Top
    ctx.fillRect(0, cropY + cropHeight, canvasWidth, canvasHeight - (cropY + cropHeight)); // Bottom
    ctx.fillRect(0, cropY, cropX, cropHeight); // Left
    ctx.fillRect(cropX + cropWidth, cropY, canvasWidth - (cropX + cropWidth), cropHeight); // Right

    // Draw crop box border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cropX, cropY, cropWidth, cropHeight);
  }, [getRenderParameters, image, pan]);
  
  // Re-draw canvas whenever something changes
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas, pan]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setPan(prevPan => getClampedPan({ x: prevPan.x + dx, y: prevPan.y + dy }));
    setDragStart({ x: e.clientX, y: e.clientY });
  };
  
  const handleWheel = (e: React.WheelEvent) => {
      e.preventDefault();
      const zoomFactor = 1 - e.deltaY * 0.001;
      setZoom(prevZoom => Math.max(minZoom, Math.min(prevZoom * zoomFactor, minZoom * 5)));
  }

  const handleSave = () => {
    const params = getRenderParameters();
    if (!params || !image) return;

    const outputCanvas = document.createElement('canvas');
    const outputQuality = 800; // Define a fixed output width for quality
    outputCanvas.width = outputQuality;
    outputCanvas.height = outputQuality / aspectRatio;
    const outCtx = outputCanvas.getContext('2d');
    if (!outCtx) return;

    const { cropX, cropY, cropWidth, cropHeight, centerX, centerY } = params;
    const imageX = centerX + pan.x;
    const imageY = centerY + pan.y;

    const sx = (cropX - imageX) / zoom;
    const sy = (cropY - imageY) / zoom;
    const sWidth = cropWidth / zoom;
    const sHeight = cropHeight / zoom;

    outCtx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, outputCanvas.width, outputCanvas.height);
    
    const base64 = outputCanvas.toDataURL('image/jpeg', 0.9);
    onSave(base64, caption, captionStyle);
  };

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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in-fast" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      <div className="w-full max-w-lg bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-6 relative">
        <h2 className="text-2xl font-bold text-slate-100 mb-4">Crop Your Image</h2>
        <p className="text-slate-400 mb-4">Drag to move, scroll to zoom.</p>

        <div className="bg-slate-900 rounded-lg w-full cursor-move overflow-hidden" style={{ aspectRatio: `${aspectRatio}` }}>
            <canvas
                ref={canvasRef}
                width={800}
                height={800 / aspectRatio}
                className="w-full h-full"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onWheel={handleWheel}
            />
        </div>

        <div className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 mt-4">
          <div className="flex gap-2 items-center border-b border-slate-700 pb-2 mb-2">
              <button onClick={cycleFont} className="p-2 bg-slate-800 rounded-md font-semibold text-sm text-white">{captionStyle.fontFamily}</button>
              <button onClick={toggleBold} className={`p-2 rounded-md font-bold ${captionStyle.fontWeight === 'bold' ? 'bg-lime-500 text-black' : 'bg-slate-800 text-white'}`}>B</button>
              <button onClick={toggleItalic} className={`p-2 rounded-md italic ${captionStyle.fontStyle === 'italic' ? 'bg-lime-500 text-black' : 'bg-slate-800 text-white'}`}>I</button>
              <div className="flex-grow" />
              <div className="flex gap-1">
                  {EMOJIS.map(emoji => (
                      <button key={emoji} onClick={() => setCaption(t => t + emoji)} className="text-xl p-1 rounded-md hover:bg-slate-700 transition-transform hover:scale-110">
                          {emoji}
                      </button>
                  ))}
              </div>
          </div>
          <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Add a caption... (optional)"
              className={`w-full bg-transparent text-slate-100 rounded-lg p-1 focus:outline-none resize-none ${fontClass} ${fontWeightClass} ${fontStyleClass}`}
              rows={2}
          />
        </div>
       
        <div className="mt-6 flex justify-end gap-3">
            <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-white font-semibold">Cancel</button>
            <button onClick={handleSave} disabled={isUploading} className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold disabled:bg-slate-500 min-w-[100px]">
                {isUploading ? 'Saving...' : 'Save & Post'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default ImageCropper;