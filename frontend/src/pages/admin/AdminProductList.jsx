// src/pages/admin/AdminProductList.jsx
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import AdminProductCard from "../../components/admin/AdminProductCard";
import { getAccessToken } from "../../utils/auth";

function AdminProductList() {
    const [activeTab, setActiveTab] = useState("products");
    const [products, setProducts] = useState([]);
    const [basePrices, setBasePrices] = useState([]);
    const [addonPrices, setAddonPrices] = useState([]);
    const [draftBasePrices, setDraftBasePrices] = useState({});
    const [draftAddonPrices, setDraftAddonPrices] = useState({});
    const [loading, setLoading] = useState(true);
    const [pricingLoading, setPricingLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pricingError, setPricingError] = useState(null);
    const [savingKey, setSavingKey] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const successTimerRef = useRef(null);
    const navigate = useNavigate();
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

    const authHeaders = useCallback(() => ({
        Authorization: `Bearer ${getAccessToken()}`,
    }), []);

    const fetchPricing = useCallback(async () => {
        setPricingLoading(true);
        setPricingError(null);
        try {
            const [baseRes, addonRes] = await Promise.all([
                fetch(`${BASEURL}/api/admin/custom-pricing/`, { headers: authHeaders() }),
                fetch(`${BASEURL}/api/admin/addon-pricing/`, { headers: authHeaders() }),
            ]);
            if (!baseRes.ok || !addonRes.ok) throw new Error("Failed to fetch custom cake pricing");
            const [baseData, addonData] = await Promise.all([baseRes.json(), addonRes.json()]);
            setBasePrices(baseData);
            setAddonPrices(addonData);
            setDraftBasePrices({});
            setDraftAddonPrices({});
        } catch (err) {
            setPricingError(err.message);
        } finally {
            setPricingLoading(false);
        }
    }, [BASEURL, authHeaders]);

    useEffect(() => {
        fetch(`${BASEURL}/api/admin/products/`, { headers: authHeaders() })
            .then((res) => { if (!res.ok) throw new Error("Failed to fetch admin products"); return res.json(); })
            .then((data) => { setProducts(data); setLoading(false); })
            .catch((err) => { setError(err.message); setLoading(false); });
    }, [BASEURL, authHeaders]);

    useEffect(() => { fetchPricing(); }, [fetchPricing]);
    useEffect(() => () => { if (successTimerRef.current) clearTimeout(successTimerRef.current); }, []);

    const filteredProducts = useMemo(() => {
        if (!searchQuery.trim()) return products;
        const q = searchQuery.toLowerCase();
        return products.filter(
            (p) =>
                (p.name && p.name.toLowerCase().includes(q)) ||
                (p.category && p.category.toLowerCase().includes(q))
        );
    }, [products, searchQuery]);

    const getBaseDraftValue = (item) => draftBasePrices[item.id] ?? item.price;
    const getAddonDraftValue = (item) => draftAddonPrices[item.id] ?? item.price;

    const savePrice = async ({ url, value, savingId, onSuccess }) => {
        setSavingKey(savingId);
        try {
            const res = await fetch(url, {
                method: "PATCH",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({ price: value }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save price");
            onSuccess(data);
            setSuccessMessage("Price updated successfully.");
            if (successTimerRef.current) clearTimeout(successTimerRef.current);
            successTimerRef.current = setTimeout(() => setSuccessMessage(""), 2500);
        } catch (err) { alert(err.message); } finally { setSavingKey(""); }
    };

    const saveBasePrice = async (item) => await savePrice({
        url: `${BASEURL}/api/admin/custom-pricing/${item.id}/update/`,
        value: getBaseDraftValue(item),
        savingId: `base-${item.id}`,
        onSuccess: (updated) => {
            setBasePrices((prev) => prev.map((p) => p.id === item.id ? updated : p));
            setDraftBasePrices((prev) => { const next = { ...prev }; delete next[item.id]; return next; });
        },
    });

    const saveAddonPrice = async (item) => await savePrice({
        url: `${BASEURL}/api/admin/addon-pricing/${item.id}/update/`,
        value: getAddonDraftValue(item),
        savingId: `addon-${item.id}`,
        onSuccess: (updated) => {
            setAddonPrices((prev) => prev.map((p) => p.id === item.id ? updated : p));
            setDraftAddonPrices((prev) => { const next = { ...prev }; delete next[item.id]; return next; });
        },
    });

    const renderPriceActions = ({ isChanged, onSave, onCancel, savingId }) => (
        <div className="flex gap-2 justify-end">
            <button
                type="button"
                onClick={onSave}
                disabled={!isChanged || savingKey === savingId}
                className="px-3 py-1.5 bg-[#C05A11] hover:bg-[#A04A0E] text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-all cursor-pointer"
            >
                {savingKey === savingId ? "Saving..." : "Save"}
            </button>
            <button
                type="button"
                onClick={onCancel}
                disabled={!isChanged || savingKey === savingId}
                className="px-3 py-1.5 bg-[#FDF6E2] hover:bg-[#F8EDD4] border border-[#ECD9B4] text-[#6E473B] text-xs font-bold rounded-lg disabled:opacity-40 transition-all cursor-pointer"
            >
                Cancel
            </button>
        </div>
    );

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#FCF8EE] text-[#6E473B]">
            <div className="w-12 h-12 border-4 border-[#C05A11] border-t-transparent rounded-full animate-spin mb-4" />
            <p className="font-extrabold text-lg animate-pulse tracking-wide">Preparing your product gallery...</p>
        </div>
    );
    if (error) return <div className="min-h-screen flex items-center justify-center text-red-500 font-bold bg-[#FCF8EE]">Error: {error}</div>;

    return (
        <div className="min-h-screen bg-[#FCF8EE] pb-16 text-[#6E473B]">
            {successMessage && (
                <div className="fixed top-24 right-6 z-50 bg-[#137333] text-white px-4 py-2.5 rounded-xl shadow-lg font-bold text-xs flex items-center gap-2 animate-bounce">
                    <span>✓</span> {successMessage}
                </div>
            )}

            <div className="max-w-7xl mx-auto px-4 md:px-8 pt-8 flex flex-col gap-6">

                {/* ── Page Header ── */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-[#6E473B] tracking-tight">Product Management</h1>
                        <p className="text-[#A07060] font-medium text-sm mt-0.5">Edit shop products, prices, and custom cake pricing rules.</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate("/admin/products/create")}
                            className="px-4 py-2.5 bg-[#C05A11] hover:bg-[#A04A0E] text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                        >
                            <span className="text-base font-black">+</span> Add New Product
                        </button>
                    </div>
                </header>

                {/* ── Tabs & Inspiration Toolbar ── */}
                <div className="bg-[#FFFDF9] border border-[#E6CCA2] rounded-2xl p-3.5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                    {/* Navigation Tabs */}
                    <div className="flex items-center gap-2 bg-[#FDF6E2] p-1 rounded-xl border border-[#ECD9B4]">
                        {[
                            { id: "products", label: "Shop Products" },
                            { id: "pricing", label: "Custom Cake Pricing Rules" },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-4 py-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${activeTab === tab.id
                                        ? "bg-[#C05A11] text-white shadow-sm"
                                        : "text-[#A07060] hover:text-[#6E473B]"
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Search Bar */}
                    {activeTab === "products" && (
                        <div className="relative min-w-[200px] sm:min-w-[240px]">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search products..."
                                className="w-full pl-8 pr-3 py-1.5 bg-[#FDF6E2] border border-[#ECD9B4] rounded-xl text-xs font-medium text-[#6E473B] placeholder-[#A07060] focus:outline-none focus:border-[#C05A11]"
                            />
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A07060] text-xs">🔍</span>
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A07060] hover:text-[#6E473B] text-xs"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Products Tab ── */}
                {activeTab === "products" ? (
                    <div className="bg-white border border-[#E6CCA2] rounded-2xl p-6 shadow-sm">
                        {filteredProducts.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filteredProducts.map((product) => (
                                    <AdminProductCard
                                        key={product.id}
                                        product={product}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="p-12 text-center text-[#A07060]">
                                <span className="text-4xl block mb-3">🎂</span>
                                <h3 className="font-black text-[#6E473B] text-lg">No products found</h3>
                                <p className="text-xs mt-1">Start by adding your first product to the gallery.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    /* ── Pricing Rules Tab ── */
                    <div className="bg-white p-6 rounded-2xl border border-[#E6CCA2] shadow-sm flex flex-col gap-8">
                        {pricingLoading ? (
                            <p className="text-[#A07060] font-bold text-center py-8">Loading pricing rules...</p>
                        ) : (
                            <div className="space-y-10">
                                {[{
                                    title: "Base Cake Tier Prices",
                                    data: basePrices,
                                    setter: setDraftBasePrices,
                                    getter: getBaseDraftValue,
                                    onSave: saveBasePrice,
                                    onCancel: (id) => setDraftBasePrices((prev) => { const n = { ...prev }; delete n[id]; return n; }),
                                    headers: ["Tier", "Size", "Flavor", "Price (₱)", "Actions"]
                                },
                                {
                                    title: "Topping & Addon Prices",
                                    data: addonPrices,
                                    setter: setDraftAddonPrices,
                                    getter: getAddonDraftValue,
                                    onSave: saveAddonPrice,
                                    onCancel: (id) => setDraftAddonPrices((prev) => { const n = { ...prev }; delete n[id]; return n; }),
                                    headers: ["Topping Name", "Price (₱)", "Actions"]
                                }].map((sec, idx) => (
                                    <section key={idx} className="flex flex-col gap-4">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-lg font-black text-[#6E473B]">{sec.title}</h2>
                                            <span className="text-xs text-[#A07060] font-medium">{sec.data.length} item(s)</span>
                                        </div>

                                        <div className="overflow-x-auto rounded-xl border border-[#E6CCA2]/60">
                                            <table className="w-full text-left border-collapse">
                                                <thead className="bg-[#FCF8EE] text-[#A07060] text-[11px] font-black uppercase tracking-wider border-b border-[#E6CCA2]">
                                                    <tr>
                                                        {sec.headers.map((h, i) => (
                                                            <th key={h} className={`p-3.5 ${i === sec.headers.length - 1 ? "text-right" : ""}`}>{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[#E6CCA2]/20 text-xs font-semibold text-[#6E473B]">
                                                    {sec.data.map((item) => {
                                                        const draft = sec.getter(item);
                                                        const isChanged = draft != item.price;
                                                        return (
                                                            <tr key={item.id} className="hover:bg-[#FCF8EE]/50 transition-colors">
                                                                {item.tier && <td className="p-3.5 font-bold">{item.tier}</td>}
                                                                {item.size && <td className="p-3.5 text-[#A07060]">{item.size}</td>}
                                                                {item.flavor && <td className="p-3.5 text-[#A07060]">{item.flavor}</td>}
                                                                {item.name && <td className="p-3.5 font-bold">{item.name}</td>}
                                                                <td className="p-3.5">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-[#A07060] font-bold">₱</span>
                                                                        <input
                                                                            type="number"
                                                                            step="0.01"
                                                                            value={draft}
                                                                            onChange={(e) => sec.setter((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                                                            className="w-28 p-1.5 bg-[#FDF6E2] rounded-lg border border-[#ECD9B4] text-xs font-black text-[#6E473B] focus:outline-none focus:border-[#C05A11]"
                                                                        />
                                                                    </div>
                                                                </td>
                                                                <td className="p-3.5 text-right">
                                                                    {renderPriceActions({
                                                                        isChanged,
                                                                        onSave: () => sec.onSave(item),
                                                                        onCancel: () => sec.onCancel(item.id),
                                                                        savingId: `sec-${item.id}`
                                                                    })}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </section>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default AdminProductList;