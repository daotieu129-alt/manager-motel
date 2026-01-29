

type RoomLike = {
  id?: string;
  name?: string;
  number?: string;
};

type Props = {
  room: RoomLike;
  totalAmountInput: string;
  setTotalAmountInput: (v: string) => void;
  submittingCheckout: boolean;
  onCheckout: () => void;
  onClose: () => void;
};

export default function CheckoutModal({
  room,
  totalAmountInput,
  setTotalAmountInput,
  submittingCheckout,
  onCheckout,
  onClose,
}: Props) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          background: "white",
          borderRadius: 12,
          padding: 16,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: 0, marginBottom: 12 }}>
          Checkout {room?.name || room?.number || "room"}
        </h3>

        <label style={{ display: "block", marginBottom: 8 }}>
          Total amount
        </label>
        <input
          value={totalAmountInput}
          onChange={(e) => setTotalAmountInput(e.target.value)}
          placeholder="e.g. 350000"
          style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
        />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} disabled={submittingCheckout}>
            Cancel
          </button>
          <button onClick={onCheckout} disabled={submittingCheckout || !totalAmountInput.trim()}>
            {submittingCheckout ? "Processing..." : "Confirm checkout"}
          </button>
        </div>
      </div>
    </div>
  );
}
