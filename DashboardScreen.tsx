import React, { useState, useEffect } from 'react';
import { getSupabase, mockDB, realtimeEvents, startAmbulanceSimulation, stopAmbulanceSimulation } from '../lib/supabase';
import { SosEvent, HealthPassport, SosStatus } from '../types';
import { 
  HeartPulse, ShieldAlert, Ambulance, CheckCircle2, MapPin, 
  User, Calendar, Clock, ArrowRight, FileText, Phone, Award, AlertTriangle, AlertCircle, RefreshCw, X
} from 'lucide-react';

interface DashboardScreenProps {
  isSupabaseLive: boolean;
  userId: string;
  userRole: string;
}

export default function DashboardScreen({ isSupabaseLive, userId, userRole }: DashboardScreenProps) {
  const [sosEvents, setSosEvents] = useState<SosEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<SosEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Load active events
  const loadEvents = async () => {
    setLoading(true);
    if (isSupabaseLive) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          // In live supabase, load all active (non-resolved, or all for dashboard view)
          const { data, error } = await supabase
            .from('sos_events')
            .select('*')
            .order('created_at', { ascending: false });

          if (error) throw error;
          
          // Let's load the associated health passports for these users to get names if they exist
          const eventsWithPassports = await Promise.all((data || []).map(async (event) => {
            const { data: passport } = await supabase
              .from('health_passports')
              .select('*')
              .eq('user_id', event.user_id)
              .single();

            return {
              ...event,
              patient_name: passport?.full_name || 'Anonymous Patient',
              patient_passport: passport || undefined
            };
          }));

          setSosEvents(eventsWithPassports);
        } catch (err) {
          console.error('Error loading live SOS events:', err);
          fallbackToMockEvents();
        }
      }
    } else {
      fallbackToMockEvents();
    }
    setLoading(false);
  };

  const fallbackToMockEvents = () => {
    const events = mockDB.getSosEvents();
    const passports = mockDB.getPassports();
    
    // Sort newest first
    const sorted = [...events].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    // Attach passport details to each mock event
    const hydrated = sorted.map(event => {
      const p = passports.find(pass => pass.user_id === event.user_id);
      return {
        ...event,
        patient_name: p?.full_name || event.patient_name || 'Anonymous Patient',
        patient_passport: p || undefined
      };
    });

    setSosEvents(hydrated);
  };

  useEffect(() => {
    loadEvents();

    if (isSupabaseLive) {
      const supabase = getSupabase();
      if (supabase) {
        // Subscribe to real-time events to update the dashboard instantly!
        const subscription = supabase
          .channel('dashboard_sos_events')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'sos_events' },
            () => {
              console.log('Realtime DB change caught on Dashboard. Reloading...');
              loadEvents();
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(subscription);
        };
      }
    } else {
      // Offline/Sandbox subscription fallback
      const unsubscribe = realtimeEvents.on('sos_events_change', () => {
        fallbackToMockEvents();
      });
      return () => {
        unsubscribe();
      };
    }
  }, [isSupabaseLive]);

  // Keep selected event detail synchronized with changes
  useEffect(() => {
    if (!selectedEvent) return;
    const matched = sosEvents.find(e => e.id === selectedEvent.id);
    if (matched) {
      setSelectedEvent(matched);
    }
  }, [sosEvents]);

  // Dispatch ambulance
  const handleDispatch = async (event: SosEvent) => {
    setUpdatingId(event.id);
    const updatedStatus: SosStatus = 'dispatched';

    if (isSupabaseLive) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          // Update status in remote DB
          const { error } = await supabase
            .from('sos_events')
            .update({ status: updatedStatus })
            .eq('id', event.id);

          if (error) throw error;

          // Also insert initial ambulance location to bind live updates
          await supabase.from('ambulance_locations').upsert({
            sos_event_id: event.id,
            latitude: event.latitude - 0.02, // starts slightly offset
            longitude: event.longitude - 0.02,
            updated_at: new Date().toISOString()
          });

          await loadEvents();
        } catch (err) {
          console.error('Error dispatching live ambulance:', err);
          dispatchMock(event.id, event.latitude, event.longitude);
        }
      }
    } else {
      dispatchMock(event.id, event.latitude, event.longitude);
    }
    setUpdatingId(null);
  };

  const dispatchMock = (id: string, lat: number, lng: number) => {
    const events = mockDB.getSosEvents();
    const updated = events.map(e => e.id === id ? { ...e, status: 'dispatched' as SosStatus } : e);
    mockDB.setSosEvents(updated);
    
    // Start simulating the ambulance location moving
    startAmbulanceSimulation(id, lat, lng);
    fallbackToMockEvents();
  };

  // Mark event as resolved
  const handleResolve = async (event: SosEvent) => {
    setUpdatingId(event.id);
    const updatedStatus: SosStatus = 'resolved';

    if (isSupabaseLive) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          const { error } = await supabase
            .from('sos_events')
            .update({ status: updatedStatus, resolved_at: new Date().toISOString() })
            .eq('id', event.id);

          if (error) throw error;
          await loadEvents();
        } catch (err) {
          console.error('Error resolving live event:', err);
          resolveMock(event.id);
        }
      }
    } else {
      resolveMock(event.id);
    }
    setUpdatingId(null);
  };

  const resolveMock = (id: string) => {
    stopAmbulanceSimulation(id);
    const events = mockDB.getSosEvents();
    const updated = events.map(e => e.id === id ? { 
      ...e, 
      status: 'resolved' as SosStatus, 
      resolved_at: new Date().toISOString() 
    } : e);
    mockDB.setSosEvents(updated);
    fallbackToMockEvents();
  };

  return (
    <div id="dashboard-view-wrapper" className="flex flex-col flex-1 h-full max-w-md mx-auto bg-gray-50 relative pb-20 font-sans">
      
      {/* Clinician Dashboard Header */}
      <div className="bg-gray-900 text-white p-5 rounded-b-2xl shadow-sm flex items-center justify-between border-b border-gray-850">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-red-600 text-white rounded-xl">
            <ShieldAlert size={18} className="animate-pulse" />
          </div>
          <div>
            <h2 className="font-sans font-bold text-white text-sm leading-tight">LifeLink Response Center</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Role: Clinician Command</p>
          </div>
        </div>

        <button 
          onClick={loadEvents}
          className="p-2 bg-gray-850 hover:bg-gray-800 text-white rounded-xl transition cursor-pointer"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Main Command Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        
        {loading ? (
          <div className="flex flex-col items-center justify-center p-8 text-gray-400">
            <RefreshCw className="animate-spin text-teal-600 mb-2" size={24} />
            <span className="text-xs font-semibold">Polling emergency streams...</span>
          </div>
        ) : sosEvents.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm text-center space-y-3 font-sans">
            <CheckCircle2 className="text-teal-600 mx-auto" size={36} />
            <h3 className="font-sans font-bold text-gray-900 text-sm">All Clear. No Active Alerts.</h3>
            <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">
              No emergency SOS dispatches are currently pending in your response sector. Emergency personnel are stand-by.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">
              Active Alerts ({sosEvents.filter(e => e.status !== 'resolved').length})
            </h3>

            {sosEvents.map((event) => (
              <div
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                className={`p-4 bg-white rounded-xl border transition cursor-pointer shadow-sm relative overflow-hidden ${
                  selectedEvent?.id === event.id 
                    ? 'border-red-650 ring-1 ring-red-650' 
                    : 'border-gray-250/85 hover:border-gray-300'
                }`}
              >
                {/* Visual side accent matching status */}
                <div className={`absolute top-0 bottom-0 left-0 w-1 ${
                  event.status === 'pending' ? 'bg-red-650' : event.status === 'dispatched' ? 'bg-amber-500' : 'bg-gray-300'
                }`}></div>

                <div className="flex justify-between items-start pl-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-sans font-bold text-gray-900 text-sm">{event.patient_name}</h4>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded leading-none uppercase ${
                        event.status === 'pending' ? 'bg-red-50 text-red-600 border border-red-150/40' :
                        event.status === 'dispatched' ? 'bg-amber-50 text-amber-600 border border-amber-150/40' :
                        'bg-gray-50 text-gray-500 border border-gray-200'
                      }`}>
                        {event.status}
                      </span>
                    </div>

                    <p className="text-[10px] text-gray-400 flex items-center gap-1 font-mono">
                      <MapPin size={10} /> LAT: {event.latitude.toFixed(4)}, LNG: {event.longitude.toFixed(4)}
                    </p>
                  </div>

                  <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
                    <Clock size={10} />
                    {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Patient Health Passport quick indicators on list card */}
                {event.patient_passport && (
                  <div className="mt-2.5 pt-2.5 border-t border-gray-100 pl-2 flex gap-1.5 flex-wrap">
                    <span className="text-[9px] bg-red-50 border border-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded">
                      BLOOD: {event.patient_passport.blood_type.replace('Positive', '+').replace('Negative', '-')}
                    </span>
                    {event.patient_passport.allergies.length > 0 && (
                      <span className="text-[9px] bg-amber-50 border border-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded uppercase">
                        {event.patient_passport.allergies.length} Allergies
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL / BOTTOM DETAIL DRAWER */}
      {selectedEvent && (
        <div className="absolute inset-0 z-50 bg-gray-950/40 backdrop-blur-xs flex flex-col justify-end">
          
          {/* Backdrop Closer */}
          <div className="flex-1" onClick={() => setSelectedEvent(null)}></div>
          
          {/* Action Details Content */}
          <div className="bg-white rounded-t-2xl shadow-2xl border-t border-gray-100 p-6 space-y-4 max-h-[85%] overflow-y-auto max-w-md w-full mx-auto animate-slide-up font-sans">
            
            {/* Drawer Header */}
            <div className="flex justify-between items-center pb-2.5 border-b border-gray-100">
              <div>
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block">CASE FILE INCIDENT</span>
                <h3 className="font-sans font-bold text-gray-900 text-base">{selectedEvent.patient_name}</h3>
              </div>
              <button 
                onClick={() => setSelectedEvent(null)}
                className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800 rounded-full transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* GPS coordinates & action box */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200/60 space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-gray-500">Incident coordinates:</span>
                <span className="font-mono text-red-600 font-bold">{selectedEvent.latitude.toFixed(5)}, {selectedEvent.longitude.toFixed(5)}</span>
              </div>
              
              <div className="flex gap-2">
                {selectedEvent.status === 'pending' && (
                  <button
                    onClick={() => handleDispatch(selectedEvent)}
                    disabled={updatingId === selectedEvent.id}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Ambulance size={14} />
                    <span>Dispatch Response Unit</span>
                  </button>
                )}

                {selectedEvent.status === 'dispatched' && (
                  <button
                    onClick={() => handleResolve(selectedEvent)}
                    disabled={updatingId === selectedEvent.id}
                    className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 size={14} />
                    <span>Mark Incident Resolved</span>
                  </button>
                )}

                {selectedEvent.status === 'resolved' && (
                  <div className="w-full bg-gray-150 text-gray-500 py-3 px-3 rounded-xl text-center text-xs font-bold uppercase tracking-wider border border-gray-200">
                    Case Resolved & Closed
                  </div>
                )}
              </div>
            </div>

            {/* Patient Clinical Records (Health Passport) */}
            {selectedEvent.patient_passport ? (
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-gray-100 pb-2">
                  <FileText size={14} className="text-teal-600" />
                  <span>EMERGENCY MEDICAL RECORD</span>
                </h4>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-150/60 font-sans">
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">BLOOD TYPE</span>
                    <span className="text-sm font-sans font-extrabold text-red-650 block mt-0.5">
                      {selectedEvent.patient_passport.blood_type.replace('Positive', '+').replace('Negative', '-')}
                    </span>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-150/60 font-sans">
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">CONTACT RELATION</span>
                    <span className="text-xs font-bold text-gray-800 block truncate mt-0.5">
                      {selectedEvent.patient_passport.emergency_contacts[0]?.name || 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  {/* Allergies list */}
                  <div>
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">ALLERGIES</span>
                    <div className="flex flex-wrap gap-1 mt-1 font-sans">
                      {selectedEvent.patient_passport.allergies.length === 0 ? (
                        <span className="text-xs text-gray-400 italic font-sans">No reported allergies.</span>
                      ) : (
                        selectedEvent.patient_passport.allergies.map(t => (
                          <span key={t} className="text-[9px] font-bold bg-red-50 text-red-650 px-2 py-0.5 rounded border border-red-150/40 uppercase">
                            {t}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Conditions list */}
                  <div>
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">CHRONIC CONDITIONS</span>
                    <div className="flex flex-wrap gap-1 mt-1 font-sans">
                      {selectedEvent.patient_passport.chronic_conditions.length === 0 ? (
                        <span className="text-xs text-gray-400 italic">No conditions reported.</span>
                      ) : (
                        selectedEvent.patient_passport.chronic_conditions.map(t => (
                          <span key={t} className="text-[9px] font-bold bg-amber-50 text-amber-750 px-2 py-0.5 rounded border border-amber-150/40 uppercase">
                            {t}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Medications list */}
                  <div>
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">MEDICATIONS</span>
                    <div className="flex flex-wrap gap-1 mt-1 font-sans">
                      {selectedEvent.patient_passport.medications.length === 0 ? (
                        <span className="text-xs text-gray-400 italic font-sans">No active prescription drugs.</span>
                      ) : (
                        selectedEvent.patient_passport.medications.map(t => (
                          <span key={t} className="text-[9px] font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded border border-gray-200 uppercase">
                            {t}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Emergency contacts row list */}
                  {selectedEvent.patient_passport.emergency_contacts.length > 0 && (
                    <div className="bg-red-50/50 p-3.5 rounded-xl border border-red-100/30 space-y-1.5 mt-2">
                      <span className="text-[9px] text-red-650 font-bold uppercase tracking-wider block">EMERGENCY CONTACT LIST</span>
                      {selectedEvent.patient_passport.emergency_contacts.map((contact, index) => (
                        <div key={index} className="flex justify-between items-center text-xs border-b border-red-100/10 pb-1.5 last:border-0 last:pb-0">
                          <div>
                            <p className="font-bold text-gray-800">{contact.name}</p>
                            <p className="text-[10px] text-gray-400 capitalize font-sans">{contact.relation} • {contact.phone}</p>
                          </div>
                          <a href={`tel:${contact.phone}`} className="p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700">
                            <Phone size={11} />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-amber-50/60 border border-amber-150/40 p-4 rounded-xl flex gap-2.5 text-xs text-amber-800 leading-normal font-sans">
                <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={16} />
                <span>No Medical Health Passport is loaded for this patient ID. Proceed with standard general paramedics emergency protocols.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
