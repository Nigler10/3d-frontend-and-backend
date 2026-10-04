// src/pages/admin/AdminDashboard.jsx
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "../../utils/auth";
import { getOrderStatusLabel } from "../../utils/orderStatus";
import {
    LayoutDashboard,
    Plus,
    LayoutGrid,
    LayoutList,
    Filter,
    ArrowUpDown,
    Search,
    X,
    RotateCcw,
    Download,
    ChevronLeft,
    ChevronRight,
    CalendarDays,
    Clock,
    ExternalLink,
    Info,
    TrendingUp,
    TrendingDown,
    Package,
    ShoppingCart,
    Hourglass,
    CreditCard,
    CheckCircle2,
    DollarSign,
    BarChart3,
    Inbox,
    PartyPopper,
    AlertTriangle,
    XCircle,
    RefreshCw,
    ArrowRight,
} from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    LabelList,
} from "recharts";

// Helper: format time string (e.g. "23:25:00") into a human-readable range "11:25 PM – 11:55 PM"
const formatTimeSlot = (timeStr) => {
    if (!timeStr) return "Flexible Window";
    const parts = timeStr.split(":");
    if (parts.length < 2) return timeStr;

    let hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return timeStr;

    const startAmPm = hours >= 12 ? "PM" : "AM";
    const displayStartHour = hours % 12 === 0 ? 12 : hours % 12;
    const formattedStart = `${displayStartHour}:${minutes < 10 ? "0" : ""}${minutes} ${startAmPm}`;

    let endHours = hours;
    let endMinutes = minutes + 30;
    if (endMinutes >= 60) {
        endMinutes -= 60;
        endHours = (endHours + 1) % 24;
    }
    const endAmPm = endHours >= 12 ? "PM" : "AM";
    const displayEndHour = endHours % 12 === 0 ? 12 : endHours % 12;
    const formattedEnd = `${displayEndHour}:${endMinutes < 10 ? "0" : ""}${endMinutes} ${endAmPm}`;

    return `${formattedStart} – ${formattedEnd}`;
};

// Helper: check if an order is overdue
const checkIsOverdue = (deliveryDate, status) => {
    if (!deliveryDate) return false;
    if (["delivered", "completed", "cancelled", "rejected"].includes(status)) return false;
    const todayStr = new Date().toISOString().slice(0, 10);
    return deliveryDate < todayStr;
};

