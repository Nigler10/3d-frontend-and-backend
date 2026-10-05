import { useEffect, useRef, useState } from "react";
import { authFetch } from "../../utils/auth";
import "./CustomCakeModal.css";
import CakePreview3D from "./CakePreview3D";
import { X } from "lucide-react";

export function CustomCakeModal({ isOpen, onClose, customization, orderId, canAddImages = false, onImagesAdded }) {
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const fileInputRef = useRef(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [modalImages, setModalImages] = useState([]);
    const [addingImages, setAddingImages] = useState(false);
    const [error, setError] = useState("");
    const [slideDirection, setSlideDirection] = useState("next");
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(0);
            setError("");

            const initialImages = Array.isArray(customization?.images)
                ? customization.images
                : customization?.image
                    ? [{
                        image: customization.image,
                        upload_id: customization.upload_id,
                    }]
                    : [];

            setModalImages(initialImages);
        }
    }, [isOpen, customization]);

    if (!isOpen || !customization) return null;

    const images = modalImages;

    const getImageUrl = (url) => {
        if (!url) return "";
        return url.startsWith("http://") || url.startsWith("https://") ? url : `${BASEURL}${url}`;
    };

    const changeImage = (direction) => {
        if (images.length <= 1 || isAnimating) return;

        setSlideDirection(direction);
        setIsAnimating(true);

        setTimeout(() => {
            setCurrentIndex((current) => {
                if (direction === "next") {
                    return (current + 1) % images.length;
                }

                return (current - 1 + images.length) % images.length;
            });

            setIsAnimating(false);
        }, 180);
    };

    const nextImage = () => {
        changeImage("next");
    };

    const previousImage = () => {
        changeImage("previous");
    };

    const closeModal = () => {
        setCurrentIndex(0);
        setError("");
        onClose();
    };

    const handleAddImages = async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = "";

        if (!files.length) return;

        if (images.length + files.length > 10) {
            setError(`You can have a maximum of 10 reference images. You currently have ${images.length}.`);
            return;
        }

        if (files.some((file) => !file.type.startsWith("image/"))) {
            setError("Please select image files only.");
            return;
        }

        if (!orderId) {
            setError("Order ID is missing.");
            return;
        }

        setAddingImages(true);
        setError("");

        try {
            const formData = new FormData();
            files.forEach((file) => formData.append("images", file));

            const res = await authFetch(`${BASEURL}/api/orders/${orderId}/uploaded-cake/samples/`, {
                method: "POST",
                body: formData,
                isFormData: true,
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Failed to add images.");
                return;
            }

            const newImages = Array.isArray(data.new_images)
                ? data.new_images
                : [];

            const firstNewIndex = images.length;

            setModalImages((currentImages) => [
                ...currentImages,
                ...newImages,
            ]);

            onImagesAdded?.(data);

            if (newImages.length > 0) {
                setCurrentIndex(firstNewIndex);
            }
        } catch (err) {
            console.error(err);
            setError("Unable to add images.");
        } finally {
            setAddingImages(false);
        }
    };

    const handleRemoveImage = async (uploadId) => {
        if (!uploadId) {
            setError("Image ID is missing.");
            return;
        }

        if (!orderId) {
            setError("Order ID is missing.");
            return;
        }

        setError("");

        try {
            const res = await authFetch(
                `${BASEURL}/api/orders/${orderId}/uploaded-cake/samples/${uploadId}/`,
                {
                    method: "DELETE",
                }
            );

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Failed to remove image.");
                return;
            }

            const removedIndex = images.findIndex(
                (image) => String(image.upload_id) === String(uploadId)
            );

            setModalImages(data.images || []);

            setCurrentIndex((currentIndex) => {
                const remainingImages = data.images || [];

                if (remainingImages.length === 0) {
                    return 0;
                }

                if (removedIndex === -1) {
                    return Math.min(currentIndex, remainingImages.length - 1);
                }

                if (removedIndex < currentIndex) {
                    return currentIndex - 1;
                }

                if (currentIndex >= remainingImages.length) {
                    return remainingImages.length - 1;
                }

                return currentIndex;
            });

            onImagesAdded?.({
                ...data,
                removed_upload_id: uploadId,
            });

        } catch (err) {
            console.error(err);
            setError("Unable to remove image.");
        }
    };

    return (
        <div className="custom-cake-overlay" onClick={closeModal}>
            <div className="custom-cake-modal" onClick={(e) => e.stopPropagation()}>
                <button className="close-btn" onClick={closeModal}><X className="w-5 h-5" /></button>

                <h2>Custom Cake Preview</h2>

                {customization.uploaded_cake ? (
                    <div className="uploaded-cake-preview">
                        {images.length > 0 ? (
                            <>
                                <div className="relative w-full flex-1 min-h-0 flex items-center justify-center">
                                    <div className="cake-image-viewport">
                                        <img key={images[currentIndex]?.upload_id || currentIndex} src={getImageUrl(images[currentIndex]?.image)} alt={`Uploaded cake inspiration ${currentIndex + 1}`} className={`cake-main-image ${isAnimating ? slideDirection === "next" ? "cake-slide-next" : "cake-slide-previous" : "" }`} />

                                        {images.length > 1 && (
                                            <>
                                                <button type="button" onClick={previousImage} className="cake-carousel-button cake-carousel-button-left" aria-label="Previous image">
                                                    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M15 18l-6-6 6-6" />
                                                    </svg>
                                                </button>

                                                <button type="button" onClick={nextImage} className="cake-carousel-button cake-carousel-button-right" aria-label="Next image">
                                                    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M9 18l6-6-6-6" />
                                                    </svg>
                                                </button>
                                            </>
                                        )}

                                        {images.length > 1 && (
                                            <div className="cake-image-counter">
                                                {currentIndex + 1} / {images.length}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex gap-2 mt-3 pt-1 overflow-x-auto pb-1 shrink-0">
                                    {images.map((image, index) => (
                                        <div key={image.upload_id || index} className="cake-thumbnail-wrapper">
                                            <button type="button" onClick={() => setCurrentIndex(index)} className={`cake-thumbnail ${index === currentIndex ? "cake-thumbnail-selected" : "" }`} >
                                                <img src={getImageUrl(image.image)} alt={`Thumbnail ${index + 1}`} />
                                            </button>

                                            {canAddImages && (
                                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemoveImage(image.upload_id); }} disabled={addingImages} className="cake-thumbnail-delete" aria-label={`Remove image ${index + 1}`} title={`Remove image ${index + 1}`} >
                                                    <span>−</span>
                                                </button>
                                            )}
                                        </div>
                                    ))}

                                    {canAddImages && images.length < 10 && (
                                        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={addingImages} className="cake-add-image rounded-lg border-2 border-dashed border-stone-300 hover:border-[#d67b27] hover:bg-[#fffaf3] text-stone-400 hover:text-[#d67b27] flex items-center justify-center transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" title={`Add images (${10 - images.length} remaining)`} >
                                            <span className="flex items-center justify-center w-full h-full text-2xl font-bold leading-none -translate-y-[3px]">
                                                {addingImages ? "…" : "+"}
                                            </span>
                                        </button>
                                    )}
                                </div>

                                {canAddImages && (
                                    <input ref={fileInputRef} hidden type="file" accept="image/*" multiple onChange={handleAddImages} />
                                )}

                                {canAddImages && (
                                    <p className="text-xs text-stone-400 font-semibold text-center mt-2">
                                        {images.length}/10 reference images
                                    </p>
                                )}

                                {error && (
                                    <p className="text-sm text-rose-600 font-semibold mt-2 text-center">
                                        {error}
                                    </p>
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center gap-3 text-stone-500">
                                <p className="font-semibold">No reference images.</p>

                                {canAddImages && (
                                    <>
                                        <input ref={fileInputRef} hidden type="file" accept="image/*" multiple onChange={handleAddImages} />

                                        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={addingImages} className="px-5 py-2.5 rounded-xl bg-[#d67b27] hover:bg-[#b56219] text-white font-bold cursor-pointer disabled:opacity-50">
                                            {addingImages ? "Adding Images..." : "＋ Add Reference Images"}
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <CakePreview3D customization={customization} />
                )}
            </div>
        </div>
    );
}