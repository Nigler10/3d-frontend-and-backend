// src/pages/admin/AdminDashboard.jsx
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "../../utils/auth";
import { getOrderStatusLabel } from "../../utils/orderStatus";

export default function AdminDashboard() {
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [queuePage, setQueuePage] = useState(1);
    const [showStats, setShowStats] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [sortBy, setSortBy] = useState("date_asc");
    const [perPage, setPerPage] = useState(10);
    const [jumpPageInput, setJumpPageInput] = useState("");
    const [viewMode, setViewMode] = useState("table"); // 'table' | 'cards'
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isSortOpen, setIsSortOpen] = useState(false);

    useEffect(() => {
        fetchDashboard();
    }, [queuePage]);

    const fetchDashboard = async () => {
        try {
            const res = await authFetch(`${BASEURL}/api/orders/admin/dashboard/?page=${queuePage}`);
            const json = await res.json();
            setData(json);
        } catch (err) {
            console.error(err);
        }
    };

    // Filter & Sort All Upcoming Orders
    const processedQueueOrders = useMemo(() => {
        if (!data?.all_upcoming_orders) return [];

        let list = [...data.all_upcoming_orders];

        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(
                (o) =>
                    (o.full_name && o.full_name.toLowerCase().includes(q)) ||
                    String(o.id).includes(q) ||
                    (o.status && o.status.toLowerCase().includes(q))
            );
        }

        // Status filter
        if (statusFilter !== "all") {
            list = list.filter((o) => o.status === statusFilter);
        }

        // Sorting
        list.sort((a, b) => {
            if (sortBy === "date_asc") {
                return new Date(a.delivery_date || 0) - new Date(b.delivery_date || 0);
            }
            if (sortBy === "date_desc") {
                return new Date(b.delivery_date || 0) - new Date(a.delivery_date || 0);
            }
            if (sortBy === "name_asc") {
                return (a.full_name || "").localeCompare(b.full_name || "");
            }
            if (sortBy === "id_desc") {
                return b.id - a.id;
            }
            return 0;
        });

        return list;
    }, [data, searchQuery, statusFilter, sortBy]);

    // CSV Export Handler
    const handleExportCSV = () => {
        const ordersToExport = processedQueueOrders;

        if (ordersToExport.length === 0) {
            alert("No orders available to export.");
            return;
        }

        const headers = ["Order ID", "Customer Name", "Delivery Date", "Time", "Status"];
        const rows = ordersToExport.map((o) => [
            `#${o.id}`,
            `"${(o.full_name || "").replace(/"/g, '""')}"`,
            o.delivery_date || "",
            o.delivery_time || "No time set",
            o.status || "",
        ]);

        const csvContent =
            "data:text/csv;charset=utf-8," +
            [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `dashboard_orders_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleJumpPage = (e) => {
        e.preventDefault();
        const p = parseInt(jumpPageInput, 10);
        if (p > 0) {
            setQueuePage(p);
            setJumpPageInput("");
        }
    };

    const getStatusBadgeStyle = (status) => {
        switch (status) {
            case "pending_review":
                return "bg-[#FFF7EA] text-[#C05A11] border-[#ECD9B4]";
            case "awaiting_downpayment":
                return "bg-[#FFFBEB] text-[#D97706] border-[#FCD34D]";
            case "processing":
                return "bg-[#FFF7ED] text-[#EA580C] border-[#FFEDD5]";
            case "ready_for_delivery":
                return "bg-[#EDFDF3] text-[#16A34A] border-[#BBF7D0]";
            case "completed":
            case "delivered":
                return "bg-[#E6F4EA] text-[#137333] border-[#A7F3D0]";
            case "rejected":
            case "cancelled":
                return "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]";
            default:
                return "bg-[#FDF6E2] text-[#6E473B] border-[#E6CCA2]";
        }
    };

    if (!data) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#FCF8EE] text-[#4A2E2B]">
            <div className="w-12 h-12 border-4 border-[#AD4313] border-t-transparent rounded-full animate-spin mb-4" />
            <p className="font-extrabold text-lg animate-pulse tracking-wide">Loading management console...</p>
        </div>
    );

    const totalPages = Math.max(1, data.all_upcoming_total_pages || 1);

    return (
        <div className="min-h-screen bg-[#FCF8EE] pb-16 text-[#3D251E] font-sans antialiased">
            <div className="max-w-7xl mx-auto px-4 md:px-8 pt-8 flex flex-col gap-6">

                {/* ── Page Header ── */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-black text-[#3D251E] tracking-tight">Business Overview</h1>

                        </div>
                        <p className="text-[#8C6D58] font-medium text-sm mt-1">Welcome back, Chef! Here's what's happening today.</p>
                    </div>

                    {/* Quick action button */}
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => navigate("/admin/products/create")}
                            className="px-4 py-2.5 bg-[#AD4313] hover:bg-[#8F350E] text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                        >
                            <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">⊕</span> Add Product
                        </button>
                    </div>
                </header>

                {/* ── Toolbar & Control Bar (Exact Image Matching) ── */}
                <div className="bg-[#FFFDF9] border border-[#E6DBCB] rounded-2xl p-3 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    {/* Left Controls: View, Filter, Sort, Search, Stats Toggle */}
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                        {/* View Switcher Dropdown */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setViewMode(viewMode === "table" ? "cards" : "table")}
                                className="flex items-center gap-2 px-3.5 py-2 bg-[#FFFDF9] hover:bg-[#F9F3EA] border border-[#E6DBCB] rounded-xl text-[#5C3D2E] transition-all cursor-pointer font-medium"
                            >
                                <span className="text-sm">田</span>
                                <span>{viewMode === "table" ? "Table View" : "Cards View"}</span>
                                <span className="text-[10px] text-[#8C6D58]">▾</span>
                            </button>
                        </div>

                        {/* Filter Button */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => { setIsFilterOpen(!isFilterOpen); setIsSortOpen(false); }}
                                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border transition-all cursor-pointer font-medium ${statusFilter !== "all"
                                    ? "bg-[#AD4313] text-white border-[#AD4313]"
                                    : "bg-[#FFFDF9] hover:bg-[#F9F3EA] border-[#E6DBCB] text-[#5C3D2E]"
                                    }`}
                            >
                                <span>⚡ Filter</span>
                                {statusFilter !== "all" && (
                                    <span className="bg-white text-[#AD4313] rounded-full w-4 h-4 text-[10px] flex items-center justify-center font-black">1</span>
                                )}
                                <span className="text-[10px]">▾</span>
                            </button>

                            {/* Filter Dropdown */}
                            {isFilterOpen && (
                                <div className="absolute left-0 mt-2 w-48 bg-white border border-[#E6DBCB] rounded-xl shadow-xl z-30 p-2 text-xs font-semibold flex flex-col gap-1">
                                    <div className="text-[10px] font-black uppercase text-[#8C6D58] px-2 py-1">Filter by Status</div>
                                    {[
                                        { id: "all", label: "All Statuses" },
                                        { id: "pending_review", label: "Pending Review" },
                                        { id: "awaiting_downpayment", label: "Awaiting Downpayment" },
                                        { id: "processing", label: "Processing" },
                                        { id: "completed", label: "Completed" },
                                    ].map((opt) => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            className={`w-full text-left px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${statusFilter === opt.id ? "bg-[#FDF6E2] text-[#AD4313] font-bold" : "hover:bg-[#FCF8EE] text-[#5C3D2E]"}`}
                                            onClick={() => { setStatusFilter(opt.id); setIsFilterOpen(false); }}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Sort Button */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => { setIsSortOpen(!isSortOpen); setIsFilterOpen(false); }}
                                className="flex items-center gap-2 px-3.5 py-2 bg-[#FFFDF9] hover:bg-[#F9F3EA] border border-[#E6DBCB] rounded-xl text-[#5C3D2E] transition-all cursor-pointer font-medium"
                            >
                                <span>⇅ Sort</span>
                                <span className="text-[10px] text-[#8C6D58]">▾</span>
                            </button>

                            {/* Sort Dropdown */}
                            {isSortOpen && (
                                <div className="absolute left-0 mt-2 w-48 bg-white border border-[#E6DBCB] rounded-xl shadow-xl z-30 p-2 text-xs font-semibold flex flex-col gap-1">
                                    <div className="text-[10px] font-black uppercase text-[#8C6D58] px-2 py-1">Sort Orders</div>
                                    {[
                                        { id: "date_asc", label: "Delivery Date (Earliest)" },
                                        { id: "date_desc", label: "Delivery Date (Latest)" },
                                        { id: "name_asc", label: "Customer Name" },
                                        { id: "id_desc", label: "Order ID (Newest)" },
                                    ].map((opt) => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            className={`w-full text-left px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${sortBy === opt.id ? "bg-[#FDF6E2] text-[#AD4313] font-bold" : "hover:bg-[#FCF8EE] text-[#5C3D2E]"}`}
                                            onClick={() => { setSortBy(opt.id); setIsSortOpen(false); }}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Search Input Box */}
                        <div className="relative min-w-[200px] sm:min-w-[240px]">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search customer, ID, or dish..."
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

                        {/* Show Statistics Toggle Switch */}
                        <label className="flex items-center gap-2 px-3 py-2 border border-transparent rounded-xl cursor-pointer select-none">
                            <span className="text-[#8C6D58] font-medium text-xs">Show Statistics</span>
                            <div className="relative inline-block w-9 h-5 transition-all">
                                <input
                                    type="checkbox"
                                    checked={showStats}
                                    onChange={() => setShowStats(!showStats)}
                                    className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-[#E6CCA2] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#E6DBCB] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#AD4313]" />
                            </div>
                        </label>
                    </div>

                    {/* Right Controls: Reset & Export */}
                    <div className="flex items-center gap-2 text-xs font-semibold">
                        <button
                            type="button"
                            onClick={() => {
                                setStatusFilter("all");
                                setSearchQuery("");
                                setSortBy("date_asc");
                            }}
                            className="px-3.5 py-2 bg-[#FFFDF9] hover:bg-[#F9F3EA] border border-[#E6DBCB] rounded-xl text-[#5C3D2E] transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            <span>↻</span> Reset Controls
                        </button>

                        <button
                            type="button"
                            onClick={handleExportCSV}
                            className="px-3.5 py-2 bg-[#FFFDF9] hover:bg-[#F9F3EA] border border-[#E6DBCB] rounded-xl text-[#5C3D2E] transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            <span>⤓</span> Export
                        </button>
                    </div>
                </div>

                {/* ── Stat Metric Cards Row (5 Cards) ── */}
                {showStats && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 transition-all duration-300">
                        <MetricCard
                            title="TOTAL ORDERS"
                            value={data.total_orders ?? 40}
                            trend="+12%"
                            trendPeriod="vs last month"
                            infoTooltip="Total lifetime orders received."
                        />
                        <MetricCard
                            title="PENDING REVIEW"
                            value={data.pending_review ?? 6}
                            trend="+4%"
                            trendPeriod="vs last week"
                            infoTooltip="Custom cake requests awaiting admin review."
                            badgeColor="amber"
                        />
                        <MetricCard
                            title="AWAITING PAYMENT"
                            value={data.awaiting_downpayment ?? 4}
                            trend="+2%"
                            trendPeriod="vs last week"
                            infoTooltip="Orders pending customer downpayment verification."
                            badgeColor="orange"
                        />
                        <MetricCard
                            title="COMPLETED"
                            value={data.completed ?? 7}
                            trend="+8%"
                            trendPeriod="vs last month"
                            infoTooltip="Orders successfully fulfilled and delivered."
                            badgeColor="green"
                        />
                        <MetricCard
                            title="TOTAL REVENUE"
                            value={`₱${Number(data.total_revenue || 13505).toLocaleString()}`}
                            trend="+15%"
                            trendPeriod="vs last month"
                            infoTooltip="Total gross revenue earned."
                            isHighlight={true}
                        />
                    </div>
                )}

                {/* ── Upcoming Deliveries Section (Next 7 Days) ── */}
                <div className="bg-white border border-[#E6DBCB] rounded-2xl p-6 shadow-xs flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-black text-[#3D251E]">Upcoming Deliveries (Next 7 Days)</h2>
                            <span className="px-2.5 py-0.5 bg-[#FDF0EB] text-[#AD4313] border border-[#F5D5C8] text-xs font-black rounded-full">
                                {data.upcoming_orders?.length || 0}
                            </span>
                        </div>
                    </div>

                    {!data.upcoming_orders || data.upcoming_orders.length === 0 ? (
                        <div className="p-8 text-center bg-[#FCF8EE] rounded-xl border border-dashed border-[#E6DBCB]">
                            <p className="text-[#8C6D58] font-medium text-sm">No urgent deliveries scheduled for the next 7 days 🎉</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {data.upcoming_orders.map((order) => (
                                <div
                                    key={order.id}
                                    className="p-4 bg-white border border-[#E6DBCB] rounded-2xl cursor-pointer transition-all flex flex-col justify-between gap-3 shadow-2xs hover:shadow-md group"
                                    onClick={() => navigate(`/admin/orders/${order.id}`)}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="text-[10px] font-black tracking-wider text-[#8C6D58] uppercase">
                                            ORDER #{order.id}
                                        </span>

                                        <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border uppercase ${getStatusBadgeStyle(order.status)}`}>
                                            {getOrderStatusLabel(order.status, true)}
                                        </span>
                                    </div>

                                    <div>
                                        <h3 className="font-bold text-[#3D251E] text-base group-hover:text-[#AD4313] transition-colors">
                                            {order.full_name}
                                        </h3>
                                    </div>

                                    <div className="flex items-center justify-between text-xs text-[#8C6D58] font-medium pt-2 border-t border-[#E6DBCB]/40">
                                        <div className="flex items-center gap-3">
                                            <span>📅 {order.delivery_date}</span>
                                            <span>🕒 {order.delivery_time || "17:00:00"}</span>
                                        </div>
                                        <span className="text-[#AD4313] font-bold text-xs hover:underline">
                                            View Order →
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Scheduled Orders Queue Data Table ── */}
                <div className="bg-white border border-[#E6DBCB] rounded-2xl p-6 shadow-xs flex flex-col gap-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#E6DBCB]/30">
                        <div>
                            <h2 className="text-lg font-black text-[#3D251E]">All Scheduled Orders (Queue)</h2>
                            <p className="text-xs text-[#8C6D58] font-medium">Manage and track live customer order queue.</p>
                        </div>
                    </div>

                    {processedQueueOrders.length === 0 ? (
                        <div className="p-12 text-center bg-[#FCF8EE] rounded-xl border border-dashed border-[#E6DBCB]">
                            <span className="text-3xl block mb-2">📦</span>
                            <h3 className="font-bold text-[#3D251E] text-sm">No queue orders match your filter criteria</h3>
                            <p className="text-xs text-[#8C6D58] mt-1">Try resetting search or status filters.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-[#E6DBCB]/60">
                            <table className="w-full text-left border-collapse">
                                {/* Table Header */}
                                <thead className="bg-[#FFFDF9] text-[#8C6D58] text-[11px] font-bold uppercase tracking-wider border-b border-[#E6DBCB]">
                                    <tr>
                                        <th className="p-3.5 cursor-pointer hover:text-[#3D251E]" onClick={() => setSortBy(sortBy === "id_desc" ? "date_asc" : "id_desc")}>
                                            ORDER &amp; CUSTOMER ↕
                                        </th>
                                        <th className="p-3.5 cursor-pointer hover:text-[#3D251E]" onClick={() => setSortBy(sortBy === "date_asc" ? "date_desc" : "date_asc")}>
                                            DELIVERY DATE ↕
                                        </th>
                                        <th className="p-3.5">
                                            TIME SLOT
                                        </th>
                                        <th className="p-3.5 cursor-pointer hover:text-[#3D251E]">
                                            STATUS ↕
                                        </th>
                                        <th className="p-3.5 text-right">
                                            ACTION
                                        </th>
                                    </tr>
                                </thead>

                                {/* Table Body */}
                                <tbody className="divide-y divide-[#E6DBCB]/40 text-xs font-semibold text-[#3D251E]">
                                    {processedQueueOrders.map((order) => {
                                        return (
                                            <tr
                                                key={order.id}
                                                onClick={() => navigate(`/admin/orders/${order.id}`)}
                                                className="transition-colors cursor-pointer hover:bg-[#FCF8EE]/70"
                                            >
                                                <td className="p-3.5">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-[#3D251E] text-sm">
                                                            {order.full_name || "Customer"}
                                                        </span>
                                                        <span className="text-[11px] text-[#8C6D58] font-normal">
                                                            Order #{order.id}
                                                        </span>
                                                    </div>
                                                </td>

                                                <td className="p-3.5 text-[#5C3D2E]">
                                                    📅 {order.delivery_date || "—"}
                                                </td>

                                                <td className="p-3.5 text-[#5C3D2E]">
                                                    🕒 {order.delivery_time || "Flexible"}
                                                </td>

                                                <td className="p-3.5">
                                                    <span className={`inline-flex items-center gap-1 px-3 py-1 text-[10px] font-bold rounded-full border uppercase ${getStatusBadgeStyle(order.status)}`}>
                                                        • {getOrderStatusLabel(order.status, true)}
                                                    </span>
                                                </td>

                                                <td className="p-3.5 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/admin/orders/${order.id}`);
                                                        }}
                                                        className="px-3.5 py-1.5 bg-white hover:bg-[#FCF8EE] border border-[#E6DBCB] text-[#AD4313] text-xs font-semibold rounded-xl transition-all shadow-2xs"
                                                    >
                                                        Details →
                                                    </button>
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
                        {/* Per Page Selector */}
                        <div className="flex items-center gap-2">
                            <span>Showing per page:</span>
                            <select
                                value={perPage}
                                onChange={(e) => setPerPage(Number(e.target.value))}
                                className="bg-[#FFFDF9] border border-[#E6DBCB] rounded-lg px-2.5 py-1 font-bold text-xs text-[#3D251E] cursor-pointer focus:outline-none"
                            >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>

                        {/* Page Numbers */}
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                disabled={!data.all_upcoming_has_prev || queuePage <= 1}
                                onClick={() => setQueuePage((prev) => Math.max(1, prev - 1))}
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-[#E6DBCB] text-[#3D251E] transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-[#FCF8EE]"
                                aria-label="Previous Page"
                            >
                                ‹
                            </button>

                            {[1, 2, 3].map((num) => {
                                if (num > totalPages && num !== 1) return null;
                                const isActive = queuePage === num;
                                return (
                                    <button
                                        key={num}
                                        type="button"
                                        onClick={() => setQueuePage(num)}
                                        className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all cursor-pointer ${isActive
                                            ? "bg-[#AD4313] text-white shadow-2xs"
                                            : "bg-white border border-[#E6DBCB] text-[#3D251E] hover:bg-[#FCF8EE]"
                                            }`}
                                    >
                                        {num}
                                    </button>
                                );
                            })}

                            <button
                                type="button"
                                disabled={!data.all_upcoming_has_next}
                                onClick={() => setQueuePage((prev) => prev + 1)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-[#E6DBCB] text-[#3D251E] transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-[#FCF8EE]"
                                aria-label="Next Page"
                            >
                                ›
                            </button>
                        </div>

                        {/* Jump to Page Input */}
                        <form onSubmit={handleJumpPage} className="flex items-center gap-2">
                            <span>Go to page:</span>
                            <input
                                type="number"
                                min="1"
                                value={jumpPageInput}
                                onChange={(e) => setJumpPageInput(e.target.value)}
                                placeholder="#"
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

            </div>
        </div>
    );
}

// ── MetricCard Component ──
function MetricCard({ title, value, trend, trendPeriod, infoTooltip, isHighlight, badgeColor = "green" }) {
    return (
        <div
            className={`p-5 rounded-2xl border transition-all shadow-2xs flex flex-col justify-between gap-3.5 ${isHighlight
                ? "bg-[#AD4313] text-white border-[#AD4313]"
                : "bg-white text-[#3D251E] border-[#E6DBCB]"
                }`}
        >
            <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${isHighlight ? "text-white/80" : "text-[#8C6D58]"}`}>
                    {title}
                </span>

                {infoTooltip && (
                    <span
                        title={infoTooltip}
                        className={`text-xs cursor-help opacity-60 hover:opacity-100 ${isHighlight ? "text-white" : "text-[#8C6D58]"}`}
                    >
                        ⓘ
                    </span>
                )}
            </div>

            <div>
                <p className="text-3xl font-black tracking-tight">{value}</p>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-semibold">
                <span
                    className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full font-bold ${isHighlight
                        ? "bg-white/20 text-white"
                        : badgeColor === "amber"
                            ? "bg-[#FFF7EA] text-[#AD4313]"
                            : badgeColor === "orange"
                                ? "bg-[#FFF2E2] text-[#D97706]"
                                : "bg-[#EDFDF3] text-[#16A34A]"
                        }`}
                >
                    📈 {trend}
                </span>
                <span className={isHighlight ? "text-white/80" : "text-[#8C6D58]"}>
                    {trendPeriod}
                </span>
            </div>
        </div>
    );
}