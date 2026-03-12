/**
 * lib/db.action.ts
 * ─────────────────────────────────────────────
 * Local IndexedDB implementation of our data layer to replace Puter.js KV.
 * Uses idb-keyval for a simple, promise-based API over IndexedDB.
 */

import { get, set, del } from "idb-keyval";
import type { FloorPlanData } from "./ai";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DesignItem {
    id: string;
    name: string;
    sourceUrl: string;
    renderedUrl?: string; // Kept for legacy compatibility if needed
    sourceImage?: string;
    renderedImage?: string; // Kept for legacy compatibility if needed
    /** AI-extracted room layout — powers the 3D mesh visualiser */
    floorPlanData?: FloorPlanData;
    timestamp: number;
}

export interface UserProfile {
    isPremium: boolean;
    userId: string;
    userName: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECTS_KEY = "bv_projects_index";
const projectKey = (id: string) => `bv_project_${id}`;
const profileKey = (uid: string) => `bv_profile_${uid}`;

// ─── Local Mock Auth ─────────────────────────────────────────────────────────
// Since we removed Puter auth, we simulate a local user so the app still functions
// as if they are signed in (they own the local browser).

const LOCAL_USER_ID = "local_user_001";
const LOCAL_USER_NAME = "Local User";

export const getCurrentUser = async () => {
    return { uuid: LOCAL_USER_ID, username: LOCAL_USER_NAME };
};

export const signIn = async () => { };
export const signOut = async () => { };

// ─── User profile ─────────────────────────────────────────────────────────────

export const getUserProfile = async (): Promise<UserProfile | null> => {
    try {
        const raw = await get(profileKey(LOCAL_USER_ID));
        if (raw) return JSON.parse(raw as string) as UserProfile;

        const fresh: UserProfile = {
            isPremium: false,
            userId: LOCAL_USER_ID,
            userName: LOCAL_USER_NAME,
        };
        await set(profileKey(LOCAL_USER_ID), JSON.stringify(fresh));
        return fresh;
    } catch (err) {
        console.error("[BetterView] getUserProfile:", err);
        return null;
    }
};

export const setPremium = async (value: boolean): Promise<boolean> => {
    try {
        const profile: UserProfile = { isPremium: value, userId: LOCAL_USER_ID, userName: LOCAL_USER_NAME };
        await set(profileKey(LOCAL_USER_ID), JSON.stringify(profile));
        return true;
    } catch { return false; }
};

// ─── Project CRUD ─────────────────────────────────────────────────────────────

export const createProject = async (item: DesignItem): Promise<DesignItem | null> => {
    try {
        await set(projectKey(item.id), JSON.stringify(item));

        const raw = await get(PROJECTS_KEY);
        const ids: string[] = raw ? JSON.parse(raw as string) : [];
        if (!ids.includes(item.id)) {
            ids.push(item.id);
            await set(PROJECTS_KEY, JSON.stringify(ids));
        }
        return item;
    } catch (err) {
        console.error("[BetterView] createProject:", err);
        return null;
    }
};

export const getProject = async (id: string): Promise<DesignItem | null> => {
    try {
        const raw = await get(projectKey(id));
        return raw ? (JSON.parse(raw as string) as DesignItem) : null;
    } catch (err) {
        console.error("[BetterView] getProject:", err);
        return null;
    }
};

export const getProjects = async (): Promise<DesignItem[]> => {
    try {
        const raw = await get(PROJECTS_KEY);
        if (!raw) return [];

        const ids: string[] = JSON.parse(raw as string);
        const items: DesignItem[] = [];

        for (const id of ids) {
            const data = await get(projectKey(id));
            if (data) items.push(JSON.parse(data as string) as DesignItem);
        }

        return items.sort((a, b) => b.timestamp - a.timestamp);
    } catch (err) {
        console.error("[BetterView] getProjects:", err);
        return [];
    }
};

export const updateProject = async (
    id: string,
    updates: Partial<DesignItem>
): Promise<DesignItem | null> => {
    try {
        const existing = await getProject(id);
        if (!existing) return null;
        const updated = { ...existing, ...updates };
        await set(projectKey(id), JSON.stringify(updated));
        return updated;
    } catch (err) {
        console.error("[BetterView] updateProject:", err);
        return null;
    }
};

export const deleteProject = async (id: string): Promise<boolean> => {
    try {
        await del(projectKey(id));
        const raw = await get(PROJECTS_KEY);
        const ids: string[] = raw ? JSON.parse(raw as string) : [];
        await set(PROJECTS_KEY, JSON.stringify(ids.filter((i) => i !== id)));
        return true;
    } catch (err) {
        console.error("[BetterView] deleteProject:", err);
        return false;
    }
};
