import { httpsCallable } from "firebase/functions";
import { functions } from "./firebaseConfig";

export type CineListItem = {
  cineId: string;
  nombre: string;
  authEmail: string;
  active: boolean;
  createdAt: any;
  updatedAt: any;
  authUid: string | null;
};

export type AuthorizedIpItem = {
  id: string;
  ip: string;
  label: string;
  type: "fixed" | "mobile";
  active: boolean;
  createdAt: any;
  createdBy: string | null;
  expiresAt: any | null;
  lastUsedAt: any | null;
};

export async function adminListCines(params?: {
  query?: string;
  limit?: number;
}): Promise<{ items: CineListItem[] }> {
  const fn = httpsCallable<
    { query?: string; limit?: number },
    { items: CineListItem[] }
  >(functions, "adminListCines");

  const res = await fn({
    query: params?.query ?? "",
    limit: params?.limit ?? 100,
  });

  return res.data;
}

export async function adminCreateCine(params: {
  cineId: string;
  nombre: string;
  authEmail?: string;
  initialPassword: string;
  accessPin: string;
  active?: boolean;
  salasCount?: number;
  initialIps?: Array<{ ip: string; label?: string; type?: "fixed" | "mobile" }>;
}): Promise<{ ok: true; cineId: string; authUid: string; authEmail: string }> {
  const fn = httpsCallable<
    {
      cineId: string;
      nombre: string;
      authEmail?: string;
      initialPassword: string;
      accessPin: string;
      active?: boolean;
      salasCount?: number;
      initialIps?: Array<{ ip: string; label?: string; type?: "fixed" | "mobile" }>;
    },
    { ok: true; cineId: string; authUid: string; authEmail: string }
  >(functions, "adminCreateCine");

  const res = await fn(params);
  return res.data;
}

export async function adminUpdateCine(params: {
  cineId: string;
  nombre?: string;
  authEmail?: string;
  accessPin?: string;
  active?: boolean;
}): Promise<{ ok: true }> {
  const fn = httpsCallable<
    {
      cineId: string;
      nombre?: string;
      authEmail?: string;
      accessPin?: string;
      active?: boolean;
    },
    { ok: true }
  >(functions, "adminUpdateCine");

  const res = await fn(params);
  return res.data;
}

export async function adminListAuthorizedIps(params: {
  cineId: string;
}): Promise<{ items: AuthorizedIpItem[] }> {
  const fn = httpsCallable<{ cineId: string }, { items: AuthorizedIpItem[] }>(
    functions,
    "adminListAuthorizedIps"
  );

  const res = await fn(params);
  return res.data;
}

export async function adminUpsertAuthorizedIp(params: {
  cineId: string;
  ip: string;
  label: string;
  type?: "fixed" | "mobile";
  active?: boolean;
  expiresAtMinutes?: number;
}): Promise<{ ok: true }> {
  const fn = httpsCallable<
    {
      cineId: string;
      ip: string;
      label: string;
      type?: "fixed" | "mobile";
      active?: boolean;
      expiresAtMinutes?: number;
    },
    { ok: true }
  >(functions, "adminUpsertAuthorizedIp");

  const res = await fn(params);
  return res.data;
}

export async function adminRemoveAuthorizedIp(params: {
  cineId: string;
  ip: string;
}): Promise<{ ok: true }> {
  const fn = httpsCallable<{ cineId: string; ip: string }, { ok: true }>(
    functions,
    "adminRemoveAuthorizedIp"
  );

  const res = await fn(params);
  return res.data;
}

export async function adminChangeCinePassword(params: {
  cineId: string;
  newPassword: string;
}): Promise<{ ok: true; message: string }> {
  const fn = httpsCallable<
    { cineId: string; newPassword: string },
    { ok: true; message: string }
  >(functions, "adminChangeCinePassword");

  const res = await fn(params);
  return res.data;
}

export async function adminSetOficinasRole(params: {
  cineId: string;
}): Promise<{ ok: true; message: string }> {
  const fn = httpsCallable<
    { cineId: string },
    { ok: true; message: string }
  >(functions, "adminSetOficinasRole");

  const res = await fn(params);
  return res.data;
}
