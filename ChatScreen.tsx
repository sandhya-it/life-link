import React, { useState, useRef, useEffect } from 'react';
import { 
  HeartPulse, Send, Mic, RefreshCw, AlertCircle, 
  HelpCircle, Volume2, Globe, ShieldAlert 
} from 'lucide-react';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface ChatScreenProps {
  appLanguage: 'en' | 'ta' | 'hi';
  setAppLanguage: (lang: 'en' | 'ta' | 'hi') => void;
}

export default function ChatScreen({ appLanguage, setAppLanguage }: ChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-msg',
      sender: 'assistant',
      text: appLanguage === 'ta' 
        ? 'வணக்கம்! நான் உங்கள் லைஃப்லிங்க் AI முதலுதவி உதவியாளர். தயவுசெய்து காயங்கள் அல்லது அவசரநிலைகள் பற்றிய உங்கள் கேள்விகளைக் கேளுங்கள். (எ.கா: இரத்தப்போக்கு, தீக்காயம்)'
        : appLanguage === 'hi'
        ? 'नमस्ते! मैं आपका लाइफलिंक एआई प्राथमिक चिकित्सा सहायक हूं। कृपया अपनी समस्या बताएं ताकि मैं आपको मार्गदर्शन प्रदान कर सकूं।'
        : 'Hello! I am your LifeLink AI First-Aid Assistant. Ask me any first-aid query (e.g., how to treat a burn, bleeding control) to receive calm, step-by-step guidance.',
      timestamp: new Date()
    }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceToast, setVoiceToast] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle message sending & streaming response from Express server
  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    const userMessage: Message = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date()
    };

    const botMessagePlaceholder: Message = {
      id: `bot-${Date.now()}`,
      sender: 'assistant',
      text: '...',
      timestamp: new Date(),
      isStreaming: true
    };

    setMessages(prev => [...prev, userMessage, botMessagePlaceholder]);
    setUserInput('');
    setIsSending(true);

    try {
      const response = await fetch('/ai/first-aid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: textToSend,
          language: appLanguage
        })
      });

      if (!response.ok) {
        throw new Error('Server responded with an error');
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let accumulatedText = '';

      // Set empty first to clear the placeholder "..."
      setMessages(prev => {
        const copy = [...prev];
        const lastIndex = copy.length - 1;
        if (copy[lastIndex] && copy[lastIndex].sender === 'assistant') {
          copy[lastIndex] = { ...copy[lastIndex], text: '' };
        }
        return copy;
      });

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: !done });
          accumulatedText += chunk;

          setMessages(prev => {
            const copy = [...prev];
            const lastIndex = copy.length - 1;
            if (copy[lastIndex] && copy[lastIndex].sender === 'assistant') {
              copy[lastIndex] = { 
                ...copy[lastIndex], 
                text: accumulatedText 
              };
            }
            return copy;
          });
        }
      }

      // Finish streaming state
      setMessages(prev => {
        const copy = [...prev];
        const lastIndex = copy.length - 1;
        if (copy[lastIndex] && copy[lastIndex].sender === 'assistant') {
          copy[lastIndex] = { 
            ...copy[lastIndex], 
            isStreaming: false 
          };
        }
        return copy;
      });

    } catch (err: any) {
      console.error('Chat error:', err);
      // Fallback display
      setMessages(prev => {
        const copy = [...prev];
        const lastIndex = copy.length - 1;
        if (copy[lastIndex] && copy[lastIndex].sender === 'assistant') {
          copy[lastIndex] = { 
            ...copy[lastIndex], 
            text: appLanguage === 'ta'
              ? 'மன்னிக்கவும், பதிலைப் பெற முடியவில்லை. தயவுசெய்து மீண்டும் முயற்சிக்கவும்.'
              : appLanguage === 'hi'
              ? 'क्षमा करें, प्रतिक्रिया प्राप्त करने में त्रुटि हुई। कृपया पुनः प्रयास करें।'
              : 'Error connecting to the AI Assistant. Please check your network and try again.',
            isStreaming: false 
          };
        }
        return copy;
      });
    } finally {
      setIsSending(false);
    }
  };

  // Simulated Voice Input trigger to test CPR, burns, bleeding guides instantly
  const handleMicClick = () => {
    if (isListening || isSending) return;

    setIsListening(true);
    setVoiceToast("Listening to voice query...");

    const demoQueries = {
      en: [
        "What is the first aid for bleeding?",
        "How do you treat a severe skin burn?",
        "Help me, someone is choking"
      ],
      ta: [
        "இரத்தப்போக்குக்கு முதலுதவி என்ன?",
        "தீக்காயங்களுக்கு எப்படி சிகிச்சை அளிப்பது?",
        "மூச்சுத்திணறலுக்கு என்ன செய்ய வேண்டும்?"
      ],
      hi: [
        "खून बहने पर क्या करें?",
        "जलने पर प्राथमिक उपचार क्या है?",
        "सांस रुकने पर कैसे मदद करें?"
      ]
    };

    const queries = demoQueries[appLanguage] || demoQueries.en;
    const randomQuery = queries[Math.floor(Math.random() * queries.length)];

    setTimeout(() => {
      setVoiceToast(`Speech Recognized: "${randomQuery}"`);
      setUserInput(randomQuery);
      setIsListening(false);

      setTimeout(() => {
        setVoiceToast(null);
        handleSendMessage(randomQuery);
      }, 1500);

    }, 2000);
  };

  return (
    <div id="chat-view-wrapper" className="flex flex-col flex-1 h-full max-w-md mx-auto bg-gray-50 relative pb-20 font-sans">
      
      {/* Dynamic Languages Selector in Chat view Header */}
      <div className="p-4 bg-white border-b border-gray-150/80 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-gray-900" />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">AI LANGUAGE MODE</span>
        </div>
        
        <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200/50">
          {(['en', 'ta', 'hi'] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setAppLanguage(lang)}
              className={`text-[9px] font-bold px-2.5 py-1.5 rounded-md transition uppercase tracking-wider cursor-pointer ${
                appLanguage === lang ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-955'
              }`}
            >
              {lang === 'ta' ? 'தமிழ்' : lang === 'hi' ? 'हिंदी' : 'English'}
            </button>
          ))}
        </div>
      </div>

      {/* Non-alarming, persistent disclaimer banner */}
      <div className="bg-amber-50/60 border-b border-amber-150/40 px-4 py-2.5 flex gap-2.5 items-center font-sans">
        <ShieldAlert size={15} className="text-amber-700 shrink-0" />
        <p className="text-[10px] font-bold text-amber-900 leading-snug">
          Life-Threatening Emergency? Avoid searching — tap the Red SOS on your Home screen immediately.
        </p>
      </div>

      {/* Messages Bubbles list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed font-sans shadow-sm ${
                msg.sender === 'user'
                  ? 'bg-gray-900 text-white rounded-br-none'
                  : 'bg-white text-gray-850 border border-gray-150/70 rounded-bl-none'
              }`}
            >
              {/* If empty/streaming */}
              {msg.text === '...' && msg.isStreaming ? (
                <div className="flex items-center gap-1.5 py-1 px-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce"></span>
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0.2s]"></span>
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0.4s]"></span>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{msg.text}</div>
              )}
            </div>
            
            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mt-1.5 px-1 font-sans">
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}

        {/* Typing indicator placeholder */}
        {isSending && messages[messages.length - 1]?.sender === 'user' && (
          <div className="flex flex-col items-start">
            <div className="bg-white text-gray-800 border border-gray-150/70 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm font-sans">
              <div className="flex items-center gap-2">
                <RefreshCw className="animate-spin text-teal-600" size={12} />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">FORMULATING RESPONSE...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Microphone Voice Simulation Feedback Panel */}
      {voiceToast && (
        <div className="absolute bottom-22 left-4 right-4 bg-gray-900 text-white p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 border border-gray-800 shadow-lg animate-bounce z-50 font-sans">
          <Volume2 size={15} className="animate-pulse text-teal-400 shrink-0" />
          <span className="truncate">{voiceToast}</span>
        </div>
      )}

      {/* Input Tray */}
      <div className="p-4 bg-white border-t border-gray-150/85 shadow-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage(userInput);
          }}
          className="flex items-center gap-2"
        >
          {/* Simulated Mic Button */}
          <button
            type="button"
            onClick={handleMicClick}
            disabled={isListening || isSending}
            className={`p-3 rounded-xl transition shrink-0 cursor-pointer border ${
              isListening 
                ? 'bg-red-50 text-red-650 border-red-200 animate-pulse' 
                : 'bg-gray-50 hover:bg-gray-100 text-gray-500 border-gray-200/80'
            }`}
          >
            <Mic size={16} />
          </button>

          <input
            type="text"
            placeholder={
              appLanguage === 'ta' 
                ? 'வழிகாட்டுதலைப் பெற இங்கே கேளுங்கள்...' 
                : appLanguage === 'hi'
                ? 'मदद के लिए यहाँ पूछें...'
                : "Ask for first-aid instruction..."
            }
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            disabled={isSending}
            className="w-full text-xs px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-gray-300 bg-gray-50 focus:bg-white transition font-sans"
          />

          <button
            type="submit"
            disabled={!userInput.trim() || isSending}
            className="p-3 bg-gray-900 hover:bg-gray-850 text-white rounded-xl transition shrink-0 disabled:opacity-30 cursor-pointer"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
