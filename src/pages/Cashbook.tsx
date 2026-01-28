import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabaseClient";
import { signOut } from "../lib/auth";

type WorkSheetWithCols = XLSX.WorkSheet & { "!cols"?: XLSX.ColInfo[] };
type PaymentType = "INCOME" | "EXPENSE";
type PaymentMethod = "CASH" | "TRANSFER" | "CARD";

type PaymentRow = {
  id: string;
  type: PaymentType;
  amount: number;
  method: PaymentMethod;
  note: string | null;
  paid_at: string;
  stay_id: string | null;
  room_id: string | null;
};

type RoomLite = {
  id: string;
  name: string;
};

type FilterMode = "TODAY" | "D7" | "D30" | "RANGE";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

function formatVND(n: number) {
  try {
    return n.toLocaleString("vi-VN") + " đ";
  } catch {
    return `${n} đ`;
  }
}

function mapMethodVN(m: PaymentMethod) {
  switch (m) {
    case "CASH":
      return "Tiền mặt";
    case "TRANSFER":
      return "Chuyển khoản";
    case "CARD":
      return "Thẻ";
    default:
      return m;
  }
}

function mapTypeVN(t: PaymentType) {
  return t === "INCOME" ? "Thu" : "Chi";
}

function toYYYYMMDD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfDayISO(dateStrYYYYMMDD: string) {
  return new Date(dateStrYYYYMMDD + "T00:00:00").toISOString();
}
function endOfDayISO(dateStrYYYYMMDD: string) {
  return new Date(dateStrYYYYMMDD + "T23:59:59.999").toISOString();
}

/* ---------------- Excel helpers (.xlsx) ---------------- */

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportWorkbookXLSX(params: {
  filename: string;
  sheets: Array<{
    name: string;
    rows: Array<Record<string, unknown>>;
    colWidths?: number[];
  }>;
}) {
  const wb = XLSX.utils.book_new();

  for (const s of params.sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows);
    if (s.colWidths?.length) {
      (ws as WorkSheetWithCols)["!cols"] = s.colWidths.map((w) => ({ wch: w }));
    }
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  downloadBlob(params.filename, blob);
}

/* ------------------------------------------------------- */

