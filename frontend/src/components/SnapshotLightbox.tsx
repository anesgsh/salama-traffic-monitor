import React from 'react';
import { X, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  url: string | null;
  onClose: () => void;
}

export const SnapshotLightbox: React.FC<Props> = ({ url, onClose }) => {
  const handleDownload = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url; a.download = url.split('/').pop() || 'snapshot.jpg';
    a.target = '_blank'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <AnimatePresence>
      {url && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={onClose}>
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
            <button className="bg-white/10 hover:bg-white/20 rounded-full p-2 text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); handleDownload(); }}>
              <Download className="w-5 h-5" />
            </button>
            <button className="bg-white/10 hover:bg-white/20 rounded-full p-2 text-white transition-colors"
              onClick={onClose}>
              <X className="w-5 h-5" />
            </button>
          </div>
          <motion.img initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.15 }}
            src={url} alt="Violation snapshot"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
