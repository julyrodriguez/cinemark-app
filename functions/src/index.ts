import { createHash } from "crypto";
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as nodemailer from "nodemailer";

const GMAIL_PASSWORD = defineSecret("GMAIL_PASSWORD");
const ALERTA_EMAIL = process.env.ALERTA_EMAIL || "alerta@ejemplo.com";
const GMAIL_USER = process.env.GMAIL_USER || "usuario@ejemplo.com";

admin.initializeApp();

const db = admin.firestore();

const APP_AUTH_DOMAIN = "equipo.local";

const ADMIN_EMAILS: string[] = (process.env.ADMIN_EMAILS || "admin@ejemplo.com,cinemarkproyecto@equipo.local")
  .split(",")
  .map(e => e.trim().toLowerCase());

const SECURITY = {
  mobileIpTtlMinutes: 60 * 24 * 7,
  pinMaxFailedAttempts: 5,
  pinBlockMinutes: 30,
};

function normalizeIp(raw: string): string {
  const ip = String(raw || "").trim();
  if (!ip) return "";
  // Firebase suele pasar IPv6-mapped IPv4 como ::ffff:1.2.3.4
  if (ip.startsWith("::ffff:")) return ip.slice("::ffff:".length);
  return ip;
}

function isAdmin(request: any): boolean {
  const t = request?.auth?.token as any;
  const email = String(request?.auth?.token?.email || "").trim().toLowerCase();

  if (t?.admin === true || t?.role === "admin") return true;
  if (ADMIN_EMAILS.length > 0 && ADMIN_EMAILS.includes(email)) return true;

  return false;
}

function requireAdmin(request: any) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "No autenticado.");
  }
  if (!isAdmin(request)) {
    throw new HttpsError("permission-denied", "Requiere rol admin.");
  }
}

/**
 * Detecta si el dispositivo es móvil o PC basándose en User-Agent
 * Retorna 'mobile' o 'desktop'
 */
function detectDeviceType(request: any): 'mobile' | 'desktop' {
  const userAgent = String(request?.headers?.['user-agent'] || '').toLowerCase();

  // Patrones de móviles reales
  const mobilePatterns = [
    /android.*mobile/,  // Android móvil (no tablets)
    /iphone/,
    /ipod/,
    /blackberry/,
    /windows phone/,
    /mobile/,
    /webos/,
  ];

  // Patrones de tablets (tratarlas como desktop para sesiones largas)
  const tabletPatterns = [
    /ipad/,
    /android(?!.*mobile)/,  // Android sin "mobile" = tablet
    /tablet/,
  ];

  // Patrones de desktop/PC
  const desktopPatterns = [
    /windows nt/,
    /macintosh/,
    /mac os x/,
    /linux.*x86/,
    /x11/,
  ];

  // Primero verificar si es definitivamente desktop
  if (desktopPatterns.some(pattern => pattern.test(userAgent))) {
    return 'desktop';
  }

  // Tablets se tratan como desktop (sesiones largas)
  if (tabletPatterns.some(pattern => pattern.test(userAgent))) {
    return 'desktop';
  }

  // Verificar si es móvil
  if (mobilePatterns.some(pattern => pattern.test(userAgent))) {
    return 'mobile';
  }

  // Por defecto, si no podemos determinar, tratarlo como desktop
  // (es más seguro dar acceso permanente que expirar incorrectamente)
  return 'desktop';
}

function normalizeCineId(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9-_]/g, "");
}

function normalizeEmail(raw: string): string {
  return String(raw ?? "").trim().toLowerCase();
}

function getRequestIp(req: any): string {
  const xff = req?.headers?.["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    const first = xff.split(",")[0]?.trim();
    if (first) return normalizeIp(first);
  }
  const cf = req?.headers?.["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) return normalizeIp(cf);
  const rip = req?.ip || req?.connection?.remoteAddress || req?.socket?.remoteAddress;
  return normalizeIp(rip || "");
}

async function getCineDocForAuthEmail(authEmail: string) {
  const snap = await db
    .collection("cines")
    .where("authEmail", "==", authEmail)
    .limit(1)
    .get();

  if (snap.empty) {
    throw new HttpsError(
      "failed-precondition",
      "El cine no está configurado en /cines/{cineId}."
    );
  }

  const doc = snap.docs[0];
  return { cineId: doc.id, ref: doc.ref, data: doc.data() as any };
}

function ipDocId(ip: string) {
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

function attemptDocId(ip: string) {
  return ipDocId(ip);
}

function nowTs() {
  return admin.firestore.Timestamp.now();
}

function addMinutes(ts: admin.firestore.Timestamp, minutes: number) {
  return admin.firestore.Timestamp.fromMillis(ts.toMillis() + minutes * 60 * 1000);
}

async function getAuthorizedIpDoc(cineId: string, ip: string) {
  const ipsCol = db.collection("cines").doc(cineId).collection("authorizedIps");
  const q = await ipsCol.where("ip", "==", ip).limit(1).get();
  return q.empty ? null : q.docs[0];
}

function isIpActiveAndNotExpired(data: any, now: admin.firestore.Timestamp) {
  if (!data) return false;
  if (data.active === false) return false;
  if (data.expiresAt && data.expiresAt.toMillis && data.expiresAt.toMillis() <= now.toMillis()) {
    return false;
  }
  return true;
}

async function checkAndUpdateIpAttempt({
  cineId,
  ip,
  ok,
}: {
  cineId: string;
  ip: string;
  ok: boolean;
}) {
  const ref = db
    .collection("cines")
    .doc(cineId)
    .collection("ipAttempts")
    .doc(attemptDocId(ip));

  const now = nowTs();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as any) : null;

    const blockedUntil = data?.blockedUntil as admin.firestore.Timestamp | null | undefined;
    if (blockedUntil && blockedUntil.toMillis() > now.toMillis()) {
      throw new HttpsError(
        "resource-exhausted",
        `IP bloqueada temporalmente. Probá de nuevo más tarde.`
      );
    }

    if (ok) {
      if (snap.exists) tx.delete(ref);
      return;
    }

    const failedCount = Number(data?.failedCount ?? 0) + 1;
    const firstFailedAt = (data?.firstFailedAt as admin.firestore.Timestamp | null) ?? now;

    let nextBlockedUntil: admin.firestore.Timestamp | null = null;
    if (failedCount >= SECURITY.pinMaxFailedAttempts) {
      nextBlockedUntil = addMinutes(now, SECURITY.pinBlockMinutes);
    }

    tx.set(
      ref,
      {
        ip,
        failedCount,
        firstFailedAt,
        lastFailedAt: now,
        blockedUntil: nextBlockedUntil,
        updatedAt: now,
      },
      { merge: true }
    );
  });
}

