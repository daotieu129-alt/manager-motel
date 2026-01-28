// src/pages/Login.tsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { getSession, signIn } from "../lib/auth";

type MsgType = "error" | "success";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function Login() {
  const nav = useNavigate();
  const reduceMotion = useReducedMotion();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<MsgType>("error");

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Auto redirect if already logged in
  useEffect(() => {
    (async () => {
      try {
        const { data } = await getSession();
        if (data?.session) nav("/dashboard");
      } catch {
        // ignore
      }
    })();
  }, [nav]);

  const setToast = (type: MsgType, text: string) => {
    setMsgType(type);
    setMsg(text);
  };

  const validate = () => {
    const e = email.trim();
    if (!e) return { ok: false as const, message: "Vui lòng nhập địa chỉ email" };
    if (!EMAIL_RE.test(e)) return { ok: false as const, message: "Email không đúng định dạng" };
    if (!password) return { ok: false as const, message: "Vui lòng nhập mật khẩu" };
    return { ok: true as const, email: e };
  };

  const submit = async () => {
    if (loading) return;

    setMsg("");
    const v = validate();
    if (!v.ok) {
      setToast("error", v.message);
      return;
    }

    setLoading(true);
    try {
      const { error } = await signIn(v.email, password);
      if (error) throw error;

      if (!mountedRef.current) return;

      setToast("success", "Đăng nhập thành công");
      window.setTimeout(() => nav("/dashboard"), 500);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : "Đăng nhập thất bại. Vui lòng thử lại.";
      setToast("error", message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter" && !loading) submit();
  };

  const inputClass =
    "w-full rounded-md border-2 border-gray-300 bg-white px-4 py-3 text-[15px] text-gray-900 " +
    "placeholder:text-gray-400 outline-none transition-all " +
    "focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20 " +
    "disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed disabled:border-gray-200";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-400/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-yellow-400/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      <motion.div
        initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={reduceMotion ? undefined : { duration: 0.3, ease: "easeOut" }}
        className="w-full max-w-[420px] relative z-10"
      >
        <div className="bg-white border-2 border-gray-200 rounded-lg shadow-sm p-8">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 bg-yellow-400 rounded-md">
                <svg className="w-6 h-6 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-[22px] font-bold text-gray-900 leading-none">Motel Manager</h1>
                <p className="text-sm text-gray-500 mt-0.5">Hệ thống quản lý nhà nghỉ</p>
              </div>
            </div>

            <div className="border-l-4 border-yellow-400 pl-4 py-1">
              <h2 className="text-lg font-semibold text-gray-900">Đăng nhập</h2>
              <p className="text-sm text-gray-600 mt-0.5">Nhập thông tin để truy cập hệ thống</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-900 mb-2">
                Địa chỉ Email
              </label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={loading}
                placeholder="vd: admin@motel.vn"
                className={inputClass}
                aria-invalid={msgType === "error" && !!msg && (!email.trim() || !EMAIL_RE.test(email.trim())) ? true : undefined}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-900 mb-2">
                Mật khẩu
              </label>

              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={onKeyDown}
                  disabled={loading}
                  placeholder="Nhập mật khẩu"
                  className={`${inputClass} pr-28`}
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={loading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5
                             px-3 py-2 rounded-md text-xs font-bold
                             bg-yellow-400 text-gray-900 border border-yellow-500
                             hover:bg-yellow-500 active:bg-yellow-600 transition-colors
                             disabled:opacity-60 disabled:cursor-not-allowed"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showPassword ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 3l18 18M10.5 10.5a3 3 0 104.24 4.24M9.88 9.88A9.96 9.96 0 0112 5c4.48 0 8.27 2.94 9.54 7a9.98 9.98 0 01-4.13 5.41"
                        />
                      </svg>
                      Ẩn
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                      Hiện
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="text-xs text-gray-400 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Nhấn Enter để đăng nhập
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={() => setToast("error", "Chức năng quên mật khẩu chưa được hỗ trợ")}
                className="px-3 py-2 rounded-md text-sm font-bold
                           bg-yellow-400 text-gray-900 border border-yellow-500
                           hover:bg-yellow-500 active:bg-yellow-600 transition-colors
                           disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Quên mật khẩu?
              </button>
            </div>

            <AnimatePresence mode="wait">
              {msg && (
                <motion.div
                  key={msg}
                  initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                  animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  role="status"
                  aria-live="polite"
                  className={`rounded-md px-4 py-3 text-sm font-medium flex items-start gap-2.5 border-2 ${
                    msgType === "error" ? "bg-red-50 text-red-800 border-red-200" : "bg-green-50 text-green-800 border-green-200"
                  }`}
                >
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    {msgType === "error" ? (
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    ) : (
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    )}
                  </svg>
                  <span className="flex-1">{msg}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              onClick={submit}
              disabled={loading}
              whileHover={loading ? {} : { scale: 1.01 }}
              whileTap={loading ? {} : { scale: 0.99 }}
              className="w-full rounded-md bg-yellow-400 py-3.5 text-[15px] font-bold text-gray-900
                         hover:bg-yellow-500 active:bg-yellow-600 transition-all shadow-sm
                         disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-yellow-400
                         border-2 border-yellow-500"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-gray-900" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Đang đăng nhập...
                </span>
              ) : (
                "Đăng nhập"
              )}
            </motion.button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t-2 border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-gray-500 font-medium">Chưa có tài khoản?</span>
              </div>
            </div>

            <motion.button
              type="button"
              onClick={() => nav("/register")}
              disabled={loading}
              whileHover={loading ? {} : { scale: 1.01 }}
              whileTap={loading ? {} : { scale: 0.99 }}
              className="w-full rounded-md border-2 border-gray-300 bg-white py-3 text-[15px] font-semibold text-gray-700
                         hover:bg-gray-50 hover:border-gray-400 transition-all
                         disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300"
            >
              Tạo tài khoản mới
            </motion.button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">© {new Date().getFullYear()} Motel Manager. Phần mềm quản lý nhà nghỉ chuyên nghiệp.</p>
        </div>
      </motion.div>
    </div>
  );
}
