"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.goshOffEvents = exports.recalculateTonnage = exports.closeExpiredGoshOffs = void 0;
const admin = require("firebase-admin");
const functions = require("firebase-functions/v1");
const scheduler_1 = require("firebase-functions/v2/scheduler");
admin.initializeApp();
const db = admin.firestore();
// ─── 1. CRON — Clôture automatique des GoshOffs expirés ──────────────────────
exports.closeExpiredGoshOffs = (0, scheduler_1.onSchedule)({
    schedule: 'every 1 hours',
    timeZone: 'Europe/Paris',
    region: 'europe-west1',
}, async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const snap = await db
        .collection('goshoffs')
        .where('status', '==', 'active')
        .where('weekEnd', '<', todayStr)
        .get();
    if (snap.empty) {
        console.log('[closeExpiredGoshOffs] Aucun GoshOff expiré.');
        return;
    }
    console.log(`[closeExpiredGoshOffs] ${snap.size} GoshOff(s) à clôturer.`);
    const batch = db.batch();
    for (const docSnap of snap.docs) {
        const g = docSnap.data();
        const ct = g.challengerTonnage ?? 0;
        const dt = g.challengedTonnage ?? 0;
        let winnerId = null;
        if (ct > dt)
            winnerId = g.challengerClubId;
        else if (dt > ct)
            winnerId = g.challengedClubId;
        batch.update(docSnap.ref, { status: 'finished', winnerId, closedAt: admin.firestore.FieldValue.serverTimestamp(), closedBy: 'cron' });
        console.log(`[closeExpiredGoshOffs] ${docSnap.id} — ${g.challengerClubName} ${ct}kg vs ${g.challengedClubName} ${dt}kg — vainqueur: ${winnerId ?? 'nul'}`);
    }
    await batch.commit();
    console.log('[closeExpiredGoshOffs] Clôture terminée.');
});
// ─── 2. TRIGGER — Recalcul serveur du tonnage + validation ───────────────────
exports.recalculateTonnage = functions
    .region('europe-west1')
    .firestore.document('goshoffs/{goshOffId}')
    .onWrite(async (change) => {
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;
    if (!after || after.status !== 'active')
        return;
    const prsAfter = JSON.stringify(after.prs ?? {});
    const prsBefore = JSON.stringify(before?.prs ?? {});
    if (prsAfter === prsBefore)
        return;
    const prs = Object.entries(after.prs ?? {});
    // Valider les PRs — supprimer les valeurs frauduleuses
    const fraudulent = prs.filter(([, p]) => p.weight > 500 || p.weight <= 0);
    if (fraudulent.length > 0) {
        const patch = {};
        for (const [key] of fraudulent)
            patch[`prs.${key}`] = admin.firestore.FieldValue.delete();
        await change.after.ref.update(patch);
        console.warn(`[recalculateTonnage] ${fraudulent.length} PR(s) frauduleux supprimés.`);
        return;
    }
    const [cSnap, dSnap] = await Promise.all([
        db.collection('clubs').doc(after.challengerClubId).get(),
        db.collection('clubs').doc(after.challengedClubId).get(),
    ]);
    const challengerMembers = cSnap.data()?.memberIds ?? [];
    const challengedMembers = dSnap.data()?.memberIds ?? [];
    const validPrs = prs.map(([, p]) => p);
    const calcTonnage = (memberIds) => validPrs.filter((p) => memberIds.includes(p.uid)).reduce((sum, p) => sum + p.weight, 0);
    const challengerTonnage = calcTonnage(challengerMembers);
    const challengedTonnage = calcTonnage(challengedMembers);
    await change.after.ref.update({ challengerTonnage, challengedTonnage });
    console.log(`[recalculateTonnage] challenger=${challengerTonnage}kg challenged=${challengedTonnage}kg`);
});
// ─── 3. PUSH NOTIFICATIONS — Événements GoshOff ──────────────────────────────
async function getFcmTokens(clubId) {
    const clubSnap = await db.collection('clubs').doc(clubId).get();
    const memberIds = clubSnap.data()?.memberIds ?? [];
    if (memberIds.length === 0)
        return [];
    const userSnaps = await Promise.all(memberIds.map((uid) => db.collection('users').doc(uid).get()));
    return userSnaps.map((s) => s.data()?.fcmToken).filter(Boolean);
}
async function sendNotification(tokens, title, body) {
    if (tokens.length === 0)
        return;
    const chunks = [];
    for (let i = 0; i < tokens.length; i += 500)
        chunks.push(tokens.slice(i, i + 500));
    for (const chunk of chunks) {
        await admin.messaging().sendEachForMulticast({ tokens: chunk, notification: { title, body }, apns: { payload: { aps: { sound: 'default' } } } });
    }
}
exports.goshOffEvents = functions
    .region('europe-west1')
    .firestore.document('goshoffs/{goshOffId}')
    .onWrite(async (change) => {
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;
    if (!after || !before)
        return;
    const statusBefore = before.status;
    const statusAfter = after.status;
    if (statusBefore === 'pending' && statusAfter === 'active') {
        const tokens = await getFcmTokens(after.challengerClubId);
        await sendNotification(tokens, 'Défi accepté ! ⚔️', `${after.challengedClubName} a accepté votre GoshOff. C'est parti !`);
        return;
    }
    if (statusAfter === 'cancelled' && after.cancelledReason === 'refused' && before.cancelledReason !== 'refused') {
        const tokens = await getFcmTokens(after.challengerClubId);
        await sendNotification(tokens, 'Défi refusé', `${after.challengedClubName} a refusé votre GoshOff.`);
        return;
    }
    if (statusBefore === 'active' && statusAfter === 'finished') {
        const [ct, dt] = await Promise.all([getFcmTokens(after.challengerClubId), getFcmTokens(after.challengedClubId)]);
        let cm;
        let dm;
        if (!after.winnerId) {
            cm = `Match nul contre ${after.challengedClubName} !`;
            dm = `Match nul contre ${after.challengerClubName} !`;
        }
        else if (after.winnerId === after.challengerClubId) {
            cm = `Victoire contre ${after.challengedClubName} ! 🏆`;
            dm = `Défaite contre ${after.challengerClubName}. Bonne chance la prochaine fois.`;
        }
        else {
            cm = `Défaite contre ${after.challengedClubName}. Bonne chance la prochaine fois.`;
            dm = `Victoire contre ${after.challengerClubName} ! 🏆`;
        }
        await Promise.all([sendNotification(ct, 'GoshOff terminé', cm), sendNotification(dt, 'GoshOff terminé', dm)]);
    }
});
//# sourceMappingURL=index.js.map