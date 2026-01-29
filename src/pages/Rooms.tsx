import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { supabase } from "../lib/supabaseClient";
import { signOut } from "../lib/auth";
import { createIncomePaymentFromStay } from "../lib/payments";
import CheckoutModal from "../components/CheckoutModal";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
type MsgType = "error" | "success" | "info";
type RoomStatus = "VACANT" | "OCCUPIED" | "CLEANING" | "MAINTENANCE";

type Room = {
  id: string;
  property_id: string;
  name: string;
  status: RoomStatus;
  default_price: number | null;
  note: string | null;

  // NEW: show guest info on room card after check-in
  guest_name?: string | null;
  guest_phone?: string | null;
  check_in_at?: string | null;
};

type Property = {
  id: string;
  name: string;
};

type ViewMode = "GRID" | "LIST";
type SortMode = "NAME" | "STATUS";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function Rooms() {
  const nav = useNavigate();
  const reduceMotion = useReducedMotion();
  const mountedRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<MsgType>("info");

  // Properties
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  // Rooms
  const [rooms, setRooms] = useState<Room[]>([]);

  // Filters
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<RoomStatus | "ALL">("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("NAME");
  const [viewMode, setViewMode] = useState<ViewMode>("GRID");
  const [floorFilter, setFloorFilter] = useState<number | null>(null);

  // Quick check-in
  const [selectedRoomForCheckIn, setSelectedRoomForCheckIn] = useState<Room | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [unitPriceInput, setUnitPriceInput] = useState("");
  const [submittingCheckIn, setSubmittingCheckIn] = useState(false);

  // Checkout modal
  const [checkoutRoom, setCheckoutRoom] = useState<Room | null>(null);
  const [totalAmountInput, setTotalAmountInput] = useState("");
  const [submittingCheckout, setSubmittingCheckout] = useState(false);

  // Collect payment modal (sau checkout)
  const [collect, setCollect] = useState<null | {
    open: boolean;
    stayId: string;
    roomId: string;
    propertyId: string;
    amount: number;
  }>(null);

  const [payMethod, setPayMethod] = useState<"CASH" | "TRANSFER" | "CARD">("CASH");
  const [payNote, setPayNote] = useState("");
  const [submittingCollect, setSubmittingCollect] = useState(false);

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

  // Shared styles (match Dashboard)
  const cardClass = "bg-white border-2 border-gray-200 rounded-lg shadow-sm";
  const btnPrimaryClass =
    "rounded-md bg-yellow-400 py-3 px-4 text-[15px] font-bold text-gray-900 " +
    "hover:bg-yellow-500 active:bg-yellow-600 transition-all shadow-sm " +
    "disabled:opacity-60 disabled:cursor-not-allowed border-2 border-yellow-500";
  const btnOutlineClass =
    "rounded-md border-2 border-gray-300 bg-white py-3 px-4 text-[15px] font-semibold text-gray-700 " +
    "hover:bg-gray-50 hover:border-gray-400 transition-all " +
    "disabled:opacity-60 disabled:cursor-not-allowed";

  // ───────────────────────────────────────────────────────────────────────────
  // AUTH & LOAD
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (!mountedRef.current) return;
        setLoading(false);
        setToast("error", "Vui lòng đăng nhập");
        return nav("/");
      }

      await loadProperties(auth.user.id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProperties = async (userId: string) => {
    const { data: userProps } = await supabase
      .from("user_properties")
      .select("property_id, role")
      .eq("user_id", userId);

    if (!mountedRef.current) return;

    if (!userProps || userProps.length === 0) {
      setToast("info", "Bạn chưa được gán cơ sở nào");
      return;
    }

    const propIds = userProps.map((up) => up.property_id);
    const { data: props } = await supabase.from("properties").select("id, name").in("id", propIds);

    if (props && mountedRef.current) {
      setProperties(props);
      if (props.length === 1) {
        setSelectedPropertyId(props[0].id);
      }
    }
  };

  const loadRooms = async () => {
    if (!selectedPropertyId) {
      setRooms([]);
      return;
    }

    const { data, error } = await supabase
      .from("rooms")
      .select("id, property_id, name, status, default_price, note")
      .eq("property_id", selectedPropertyId)
      .order("name");

    if (!mountedRef.current) return;

    if (error) {
      setToast("error", "Lỗi khi tải danh sách phòng");
      return;
    }

    const normalized: Room[] = (data || []).map((r) => ({
      ...r,
      default_price: r.default_price != null ? Number(r.default_price) : null,
      guest_name: null,
      guest_phone: null,
      check_in_at: null,
    }));

    // NEW: attach guest_name / guest_phone from latest OPEN stay for each room
    const roomIds = normalized.map((r) => r.id);
    if (roomIds.length > 0) {
      const { data: openStays, error: stayErr } = await supabase
        .from("stays")
        .select("room_id, guest_name, guest_phone, created_at")
        .in("room_id", roomIds)
        .eq("status", "OPEN")
        .order("created_at", { ascending: false });

      if (!stayErr && openStays) {
        const stayByRoom = new Map<
          string,
          { 
            guest_name: string | null;
            guest_phone: string | null;
            check_in_at: string | null; 
          }
        >();
        for (const s of openStays) {
          if (!stayByRoom.has(s.room_id)) {
            stayByRoom.set(s.room_id, {
              guest_name: (s.guest_name ?? null) as string | null,
              guest_phone: (s.guest_phone ?? null) as string | null,
              check_in_at: (s.created_at ?? null) as string | null,
            });
          }
        }

        for (const r of normalized) {
          const st = stayByRoom.get(r.id);
          if (st) {
            r.guest_name = st.guest_name;
            r.guest_phone = st.guest_phone;
            r.check_in_at = st.check_in_at;
          }
        }
      }
    }

    setRooms(normalized);
  };

  useEffect(() => {
    loadRooms();
    // Reset filters when property changes
    setSearchText("");
    setStatusFilter("ALL");
    setSortMode("NAME");
    setFloorFilter(null);
    setSelectedRoomForCheckIn(null);
    clearCheckInInputs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertyId]);

  // ───────────────────────────────────────────────────────────────────────────
  // ACTIONS
  // ───────────────────────────────────────────────────────────────────────────
  const doSignOut = async () => {
    await signOut();
    nav("/");
  };

  const clearCheckInInputs = () => {
    setGuestName("");
    setGuestPhone("");
    setUnitPriceInput("");
  };

  const handleQuickCheckIn = async () => {
    if (!selectedRoomForCheckIn) return;
    if (selectedRoomForCheckIn.status !== "VACANT") {
      setToast("error", "Phòng không ở trạng thái Trống");
      return;
    }

    setSubmittingCheckIn(true);
    const finalPrice =
      unitPriceInput.trim() !== "" ? parseInt(unitPriceInput, 10) : selectedRoomForCheckIn.default_price || 0;

    const { error } = await supabase.rpc("check_in", {
      p_room_id: selectedRoomForCheckIn.id,
      p_guest_name: guestName.trim() || null,
      p_guest_phone: guestPhone.trim() || null,
      p_price_type: "NIGHT",
      p_unit_price: finalPrice,
      p_note: null,
    });

    setSubmittingCheckIn(false);

    if (error) {
      setToast("error", "Lỗi khi nhận phòng");
      return;
    }

    setToast("success", "Nhận phòng thành công!");
    setSelectedRoomForCheckIn(null);
    clearCheckInInputs();
    loadRooms();
  };

  const handleCheckout = async () => {
    if (!checkoutRoom) return;
    const totalAmount = parseInt(totalAmountInput, 10);
    if (isNaN(totalAmount) || totalAmount < 0) {
      setToast("error", "Tổng tiền không hợp lệ");
      return;
    }

    setSubmittingCheckout(true);

    const { data: stayData } = await supabase
      .from("stays")
      .select("id")
      .eq("room_id", checkoutRoom.id)
      .eq("status", "OPEN")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!stayData) {
      setSubmittingCheckout(false);
      setToast("info", "Không tìm thấy đợt thuê đang mở");
      setCheckoutRoom(null);
      setTotalAmountInput("");
      return;
    }

    const { error } = await supabase.rpc("check_out", {
      p_stay_id: stayData.id,
      p_total_amount: totalAmount,
    });

    setSubmittingCheckout(false);

    if (error) {
      setToast("error", "Lỗi khi trả phòng");
      return;
    }

    setToast("success", "Trả phòng thành công! Bấm số tiền để thu.");

    setCollect({
      open: true,
      stayId: stayData.id, // ✅ fixed
      roomId: checkoutRoom.id,
      propertyId: checkoutRoom.property_id,
      amount: totalAmount,
    });

    setCheckoutRoom(null);
    setTotalAmountInput("");
    loadRooms();
  };

  const updateRoomStatus = async (roomId: string, newStatus: RoomStatus) => {
    const oldRooms = [...rooms];
    setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, status: newStatus } : r)));

    const { error } = await supabase.from("rooms").update({ status: newStatus }).eq("id", roomId);

    if (error) {
      setRooms(oldRooms);
      setToast("error", "Lỗi khi cập nhật trạng thái");
    } else {
      setToast("success", "Đã cập nhật trạng thái");
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // COMPUTED
  // ───────────────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const total = rooms.length;
    const vacant = rooms.filter((r) => r.status === "VACANT").length;
    const occupied = rooms.filter((r) => r.status === "OCCUPIED").length;
    const cleaning = rooms.filter((r) => r.status === "CLEANING").length;
    const maintenance = rooms.filter((r) => r.status === "MAINTENANCE").length;

    return { total, vacant, occupied, cleaning, maintenance };
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      const matchSearch =
        r.name.toLowerCase().includes(searchText.toLowerCase()) ||
        (r.note || "").toLowerCase().includes(searchText.toLowerCase());
      const matchStatus = statusFilter === "ALL" || r.status === statusFilter;
      const matchFloor = floorFilter === null || extractFloor(r.name) === floorFilter;
      return matchSearch && matchStatus && matchFloor;
    });
  }, [rooms, searchText, statusFilter, floorFilter]);

  const sortedRooms = useMemo(() => {
    return [...filteredRooms].sort((a, b) => {
      if (sortMode === "NAME") {
        return a.name.localeCompare(b.name);
      } else {
        return a.status.localeCompare(b.status);
      }
    });
  }, [filteredRooms, sortMode]);

  const floors = useMemo(() => {
    return Array.from(new Set(rooms.map((r) => extractFloor(r.name)).filter((f) => f !== null))).sort(
      (a, b) => a! - b!
    );
  }, [rooms]);

  // ───────────────────────────────────────────────────────────────────────────
  // RENDER: LOADING
  // ───────────────────────────────────────────────────────────────────────────
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
                <svg
                  className="w-6 h-6 text-gray-900"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 4h10M5 11h14M5 15h14M5 19h14" />
                </svg>
              </div>

              <div className="flex-1">
                <div className="text-[18px] font-bold text-gray-900 leading-none">Quản lý phòng</div>
                <div className="text-sm text-gray-500 mt-1">Đang tải dữ liệu...</div>
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

  // ───────────────────────────────────────────────────────────────────────────
  // RENDER: MAIN
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 relative overflow-hidden">
      {/* Accent blobs */}
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
                <svg
                  className="w-6 h-6 text-gray-900"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 4h10M5 11h14M5 15h14M5 19h14" />
                </svg>
              </div>

              <div>
                <h1 className="text-[22px] font-bold text-gray-900 leading-none">Quản lý phòng</h1>
                <div className="text-sm text-gray-600 mt-1">
                  Tổng phòng: <b className="text-gray-900">{kpi.total}</b> • Trống:{" "}
                  <b className="text-gray-900">{kpi.vacant}</b> • Đang thuê:{" "}
                  <b className="text-gray-900">{kpi.occupied}</b>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => nav("/dashboard")} className={btnOutlineClass}>
                Dashboard
              </button>
              <button onClick={loadRooms} className={btnOutlineClass}>
                Tải lại
              </button>
              <button onClick={doSignOut} className={btnOutlineClass}>
                Đăng xuất
              </button>
            </div>
          </div>

          {/* Property Selector */}
          {properties.length > 1 && (
            <div className="mt-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Chọn cơ sở</label>
              <select
                value={selectedPropertyId || ""}
                onChange={(e) => setSelectedPropertyId(e.target.value || null)}
                className="rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-[15px] font-medium text-gray-900 hover:border-gray-400 transition-all w-full sm:w-auto"
              >
                <option value="">-- Chọn cơ sở --</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

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

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
          <StatCard title="Tổng" value={kpi.total} onClick={() => setStatusFilter("ALL")} active={statusFilter === "ALL"} />
          <StatCard
            title="Trống"
            value={kpi.vacant}
            tone="good"
            onClick={() => setStatusFilter("VACANT")}
            active={statusFilter === "VACANT"}
          />
          <StatCard
            title="Đang thuê"
            value={kpi.occupied}
            tone="warn"
            onClick={() => setStatusFilter("OCCUPIED")}
            active={statusFilter === "OCCUPIED"}
          />
          <StatCard
            title="Đang dọn"
            value={kpi.cleaning}
            tone="info"
            onClick={() => setStatusFilter("CLEANING")}
            active={statusFilter === "CLEANING"}
          />
          <StatCard
            title="Bảo trì"
            value={kpi.maintenance}
            tone="bad"
            onClick={() => setStatusFilter("MAINTENANCE")}
            active={statusFilter === "MAINTENANCE"}
          />
        </div>

        {/* Quick Check-in Card */}
        <div className={`${cardClass} p-6 mb-4`}>
          <div className="border-l-4 border-yellow-400 pl-4 py-1 mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Check-in nhanh</h2>
            <p className="text-sm text-gray-600 mt-0.5">Bấm vào phòng TRỐNG để chọn, sau đó điền thông tin</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Phòng đang chọn</label>
              <div className="rounded-md border-2 border-gray-200 bg-gray-50 px-4 py-2.5 text-[15px] text-gray-900">
                {selectedRoomForCheckIn
                  ? `${selectedRoomForCheckIn.name} (${mapStatusVN(selectedRoomForCheckIn.status)})`
                  : "Chưa chọn phòng"}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Tên khách</label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="w-full rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-[15px] text-gray-900 hover:border-gray-400 focus:border-yellow-400 focus:outline-none transition-all"
                placeholder="Tùy chọn"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Số điện thoại</label>
              <input
                type="text"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                className="w-full rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-[15px] text-gray-900 hover:border-gray-400 focus:border-yellow-400 focus:outline-none transition-all"
                placeholder="Tùy chọn"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Giá thuê (VND)</label>
              <input
                type="number"
                value={unitPriceInput}
                onChange={(e) => setUnitPriceInput(e.target.value)}
                className="w-full rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-[15px] text-gray-900 hover:border-gray-400 focus:border-yellow-400 focus:outline-none transition-all"
                placeholder={
                  selectedRoomForCheckIn?.default_price
                    ? `Mặc định: ${formatVND(selectedRoomForCheckIn.default_price)}`
                    : "Tùy chọn"
                }
              />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={handleQuickCheckIn}
              disabled={!selectedRoomForCheckIn || selectedRoomForCheckIn.status !== "VACANT" || submittingCheckIn}
              className={btnPrimaryClass}
            >
              {submittingCheckIn ? "Đang xử lý..." : "Nhận phòng"}
            </button>
            <button
              onClick={() => {
                setSelectedRoomForCheckIn(null);
                clearCheckInInputs();
              }}
              className={btnOutlineClass}
            >
              Bỏ chọn
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className={`${cardClass} p-6 mb-4`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Tìm kiếm</label>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-[15px] text-gray-900 hover:border-gray-400 focus:border-yellow-400 focus:outline-none transition-all"
                placeholder="Tên / ghi chú"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Trạng thái</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as RoomStatus | "ALL")}
                className="w-full rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-[15px] font-medium text-gray-900 hover:border-gray-400 focus:border-yellow-400 focus:outline-none transition-all"
              >
                <option value="ALL">Tất cả</option>
                <option value="VACANT">Trống</option>
                <option value="OCCUPIED">Đang thuê</option>
                <option value="CLEANING">Đang dọn</option>
                <option value="MAINTENANCE">Bảo trì</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Tầng</label>
              <select
                value={floorFilter ?? ""}
                onChange={(e) => setFloorFilter(e.target.value ? parseInt(e.target.value, 10) : null)}
                className="w-full rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-[15px] font-medium text-gray-900 hover:border-gray-400 focus:border-yellow-400 focus:outline-none transition-all"
              >
                <option value="">Tất cả</option>
                {floors.map((f) => (
                  <option key={f} value={f!}>
                    Tầng {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Sắp xếp</label>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="w-full rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-[15px] font-medium text-gray-900 hover:border-gray-400 focus:border-yellow-400 focus:outline-none transition-all"
              >
                <option value="NAME">Tên</option>
                <option value="STATUS">Trạng thái</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Hiển thị</label>
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as ViewMode)}
                className="w-full rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-[15px] font-medium text-gray-900 hover:border-gray-400 focus:border-yellow-400 focus:outline-none transition-all"
              >
                <option value="GRID">Lưới</option>
                <option value="LIST">Danh sách</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchText("");
                  setStatusFilter("ALL");
                  setSortMode("NAME");
                  setFloorFilter(null);
                }}
                className={btnOutlineClass + " w-full"}
              >
                Xóa bộ lọc
              </button>
            </div>
          </div>
        </div>

        {/* Rooms List */}
        {sortedRooms.length === 0 ? (
          <div className={`${cardClass} p-6 text-center`}>
            <div className="text-gray-500">Không có phòng nào</div>
          </div>
        ) : (
          <div
            className={
              viewMode === "GRID"
                ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                : "space-y-3"
            }
          >
            {sortedRooms.map((room) => {
              const isSelected = selectedRoomForCheckIn && selectedRoomForCheckIn.id === room.id;

              return (
                <RoomCard
                  key={room.id}
                  room={room}
                  isSelected={!!isSelected}
                  onSelect={() => {
                    if (room.status === "VACANT") {
                      setSelectedRoomForCheckIn(room);
                    }
                  }}
                  onCheckout={() => setCheckoutRoom(room)}
                  onStatusChange={(newStatus) =>
                    updateRoomStatus(room.id, newStatus)
                  }
                />
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            © {new Date().getFullYear()} Motel Manager. Phần mềm quản lý nhà nghỉ
            chuyên nghiệp.
          </p>
        </div>
      </motion.div>

      {/* Checkout Modal */}
      {checkoutRoom && (
        <CheckoutModal
          room={checkoutRoom}
          totalAmountInput={totalAmountInput}
          setTotalAmountInput={setTotalAmountInput}
          submittingCheckout={submittingCheckout}
          onCheckout={handleCheckout}
          onClose={() => {
            setCheckoutRoom(null);
            setTotalAmountInput("");
          }}
        />
      )}

      {/* Collect Modal */}
      {collect?.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4"
          onClick={() => setCollect(null)}
        >
          <div
            className="bg-white border-2 border-gray-200 rounded-lg shadow-sm p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-l-4 border-yellow-400 pl-4 py-1 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Thu tiền
              </h2>
              <p className="text-sm text-gray-600 mt-0.5">
                Bấm vào số tiền để tạo phiếu thu
              </p>
            </div>

            {/* Amount button */}
            <button
              className="w-full rounded-md bg-yellow-400 py-3 px-4 text-[18px] font-extrabold text-gray-900 hover:bg-yellow-500 border-2 border-yellow-500"
              disabled={submittingCollect}
              onClick={async () => {
                try {
                  setSubmittingCollect(true);

                  const { data: auth } =
                    await supabase.auth.getUser();
                  if (!auth.user) throw new Error("Chưa đăng nhập");

                  // TODO: insert payments ở bước sau
                  const created = await createIncomePaymentFromStay({
                    propertyId: collect.propertyId,
                    stayId: collect.stayId,
                    roomId: collect.roomId,
                    amount: collect.amount,
                    method: payMethod,
                    note: payNote,
                    userId: auth.user.id,
                  });

                  // (khuyên) update stay để tránh thu trùng
                  await supabase
                    .from("stays")
                    .update({
                      payment_status: "PAID",
                      paid_amount: collect.amount,
                    })
                    .eq("id", collect.stayId);

                  setCollect(null);
                  setPayMethod("CASH");
                  setPayNote("");

                  // chuyển sang báo cáo + focus dòng vừa thu
                  nav(
                    `/reports/cashbook?propertyId=${collect.propertyId}&focus=${created.id}`
                  );

                } catch (e: unknown) {
                  const message = e instanceof Error ? e.message : "Lỗi thu tiền";
                  alert(message);
                } finally {
                  setSubmittingCollect(false);
                }
              }}
            >
              {collect.amount.toLocaleString("vi-VN")} đ
            </button>

            <div className="mt-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Phương thức
              </label>
              <select
                className="w-full rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-[15px]"
                value={payMethod}
                onChange={(e) =>
                  setPayMethod(e.target.value as "CASH" | "TRANSFER" | "CARD")
                }
              >
                <option value="CASH">Tiền mặt</option>
                <option value="TRANSFER">Chuyển khoản</option>
                <option value="CARD">Thẻ</option>
              </select>
            </div>

            <div className="mt-3">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Ghi chú
              </label>
              <input
                className="w-full rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-[15px]"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder="Tuỳ chọn"
              />
            </div>

            <div className="flex gap-2 mt-4 justify-end">
              <button
                className="rounded-md border-2 border-gray-300 bg-white py-2 px-4 text-[15px] font-semibold text-gray-700"
                onClick={() => setCollect(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function formatVND(n: number) {
  try {
    return n.toLocaleString("vi-VN") + " đ";
  } catch {
    return `${n} đ`;
  }
}

function mapStatusVN(s: RoomStatus) {
  switch (s) {
    case "VACANT":
      return "Trống";
    case "OCCUPIED":
      return "Đang thuê";
    case "CLEANING":
      return "Đang dọn";
    case "MAINTENANCE":
      return "Bảo trì";
    default:
      return s;
  }
}

// Tách tầng từ tên phòng: 1001 -> tầng 1, 2005 -> tầng 2
function extractFloor(roomName: string): number | null {
  const m = roomName.match(/\d+/);
  if (!m) return null;
  const num = parseInt(m[0], 10);
  if (Number.isNaN(num)) return null;

  // Nếu >= 1000: dùng chữ số hàng nghìn làm tầng
  if (num >= 1000) return Math.floor(num / 1000);

  // Nếu chỉ 2-3 chữ số: lấy chữ số đầu (tạm)
  const s = String(num);
  if (s.length >= 2) return parseInt(s[0], 10);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI PIECES
// ─────────────────────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: RoomStatus }) {
  const cls =
    status === "VACANT"
      ? "border-green-300 text-green-700 bg-green-50"
      : status === "OCCUPIED"
      ? "border-yellow-300 text-yellow-800 bg-yellow-50"
      : status === "CLEANING"
      ? "border-blue-300 text-blue-800 bg-blue-50"
      : "border-red-300 text-red-800 bg-red-50";

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
      {mapStatusVN(status)}
    </span>
  );
}

function StatCard(props: {
  title: string;
  value: number;
  onClick?: () => void;
  active?: boolean;
  tone?: "good" | "warn" | "info" | "bad";
}) {
  const { title, value, onClick, active, tone } = props;

  const toneBorder =
    tone === "good"
      ? "border-green-200"
      : tone === "warn"
      ? "border-yellow-200"
      : tone === "info"
      ? "border-blue-200"
      : tone === "bad"
      ? "border-red-200"
      : "border-gray-200";

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "text-left bg-white border-2 rounded-lg shadow-sm px-4 py-3 transition-all",
        "hover:shadow",
        toneBorder,
        active ? "ring-2 ring-yellow-300" : "",
      ].join(" ")}
    >
      <div className="text-sm font-semibold text-gray-700">{title}</div>
      <div className="text-2xl font-extrabold text-gray-900 mt-1">{value}</div>
    </button>
  );
}

function RoomCard(props: {
  room: Room;
  isSelected: boolean;
  onSelect: () => void;
  onCheckout: () => void;
  onStatusChange: (s: RoomStatus) => void;
}) {
  const { room, isSelected, onSelect, onCheckout, onStatusChange } = props;

  const clickable = room.status === "VACANT";

  return (
    <div
      className={[
        "bg-white border-2 rounded-lg shadow-sm p-4 transition-all",
        isSelected ? "border-yellow-400" : "border-gray-200",
        clickable ? "cursor-pointer hover:border-gray-300" : "",
      ].join(" ")}
      onClick={() => {
        if (clickable) onSelect();
      }}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : -1}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-extrabold text-gray-900">{room.name}</div>
          <div className="mt-1">
            <StatusPill status={room.status} />
          </div>
        </div>

        {room.default_price != null && (
          <div className="text-sm font-semibold text-gray-700">{formatVND(room.default_price)}</div>
        )}
      </div>

      {/* Guest info (nếu có) */}
      {(room.guest_name || room.guest_phone) && (
        <div className="mt-2 text-sm text-gray-600">
          {room.guest_name ? (
            <div>
              Khách: <b>{room.guest_name}</b>
            </div>
            ) : null}
          {room.guest_phone ? (
            <div>
              SĐT: <b>{room.guest_phone}</b>
            </div>
          )}
        </div>
      )}

        {/* Check-in time – luôn hiện nếu có */}
          {room.check_in_at && (
            <div className="text-xs text-gray-500 mt-1">
              Check-in:{" "}
              <b>
                {new Date(room.check_in_at).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </b>
            </div>
          )}


      {room.note && <div className="mt-2 text-sm text-gray-500 italic">{room.note}</div>}

      {/* Actions */}
      <div className="mt-3 flex gap-2 flex-wrap">
        {room.status === "VACANT" && (
          <button
            type="button"
            className="px-3 py-2 rounded-md border-2 border-green-300 bg-green-50 text-green-800 text-sm font-bold hover:bg-green-100"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            Chọn phòng
          </button>
        )}

        {room.status === "OCCUPIED" && (
          <button
            type="button"
            className="px-3 py-2 rounded-md border-2 border-yellow-300 bg-yellow-50 text-yellow-900 text-sm font-bold hover:bg-yellow-100"
            onClick={(e) => {
              e.stopPropagation();
              onCheckout();
            }}
          >
            Trả phòng
          </button>
        )}

        {room.status === "CLEANING" && (
          <button
            type="button"
            className="px-3 py-2 rounded-md border-2 border-green-300 bg-green-600 text-white text-sm font-bold hover:bg-green-700"
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange("VACANT");
            }}
          >
            Đánh dấu: Trống
          </button>
        )}

        {room.status !== "MAINTENANCE" ? (
          <button
            type="button"
            className="px-3 py-2 rounded-md border-2 border-red-200 bg-white text-red-700 text-sm font-bold hover:bg-red-50"
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange("MAINTENANCE");
            }}
          >
            Bảo trì
          </button>
        ) : (
          <button
            type="button"
            className="px-3 py-2 rounded-md border-2 border-gray-300 bg-white text-gray-700 text-sm font-bold hover:bg-gray-50"
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange("VACANT");
            }}
          >
            Kết thúc bảo trì
          </button>
        )}

        {room.status === "OCCUPIED" && (
          <button
            type="button"
            className="px-3 py-2 rounded-md border-2 border-blue-200 bg-white text-blue-800 text-sm font-bold hover:bg-blue-50"
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange("CLEANING");
            }}
          >
            Chuyển: Đang dọn
          </button>
        )}
      </div>
    </div>
  );
}

