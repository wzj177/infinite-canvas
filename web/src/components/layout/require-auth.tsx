import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Spin } from "antd";

import { restoreSession } from "@/services/api/auth";
import { useAuthStore } from "@/stores/use-auth-store";

/** Route guard: recover the session once, then bounce guests to /login with the origin path. */
export function RequireAuth({ children }: { children: ReactNode }) {
    const status = useAuthStore((state) => state.status);
    const location = useLocation();

    useEffect(() => {
        void restoreSession();
    }, []);

    if (status === "unknown") {
        return (
            <div className="flex h-dvh items-center justify-center bg-stone-50 dark:bg-stone-950">
                <Spin />
            </div>
        );
    }
    if (status === "guest") return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
    return <>{children}</>;
}
