import i18n from "@/i18n";
import { fetchChannelModels } from "@/services/api/image";
import { useAuthStore, type GatewayAuthUser } from "@/stores/use-auth-store";
import { createModelChannel, encodeChannelModel, modelOptionsFromChannels, normalizeChannelModels, useConfigStore, type ApiCallFormat, type ModelChannel } from "@/stores/use-config-store";

const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

/** The gateway origin for iframe embeds; same-origin deployments talk to their own origin. */
export const NAPI_BASE_URL = "https://napi.wanzij.cn";
const THIRD_AUTH_CHECK_URL = `${NAPI_BASE_URL}/api/third_auth_check`;
const AUTHTK_STORAGE_KEY = "infinite-canvas:authtk";
const CANVAS_TOKEN_NAME = "infinite-canvas";

type AuthBundle = { access_token?: string; user?: GatewayAuthUser | null; require_2fa?: boolean; api_key?: string };
type Envelope<T> = { success?: boolean; message?: string; data?: T | null };

let refreshPromise: Promise<boolean> | null = null;

async function gatewayFetch(path: string, init: RequestInit = {}, accessToken?: string) {
    const headers = new Headers(init.headers);
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return fetch(path, { ...init, headers, credentials: "include" });
}

/** Same-origin /api call with the dashboard JWT; refreshes once on 401 and retries. */
async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response = await gatewayFetch(path, init, useAuthStore.getState().accessToken || undefined);
    if (response.status === 401) {
        if (!(await refreshLoginSession())) {
            useAuthStore.getState().clearSession();
            throw new Error(apiText("authSessionExpired"));
        }
        response = await gatewayFetch(path, init, useAuthStore.getState().accessToken || undefined);
    }
    const payload = (await response.json().catch(() => null)) as Envelope<T> | null;
    if (!response.ok || !payload?.success || payload.data === undefined || payload.data === null) throw new Error(payload?.message || apiText("authRequestFailed"));
    return payload.data;
}

async function readEnvelope<T>(response: Response, fallbackKey: string): Promise<T> {
    if (response.status === 401) throw new Error(apiText("authTokenInvalid"));
    const payload = (await response.json().catch(() => null)) as Envelope<T> | null;
    if (!response.ok || payload?.success === false) throw new Error(payload?.message || apiText(fallbackKey));
    return (payload?.data ?? {}) as T;
}

export function refreshLoginSession() {
    if (!refreshPromise) {
        refreshPromise = (async () => {
            try {
                const response = await gatewayFetch("/api/user/auth/refresh", { method: "POST" });
                if (!response.ok) return false;
                const payload = (await response.json().catch(() => null)) as Envelope<AuthBundle> | null;
                if (!payload?.success) return false;
                useAuthStore.getState().applyBundle(payload.data || {});
                return true;
            } catch {
                return false;
            } finally {
                refreshPromise = null;
            }
        })();
    }
    return refreshPromise;
}

export async function loginWithPassword(username: string, password: string, turnstileToken = "") {
    const query = turnstileToken ? `?turnstile=${encodeURIComponent(turnstileToken)}` : "";
    const response = await gatewayFetch(`/api/user/login${query}`, { method: "POST", body: JSON.stringify({ username, password }) });
    const data = await readEnvelope<AuthBundle>(response, "authLoginFailed");
    if (data.require_2fa) throw new Error(apiText("auth2FAUnsupported"));
    useAuthStore.getState().applyBundle(data);
    await setupGatewayChannels(window.location.origin);
}

/** Public gateway status; exposes whether login needs a Turnstile token. */
export async function fetchGatewayStatus() {
    const response = await gatewayFetch("/api/status");
    if (!response.ok) throw new Error(apiText("authRequestFailed"));
    const payload = (await response.json().catch(() => null)) as Envelope<{ turnstile_check?: boolean; turnstile_site_key?: string }> | null;
    return payload?.data || {};
}

/** Create or reuse the dedicated API token, then wire the napi channels with it. */
async function setupGatewayChannels(baseUrl: string) {
    const { setChannelWarning } = useAuthStore.getState();
    try {
        const apiKey = await ensureGatewayApiKey();
        await ensureNapiChannels(apiKey, baseUrl);
        const channels = useConfigStore.getState().config.channels;
        const videoReady = channels.find((channel) => channel.name === "napi 视频")?.models.some((model) => model.capability === "video");
        setChannelWarning(videoReady ? "" : i18n.t("apiErrors.napiVideoModelsMissing"));
    } catch (error) {
        setChannelWarning(error instanceof Error ? error.message : apiText("authRequestFailed"));
    }
}

