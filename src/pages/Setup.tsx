import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { supabase } from "../lib/supabaseClient";

type MsgType = "error" | "success" | "info";
type RoomStatus = "VACANT" | "OCCUPIED" | "CLEANING" | "MAINTENANCE";
type RoomKind = "SINGLE" | "DOUBLE";

type PropertyLite = { id: string; name: string };

type RoomLite = {
  id: string;
  name: string;
  status: RoomStatus | string;
  room_type?: RoomKind | string | null;
  price?: number | null;
};

function clampInt(n: number, min: number, max: number) {
  const x = Number.isFinite(n) ? Math.floor(n) : min;
  return Math.max(min, Math.min(max, x));
}

function formatVND(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("vi-VN") + "₫";
}

function normalizeKind(v: any): RoomKind {
  return v === "DOUBLE" ? "DOUBLE" : "SINGLE";
}

function roomNo(floor: number, index1: number) {
  return floor * 100 + index1; // 101.., 201..
}

export default function Setup() {
  const nav = useNavigate();
  const reduceMotion = useReducedMotion();
  const mountedRef = useRef(true);

  const [loading, setLoading] = useState(true);

  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<MsgType>("info");

  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState("");

  const [rooms, setRooms] = useState<RoomLite[]>([]);

  const [savingProperty, setSavingProperty] = useState(false);
  const [savingRooms, setSavingRooms] = useState(false);

  // Tạo nhanh theo tầng
  const [bulkFloor, setBulkFloor] = useState(1);
  const [bulkCount, setBulkCount] = useState(10);
  const [bulkSinglePrice, setBulkSinglePrice] = useState(150000);
  const [bulkDoublePrice, setBulkDoublePrice] = useState(200000);

  // UI styles (giữ style y như cũ)
  const cardClass = "bg-white border-2 border-gray-200 rounded-lg shadow-sm";
  const btnPrimaryClass =
    "rounded-md bg-yellow-400 py-3 px-4 text-[15px] font-bold text-gray-900 " +
    "hover:bg-yellow-500 active:bg-yellow-600 transition-all shadow-sm " +
    "disabled:opacity-60 disabled:cursor-not-allowed border-2 border-yellow-500";
  const btnOutlineClass =
    "rounded-md border-2 border-gray-300 bg-white py-3 px-4 text-[15px] font-semibold text-gray-700 " +
    "hover:bg-gray-50 hover:border-gray-400 transition-all " +
    "disabled:opacity-60 disabled:cursor-not-allowed";
  const inputClass =
    "w-full rounded-md border-2 border-gray-300 bg-white px-4 py-3 text-[15px] text-gray-900 " +
    "placeholder:text-gray-400 outline-none transition-all " +
    "focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20";

  const setToast = (type: MsgType, text: string) => {
    setMsgType(type);
    setMsg(text);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

      const { data: up, error: upErr } = await supabase
        .from("user_properties")
        .select("property_id")
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!mountedRef.current) return;

      if (upErr) {
        setToast("error", upErr.message);
        setLoading(false);
        return;
      }

      if (!up?.property_id) {
        setPropertyId(null);
        setPropertyName("");
        setRooms([]);
        setLoading(false);
        return;
      }

      setPropertyId(up.property_id);
      await Promise.all([loadProperty(up.property_id), loadRooms(up.property_id)]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProperty = async (pid: string) => {
    const { data, error } = await supabase.from("properties").select("id,name").eq("id", pid).maybeSingle();
    if (!mountedRef.current) return;
    if (error) return setToast("error", error.message);
    const p = data as PropertyLite | null;
    if (p) setPropertyName(p.name ?? "");
  };

  const loadRooms = async (pid: string) => {
    const { data, error } = await supabase
      .from("rooms")
      .select("id,name,status,room_type,price")
      .eq("property_id", pid)
      .order("name");

    if (!mountedRef.current) return;

    if (error) {
      setToast("error", error.message);
      setRooms([]);
      return;
    }

    const list = (data ?? []) as RoomLite[];
    setRooms(
      list.map((r) => ({
        ...r,
        room_type: r.room_type ? normalizeKind(r.room_type) : "SINGLE",
        price: r.price ?? 0,
      }))
    );
  };

  const refresh = async () => {
    setMsg("");
    if (!propertyId) return;
    await Promise.all([loadProperty(propertyId), loadRooms(propertyId)]);
  };

  const createOrUpdateProperty = async () => {
    const name = propertyName.trim();
    if (!name) return setToast("error", "Vui lòng nhập tên cơ sở.");

    setSavingProperty(true);
    setMsg("");

    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return nav("/");

      if (propertyId) {
        const { error } = await supabase.from("properties").update({ name }).eq("id", propertyId);
        if (error) throw error;
        setToast("success", "Đã cập nhật cơ sở.");
        return;
      }

      const { data: prop, error: propErr } = await supabase
        .from("properties")
        .insert({ name })
        .select("id,name")
        .maybeSingle();

      if (propErr) throw propErr;
      if (!prop?.id) throw new Error("Không tạo được cơ sở.");

      const { error: upErr } = await supabase.from("user_properties").insert({
        user_id: auth.user.id,
        property_id: prop.id,
        role: "OWNER",
      });

      if (upErr) throw upErr;

      if (!mountedRef.current) return;

      setPropertyId(prop.id);
      setToast("success", "Tạo cơ sở thành công!");
      await loadRooms(prop.id);
    } catch (e: any) {
      setToast("error", e?.message || "Lỗi tạo/cập nhật cơ sở.");
    } finally {
      if (mountedRef.current) setSavingProperty(false);
    }
  };

  const setRoomField = (id: string, patch: Partial<RoomLite>) => {
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const createRoomsQuick = async () => {
    if (!propertyId) return setToast("error", "Bạn cần tạo cơ sở trước.");

    const f = clampInt(Number(bulkFloor), 1, 99);
    const cnt = clampInt(Number(bulkCount), 1, 200);
    const sp = clampInt(Number(bulkSinglePrice), 0, 1_000_000_000);

    setSavingRooms(true);
    setMsg("");

    try {
      await loadRooms(propertyId);
      const existing = new Set(rooms.map((r) => r.name));

      const payload: any[] = [];
      for (let i = 1; i <= cnt; i++) {
        const name = `Phòng ${roomNo(f, i)}`;
        if (existing.has(name)) continue;

        payload.push({
          property_id: propertyId,
          name,
          status: "VACANT",
          room_type: "SINGLE",
          price: sp,
        });
      }

      if (payload.length === 0) {
        setToast("info", `Tầng ${f} không có phòng mới để tạo.`);
        return;
      }

      const { error } = await supabase.from("rooms").insert(payload);
      if (error) throw error;

      setToast("success", `Đã tạo ${payload.length} phòng tầng ${f}.`);
      await loadRooms(propertyId);
    } catch (e: any) {
      setToast("error", e?.message || "Lỗi tạo phòng nhanh.");
    } finally {
      if (mountedRef.current) setSavingRooms(false);
    }
  };

  const bulkSetAll = (kind: RoomKind, price: number) => {
    setRooms((prev) =>
      prev.map((r) => ({
        ...r,
        room_type: kind,
        price,
      }))
    );
    setToast("info", `Đã set tất cả phòng → ${kind === "SINGLE" ? "Đơn" : "Đôi"} / ${formatVND(price)}. Nhấn “Lưu”.`);
  };

  const saveRoomDetails = async () => {
    if (!propertyId) return setToast("error", "Bạn cần tạo cơ sở trước.");

    const names = rooms.map((r) => r.name.trim());
    const nameSet = new Set(names);
    if (nameSet.size !== names.length) return setToast("error", "Tên phòng bị trùng. Vui lòng sửa để không trùng.");

    setSavingRooms(true);
    setMsg("");

    try {
      for (const r of rooms) {
        const payload = {
          name: r.name.trim(),
          room_type: normalizeKind(r.room_type),
          price: Number(r.price ?? 0) || 0,
        };

        const { error } = await supabase.from("rooms").update(payload).eq("id", r.id);
        if (error) throw error;
      }

      setToast("success", "Đã lưu chi tiết phòng.");
      await loadRooms(propertyId);
    } catch (e: any) {
      setToast("error", e?.message || "Lỗi lưu chi tiết phòng.");
    } finally {
      if (mountedRef.current) setSavingRooms(false);
    }
  };

  const roomTypeCounts = useMemo(() => {
    const single = rooms.filter((r) => normalizeKind(r.room_type) === "SINGLE").length;
    const dbl = rooms.filter((r) => normalizeKind(r.room_type) === "DOUBLE").length;
    return { single, dbl };
  }, [rooms]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-400/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-yellow-400/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        <div className={`${cardClass} p-6 relative z-10`}>Đang tải thiết lập...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 relative overflow-hidden">
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5l7.5 6V20a1 1 0 01-1 1h-5v-6a1 1 0 00-1-1h-3a1 1 0 00-1 1v6h-5a1 1 0 01-1-1v-9.5L12 4.5z" />
                </svg>
              </div>
              <div>
                <h1 className="text-[22px] font-bold text-gray-900 leading-none">Thiết lập cơ sở</h1>
                <div className="text-sm text-gray-600 mt-1">
                  {propertyId ? (
                    <>
                      <b className="text-gray-900">{propertyName || "—"}</b> • Tổng:{" "}
                      <b className="text-gray-900">{rooms.length}</b> • Đơn{" "}
                      <b className="text-gray-900">{roomTypeCounts.single}</b> • Đôi{" "}
                      <b className="text-gray-900">{roomTypeCounts.dbl}</b>
                    </>
                  ) : (
                    <>Bạn chưa có cơ sở — tạo ngay để bắt đầu.</>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={refresh} className={btnOutlineClass} disabled={!propertyId || savingRooms || savingProperty}>
                Tải lại
              </button>
              <button onClick={() => nav("/dashboard")} className={btnOutlineClass} disabled={savingRooms || savingProperty}>
                Về Dashboard
              </button>
              <button onClick={() => nav("/rooms")} className={btnOutlineClass} disabled={!propertyId || savingRooms || savingProperty}>
                Quản lý phòng
              </button>
            </div>
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
                className={`mt-4 rounded-md px-4 py-3 text-sm font-medium flex items-start gap-2.5 border-2 ${
                  msgType === "error"
                    ? "bg-red-50 text-red-800 border-red-200"
                    : msgType === "success"
                    ? "bg-green-50 text-green-800 border-green-200"
                    : "bg-blue-50 text-blue-800 border-blue-200"
                }`}
              >
                <span className="flex-1">{msg}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Property + Quick create */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Property */}
          <div className={`${cardClass} p-6 lg:col-span-2`}>
            <div className="border-l-4 border-yellow-400 pl-4 py-1 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">{propertyId ? "Thông tin cơ sở" : "Tạo cơ sở mới"}</h2>
              <p className="text-sm text-gray-600 mt-0.5">{propertyId ? "Đổi tên cơ sở." : "Tạo cơ sở đầu tiên để sử dụng."}</p>
            </div>

            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Tên cơ sở <span className="text-red-500">*</span>
            </label>
            <input
              className={inputClass}
              value={propertyName}
              onChange={(e) => setPropertyName(e.target.value)}
              placeholder="VD: Nhà nghỉ Hoàng Long"
              disabled={savingProperty || savingRooms}
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <button className={btnPrimaryClass} onClick={createOrUpdateProperty} disabled={savingProperty || savingRooms}>
                {savingProperty ? "Đang lưu..." : propertyId ? "Lưu thay đổi" : "Tạo cơ sở"}
              </button>
            </div>
          </div>

          {/* Quick create */}
          <div className={`${cardClass} p-6`}>
            <div className="border-l-4 border-yellow-400 pl-4 py-1 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Tạo phòng nhanh</h2>
              <p className="text-sm text-gray-600 mt-0.5">Tạo theo tầng (101..).</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-semibold text-gray-700 mb-1">Tầng</div>
                <input type="number" min={1} className={inputClass} value={bulkFloor} onChange={(e) => setBulkFloor(Number(e.target.value))} disabled={!propertyId || savingRooms || savingProperty} />
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-700 mb-1">Số phòng</div>
                <input type="number" min={1} className={inputClass} value={bulkCount} onChange={(e) => setBulkCount(Number(e.target.value))} disabled={!propertyId || savingRooms || savingProperty} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <div className="text-xs font-semibold text-gray-700 mb-1">Giá phòng đơn</div>
                <input type="number" min={0} className={inputClass} value={bulkSinglePrice} onChange={(e) => setBulkSinglePrice(Number(e.target.value))} disabled={!propertyId || savingRooms || savingProperty} />
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-700 mb-1">Giá phòng đôi</div>
                <input type="number" min={0} className={inputClass} value={bulkDoublePrice} onChange={(e) => setBulkDoublePrice(Number(e.target.value))} disabled={!propertyId || savingRooms || savingProperty} />
              </div>
            </div>

            <button className={`${btnPrimaryClass} w-full mt-3`} onClick={createRoomsQuick} disabled={!propertyId || savingRooms || savingProperty}>
              {savingRooms ? "Đang tạo..." : "Tạo nhanh"}
            </button>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <button className={btnOutlineClass} onClick={() => bulkSetAll("SINGLE", clampInt(Number(bulkSinglePrice), 0, 1_000_000_000))} disabled={!propertyId || rooms.length === 0 || savingRooms || savingProperty}>
                Set tất cả → Đơn
              </button>
              <button className={btnOutlineClass} onClick={() => bulkSetAll("DOUBLE", clampInt(Number(bulkDoublePrice), 0, 1_000_000_000))} disabled={!propertyId || rooms.length === 0 || savingRooms || savingProperty}>
                Set tất cả → Đôi
              </button>
            </div>
          </div>
        </div>

        {/* Per-room editor */}
        <div className={`${cardClass} p-6 mt-4`}>
          <div className="border-l-4 border-yellow-400 pl-4 py-1 mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Chỉnh chi tiết từng phòng</h2>
            <p className="text-sm text-gray-600 mt-0.5">Đổi tên phòng, chọn đơn/đôi và giá riêng.</p>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="text-sm text-gray-700">
              Tổng: <b className="text-gray-900">{rooms.length}</b>
            </div>
            <button className={btnPrimaryClass} onClick={saveRoomDetails} disabled={!propertyId || rooms.length === 0 || savingRooms || savingProperty}>
              {savingRooms ? "Đang lưu..." : "Lưu"}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-2 border-gray-200 bg-white rounded-md overflow-hidden">
              <thead className="bg-gray-50">
                <tr className="text-left text-sm font-semibold text-gray-900">
                  <th className="p-3 border-b-2 border-gray-200">Phòng</th>
                  <th className="p-3 border-b-2 border-gray-200">Loại</th>
                  <th className="p-3 border-b-2 border-gray-200">Giá (VND)</th>
                  <th className="p-3 border-b-2 border-gray-200">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.id} className="text-sm text-gray-800">
                    <td className="p-3 border-b border-gray-200 min-w-[220px]">
                      <input className={inputClass} value={r.name} onChange={(e) => setRoomField(r.id, { name: e.target.value })} disabled={!propertyId || savingRooms || savingProperty} />
                    </td>
                    <td className="p-3 border-b border-gray-200 min-w-[180px]">
                      <select className={inputClass} value={normalizeKind(r.room_type)} onChange={(e) => setRoomField(r.id, { room_type: e.target.value as RoomKind })} disabled={!propertyId || savingRooms || savingProperty}>
                        <option value="SINGLE">Phòng đơn</option>
                        <option value="DOUBLE">Phòng đôi</option>
                      </select>
                    </td>
                    <td className="p-3 border-b border-gray-200 min-w-[200px]">
                      <input type="number" min={0} className={inputClass} value={Number(r.price ?? 0)} onChange={(e) => setRoomField(r.id, { price: Number(e.target.value) })} disabled={!propertyId || savingRooms || savingProperty} />
                      <div className="text-xs text-gray-500 mt-1">{formatVND(Number(r.price ?? 0))}</div>
                    </td>
                    <td className="p-3 border-b border-gray-200 min-w-[160px]">
                      <span className="inline-flex items-center rounded-md border-2 border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                        {String(r.status)}
                      </span>
                    </td>
                  </tr>
                ))}

                {rooms.length === 0 ? (
                  <tr>
                    <td className="p-4 text-sm text-gray-600" colSpan={4}>
                      Chưa có phòng nào. Hãy tạo bằng “Tạo nhanh”.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">© {new Date().getFullYear()} Motel Manager.</p>
        </div>
      </motion.div>
    </div>
  );
}
