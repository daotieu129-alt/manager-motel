import { supabase } from "./supabaseClient";

export type PaymentMethod = "CASH" | "TRANSFER" | "CARD";

export async function createIncomePaymentFromStay(params: {
  propertyId: string;
  stayId: string;
  roomId?: string | null;
  amount: number;
  method: PaymentMethod;
  note?: string;
  userId: string;
}) {
  const { data, error } = await supabase
    .from("payments")
    .insert({
      property_id: params.propertyId,
      stay_id: params.stayId,
      room_id: params.roomId ?? null,
      type: "INCOME",
      amount: params.amount,
      method: params.method,
      note: params.note ?? null,
      created_by: params.userId,
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error("Không tạo được phiếu thu");

  return data; // { id }
}
