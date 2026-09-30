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

    // Products Search & Sort State
    const [searchQuery, setSearchQuery] = useState("");
    const [productSortBy, setProductSortBy] = useState("default");

    // Pricing Rules Filter State
    const [selectedTierFilter, setSelectedTierFilter] = useState("all");
    const [pricingSearch, setPricingSearch] = useState("");
    const [selectedFlavorFilter, setSelectedFlavorFilter] = useState("all");

    // Pagination State for Pricing Rules
    const [pricingPage, setPricingPage] = useState(1);
    const [pricingPerPage, setPricingPerPage] = useState(10);
    const [jumpPricingPage, setJumpPricingPage] = useState("");

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

    // Filter Products for Shop Products Tab
    const filteredProducts = useMemo(() => {
        let list = [...products];
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(
                (p) =>
                    (p.name && p.name.toLowerCase().includes(q)) ||
                    (p.category && p.category.toLowerCase().includes(q))
            );
        }
        if (productSortBy === "price_asc") list.sort((a, b) => (a.price || 0) - (b.price || 0));
        if (productSortBy === "price_desc") list.sort((a, b) => (b.price || 0) - (a.price || 0));
        if (productSortBy === "name_asc") list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        return list;
    }, [products, searchQuery, productSortBy]);

    // Tier String parser helper
    const getTierNumber = (tierStr = "") => {
        const s = String(tierStr).toLowerCase();
        if (s.includes("4")) return "4";
        if (s.includes("3")) return "3";
        if (s.includes("2") || s.includes("mini")) return "2";
        if (s.includes("1")) return "1";
        return "1";
    };

    // Unique Flavor List for Pricing Dropdown Filter
    const flavorOptions = useMemo(() => {
        const set = new Set();
        basePrices.forEach((bp) => {
            if (bp.flavor) set.add(bp.flavor);
        });
        return Array.from(set);
    }, [basePrices]);

    // Filter Pricing Rules Matrix
    const filteredBasePrices = useMemo(() => {
        let list = [...basePrices];

        // Filter by Tier
        if (selectedTierFilter !== "all") {
            list = list.filter((p) => getTierNumber(p.tier) === String(selectedTierFilter));
        }

        // Filter by Flavor Dropdown
        if (selectedFlavorFilter !== "all") {
            list = list.filter((p) => p.flavor === selectedFlavorFilter);
        }

        // Filter by Search Query
        if (pricingSearch.trim()) {
            const q = pricingSearch.toLowerCase();
            list = list.filter(
                (p) =>
                    (p.size && p.size.toLowerCase().includes(q)) ||
                    (p.flavor && p.flavor.toLowerCase().includes(q)) ||
                    (p.tier && p.tier.toLowerCase().includes(q))
            );
        }

        return list;
    }, [basePrices, selectedTierFilter, selectedFlavorFilter, pricingSearch]);

    // Paginated Pricing Rules
    const totalPricingPages = Math.max(1, Math.ceil(filteredBasePrices.length / pricingPerPage));
    const paginatedBasePrices = useMemo(() => {
        const start = (pricingPage - 1) * pricingPerPage;
        return filteredBasePrices.slice(start, start + pricingPerPage);
    }, [filteredBasePrices, pricingPage, pricingPerPage]);

    // Counts per Tier for filter buttons
    const tierCounts = useMemo(() => {
        const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
        basePrices.forEach((bp) => {
            const t = getTierNumber(bp.tier);
            if (counts[t] !== undefined) counts[t]++;
        });
        return counts;
    }, [basePrices]);

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

    const handleExportPricingCSV = () => {
        if (filteredBasePrices.length === 0) {
            alert("No pricing rules available to export.");
            return;
        }

        const headers = ["Tier", "Size Spec", "Flavor Option", "Base Retail Price (PHP)"];
        const rows = filteredBasePrices.map((p) => [
            `"${(p.tier || "").replace(/"/g, '""')}"`,
            `"${(p.size || "").replace(/"/g, '""')}"`,
            `"${(p.flavor || "").replace(/"/g, '""')}"`,
            `₱${p.price || 0}`,
        ]);

        const csvContent =
            "data:text/csv;charset=utf-8," +
            [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `custom_cake_pricing_rules_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleJumpPricingPage = (e) => {
        e.preventDefault();
        const p = parseInt(jumpPricingPage, 10);
        if (p >= 1 && p <= totalPricingPages) {
            setPricingPage(p);
            setJumpPricingPage("");
        }
    };

    const getFlavorDotColor = (flavorName = "") => {
        const fn = flavorName.toLowerCase();
        if (fn.includes("choco")) return "bg-[#6E473B]";
        if (fn.includes("ube")) return "bg-purple-600 font-bold";
        if (fn.includes("velvet") || fn.includes("red")) return "bg-rose-600";
        if (fn.includes("mango")) return "bg-amber-500";
        if (fn.includes("vanilla")) return "bg-amber-700";
        if (fn.includes("hazelnut") || fn.includes("almond")) return "bg-[#8F4E24]";
        return "bg-[#AD4313]";
    };

    const getTierSubtitle = (tierStr) => {
        const t = getTierNumber(tierStr);
        if (t === "1") return "Single layer core";
        if (t === "2") return "Stacked tiered";
        if (t === "3") return "Wedding & grand banquet";
        if (t === "4") return "Signature grand tier";
        return "Custom tier spec";
    };

    const getLeadTime = (tierStr) => {
        const t = getTierNumber(tierStr);
        if (t === "1") return "2 Days Lead";
        if (t === "2") return "4 Days Lead";
        if (t === "3") return "5 Days Lead";
        if (t === "4") return "7 Days Lead";
        return "3 Days Lead";
    };

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#FCF8EE] text-[#3D251E]">
            <div className="w-12 h-12 border-4 border-[#AD4313] border-t-transparent rounded-full animate-spin mb-4" />
            <p className="font-extrabold text-lg animate-pulse tracking-wide">Preparing your product gallery...</p>
        </div>
    );
    if (error) return <div className="min-h-screen flex items-center justify-center text-red-500 font-bold bg-[#FCF8EE]">Error: {error}</div>;

    return (
        <div className="min-h-screen bg-[#FCF8EE] pb-16 text-[#3D251E] font-sans antialiased">
            {successMessage && (
                <div className="fixed top-24 right-6 z-50 bg-[#16A34A] text-white px-4 py-2.5 rounded-xl shadow-lg font-bold text-xs flex items-center gap-2 animate-bounce">
                    <span>✓</span> {successMessage}
                </div>
            )}

            <div className="max-w-7xl mx-auto px-4 md:px-8 pt-8 flex flex-col gap-6">

                {/* ── Overall Page Header ── */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-3xl font-black text-[#3D251E] tracking-tight">Product Management</h1>
                            <span className="px-3 py-0.5 rounded-full bg-[#FDF0EB] text-[#AD4313] border border-[#F5D5C8] text-xs font-bold">
                                Catalog Active
                            </span>
                        </div>
                        <p className="text-[#8C6D58] font-medium text-sm mt-1">
                            Edit shop products, prices, and custom cake pricing rules.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => navigate("/admin/products/create")}
                            className="px-4 py-2.5 bg-[#AD4313] hover:bg-[#8F350E] text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                        >
                            <span className="text-base font-black">+</span> Add New Product
                        </button>
                    </div>
                </header>

                {/* ── Main Tab Bar Container ── */}
                <div className="bg-[#FFFDF9] border border-[#E6DBCB] rounded-2xl p-3 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
                    {/* Tabs */}
                    <div className="flex items-center gap-1.5 bg-[#F9F4EC] p-1 rounded-xl border border-[#E6DBCB] w-full sm:w-auto">
                        {[
                            { id: "products", label: "Shop Products" },
                            { id: "pricing", label: "Custom Cake Pricing Rules" },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-4 py-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer flex-1 sm:flex-initial text-center ${activeTab === tab.id
                                        ? "bg-[#AD4313] text-white shadow-2xs"
                                        : "text-[#8C6D58] hover:text-[#3D251E]"
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Search Bar for Products Tab */}
                    {activeTab === "products" && (
                        <div className="relative min-w-[200px] sm:min-w-[260px] w-full sm:w-auto">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search products..."
                                className="w-full pl-8 pr-3 py-2 bg-[#FFFDF9] border border-[#E6DBCB] rounded-xl text-xs font-medium text-[#3D251E] placeholder-[#A48B78] focus:outline-none focus:border-[#AD4313]"
                            />
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A48B78] text-xs">🔍</span>
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A48B78] hover:text-[#3D251E] text-xs"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* ── TAB 1: Shop Products ── */}
                {activeTab === "products" ? (
                    <div className="bg-white border border-[#E6DBCB] rounded-2xl p-6 shadow-xs flex flex-col gap-6">
                        {/* Subheader & Sort */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#E6DBCB]/30">
                            <div className="flex items-center gap-2">
                                <h2 className="text-base font-black text-[#3D251E]">All Shop Pastries &amp; Cakes</h2>
                                <span className="px-2.5 py-0.5 bg-[#F9F4EC] text-[#8C6D58] rounded-full text-xs font-semibold">
                                    {filteredProducts.length} Items Available
                                </span>
                            </div>

                            <div className="flex items-center gap-2 text-xs font-medium text-[#8C6D58]">
                                <span>Sort by:</span>
                                <select
                                    value={productSortBy}
                                    onChange={(e) => setProductSortBy(e.target.value)}
                                    className="bg-[#FFFDF9] border border-[#E6DBCB] rounded-xl px-3 py-1.5 font-bold text-xs text-[#3D251E] cursor-pointer focus:outline-none"
                                >
                                    <option value="default">Default Sorting</option>
                                    <option value="price_asc">Price: Low to High</option>
                                    <option value="price_desc">Price: High to Low</option>
                                    <option value="name_asc">Name: A to Z</option>
                                </select>
                            </div>
                        </div>

                        {/* Product Cards Grid */}
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
                            <div className="p-12 text-center text-[#8C6D58]">
                                <span className="text-4xl block mb-3">🎂</span>
                                <h3 className="font-black text-[#3D251E] text-lg">No products found</h3>
                                <p className="text-xs mt-1">Start by adding your first product to the gallery.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    /* ── TAB 2: Custom Cake Pricing Rules (Inspiration Exact Design) ── */
                    <div className="flex flex-col gap-6">
                        {/* 1. Top Engine Banner Card */}
                        <div className="bg-[#FFFDF9] border border-[#E6DBCB] rounded-2xl p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            <div className="flex items-start gap-4">
                                <div className="w-11 h-11 rounded-xl bg-[#FDF0EB] text-[#AD4313] border border-[#F5D5C8] flex items-center justify-center text-lg font-black shrink-0">
                                    🎛️
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h2 className="text-lg font-black text-[#3D251E] tracking-tight">
                                            Custom Cake Tier Pricing Engine
                                        </h2>
                                        <span className="px-2.5 py-0.5 rounded-full bg-[#EDFDF3] text-[#16A34A] border border-[#BBF7D0] text-[10px] font-bold inline-flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Sync Enabled
                                        </span>
                                    </div>
                                    <p className="text-xs text-[#8C6D58] font-medium">
                                        Dynamic calculation matrix for customer cake-builder and lead-time dispatching.
                                    </p>
                                </div>
                            </div>

                            {/* Right Status Pills */}
                            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                                <span className="px-3.5 py-1.5 bg-[#F9F4EC] border border-[#E6DBCB] rounded-xl text-[#5C3D2E]">
                                    Active Rulesets: <strong className="text-[#3D251E]">4 Tiers</strong>
                                </span>
                                <span className="px-3.5 py-1.5 bg-[#F9F4EC] border border-[#E6DBCB] rounded-xl text-[#5C3D2E]">
                                    Variants Configured: <strong className="text-[#3D251E]">{basePrices.length} items</strong>
                                </span>
                                <span className="px-3.5 py-1.5 bg-[#FFFDF9] border border-[#E6DBCB] rounded-xl text-[#8C6D58] flex items-center gap-1">
                                    🕒 Auto-sync active
                                </span>
                            </div>
                        </div>

                        {/* 2. Control Toolbar for Pricing Rules */}
                        <div className="bg-[#FFFDF9] border border-[#E6DBCB] rounded-2xl p-3.5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            {/* Left Side: Tier Filter Pills */}
                            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                                <button
                                    type="button"
                                    onClick={() => { setSelectedTierFilter("all"); setPricingPage(1); }}
                                    className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${selectedTierFilter === "all"
                                            ? "bg-[#AD4313] text-white shadow-2xs"
                                            : "bg-[#FFFDF9] hover:bg-[#F9F3EA] border border-[#E6DBCB] text-[#5C3D2E]"
                                        }`}
                                >
                                    All ({basePrices.length})
                                </button>
                                {[1, 2, 3, 4].map((tierNum) => (
                                    <button
                                        key={tierNum}
                                        type="button"
                                        onClick={() => { setSelectedTierFilter(String(tierNum)); setPricingPage(1); }}
                                        className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${String(selectedTierFilter) === String(tierNum)
                                                ? "bg-[#AD4313] text-white shadow-2xs"
                                                : "bg-[#FFFDF9] hover:bg-[#F9F3EA] border border-[#E6DBCB] text-[#5C3D2E]"
                                            }`}
                                    >
                                        {tierNum} Tier ({tierCounts[tierNum] || 0})
                                    </button>
                                ))}
                            </div>

                            {/* Right Side: Search, Flavor Filter, Reset & Export */}
                            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                                {/* Search Box */}
                                <div className="relative min-w-[180px] sm:min-w-[220px]">
                                    <input
                                        type="text"
                                        value={pricingSearch}
                                        onChange={(e) => { setPricingSearch(e.target.value); setPricingPage(1); }}
                                        placeholder="Search size, flavor, or lead time..."
                                        className="w-full pl-8 pr-3 py-1.5 bg-[#FFFDF9] border border-[#E6DBCB] rounded-xl text-xs font-medium text-[#3D251E] placeholder-[#A48B78] focus:outline-none focus:border-[#AD4313]"
                                    />
                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A48B78] text-xs">🔍</span>
                                    {pricingSearch && (
                                        <button
                                            type="button"
                                            onClick={() => setPricingSearch("")}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A48B78] hover:text-[#3D251E] text-xs"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                {/* Flavor Selector Dropdown */}
                                <select
                                    value={selectedFlavorFilter}
                                    onChange={(e) => { setSelectedFlavorFilter(e.target.value); setPricingPage(1); }}
                                    className="bg-[#FFFDF9] border border-[#E6DBCB] rounded-xl px-3 py-1.5 font-bold text-xs text-[#5C3D2E] cursor-pointer focus:outline-none"
                                >
                                    <option value="all">All Flavors</option>
                                    {flavorOptions.map((flv) => (
                                        <option key={flv} value={flv}>{flv}</option>
                                    ))}
                                </select>

                                {/* Reset Filters Button */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedTierFilter("all");
                                        setPricingSearch("");
                                        setSelectedFlavorFilter("all");
                                        setPricingPage(1);
                                    }}
                                    className="px-3 py-1.5 bg-[#FFFDF9] hover:bg-[#F9F3EA] border border-[#E6DBCB] rounded-xl text-[#5C3D2E] transition-all flex items-center gap-1 cursor-pointer"
                                >
                                    <span>↻</span> Reset Filters
                                </button>

                                {/* Export CSV */}
                                <button
                                    type="button"
                                    onClick={handleExportPricingCSV}
                                    className="px-3 py-1.5 bg-[#FFFDF9] hover:bg-[#F9F3EA] border border-[#E6DBCB] rounded-xl text-[#5C3D2E] transition-all flex items-center gap-1 cursor-pointer"
                                >
                                    <span>⤓</span> Export CSV
                                </button>
                            </div>
                        </div>

                        {/* 3. Base Tier Pricing Matrix Table Container */}
                        <div className="bg-white border border-[#E6DBCB] rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col gap-4">
                            {/* Table Header Bar */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#E6DBCB]/30">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-base font-black text-[#3D251E]">🎂 Base Tier Pricing Matrix</h2>
                                    <span className="px-2.5 py-0.5 bg-[#F9F4EC] text-[#8C6D58] border border-[#E6DBCB] rounded-full text-xs font-bold">
                                        {paginatedBasePrices.length} of {filteredBasePrices.length} displayed
                                    </span>
                                </div>

                                <div className="text-xs text-[#8C6D58] font-medium flex items-center gap-1">
                                    <span className="text-emerald-600 font-bold">✓</span> Edits update storefront custom cake quotation in real time
                                </div>
                            </div>

                            {pricingLoading ? (
                                <p className="text-[#8C6D58] font-bold text-center py-12 animate-pulse">Loading pricing matrix...</p>
                            ) : filteredBasePrices.length === 0 ? (
                                <div className="p-12 text-center text-[#8C6D58]">
                                    <span className="text-4xl block mb-2">🍰</span>
                                    <h3 className="font-bold text-[#3D251E] text-base">No cake pricing rules match your filters</h3>
                                    <p className="text-xs mt-1">Try resetting search or tier selection.</p>
                                </div>
                            ) : (
                                /* Matrix Data Table */
                                <div className="overflow-x-auto rounded-xl border border-[#E6DBCB]/60">
                                    <table className="w-full text-left border-collapse min-w-[750px]">
                                        <thead className="bg-[#FFFDF9] text-[#8C6D58] uppercase text-[11px] font-bold tracking-wider border-b border-[#E6DBCB]">
                                            <tr>
                                                <th className="p-3.5">CAKE TIER</th>
                                                <th className="p-3.5">SIZE SPEC</th>
                                                <th className="p-3.5">FLAVOR OPTION</th>
                                                <th className="p-3.5">BASE RETAIL PRICE (PHP)</th>
                                                <th className="p-3.5">LEAD TIME / STATUS</th>
                                                <th className="p-3.5 text-right">ACTIONS</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#E6DBCB]/40 text-xs font-semibold text-[#3D251E]">
                                            {paginatedBasePrices.map((item) => {
                                                const draft = getBaseDraftValue(item);
                                                const isChanged = draft != item.price;
                                                const savingId = `base-${item.id}`;
                                                const isSaving = savingKey === savingId;
                                                const tierNum = getTierNumber(item.tier);
                                                const tierBadgeText = `${tierNum}T`;

                                                return (
                                                    <tr key={item.id} className="hover:bg-[#FCF8EE]/60 transition-colors">
                                                        {/* CAKE TIER */}
                                                        <td className="p-3.5">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-lg bg-[#FDF0EB] text-[#AD4313] border border-[#F5D5C8] font-mono font-black text-xs flex items-center justify-center shrink-0">
                                                                    {tierBadgeText}
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold text-[#3D251E] text-sm">
                                                                        {item.tier || `${tierNum} Tier Cake`}
                                                                    </span>
                                                                    <span className="text-[11px] text-[#8C6D58] font-normal">
                                                                        {getTierSubtitle(item.tier)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </td>

                                                        {/* SIZE SPEC */}
                                                        <td className="p-3.5">
                                                            <span className="px-3 py-1 bg-[#F9F4EC] text-[#5C3D2E] border border-[#E6DBCB] rounded-xl text-xs font-semibold inline-block">
                                                                {item.size || "Standard"}
                                                            </span>
                                                        </td>

                                                        {/* FLAVOR OPTION */}
                                                        <td className="p-3.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`w-2.5 h-2.5 rounded-full ${getFlavorDotColor(item.flavor)}`} />
                                                                <span className="font-bold text-[#3D251E] text-xs">
                                                                    {item.flavor || "Default Flavor"}
                                                                </span>
                                                            </div>
                                                        </td>

                                                        {/* BASE RETAIL PRICE (PHP) */}
                                                        <td className="p-3.5">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-[#AD4313] font-black text-sm">₱</span>
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    value={draft}
                                                                    onChange={(e) => setDraftBasePrices((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                                                    className="w-32 px-3 py-1.5 bg-[#FFFDF9] rounded-xl border border-[#E6DBCB] text-xs font-extrabold text-[#AD4313] focus:outline-none focus:border-[#AD4313] shadow-2xs"
                                                                />
                                                            </div>
                                                        </td>

                                                        {/* LEAD TIME / STATUS */}
                                                        <td className="p-3.5">
                                                            <span className="px-3 py-1 bg-[#EDFDF3] text-[#16A34A] border border-[#BBF7D0] rounded-full text-[11px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap">
                                                                {getLeadTime(item.tier)} <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                            </span>
                                                        </td>

                                                        {/* ACTIONS */}
                                                        <td className="p-3.5 text-right">
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => saveBasePrice(item)}
                                                                    disabled={!isChanged || isSaving}
                                                                    title="Save Changes"
                                                                    className="w-8 h-8 rounded-lg bg-[#AD4313] hover:bg-[#8F350E] text-white flex items-center justify-center font-bold text-xs transition-all disabled:opacity-30 cursor-pointer shadow-2xs"
                                                                >
                                                                    {isSaving ? "…" : "✓"}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setDraftBasePrices((prev) => { const n = { ...prev }; delete n[item.id]; return n; })}
                                                                    disabled={!isChanged || isSaving}
                                                                    title="Cancel Edit"
                                                                    className="w-8 h-8 rounded-lg bg-white hover:bg-[#FCF8EE] border border-[#E6DBCB] text-[#8C6D58] flex items-center justify-center font-bold text-xs transition-all disabled:opacity-30 cursor-pointer"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* ── Bottom Pagination Bar ── */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[#E6DBCB]/40 text-xs font-medium text-[#8C6D58]">
                                {/* Rows per page selector */}
                                <div className="flex items-center gap-2">
                                    <span>Rows per page:</span>
                                    <select
                                        value={pricingPerPage}
                                        onChange={(e) => { setPricingPerPage(Number(e.target.value)); setPricingPage(1); }}
                                        className="bg-[#FFFDF9] border border-[#E6DBCB] rounded-lg px-2.5 py-1 font-bold text-xs text-[#3D251E] cursor-pointer focus:outline-none"
                                    >
                                        <option value={10}>10</option>
                                        <option value={20}>20</option>
                                        <option value={50}>50</option>
                                    </select>
                                    <span className="text-[11px] text-[#8C6D58] ml-1">
                                        Showing {filteredBasePrices.length > 0 ? (pricingPage - 1) * pricingPerPage + 1 : 0} – {Math.min(pricingPage * pricingPerPage, filteredBasePrices.length)} of {filteredBasePrices.length} items
                                    </span>
                                </div>

                                {/* Page Number Controls */}
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        disabled={pricingPage <= 1}
                                        onClick={() => setPricingPage((prev) => Math.max(1, prev - 1))}
                                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-[#E6DBCB] text-[#3D251E] transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-[#FCF8EE]"
                                        aria-label="Previous Page"
                                    >
                                        ‹
                                    </button>

                                    {Array.from({ length: totalPricingPages }).map((_, i) => {
                                        const p = i + 1;
                                        const isActive = pricingPage === p;
                                        return (
                                            <button
                                                key={p}
                                                type="button"
                                                onClick={() => setPricingPage(p)}
                                                className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all cursor-pointer ${isActive
                                                        ? "bg-[#AD4313] text-white shadow-2xs"
                                                        : "bg-white border border-[#E6DBCB] text-[#3D251E] hover:bg-[#FCF8EE]"
                                                    }`}
                                            >
                                                {p}
                                            </button>
                                        );
                                    })}

                                    <button
                                        type="button"
                                        disabled={pricingPage >= totalPricingPages}
                                        onClick={() => setPricingPage((prev) => Math.min(totalPricingPages, prev + 1))}
                                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-[#E6DBCB] text-[#3D251E] transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-[#FCF8EE]"
                                        aria-label="Next Page"
                                    >
                                        ›
                                    </button>
                                </div>

                                {/* Jump to page */}
                                <form onSubmit={handleJumpPricingPage} className="flex items-center gap-2">
                                    <span>Go to page:</span>
                                    <input
                                        type="number"
                                        min="1"
                                        max={totalPricingPages}
                                        value={jumpPricingPage}
                                        onChange={(e) => setJumpPricingPage(e.target.value)}
                                        placeholder="1"
                                        className="w-12 px-2 py-1 bg-[#FFFDF9] border border-[#E6DBCB] rounded-lg text-xs font-bold text-[#3D251E] text-center focus:outline-none focus:border-[#AD4313]"
                                    />
                                    <button
                                        type="submit"
                                        className="px-3 py-1 bg-white hover:bg-[#FCF8EE] border border-[#E6DBCB] rounded-lg text-xs font-semibold text-[#3D251E] cursor-pointer"
                                    >
                                        Go ›
                                    </button>
                                </form>
                            </div>
                        </div>

                        {/* 4. Additional Feature / Addon Prices Section (Cherry, Sprinkles, Candle, Chocolate, Balls, Nuts) */}
                        <div className="bg-white border border-[#E6DBCB] rounded-2xl p-6 shadow-xs flex flex-col gap-4">
                            <div className="flex items-center justify-between pb-2 border-b border-[#E6DBCB]/30">
                                <div>
                                    <h3 className="text-base font-black text-[#3D251E]">Toppings &amp; Add-on Custom Rules</h3>
                                    <p className="text-xs text-[#8C6D58]">Configure price for Candle, Chocolate, Balls, Nuts, Cherry, and Sprinkles.</p>
                                </div>
                                <span className="text-xs text-[#8C6D58] font-semibold">{addonPrices.length} items configured</span>
                            </div>

                            <div className="overflow-x-auto rounded-xl border border-[#E6DBCB]/60">
                                <table className="w-full text-left border-collapse min-w-[600px]">
                                    <thead className="bg-[#FFFDF9] text-[#8C6D58] text-[11px] font-bold uppercase tracking-wider border-b border-[#E6DBCB]">
                                        <tr>
                                            <th className="p-3.5">TOPPING / ADD-ON NAME</th>
                                            <th className="p-3.5">KEY IDENTIFIER</th>
                                            <th className="p-3.5">PRICE (PHP)</th>
                                            <th className="p-3.5 text-right">ACTIONS</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#E6DBCB]/40 text-xs font-semibold text-[#3D251E]">
                                        {addonPrices.map((item) => {
                                            const draft = getAddonDraftValue(item);
                                            const isChanged = draft != item.price;
                                            const savingId = `addon-${item.id}`;
                                            const isSaving = savingKey === savingId;

                                            return (
                                                <tr key={item.id} className="hover:bg-[#FCF8EE]/60 transition-colors">
                                                    <td className="p-3.5 font-bold text-[#3D251E] text-sm">
                                                        {item.name}
                                                    </td>
                                                    <td className="p-3.5 text-xs text-[#8C6D58] font-mono">
                                                        {item.key}
                                                    </td>
                                                    <td className="p-3.5">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[#AD4313] font-black text-sm">₱</span>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={draft}
                                                                onChange={(e) => setDraftAddonPrices((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                                                className="w-32 px-3 py-1.5 bg-[#FFFDF9] rounded-xl border border-[#E6DBCB] text-xs font-extrabold text-[#AD4313] focus:outline-none focus:border-[#AD4313] shadow-2xs"
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="p-3.5 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => saveAddonPrice(item)}
                                                                disabled={!isChanged || isSaving}
                                                                className="w-8 h-8 rounded-lg bg-[#AD4313] hover:bg-[#8F350E] text-white flex items-center justify-center font-bold text-xs transition-all disabled:opacity-30 cursor-pointer shadow-2xs"
                                                            >
                                                                {isSaving ? "…" : "✓"}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setDraftAddonPrices((prev) => { const n = { ...prev }; delete n[item.id]; return n; })}
                                                                disabled={!isChanged || isSaving}
                                                                className="w-8 h-8 rounded-lg bg-white hover:bg-[#FCF8EE] border border-[#E6DBCB] text-[#8C6D58] flex items-center justify-center font-bold text-xs transition-all disabled:opacity-30 cursor-pointer"
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 5. Addon Info Cards Footer Row */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-4 bg-[#FFFDF9] border border-[#E6DBCB] rounded-2xl flex items-start gap-3 shadow-2xs">
                                <div className="w-8 h-8 rounded-xl bg-[#FDF0EB] text-[#AD4313] flex items-center justify-center font-bold text-sm shrink-0">
                                    🏷️
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <h4 className="font-bold text-[#3D251E] text-xs uppercase tracking-wider">
                                        FONDANT / FLORAL ADD-ONS
                                    </h4>
                                    <p className="text-[11px] text-[#8C6D58] leading-relaxed font-medium">
                                        Sculpted toppers and edible florals add ₱250 - ₱1,200 dependent on size &amp; intricate complexity.
                                    </p>
                                </div>
                            </div>

                            <div className="p-4 bg-[#FFFDF9] border border-[#E6DBCB] rounded-2xl flex items-start gap-3 shadow-2xs">
                                <div className="w-8 h-8 rounded-xl bg-[#FDF0EB] text-[#AD4313] flex items-center justify-center font-bold text-sm shrink-0">
                                    ⚡
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <h4 className="font-bold text-[#3D251E] text-xs uppercase tracking-wider">
                                        RUSH FEE MULTIPLIER
                                    </h4>
                                    <p className="text-[11px] text-[#8C6D58] leading-relaxed font-medium">
                                        Orders requested under standard lead time automatically append 25% priority baker surge.
                                    </p>
                                </div>
                            </div>

                            <div className="p-4 bg-[#FFFDF9] border border-[#E6DBCB] rounded-2xl flex items-start gap-3 shadow-2xs">
                                <div className="w-8 h-8 rounded-xl bg-[#FDF0EB] text-[#AD4313] flex items-center justify-center font-bold text-sm shrink-0">
                                    🚚
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <h4 className="font-bold text-[#3D251E] text-xs uppercase tracking-wider">
                                        TIER LOGISTICS HANDLING
                                    </h4>
                                    <p className="text-[11px] text-[#8C6D58] leading-relaxed font-medium">
                                        3-Tier &amp; 4-Tier orders mandate temperature-controlled van delivery with assembly setup.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default AdminProductList;