export const checkIpAccess = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "No autenticado.");
  }

  const email = String(request.auth.token.email || "").trim().toLowerCase();
  if (!email) {
    throw new HttpsError("failed-precondition", "Email no disponible.");
  }

  const req = request.rawRequest as any;
  const ip = getRequestIp(req);
  if (!ip) {
    throw new HttpsError("failed-precondition", "No se pudo obtener la IP.");
  }

  const cine = await getCineDocForAuthEmail(email);
  const nombre = cine.data?.nombre ?? null;

  if (cine.cineId === "parquebrown" || email.includes("parquebrown")) {
    return {
      authorized: true,
      ip,
      cineId: cine.cineId,
      nombre,
    };
  }

  if (cine.data?.active === false) {
    throw new HttpsError("permission-denied", "Cine inactivo.");
  }

  const now = nowTs();
  const ipDoc = await getAuthorizedIpDoc(cine.cineId, ip);
  if (ipDoc) {
    const data = ipDoc.data() as any;
    if (isIpActiveAndNotExpired(data, now)) {
      await ipDoc.ref.set(
        {
          lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        authorized: true,
        ip,
        cineId: cine.cineId,
        nombre,
      };
    }
  }

  return {
    authorized: false,
    ip,
    cineId: cine.cineId,
    nombre,
  };
});

