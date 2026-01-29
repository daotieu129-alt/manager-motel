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
  const confirmDisabled =
    submittingCheckout || !totalAmountInput.trim();

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
          padding: 20,
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <h3
          style={{
            margin: 0,
            marginBottom: 16,
            fontSize: 18,
            fontWeight: 800,
          }}
        >
          Checkout {room?.name || room?.number || "room"}
        </h3>

        {/* Amount */}
        <label
          style={{
            display: "block",
            marginBottom: 6,
            fontWeight: 600,
          }}
        >
          Total amount
        </label>
        <input
          value={totalAmountInput}
          onChange={(e) => setTotalAmountInput(e.target.value)}
          placeholder="e.g. 350000"
          type="number"
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "1px solid #ddd",
            fontSize: 15,
            outline: "none",
          }}
        />

        {/* Actions */}
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            marginTop: 20,
          }}
        >
          {/* Cancel */}
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>

          {/* Confirm */}
          <button
            type="button"
            onClick={onCheckout}
            disabled={confirmDisabled}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #eab308",
              background: confirmDisabled ? "#e5e7eb" : "#facc15",
              color: "#111",
              fontWeight: 800,
              cursor: confirmDisabled ? "not-allowed" : "pointer",
              opacity: submittingCheckout ? 0.8 : 1,
            }}
          >
            {submittingCheckout
              ? "Processing..."
              : "Confirm checkout"}
          </button>
        </div>
      </div>
    </div>
  );
}
