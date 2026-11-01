// src/components/support/SupportMediaPanel.jsx
import { useMemo, useState } from "react";
import { Image as ImageIcon, X } from "lucide-react";

export default function SupportMediaPanel({ messages = [] }) {
    const [selectedImage, setSelectedImage] = useState(null);

    const images = useMemo(() => messages
        .filter((message) => message.message_type === "image" && message.attachment)
        .map((message) => ({
            id: message.id,
            url: message.attachment,
            sender: message.sender_name || (message.sender_type === "admin" ? "Admin" : "Customer"),
            date: message.created_at,
        })), [messages]);

    return (
        <>
            <aside className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-[#f0dfca] bg-white shadow-sm">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#f2e5d6] px-3 py-3 sm:px-4 sm:py-4">
                    <div>
                        <h2 className="font-bold text-stone-800">Shared media</h2>
                        <p className="mt-0.5 text-xs text-stone-500">Images shared in this conversation</p>
                    </div>
                    <span className="rounded-full bg-[#fff3e5] px-2.5 py-1 text-xs font-bold text-[#9a541d]">
                        {images.length}
                    </span>
                </div>

                {images.length === 0 ? (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-10 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff5e9] text-[#b66a2b]">
                            <ImageIcon size={22} />
                        </div>
                        <p className="text-sm font-semibold text-stone-700">No images yet</p>
                        <p className="mt-1 max-w-[190px] text-xs leading-5 text-stone-500">
                            Cake inspiration and reference images shared in chat will appear here.
                        </p>
                    </div>
                ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5 sm:p-3">
                        {/* Three-column gallery as requested. */}
                        <div className="grid grid-cols-3 gap-2">
                            {images.map((image) => (
                                <button
                                    key={image.id}
                                    type="button"
                                    onClick={() => setSelectedImage(image)}
                                    className="group relative aspect-square overflow-hidden rounded-xl bg-stone-100 ring-1 ring-black/5"
                                    title={`Image shared by ${image.sender}`}
                                >
                                    <img
                                        src={image.url}
                                        alt={`Image shared by ${image.sender}`}
                                        loading="lazy"
                                        className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                                    />
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </aside>

            {selectedImage && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
                    onClick={() => setSelectedImage(null)}
                    role="presentation"
                >
                    <button
                        type="button"
                        onClick={() => setSelectedImage(null)}
                        className="absolute right-5 top-5 rounded-full bg-white/15 p-2 text-white transition hover:bg-white/25"
                        aria-label="Close image preview"
                    >
                        <X size={24} />
                    </button>
                    <div className="max-h-[90vh] max-w-[90vw]" onClick={(event) => event.stopPropagation()}>
                        <img
                            src={selectedImage.url}
                            alt={`Image shared by ${selectedImage.sender}`}
                            className="max-h-[82vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
                        />
                        <p className="mt-3 text-center text-sm text-white/80">
                            Shared by {selectedImage.sender}
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}
