import { useEffect, useRef, useState } from "react";
import { App, Button, Input } from "antd";
import { Lock, LogIn, User } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { fetchGatewayStatus, loginWithPassword } from "@/services/api/auth";
import { useAuthStore } from "@/stores/use-auth-store";

type TurnstileApi = {
    render: (element: HTMLElement, options: Record<string, unknown>) => string | number;
    reset: (widgetId?: string | number) => void;
};

declare global {
    interface Window {
        turnstile?: TurnstileApi;
    }
}

let turnstilePromise: Promise<TurnstileApi> | null = null;

function loadTurnstile() {
    if (!turnstilePromise) {
        turnstilePromise = new Promise<TurnstileApi>((resolve, reject) => {
            if (window.turnstile) return resolve(window.turnstile);
            const script = document.createElement("script");
            script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
            script.async = true;
            script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
            script.onerror = () => reject(new Error("turnstile load failed"));
            document.head.appendChild(script);
        });
    }
    return turnstilePromise;
}

export default function LoginPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const status = useAuthStore((state) => state.status);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
    const [turnstileToken, setTurnstileToken] = useState("");
    const turnstileHostRef = useRef<HTMLDivElement>(null);
    const turnstileWidgetRef = useRef<string | number | null>(null);
    const from = (location.state as { from?: string } | null)?.from || "/";

    useEffect(() => {
        void fetchGatewayStatus()
            .then((data) => {
                if (data.turnstile_check && data.turnstile_site_key) setTurnstileSiteKey(data.turnstile_site_key);
            })
            .catch(() => undefined);
    }, []);

    useEffect(() => {
        if (!turnstileSiteKey || !turnstileHostRef.current || turnstileWidgetRef.current !== null) return;
        void loadTurnstile()
            .then((turnstile) => {
                if (!turnstileHostRef.current) return;
                turnstileWidgetRef.current = turnstile.render(turnstileHostRef.current, {
                    sitekey: turnstileSiteKey,
                    callback: (token: string) => setTurnstileToken(token),
                    "expired-callback": () => setTurnstileToken(""),
                    "error-callback": () => setTurnstileToken(""),
                });
            })
            .catch(() => undefined);
    }, [turnstileSiteKey]);

    if (status === "authenticated") return <Navigate to={from} replace />;

    const submit = async () => {
        if (loading) return;
        if (!username.trim() || !password) {
            message.warning(t("auth.formIncomplete"));
            return;
        }
        if (turnstileSiteKey && !turnstileToken) {
            message.warning(t("auth.turnstileRequired"));
            return;
        }
        setLoading(true);
        try {
            await loginWithPassword(username.trim(), password, turnstileToken);
            const warning = useAuthStore.getState().channelWarning;
            if (warning) message.warning(warning);
            message.success(t("auth.loginSuccess"));
            navigate(from, { replace: true });
        } catch (error) {
            // Turnstile tokens are single-use; get a fresh one for the next attempt.
            if (turnstileWidgetRef.current !== null) window.turnstile?.reset(turnstileWidgetRef.current);
            setTurnstileToken("");
            message.error(error instanceof Error ? error.message : t("auth.loginFailed"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex h-dvh items-center justify-center bg-stone-100 px-4 dark:bg-stone-950">
            <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-card p-8 shadow-sm dark:border-stone-800">
                <h1 className="mb-1.5 text-center text-xl font-semibold text-stone-950 dark:text-stone-100">{t("auth.title")}</h1>
                <p className="mb-6 text-center text-sm text-stone-500">{t("auth.subtitle")}</p>
                <div className="space-y-3">
                    <Input size="large" prefix={<User className="size-4 text-stone-400" />} placeholder={t("auth.username")} value={username} onChange={(event) => setUsername(event.target.value)} onPressEnter={() => void submit()} autoComplete="username" />
                    <Input.Password size="large" prefix={<Lock className="size-4 text-stone-400" />} placeholder={t("auth.password")} value={password} onChange={(event) => setPassword(event.target.value)} onPressEnter={() => void submit()} autoComplete="current-password" />
                    {turnstileSiteKey ? <div ref={turnstileHostRef} className="flex justify-center" /> : null}
                    <Button type="primary" size="large" block icon={<LogIn className="size-4" />} loading={loading} onClick={() => void submit()}>
                        {t("auth.login")}
                    </Button>
                </div>
            </div>
        </div>
    );
}
