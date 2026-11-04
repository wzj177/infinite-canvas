import { create } from "zustand";

export type GatewayAuthUser = { id?: number; username?: string; display_name?: string };
export type AuthStatus = "unknown" | "authenticated" | "guest";

/** The access JWT lives in memory only; page reloads recover the session via the refresh cookie or ?authtk=. */
type AuthStore = {
    status: AuthStatus;
    user: GatewayAuthUser | null;
    accessToken: string;
    source: "session" | "token" | null;
    channelWarning: string;
    applyBundle: (data: { access_token?: string; user?: GatewayAuthUser | null }) => void;
    applyThirdAuth: (data: { user?: GatewayAuthUser | null }) => void;
    clearSession: () => void;
    setChannelWarning: (message: string) => void;
};

export const useAuthStore = create<AuthStore>()((set) => ({
    status: "unknown",
    user: null,
    accessToken: "",
    source: null,
    channelWarning: "",
    applyBundle: (data) =>
        set((state) => ({ status: "authenticated", source: "session", accessToken: data.access_token || state.accessToken, user: data.user || state.user })),
    applyThirdAuth: (data) => set((state) => ({ status: "authenticated", source: "token", accessToken: "", user: data.user || state.user })),
    clearSession: () => set({ status: "guest", user: null, accessToken: "", source: null, channelWarning: "" }),
    setChannelWarning: (message) => set({ channelWarning: message }),
}));
