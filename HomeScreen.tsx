import React, { useState, useEffect, useRef } from 'react';
import { getSupabase, mockDB, startAmbulanceSimulation, stopAmbulanceSimulation, realtimeEvents } from '../lib/supabase';
import { UserRole, SosEvent, AmbulanceLocation, SosStatus } from '../types';
import { 
  HeartPulse, User, Navigation, MapPin, Activity, 
  PhoneCall, BellRing, Ambulance, ChevronRight, 
  ShieldAlert, Clock, AlertOctagon, RefreshCw, CheckCircle2, X, Compass
} from 'lucide-react';

interface HomeScreenProps {
  userId: string;
  fullName: string;
  isSupabaseLive: boolean;
  onNavigateToTab: (tab: string) => void;
  activeEvent: SosEvent | null;
  setActiveEvent: (event: SosEvent | null) => void;
  appLanguage: 'en' | 'ta' | 'hi';
}

export default function HomeScreen({ 
  userId, 
  fullName, 
  isSupabaseLive, 
  onNavigateToTab,
  activeEvent,
  setActiveEvent,
  appLanguage
}: HomeScreenProps) {
  const [sosState, setSosState] = useState<'idle' | 'pressing' | 'triggered'>('idle');
  const [pressProgress, setPressProgress] = useState(0);
  const [eta, setEta] = useState('12 mins');
  const [ambulanceLoc, setAmbulanceLoc] = useState<AmbulanceLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Localization strings
  const locDict = {
    en: {
      alertSent: "Emergency Alert Sent",
      pressHold: "Tap and hold for 2 seconds to send an emergency alert",
      reassurance: "Response team has been notified. Stay calm.",
      cancel: "Cancel Emergency Alert",
      etaBanner: "Ambulance en route",
      status1: "Alert Sent",
      status2: "Hospital Notified",
      status3: "Ambulance Dispatched",
      status4: "Arrived",
      patientLoc: "Patient Location",
      ambulanceLoc: "Ambulance",
      gpsCoords: "Capturing GPS Coordinates...",
      connecting: "Establishing LifeLink Connection...",
      secondsRemaining: "Hold to send alert..."
    },
    ta: {
      alertSent: "அவசரகால எச்சரிக்கை அனுப்பப்பட்டது",
      pressHold: "அவசரகால எச்சரிக்கை அனுப்ப 2 விநாடிகள் அழுத்திப் பிடிக்கவும்",
      reassurance: "பதில் குழுவிற்கு தகவல் தெரிவிக்கப்பட்டுள்ளது. அமைதியாக இருங்கள்.",
      cancel: "எச்சரிக்கையை ரத்துசெய்",
      etaBanner: "ஆம்புலன்ஸ் விரைந்து வருகிறது",
      status1: "எச்சரிக்கை அனுப்பப்பட்டது",
      status2: "மருத்துவமனைக்கு தெரிவிக்கப்பட்டது",
      status3: "ஆம்புலன்ஸ் கிளம்பியது",
      status4: "வந்து சேர்ந்தது",
      patientLoc: "நோயாளி இருப்பிடம்",
      ambulanceLoc: "ஆம்புலன்ஸ்",
      gpsCoords: "ஜிபிஎஸ் இருப்பிடத்தை பெறுகிறது...",
      connecting: "லைஃப்லிங்க் இணைப்பை நிறுவுகிறது...",
      secondsRemaining: "அழுத்திப் பிடிக்கவும்..."
    },
    hi: {
      alertSent: "आपातकालीन अलर्ट भेजा गया",
      pressHold: "आपातकालीन अलर्ट भेजने के लिए 2 सेकंड दबाकर रखें",
      reassurance: "प्रतिक्रिया टीम को सूचित कर दिया गया है। शांत रहें।",
      cancel: "अलर्ट रद्द करें",
      etaBanner: "एम्बुलेंस आ रही है",
      status1: "अलर्ट भेजा गया",
      status2: "अस्पताल को सूचित किया",
      status3: "एम्बुलेंस रवाना",
      status4: "आगमन",
      patientLoc: "मरीज का स्थान",
      ambulanceLoc: "एम्बुलेंस",
      gpsCoords: "जीपीएस निर्देशांक कैप्चर हो रहे हैं...",
      connecting: "लाइफलिंक कनेक्शन स्थापित हो रहा है...",
      secondsRemaining: "दबाकर रखें..."
    }
  };

  const strings = locDict[appLanguage] || locDict.en;

  // Track ambulance real-time updates when an active SOS event is present
  useEffect(() => {
    if (!activeEvent) {
      setSosState('idle');
      setAmbulanceLoc(null);
      return;
    }

    setSosState('triggered');

    if (isSupabaseLive) {
      const supabase = getSupabase();
      if (supabase) {
        // Subscribe to real-time updates for active SOS event status changes
        const eventChannel = supabase
          .channel(`sos_event_${activeEvent.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'sos_events', filter: `id=eq.${activeEvent.id}` },
            (payload) => {
              console.log('SOS Event updated live:', payload.new);
              setActiveEvent(payload.new as SosEvent);
            }
          )
          .subscribe();

        // Subscribe to real-time updates for ambulance_locations
        const ambulanceChannel = supabase
          .channel(`ambulance_${activeEvent.id}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'ambulance_locations', filter: `sos_event_id=eq.${activeEvent.id}` },
            (payload) => {
              console.log('Ambulance Location updated live:', payload.new);
              setAmbulanceLoc(payload.new as AmbulanceLocation);
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(eventChannel);
          supabase.removeChannel(ambulanceChannel);
        };
      }
    } else {
      // Offline/Sandbox real-time simulation using custom emitters
      const unsubscribeSos = realtimeEvents.on('sos_events_change', (updatedEvents: SosEvent[]) => {
        const match = updatedEvents.find(e => e.id === activeEvent.id);
        if (match) {
          setActiveEvent(match);
        }
      });

      const unsubscribeAmbulance = realtimeEvents.on('ambulance_change', (locs: AmbulanceLocation[]) => {
        const match = locs.find(l => l.sos_event_id === activeEvent.id);
        if (match) {
          setAmbulanceLoc(match);
        }
      });

      // Start the simulation of moving ambulance toward patient
      startAmbulanceSimulation(activeEvent.id, activeEvent.latitude, activeEvent.longitude);

      return () => {
        unsubscribeSos();
        unsubscribeAmbulance();
        stopAmbulanceSimulation(activeEvent.id);
      };
    }
  }, [activeEvent, isSupabaseLive]);

  // Handle dynamic ETA text based on status and distance simulation
  useEffect(() => {
    if (!activeEvent) return;
    
    if (activeEvent.status === 'pending') {
      setEta('Calculating...');
    } else if (activeEvent.status === 'dispatched') {
      setEta('7 mins');
    } else if (activeEvent.status === 'resolved') {
      setEta('Resolved');
    }
  }, [activeEvent?.status]);

  // Press-and-hold handlers
  const handlePressStart = () => {
    setSosState('pressing');
    setPressProgress(0);
    setLocationError(null);

    const startTime = Date.now();
    const duration = 2000; // 2 seconds

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / duration) * 100, 100);
      setPressProgress(progress);
    }, 40);

    pressTimerRef.current = setTimeout(() => {
      triggerSosAlert();
    }, duration);
  };

  const handlePressEnd = () => {
    if (sosState === 'pressing') {
      setSosState('idle');
      setPressProgress(0);
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    }
  };

  const triggerSosAlert = async () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

    setPressProgress(100);

    // Geolocation capture
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by this browser.");
      fallbackSosTrigger(37.774929, -122.419416); // SF default fallback
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await createSosEventRecord(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        console.warn("Geolocation permission or GPS failed. Falling back to default mock location.", error);
        setLocationError("Using default emergency dispatch coordinates due to GPS failure.");
        // Fallback to coordinates
        createSosEventRecord(13.0827, 80.2707); // Chennai central fallback as placeholder
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const fallbackSosTrigger = async (lat: number, lng: number) => {
    await createSosEventRecord(lat, lng);
  };

  const createSosEventRecord = async (lat: number, lng: number) => {
    const eventId = `sos-${Date.now()}`;
    const newEvent: SosEvent = {
      id: eventId,
      user_id: userId,
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
      status: 'pending',
      created_at: new Date().toISOString(),
      resolved_at: null,
      patient_name: fullName
    };

    if (isSupabaseLive) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          const { error } = await supabase.from('sos_events').insert(newEvent);
          if (error) throw error;
          setActiveEvent(newEvent);
        } catch (err: any) {
          console.error('Failed to post live SOS:', err);
          setLocationError('Live Supabase SOS failed. Saving locally to Sandbox mode.');
          // Save to mock
          const mockEvents = mockDB.getSosEvents();
          mockEvents.push(newEvent);
          mockDB.setSosEvents(mockEvents);
          setActiveEvent(newEvent);
        }
      }
    } else {
      const mockEvents = mockDB.getSosEvents();
      mockEvents.push(newEvent);
      mockDB.setSosEvents(mockEvents);
      setActiveEvent(newEvent);
    }
  };

  const handleCancelAlert = async () => {
    if (!activeEvent) return;

    if (isSupabaseLive) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          // In real life, we can either delete or set as resolved/cancelled
          const { error } = await supabase
            .from('sos_events')
            .update({ status: 'resolved', resolved_at: new Date().toISOString() })
            .eq('id', activeEvent.id);
          
          if (error) throw error;
        } catch (err) {
          console.error('Cancel alert live failed:', err);
        }
      }
    } else {
      stopAmbulanceSimulation(activeEvent.id);
      const events = mockDB.getSosEvents();
      const updated = events.map(e => e.id === activeEvent.id ? { 
        ...e, 
        status: 'resolved' as SosStatus, 
        resolved_at: new Date().toISOString() 
      } : e);
      mockDB.setSosEvents(updated);
    }

    setActiveEvent(null);
    setSosState('idle');
    setPressProgress(0);
  };

  return (
    <div id="homescreen-view-wrapper" className="flex flex-col flex-1 h-full max-w-md mx-auto bg-gray-50 relative pb-20">
      
      {/* 1. IDLE/HOME STATE */}
      {sosState === 'idle' && (
        <div className="flex flex-col flex-1 px-6 pt-6 pb-4 justify-between h-full">
          {/* Top Header */}
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-200/80 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl">
                <HeartPulse size={22} className="animate-pulse" />
              </div>
              <div>
                <h2 className="font-sans font-bold text-gray-900 text-lg tracking-tight leading-none">LifeLink AI</h2>
                <p className="text-[9px] text-teal-600 font-bold uppercase tracking-widest mt-1">Predict. Protect. Respond.</p>
              </div>
            </div>
            
            <button 
              onClick={() => onNavigateToTab('profile')}
              className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 transition border border-gray-200"
            >
              <User size={18} />
            </button>
          </div>

          {/* Quick Informational Stats Carousel */}
          <div className="mt-4 bg-teal-600 text-white p-5 rounded-2xl relative overflow-hidden shadow-sm border border-teal-700">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <HeartPulse size={120} />
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[9px] bg-teal-700/60 text-teal-100 font-bold uppercase tracking-wider px-2 py-0.5 rounded-md">
                AI Diagnostics Active
              </span>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-300 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-300"></span>
              </span>
            </div>
            <h3 className="font-sans font-bold text-base mb-1">Welcome back, {fullName.split(' ')[0]}</h3>
            <p className="text-xs text-teal-50/90 leading-relaxed font-normal">
              Your Health Passport is active and ready. Paramedics can instantly read your profile in an SOS event.
            </p>
          </div>

          {/* Centered Large Red SOS Button Section */}
          <div className="flex flex-col items-center justify-center py-8 my-auto">
            <div className="relative flex items-center justify-center">
              {/* Outer Glow Ring */}
              <div className="absolute w-64 h-64 rounded-full bg-red-50 border border-red-100 flex items-center justify-center opacity-60"></div>
              
              {/* Pulsing Visual background rings */}
              <div className="absolute w-52 h-52 rounded-full bg-red-100/40 flex items-center justify-center animate-pulse opacity-50"></div>

              {/* True interactive Hold Button */}
              <button
                onMouseDown={handlePressStart}
                onMouseUp={handlePressEnd}
                onMouseLeave={handlePressEnd}
                onTouchStart={(e) => { e.preventDefault(); handlePressStart(); }}
                onTouchEnd={(e) => { e.preventDefault(); handlePressEnd(); }}
                className="relative z-10 w-44 h-44 rounded-full bg-red-600 hover:bg-red-700 text-white flex flex-col items-center justify-center border-8 border-white shadow-[0_0_50px_rgba(239,68,68,0.35)] transition-all active:scale-95 select-none cursor-pointer"
              >
                <ShieldAlert size={44} className="text-white drop-shadow-sm" />
                <span className="font-sans font-black text-3xl tracking-tight mt-1 drop-shadow-sm">SOS</span>
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-red-100 mt-1">HOLD 2S</span>
              </button>
            </div>

            <p className="text-center text-sm font-semibold text-gray-800 max-w-xs leading-normal mt-8 mb-2">
              {strings.pressHold}
            </p>
            <span className="text-center text-[11px] text-gray-400 font-medium">
              Geolocates you and dispatches immediate paramedic support
            </span>
          </div>

          {/* Fast Information Help Banner */}
          <div className="bg-white border border-gray-200 p-4 rounded-2xl flex gap-3 items-center">
            <AlertOctagon size={20} className="text-teal-600 shrink-0" />
            <div className="text-xs text-gray-600 leading-relaxed font-normal">
              <strong>Need regular guidance?</strong> Go to the <strong>First Aid Chat</strong> tab below to get step-by-step advice for burns, cuts, or choking.
            </div>
          </div>
        </div>
      )}

      {/* 2. PRESSING/COUNTDOWN TRANSITIONAL STATE */}
      {sosState === 'pressing' && (
        <div className="flex flex-col flex-1 items-center justify-center bg-gray-950 px-6 text-white text-center h-full">
          <div className="relative flex items-center justify-center w-64 h-64 mb-8">
            {/* SVG circle track */}
            <svg className="absolute w-60 h-60 transform -rotate-90">
              <circle
                cx="120"
                cy="120"
                r="100"
                className="stroke-gray-800 fill-transparent"
                strokeWidth="10"
              />
              <circle
                cx="120"
                cy="120"
                r="100"
                className="stroke-red-600 fill-transparent transition-all duration-75"
                strokeWidth="10"
                strokeDasharray="628"
                strokeDashoffset={628 - (628 * pressProgress) / 100}
                strokeLinecap="round"
              />
            </svg>
            
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-sans font-black text-6xl tracking-tight text-white">
                {Math.max(1, Math.ceil((100 - pressProgress) / 50))}s
              </span>
              <span className="text-[10px] uppercase tracking-widest text-red-400 font-bold mt-1">HOLDING</span>
            </div>
          </div>

          <h2 className="font-sans font-bold text-2xl tracking-tight text-white mb-2">
            Sending Emergency Alert
          </h2>
          <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
            Keep holding! Releasing your finger now will cancel this emergency alert trigger.
          </p>
        </div>
      )}

      {/* 3. SOS TRIGGERED & LIVE TRACKING VIEW */}
      {sosState === 'triggered' && activeEvent && (
        <div className="flex flex-col flex-1 h-full justify-between">
          
          {/* Header Status ETA */}
          <div className="p-4 bg-white border-b border-gray-200 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-50 text-red-600 rounded-xl animate-pulse">
                <Ambulance size={20} />
              </div>
              <div>
                <span className="text-[9px] text-gray-400 uppercase font-bold tracking-widest block leading-none">
                  {strings.etaBanner}
                </span>
                <span className="text-base font-sans font-extrabold text-gray-900 leading-tight">
                  {activeEvent.status === 'pending' ? 'Dispatching...' : `Arriving in ~${eta}`}
                </span>
              </div>
            </div>
            
            <div className="text-right">
              <span className="text-[10px] font-mono font-bold bg-red-50 text-red-600 px-2.5 py-1 rounded-md uppercase border border-red-100 leading-none">
                {activeEvent.status}
              </span>
            </div>
          </div>

          {/* Interactive Map Visualizer */}
          <div className="flex-1 bg-gray-100 relative overflow-hidden flex flex-col">
            {/* Simulated Live Map Overlay Canvas */}
            <div className="absolute inset-0 bg-gray-200 flex flex-col items-center justify-center">
              {/* Map grid simulation lines */}
              <div className="absolute inset-0 opacity-15" style={{
                backgroundImage: 'radial-gradient(#0f172a 1px, transparent 1px)',
                backgroundSize: '24px 24px'
              }}></div>
              
              {/* Custom SVG Elegant Map Interface */}
              <svg className="w-full h-full absolute inset-0 text-slate-400">
                {/* Simulated Hospital, Patient and Roads */}
                <path d="M 0 100 Q 150 150 400 50" fill="none" stroke="#e2e8f0" strokeWidth="8" strokeLinecap="round" />
                <path d="M 50 400 L 250 200 L 350 400" fill="none" stroke="#e2e8f0" strokeWidth="8" strokeLinecap="round" />
                <path d="M 10 300 C 150 280, 200 320, 390 280" fill="none" stroke="#e2e8f0" strokeWidth="6" strokeLinecap="round" />
                
                {/* Active route highlighting */}
                <path d="M 50 400 L 250 200" fill="none" stroke="#14b8a6" strokeWidth="4" strokeDasharray="6 4" strokeLinecap="round" className="animate-[dash_10s_linear_infinite]" />
              </svg>

              {/* Patient Pin (Static at Centerish) */}
              <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20">
                <div className="relative">
                  <span className="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-teal-500 opacity-60"></span>
                  <div className="p-2.5 bg-teal-600 text-white rounded-full shadow-lg border-2 border-white">
                    <User size={16} />
                  </div>
                </div>
                <div className="bg-gray-900/90 backdrop-blur-sm text-[10px] font-semibold text-white px-2 py-0.5 rounded-md mt-1.5 shadow-md">
                  {strings.patientLoc}
                </div>
              </div>

              {/* Ambulance Pin (Dynamic Updates via Simulation) */}
              {ambulanceLoc ? (
                <div 
                  className="absolute z-20 flex flex-col items-center transition-all duration-1000 ease-in-out"
                  style={{
                    // Map physical coordinate delta to pixel container coordinates beautifully
                    bottom: `${Math.min(90, Math.max(10, 40 + (ambulanceLoc.latitude - activeEvent.latitude) * 1500))}%`,
                    left: `${Math.min(90, Math.max(10, 50 + (ambulanceLoc.longitude - activeEvent.longitude) * 1500))}%`
                  }}
                >
                  <div className="relative">
                    <span className="animate-ping absolute inline-flex h-10 w-10 rounded-full bg-red-500 opacity-75"></span>
                    <div className="p-2 bg-red-600 text-white rounded-full shadow-xl border-2 border-white animate-bounce">
                      <Ambulance size={18} />
                    </div>
                  </div>
                  <div className="bg-gray-950 text-[9px] font-mono font-bold text-white px-2 py-0.5 rounded-md mt-1 shadow-md flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block animate-pulse"></span>
                    {strings.ambulanceLoc}
                  </div>
                </div>
              ) : (
                <div className="absolute top-[40%] left-[20%] z-20 flex flex-col items-center">
                  <div className="p-2 bg-gray-400 text-white rounded-full shadow-md border-2 border-white">
                    <Ambulance size={16} />
                  </div>
                  <div className="bg-gray-800 text-[9px] text-gray-300 px-1.5 py-0.5 rounded mt-1">
                    Locating Unit...
                  </div>
                </div>
              )}

              {/* Coordinates Indicator */}
              <div className="absolute bottom-4 left-4 right-4 bg-gray-950/90 backdrop-blur-md text-white p-3.5 rounded-2xl flex items-center justify-between text-xs border border-white/10 shadow-lg">
                <div className="font-mono text-[10px] space-y-0.5">
                  <p className="text-gray-400 flex items-center gap-1">
                    <MapPin size={10} /> LAT: {activeEvent.latitude.toFixed(5)}
                  </p>
                  <p className="text-gray-400 flex items-center gap-1">
                    <Compass size={10} /> LNG: {activeEvent.longitude.toFixed(5)}
                  </p>
                </div>
                
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-widest text-teal-400 font-bold">
                    GPS LOCKED
                  </p>
                  <p className="text-[10px] font-medium text-gray-300 mt-0.5">
                    Ready for Paramedics
                  </p>
                </div>
              </div>

              {/* Warning/Error indicator if location fallback was triggered */}
              {locationError && (
                <div className="absolute top-4 left-4 right-4 bg-amber-500 text-white text-[11px] p-2 rounded-xl text-center shadow-lg font-medium">
                  {locationError}
                </div>
              )}
            </div>
          </div>

          {/* Status Timeline Progress Card */}
          <div className="p-6 bg-white rounded-t-3xl border-t border-gray-200 shadow-xl">
            <p className="text-xs text-center text-gray-500 mb-5 font-medium flex items-center justify-center gap-1">
              <CheckCircle2 size={14} className="text-teal-600" />
              <span>{strings.reassurance}</span>
            </p>

            {/* Stepper timeline */}
            <div className="grid grid-cols-4 gap-2 mb-6 text-center">
              {/* Step 1: Alert Sent */}
              <div className="space-y-1">
                <div className="mx-auto w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center">
                  1
                </div>
                <p className="text-[10px] font-bold text-gray-900 leading-tight">
                  {strings.status1}
                </p>
                <span className="text-[9px] text-gray-400 block font-mono">
                  {new Date(activeEvent.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Step 2: Hospital Notified */}
              <div className="space-y-1">
                <div className={`mx-auto w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                  activeEvent.status === 'dispatched' || activeEvent.status === 'resolved'
                    ? 'bg-teal-600 text-white'
                    : 'bg-teal-50 text-teal-600 border border-teal-200 animate-pulse'
                }`}>
                  2
                </div>
                <p className="text-[10px] font-bold text-gray-800 leading-tight">
                  {strings.status2}
                </p>
                <span className="text-[9px] text-gray-400 block">
                  {activeEvent.status !== 'pending' ? 'Notified' : 'Pending'}
                </span>
              </div>

              {/* Step 3: Ambulance Dispatched */}
              <div className="space-y-1">
                <div className={`mx-auto w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                  activeEvent.status === 'dispatched' || activeEvent.status === 'resolved'
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-400 border border-gray-200/50'
                }`}>
                  3
                </div>
                <p className="text-[10px] font-bold text-gray-800 leading-tight">
                  {strings.status3}
                </p>
                <span className="text-[9px] text-gray-400 block">
                  {activeEvent.status === 'dispatched' ? 'En Route' : activeEvent.status === 'resolved' ? 'Arrived' : 'Awaiting'}
                </span>
              </div>

              {/* Step 4: Arriving */}
              <div className="space-y-1">
                <div className={`mx-auto w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                  activeEvent.status === 'resolved'
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-400 border border-gray-200/50'
                }`}>
                  4
                </div>
                <p className="text-[10px] font-bold text-gray-800 leading-tight">
                  {strings.status4}
                </p>
                <span className="text-[9px] text-gray-400 block">
                  {activeEvent.status === 'resolved' ? 'Complete' : 'Pending'}
                </span>
              </div>
            </div>

            {/* Cancel Button */}
            <button
              onClick={handleCancelAlert}
              className="w-full py-3 bg-gray-50 hover:bg-gray-100 text-red-600 hover:text-red-700 font-semibold rounded-2xl text-xs tracking-wider uppercase transition flex items-center justify-center gap-2 border border-gray-200"
            >
              <X size={15} />
              <span>{strings.cancel}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
