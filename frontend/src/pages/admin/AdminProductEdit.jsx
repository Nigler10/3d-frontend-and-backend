// src/pages/admin/AdminProductEdit.jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { authFetch } from "../../utils/auth";
import { getMediaUrl } from "../../utils/media";

function AdminProductEdit() {
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const navigate = useNavigate();
    const { id } = useParams();

    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [preview, setPreview] = useState(null);
    const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
    const [deletingProduct, setDeletingProduct] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        price: "",
        category: "",
        image: null,
    });

    useEffect(() => {
        Promise.all([
            fetch(`${BASEURL}/api/products/${id}/`).then(res => res.json()),
            fetch(`${BASEURL}/api/categories/`).then(res => res.json())
        ])
            .then(([productData, catData]) => {
                setFormData({
                    name: productData.name,
                    description: productData.description,
                    price: productData.price,
                    category: productData.category,
                    image: null,
                });
                setCategories(catData);
                setPreview(
                    getMediaUrl(
                        productData.image,
                        BASEURL
                    )
                );
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, [id, BASEURL]);

    const handleChange = (e) => {
        const { name, value, files } = e.target;
        if (name === "image") {
            const file = files[0];
            setFormData(prev => ({ ...prev, image: file }));
            if (file) setPreview(URL.createObjectURL(file));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const data = new FormData();
            data.append("name", formData.name);
            data.append("description", formData.description);
            data.append("price", formData.price);
            data.append("category", formData.category);
            if (formData.image) data.append("image", formData.image);

            const res = await authFetch(
                `${BASEURL}/api/admin/products/${id}/update/`,
                {
                    method: "PATCH",
                    body: data,
                }
            );

            if (!res.ok) throw new Error("Update failed");
            navigate("/admin/products");
        } catch (err) {
            alert(err.message);
        }
    };

    const handleDelete = async () => {
        setDeletingProduct(true);
        try {
            const res = await authFetch(
                `${BASEURL}/api/admin/products/${id}/delete/`,
                { method: "DELETE" }
            );
            if (!res.ok) {
                let message = "Failed to delete product";
                try {
                    const data = await res.json();
                    message = data.error || message;
                } catch {
                    // Keep the fallback message when the response has no JSON body.
                }
                throw new Error(message);
            }
            navigate("/admin/products");
        } catch (err) {
            alert(err.message);
            setDeletingProduct(false);
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#FCF8EE] text-[#6E473B] font-black">Loading cake profile...</div>;

    return (
        <div className="min-h-screen bg-[#FCF8EE] pb-10">
            <div className="max-w-4xl mx-auto px-4 mt-8">
                <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl border border-[#E6CCA2] shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                        {/* Visuals */}
                        <div className="space-y-4">
                            <div className="relative w-full aspect-square rounded-2xl overflow-hidden border-2 border-[#E6CCA2]">
                                <img src={preview} alt="Product" className="w-full h-full object-cover" />
                                <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity cursor-pointer text-white font-bold">
                                    Replace Image
                                    <input type="file" name="image" onChange={handleChange} hidden />
                                </label>
                            </div>
                            <div className="bg-[#6E473B] text-white text-center py-2 rounded-lg font-black text-xs uppercase tracking-widest">
                                Editing Mode
                            </div>
                        </div>

                        {/* Inputs */}
                        <div className="space-y-6">
                            <header>
                                <h1 className="text-2xl font-black text-[#6E473B]">Update Product</h1>
                                <p className="text-[#A07060]">Modifying ID: <strong className="font-bold">#{id}</strong></p>
                            </header>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-black uppercase text-[#6E473B] mb-1">Product Name</label>
                                    <input type="text" name="name" value={formData.name} onChange={handleChange} required
                                        className="w-full p-3 bg-[#FCF8EE] border border-[#E6CCA2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E6CCA2]" />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-black uppercase text-[#6E473B] mb-1">Price (₱)</label>
                                        <input type="number" name="price" value={formData.price} onChange={handleChange} required
                                            className="w-full p-3 bg-[#FCF8EE] border border-[#E6CCA2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E6CCA2]" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black uppercase text-[#6E473B] mb-1">Category</label>
                                        <select name="category" value={formData.category} onChange={handleChange} required
                                            className="w-full p-3 bg-[#FCF8EE] border border-[#E6CCA2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E6CCA2]">
                                            {categories.map(cat => (
                                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-black uppercase text-[#6E473B] mb-1">Description</label>
                                    <textarea name="description" value={formData.description} onChange={handleChange} required rows="4"
                                        className="w-full p-3 bg-[#FCF8EE] border border-[#E6CCA2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E6CCA2]" />
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setShowDeleteConfirmation(true)}
                                    className="flex-1 py-3 border border-red-200 text-red-700 font-bold rounded-lg hover:bg-red-50">
                                    Delete Product
                                </button>
                                <button type="submit"
                                    className="flex-1 py-3 bg-[#6E473B] text-white font-bold rounded-lg hover:bg-[#5a3a30]">
                                    Update Details
                                </button>
                            </div>
                        </div>
                    </div>
                </form>
            </div>
            {showDeleteConfirmation && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
                    onClick={() => !deletingProduct && setShowDeleteConfirmation(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="delete-confirmation-title"
                        className="w-full max-w-md rounded-xl border border-[#E6CCA2] bg-white p-6 shadow-xl"
                        onClick={event => event.stopPropagation()}
                    >
                        <h2 id="delete-confirmation-title" className="text-xl font-black text-[#6E473B]">
                            Confirm Delete
                        </h2>
                        <p className="mt-3 text-[#6E473B]">Are you sure you want to delete this?</p>
                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setShowDeleteConfirmation(false)}
                                disabled={deletingProduct}
                                className="rounded-lg border border-[#E6CCA2] px-4 py-2 font-bold text-[#6E473B] hover:bg-[#F5EEDD] disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={deletingProduct}
                                className="rounded-lg bg-red-700 px-4 py-2 font-bold text-white hover:bg-red-800 disabled:opacity-50"
                            >
                                {deletingProduct ? "Deleting..." : "Yes, delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default AdminProductEdit;