export const authorizeCurrentIp = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "No autenticado.");
  }

  const email = String(request.auth.token.email || "").trim().toLowerCase();
  if (!email) {
    throw new HttpsError("failed-precondition", "Email no disponible.");
  }

  const pin = String((request.data as any)?.pin ?? "").trim();
  const label = String((request.data as any)?.label ?? "").trim();

  if (!pin) {
    throw new HttpsError("invalid-argument", "PIN requerido.");
  }
  if (!label) {
    throw new HttpsError("invalid-argument", "Label requerido.");
  }

  const req = request.rawRequest as any;
  const ip = getRequestIp(req);
  if (!ip) {
    throw new HttpsError("failed-precondition", "No se pudo obtener la IP.");
  }

  const cine = await getCineDocForAuthEmail(email);
  const storedPin = String(cine.data?.accessPin ?? "").trim();

  if (cine.data?.active === false) {
    throw new HttpsError("permission-denied", "Cine inactivo.");
  }

  if (!storedPin) {
    throw new HttpsError(
      "failed-precondition",
      "El cine no tiene accessPin configurado."
    );
  }

  if (pin !== storedPin) {
    await checkAndUpdateIpAttempt({ cineId: cine.cineId, ip, ok: false });
    throw new HttpsError("permission-denied", "PIN incorrecto.");
  }

  await checkAndUpdateIpAttempt({ cineId: cine.cineId, ip, ok: true });

  const ipsCol = db.collection("cines").doc(cine.cineId).collection("authorizedIps");
  const docId = ipDocId(ip);
  const ref = ipsCol.doc(docId);
  const snap = await ref.get();

  // Detectar tipo de dispositivo
  const deviceType = detectDeviceType(req);

  const now = admin.firestore.Timestamp.now();

  // Si es móvil: expira en 7 días
  // Si es desktop/PC: sin expiración (null o fecha muy lejana)
  const expiresAt = deviceType === 'mobile'
    ? addMinutes(now, SECURITY.mobileIpTtlMinutes)
    : null;  // null = sin expiración

  const base = {
    ip,
    label,
    type: deviceType,
    active: true,
    expiresAt,
    lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: request.auth.uid,
    createdByEmail: email,
  };

  if (snap.exists) {
    await ref.set(base, { merge: true });
  } else {
    await ref.set({
      ...base,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return { authorized: true, ip, cineId: cine.cineId };
});

export const adminListCines = onCall(async (request) => {
  requireAdmin(request);

  const query = String((request.data as any)?.query ?? "").trim().toLowerCase();
  const limit = Math.min(200, Math.max(1, Number((request.data as any)?.limit ?? 100)));

  const snap = await db.collection("cines").orderBy("createdAt", "desc").limit(limit).get();

  const items = snap.docs
    .map((d) => {
      const data = d.data() as any;
      return {
        cineId: d.id,
        nombre: data.nombre ?? "",
        authEmail: data.authEmail ?? "",
        active: data.active !== false,
        createdAt: data.createdAt ?? null,
        updatedAt: data.updatedAt ?? null,
        authUid: data.authUid ?? null,
      };
    })
    .filter((it) => {
      if (!query) return true;
      return (
        it.cineId.toLowerCase().includes(query) ||
        String(it.nombre || "").toLowerCase().includes(query) ||
        String(it.authEmail || "").toLowerCase().includes(query)
      );
    });

  return { items };
});

export const adminCreateCine = onCall(async (request) => {
  requireAdmin(request);

  const cineId = normalizeCineId((request.data as any)?.cineId);
  const nombre = String((request.data as any)?.nombre ?? "").trim();
  const authEmailRaw = String((request.data as any)?.authEmail ?? "").trim();
  const initialPassword = String((request.data as any)?.initialPassword ?? "");
  const accessPin = String((request.data as any)?.accessPin ?? "").trim();
  const active = (request.data as any)?.active !== false;
  const salasCount = Math.max(0, parseInt(String((request.data as any)?.salasCount ?? "0")) || 0);
  const initialIps = Array.isArray((request.data as any)?.initialIps)
    ? ((request.data as any)?.initialIps as any[])
    : [];

  if (!cineId) throw new HttpsError("invalid-argument", "cineId requerido.");
  if (!nombre) throw new HttpsError("invalid-argument", "nombre requerido.");
  if (!accessPin) throw new HttpsError("invalid-argument", "PIN requerido.");
  if (!initialPassword || initialPassword.length < 8) {
    throw new HttpsError(
      "invalid-argument",
      "La contraseña inicial debe tener al menos 8 caracteres."
    );
  }

  let authEmail = normalizeEmail(authEmailRaw);
  if (!authEmail) {
    authEmail = `${cineId}@${APP_AUTH_DOMAIN}`;
  }
  if (!authEmail.includes("@")) {
    throw new HttpsError("invalid-argument", "authEmail inválido.");
  }

  const cineRef = db.collection("cines").doc(cineId);
  const existingCine = await cineRef.get();
  if (existingCine.exists) {
    throw new HttpsError("already-exists", "Ese cineId ya existe.");
  }

  try {
    await admin.auth().getUserByEmail(authEmail);
    throw new HttpsError("already-exists", "Ese email ya está en uso.");
  } catch (e: any) {
    if (String(e?.code || "") !== "auth/user-not-found") {
      if (e instanceof HttpsError) throw e;
    }
  }

  const now = admin.firestore.FieldValue.serverTimestamp();

  const userRecord = await admin.auth().createUser({
    email: authEmail,
    password: initialPassword,
    displayName: nombre,
    disabled: !active,
  });

  await admin.auth().setCustomUserClaims(userRecord.uid, {
    role: "cine",
    cineId,
  });

  await cineRef.set({
    cineId,
    nombre,
    authEmail,
    authUid: userRecord.uid,
    active,
    accessPin,
    createdAt: now,
    updatedAt: now,
    createdBy: request.auth?.uid ?? null,
  });

  // Crear documento de configuración en /cines/{cineId}/info/config
  await cineRef.collection("info").doc("config").set({
    authEmail,
    nombre,
    salasCount,
    updatedAt: now,
  });

  const ipsCol = cineRef.collection("authorizedIps");
  for (const raw of initialIps) {
    const ip = normalizeIp(String(raw?.ip ?? raw ?? ""));
    if (!ip) continue;

    const type = raw?.type === "mobile" ? "mobile" : "fixed";
    const label = String(raw?.label ?? "Inicial").trim() || "Inicial";

    await ipsCol.doc(ipDocId(ip)).set({
      ip,
      label,
      type,
      createdAt: now,
      createdBy: request.auth?.uid ?? null,
      expiresAt: null,
      lastUsedAt: null,
      active: true,
    });
  }

  return {
    ok: true,
    cineId,
    authUid: userRecord.uid,
    authEmail,
  };
});

export const adminUpdateCine = onCall(async (request) => {
  requireAdmin(request);

  const cineId = normalizeCineId((request.data as any)?.cineId);
  if (!cineId) throw new HttpsError("invalid-argument", "cineId requerido.");

  const cineRef = db.collection("cines").doc(cineId);
  const snap = await cineRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Cine no encontrado.");

  const existing = snap.data() as any;

  const patch: any = {};
  if ((request.data as any)?.nombre != null) {
    const nombre = String((request.data as any)?.nombre ?? "").trim();
    if (!nombre) throw new HttpsError("invalid-argument", "nombre inválido.");
    patch.nombre = nombre;
  }

  if ((request.data as any)?.accessPin != null) {
    const accessPin = String((request.data as any)?.accessPin ?? "").trim();
    if (!accessPin) throw new HttpsError("invalid-argument", "PIN inválido.");
    patch.accessPin = accessPin;
  }

  if ((request.data as any)?.active != null) {
    patch.active = (request.data as any)?.active !== false;
  }

  let nextAuthEmail: string | null = null;
  if ((request.data as any)?.authEmail != null) {
    const authEmail = normalizeEmail((request.data as any)?.authEmail);
    if (!authEmail || !authEmail.includes("@")) {
      throw new HttpsError("invalid-argument", "authEmail inválido.");
    }
    nextAuthEmail = authEmail;
    patch.authEmail = authEmail;
  }

  patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();

  await cineRef.set(patch, { merge: true });

  const uid = existing?.authUid as string | undefined;
  if (uid) {
    const authPatch: any = {};
    if (nextAuthEmail) authPatch.email = nextAuthEmail;
    if (patch.active != null) authPatch.disabled = !patch.active;
    if (patch.nombre) authPatch.displayName = patch.nombre;
    if (Object.keys(authPatch).length) {
      await admin.auth().updateUser(uid, authPatch);
    }
  }

  return { ok: true };
});

export const changeCinemaPassword = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "No autenticado.");
  }

  const email = String(request.auth.token.email || "").trim().toLowerCase();
  if (!email) {
    throw new HttpsError("failed-precondition", "Email no disponible.");
  }

  const pin = String((request.data as any)?.pin ?? "").trim();
  const newPassword = String((request.data as any)?.newPassword ?? "");

  if (!pin) throw new HttpsError("invalid-argument", "PIN requerido.");
  if (!newPassword || newPassword.length < 6) {
    throw new HttpsError(
      "invalid-argument",
      "La nueva contraseña debe tener al menos 6 caracteres."
    );
  }

  const req = request.rawRequest as any;
  const ip = getRequestIp(req);
  if (!ip) {
    throw new HttpsError("failed-precondition", "No se pudo obtener la IP.");
  }

  const cine = await getCineDocForAuthEmail(email);
  const storedPin = String(cine.data?.accessPin ?? "").trim();

  if (cine.data?.active === false) {
    throw new HttpsError("permission-denied", "Cine inactivo.");
  }

  if (!storedPin) {
    throw new HttpsError(
      "failed-precondition",
      "El cine no tiene accessPin configurado."
    );
  }

  if (pin !== storedPin) {
    await checkAndUpdateIpAttempt({ cineId: cine.cineId, ip, ok: false });
    throw new HttpsError("permission-denied", "PIN incorrecto.");
  }

  await checkAndUpdateIpAttempt({ cineId: cine.cineId, ip, ok: true });

  const uid = String(cine.data?.authUid ?? "").trim();
  if (!uid) {
    throw new HttpsError(
      "failed-precondition",
      "El cine no tiene authUid configurado."
    );
  }

  await admin.auth().updateUser(uid, { password: newPassword });
  return { ok: true, message: "Contraseña actualizada." };
});

export const updateProyeccionPin = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "No autenticado.");
  }

  const email = String(request.auth.token.email || "").trim().toLowerCase();
  if (!email) {
    throw new HttpsError("failed-precondition", "Email no disponible.");
  }

  const pin = String((request.data as any)?.pin ?? "").trim();
  const proyeccionPin = String((request.data as any)?.proyeccionPin ?? "").trim();

  if (!pin) throw new HttpsError("invalid-argument", "PIN maestro requerido.");

  const req = request.rawRequest as any;
  const ip = getRequestIp(req);
  if (!ip) {
    throw new HttpsError("failed-precondition", "No se pudo obtener la IP.");
  }

  const cine = await getCineDocForAuthEmail(email);
  const storedPin = String(cine.data?.accessPin ?? "").trim();

  if (cine.data?.active === false) {
    throw new HttpsError("permission-denied", "Cine inactivo.");
  }

  if (!storedPin) {
    throw new HttpsError(
      "failed-precondition",
      "El cine no tiene accessPin configurado."
    );
  }

  if (pin !== storedPin) {
    await checkAndUpdateIpAttempt({ cineId: cine.cineId, ip, ok: false });
    throw new HttpsError("permission-denied", "PIN incorrecto.");
  }

  await checkAndUpdateIpAttempt({ cineId: cine.cineId, ip, ok: true });

  // Update proyeccionPin in /cines/{cineId}/info/config
  const configRef = db.collection("cines").doc(cine.cineId).collection("info").doc("config");
  await configRef.set(
    {
      proyeccionPin: proyeccionPin,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true, message: "PIN de proyección actualizado." };
});

