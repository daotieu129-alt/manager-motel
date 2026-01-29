// src/App.tsx
import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

import ProtectedRoute from "./components/ProtectedRoute";

import Setup from "./pages/Setup";

// Lazy-load pages to reduce bundle size (especially Rooms/Cashbook)
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Rooms = lazy(() => import("./pages/Rooms"));
const Cashbook = lazy(() => import("./pages/Cashbook"));

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-sm text-gray-500">Đang tải...</div>
    </div>
  );
}

export default function App() {
  const location = useLocation();

  return (
    <Suspense fallback={<PageFallback />}>
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/rooms"
            element={
              <ProtectedRoute>
                <Rooms />
              </ProtectedRoute>
            }
          />

          <Route
            path="/reports/cashbook"
            element={
              <ProtectedRoute>
                <Cashbook />
              </ProtectedRoute>
            }
          />

          <Route
            path="/setup"
            element={
              <ProtectedRoute>
                <Setup />
              </ProtectedRoute>
            }
         />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </Suspense>
  );
}