/** Upsert the two napi channels (video / image protocols) with the gateway key, then fetch models for empty ones. */
async function ensureNapiChannels(apiKey: string, baseUrl: string) {
    const targets: Array<{ name: string; apiFormat: ApiCallFormat }> = [
        { name: "napi 视频", apiFormat: "video-seedance" },
        { name: "napi 图像", apiFormat: "openai" },
    ];
    const { config } = useConfigStore.getState();
    const channels = [...config.channels];
    const toFetch: ModelChannel[] = [];
    for (const target of targets) {
        const index = channels.findIndex((channel) => channel.name === target.name);
        const existing = index >= 0 ? channels[index] : null;
        const channel = createModelChannel({ ...(existing || {}), name: target.name, baseUrl, apiKey, apiFormat: target.apiFormat });
        if (index >= 0) channels[index] = channel;
        else channels.push(channel);
        // Keep a user-customized model list, but re-pull while the channel lacks models of its own kind
        // (e.g. the gateway token group did not expose them yet).
        const capability = target.apiFormat === "video-seedance" ? "video" : "image";
        if (!existing?.models.some((model) => model.capability === capability)) toFetch.push(channel);
    }
    useConfigStore.setState({ config: { ...config, channels, models: modelOptionsFromChannels(channels) } });
    await Promise.allSettled(
        toFetch.map((channel) =>
            fetchChannelModels(channel).then((names) => {
                if (!names.length) return;
                const state = useConfigStore.getState();
                const next = state.config.channels.map((item) => (item.id === channel.id ? { ...item, models: normalizeChannelModels(names) } : item));
                useConfigStore.setState({ config: { ...state.config, channels: next, models: modelOptionsFromChannels(next) } });
            }),
        ),
    );
    selectDefaultGatewayModels();
}

/** Point video/image models at the napi channels when the current selection has no usable channel. */
function selectDefaultGatewayModels() {
    const state = useConfigStore.getState();
    for (const key of ["videoModel", "imageModel"] as const) {
        if (state.isAiConfigReady(state.config, state.config[key])) continue;
        const capability = key === "videoModel" ? "video" : "image";
        const candidate = state.config.channels
            .filter((channel) => channel.name === "napi 视频" || channel.name === "napi 图像")
            .flatMap((channel) => channel.models.filter((model) => model.capability === capability).map((model) => encodeChannelModel(channel.id, model.name)))[0];
        if (candidate) useConfigStore.setState({ config: { ...useConfigStore.getState().config, [key]: candidate } });
    }
}

async function ensureGatewayApiKey() {
    const list = await apiFetch<{ items?: Array<{ id: number; name: string; status: number }> }>("/api/token/?p=1&page_size=100");
    const existing = (list.items || []).find((item) => item.name === CANVAS_TOKEN_NAME && item.status === 1);
    const token = existing || (await apiFetch<{ id: number }>("/api/token/", { method: "POST", body: JSON.stringify({ name: CANVAS_TOKEN_NAME, expired_time: -1, unlimited_quota: true, remain_quota: 0 }) }));
    const key = await apiFetch<{ key: string }>(`/api/token/${token.id}/key`, { method: "POST" });
    if (!key.key) throw new Error(apiText("authTokenInvalid"));
    return key.key;
}

export async function logoutGateway() {
    forgetAuthToken();
    const { accessToken, source, clearSession } = useAuthStore.getState();
    if (source === "session") await gatewayFetch("/api/user/auth/logout", { method: "POST" }, accessToken || undefined).catch(() => undefined);
    clearSession();
}

// --- ?authtk= embed flow: POST /api/third_auth_check on the gateway, 200 = valid, 401 = invalid. ---

export function readAuthTokenFromUrl() {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    const token = (params.get("authtk") || "").trim();
    if (!token) return "";
    params.delete("authtk");
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    return token;
}

export function rememberAuthToken(token: string) {
    sessionStorage.setItem(AUTHTK_STORAGE_KEY, token);
}

function forgetAuthToken() {
    sessionStorage.removeItem(AUTHTK_STORAGE_KEY);
}

function readRememberedAuthToken() {
    return (sessionStorage.getItem(AUTHTK_STORAGE_KEY) || "").trim();
}

export async function loginWithThirdToken(token: string) {
    const response = await fetch(THIRD_AUTH_CHECK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => {
        throw new Error(apiText("authRequestFailed"));
    });
    if (response.status === 401) throw new Error(apiText("authTokenInvalid"));
    const data = await readEnvelope<AuthBundle>(response, "authRequestFailed");
    useAuthStore.getState().applyThirdAuth(data);
    if (data.api_key) await ensureNapiChannels(data.api_key, NAPI_BASE_URL).catch(() => undefined);
}

/** Recover the login state on app start: ?authtk= first, then the same-origin refresh cookie. */
export async function restoreSession() {
    if (useAuthStore.getState().status !== "unknown") return;
    const token = readAuthTokenFromUrl() || readRememberedAuthToken();
    if (token) {
        try {
            await loginWithThirdToken(token);
            rememberAuthToken(token);
            return;
        } catch {
            forgetAuthToken();
        }
    }
    if (await refreshLoginSession()) {
        const state = useAuthStore.getState();
        if (!state.user) {
            try {
                const self = await apiFetch<GatewayAuthUser>("/api/user/self");
                useAuthStore.getState().applyBundle({ user: self });
            } catch {
                // keep the session even if profile loading fails
            }
        }
        return;
    }
    useAuthStore.getState().clearSession();
}
