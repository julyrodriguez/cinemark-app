import {
  httpsCallable,
  isFallbackMode,
  setFallbackMode,
  checkServerHealth,
  getServerStatus,
} from "@/lib/dbService";
import { Platform } from "react-native";

import { functions } from "./firebaseConfig";

export type IpAccessStatus =
  | { state: "loading" }
  | {
      state: "authorized";
      ip: string;
      cineId: string;
      nombre?: string | null;
      serverOffline?: boolean;
      skipped?: boolean;
    }
  | { state: "not_authorized"; ip: string; cineId: string; nombre?: string | null }
  | { state: "error"; message: string };

type CheckIpAccessResponse = {
  authorized: boolean;
  ip: string;
  cineId: string;
  nombre?: string | null;
};

type AuthorizeIpResponse = {
  authorized: boolean;
  ip: string;
  cineId: string;
};

type ChangePasswordResponse = {
  ok: boolean;
  message?: string;
};

const IP_CHECK_TIMEOUT_MS = 10000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export async function checkIpAccess(): Promise<IpAccessStatus> {
  if (Platform.OS !== "web") {
    return { state: "authorized", ip: "native", cineId: "native" };
  }

  // 1. Si el servidor ya está marcado como offline o en modo fallback, saltear de inmediato
  if (isFallbackMode() || getServerStatus() === "offline") {
    console.warn("[checkIpAccess] Servidor detectado como offline. Validación de IP salteada (modo lectura).");
    return {
      state: "authorized",
      ip: "desconectado",
      cineId: "offline",
      nombre: null,
      serverOffline: true,
      skipped: true,
    };
  }

  try {
    const fn = httpsCallable<undefined, CheckIpAccessResponse>(
      functions,
      "checkIpAccess"
    );

    const promise = fn(undefined);

    const res = await withTimeout(
      promise,
      IP_CHECK_TIMEOUT_MS,
      "La validación de IP tardó demasiado, vuelva a internarlo nuevamente"
    );

    const raw = res.data as any;
    const data = raw?.result ?? raw;

    if (!data?.ip || !data?.cineId) {
      if (isFallbackMode()) {
        return {
          state: "authorized",
          ip: "desconectado",
          cineId: "offline",
          nombre: null,
          serverOffline: true,
          skipped: true,
        };
      }
      return { state: "error", message: "Respuesta inválida al validar IP." };
    }

    return data.authorized
      ? {
          state: "authorized",
          ip: data.ip,
          cineId: data.cineId,
          nombre: data.nombre ?? null,
        }
      : {
          state: "not_authorized",
          ip: data.ip,
          cineId: data.cineId,
          nombre: data.nombre ?? null,
        };
  } catch (e: any) {
    console.warn("[checkIpAccess] Error al validar IP:", e?.message || e);

    // Si falló la llamada, verificar si el servidor está caído o en fallback
    const isOffline = isFallbackMode() || !(await checkServerHealth().catch(() => false));
    if (isOffline) {
      setFallbackMode(true);
      console.warn("[checkIpAccess] Servidor apagado confirmado. Check IP salteado para acceso en modo lectura.");
      return {
        state: "authorized",
        ip: "desconectado",
        cineId: "offline",
        nombre: null,
        serverOffline: true,
        skipped: true,
      };
    }

    const msg =
      e?.message ||
      (typeof e === "string" ? e : null) ||
      "No se pudo validar la IP.";
    return { state: "error", message: String(msg) };
  }
}

