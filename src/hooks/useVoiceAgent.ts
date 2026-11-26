import { useCallback, useEffect, useRef, useState } from 'react';

interface UseVoiceAgentOptions {
  defaultSpeak?: boolean;
  defaultAutoRun?: boolean;
}

export function useVoiceAgent(options: UseVoiceAgentOptions = {}) {
  const [speechSupported, setSpeechSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const [ttsEnabled, setTtsEnabledState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('editdesk_voice_tts');
      return saved === null ? (options.defaultSpeak ?? true) : saved === 'true';
    } catch {
      return options.defaultSpeak ?? true;
    }
  });

  const [handsFree, setHandsFreeState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('editdesk_voice_handsfree');
      return saved === null ? (options.defaultAutoRun ?? true) : saved === 'true';
    } catch {
      return options.defaultAutoRun ?? true;
    }
  });

  const recognitionRef = useRef<any>(null);
  const latestFinalRef = useRef('');
  const latestInterimRef = useRef('');
  const onResultCallbackRef = useRef<((transcript: string) => void) | null>(null);
  const abortedRef = useRef(false);

  useEffect(() => {
    const win = window as any;
    const Rec = win.SpeechRecognition || win.webkitSpeechRecognition;
    setSpeechSupported(Boolean(Rec));
    setTtsSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
  }, []);

  const setTtsEnabled = useCallback((val: boolean) => {
    setTtsEnabledState(val);
    try {
      localStorage.setItem('editdesk_voice_tts', String(val));
    } catch {
      // ignore storage quota
    }
    if (!val && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  const setHandsFree = useCallback((val: boolean) => {
    setHandsFreeState(val);
    try {
      localStorage.setItem('editdesk_voice_handsfree', String(val));
    } catch {
      // ignore storage quota
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    (rawText: string, force = false) => {
      if ((!ttsEnabled && !force) || typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return;
      }
      const clean = String(rawText || '')
        .replace(/\*\*/g, '')
        .replace(/₹([\d,]+(?:\.\d+)?)/g, '$1 rupees')
        .replace(/\n+/g, '. ')
        .trim();
      if (!clean) return;

      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(clean);
        utter.lang = 'en-IN';
        utter.rate = 1.04;
        utter.pitch = 1.0;

        const voices = window.speechSynthesis.getVoices();
        const preferred =
          voices.find((v) => /en-IN/i.test(v.lang)) ||
          voices.find((v) => /en-(GB|US)/i.test(v.lang));
        if (preferred) utter.voice = preferred;

        utter.onstart = () => setIsSpeaking(true);
        utter.onend = () => setIsSpeaking(false);
        utter.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utter);
      } catch {
        setIsSpeaking(false);
      }
    },
    [ttsEnabled]
  );

  const stopListening = useCallback((cancelOnly = false) => {
    abortedRef.current = cancelOnly;
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore stop errors
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(
    (onFinalTranscript: (transcript: string) => void) => {
      const win = window as any;
      const Rec = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (!Rec) {
        setVoiceError('Voice microphone is not supported in this browser. Type a command instead.');
        return false;
      }

      stopSpeaking();
      setVoiceError(null);
      latestFinalRef.current = '';
      latestInterimRef.current = '';
      abortedRef.current = false;
      onResultCallbackRef.current = onFinalTranscript;
      setInterimTranscript('');

      try {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.abort();
          } catch {
            // ignore
          }
        }
        const rec = new Rec();
        recognitionRef.current = rec;
        rec.lang = 'en-IN';
        rec.interimResults = true;
        rec.continuous = false;
        rec.maxAlternatives = 1;

        rec.onstart = () => {
          setIsListening(true);
        };

        rec.onresult = (event: any) => {
          let finalPart = '';
          let interimPart = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            const piece = res[0]?.transcript || '';
            if (res.isFinal) {
              finalPart += piece;
            } else {
              interimPart += piece;
            }
          }
          if (finalPart) {
            latestFinalRef.current = `${latestFinalRef.current} ${finalPart}`.trim();
          }
          latestInterimRef.current = interimPart.trim();
          const display = `${latestFinalRef.current} ${latestInterimRef.current}`.trim();
          setInterimTranscript(display);
        };

        rec.onerror = (event: any) => {
          const code = event?.error || 'unknown';
          if (code === 'not-allowed' || code === 'service-not-allowed') {
            setVoiceError('Microphone access denied. Allow mic permission in browser settings.');
          } else if (code === 'no-speech') {
            setVoiceError('No speech detected. Tap the mic and speak clearly.');
          } else if (code !== 'aborted') {
            setVoiceError(`Voice input error (${code})`);
          }
          setIsListening(false);
        };

        rec.onend = () => {
          setIsListening(false);
          const text = (latestFinalRef.current || latestInterimRef.current).trim();
          setInterimTranscript('');
          if (!abortedRef.current && text && onResultCallbackRef.current) {
            const cb = onResultCallbackRef.current;
            onResultCallbackRef.current = null;
            cb(text);
          }
        };

        rec.start();
        return true;
      } catch (err: any) {
        setVoiceError(err?.message || 'Could not start microphone.');
        setIsListening(false);
        return false;
      }
    },
    [stopSpeaking]
  );

  const toggleListening = useCallback(
    (onFinalTranscript: (transcript: string) => void) => {
      if (isListening) {
        stopListening(false);
      } else {
        startListening(onFinalTranscript);
      }
    },
    [isListening, startListening, stopListening]
  );

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return {
    speechSupported,
    ttsSupported,
    isListening,
    isSpeaking,
    interimTranscript,
    voiceError,
    ttsEnabled,
    setTtsEnabled,
    handsFree,
    setHandsFree,
    startListening,
    stopListening,
    toggleListening,
    speak,
    stopSpeaking,
  };
}
