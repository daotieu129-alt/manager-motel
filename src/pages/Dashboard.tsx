import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { supabase } from "../lib/supabaseClient";
import { signOut } from "../lib/auth";

type MsgType = "error" | "success" | "info";

type RoomStatus = "VACANT" | "OCCUPIED" | "CLEANING" | "MAINTENANCE";

type RoomLite = {
  id: string;
  name: string;
  status: RoomStatus | string;
};

export default function Dashboard() {
  const nav = useNavigate();
  const reduceMotion = useReducedMotion();
  const mountedRef = useRef(true);

  const [loading, setLoading] = useState(true);

  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<MsgType>("info");

  const [hasProperty, setHasProperty] = useState(false);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomLite[]>([]);

  // Optional metrics
  const [todayCheckIn, setTodayCheckIn] = useState<number | null>(null);
  const [todayCheckOut, setTodayCheckOut] = useState<number | null>(null);
  const [todayRevenue, setTodayRevenue] = useState<number | null>(null);
  const [monthRevenue, setMonthRevenue] = useState<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setToast = (type: MsgType, text: string) => {
    setMsgType(type);
    setMsg(text);
  };

  const counts = useMemo(() => {
    const total = rooms.length;
    const vacant = rooms.filter((r) => r.status === "VACANT").length;
    const occupied = rooms.filter((r) => r.status === "OCCUPIED").length;
    const cleaning = rooms.filter((r) => r.status === "CLEANING").length;
    const maintenance = rooms.filter((r) => r.status === "MAINTENANCE").length;
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;

    return { total, vacant, occupied, cleaning, maintenance, occupancyRate };
  }, [rooms]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (!mountedRef.current) return;
        setLoading(false);
        return nav("/");
      }

      // check property membership
      const { data: up, error: upErr } = await supabase
        .from("user_properties")
        .select("property_id, role")
        .maybeSingle();

      if (!mountedRef.current) return;

      if (upErr) {
        setToast("error", upErr.message);
        setHasProperty(false);
        setPropertyId(null);
        setRooms([]);
        setLoading(false);
        return;
      }

      if (!up) {
        setHasProperty(false);
        setPropertyId(null);
        setRooms([]);
        setLoading(false);
        return;
      }

      setHasProperty(true);
      setPropertyId(up.property_id);

      // Load all data using this property_id
      await refreshAll(up.property_id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAll = async (pid?: string | null) => {
    setMsg("");
    const usePid = pid ?? propertyId;
    await Promise.all([loadRooms(usePid), loadQuickMetricsSafe(usePid)]);
  };

  const loadRooms = async (pid?: string | null) => {
    if (!pid) {
      setRooms([]);
      return;
    }

    const { data, error } = await supabase
      .from("rooms")
      .select("id,name,status")
      .eq("property_id", pid)
      .order("name");

    if (!mountedRef.current) return;

    if (error) {
      setToast("error", error.message);
      setRooms([]);
      return;
    }

    setRooms((data ?? []) as RoomLite[]);
  };

  /**
   * Optional metrics – safe loader.
   * - Today revenue/month revenue from payments
   * - Keep try/catch so Dashboard never crashes if schema differs
   */
  const loadQuickMetricsSafe = async (pid?: string | null) => {
    try {
      if (!pid) {
        setTodayCheckIn(null);
        setTodayCheckOut(null);
        setTodayRevenue(null);
        setMonthRevenue(null);
        return;
      }

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      // Today INCOME
      const { data: payToday, error: payTodayErr } = await supabase
        .from("payments")
        .select("amount")
        .eq("property_id", pid)
        .eq("type", "INCOME")
        .gte("paid_at", startOfDay.toISOString());

      // Month INCOME
      const { data: payMonth, error: payMonthErr } = await supabase
        .from("payments")
        .select("amount")
        .eq("property_id", pid)
        .eq("type", "INCOME")
        .gte("paid_at", startOfMonth.toISOString());

      if (!mountedRef.current) return;

      if (payTodayErr) {
        setTodayRevenue(null);
      } else {
        const sum = (payToday ?? []).reduce(
          (s: number, r: { amount: number | null }) => s + Number(r.amount ?? 0),
          0
        );
        setTodayRevenue(sum);
      }

      if (payMonthErr) {
        setMonthRevenue(null);
      } else {
        const sum = (payMonth ?? []).reduce(
          (s: number, r: { amount: number | null }) => s + Number(r.amount ?? 0),
          0
        );
        setMonthRevenue(sum);
      }
      // ===== STAYS METRICS (CHECK-IN / CHECK-OUT TODAY) =====
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      // Check-in hôm nay
      const { count: ciCount, error: ciErr } = await supabase
        .from("stays")
        .select("id", { count: "exact", head: true })
        .eq("property_id", pid)
        .gte("check_in_at", startOfDay.toISOString())
        .lt("check_in_at", endOfDay.toISOString());

      if (!mountedRef.current) return;
      setTodayCheckIn(ciErr ? null : (ciCount ?? 0));

      
       // Check-out hôm nay
      const { count: coCount, error: coErr } = await supabase
        .from("stays")
        .select("id", { count: "exact", head: true })
        .eq("property_id", pid)
        .gte("check_out_at", startOfDay.toISOString())
        .lt("check_out_at", endOfDay.toISOString())
        .eq("status", "CLOSED");
      
      if (!mountedRef.current) return;
      setTodayCheckOut(coErr ? null : (coCount ?? 0));


    } catch {
      // ignore
    }
  };

  const doSignOut = async () => {
    await signOut();
    nav("/");
  };

  // Shared styles (match Login/Register)
  const cardClass = "bg-white border-2 border-gray-200 rounded-lg shadow-sm";
  const btnPrimaryClass =
    "rounded-md bg-yellow-400 py-3 px-4 text-[15px] font-bold text-gray-900 " +
    "hover:bg-yellow-500 active:bg-yellow-600 transition-all shadow-sm " +
    "disabled:opacity-60 disabled:cursor-not-allowed border-2 border-yellow-500";
  const btnOutlineClass =
    "rounded-md border-2 border-gray-300 bg-white py-3 px-4 text-[15px] font-semibold text-gray-700 " +
    "hover:bg-gray-50 hover:border-gray-400 transition-all " +
    "disabled:opacity-60 disabled:cursor-not-allowed";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-400/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-yellow-400/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

        <motion.div
          initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={reduceMotion ? undefined : { duration: 0.25, ease: "easeOut" }}
          className="w-full max-w-[520px] relative z-10"
        >
          <div className={`${cardClass} p-6`}>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-yellow-400 rounded-md">
                <svg className="w-6 h-6 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5l7.5 6V20a1 1 0 01-1 1h-5v-6a1 1 0 00-1-1h-3a1 1 0 00-1 1v6h-5a1 1 0 01-1-1v-9.5L12 4.5z"
                  />
                </svg>
              </div>

              <div className="flex-1">
                <div className="text-[18px] font-bold text-gray-900 leading-none">Motel Manager</div>
                <div className="text-sm text-gray-500 mt-1">Đang tải dashboard...</div>
              </div>

              <svg className="animate-spin h-6 w-6 text-gray-700" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 relative overflow-hidden">
      {/* Accent blobs (match Login/Register) */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-400/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-yellow-400/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      <motion.div
        initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={reduceMotion ? undefined : { duration: 0.28, ease: "easeOut" }}
        className="w-full max-w-[1100px] mx-auto relative z-10"
      >
        {/* Top bar */}
        <div className={`${cardClass} p-6 mb-4`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-yellow-400 rounded-md">
                <svg className="w-6 h-6 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5l7.5 6V20a1 1 0 01-1 1h-5v-6a1 1 0 00-1-1h-3a1 1 0 00-1 1v6h-5a1 1 0 01-1-1v-9.5L12 4.5z"
                  />
                </svg>
              </div>

              <div>
                <h1 className="text-[22px] font-bold text-gray-900 leading-none">Dashboard</h1>
                <div className="text-sm text-gray-600 mt-1">
                  Tỷ lệ lấp đầy: <b className="text-gray-900">{counts.occupancyRate}%</b> • Tổng phòng:{" "}
                  <b className="text-gray-900">{counts.total}</b>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => refreshAll()} className={btnOutlineClass}>
                Tải lại
              </button>
              <button onClick={doSignOut} className={btnOutlineClass}>
                Đăng xuất
              </button>
            </div>
          </div>

          {/* Toast */}
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
                className={`mt-4 rounded-md px-4 py-3 text-sm font-medium flex items-start gap-2.5 border-2 ${
                  msgType === "error"
                    ? "bg-red-50 text-red-800 border-red-200"
                    : msgType === "success"
                    ? "bg-green-50 text-green-800 border-green-200"
                    : "bg-blue-50 text-blue-800 border-blue-200"
                }`}
              >
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  {msgType === "error" ? (
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  ) : msgType === "success" ? (
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  ) : (
                    <path
                      fillRule="evenodd"
                      d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zM9 9a1 1 0 112 0v5a1 1 0 11-2 0V9zm1-4a1.25 1.25 0 100 2.5A1.25 1.25 0 0010 5z"
                      clipRule="evenodd"
                    />
                  )}
                </svg>
                <span className="flex-1">{msg}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* When user has no property */}
        {!hasProperty ? (
          <div className={`${cardClass} p-6`}>
            <div className="border-l-4 border-yellow-400 pl-4 py-1">
              <h2 className="text-lg font-semibold text-gray-900">Chưa có cơ sở</h2>
              <p className="text-sm text-gray-600 mt-0.5">
                Bạn cần tạo cơ sở trước, sau đó qua mục <b>Phòng</b> để tạo phòng/đặt phòng.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button className={btnPrimaryClass} onClick={() => nav("/setup")}>
                Đi tới thiết lập cơ sở
              </button>
              <button className={btnOutlineClass} onClick={() => nav("/")}>
                Về đăng nhập
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Tổng phòng" value={counts.total} hint="Tất cả phòng trong hệ thống" />
              <StatCard title="Phòng trống" value={counts.vacant} hint="Sẵn sàng nhận khách" tone="good" />
              <StatCard title="Đang thuê" value={counts.occupied} hint="Phòng đang có khách" tone="warn" />
              <StatCard title="Đang dọn" value={counts.cleaning} hint="Chưa sẵn sàng" tone="info" />
              <StatCard title="Bảo trì" value={counts.maintenance} hint="Không nhận khách" tone="bad" />
              <StatCard title="Check-in hôm nay" value={todayCheckIn ?? "—"} hint="(Tuỳ chọn gắn stays)" />
              <StatCard title="Check-out hôm nay" value={todayCheckOut ?? "—"} hint="(Tuỳ chọn gắn stays)" />
              <StatCard
                title="Doanh thu hôm nay"
                value={todayRevenue == null ? "—" : formatVND(todayRevenue)}
                hint="(Từ payments - INCOME)"
              />
            </div>

            {/* Alerts + Shortcuts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
              {/* Alerts */}
              <div className={`${cardClass} p-6 lg:col-span-2`}>
                <div className="border-l-4 border-yellow-400 pl-4 py-1 mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Cảnh báo & việc cần làm</h2>
                  <p className="text-sm text-gray-600 mt-0.5">Tập trung vào các mục cần xử lý ngay</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <AlertItem
                    title="Phòng đang dọn"
                    value={counts.cleaning}
                    desc="Xong dọn thì chuyển Trống để nhận khách"
                    tone={counts.cleaning > 0 ? "warn" : "neutral"}
                  />
                  <AlertItem
                    title="Phòng bảo trì"
                    value={counts.maintenance}
                    desc="Kiểm tra tiến độ sửa chữa"
                    tone={counts.maintenance > 0 ? "bad" : "neutral"}
                  />
                  <AlertItem
                    title="Doanh thu tháng"
                    value={monthRevenue == null ? "—" : formatVND(monthRevenue)}
                    desc="(Từ payments - INCOME)"
                    tone="neutral"
                  />
                  <AlertItem
                    title="Tỷ lệ lấp đầy"
                    value={`${counts.occupancyRate}%`}
                    desc="OCCUPIED / tổng phòng"
                    tone={counts.occupancyRate >= 70 ? "good" : counts.occupancyRate >= 40 ? "warn" : "neutral"}
                  />
                </div>
              </div>

              {/* Shortcuts */}
              <div className={`${cardClass} p-6`}>
                <div className="border-l-4 border-yellow-400 pl-4 py-1 mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Thao tác nhanh</h2>
                  <p className="text-sm text-gray-600 mt-0.5">Đi thẳng tới các mục nghiệp vụ</p>
                </div>

                <div className="space-y-2">
                  <button className={`${btnPrimaryClass} w-full`} onClick={() => nav("/rooms")}>
                    Quản lý phòng / Đặt phòng
                  </button>
                <button className={`${btnOutlineClass} w-full`} onClick={() => nav("/setup")}>
                  Thiết lập cơ sở
                </button>
                  

                  {/* ✅ FIX #1: correct route */}
                  <button
                    className={`${btnOutlineClass} w-full`}
                    onClick={() => nav(propertyId ? `/reports/cashbook?propertyId=${propertyId}` : "/reports/cashbook")}
                  >
                    Thu chi / Hóa đơn
                  </button>


                </div>

                <div className="mt-4 rounded-md border-2 border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  <b>Gợi ý:</b> Dashboard chỉ để xem tổng quan. Mọi thao tác phòng/nhận-trả phòng nằm ở mục
                  <b> “Quản lý phòng / Đặt phòng”.</b>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 text-center">
              <p className="text-xs text-gray-500">
                © {new Date().getFullYear()} Motel Manager. Phần mềm quản lý nhà nghỉ chuyên nghiệp.
              </p>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

/* ---------- UI pieces (same style system) ---------- */

function StatCard({
  title,
  value,
  hint,
  tone = "neutral",
}: {
  title: string;
  value: number | string;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad" | "info";
}) {
  const base = "bg-white border-2 rounded-lg shadow-sm p-6";
  const toneClass =
    tone === "good"
      ? "border-green-200"
      : tone === "warn"
      ? "border-yellow-200"
      : tone === "bad"
      ? "border-red-200"
      : tone === "info"
      ? "border-blue-200"
      : "border-gray-200";

  return (
    <div className={`${base} ${toneClass}`}>
      <div className="text-sm font-semibold text-gray-700">{title}</div>
      <div className="mt-2 text-3xl font-bold text-gray-900">{value}</div>
      {hint ? <div className="mt-2 text-sm text-gray-500">{hint}</div> : null}
    </div>
  );
}

function AlertItem({
  title,
  value,
  desc,
  tone,
}: {
  title: string;
  value: number | string;
  desc: string;
  tone: "neutral" | "good" | "warn" | "bad";
}) {
  const badge =
    tone === "good"
      ? "bg-green-50 text-green-800 border-green-200"
      : tone === "warn"
      ? "bg-yellow-50 text-yellow-900 border-yellow-200"
      : tone === "bad"
      ? "bg-red-50 text-red-800 border-red-200"
      : "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <div className="rounded-md border-2 border-gray-200 p-4 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        <span className={`inline-flex items-center rounded-full border-2 px-3 py-1 text-[12px] font-bold ${badge}`}>
          {value}
        </span>
      </div>
      <div className="mt-2 text-sm text-gray-600">{desc}</div>
    </div>
  );
}

function formatVND(n: number) {
  return n.toLocaleString("vi-VN") + "₫";
}
