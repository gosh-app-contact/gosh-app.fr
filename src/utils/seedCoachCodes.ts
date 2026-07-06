import { db } from './firebase';
import { collection, doc, setDoc, getDocs } from 'firebase/firestore';

// 80 unique one-time-use coach codes
const COACH_CODES = [
  'GOSH-COACH-A1B2', 'GOSH-COACH-C3D4', 'GOSH-COACH-E5F6', 'GOSH-COACH-G7H8',
  'GOSH-COACH-J9K1', 'GOSH-COACH-L2M3', 'GOSH-COACH-N4P5', 'GOSH-COACH-Q6R7',
  'GOSH-COACH-S8T9', 'GOSH-COACH-U1V2', 'GOSH-COACH-W3X4', 'GOSH-COACH-Y5Z6',
  'GOSH-COACH-A7B8', 'GOSH-COACH-C9D1', 'GOSH-COACH-E2F3', 'GOSH-COACH-G4H5',
  'GOSH-COACH-J6K7', 'GOSH-COACH-L8M9', 'GOSH-COACH-N1P2', 'GOSH-COACH-Q3R4',
  'GOSH-COACH-S5T6', 'GOSH-COACH-U7V8', 'GOSH-COACH-W9X1', 'GOSH-COACH-Y2Z3',
  'GOSH-COACH-A4B5', 'GOSH-COACH-C6D7', 'GOSH-COACH-E8F9', 'GOSH-COACH-G1H2',
  'GOSH-COACH-J3K4', 'GOSH-COACH-L5M6', 'GOSH-COACH-N7P8', 'GOSH-COACH-Q9R1',
  'GOSH-COACH-S2T3', 'GOSH-COACH-U4V5', 'GOSH-COACH-W6X7', 'GOSH-COACH-Y8Z9',
  'GOSH-COACH-A2C4', 'GOSH-COACH-B3D5', 'GOSH-COACH-E6G8', 'GOSH-COACH-F7H9',
  'GOSH-COACH-J1L3', 'GOSH-COACH-K2M4', 'GOSH-COACH-N5P7', 'GOSH-COACH-Q8S1',
  'GOSH-COACH-R2T4', 'GOSH-COACH-U6W8', 'GOSH-COACH-V7X9', 'GOSH-COACH-Y1A3',
  'GOSH-COACH-Z2B4', 'GOSH-COACH-C5E7', 'GOSH-COACH-D6F8', 'GOSH-COACH-G9J2',
  'GOSH-COACH-H1K3', 'GOSH-COACH-L4N6', 'GOSH-COACH-M5P7', 'GOSH-COACH-Q8U1',
  'GOSH-COACH-R3V5', 'GOSH-COACH-S4W6', 'GOSH-COACH-T7X9', 'GOSH-COACH-U8Y2',
  'GOSH-COACH-V9Z3', 'GOSH-COACH-W1A4', 'GOSH-COACH-X2B5', 'GOSH-COACH-Y3C6',
  'GOSH-COACH-Z4D7', 'GOSH-COACH-A5E8', 'GOSH-COACH-B6F9', 'GOSH-COACH-C7G1',
  'GOSH-COACH-D8H2', 'GOSH-COACH-E9J3', 'GOSH-COACH-F1K4', 'GOSH-COACH-G2L5',
  'GOSH-COACH-H3M6', 'GOSH-COACH-J4N7', 'GOSH-COACH-K5P8', 'GOSH-COACH-L6Q9',
  'GOSH-COACH-M7R1', 'GOSH-COACH-N8S2', 'GOSH-COACH-P9T3', 'GOSH-COACH-Q1U4',
];

export async function seedCoachCodes(): Promise<void> {
  const col = collection(db, 'coachCodes');
  const existing = await getDocs(col);
  const existingCodes = new Set(existing.docs.map((d) => d.id));

  let added = 0;
  for (const code of COACH_CODES) {
    if (!existingCodes.has(code)) {
      await setDoc(doc(db, 'coachCodes', code), {
        code,
        used: false,
        createdAt: Date.now(),
      });
      added++;
    }
  }
  console.log(`[seedCoachCodes] ${added} codes ajoutés, ${existingCodes.size} déjà existants.`);
}

export { COACH_CODES };