export const adminChangeCinePassword = onCall(async (request) => {
  requireAdmin(request);

  const cineId = normalizeCineId((request.data as any)?.cineId);
  const newPassword = String((request.data as any)?.newPassword ?? "").trim();

  if (!cineId) throw new HttpsError("invalid-argument", "cineId requerido.");
  if (!newPassword || newPassword.length < 8) {
    throw new HttpsError(
      "invalid-argument",
      "La nueva contraseña debe tener al menos 8 caracteres."
    );
  }

  const cineRef = db.collection("cines").doc(cineId);
  const cineSnap = await cineRef.get();

  if (!cineSnap.exists) {
    throw new HttpsError("not-found", "Cine no encontrado.");
  }

  const cineData = cineSnap.data() as any;
  const uid = String(cineData?.authUid ?? "").trim();

  if (!uid) {
    throw new HttpsError(
      "failed-precondition",
      "El cine no tiene authUid configurado."
    );
  }

  await admin.auth().updateUser(uid, { password: newPassword });

  return { ok: true, message: "Contraseña actualizada exitosamente." };
});

export const adminSetOficinasRole = onCall(async (request) => {
  requireAdmin(request);

  const cineId = normalizeCineId((request.data as any)?.cineId);

  if (!cineId) throw new HttpsError("invalid-argument", "cineId requerido.");

  const cineRef = db.collection("cines").doc(cineId);
  const cineSnap = await cineRef.get();

  if (!cineSnap.exists) {
    throw new HttpsError("not-found", "Cine no encontrado.");
  }

  const cineData = cineSnap.data() as any;
  const uid = String(cineData?.authUid ?? "").trim();

  if (!uid) {
    throw new HttpsError(
      "failed-precondition",
      "El cine no tiene authUid configurado."
    );
  }

  await admin.auth().setCustomUserClaims(uid, {
    role: "oficinas",
    cineId: null,
  });

  return { ok: true, message: `Usuario ${cineId} convertido a rol oficinas.` };
});

export const adminListAuthorizedIps = onCall(async (request) => {
  requireAdmin(request);
  const cineId = normalizeCineId((request.data as any)?.cineId);
  if (!cineId) throw new HttpsError("invalid-argument", "cineId requerido.");

  const snap = await db
    .collection("cines")
    .doc(cineId)
    .collection("authorizedIps")
    .orderBy("createdAt", "desc")
    .limit(300)
    .get();

  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  return { items };
});

export const adminUpsertAuthorizedIp = onCall(async (request) => {
  requireAdmin(request);
  const cineId = normalizeCineId((request.data as any)?.cineId);
  const ip = normalizeIp((request.data as any)?.ip);
  const label = String((request.data as any)?.label ?? "").trim();
  const type = (request.data as any)?.type === "mobile" ? "mobile" : "fixed";
  const active = (request.data as any)?.active !== false;
  const expiresAtMinutes = Number((request.data as any)?.expiresAtMinutes ?? 0);

  if (!cineId) throw new HttpsError("invalid-argument", "cineId requerido.");
  if (!ip) throw new HttpsError("invalid-argument", "IP requerida.");
  if (!label) throw new HttpsError("invalid-argument", "Label requerido.");

  const now = nowTs();
  const expiresAt =
    type === "mobile" && expiresAtMinutes > 0 ? addMinutes(now, expiresAtMinutes) : null;

  const ref = db
    .collection("cines")
    .doc(cineId)
    .collection("authorizedIps")
    .doc(ipDocId(ip));

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const base: any = {
      ip,
      label,
      type,
      active,
      expiresAt,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: request.auth?.uid ?? null,
    };
    if (!snap.exists) {
      base.createdAt = admin.firestore.FieldValue.serverTimestamp();
      base.createdBy = request.auth?.uid ?? null;
    }
    tx.set(ref, base, { merge: true });
  });

  return { ok: true };
});

export const adminRemoveAuthorizedIp = onCall(async (request) => {
  requireAdmin(request);
  const cineId = normalizeCineId((request.data as any)?.cineId);
  const ip = normalizeIp((request.data as any)?.ip);
  if (!cineId) throw new HttpsError("invalid-argument", "cineId requerido.");
  if (!ip) throw new HttpsError("invalid-argument", "IP requerida.");

  const ref = db
    .collection("cines")
    .doc(cineId)
    .collection("authorizedIps")
    .doc(ipDocId(ip));

  await ref.delete();
  return { ok: true };
});

export const cleanupExpiredMobileIps = onSchedule("every 6 hours", async () => {
  const now = nowTs();
  const q = await db
    .collectionGroup("authorizedIps")
    .where("type", "==", "mobile")
    .where("active", "==", true)
    .where("expiresAt", "<=", now)
    .limit(500)
    .get();

  if (q.empty) return;

  const batch = db.batch();
  for (const doc of q.docs) {
    batch.set(doc.ref, { active: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }
  await batch.commit();
});

export const getOficinasEventos = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "No autenticado.");
  }

  const token = request.auth.token as any;
  if (token?.role !== "oficinas") {
    throw new HttpsError("permission-denied", "Requiere rol oficinas.");
  }

  const startDate = (request.data as any)?.startDate;
  const endDate = (request.data as any)?.endDate;

  if (!startDate || !endDate) {
    throw new HttpsError("invalid-argument", "startDate y endDate requeridos.");
  }

  const start = admin.firestore.Timestamp.fromMillis(startDate);
  const end = admin.firestore.Timestamp.fromMillis(endDate);

  console.log("📅 getOficinasEventos - Rango:", { start: start.toDate(), end: end.toDate() });

  const cinesSnap = await db
    .collection("cines")
    .get();

  console.log("🏢 Total cines encontrados:", cinesSnap.size);

  const eventos: any[] = [];
  const MAX_EVENTOS_POR_CINE = 100;

  for (const cineDoc of cinesSnap.docs) {
    const cineId = cineDoc.id;
    const cineData = cineDoc.data();
    const cineNombre = cineData.nombre || cineId;

    if (cineId === "oficinas" || cineId === "cinemarkproyecto") {
      continue;
    }

    const eventosCol = db.collection("cines").doc(cineId).collection("eventos");
    const q = eventosCol
      .where("diaHora", ">=", start)
      .where("diaHora", "<=", end)
      .orderBy("diaHora", "asc")
      .limit(MAX_EVENTOS_POR_CINE);

    const eventosSnap = await q.get();

    console.log(`🎬 ${cineId}: ${eventosSnap.size} eventos`);

    eventosSnap.forEach((eventoDoc) => {
      const data = eventoDoc.data();
      eventos.push({
        id: eventoDoc.id,
        cineId,
        cineNombre,
        pelicula: data.pelicula || "",
        sala: data.sala || "",
        diaHora: data.diaHora.toMillis(),
        kdm: !!data.kdm,
        dcp: !!data.dcp,
        desayuno: !!data.desayuno,
        combo: !!data.combo,
      });
    });
  }

  console.log("✅ Total eventos retornados:", eventos.length);

  return { eventos, count: eventos.length };
});

