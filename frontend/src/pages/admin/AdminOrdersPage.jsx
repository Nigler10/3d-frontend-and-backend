// src/pages/admin/AdminOrdersPage.jsx
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "../../utils/auth";
import { getOrderStatusLabel } from "../../utils/orderStatus";

export default function AdminOrdersPage() {
  const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [unreadOrders, setUnreadOrders] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Control Toolbar State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("id_desc");
  const [viewMode, setViewMode] = useState("table"); // 'table' | 'cards'
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [jumpPageInput, setJumpPageInput] = useState("");

  const fetchUnreadOrders = async () => {
    try {
      const res = await authFetch(`${BASEURL}/api/chat/unread/orders/`);
      if (!res.ok) return;
      const data = await res.json();
      const map = {};
      data.forEach((item) => {
        map[item.order] = item.unread;
      });
      setUnreadOrders(map);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchOrders = async () => {
    try {
      const res = await authFetch(`${BASEURL}/api/orders/admin/orders/`);
      if (!res.ok) throw new Error("Failed to fetch orders");
      const data = await res.json();
      setOrders(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchUnreadOrders();

    // Auto sync every 30 seconds
    const interval = setInterval(() => {
      fetchOrders();
      fetchUnreadOrders();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Total Unread Count across all orders
  const totalUnreadCount = useMemo(() => {
    return Object.values(unreadOrders).reduce((acc, count) => acc + (count || 0), 0);
  }, [unreadOrders]);

  // Filter & Sort Logic
  const filteredOrders = useMemo(() => {
    let list = [...orders];

    // Filter by unread button toggle
    if (onlyUnread) {
      list = list.filter((o) => (unreadOrders[o.id] || 0) > 0);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (o) =>
          (o.user_name && o.user_name.toLowerCase().includes(q)) ||
          String(o.id).includes(q) ||
          (o.customer_email && o.customer_email.toLowerCase().includes(q)) ||
          (o.phone && o.phone.toLowerCase().includes(q)) ||
          (o.status && o.status.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter((o) => o.status === statusFilter);
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === "id_desc") return b.id - a.id;
      if (sortBy === "id_asc") return a.id - b.id;
      if (sortBy === "amount_desc") return (b.total_amount || 0) - (a.total_amount || 0);
      if (sortBy === "amount_asc") return (a.total_amount || 0) - (b.total_amount || 0);
      if (sortBy === "name_asc") return (a.user_name || "").localeCompare(b.user_name || "");
      return 0;
    });

    return list;
  }, [orders, searchQuery, statusFilter, sortBy, onlyUnread, unreadOrders]);

  // Pagination Slice
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / perPage));
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * perPage;
    return filteredOrders.slice(start, start + perPage);
  }, [filteredOrders, currentPage, perPage]);

  // CSV Export
  const handleExportCSV = () => {
    const listToExport = filteredOrders;

    if (listToExport.length === 0) {
      alert("No orders available to export.");
      return;
    }

    const headers = ["Order ID", "Customer", "Contact", "Total Amount", "Status", "Payment Status"];
    const rows = listToExport.map((o) => [
      `#${o.id}`,
      `"${(o.user_name || "").replace(/"/g, '""')}"`,
      `"${(o.formatted_phone || o.phone || "").replace(/"/g, '""')}"`,
      `₱${o.total_amount || 0}`,
      o.status || "",
      o.payment_status || "",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `customer_orders_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleJumpPage = (e) => {
    e.preventDefault();
    const p = parseInt(jumpPageInput, 10);
    if (p >= 1 && p <= totalPages) {
      setCurrentPage(p);
      setJumpPageInput("");
    }
  };

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case "pending_review":
        return "bg-[#FFFBEB] text-[#D97706] border-[#FCD34D]";
      case "awaiting_downpayment":
        return "bg-[#FFF7ED] text-[#AD4313] border-[#F5D5C8]";
      case "processing":
        return "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]";
      case "ready_for_delivery":
      case "delivered":
      case "completed":
        return "bg-[#EDFDF3] text-[#16A34A] border-[#BBF7D0]";
      case "rejected":
      case "cancelled":
        return "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]";
      default:
        return "bg-[#FDF6E2] text-[#5C3D2E] border-[#E6DBCB]";
    }
  };

  const getPaymentBadgeStyle = (status) => {
    const st = (status || "").toLowerCase();
    if (st === "paid") {
      return "bg-[#EDFDF3] text-[#16A34A] border-[#BBF7D0]";
    }
    if (st === "partial" || st === "downpayment_paid") {
      return "bg-[#FFF7ED] text-[#D97706] border-[#FDE68A]";
    }
    if (st === "cancelled" || st === "failed") {
      return "bg-stone-100 text-stone-400 border-stone-200";
    }
    return "bg-stone-100 text-stone-500 border-stone-200";
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FCF8EE] text-[#3D251E]">
      <div className="w-12 h-12 border-4 border-[#AD4313] border-t-transparent rounded-full animate-spin mb-4" />
      <p className="font-extrabold text-lg animate-pulse tracking-wide">Loading order vault...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FCF8EE] pb-16 text-[#3D251E] font-sans antialiased">
      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-8 flex flex-col gap-6">

        {/* ── Header Row ── */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-black text-[#3D251E] tracking-tight">Customer Orders</h1>
              <span className="px-3 py-0.5 rounded-full bg-[#FDF0EB] text-[#AD4313] border border-[#F5D5C8] text-xs font-bold">
                Live Orders
              </span>
            </div>
            <p className="text-[#8C6D58] font-medium text-sm mt-1">
              Manage incoming custom requests, status updates, and customer chats.
            </p>
          </div>

          {/* Unread Chats Button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setOnlyUnread(!onlyUnread);
                setCurrentPage(1);
              }}
              className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${onlyUnread
                  ? "bg-[#AD4313] text-white border-[#AD4313]"
                  : "bg-white hover:bg-[#FCF8EE] border-[#E6DBCB] text-[#3D251E]"
                }`}
            >
              <span>💬 Unread Chats</span>
              {totalUnreadCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-[#AD4313] text-white text-[10px] font-black flex items-center justify-center leading-none border border-white">
                  {totalUnreadCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* ── Inspiration Control Toolbar (Responsive) ── */}
        <div className="bg-[#FFFDF9] border border-[#E6DBCB] rounded-2xl p-3.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Left Controls */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            {/* View Mode Button */}
            <button
              type="button"
              onClick={() => setViewMode(viewMode === "table" ? "cards" : "table")}
              className="flex items-center gap-2 px-3.5 py-2 bg-[#FFFDF9] hover:bg-[#F9F3EA] border border-[#E6DBCB] rounded-xl text-[#5C3D2E] transition-all cursor-pointer font-medium"
            >
              <span className="text-sm">田</span>
              <span>{viewMode === "table" ? "Table View" : "Grid View"}</span>
              <span className="text-[10px] text-[#8C6D58]">▾</span>
            </button>

            {/* Filter Dropdown */}
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

              {isFilterOpen && (
                <div className="absolute left-0 mt-2 w-56 bg-white border border-[#E6DBCB] rounded-xl shadow-xl z-30 p-2 text-xs font-semibold flex flex-col gap-1">
                  <div className="text-[10px] font-black uppercase text-[#8C6D58] px-2 py-1">Filter by Status</div>
                  {[
                    { id: "all", label: "All Statuses" },
                    { id: "pending_review", label: "Pending Review" },
                    { id: "awaiting_downpayment", label: "Awaiting Downpayment" },
                    { id: "processing", label: "Processing" },
                    { id: "ready_for_delivery", label: "Ready for Delivery" },
                    { id: "completed", label: "Completed" },
                    { id: "cancelled", label: "Cancelled / Rejected" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`w-full text-left px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${statusFilter === opt.id ? "bg-[#FDF6E2] text-[#AD4313] font-bold" : "hover:bg-[#FCF8EE] text-[#5C3D2E]"}`}
                      onClick={() => { setStatusFilter(opt.id); setIsFilterOpen(false); setCurrentPage(1); }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setIsSortOpen(!isSortOpen); setIsFilterOpen(false); }}
                className="flex items-center gap-2 px-3.5 py-2 bg-[#FFFDF9] hover:bg-[#F9F3EA] border border-[#E6DBCB] rounded-xl text-[#5C3D2E] transition-all cursor-pointer font-medium"
              >
                <span>⇅ Sort</span>
                <span className="text-[10px] text-[#8C6D58]">▾</span>
              </button>

              {isSortOpen && (
                <div className="absolute left-0 mt-2 w-48 bg-white border border-[#E6DBCB] rounded-xl shadow-xl z-30 p-2 text-xs font-semibold flex flex-col gap-1">
                  <div className="text-[10px] font-black uppercase text-[#8C6D58] px-2 py-1">Sort Orders</div>
                  {[
                    { id: "id_desc", label: "Order ID (Newest)" },
                    { id: "id_asc", label: "Order ID (Oldest)" },
                    { id: "amount_desc", label: "Amount (High to Low)" },
                    { id: "amount_asc", label: "Amount (Low to High)" },
                    { id: "name_asc", label: "Customer Name" },
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
            <div className="relative min-w-[200px] sm:min-w-[260px] flex-1 sm:flex-initial">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Search name, phone, email, #ID..."
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
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2 text-xs font-semibold justify-end">
            <button
              type="button"
              onClick={() => {
                setStatusFilter("all");
                setSearchQuery("");
                setSortBy("id_desc");
                setOnlyUnread(false);
                setCurrentPage(1);
              }}
              className="px-4 py-2 bg-[#FFFDF9] hover:bg-[#F9F3EA] border border-[#E6DBCB] rounded-xl text-[#5C3D2E] transition-all cursor-pointer"
            >
              Reset
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="px-4 py-2 bg-[#FFFDF9] hover:bg-[#F9F3EA] border border-[#E6DBCB] rounded-xl text-[#5C3D2E] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>⤓</span> Export CSV
            </button>
          </div>
        </div>

        {/* ── Main Orders Card Container ── */}
        <div className="bg-white rounded-2xl border border-[#E6DBCB] shadow-xs p-4 sm:p-6 flex flex-col gap-5">

          {/* Section Sub-header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#E6DBCB]/30">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-[#3D251E]">All Customer Orders</h2>
              <span className="px-2.5 py-0.5 bg-[#FDF0EB] text-[#AD4313] rounded-full text-xs font-bold">
                {filteredOrders.length}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-[#8C6D58] font-medium">
              <span>Auto-syncing every 30s</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center text-[#8C6D58]">
              <span className="text-4xl block mb-3">📦</span>
              <h3 className="font-bold text-[#3D251E] text-lg">No orders found</h3>
              <p className="text-xs mt-1">Try resetting search filters or unread toggle.</p>
            </div>
          ) : viewMode === "table" ? (
            /* Desktop / Scrollable Table View */
            <div className="overflow-x-auto rounded-xl border border-[#E6DBCB]/60">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead className="bg-[#FFFDF9] text-[#8C6D58] uppercase text-[11px] font-bold tracking-wider border-b border-[#E6DBCB]">
                  <tr>
                    <th className="p-3.5">ORDER ID</th>
                    <th className="p-3.5">CUSTOMER</th>
                    <th className="p-3.5">CONTACT &amp; ADDRESS</th>
                    <th className="p-3.5">TOTAL AMOUNT</th>
                    <th className="p-3.5 text-center">STATUS</th>
                    <th className="p-3.5 text-center">PAYMENT</th>
                    <th className="p-3.5 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6DBCB]/40 text-xs font-semibold text-[#3D251E]">
                  {paginatedOrders.map((order) => {
                    const hasUnread = (unreadOrders[order.id] || 0) > 0;
                    return (
                      <tr
                        key={order.id}
                        onClick={() => navigate(`/admin/orders/${order.id}`)}
                        className="transition-colors cursor-pointer hover:bg-[#FCF8EE]/70"
                      >
                        {/* ORDER ID */}
                        <td className="p-3.5 font-bold text-[#3D251E]">
                          <div className="flex items-center gap-2">
                            <span>#{order.id}</span>
                            {hasUnread && (
                              <span className="px-2 py-0.5 rounded-full bg-[#AD4313] text-white text-[10px] font-bold whitespace-nowrap">
                                {unreadOrders[order.id]} unread
                              </span>
                            )}
                          </div>
                        </td>

                        {/* CUSTOMER */}
                        <td className="p-3.5 font-bold text-[#3D251E] text-sm">
                          {order.user_name || "—"}
                        </td>

                        {/* CONTACT & ADDRESS */}
                        <td className="p-3.5">
                          <div className="font-bold text-[#3D251E]">
                            {order.formatted_phone || order.phone || "—"}
                          </div>
                          <div className="text-[11px] text-[#8C6D58] font-normal truncate max-w-[240px]">
                            {order.full_address || `${order.street || ''} ${order.city || ''}` || "—"}
                          </div>
                        </td>

                        {/* TOTAL AMOUNT */}
                        <td className="p-3.5 font-black text-[#3D251E] text-sm whitespace-nowrap">
                          ₱{Number(order.total_amount || 0).toLocaleString()}
                        </td>

                        {/* STATUS */}
                        <td className="p-3.5 text-center">
                          <span
                            className={`inline-block whitespace-nowrap px-3 py-1 text-[10px] font-bold rounded-full border uppercase ${getStatusBadgeStyle(order.status)}`}
                          >
                            {getOrderStatusLabel(order.status, true)}
                          </span>
                        </td>

                        {/* PAYMENT */}
                        <td className="p-3.5 text-center">
                          <span
                            className={`inline-block whitespace-nowrap px-3 py-1 text-[10px] font-bold rounded-full border uppercase ${getPaymentBadgeStyle(order.payment_status)}`}
                          >
                            {(order.payment_status || "PENDING").replace(/_/g, " ")}
                          </span>
                        </td>

                        {/* ACTION */}
                        <td className="p-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/admin/orders/${order.id}`);
                            }}
                            className="px-4 py-2 bg-[#AD4313] hover:bg-[#8F350E] text-white text-xs font-bold rounded-xl transition-all shadow-2xs"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Responsive Grid Cards View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedOrders.map((order) => {
                const hasUnread = (unreadOrders[order.id] || 0) > 0;
                return (
                  <div
                    key={order.id}
                    onClick={() => navigate(`/admin/orders/${order.id}`)}
                    className="p-5 bg-white border border-[#E6DBCB] rounded-2xl cursor-pointer transition-all shadow-2xs hover:shadow-md flex flex-col justify-between gap-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black tracking-wider text-[#8C6D58] uppercase">
                            ORDER #{order.id}
                          </span>
                          {hasUnread && (
                            <span className="px-2 py-0.5 rounded-full bg-[#AD4313] text-white text-[9px] font-bold">
                              {unreadOrders[order.id]} unread
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-[#3D251E] text-base mt-0.5">{order.user_name}</h3>
                      </div>

                      <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border uppercase ${getStatusBadgeStyle(order.status)}`}>
                        {getOrderStatusLabel(order.status, true)}
                      </span>
                    </div>

                    <div className="text-xs text-[#8C6D58] space-y-1">
                      <p className="font-semibold text-[#3D251E]">📞 {order.formatted_phone || order.phone || "—"}</p>
                      <p className="truncate">📍 {order.full_address || "—"}</p>
                    </div>

                    <div className="pt-3 border-t border-[#E6DBCB]/40 flex items-center justify-between">
                      <div>
                        <span className="text-xs text-[#8C6D58] block">Total Amount</span>
                        <span className="text-base font-black text-[#3D251E]">
                          ₱{Number(order.total_amount || 0).toLocaleString()}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="px-4 py-2 bg-[#AD4313] hover:bg-[#8F350E] text-white font-bold text-xs rounded-xl shadow-2xs"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Bottom Responsive Pagination Bar ── */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[#E6DBCB]/40 text-xs font-medium text-[#8C6D58]">
            {/* Per Page Selector */}
            <div className="flex items-center gap-2">
              <span>Showing per page:</span>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="bg-[#FFFDF9] border border-[#E6DBCB] rounded-lg px-2.5 py-1 font-bold text-xs text-[#3D251E] cursor-pointer focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Page Pill Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-[#E6DBCB] text-[#3D251E] transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-[#FCF8EE]"
                aria-label="Previous Page"
              >
                ‹
              </button>

              <div className="px-4 py-1 bg-[#AD4313] text-white rounded-full font-bold text-xs shadow-2xs">
                Page {currentPage} of {totalPages}
              </div>

              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-[#E6DBCB] text-[#3D251E] transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-[#FCF8EE]"
                aria-label="Next Page"
              >
                ›
              </button>
            </div>

            {/* Jump to Page */}
            <form onSubmit={handleJumpPage} className="flex items-center gap-2">
              <span>Go to page:</span>
              <input
                type="number"
                min="1"
                max={totalPages}
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