export default function Cashbook() {
  const nav = useNavigate();
  const reduceMotion = useReducedMotion();
  const mountedRef = useRef(true);

  const q = useQuery();
  const focusId = q.get("focus");
  const propertyIdFromUrl = q.get("propertyId");

  // Shared styles (match Dashboard/Rooms)
  const cardClass = "bg-white border-2 border-gray-200 rounded-lg shadow-sm";
  const btnPrimaryClass =
    "rounded-md bg-yellow-400 py-3 px-4 text-[15px] font-bold text-gray-900 " +
    "hover:bg-yellow-500 active:bg-yellow-600 transition-all shadow-sm " +
    "disabled:opacity-60 disabled:cursor-not-allowed border-2 border-yellow-500";
  const btnOutlineClass =
    "rounded-md border-2 border-gray-300 bg-white py-3 px-4 text-[15px] font-semibold text-gray-700 " +
    "hover:bg-gray-50 hover:border-gray-400 transition-all " +
    "disabled:opacity-60 disabled:cursor-not-allowed";

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string>("");
  const [msgType, setMsgType] = useState<"error" | "success" | "info">("info");

  const [propertyId, setPropertyId] = useState<string | null>(null);

  // Date inputs
  const [selectedDate, setSelectedDate] = useState<string>(() => toYYYYMMDD(new Date())); // day/month cards use this
  const [filterMode, setFilterMode] = useState<FilterMode>("TODAY");
  const [rangeFrom, setRangeFrom] = useState<string>(() => toYYYYMMDD(new Date()));
  const [rangeTo, setRangeTo] = useState<string>(() => toYYYYMMDD(new Date()));

  // Rooms map for labels + dropdown
  const [rooms, setRooms] = useState<RoomLite[]>([]);
  const [roomNameById, setRoomNameById] = useState<Record<string, string>>({});

  // List rows (based on filter range)
  const [rows, setRows] = useState<PaymentRow[]>([]);

  // Totals: exact by querying, not guessed from current list
  const [dayIncome, setDayIncome] = useState(0);
  const [dayExpense, setDayExpense] = useState(0);

  const [monthIncome, setMonthIncome] = useState(0);
  const [monthExpense, setMonthExpense] = useState(0);

  // Manual expense form
  const [expAmount, setExpAmount] = useState<string>("");
  const [expMethod, setExpMethod] = useState<PaymentMethod>("CASH");
  const [expNote, setExpNote] = useState<string>("");
  const [expDate, setExpDate] = useState<string>(() => toYYYYMMDD(new Date()));
  const [expRoomId, setExpRoomId] = useState<string>(""); // optional
  const [submittingExpense, setSubmittingExpense] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setToast = (type: "error" | "success" | "info", text: string) => {
    setMsgType(type);
    setMsg(text);
  };

  // Resolve propertyId (prefer URL)
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

      if (propertyIdFromUrl) {
        setPropertyId(propertyIdFromUrl);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("user_properties")
        .select("property_id")
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!mountedRef.current) return;

      if (error || !data?.property_id) {
        setToast("info", "Bạn chưa được gán cơ sở.");
        setPropertyId(null);
        setLoading(false);
        return;
      }

      setPropertyId(data.property_id);
      setLoading(false);
    })();
  }, [nav, propertyIdFromUrl]);

  // Compute range for list based on filterMode
  const listRange = useMemo(() => {
    if (filterMode === "TODAY") {
      return { startISO: startOfDayISO(selectedDate), endISO: endOfDayISO(selectedDate) };
    }

    if (filterMode === "D7" || filterMode === "D30") {
      const days = filterMode === "D7" ? 7 : 30;
      const end = new Date(selectedDate + "T23:59:59.999");
      const start = new Date(end);
      start.setDate(start.getDate() - (days - 1));
      start.setHours(0, 0, 0, 0);
      return { startISO: start.toISOString(), endISO: end.toISOString() };
    }

    // RANGE
    const start = new Date(rangeFrom + "T00:00:00");
    const end = new Date(rangeTo + "T23:59:59.999");
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }, [filterMode, selectedDate, rangeFrom, rangeTo]);

  // Month range based on selectedDate (for month cards)
  const monthRange = useMemo(() => {
    const d = new Date(selectedDate + "T00:00:00");
    const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
    return { startISO: start.toISOString(), endISO: next.toISOString() };
  }, [selectedDate]);

  const refreshAll = async () => {
    if (!propertyId) return;

    setLoading(true);
    setMsg("");

    try {
      // Load rooms (for labels + dropdown)
      const { data: roomsData, error: roomsErr } = await supabase
        .from("rooms")
        .select("id,name")
        .eq("property_id", propertyId)
        .order("name", { ascending: true });

      if (roomsErr) throw roomsErr;

      const rs = (roomsData ?? []) as Array<{ id: string; name: string | null }>;
      const map: Record<string, string> = {};
      const list: RoomLite[] = [];
      for (const r of rs) {
        const id = String(r.id);
        const name = String(r.name ?? "");
        map[id] = name;
        list.push({ id, name });
      }
      if (!mountedRef.current) return;
      setRooms(list);
      setRoomNameById(map);

      // 1) Load list rows by range (history list)
      const { data: payList, error: payListErr } = await supabase
        .from("payments")
        .select("id,type,amount,method,note,paid_at,stay_id,room_id")
        .eq("property_id", propertyId)
        .gte("paid_at", listRange.startISO)
        .lte("paid_at", listRange.endISO)
        .order("paid_at", { ascending: false });

      if (payListErr) throw payListErr;

      // 2) Load month totals (month cards)
      const { data: payMonth, error: payMonthErr } = await supabase
        .from("payments")
        .select("type,amount")
        .eq("property_id", propertyId)
        .gte("paid_at", monthRange.startISO)
        .lt("paid_at", monthRange.endISO);

      if (payMonthErr) throw payMonthErr;

      // 3) Load day totals exactly for selectedDate (day cards)
      const dayStart = startOfDayISO(selectedDate);
      const dayEnd = endOfDayISO(selectedDate);
      const { data: payDay, error: payDayErr } = await supabase
        .from("payments")
        .select("type,amount")
        .eq("property_id", propertyId)
        .gte("paid_at", dayStart)
        .lte("paid_at", dayEnd);

      if (payDayErr) throw payDayErr;

      if (!mountedRef.current) return;

      setRows((payList ?? []) as PaymentRow[]);
      
      const payMonthRows = (payMonth ?? []) as Array<{ type: PaymentType; amount: number | null }>;
      const payDayRows = (payDay ?? []) as Array<{ type: PaymentType; amount: number | null }>;

      const mIncome = payMonthRows
        .filter((r) => r.type === "INCOME")
        .reduce((s, r) => s + Number(r.amount ?? 0), 0);

      const mExpense = payMonthRows
        .filter((r) => r.type === "EXPENSE")
        .reduce((s, r) => s + Number(r.amount ?? 0), 0);

      setMonthIncome(mIncome);
      setMonthExpense(mExpense);

      const dIncome = payDayRows
        .filter((r) => r.type === "INCOME")
        .reduce((s, r) => s + Number(r.amount ?? 0), 0);

      const dExpense = payDayRows
        .filter((r) => r.type === "EXPENSE")
        .reduce((s, r) => s + Number(r.amount ?? 0), 0);

      setDayIncome(dIncome);
      setDayExpense(dExpense);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Lỗi tải sổ thu/chi.";
      if (!mountedRef.current) return;
      setToast("error", message);
      setRows([]);
      setMonthIncome(0);
      setMonthExpense(0);
      setDayIncome(0);
      setDayExpense(0);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!propertyId) return;
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, selectedDate, filterMode, rangeFrom, rangeTo]);

  // Auto-focus scroll after list loaded
  useEffect(() => {
    if (!focusId) return;
    if (rows.length === 0) return;

    const t = setTimeout(() => {
      const el = document.getElementById(`pay-${focusId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);

    return () => clearTimeout(t);
  }, [focusId, rows.length]);

  const dayProfit = dayIncome - dayExpense;
  const monthProfit = monthIncome - monthExpense;

  // Range totals from list rows
  const rangeTotals = useMemo(() => {
    const income = rows.filter((r) => r.type === "INCOME").reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const expense = rows.filter((r) => r.type === "EXPENSE").reduce((s, r) => s + Number(r.amount ?? 0), 0);
    return { income, expense, profit: income - expense };
  }, [rows]);

  const doSignOut = async () => {
    await signOut();
    nav("/");
  };

  const rangeLabel = useMemo(() => {
    if (filterMode === "TODAY") return `Ngày ${selectedDate}`;
    if (filterMode === "D7") return `7 ngày gần nhất (tính đến ${selectedDate})`;
    if (filterMode === "D30") return `30 ngày gần nhất (tính đến ${selectedDate})`;
    return `Từ ${rangeFrom} đến ${rangeTo}`;
  }, [filterMode, selectedDate, rangeFrom, rangeTo]);

  const onExportXLSX = () => {
    const cashbookRows = rows.map((r) => {
      const roomName = r.room_id ? roomNameById[r.room_id] : "";
      const room = roomName ? `Phòng ${roomName}` : "";
      return {
        "Thời gian": new Date(r.paid_at).toLocaleString("vi-VN"),
        "Loại": r.type === "INCOME" ? "THU" : "CHI",
        "Số tiền": Number(r.amount ?? 0),
        "Phương thức": mapMethodVN(r.method),
        "Phòng": room,
        "Ghi chú": r.note ?? "",
        "Mã phiếu": r.id,
        "Stay ID": r.stay_id ?? "",
      };
    });

    const summaryRows = [
      {
        "Mục": "Tổng hợp NGÀY (theo ngày mốc)",
        "Khoảng": selectedDate,
        "Thu": dayIncome,
        "Chi": dayExpense,
        "Lợi nhuận": dayProfit,
        "Ghi chú": "Tính từ bảng payments theo ngày mốc",
      },
      {
        "Mục": "Tổng hợp THÁNG (theo ngày mốc)",
        "Khoảng": `Tháng của ${selectedDate}`,
        "Thu": monthIncome,
        "Chi": monthExpense,
        "Lợi nhuận": monthProfit,
        "Ghi chú": "Tính từ bảng payments theo tháng của ngày mốc",
      },
      {
        "Mục": "Tổng hợp thời gian chọn (danh sách đang xem)",
        "Khoảng": rangeLabel,
        "Thu": rangeTotals.income,
        "Chi": rangeTotals.expense,
        "Lợi nhuận": rangeTotals.profit,
        "Ghi chú": "Tính từ danh sách phiếu đang hiển thị",
      },
      {
        "Mục": "Thông tin xuất file",
        "Khoảng": new Date().toLocaleString("vi-VN"),
        "Thu": "",
        "Chi": "",
        "Lợi nhuận": "",
        "Ghi chú": propertyId ? `property_id: ${propertyId}` : "",
      },
    ];

    const filename =
      filterMode === "TODAY"
        ? `cashbook_${selectedDate}.xlsx`
        : filterMode === "D7"
        ? `cashbook_${selectedDate}_7days.xlsx`
        : filterMode === "D30"
        ? `cashbook_${selectedDate}_30days.xlsx`
        : `cashbook_${rangeFrom}_to_${rangeTo}.xlsx`;

    exportWorkbookXLSX({
      filename,
      sheets: [
        {
          name: "Cashbook",
          rows: cashbookRows,
          colWidths: [20, 8, 12, 14, 12, 40, 18, 18],
        },
        {
          name: "Summary",
          rows: summaryRows,
          colWidths: [30, 22, 12, 12, 12, 40],
        },
      ],
    });
  };

  const submitExpense = async () => {
    if (!propertyId) return;

    const amount = Number(expAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setToast("error", "Số tiền chi không hợp lệ.");
      return;
    }

    try {
      setSubmittingExpense(true);
      setMsg("");

      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        nav("/");
        return;
      }

      const { data: created, error } = await supabase
        .from("payments")
        .insert({
          property_id: propertyId,
          stay_id: null,
          room_id: expRoomId ? expRoomId : null,
          type: "EXPENSE",
          amount,
          method: expMethod,
          note: expNote || null,
          created_by: auth.user.id,
          paid_at: new Date(expDate + "T12:00:00").toISOString(),
        })
        .select("id")
        .maybeSingle();

      if (error) throw error;

      setToast("success", "Đã tạo phiếu chi.");
      setExpAmount("");
      setExpNote("");
      setExpMethod("CASH");
      setExpRoomId("");

      // show immediately
      setSelectedDate(expDate);

      await refreshAll();

      if (created?.id) {
        nav(`/reports/cashbook?propertyId=${propertyId}&focus=${created.id}`);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Đã xảy ra lỗi.";
      if (mountedRef.current) setToast("error", message);
    } finally {
      setSubmittingExpense(false);
    }
  };

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
                <svg className="w-6 h-6 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </div>

              <div>
                <h1 className="text-[22px] font-bold text-gray-900 leading-none">Sổ Thu/Chi</h1>
                <div className="text-sm text-gray-600 mt-1">
                  {propertyId ? (
                    <>
                      Cơ sở: <b className="text-gray-900">{propertyId.slice(0, 8)}...</b>
                      {focusId ? (
                        <>
                          {" "}
                          • Focus: <b className="text-gray-900">{focusId.slice(0, 8)}...</b>
                        </>
                      ) : null}
                    </>
                  ) : (
                    "Chưa có cơ sở"
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => nav("/dashboard")} className={btnOutlineClass}>
                Dashboard
              </button>
              <button onClick={() => nav("/rooms")} className={btnOutlineClass}>
                Phòng
              </button>
              <button onClick={refreshAll} className={btnOutlineClass} disabled={!propertyId || loading}>
                Tải lại
              </button>
              <button onClick={onExportXLSX} className={btnOutlineClass} disabled={loading || rows.length === 0}>
                Xuất Excel (.xlsx)
              </button>
              <button onClick={doSignOut} className={btnOutlineClass}>
                Đăng xuất
              </button>
            </div>
          </div>

          {/* Date + quick filter */}
          <div className="mt-4 flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Ngày mốc (cho thẻ NGÀY/THÁNG)</label>
              <input
                type="date"
                className="rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-[15px] text-gray-900 hover:border-gray-400 focus:border-yellow-400 focus:outline-none transition-all"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  if (filterMode === "RANGE") return;
                  setRangeFrom(e.target.value);
                  setRangeTo(e.target.value);
                }}
                disabled={loading}
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                className={[btnOutlineClass, filterMode === "TODAY" ? "ring-2 ring-yellow-300" : ""].join(" ")}
                onClick={() => setFilterMode("TODAY")}
                disabled={loading}
              >
                Hôm nay
              </button>
              <button
                type="button"
                className={[btnOutlineClass, filterMode === "D7" ? "ring-2 ring-yellow-300" : ""].join(" ")}
                onClick={() => setFilterMode("D7")}
                disabled={loading}
              >
                7 ngày
              </button>
              <button
                type="button"
                className={[btnOutlineClass, filterMode === "D30" ? "ring-2 ring-yellow-300" : ""].join(" ")}
                onClick={() => setFilterMode("D30")}
                disabled={loading}
              >
                30 ngày
              </button>
              <button
                type="button"
                className={[btnOutlineClass, filterMode === "RANGE" ? "ring-2 ring-yellow-300" : ""].join(" ")}
                onClick={() => setFilterMode("RANGE")}
                disabled={loading}
              >
                Khoảng ngày
              </button>
            </div>

            {filterMode === "RANGE" ? (
              <div className="flex items-end gap-2 flex-wrap">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Từ ngày</label>
                  <input
                    type="date"
                    className="rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-[15px] text-gray-900 hover:border-gray-400 focus:border-yellow-400 focus:outline-none transition-all"
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Đến ngày</label>
                  <input
                    type="date"
                    className="rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-[15px] text-gray-900 hover:border-gray-400 focus:border-yellow-400 focus:outline-none transition-all"
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* Toast */}
          {msg ? (
            <div
              className={`mt-4 rounded-md px-4 py-3 text-sm font-medium flex items-start gap-2.5 border-2 ${
                msgType === "error"
                  ? "bg-red-50 text-red-800 border-red-200"
                  : msgType === "success"
                  ? "bg-green-50 text-green-800 border-green-200"
                  : "bg-blue-50 text-blue-800 border-blue-200"
              }`}
            >
              <span className="flex-1">{msg}</span>
            </div>
          ) : null}
        </div>

        {/* Head cards: DAY */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className={`${cardClass} p-6`}>
            <div className="text-sm font-semibold text-gray-700">Thu (ngày)</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{formatVND(dayIncome)}</div>
            <div className="mt-2 text-sm text-gray-500">Ngày: {selectedDate}</div>
          </div>
          <div className={`${cardClass} p-6`}>
            <div className="text-sm font-semibold text-gray-700">Chi (ngày)</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{formatVND(dayExpense)}</div>
            <div className="mt-2 text-sm text-gray-500">Ngày: {selectedDate}</div>
          </div>
          <div className={`${cardClass} p-6`}>
            <div className="text-sm font-semibold text-gray-700">Lợi nhuận (ngày)</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{formatVND(dayProfit)}</div>
            <div className="mt-2 text-sm text-gray-500">Thu - Chi</div>
          </div>
        </div>

        {/* Head cards: MONTH */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className={`${cardClass} p-6`}>
            <div className="text-sm font-semibold text-gray-700">Thu (tháng)</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{formatVND(monthIncome)}</div>
            <div className="mt-2 text-sm text-gray-500">Tháng của ngày đang chọn</div>
          </div>
          <div className={`${cardClass} p-6`}>
            <div className="text-sm font-semibold text-gray-700">Chi (tháng)</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{formatVND(monthExpense)}</div>
            <div className="mt-2 text-sm text-gray-500">Tháng của ngày đang chọn</div>
          </div>
          <div className={`${cardClass} p-6`}>
            <div className="text-sm font-semibold text-gray-700">Lợi nhuận (tháng)</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{formatVND(monthProfit)}</div>
            <div className="mt-2 text-sm text-gray-500">Thu - Chi</div>
          </div>
        </div>

        {/* Range cards: current filter */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className={`${cardClass} p-6`}>
            <div className="text-sm font-semibold text-gray-700">Thu (thời gian chọn)</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{formatVND(rangeTotals.income)}</div>
            <div className="mt-2 text-sm text-gray-500">{rangeLabel}</div>
          </div>
          <div className={`${cardClass} p-6`}>
            <div className="text-sm font-semibold text-gray-700">Chi (thời gian chọn)</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{formatVND(rangeTotals.expense)}</div>
            <div className="mt-2 text-sm text-gray-500">{rangeLabel}</div>
          </div>
          <div className={`${cardClass} p-6`}>
            <div className="text-sm font-semibold text-gray-700">Lợi nhuận (thời gian chọn)</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{formatVND(rangeTotals.profit)}</div>
            <div className="mt-2 text-sm text-gray-500">{rangeLabel}</div>
          </div>
        </div>

        {/* Manual expense entry */}
        <div className={`${cardClass} p-6 mb-4`}>
          <div className="border-l-4 border-yellow-400 pl-4 py-1 mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Tạo phiếu chi (nhập tay)</h2>
            <p className="text-sm text-gray-600 mt-0.5">Ghi chi phí phát sinh: điện nước, sửa chữa, mua đồ, lương...</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Ngày chi</label>
              <input
                type="date"
                className="w-full rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-[15px] text-gray-900 hover:border-gray-400 focus:border-yellow-400 focus:outline-none transition-all"
                value={expDate}
                onChange={(e) => setExpDate(e.target.value)}
                disabled={submittingExpense}
              />
            </div>

            <div className="md:col-span-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Số tiền chi</label>
              <input
                type="number"
                className="w-full rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-[15px] text-gray-900 hover:border-gray-400 focus:border-yellow-400 focus:outline-none transition-all"
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                placeholder="VD: 200000"
                disabled={submittingExpense}
              />
            </div>

            <div className="md:col-span-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Phương thức</label>
              <select
                className="w-full rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-[15px] text-gray-900 hover:border-gray-400 focus:border-yellow-400 focus:outline-none transition-all"
                value={expMethod}
                onChange={(e) => setExpMethod(e.target.value as PaymentMethod)}
                disabled={submittingExpense}
              >
                <option value="CASH">Tiền mặt</option>
                <option value="TRANSFER">Chuyển khoản</option>
                <option value="CARD">Thẻ</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Chi gì (ghi chú)</label>
              <input
                className="w-full rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-[15px] text-gray-900 hover:border-gray-400 focus:border-yellow-400 focus:outline-none transition-all"
                value={expNote}
                onChange={(e) => setExpNote(e.target.value)}
                placeholder="VD: Mua vật tư sửa lavabo phòng 203"
                disabled={submittingExpense}
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Gán phòng (tuỳ chọn)</label>
              <select
                className="w-full rounded-md border-2 border-gray-300 bg-white px-4 py-2.5 text-[15px] text-gray-900 hover:border-gray-400 focus:border-yellow-400 focus:outline-none transition-all"
                value={expRoomId}
                onChange={(e) => setExpRoomId(e.target.value)}
                disabled={submittingExpense}
              >
                <option value="">— Không gán phòng —</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2 flex items-end gap-2">
              <button className={btnPrimaryClass} onClick={submitExpense} disabled={!propertyId || submittingExpense} type="button">
                {submittingExpense ? "Đang lưu..." : "Tạo phiếu chi"}
              </button>

              <button
                className={btnOutlineClass}
                onClick={() => {
                  setExpAmount("");
                  setExpNote("");
                  setExpMethod("CASH");
                  setExpRoomId("");
                  setExpDate(toYYYYMMDD(new Date()));
                }}
                disabled={submittingExpense}
                type="button"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* List */}
        <div className={`${cardClass} overflow-hidden`}>
          <div className="p-6 border-b-2 border-gray-200 flex items-center justify-between gap-3 flex-wrap">
            <div className="font-bold text-gray-900">Lịch sử thu/chi</div>
            <div className="text-sm text-gray-600">{loading ? "Đang tải..." : `${rangeLabel} • Tổng: ${rows.length} phiếu`}</div>
          </div>

          {loading ? (
            <div className="p-6 text-gray-600">Đang tải dữ liệu...</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-gray-600">Không có phiếu thu/chi trong khoảng này.</div>
          ) : (
            <div className="divide-y">
              {rows.map((r) => {
                const focused = focusId === r.id;
                const roomName = r.room_id ? roomNameById[r.room_id] : "";
                const roomLabel = roomName ? `Phòng ${roomName}` : r.room_id ? `Room ${r.room_id.slice(0, 6)}...` : "";

                const sign = r.type === "INCOME" ? "+" : "-";
                const amountText = `${sign}${formatVND(Number(r.amount ?? 0))}`;

                return (
                  <div
                    key={r.id}
                    id={`pay-${r.id}`}
                    className={["p-4 sm:p-6 flex items-start justify-between gap-4", focused ? "bg-yellow-50" : "bg-white"].join(" ")}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900">
                        {mapTypeVN(r.type)} • {new Date(r.paid_at).toLocaleString("vi-VN")}
                      </div>

                      <div className="mt-1 text-sm text-gray-600">
                        {mapMethodVN(r.method)}
                        {roomLabel ? ` • ${roomLabel}` : ""}
                        {r.note ? ` • ${r.note}` : ""}
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        ID: {r.id.slice(0, 10)}...
                        {r.stay_id ? ` • stay: ${r.stay_id.slice(0, 8)}...` : ""}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-lg font-extrabold text-gray-900">{amountText}</div>
                      {focused ? <div className="text-xs font-semibold text-yellow-800 mt-1">Đang focus</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">© {new Date().getFullYear()} Motel Manager. Phần mềm quản lý nhà nghỉ chuyên nghiệp.</p>
        </div>
      </motion.div>
    </div>
  );
}
