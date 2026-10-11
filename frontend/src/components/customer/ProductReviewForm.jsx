import { useEffect, useState } from "react";
import { authFetch } from "../../utils/auth";
import { useCustomerDialog } from "../../context/CustomerDialogContext";

export default function ProductReviewForm({
    orderId,
    item,
}) {
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const { showAlert } = useCustomerDialog();

    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState("");
    const [review, setReview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const fetchReview = async () => {
        try {
            const res = await authFetch(
                `${BASEURL}/api/orders/${orderId}/items/${item.id}/product-review/`
            );

            const data = await res.json();

            if (res.ok) {
                setReview(data.review);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReview();
    }, [orderId, item.id]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            setSubmitting(true);

            const res = await authFetch(
                `${BASEURL}/api/orders/${orderId}/items/${item.id}/product-review/`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        rating,
                        comment,
                    }),
                }
            );

            const data = await res.json();

            if (!res.ok) {
                await showAlert(data.error || "Failed to submit product review.", { tone: "error", title: "Review not submitted" });
                return;
            }

            setReview(data.review);
            await showAlert("Product review submitted successfully.", { tone: "success", title: "Review submitted" });
        } catch (err) {
            console.error(err);
            await showAlert("Something went wrong.", { tone: "error", title: "Review not submitted" });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return null;
    }

    if (review) {
        return (
            <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                <p className="text-xs font-black uppercase tracking-wider text-emerald-700">
                    Your Product Review
                </p>

                <p className="mt-1 text-sm text-amber-500">
                    {"★".repeat(review.rating)}
                    <span className="text-stone-300">
                        {"★".repeat(5 - review.rating)}
                    </span>
                </p>

                {review.comment && (
                    <p className="mt-1 text-sm text-stone-600">
                        {review.comment}
                    </p>
                )}
            </div>
        );
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="mt-3 rounded-xl border border-[#f3e1c6] bg-[#fffdf9] p-3 space-y-3"
        >
            <p className="text-xs font-black uppercase tracking-wider text-[#844414]">
                Review This Product
            </p>

            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className={`text-2xl ${star <= rating
                                ? "text-amber-400"
                                : "text-stone-300"
                            }`}
                    >
                        ★
                    </button>
                ))}
            </div>

            <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What did you think about this cake?"
                rows={3}
                className="w-full resize-none rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-[#d67b27]"
            />

            <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-[#d67b27] px-4 py-2.5 text-sm font-black text-white hover:bg-[#b56219] disabled:opacity-50"
            >
                {submitting ? "Submitting..." : "Submit Product Review"}
            </button>
        </form>
    );
}