export async function authorizeCurrentIp(params: {
  pin: string;
  label: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const fn = httpsCallable<
      { pin: string; label: string },
      AuthorizeIpResponse | { result: AuthorizeIpResponse }
    >(functions, "authorizeCurrentIp");

    const pin = String(params.pin ?? "").trim();
    const label = String(params.label ?? "").trim();

    if (!pin) return { ok: false, message: "Ingresá el PIN." };
    if (!label) return { ok: false, message: "Ingresá un nombre para esta IP." };

    const res = await withTimeout(
      fn({ pin, label }),
      IP_CHECK_TIMEOUT_MS,
      "Timeout al autorizar IP."
    );

    const raw = res.data as any;
    const data = raw?.result ?? raw;


    if (!data?.authorized) {
      return { ok: false, message: "No se pudo autorizar la IP." };
    }

    return { ok: true };
  } catch (e: any) {
    console.error("authorizeCurrentIp error:", e);

    const code = String(e?.code ?? "");
    if (code.includes("permission-denied")) {
      return { ok: false, message: "PIN incorrecto." };
    }

    const msg =
      e?.message ||
      (typeof e === "string" ? e : null) ||
      "No se pudo autorizar la IP.";

    return { ok: false, message: String(msg) };
  }
}

export async function changeCinemaPassword(params: {
  pin: string;
  newPassword: string;
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  try {
    const fn = httpsCallable<
      { pin: string; newPassword: string },
      ChangePasswordResponse | { result: ChangePasswordResponse }
    >(functions, "changeCinemaPassword");

    const pin = String(params.pin ?? "").trim();
    const newPassword = String(params.newPassword ?? "");

    if (!pin) {
      return { ok: false, message: "Ingresá el PIN." };
    }

    if (!newPassword) {
      return { ok: false, message: "Ingresá la nueva contraseña." };
    }

    if (newPassword.length < 6) {
      return {
        ok: false,
        message: "La nueva contraseña debe tener al menos 6 caracteres.",
      };
    }

    const res = await withTimeout(
      fn({ pin, newPassword }),
      IP_CHECK_TIMEOUT_MS,
      "Timeout al cambiar la contraseña."
    );

    const raw = res.data as any;
    const data = raw?.result ?? raw;

    if (!data?.ok) {
      return {
        ok: false,
        message: data?.message || "No se pudo cambiar la contraseña.",
      };
    }

    return {
      ok: true,
      message: data?.message || "Contraseña actualizada.",
    };
  } catch (e: any) {
    console.error("changeCinemaPassword error:", e);

    const code = String(e?.code ?? "");

    if (code.includes("permission-denied")) {
      return { ok: false, message: "PIN incorrecto." };
    }

    if (code.includes("unauthenticated")) {
      return { ok: false, message: "La sesión expiró. Volvé a iniciar sesión." };
    }

    if (code.includes("invalid-argument")) {
      return {
        ok: false,
        message: e?.message || "Datos inválidos para cambiar la contraseña.",
      };
    }

    return {
      ok: false,
      message: e?.message || "No se pudo cambiar la contraseña.",
    };
  }
}

export async function updateProyeccionPin(params: {
  pin: string;
  proyeccionPin: string;
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  try {
    const fn = httpsCallable<
      { pin: string; proyeccionPin: string },
      any
    >(functions, "updateProyeccionPin");

    const pin = String(params.pin ?? "").trim();
    const proyeccionPin = String(params.proyeccionPin ?? "").trim();

    if (!pin) {
      return { ok: false, message: "Ingresá el PIN maestro." };
    }

    const res = await withTimeout(
      fn({ pin, proyeccionPin }),
      IP_CHECK_TIMEOUT_MS,
      "Timeout al actualizar el PIN de proyección."
    );

    const raw = res.data as any;
    const data = raw?.result ?? raw;

    if (!data?.ok) {
      return {
        ok: false,
        message: data?.message || "No se pudo actualizar el PIN de proyección.",
      };
    }

    return {
      ok: true,
      message: data?.message || "PIN de proyección actualizado.",
    };
  } catch (e: any) {
    console.error("updateProyeccionPin error:", e);

    const code = String(e?.code ?? "");

    if (code.includes("permission-denied")) {
      return { ok: false, message: "PIN maestro incorrecto." };
    }

    if (code.includes("unauthenticated")) {
      return { ok: false, message: "La sesión expiró. Volvé a iniciar sesión." };
    }

    if (code.includes("invalid-argument")) {
      return {
        ok: false,
        message: e?.message || "Datos inválidos para actualizar el PIN.",
      };
    }

    return {
      ok: false,
      message: e?.message || "No se pudo actualizar el PIN de proyección.",
    };
  }
}