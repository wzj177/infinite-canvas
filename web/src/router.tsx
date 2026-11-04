import { createBrowserRouter, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import { RequireAuth } from "@/components/layout/require-auth";
import UserLayout from "@/layouts/user-layout";
import AssetsPage from "@/pages/assets";
import CanvasPage from "@/pages/canvas";
import CanvasProjectPage from "@/pages/canvas/project";
import ConfigPage from "@/pages/config";
import ImagePage from "@/pages/image";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import VideoPage from "@/pages/video";

export const router = createBrowserRouter(
    [
        { path: "/login", element: <LoginPage /> },
        {
            element: (
                <RequireAuth>
                    <UserLayout>
                        <AnalyticsTracker />
                        <Outlet />
                    </UserLayout>
                </RequireAuth>
            ),
            children: [
                { path: "/", element: <CanvasPage /> },
                { path: "/image", element: <ImagePage /> },
                { path: "/video", element: <VideoPage /> },
                { path: "/assets", element: <AssetsPage /> },
                { path: "/canvas", element: <CanvasPage /> },
                { path: "/canvas/:id", element: <CanvasProjectPage /> },
                { path: "/config", element: <ConfigPage /> },
            ],
        },
        { path: "*", element: <NotFound /> },
    ],
    { basename: import.meta.env.BASE_URL },
);
