import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Play, Mic, StopCircle, Volume2 } from "lucide-react";
import "./App.css";

function App() {
  const [transcript, setTranscript] = useState("");
  const [translated, setTranslated] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [lang, setLang] = useState("es");
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [ttsVoices, setTtsVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);


  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const keepAliveInterval = useRef(null);

  const languages = [
    { code: "es", name: "Spanish" },
    { code: "fr", name: "French" },
    { code: "de", name: "German" },
    { code: "en", name: "English" },
    { code: "it", name: "Italian" },
    { code: "pt", name: "Portuguese" },
    { code: "ja", name: "Japanese" },
    { code: "zh", name: "Chinese" },
  ];

  const connectWebSocket = () => {
    setConnectionStatus("connecting");
    const ws = new WebSocket(
      `ws://13.53.102.154:8000/ws/transcribe?lang=${lang}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setConnectionStatus("connected");
      setError("");
      startRecording();
      // Start keepalive pings
      keepAliveInterval.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({type: "ping"}));
        }
      }, 25000); // Every 25 seconds
    };


      
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          setError(data.error);
          if (isRecording) {
            stopRecording();
          }
        } else if (data.warning) {
          console.warn(data.warning);
        } else {
          // Always use the full transcript from the server
          if (data.original) {
            setTranscript(data.original);
          }
          
          if (data.translated) {
            setTranslated(data.translated);
          }
        }
      } catch (e) {
        console.error("Error parsing WebSocket message:", e);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setError("Connection error. Please try again.");
      setConnectionStatus("error");
      if (isRecording) {
        stopRecording();
      }
    };

    ws.onclose = (event) => {
      console.log(`WebSocket closed with code ${event.code}`);
      setConnectionStatus("disconnected");
      
      // Only attempt to reconnect if we're still supposed to be recording
      if (isRecording) {
        stopRecording();
        setError("Connection lost. Reconnecting...");
        setTimeout(connectWebSocket, 2000);
      }
    };
  };

  const startRecording = async () => {
    try {
      setError("");
      // Reset transcript and translation when starting a new recording
      setTranscript("");
      setTranslated("");
      setAudioUrl("");
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
        audioBitsPerSecond: 16000,
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN && e.data.size > 0) {
          wsRef.current.send(e.data);
        }
      };

      mediaRecorder.start(250); // Send data chunks every 250ms
      setIsRecording(true);
      console.log("Recording started");
    } catch (error) {
      console.error("Recording error:", error);
      setError("Microphone access denied. Please check permissions.");
      setConnectionStatus("error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    setIsRecording(false);
    console.log("Recording stopped");
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      connectWebSocket();
    }
  };


  // Add this function to speak the translated text
const speakText = () => {
  if (!ttsSupported || !translated) return;
  
  // Cancel any current speech
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(translated);
  
  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }
  
  utterance.lang = lang; // Set the language
  utterance.rate = 1.0; // Speaking rate
  utterance.pitch = 1.0; // Speaking pitch
  
  utterance.onstart = () => setIsSpeaking(true);
  utterance.onend = () => setIsSpeaking(false);
  utterance.onerror = (e) => {
    console.error("SpeechSynthesis error:", e);
    setIsSpeaking(false);
    setError("Speech synthesis failed. Try the audio download instead.");
  };
  
  window.speechSynthesis.speak(utterance);
};

// Add this function to stop speaking
const stopSpeaking = () => {
  window.speechSynthesis.cancel();
  setIsSpeaking(false);
};

  // Add this useEffect hook to check for TTS support and load voices
useEffect(() => {
  const checkTtsSupport = () => {
    if ('speechSynthesis' in window) {
      setTtsSupported(true);
      
      // Some browsers need this event to populate voices
      const voicesChanged = () => {
        const voices = window.speechSynthesis.getVoices();
        setTtsVoices(voices);
        
        // Try to find a voice matching the current language
        const defaultVoice = voices.find(v => v.lang.startsWith(lang)) || 
                            voices.find(v => v.lang.startsWith('en')) || 
                            voices[0];
        setSelectedVoice(defaultVoice);
      };
      
      window.speechSynthesis.onvoiceschanged = voicesChanged;
      voicesChanged(); // Call immediately in case voices are already loaded
    }
  };
  
  checkTtsSupport();
}, [lang]);


  return (
    <div className="body p-5">
      <div className="max-w-lg w-full mx-auto bg-white rounded-2xl shadow-2xl p-8 transform transition">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">
          Healthcare Translator
        </h1>

        {/* Status Indicators */}
        {/* <div className="flex justify-between items-center mb-6 text-sm font-medium">
          <div
            className={`px-3 py-1 rounded-full shadow-sm ${
              connectionStatus === "connected"
                ? "bg-green-200 text-green-800"
                : connectionStatus === "connecting"
                ? "bg-yellow-200 text-yellow-800"
                : "bg-red-200 text-red-800"
            }`}
          >
            {connectionStatus.toUpperCase()}
          </div>
          <div
            className={`px-3 py-1 rounded-full shadow-sm ${
              isRecording
                ? "bg-red-200 text-red-800"
                : "bg-gray-200 text-gray-800"
            }`}
          >
            {isRecording ? "RECORDING" : "READY"}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-400 text-red-700 rounded-lg shadow-sm">
            {error}
          </div>
        )} */}

        {/* Language Selection */}
        <div className="mb-6">
          <label htmlFor="language-select" className="block text-sm font-medium text-gray-700 mb-2">
            Translate to:
          </label>
          <select
            id="language-select"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="w-full p-3 border rounded-md focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
            disabled={isRecording}
            aria-label="Select target language for translation"
          >
            {languages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.name}
              </option>
            ))}
          </select>
        </div>

        {/* Record Button */}
        <div className="flex justify-center mb-6">
          <button
            onClick={toggleRecording}
            className={`flex items-center justify-center gap-2 py-3 px-6 rounded-full shadow-md font-medium transition-all ${
              isRecording
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-blue-500 hover:bg-blue-600 text-white"
            }`}
            aria-label={isRecording ? "Stop recording" : "Start recording"}
          >
            {isRecording ? (
              <StopCircle className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
            <span>{isRecording ? "Stop Recording" : "Start Recording"}</span>
          </button>
        </div>

        {/* Transcript Display */}
        <div className="space-y-4 mb-6">
          <div className="p-4 bg-gray-50 rounded-xl shadow-sm">
            <label htmlFor="original-transcript" className="text-sm font-medium text-gray-700 mb-2 block">
              Original (English)
            </label>
            <div 
              className="w-full p-3 min-h-24 rounded-lg border border-gray-300 text-gray-700 bg-white shadow-inner"
            >
              {transcript ? transcript : (isRecording ? "Listening..." : "Press Start Recording")}
            </div>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-xl shadow-sm">
            <label htmlFor="translated-text" className="text-sm font-medium text-gray-700 mb-2 block">
              Translated ({languages.find((l) => l.code === lang)?.name})
            </label>
            <div 
              className="w-full p-3 min-h-24 rounded-lg border border-gray-300 text-gray-700 bg-white shadow-inner"
            >
              {translated ? translated : (isRecording ? "Translating..." : "Translation will appear here")}
            </div>
          </div>
        </div>

        {/* Audio Controls */}
        <div className="space-y-2">
          {ttsSupported && ttsVoices.length > 0 && (
            <div className="mb-4">
              <label htmlFor="voice-select" className="block text-sm font-medium text-gray-700 mb-2">
                Voice:
              </label>
              <select
                id="voice-select"
                value={ttsVoices.findIndex(v => v.voiceURI === selectedVoice?.voiceURI)}
                onChange={(e) => setSelectedVoice(ttsVoices[e.target.value])}
                className="w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
                disabled={isSpeaking}
              >
                {ttsVoices.map((voice, index) => (
                  <option key={voice.voiceURI} value={index}>
                    {voice.name} ({voice.lang}) {voice.default && ' [Default]'}
                  </option>
                ))}
              </select>
            </div>
          )}

<div className="space-y-2">

  {/* Add new Speak button for instant TTS */}
            {ttsSupported ? (
              <button
                onClick={isSpeaking ? stopSpeaking : speakText}
                disabled={!translated.trim()}
                className={`w-full py-3 px-4 rounded-lg font-medium shadow-md flex items-center justify-center gap-2 transition ${
                  translated.trim()
                    ? isSpeaking
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : "bg-blue-500 hover:bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-500 cursor-not-allowed"
                }`}
                aria-label={isSpeaking ? "Stop speaking" : "Speak translation"}
              >
                {isSpeaking ? (
                  <StopCircle className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
                <span>{isSpeaking ? "Stop Speaking" : "Speak Now"}</span>
              </button>
            ) : (
              <div className="text-sm text-gray-500 text-center p-2">
                Text-to-speech not supported in your browser. Audio download available.
              </div>
            )}
            
            {/* Keep your existing Play button for downloaded audio */}
            {audioUrl && (
              <button
                onClick={playAudio}
                className={`w-full py-3 px-4 rounded-lg font-medium shadow-md flex items-center justify-center gap-2 transition ${
                  isPlaying 
                    ? "bg-blue-600 hover:bg-blue-700 text-white" 
                    : "bg-blue-500 hover:bg-blue-600 text-white"
                }`}
                aria-label="Play downloaded audio"
              >
                {isPlaying ? <Volume2 className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                {isPlaying ? "Playing..." : "Play Downloaded Audio"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;