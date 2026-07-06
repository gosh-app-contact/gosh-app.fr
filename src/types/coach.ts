export type AccountType = 'standard' | 'coach' | 'student' | 'admin' | 'banned';

export type CoachRequestStatus = 'pending' | 'accepted' | 'rejected';

export type CoachRequest = {
  id: string;
  studentUid: string;
  studentPseudo: string;
  studentPhotoUrl?: string;
  coachUid: string;
  coachCode: string;
  status: CoachRequestStatus;
  createdAt: number;
};

export type StudentSummary = {
  uid: string;
  pseudo: string;
  photoUrl?: string;
  coachStatus: CoachRequestStatus;
  joinedAt: number;
};

// Secret code that grants coach account creation
export const COACH_SECRET = 'GOSH_COACH_2024';

// Generates coach code from pseudo: "thomas" → "thomas.gosh"
export function buildCoachCode(pseudo: string): string {
  return `${pseudo.toLowerCase().replace(/\s+/g, '')}.gosh`;
}
