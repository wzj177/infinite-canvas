import { useState } from "react";
import { App, Button, Input } from "antd";
import { Lock, LogIn, User } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { loginWithPassword } from "@/services/api/auth";
import { useAuthStore } from "@/stores/use-auth-store";

export default function LoginPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const status = useAuthStore((state) => state.status);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const from = (location.state as { from?: string } | null)?.from || "/";

    if (status === "authenticated") return <Navigate to={from} replace />;

    const submit = async () => {
        if (loading) return;
        if (!username.trim() || !password) {
            message.warning(t("auth.formIncomplete"));
            return;
        }
        setLoading(true);
        try {
            await loginWithPassword(username.trim(), password);
            const warning = useAuthStore.getState().channelWarning;
            if (warning) message.warning(warning);
            message.success(t("auth.loginSuccess"));
            navigate(from, { replace: true });
        } catch (error) {
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
                    <Button type="primary" size="large" block icon={<LogIn className="size-4" />} loading={loading} onClick={() => void submit()}>
                        {t("auth.login")}
                    </Button>
                </div>
            </div>
        </div>
    );
}
