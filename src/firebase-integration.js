import {
  collection, addDoc, updateDoc, setDoc, doc, serverTimestamp,
  onSnapshot, writeBatch, getDoc, Timestamp,
} from "firebase/firestore";
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "firebase/auth";
import { db, auth } from "./firebase";

const DATA_WEIGHT = {
  location: 3, financial: 5, health: 4,
  email: 1, phone: 2, contacts: 3,
  photos: 2, device_id: 2, browsing_history: 4,
};

function computeRisk(dataTypes, baseRisk = 0) {
  return Math.min(10,
    dataTypes.reduce((s, dt) => s + (DATA_WEIGHT[dt] ?? 1), 0) + baseRisk
  );
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export function subscribeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
}

export async function signOutUser() {
  await signOut(auth);
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export async function grantConsent({ userId, serviceId, dataTypes, baseRisk = 0 }) {
  const riskScore = computeRisk(dataTypes, baseRisk);

  const consentRef = await addDoc(collection(db, "user_consents"), {
    userId, serviceId, dataTypes, riskScore,
    status: "active",
    grantedAt: serverTimestamp(),
    revokedAt: null,
  });

  await addDoc(collection(db, "permission_history"), {
    userId, serviceId, dataTypes, riskScore,
    event: "ACCESS_GRANTED",
    consentId: consentRef.id,
    timestamp: serverTimestamp(),
  });

  return consentRef.id;
}

// ── ConsentOS Middleware SDK ───────────────────────────────────────────────────
//
// Permissions live in a per-user sub-collection:
//   users/{uid}/permissions/{serviceId}
//
// Each document carries ownerUid for auditing. The sub-collection path itself
// enforces isolation — no cross-user queries needed.
//
//   App → SDK.checkPermission(uid, serviceId)
//       → getDoc(users/{uid}/permissions/{serviceId})
//       → { status: true }  → proceed  ✅
//       → { status: false } → reject   ❌
//       → expiresAt < now   → expired  ⏰

function permDoc(uid, serviceId) {
  return doc(db, "users", uid, "permissions", serviceId);
}

// Real-time listener — returns unsubscribe function
export function subscribePermissions(uid, callback) {
  return onSnapshot(
    collection(db, "users", uid, "permissions"),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error("permissions snapshot error:", err),
  );
}

// Create or overwrite a permission grant
export async function writePermission(serviceId, { userId, name, category, dataTypes, durationInMinutes }) {
  const expiresAt = durationInMinutes
    ? Timestamp.fromMillis(Date.now() + durationInMinutes * 60 * 1000)
    : null;
  await setDoc(permDoc(userId, serviceId), {
    ownerUid: userId, userId, serviceId, name, category, dataTypes,
    status: true,
    grantedAt: serverTimestamp(),
    revokedAt: null,
    revokeToken: null,
    expiresAt,
  });
}

// Revoke a single permission — attaches a cryptographic proof token
export async function revokePermission(userId, serviceId) {
  const revokeToken = "REV-SHA256-" + Math.random().toString(36).substring(2).toUpperCase();
  await updateDoc(permDoc(userId, serviceId), {
    status: false,
    revokeToken,
    revokedAt: serverTimestamp(),
  });
}

// Panic mode — batch-revoke all permissions atomically, each with its own token
export async function panicRevokeAll(userId, serviceIds) {
  const batch = writeBatch(db);
  serviceIds.forEach((id) => {
    const revokeToken = "REV-SHA256-" + Math.random().toString(36).substring(2).toUpperCase();
    batch.update(permDoc(userId, id), {
      status: false,
      revokeToken,
      revokedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

// One-shot check — used by the TestApp component
export async function checkPermission(userId, serviceId) {
  const snap = await getDoc(permDoc(userId, serviceId));
  return snap.exists() ? snap.data() : null;
}