// ─── Helper: enviar email de alerta de bajo stock ────────────────────────────

async function enviarEmailBajoStock({
  quimicoNombre,
  cineNombre,
  totalLitros,
  stockMinimo,
  gmailPassword,
}: {
  quimicoNombre: string;
  cineNombre: string;
  totalLitros: number;
  stockMinimo: number;
  gmailPassword: string;
}) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: gmailPassword,
    },
  });

  const subject = `⚠️ Bajo stock: ${quimicoNombre} (${cineNombre})`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #DC2626; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="color: white; margin: 0;">⚠️ Alerta de Bajo Stock</h2>
      </div>
      <div style="background: #FFF5F5; border: 1px solid #FCA5A5; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; color: #1E293B; margin-bottom: 16px;">
          El químico <strong>${quimicoNombre}</strong> está por debajo del umbral de stock mínimo.
        </p>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #E2E8F0;">
          <tr style="background: #F8FAFC;">
            <td style="padding: 12px 16px; font-weight: bold; color: #475569; border-bottom: 1px solid #E2E8F0;">Cine</td>
            <td style="padding: 12px 16px; color: #1E293B; border-bottom: 1px solid #E2E8F0;">${cineNombre}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-weight: bold; color: #475569; border-bottom: 1px solid #E2E8F0;">Químico</td>
            <td style="padding: 12px 16px; color: #1E293B; border-bottom: 1px solid #E2E8F0;">${quimicoNombre}</td>
          </tr>
          <tr style="background: #FFF5F5;">
            <td style="padding: 12px 16px; font-weight: bold; color: #DC2626; border-bottom: 1px solid #E2E8F0;">Stock actual</td>
            <td style="padding: 12px 16px; font-size: 20px; font-weight: bold; color: #DC2626; border-bottom: 1px solid #E2E8F0;">${totalLitros.toLocaleString("es-AR")} L</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-weight: bold; color: #475569;">Stock mínimo configurado</td>
            <td style="padding: 12px 16px; color: #1E293B;">${stockMinimo.toLocaleString("es-AR")} L</td>
          </tr>
        </table>
        <p style="margin-top: 20px; font-size: 13px; color: #64748B;">
          Este mensaje fue enviado automáticamente desde el sistema de gestión de químicos.
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"Sistema Químicos" <${GMAIL_USER}>`,
    to: ALERTA_EMAIL,
    subject,
    html,
  });
}

// ─── Cloud Function: notificarBajoStockQuimico ────────────────────────────────
// Callable desde el cliente: se dispara cuando se consume un vencimiento.
// Verifica el total actual del químico contra su stockMinimo y envía email si aplica.

export const notificarBajoStockQuimico = onCall(
  { secrets: [GMAIL_PASSWORD] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "No autenticado.");
    }

    const cineId = String((request.data as any)?.cineId ?? "").trim();
    const quimicoId = String((request.data as any)?.quimicoId ?? "").trim();

    if (!cineId) throw new HttpsError("invalid-argument", "cineId requerido.");
    if (!quimicoId) throw new HttpsError("invalid-argument", "quimicoId requerido.");

    // Leer el documento del químico para obtener nombre y stockMinimo
    const quimicoRef = db.collection("cines").doc(cineId).collection("quimicos").doc(quimicoId);
    const quimicoSnap = await quimicoRef.get();

    if (!quimicoSnap.exists) {
      throw new HttpsError("not-found", "Químico no encontrado.");
    }

    const quimicoData = quimicoSnap.data() as any;
    const stockMinimo = quimicoData?.stockMinimo;

    // Si no tiene umbral configurado, no hacemos nada
    if (stockMinimo === undefined || stockMinimo === null) {
      return { enviado: false, motivo: "Sin umbral configurado." };
    }

    const stockMinimoNum = Number(stockMinimo);
    if (isNaN(stockMinimoNum) || stockMinimoNum <= 0) {
      return { enviado: false, motivo: "Umbral inválido o 0." };
    }

    // Sumar todos los litros de los vencimientos activos
    const vencSnap = await quimicoRef.collection("vencimientos").get();
    const totalLitros = vencSnap.docs.reduce((sum, d) => {
      return sum + Number((d.data() as any)?.litros ?? 0);
    }, 0);

    // Verificar si está por debajo o igual al umbral
    if (totalLitros > stockMinimoNum) {
      return { enviado: false, motivo: `Stock OK: ${totalLitros} L > ${stockMinimoNum} L.` };
    }

    // Obtener nombre del cine para el email
    const cineSnap = await db.collection("cines").doc(cineId).get();
    const cineNombre = (cineSnap.data() as any)?.nombre ?? cineId;
    const quimicoNombre = quimicoData?.nombre ?? quimicoId;

    const gmailPassword = GMAIL_PASSWORD.value();
    if (!gmailPassword) {
      throw new HttpsError("internal", "GMAIL_PASSWORD no configurado.");
    }

    try {
      await enviarEmailBajoStock({
        quimicoNombre,
        cineNombre,
        totalLitros,
        stockMinimo: stockMinimoNum,
        gmailPassword,
      });
      console.log(`📧 Email de bajo stock enviado para ${quimicoNombre} (${cineId}): ${totalLitros} L <= ${stockMinimoNum} L`);
      return {
        enviado: true,
        quimicoNombre,
        totalLitros,
        stockMinimo: stockMinimoNum,
      };
    } catch (emailError: any) {
      console.error("Error al enviar email de bajo stock:", emailError);
      return {
        enviado: false,
        error: "No se pudo enviar el correo de alerta. Revisar credenciales SMTP.",
        detalle: emailError?.message
      };
    }
  }
);

// ─── Helper: enviar email de vencimientos próximos ────────────────────────────

async function enviarEmailVencimientosProximos({
  cineNombre,
  items,
  gmailPassword,
}: {
  cineNombre: string;
  items: { quimicoNombre: string; fecha: string; litros: number }[];
  gmailPassword: string;
}) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: gmailPassword,
    },
  });

  const subject = `⚠️ Vencimientos de Químicos: ${cineNombre}`;

  const rows = items
    .map((it) => {
      let fechaFormateada = it.fecha;
      if (it.fecha) {
        const parts = it.fecha.split("-");
        if (parts.length === 3) {
          fechaFormateada = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }

      return `
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 12px 16px; color: #1E293B; font-weight: bold;">${it.quimicoNombre}</td>
        <td style="padding: 12px 16px; color: #DC2626; font-weight: bold;">${fechaFormateada}</td>
        <td style="padding: 12px 16px; color: #475569; font-weight: bold;">${it.litros.toLocaleString("es-AR")} L</td>
      </tr>
    `;
    })
    .join("");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #EA580C; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="color: white; margin: 0;">⏳ Alerta de Vencimiento de Químicos</h2>
      </div>
      <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; color: #1E293B; margin-bottom: 16px;">
          Se detectaron los siguientes químicos que están por vencer en menos de 1 mes o ya están vencidos en <strong>${cineNombre}</strong>:
        </p>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #E2E8F0;">
          <thead>
            <tr style="background: #F8FAFC; border-bottom: 1px solid #E2E8F0; text-align: left;">
              <th style="padding: 12px 16px; font-weight: bold; color: #475569;">Químico</th>
              <th style="padding: 12px 16px; font-weight: bold; color: #475569;">Vencimiento</th>
              <th style="padding: 12px 16px; font-weight: bold; color: #475569;">Litros</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <p style="margin-top: 20px; font-size: 13px; color: #64748B;">
          Este control se realiza automáticamente cada 15 días. Por favor verifique el stock físico en el cine.
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"Control de Vencimientos" <${GMAIL_USER}>`,
    to: ALERTA_EMAIL,
    subject,
    html,
  });
}

