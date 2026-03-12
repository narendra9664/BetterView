// Shared type definitions for BetterView
export { };

declare global {
    interface AuthState {
        isSignedIn: boolean;
        userName: string | null;
        userId: string | null;
    }
}

export type AuthOutletContext = {
    isSignedIn: boolean;
    userName: string | null;
    userId: string | null;
    refreshAuth: () => Promise<void>;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
};