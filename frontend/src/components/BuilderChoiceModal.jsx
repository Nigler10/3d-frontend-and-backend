// src/compenents/BuilderChoiceModal.jsx
import { useNavigate } from "react-router-dom";

export default function BuilderChoiceModal({
    isOpen,
    onClose,
    onUploadClick,
}) {
    const navigate = useNavigate();

    if (!isOpen) return null;

    const handleBuilder = () => {
        onClose();
        navigate("/build");
    };

    const handleUpload = () => {
        onClose();
        onUploadClick();
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">

            <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-sm sm:max-w-md mx-auto shadow-xl overflow-hidden my-auto flex flex-col">

                <div className="px-5 sm:px-6 py-4 sm:py-5 border-b">
                    <h2 className="text-xl sm:text-2xl font-black text-[#6E473B]">
                        Customize Your Cake
                    </h2>

                    <p className="text-xs sm:text-sm text-stone-500 mt-1 sm:mt-2">
                        Choose how you'd like to customize your cake.
                    </p>
                </div>

                <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">

                    <button
                        onClick={handleBuilder}
                        className="w-full rounded-2xl border border-stone-200 p-4 sm:p-5 text-left hover:border-[#d67b27] hover:bg-orange-50 transition cursor-pointer group"
                    >
                        <div className="text-2xl sm:text-3xl mb-1.5 sm:mb-2">🎂</div>

                        <h3 className="font-bold text-base sm:text-lg text-stone-800 group-hover:text-[#d67b27]">
                            3D Cake Builder
                        </h3>

                        <p className="text-xs sm:text-sm text-stone-500 mt-1 leading-relaxed">
                            Build your own cake using our interactive 3D designer.
                        </p>
                    </button>

                    <button
                        onClick={handleUpload}
                        className="w-full rounded-2xl border border-stone-200 p-4 sm:p-5 text-left hover:border-[#d67b27] hover:bg-orange-50 transition cursor-pointer group"
                    >
                        <div className="text-2xl sm:text-3xl mb-1.5 sm:mb-2">🖼️</div>

                        <h3 className="font-bold text-base sm:text-lg text-stone-800 group-hover:text-[#d67b27]">
                            Upload Sample Cake
                        </h3>

                        <p className="text-xs sm:text-sm text-stone-500 mt-1 leading-relaxed">
                            Upload an inspiration image for our team to recreate.
                        </p>
                    </button>

                </div>

                <div className="border-t p-4 sm:p-5 flex justify-end bg-stone-50/50">

                    <button
                        onClick={onClose}
                        className="w-full sm:w-auto px-5 py-2.5 sm:py-3 rounded-xl border border-stone-300 font-bold text-stone-600 hover:bg-stone-100 transition cursor-pointer text-sm"
                    >
                        Cancel
                    </button>

                </div>

            </div>

        </div>
    );
}