// ─── Cloud Function: verificarVencimientosQuimicos ────────────────────────────
// Cron programado para ejecutarse cada 15 días.
// Busca lotes con litros > 0 cuyo vencimiento sea <= 30 días en el futuro y envía alertas.

export const verificarVencimientosQuimicos = onSchedule(
  {
    schedule: "0 9 */15 * *",
    secrets: [GMAIL_PASSWORD],
  },
  async (event) => {
    const gmailPassword = GMAIL_PASSWORD.value();
    if (!gmailPassword) {
      console.error("GMAIL_PASSWORD no configurado.");
      return;
    }

    const today = new Date();
    const limitDate = new Date();
    limitDate.setDate(today.getDate() + 30); // 30 días o 1 mes

    const limitStr = limitDate.toISOString().split("T")[0]; // YYYY-MM-DD

    const cinesSnap = await db.collection("cines").get();

    for (const cineDoc of cinesSnap.docs) {
      const cineId = cineDoc.id;
      const cineNombre = cineDoc.data().nombre || cineId;

      // Omitir oficinas o usuarios especiales
      if (cineId === "oficinas" || cineId === "cinemarkproyecto") {
        continue;
      }

      const quimicosSnap = await db.collection("cines").doc(cineId).collection("quimicos").get();
      const expiringItems: { quimicoNombre: string; fecha: string; litros: number }[] = [];

      for (const quimicoDoc of quimicosSnap.docs) {
        const quimicoData = quimicoDoc.data();
        const quimicoNombre = quimicoData.nombre || quimicoDoc.id;

        // Consultar vencimientos de este químico con litros > 0
        const vencimientosSnap = await db
          .collection("cines")
          .doc(cineId)
          .collection("quimicos")
          .doc(quimicoDoc.id)
          .collection("vencimientos")
          .where("litros", ">", 0)
          .get();

        vencimientosSnap.forEach((vDoc) => {
          const vData = vDoc.data();
          const fecha = vData.fecha || "";
          if (fecha && fecha <= limitStr) {
            expiringItems.push({
              quimicoNombre,
              fecha,
              litros: Number(vData.litros || 0),
            });
          }
        });
      }

      if (expiringItems.length > 0) {
        // Ordenar vencimientos por fecha (los más viejos o vencidos primero)
        expiringItems.sort((a, b) => a.fecha.localeCompare(b.fecha));

        try {
          await enviarEmailVencimientosProximos({
            cineNombre,
            items: expiringItems,
            gmailPassword,
          });
          console.log(`📧 Alerta de vencimientos enviada para ${cineNombre}: ${expiringItems.length} lotes detectados.`);
        } catch (err) {
          console.error(`Error al enviar email de vencimientos para ${cineNombre}:`, err);
        }
      }
    }
  }
);

// ─── Helper: enviar email de alerta de bajo stock para productos ─────────────