// Helper: get consistent status pill config (color, icon, label)
const getStatusConfig = (status) => {
    switch (status) {
        case "pending_review":
            return {
                style: "bg-[#FFF7EA] text-[#C05A11] border-[#ECD9B4]",
                Icon: Hourglass,
                label: "Pending Review",
            };
        case "awaiting_downpayment":
            return {
                style: "bg-[#FFFBEB] text-[#D97706] border-[#FCD34D]",
                Icon: CreditCard,
                label: "Awaiting Payment",
            };
        case "processing":
            return {
                style: "bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]",
                Icon: RefreshCw,
                label: "Processing",
            };
        case "ready_for_delivery":
            return {
                style: "bg-[#EDFDF3] text-[#16A34A] border-[#BBF7D0]",
                Icon: CheckCircle2,
                label: "Ready for Delivery",
            };
        case "completed":
        case "delivered":
            return {
                style: "bg-[#E6F4EA] text-[#137333] border-[#A7F3D0]",
                Icon: CheckCircle2,
                label: "Delivered",
            };
        case "rejected":
        case "cancelled":
            return {
                style: "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]",
                Icon: XCircle,
                label: status === "rejected" ? "Rejected" : "Cancelled",
            };
        default:
            return {
                style: "bg-[#FDF6E2] text-[#6E473B] border-[#E6CCA2]",
                Icon: Info,
                label: getOrderStatusLabel(status, true) || status || "Unknown",
            };
    }
};

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
        if (statusFilter === "overdue") {
            list = list.filter((o) => checkIsOverdue(o.delivery_date, o.status));
        } else if (statusFilter !== "all") {
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

        const headers = ["Order ID", "Customer Name", "Delivery Date", "Time Slot", "Status", "Is Overdue"];
        const rows = ordersToExport.map((o) => [
            `#${o.id}`,
            `"${(o.full_name || "").replace(/"/g, '""')}"`,
            o.delivery_date || "",
            formatTimeSlot(o.delivery_time),
            o.status || "",
            checkIsOverdue(o.delivery_date, o.status) ? "Yes" : "No",
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

    const scrollToQueue = (filterStatus = "all") => {
        setStatusFilter(filterStatus);
        const el = document.getElementById("order-queue-section");
        if (el) {
            el.scrollIntoView({ behavior: "smooth" });
        }
    };

    // ── Horizontal Bar Chart data representing order status breakdown ──
    const chartData = useMemo(() => {
        if (!data) return [];
        const bd = data.status_breakdown || {
            pending_review: data.pending_review ?? 0,
            awaiting_downpayment: data.awaiting_downpayment ?? 0,
            processing: 0,
            ready_for_delivery: 0,
            delivered: data.completed ?? 0,
            cancelled: 0,
        };

        return [
            { name: "Pending Review", value: bd.pending_review || 0, fill: "#C05A11" },
            { name: "Awaiting Payment", value: bd.awaiting_downpayment || 0, fill: "#D97706" },
            { name: "Processing", value: bd.processing || 0, fill: "#2563EB" },
            { name: "Ready for Delivery", value: bd.ready_for_delivery || 0, fill: "#16A34A" },
            { name: "Delivered", value: bd.delivered || 0, fill: "#137333" },
            { name: "Cancelled/Rejected", value: bd.cancelled || 0, fill: "#991B1B" },
        ];
    }, [data]);

    // ── Loading State ──
    if (!data)
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#FCF8EE] text-[#4A2E2B]">
                <div className="relative w-16 h-16 mb-6">
                    <div className="absolute inset-0 rounded-full border-4 border-[#E6DBCB]" />
                    <div className="absolute inset-0 rounded-full border-4 border-[#AD4313] border-t-transparent animate-spin" />
                    <LayoutDashboard className="absolute inset-0 m-auto w-6 h-6 text-[#AD4313] opacity-60" />
                </div>
                <p className="font-bold text-base animate-pulse tracking-wide text-[#3D251E]">Loading management console...</p>
                <p className="text-xs text-[#8C6D58] mt-1.5">Fetching your latest data</p>
            </div>
        );

    const totalPages = Math.max(1, data.all_upcoming_total_pages || 1);
    const overdueCount = data.overdue_count || 0;

    // Custom Chart Tooltip
    const CustomChartTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const item = payload[0].payload;
            return (
                <div className="bg-white border border-[#E6DBCB] rounded-xl shadow-lg px-4 py-3 text-xs">
                    <p className="font-bold text-[#3D251E] mb-0.5">{item.name}</p>
                    <p className="text-[#8C6D58]">
                        Orders: <span className="font-black text-[#AD4313]">{item.value}</span>
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="min-h-screen bg-[#FCF8EE] pb-16 text-[#3D251E] font-sans antialiased">
            <div className="max-w-7xl mx-auto px-4 md:px-8 pt-8 flex flex-col gap-6">

                {/* ── Page Header ── */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">

                            <h1 className="text-3xl font-black text-[#3D251E] tracking-tight">Business Overview</h1>
                        </div>
                        <p className="text-[#8C6D58] font-medium text-sm mt-1.5 ml-[52px]">
                            Welcome back, Chef! Here's what's happening today.
                        </p>
                    </div>

                    {/* Quick action button */}
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => navigate("/admin/products/create")}
                            className="px-5 py-2.5 bg-[#AD4313] hover:bg-[#8F350E] text-white font-bold text-xs rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                        >
                            <Plus className="w-4 h-4" /> Add Product
                        </button>
                    </div>
                </header>

                {/* ── Past-Due / Overdue Warning Alert Banner ── */}
                {overdueCount > 0 && (
                    <div className="bg-[#FEF2F2] border border-[#FCA5A5] rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-[#FEE2E2] flex items-center justify-center text-[#991B1B] shrink-0">
                                <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-[#991B1B]">
                                    {overdueCount} Past-Due Order{overdueCount > 1 ? "s" : ""} Require Attention
                                </h4>
                                <p className="text-xs text-[#B91C1C]">
                                    Delivery date is in the past but the orders are not marked as completed or cancelled.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => scrollToQueue("overdue")}
                            className="px-4 py-2 bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                            Review Overdue Orders <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {/* ── Control Toolbar ── */}
                <div className="bg-[#FFFDF9] border border-[#E6DBCB] rounded-2xl p-3 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    {/* Left Controls */}
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                        {/* View Switcher */}
                        <button
                            type="button"
                            onClick={() => setViewMode(viewMode === "table" ? "cards" : "table")}
                            className="flex items-center gap-2 px-3.5 py-2 bg-[#FFFDF9] hover:bg-[#F9F3EA] border border-[#E6DBCB] rounded-xl text-[#5C3D2E] transition-all cursor-pointer font-medium"
                        >
                            {viewMode === "table" ? (
                                <LayoutList className="w-3.5 h-3.5" />
                            ) : (
                                <LayoutGrid className="w-3.5 h-3.5" />
                            )}
                            <span>{viewMode === "table" ? "Table View" : "Cards View"}</span>
                            <ChevronRight className="w-3 h-3 text-[#8C6D58] rotate-90" />
                        </button>

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
                                <Filter className="w-3.5 h-3.5" />
                                <span>Filter</span>
                                {statusFilter !== "all" && (
                                    <span className="bg-white text-[#AD4313] rounded-full w-4 h-4 text-[10px] flex items-center justify-center font-black">1</span>
                                )}
                                <ChevronRight className="w-3 h-3 rotate-90 opacity-60" />
                            </button>

                            {/* Filter Dropdown */}
                            {isFilterOpen && (
                                <div className="absolute left-0 mt-2 w-56 bg-white border border-[#E6DBCB] rounded-xl shadow-xl z-30 p-2 text-xs font-semibold flex flex-col gap-0.5 animate-[fadeSlideDown_0.15s_ease-out]">
                                    <div className="text-[10px] font-black uppercase text-[#8C6D58] px-3 py-1.5 flex items-center gap-1.5">
                                        <Filter className="w-3 h-3" /> Filter by Status
                                    </div>
                                    {[
                                        { id: "all", label: "All Statuses" },
                                        { id: "overdue", label: `⚠️ Overdue (${overdueCount})` },
                                        { id: "pending_review", label: "Pending Review" },
                                        { id: "awaiting_downpayment", label: "Awaiting Downpayment" },
                                        { id: "processing", label: "Processing" },
                                        { id: "ready_for_delivery", label: "Ready for Delivery" },
                                        { id: "completed", label: "Completed / Delivered" },
                                    ].map((opt) => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer ${statusFilter === opt.id ? "bg-[#FDF6E2] text-[#AD4313] font-bold" : "hover:bg-[#FCF8EE] text-[#5C3D2E]"}`}
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
                                <ArrowUpDown className="w-3.5 h-3.5" />
                                <span>Sort</span>
                                <ChevronRight className="w-3 h-3 text-[#8C6D58] rotate-90" />
                            </button>

                            {/* Sort Dropdown */}
                            {isSortOpen && (
                                <div className="absolute left-0 mt-2 w-52 bg-white border border-[#E6DBCB] rounded-xl shadow-xl z-30 p-2 text-xs font-semibold flex flex-col gap-0.5 animate-[fadeSlideDown_0.15s_ease-out]">
                                    <div className="text-[10px] font-black uppercase text-[#8C6D58] px-3 py-1.5 flex items-center gap-1.5">
                                        <ArrowUpDown className="w-3 h-3" /> Sort Orders
                                    </div>
                                    {[
                                        { id: "date_asc", label: "Delivery Date (Earliest)" },
                                        { id: "date_desc", label: "Delivery Date (Latest)" },
                                        { id: "name_asc", label: "Customer Name" },
                                        { id: "id_desc", label: "Order ID (Newest)" },
                                    ].map((opt) => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer ${sortBy === opt.id ? "bg-[#FDF6E2] text-[#AD4313] font-bold" : "hover:bg-[#FCF8EE] text-[#5C3D2E]"}`}
                                            onClick={() => { setSortBy(opt.id); setIsSortOpen(false); }}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Search Input */}
                        <div className="relative min-w-[200px] sm:min-w-[240px]">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search customer, ID, or dish..."
                                className="w-full pl-9 pr-8 py-2 bg-[#FFFDF9] border border-[#E6DBCB] rounded-xl text-xs font-medium text-[#3D251E] placeholder-[#A48B78] focus:outline-none focus:border-[#AD4313] focus:ring-1 focus:ring-[#AD4313]/20 transition-all"
                            />
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A48B78] w-3.5 h-3.5" />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A48B78] hover:text-[#3D251E] transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Show Charts Toggle (Clear Label) */}
                        <label className="flex items-center gap-2 px-3 py-2 bg-[#FFFDF9] hover:bg-[#F9F3EA] border border-[#E6DBCB] rounded-xl cursor-pointer select-none text-xs text-[#5C3D2E]">
                            <BarChart3 className="w-3.5 h-3.5 text-[#AD4313]" />
                            <span className="font-semibold">Show charts</span>
                            <div className="relative inline-block w-8 h-4.5 ml-1">
                                <input
                                    type="checkbox"
                                    checked={showStats}
                                    onChange={() => setShowStats(!showStats)}
                                    className="sr-only peer"
                                />
                                <div className="w-8 h-4.5 bg-[#E6CCA2] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#E6DBCB] after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#AD4313]" />
                            </div>
                        </label>
                    </div>

                    {/* Right Controls */}
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
                            <RotateCcw className="w-3.5 h-3.5" /> Reset
                        </button>

                        <button
                            type="button"
                            onClick={handleExportCSV}
                            className="px-3.5 py-2 bg-[#FFFDF9] hover:bg-[#F9F3EA] border border-[#E6DBCB] rounded-xl text-[#5C3D2E] transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            <Download className="w-3.5 h-3.5" /> Export
                        </button>
                    </div>
                </div>

                {/* ── Stat Metric Cards + Chart Row ── */}
                {showStats && (
                    <div className="flex flex-col gap-5">
                        {/* Metric Cards with meaningful trends & clear next actions */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 transition-all duration-300">
                            <MetricCard
                                title="TOTAL ORDERS"
                                value={data.total_orders ?? 0}
                                trend={data.total_orders_trend}
                                change={data.total_orders_change}
                                previous={data.total_orders_previous}
                                trendPeriod={data.total_orders_trend_period ?? "vs last month"}
                                infoTooltip="Total lifetime orders received."
                                icon={<ShoppingCart className="w-5 h-5" />}
                                actionLabel="View queue →"
                                onAction={() => scrollToQueue("all")}
                            />
                            <MetricCard
                                title="PENDING REVIEW"
                                value={data.pending_review ?? 0}
                                trend={data.pending_review_trend}
                                change={data.pending_review_change}
                                previous={data.pending_review_previous}
                                trendPeriod={data.pending_review_trend_period ?? "vs last week"}
                                infoTooltip="Custom cake requests awaiting admin review."
                                badgeColor="amber"
                                icon={<Hourglass className="w-5 h-5" />}
                                actionLabel="Review now →"
                                onAction={() => scrollToQueue("pending_review")}
                            />
                            <MetricCard
                                title="AWAITING PAYMENT"
                                value={data.awaiting_downpayment ?? 0}
                                trend={data.awaiting_downpayment_trend}
                                change={data.awaiting_downpayment_change}
                                previous={data.awaiting_downpayment_previous}
                                trendPeriod={data.awaiting_downpayment_trend_period ?? "vs last week"}
                                infoTooltip="Orders pending customer downpayment verification."
                                badgeColor="orange"
                                icon={<CreditCard className="w-5 h-5" />}
                                actionLabel="Verify payment →"
                                onAction={() => scrollToQueue("awaiting_downpayment")}
                            />
                            <MetricCard
                                title="COMPLETED"
                                value={data.completed ?? 0}
                                trend={data.completed_trend}
                                change={data.completed_change}
                                previous={data.completed_previous}
                                trendPeriod={data.completed_trend_period ?? "vs last month"}
                                infoTooltip="Orders successfully fulfilled and delivered."
                                badgeColor="green"
                                icon={<CheckCircle2 className="w-5 h-5" />}
                                actionLabel="View completed →"
                                onAction={() => scrollToQueue("completed")}
                            />
                            <MetricCard
                                title="TOTAL REVENUE"
                                value={`₱${Number(data.total_revenue || 0).toLocaleString()}`}
                                trend={data.total_revenue_trend}
                                change={data.total_revenue_change}
                                previous={data.total_revenue_previous}
                                trendPeriod={data.total_revenue_trend_period ?? "vs last month"}
                                infoTooltip="Total gross revenue earned."
                                isHighlight={true}
                                isCurrency={true}
                                icon={<DollarSign className="w-5 h-5" />}
                                actionLabel="View sales →"
                                onAction={() => scrollToQueue("completed")}
                            />
                        </div>

                        {/* Enhanced Horizontal Bar Chart with Value Labels */}
                        <div className="bg-white border border-[#E6DBCB] rounded-2xl p-6 shadow-xs">
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-2">
                                    <BarChart3 className="w-4.5 h-4.5 text-[#AD4313]" />
                                    <h3 className="text-sm font-black text-[#3D251E] tracking-tight">Order Status Breakdown</h3>
                                </div>
                                <span className="text-xs font-semibold text-[#8C6D58]">
                                    Total active orders: <span className="font-bold text-[#3D251E]">{data.total_orders || 0}</span>
                                </span>
                            </div>

                            <div className="h-[240px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        layout="vertical"
                                        data={chartData}
                                        margin={{ top: 10, right: 35, left: 20, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#E6DBCB" horizontal={false} />
                                        <XAxis
                                            type="number"
                                            allowDecimals={false}
                                            tick={{ fontSize: 11, fontWeight: 600, fill: "#8C6D58" }}
                                            axisLine={{ stroke: "#E6DBCB" }}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            type="category"
                                            dataKey="name"
                                            width={140}
                                            tick={{ fontSize: 11, fontWeight: 700, fill: "#5C3D2E" }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <Tooltip content={<CustomChartTooltip />} cursor={{ fill: "#FCF8EE", radius: 8 }} />
                                        <Bar
                                            dataKey="value"
                                            radius={[0, 6, 6, 0]}
                                            barSize={20}
                                            animationDuration={900}
                                            animationEasing="ease-out"
                                        >
                                            <LabelList
                                                dataKey="value"
                                                position="right"
                                                fill="#3D251E"
                                                fontSize={11}
                                                fontWeight={800}
                                            />
                                            {chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Upcoming Deliveries Section (Next 7 Days) ── */}
                <div className="bg-white border border-[#E6DBCB] rounded-2xl p-6 shadow-xs flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-[#FDF0EB] flex items-center justify-center">
                                <CalendarDays className="w-4 h-4 text-[#AD4313]" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-[#3D251E]">Upcoming Deliveries (Next 7 Days)</h2>
                                <p className="text-xs text-[#8C6D58] font-medium">Scheduled for delivery within the coming week.</p>
                            </div>
                        </div>
                        <span className="px-3 py-1 bg-[#FDF0EB] text-[#AD4313] border border-[#F5D5C8] text-xs font-black rounded-full">
                            {data.upcoming_orders?.length || 0} scheduled
                        </span>
                    </div>

                    {!data.upcoming_orders || data.upcoming_orders.length === 0 ? (
                        <div className="p-10 text-center bg-[#FCF8EE] rounded-xl border border-dashed border-[#E6DBCB]">
                            <PartyPopper className="w-10 h-10 text-[#AD4313]/40 mx-auto mb-3" />
                            <p className="text-[#3D251E] font-bold text-sm">All Clear!</p>
                            <p className="text-[#8C6D58] font-medium text-xs mt-1">No urgent deliveries scheduled for the next 7 days.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {data.upcoming_orders.map((order) => {
                                const isOverdue = checkIsOverdue(order.delivery_date, order.status);
                                const statusCfg = getStatusConfig(order.status);
                                const StatusIcon = statusCfg.Icon;

                                return (
                                    <div
                                        key={order.id}
                                        className={`p-4 bg-white border rounded-2xl cursor-pointer transition-all flex flex-col justify-between gap-3 shadow-2xs hover:shadow-md group ${isOverdue ? "border-[#FCA5A5] bg-[#FFF8F8]" : "border-[#E6DBCB] hover:border-[#AD4313]/30"
                                            }`}
                                        onClick={() => navigate(`/admin/orders/${order.id}`)}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="text-[10px] font-black tracking-wider text-[#8C6D58] uppercase flex items-center gap-1">
                                                <Package className="w-3 h-3" /> ORDER #{order.id}
                                            </span>

                                            <div className="flex items-center gap-1.5">
                                                {isOverdue && (
                                                    <span className="px-2 py-0.5 text-[9px] font-black rounded-full bg-[#991B1B] text-white border border-[#991B1B] uppercase tracking-wide animate-pulse">
                                                        OVERDUE
                                                    </span>
                                                )}
                                                <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border uppercase inline-flex items-center gap-1 ${statusCfg.style}`}>
                                                    <StatusIcon className="w-3 h-3" />
                                                    {statusCfg.label}
                                                </span>
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className="font-bold text-[#3D251E] text-base group-hover:text-[#AD4313] transition-colors">
                                                {order.full_name}
                                            </h3>
                                        </div>

                                        <div className="flex items-center justify-between text-xs text-[#8C6D58] font-medium pt-2 border-t border-[#E6DBCB]/40">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="flex items-center gap-1">
                                                    <CalendarDays className="w-3 h-3 text-[#AD4313]" /> {order.delivery_date}
                                                </span>
                                                <span className="flex items-center gap-1 text-[11px] text-[#5C3D2E]">
                                                    <Clock className="w-3 h-3 text-[#8C6D58]" /> {formatTimeSlot(order.delivery_time)}
                                                </span>
                                            </div>
                                            <span className="text-[#AD4313] font-bold text-xs flex items-center gap-1 group-hover:gap-2 transition-all shrink-0">
                                                View <ExternalLink className="w-3 h-3" />
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Scheduled Orders Queue Data Section ── */}
                <div id="order-queue-section" className="bg-white border border-[#E6DBCB] rounded-2xl p-6 shadow-xs flex flex-col gap-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#E6DBCB]/30">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-[#FDF0EB] flex items-center justify-center">
                                <LayoutList className="w-4 h-4 text-[#AD4313]" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-[#3D251E]">All Scheduled Orders (Queue)</h2>
                                <p className="text-xs text-[#8C6D58] font-medium">Manage and track live customer order queue.</p>
                            </div>
                        </div>

                        {statusFilter !== "all" && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-[#8C6D58] font-semibold">Active Filter:</span>
                                <span className="px-3 py-1 bg-[#FDF6E2] text-[#AD4313] border border-[#E6CCA2] rounded-full text-xs font-bold flex items-center gap-1.5">
                                    {statusFilter === "overdue" ? "⚠️ Overdue Orders" : getOrderStatusLabel(statusFilter, true) || statusFilter}
                                    <button type="button" onClick={() => setStatusFilter("all")} className="hover:text-[#3D251E]">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </span>
                            </div>
                        )}
                    </div>

                    {processedQueueOrders.length === 0 ? (
                        <div className="p-12 text-center bg-[#FCF8EE] rounded-xl border border-dashed border-[#E6DBCB]">
                            <Inbox className="w-10 h-10 text-[#AD4313]/30 mx-auto mb-3" />
                            <h3 className="font-bold text-[#3D251E] text-sm">No queue orders match your filter criteria</h3>
                            <p className="text-xs text-[#8C6D58] mt-1">Try resetting search or status filters.</p>
                        </div>
                    ) : viewMode === "table" ? (
                        /* Table View */
                        <div className="overflow-x-auto rounded-xl border border-[#E6DBCB]/60">
                            <table className="w-full text-left border-collapse">
                                {/* Table Header */}
                                <thead className="bg-[#FFFDF9] text-[#8C6D58] text-[11px] font-bold uppercase tracking-wider border-b border-[#E6DBCB]">
                                    <tr>
                                        <th className="p-3.5 cursor-pointer hover:text-[#3D251E] transition-colors" onClick={() => setSortBy(sortBy === "id_desc" ? "date_asc" : "id_desc")}>
                                            <span className="flex items-center gap-1.5">ORDER & CUSTOMER <ArrowUpDown className="w-3 h-3 opacity-50" /></span>
                                        </th>
                                        <th className="p-3.5 cursor-pointer hover:text-[#3D251E] transition-colors" onClick={() => setSortBy(sortBy === "date_asc" ? "date_desc" : "date_asc")}>
                                            <span className="flex items-center gap-1.5">DELIVERY DATE <ArrowUpDown className="w-3 h-3 opacity-50" /></span>
                                        </th>
                                        <th className="p-3.5">
                                            <span className="flex items-center gap-1.5">TIME SLOT</span>
                                        </th>
                                        <th className="p-3.5 cursor-pointer hover:text-[#3D251E] transition-colors">
                                            <span className="flex items-center gap-1.5">STATUS <ArrowUpDown className="w-3 h-3 opacity-50" /></span>
                                        </th>
                                        <th className="p-3.5 text-right">
                                            ACTION
                                        </th>
                                    </tr>
                                </thead>

                                {/* Table Body */}
                                <tbody className="divide-y divide-[#E6DBCB]/40 text-xs font-semibold text-[#3D251E]">
                                    {processedQueueOrders.slice(0, perPage).map((order) => {
                                        const isOverdue = checkIsOverdue(order.delivery_date, order.status);
                                        const statusCfg = getStatusConfig(order.status);
                                        const StatusIcon = statusCfg.Icon;

                                        return (
                                            <tr
                                                key={order.id}
                                                onClick={() => navigate(`/admin/orders/${order.id}`)}
                                                className={`transition-colors cursor-pointer ${isOverdue ? "bg-[#FFF5F5] hover:bg-[#FFEBEB]" : "hover:bg-[#FCF8EE]/70"
                                                    }`}
                                            >
                                                <td className="p-3.5">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-[#3D251E] text-sm flex items-center gap-2">
                                                            {order.full_name || "Customer"}
                                                            {isOverdue && (
                                                                <span className="px-2 py-0.5 bg-[#991B1B] text-white text-[9px] font-black rounded-full uppercase tracking-wider">
                                                                    OVERDUE
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className="text-[11px] text-[#8C6D58] font-normal">
                                                            Order #{order.id}
                                                        </span>
                                                    </div>
                                                </td>

                                                <td className="p-3.5 text-[#5C3D2E]">
                                                    <span className={`flex items-center gap-1.5 ${isOverdue ? "text-[#991B1B] font-bold" : ""}`}>
                                                        <CalendarDays className="w-3.5 h-3.5 text-[#8C6D58]" /> {order.delivery_date || "—"}
                                                    </span>
                                                </td>

                                                <td className="p-3.5 text-[#5C3D2E]">
                                                    <span className="flex items-center gap-1.5 font-medium">
                                                        <Clock className="w-3.5 h-3.5 text-[#8C6D58]" /> {formatTimeSlot(order.delivery_time)}
                                                    </span>
                                                </td>

                                                <td className="p-3.5">
                                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold rounded-full border uppercase ${statusCfg.style}`}>
                                                        <StatusIcon className="w-3 h-3" />
                                                        {statusCfg.label}
                                                    </span>
                                                </td>

                                                <td className="p-3.5 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/admin/orders/${order.id}`);
                                                        }}
                                                        className="px-3.5 py-1.5 bg-white hover:bg-[#FCF8EE] border border-[#E6DBCB] text-[#AD4313] text-xs font-semibold rounded-xl transition-all shadow-2xs hover:shadow-sm flex items-center gap-1.5 ml-auto cursor-pointer"
                                                    >
                                                        Details <ExternalLink className="w-3 h-3" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        /* Cards View */
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {processedQueueOrders.slice(0, perPage).map((order) => {
                                const isOverdue = checkIsOverdue(order.delivery_date, order.status);
                                const statusCfg = getStatusConfig(order.status);
                                const StatusIcon = statusCfg.Icon;

                                return (
                                    <div
                                        key={order.id}
                                        onClick={() => navigate(`/admin/orders/${order.id}`)}
                                        className={`p-4 bg-white border rounded-2xl cursor-pointer transition-all flex flex-col justify-between gap-3 shadow-2xs hover:shadow-md group ${isOverdue ? "border-[#FCA5A5] bg-[#FFF8F8]" : "border-[#E6DBCB] hover:border-[#AD4313]/30"
                                            }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="text-[10px] font-black tracking-wider text-[#8C6D58] uppercase flex items-center gap-1">
                                                <Package className="w-3 h-3" /> ORDER #{order.id}
                                            </span>

                                            <div className="flex items-center gap-1.5">
                                                {isOverdue && (
                                                    <span className="px-2 py-0.5 text-[9px] font-black rounded-full bg-[#991B1B] text-white uppercase tracking-wide">
                                                        OVERDUE
                                                    </span>
                                                )}
                                                <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border uppercase inline-flex items-center gap-1 ${statusCfg.style}`}>
                                                    <StatusIcon className="w-3 h-3" />
                                                    {statusCfg.label}
                                                </span>
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className="font-bold text-[#3D251E] text-base group-hover:text-[#AD4313] transition-colors">
                                                {order.full_name || "Customer"}
                                            </h3>
                                        </div>

                                        <div className="flex items-center justify-between text-xs text-[#8C6D58] font-medium pt-2 border-t border-[#E6DBCB]/40">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="flex items-center gap-1">
                                                    <CalendarDays className="w-3 h-3 text-[#AD4313]" /> {order.delivery_date || "—"}
                                                </span>
                                                <span className="flex items-center gap-1 text-[11px] text-[#5C3D2E]">
                                                    <Clock className="w-3 h-3 text-[#8C6D58]" /> {formatTimeSlot(order.delivery_time)}
                                                </span>
                                            </div>
                                            <span className="text-[#AD4313] font-bold text-xs flex items-center gap-1 group-hover:gap-2 transition-all">
                                                Details <ExternalLink className="w-3 h-3" />
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
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
                                className="bg-[#FFFDF9] border border-[#E6DBCB] rounded-lg px-2.5 py-1.5 font-bold text-xs text-[#3D251E] cursor-pointer focus:outline-none focus:border-[#AD4313]"
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
                                <ChevronLeft className="w-4 h-4" />
                            </button>

                            {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => {
                                if (totalPages > 5 && Math.abs(num - queuePage) > 2 && num !== 1 && num !== totalPages) {
                                    return null;
                                }
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
                                disabled={!data.all_upcoming_has_next || queuePage >= totalPages}
                                onClick={() => setQueuePage((prev) => prev + 1)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-[#E6DBCB] text-[#3D251E] transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-[#FCF8EE]"
                                aria-label="Next Page"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Jump to Page Input */}
                        <form onSubmit={handleJumpPage} className="flex items-center gap-2">
                            <span>Go to page:</span>
                            <input
                                type="number"
                                min="1"
                                max={totalPages}
                                value={jumpPageInput}
                                onChange={(e) => setJumpPageInput(e.target.value)}
                                placeholder="#"
                                className="w-12 px-2 py-1.5 bg-[#FFFDF9] border border-[#E6DBCB] rounded-lg text-xs font-bold text-[#3D251E] text-center focus:outline-none focus:border-[#AD4313]"
                            />
                            <button
                                type="submit"
                                className="px-3 py-1.5 bg-white hover:bg-[#FCF8EE] border border-[#E6DBCB] rounded-lg text-xs font-semibold text-[#3D251E] cursor-pointer flex items-center gap-1"
                            >
                                Go <ChevronRight className="w-3 h-3" />
                            </button>
                        </form>
                    </div>
                </div>

            </div>
        </div>
    );
}

// ── MetricCard Component with meaningful trends and action trigger links ──
function MetricCard({
    title,
    value,
    trend,
    change,
    previous,
    trendPeriod,
    infoTooltip,
    isHighlight,
    isCurrency,
    badgeColor = "green",
    icon,
    actionLabel,
    onAction,
}) {
    // Determine whether to display percentage or raw change
    // If base (previous) is under 10 or zero, hide confusing percentage and show raw change
    const isSmallBase = previous === undefined || previous === null || previous < 10;
    const rawChange = change ?? 0;
    const isNegative = rawChange < 0 || (typeof trend === "string" && trend.startsWith("-"));
    const TrendIconComponent = isNegative ? TrendingDown : TrendingUp;
    const sign = rawChange > 0 ? "+" : "";

    let trendDisplayText = "";
    if (isSmallBase) {
        if (isCurrency) {
            trendDisplayText = `${sign}₱${Math.abs(rawChange).toLocaleString()} ${trendPeriod}`;
        } else {
            trendDisplayText = `${sign}${rawChange} ${trendPeriod}`;
        }
    } else {
        trendDisplayText = `${trend} (${sign}${rawChange}) ${trendPeriod}`;
    }

    return (
        <div
            className={`p-5 rounded-2xl border transition-all shadow-2xs hover:shadow-md flex flex-col justify-between gap-3 group ${isHighlight
                ? "bg-gradient-to-br from-[#AD4313] to-[#8F350E] text-white border-[#AD4313]"
                : "bg-white text-[#3D251E] border-[#E6DBCB] hover:border-[#AD4313]/30"
                }`}
        >
            <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${isHighlight ? "text-white/80" : "text-[#8C6D58]"}`}>
                    {title}
                </span>

                <div className="flex items-center gap-1.5">
                    {infoTooltip && (
                        <span
                            title={infoTooltip}
                            className={`cursor-help opacity-50 hover:opacity-100 transition-opacity ${isHighlight ? "text-white" : "text-[#8C6D58]"}`}
                        >
                            <Info className="w-3.5 h-3.5" />
                        </span>
                    )}
                    {icon && (
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isHighlight ? "bg-white/15" : "bg-[#FDF0EB]"}`}>
                            <span className={isHighlight ? "text-white" : "text-[#AD4313]"}>{icon}</span>
                        </div>
                    )}
                </div>
            </div>

            <div>
                <p className="text-3xl font-black tracking-tight">{value}</p>
            </div>

            <div className="flex flex-col gap-2 pt-1 border-t border-black/5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                    <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] ${isHighlight
                            ? "bg-white/20 text-white"
                            : isNegative
                                ? "bg-[#FEE2E2] text-[#991B1B]"
                                : badgeColor === "amber"
                                    ? "bg-[#FFF7EA] text-[#AD4313]"
                                    : badgeColor === "orange"
                                        ? "bg-[#FFF2E2] text-[#D97706]"
                                        : "bg-[#EDFDF3] text-[#16A34A]"
                            }`}
                    >
                        <TrendIconComponent className="w-3 h-3" />
                        {trendDisplayText}
                    </span>
                </div>

                {onAction && (
                    <button
                        type="button"
                        onClick={onAction}
                        className={`text-left text-xs font-bold transition-all flex items-center gap-1 hover:gap-1.5 cursor-pointer mt-0.5 ${isHighlight ? "text-white/90 hover:text-white" : "text-[#AD4313] hover:text-[#8F350E]"
                            }`}
                    >
                        <span>{actionLabel || "View details →"}</span>
                    </button>
                )}
            </div>
        </div>
    );
}