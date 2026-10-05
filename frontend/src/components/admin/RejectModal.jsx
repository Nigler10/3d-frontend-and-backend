import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import "./RejectModal.css";

const reasonsList = [
    "Location not serviceable",
    "Cannot meet selected delivery date",
    "Incomplete delivery details",
    "Out of stock",
];

export default function RejectModal({ isOpen, onClose, onSubmit }) {
    const [selectedReason, setSelectedReason] = useState("");
    const [customReason, setCustomReason] = useState("");

    // Don't render anything if the modal isn't open
    if (!isOpen) return null;

    const handleSubmit = () => {
        const finalReason = customReason || selectedReason;

        if (!finalReason) {
            alert("Please select or enter a reason for the customer.");
            return;
        }

        onSubmit(finalReason);
        // Reset state for next time
        setSelectedReason("");
        setCustomReason("");
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            {/* stopPropagation prevents the modal from closing when clicking inside the card */}
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-icon-wrap"><AlertTriangle className="w-6 h-6 text-rose-600" /></div>
                
                <h2>Reject Order?</h2>
                <p className="modal-subtitle">Please provide a reason. This will be sent to the customer.</p>

                <div className="modal-body">
                    <span className="section-label">Quick Reasons</span>
                    <div className="reasons-container">
                        {reasonsList.map((reason) => (
                            <button
                                key={reason}
                                onClick={() => {
                                    setSelectedReason(reason);
                                    setCustomReason("");
                                }}
                                className={`reason-chip ${selectedReason === reason ? "active" : ""}`}
                            >
                                {reason}
                            </button>
                        ))}
                    </div>

                    <span className="section-label">Custom Message</span>
                    <textarea
                        placeholder="Or type a specific reason here..."
                        value={customReason}
                        onChange={(e) => {
                            setCustomReason(e.target.value);
                            setSelectedReason("");
                        }}
                        className="modal-textarea"
                    />
                </div>

                <div className="modal-actions">
                    <button onClick={handleSubmit} className="btn-confirm-reject">
                        Confirm Rejection
                    </button>
                    <button onClick={onClose} className="btn-cancel-link">
                        Nevermind, go back
                    </button>
                </div>
            </div>
        </div>
    );
}