async function enviarEmailBajoStockProducto({
  productoNombre,
  cineNombre,
  totalCantidad,
  stockMinimo,
  gmailPassword,
}: {
  productoNombre: string;
  cineNombre: string;
  totalCantidad: number;
  stockMinimo: number;
  gmailPassword: string;
}) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: gmailPassword,
    },
  });

  const subject = `⚠️ Bajo stock: ${productoNombre} (${cineNombre})`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #DC2626; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="color: white; margin: 0;">⚠️ Alerta de Bajo Stock</h2>
      </div>
      <div style="background: #FFF5F5; border: 1px solid #FCA5A5; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; color: #1E293B; margin-bottom: 16px;">
          El producto <strong>${productoNombre}</strong> está por debajo del umbral de stock mínimo.
        </p>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #E2E8F0;">
          <tr style="background: #F8FAFC;">
            <td style="padding: 12px 16px; font-weight: bold; color: #475569; border-bottom: 1px solid #E2E8F0;">Cine</td>
            <td style="padding: 12px 16px; color: #1E293B; border-bottom: 1px solid #E2E8F0;">${cineNombre}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-weight: bold; color: #475569; border-bottom: 1px solid #E2E8F0;">Producto</td>
            <td style="padding: 12px 16px; color: #1E293B; border-bottom: 1px solid #E2E8F0;">${productoNombre}</td>
          </tr>
          <tr style="background: #FFF5F5;">
            <td style="padding: 12px 16px; font-weight: bold; color: #DC2626; border-bottom: 1px solid #E2E8F0;">Stock actual</td>
            <td style="padding: 12px 16px; font-size: 20px; font-weight: bold; color: #DC2626; border-bottom: 1px solid #E2E8F0;">${totalCantidad.toLocaleString("es-AR")} U</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-weight: bold; color: #475569;">Stock mínimo configurado</td>
            <td style="padding: 12px 16px; color: #1E293B;">${stockMinimo.toLocaleString("es-AR")} U</td>
          </tr>
        </table>
        <p style="margin-top: 20px; font-size: 13px; color: #64748B;">
          Este mensaje fue enviado automáticamente desde el sistema de gestión de productos.
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"Sistema Productos" <${GMAIL_USER}>`,
    to: ALERTA_EMAIL,
    subject,
    html,
  });
}

// ─── Cloud Function: notificarBajoStockProducto ────────────────────────────────

export const notificarBajoStockProducto = onCall(
  { secrets: [GMAIL_PASSWORD] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "No autenticado.");
    }

    const cineId = String((request.data as any)?.cineId ?? "").trim();
    const productoId = String((request.data as any)?.productoId ?? "").trim();

    if (!cineId) throw new HttpsError("invalid-argument", "cineId requerido.");
    if (!productoId) throw new HttpsError("invalid-argument", "productoId requerido.");

    // Leer el documento del producto para obtener nombre y stockMinimo
    const productoRef = db.collection("cines").doc(cineId).collection("productos").doc(productoId);
    const productoSnap = await productoRef.get();

    if (!productoSnap.exists) {
      throw new HttpsError("not-found", "Producto no encontrado.");
    }

    const productoData = productoSnap.data() as any;
    const stockMinimo = productoData?.stockMinimo;

    // Si no tiene umbral configurado, no hacemos nada
    if (stockMinimo === undefined || stockMinimo === null) {
      return { enviado: false, motivo: "Sin umbral configurado." };
    }

    const stockMinimoNum = Number(stockMinimo);
    if (isNaN(stockMinimoNum) || stockMinimoNum <= 0) {
      return { enviado: false, motivo: "Umbral inválido o 0." };
    }

    // Sumar todas las cantidades de los vencimientos activos
    const vencSnap = await productoRef.collection("vencimientos").get();
    const totalCantidad = vencSnap.docs.reduce((sum, d) => {
      return sum + Number((d.data() as any)?.cantidad ?? 0);
    }, 0);

    // Verificar si está por debajo o igual al umbral
    if (totalCantidad > stockMinimoNum) {
      return { enviado: false, motivo: `Stock OK: ${totalCantidad} U > ${stockMinimoNum} U.` };
    }

    // Obtener nombre del cine para el email
    const cineSnap = await db.collection("cines").doc(cineId).get();
    const cineNombre = (cineSnap.data() as any)?.nombre ?? cineId;
    const productoNombre = productoData?.nombre ?? productoId;

    const gmailPassword = GMAIL_PASSWORD.value();
    if (!gmailPassword) {
      throw new HttpsError("internal", "GMAIL_PASSWORD no configurado.");
    }

    try {
      await enviarEmailBajoStockProducto({
        productoNombre,
        cineNombre,
        totalCantidad,
        stockMinimo: stockMinimoNum,
        gmailPassword,
      });
      console.log(`📧 Email de bajo stock enviado para ${productoNombre} (${cineId}): ${totalCantidad} U <= ${stockMinimoNum} U`);
      return {
        enviado: true,
        productoNombre,
        totalCantidad,
        stockMinimo: stockMinimoNum,
      };
    } catch (emailError: any) {
      console.error("Error al enviar email de bajo stock de producto:", emailError);
      return {
        enviado: false,
        error: "No se pudo enviar el correo de alerta. Revisar credenciales SMTP.",
        detalle: emailError?.message
      };
    }
  }
);

// ─── Helper: enviar email de vencimientos próximos para productos ─────────────

async function enviarEmailVencimientosProximosProductos({
  cineNombre,
  items,
  gmailPassword,
}: {
  cineNombre: string;
  items: { productoNombre: string; fecha: string; cantidad: number }[];
  gmailPassword: string;
}) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: gmailPassword,
    },
  });

  const subject = `⚠️ Vencimientos de Productos: ${cineNombre}`;

  const rows = items
    .map((it) => {
      let fechaFormateada = it.fecha;
      if (it.fecha) {
        const parts = it.fecha.split("-");
        if (parts.length === 3) {
          fechaFormateada = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }

      return `
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 12px 16px; color: #1E293B; font-weight: bold;">${it.productoNombre}</td>
        <td style="padding: 12px 16px; color: #DC2626; font-weight: bold;">${fechaFormateada}</td>
        <td style="padding: 12px 16px; color: #475569; font-weight: bold;">${it.cantidad.toLocaleString("es-AR")} U</td>
      </tr>
    `;
    })
    .join("");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #EA580C; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="color: white; margin: 0;">⏳ Alerta de Vencimiento de Productos</h2>
      </div>
      <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; color: #1E293B; margin-bottom: 16px;">
          Se detectaron los siguientes productos que están por vencer en menos de 1 mes o ya están vencidos en <strong>${cineNombre}</strong>:
        </p>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #E2E8F0;">
          <thead>
            <tr style="background: #F8FAFC; border-bottom: 1px solid #E2E8F0; text-align: left;">
              <th style="padding: 12px 16px; font-weight: bold; color: #475569;">Producto</th>
              <th style="padding: 12px 16px; font-weight: bold; color: #475569;">Vencimiento</th>
              <th style="padding: 12px 16px; font-weight: bold; color: #475569;">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <p style="margin-top: 20px; font-size: 13px; color: #64748B;">
          Este control se realiza automáticamente cada 15 días. Por favor verifique el stock físico en el cine.
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"Control de Vencimientos" <${GMAIL_USER}>`,
    to: ALERTA_EMAIL,
    subject,
    html,
  });
}

// ─── Cloud Function: verificarVencimientosProductos ───────────────────────────

