export type UserRole = 'patient' | 'doctor' | 'hospital' | 'dispatcher';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  full_name?: string;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  relation: string;
}

export interface HealthPassport {
  user_id: string;
  full_name: string;
  blood_type: string;
  allergies: string[];
  chronic_conditions: string[];
  medications: string[];
  emergency_contacts: EmergencyContact[];
}

export type SosStatus = 'pending' | 'dispatched' | 'resolved';

export interface SosEvent {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  status: SosStatus;
  created_at: string;
  resolved_at: string | null;
  patient_name?: string; // Helper for dashboard views
  patient_passport?: HealthPassport;
}

export interface AmbulanceLocation {
  id: string;
  sos_event_id: string;
  latitude: number;
  longitude: number;
  updated_at: string;
}

export type AppLanguage = 'en' | 'ta' | 'hi';
