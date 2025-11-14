import { useState, useEffect, useRef } from 'react';

interface UseTypewriterOptions {
  text: string;
  speed?: number;
  enabled?: boolean;
  onComplete?: () => void;
}

export function useTypewriter({
  text,
  speed = 30,
  enabled = true,
  onComplete
}: UseTypewriterOptions) {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const indexRef = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Reset quand le texte change
    if (!enabled) {
      setDisplayedText(text);
      setIsTyping(false);
      return;
    }

    if (text && text !== displayedText) {
      indexRef.current = 0;
      setDisplayedText('');
      setIsTyping(true);
    }
  }, [text, enabled]);

  useEffect(() => {
    if (!enabled || !isTyping || !text) return;

    if (indexRef.current < text.length) {
      timeoutRef.current = setTimeout(() => {
        setDisplayedText(text.slice(0, indexRef.current + 1));
        indexRef.current++;
      }, speed);
    } else {
      setIsTyping(false);
      if (onComplete) onComplete();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [text, isTyping, displayedText, speed, enabled, onComplete]);

  const skipToEnd = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setDisplayedText(text);
    setIsTyping(false);
    if (onComplete) onComplete();
  };

  return {
    displayedText,
    isTyping,
    skipToEnd,
  };
}