export const verificarVencimientosProductos = onSchedule(
  {
    schedule: "0 9 */15 * *",
    secrets: [GMAIL_PASSWORD],
  },
  async (event) => {
    const gmailPassword = GMAIL_PASSWORD.value();
    if (!gmailPassword) {
      console.error("GMAIL_PASSWORD no configurado.");
      return;
    }

    const today = new Date();
    const limitDate = new Date();
    limitDate.setDate(today.getDate() + 30); // 30 días o 1 mes

    const limitStr = limitDate.toISOString().split("T")[0]; // YYYY-MM-DD

    const cinesSnap = await db.collection("cines").get();

    for (const cineDoc of cinesSnap.docs) {
      const cineId = cineDoc.id;
      const cineNombre = cineDoc.data().nombre || cineId;

      // Omitir oficinas o usuarios especiales
      if (cineId === "oficinas" || cineId === "cinemarkproyecto") {
        continue;
      }

      const productosSnap = await db.collection("cines").doc(cineId).collection("productos").get();
      const expiringItems: { productoNombre: string; fecha: string; cantidad: number }[] = [];

      for (const productoDoc of productosSnap.docs) {
        const productoData = productoDoc.data();
        const productoNombre = productoData.nombre || productoDoc.id;

        // Consultar vencimientos de este producto con cantidad > 0
        const vencimientosSnap = await db
          .collection("cines")
          .doc(cineId)
          .collection("productos")
          .doc(productoDoc.id)
          .collection("vencimientos")
          .where("cantidad", ">", 0)
          .get();

        vencimientosSnap.forEach((vDoc) => {
          const vData = vDoc.data();
          const fecha = vData.fecha || "";
          if (fecha && fecha <= limitStr) {
            expiringItems.push({
              productoNombre,
              fecha,
              cantidad: Number(vData.cantidad || 0),
            });
          }
        });
      }

      if (expiringItems.length > 0) {
        // Ordenar vencimientos por fecha (los más viejos o vencidos primero)
        expiringItems.sort((a, b) => a.fecha.localeCompare(b.fecha));

        try {
          await enviarEmailVencimientosProximosProductos({
            cineNombre,
            items: expiringItems,
            gmailPassword,
          });
          console.log(`📧 Alerta de vencimientos enviada para ${cineNombre}: ${expiringItems.length} lotes de productos detectados.`);
        } catch (err) {
          console.error(`Error al enviar email de vencimientos de productos para ${cineNombre}:`, err);
        }
      }
    }
  }
);

export const getCinemarkShowtimes = onCall(async (request) => {
  const theaterId = String(request.data?.theaterId || "103");
  const url = `https://bff.cinemark.com.ar/api/cinema/showtimes?theater=${theaterId}&_t=${Date.now()}`;
  
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "country": "AR",
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new HttpsError("failed-precondition", `Cinemark API returned status ${response.status}`);
    }

    const json = await response.json();
    return json;
  } catch (error: any) {
    console.error("Error fetching Cinemark showtimes:", error);
    throw new HttpsError("internal", error?.message || "Error fetching Cinemark showtimes");
  }
});

// Helper for movie week start in backend functions
function getMovieWeekStartForFunction(date: Date): string {
  const localDate = new Date(date.getTime() - (3 * 60 * 60 * 1000));
  const dayNum = localDate.getUTCDay();
  const daysToSubtract = dayNum <= 3 ? dayNum + 3 : dayNum - 4;
  const thurDate = new Date(localDate.getTime() - daysToSubtract * 24 * 60 * 60 * 1000);
  const yyyy = thurDate.getUTCFullYear();
  const mm = String(thurDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(thurDate.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Background sync function for a cinema
async function syncShowtimesForCine(cineId: string, theaterId: string) {
  const url = `https://bff.cinemark.com.ar/api/cinema/showtimes?theater=${theaterId}&_t=${Date.now()}`;
  console.log(`Starting sync for cine: ${cineId} (theaterId: ${theaterId})`);
  
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "country": "AR",
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      console.error(`Cinemark API failed for theater ${theaterId} with status ${response.status}`);
      return;
    }

    const json = await response.json();
    const sessions = json.data || [];
    
    // Group new sessions by weekStart
    const sessionsByWeek: Record<string, any[]> = {};
    sessions.forEach((s: any) => {
      const utcDate = new Date(s.sessionDateTime);
      const weekStart = getMovieWeekStartForFunction(utcDate);
      if (!sessionsByWeek[weekStart]) {
        sessionsByWeek[weekStart] = [];
      }
      sessionsByWeek[weekStart].push(s);
    });
    
    // For each week, read existing, merge and save
    for (const weekStart of Object.keys(sessionsByWeek)) {
      const docRef = db.collection("cines").doc(cineId).collection("showtimes").doc(weekStart);
      const docSnap = await docRef.get();
      
      let existingSessions: any[] = [];
      if (docSnap.exists) {
        existingSessions = docSnap.data()?.sessions || [];
      }
      
      const newSessions = sessionsByWeek[weekStart];
      
      // Merge: preserve history, update new status
      const mergedMap = new Map<string, any>();
      existingSessions.forEach(s => {
        const key = `${s.sessionId}_${s.theaterRoom}`;
        mergedMap.set(key, s);
      });
      newSessions.forEach(s => {
        const key = `${s.sessionId}_${s.theaterRoom}`;
        mergedMap.set(key, s);
      });
      
      const mergedList = Array.from(mergedMap.values()).sort((a, b) => 
        a.sessionDateTime.localeCompare(b.sessionDateTime)
      );
      
      await docRef.set({
        weekStart,
        updatedAt: new Date().toISOString(),
        sessions: mergedList
      }, { merge: true });
    }
    
    console.log(`Sync completed successfully for cineId ${cineId} (theater ${theaterId})`);
  } catch (err) {
    console.error(`Error syncing showtimes for cineId ${cineId}:`, err);
  }
}

// 20-minute cron scheduler to update showtimes background history
export const cronUpdateShowtimes = onSchedule("every 20 minutes", async () => {
  console.log("Running scheduled showtimes synchronizer");
  const cinesSnap = await db.collection("cines").get();
  
  for (const cineDoc of cinesSnap.docs) {
    const cineId = cineDoc.id;
    const configSnap = await db.collection("cines").doc(cineId).collection("info").doc("config").get();
    let theaterId = "";
    
    if (configSnap.exists) {
      theaterId = configSnap.data()?.theaterId || "";
    }
    // Fallback for Abasto
    if (!theaterId && cineId.toLowerCase() === "abasto") {
      theaterId = "103";
    }
    
    if (!theaterId) {
      console.log(`Skipping cine ${cineId} (no theaterId configured)`);
      continue;
    }
    
    await syncShowtimesForCine(cineId, theaterId);
  }
});

// Force sync callable function for manual refresh
export const forceSyncShowtimes = onCall(async (request) => {
  const targetCineId = String(request.data?.cineId || request.auth?.token?.cineId || "");
  if (!targetCineId) {
    throw new HttpsError("invalid-argument", "Missing cineId");
  }
  
  // Get theaterId
  const configSnap = await db.collection("cines").doc(targetCineId).collection("info").doc("config").get();
  let theaterId = "";
  if (configSnap.exists) {
    theaterId = configSnap.data()?.theaterId || "";
  }
  if (!theaterId && targetCineId.toLowerCase() === "abasto") {
    theaterId = "103";
  }
  if (!theaterId) {
    throw new HttpsError("not-found", `No theaterId found for cine ${targetCineId}`);
  }
  
  await syncShowtimesForCine(targetCineId, theaterId);
  return { success: true };
});

