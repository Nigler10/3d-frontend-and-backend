// frontend/src/components/StarRating.jsx
export default function StarRating({
    rating = 0,
    reviewCount,
    size = "sm",
    showValue = true,
}) {
    const numericRating = Number(rating) || 0;

    const roundedRating = Math.round(numericRating);

    const sizeClass =
        size === "lg"
            ? "text-xl"
            : size === "md"
                ? "text-base"
                : "text-sm";

    return (
        <div className="flex items-center gap-2">
            <div
                className={`flex items-center ${sizeClass}`}
                aria-label={`${numericRating.toFixed(1)} out of 5 stars`}
            >
                {[1, 2, 3, 4, 5].map((star) => (
                    <span
                        key={star}
                        className={
                            star <= roundedRating
                                ? "text-amber-400"
                                : "text-stone-200"
                        }
                    >
                        ★
                    </span>
                ))}
            </div>

            {showValue && (
                <span className="text-xs font-black text-stone-700">
                    {numericRating.toFixed(1)}
                </span>
            )}

            {reviewCount !== undefined && (
                <span className="text-xs font-medium text-stone-400">
                    ({reviewCount}{" "}
                    {Number(reviewCount) === 1
                        ? "review"
                        : "reviews"})
                </span>
            )}
        </div>
    );
}