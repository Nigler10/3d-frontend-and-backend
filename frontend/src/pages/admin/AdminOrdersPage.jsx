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

  // Inspiration Toolbar Controls State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("id_desc");
  const [viewMode, setViewMode] = useState("table");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);

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
  }, []);

  // Filter & Sort Logic
  const filteredOrders = useMemo(() => {
    let list = [...orders];

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
  }, [orders, searchQuery, statusFilter, sortBy]);

  // Pagination Slice
  const totalPages = Math.ceil(filteredOrders.length / perPage) || 1;
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

  const getStatusClass = (status) => {
    switch (status) {
      case "pending_review":
        return "bg-[#FFF7EA] text-[#C05A11] border-[#ECD9B4]";
      case "awaiting_customer_response":
        return "bg-sky-50 text-sky-800 border-sky-200";
      case "awaiting_downpayment":
        return "bg-orange-50 text-orange-800 border-orange-200";
      case "processing":
        return "bg-amber-50 text-amber-800 border-amber-200";
      case "ready_for_delivery":
        return "bg-emerald-50 text-emerald-800 border-emerald-200";
      case "delivered":
      case "completed":
        return "bg-[#E6F4EA] text-[#137333] border-[#A7F3D0]";
      case "rejected":
      case "cancelled":
        return "bg-rose-50 text-rose-800 border-rose-200";
      default:
        return "bg-[#FDF6E2] text-[#6E473B] border-[#E6CCA2]";
    }
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FCF8EE] text-[#6E473B]">
      <div className="w-12 h-12 border-4 border-[#C05A11] border-t-transparent rounded-full animate-spin mb-4" />
      <p className="font-extrabold text-lg animate-pulse tracking-wide">Loading order vault...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FCF8EE] pb-16 text-[#6E473B]">
      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-8 flex flex-col gap-6">

        {/* ── Page Header ── */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#6E473B] tracking-tight">Customer Orders</h1>
            <p className="text-[#A07060] font-medium text-sm mt-0.5">Manage incoming custom requests, status updates, and customer chats.</p>
          </div>
        </header>

        {/* ── Inspiration Control Toolbar ── */}
        <div className="bg-[#FFFDF9] border border-[#E6CCA2] rounded-2xl p-3.5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left Controls: View, Filter, Sort, Search */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs font-bold">
            {/* View Switcher Dropdown */}
            <button
              type="button"
              onClick={() => setViewMode(viewMode === "table" ? "cards" : "table")}
              className="flex items-center gap-2 px-3.5 py-2 bg-[#FDF6E2] hover:bg-[#F8EDD4] border border-[#ECD9B4] rounded-xl text-[#6E473B] transition-all cursor-pointer"
            >
              <span>{viewMode === "table" ? "⊞ Table View" : "☷ Grid View"}</span>
              <span className="text-[10px] text-[#A07060]">▾</span>
            </button>

            {/* Filter Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setIsFilterOpen(!isFilterOpen); setIsSortOpen(false); }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border transition-all cursor-pointer ${statusFilter !== "all"
                    ? "bg-[#C05A11] text-white border-[#C05A11]"
                    : "bg-[#FDF6E2] hover:bg-[#F8EDD4] border-[#ECD9B4] text-[#6E473B]"
                  }`}
              >
                <span>⚡ Filter</span>
                {statusFilter !== "all" && (
                  <span className="bg-white text-[#C05A11] rounded-full w-4 h-4 text-[10px] flex items-center justify-center font-black">1</span>
                )}
                <span className="text-[10px]">▾</span>
              </button>

              {isFilterOpen && (
                <div className="absolute left-0 mt-2 w-56 bg-white border border-[#E6CCA2] rounded-xl shadow-xl z-30 p-2 text-xs font-semibold flex flex-col gap-1">
                  <div className="text-[10px] font-black uppercase text-[#A07060] px-2 py-1">Filter by Status</div>
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
                      className={`w-full text-left px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${statusFilter === opt.id ? "bg-[#FDF6E2] text-[#C05A11] font-bold" : "hover:bg-[#FCF8EE] text-[#6E473B]"}`}
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
                className="flex items-center gap-2 px-3.5 py-2 bg-[#FDF6E2] hover:bg-[#F8EDD4] border border-[#ECD9B4] rounded-xl text-[#6E473B] transition-all cursor-pointer"
              >
                <span>⇅ Sort</span>
                <span className="text-[10px] text-[#A07060]">▾</span>
              </button>

              {isSortOpen && (
                <div className="absolute left-0 mt-2 w-48 bg-white border border-[#E6CCA2] rounded-xl shadow-xl z-30 p-2 text-xs font-semibold flex flex-col gap-1">
                  <div className="text-[10px] font-black uppercase text-[#A07060] px-2 py-1">Sort Orders</div>
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
                      className={`w-full text-left px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${sortBy === opt.id ? "bg-[#FDF6E2] text-[#C05A11] font-bold" : "hover:bg-[#FCF8EE] text-[#6E473B]"}`}
                      onClick={() => { setSortBy(opt.id); setIsSortOpen(false); }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search Input */}
            <div className="relative min-w-[180px] sm:min-w-[220px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Search name, phone, email, #ID..."
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
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setStatusFilter("all");
                setSearchQuery("");
                setSortBy("id_desc");
                setCurrentPage(1);
              }}
              className="px-3.5 py-2 bg-[#FDF6E2] hover:bg-[#F8EDD4] border border-[#ECD9B4] rounded-xl text-[#6E473B] transition-all cursor-pointer"
            >
              Reset
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-[#FDF6E2] hover:bg-[#F8EDD4] border border-[#ECD9B4] rounded-xl text-[#6E473B] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>📥 Export CSV</span>
            </button>
          </div>
        </div>

        {/* ── Table & Queue Section ── */}
        <div className="bg-white rounded-2xl border border-[#E6CCA2] shadow-sm p-6 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#E6CCA2]/30">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-[#6E473B]">All Customer Orders</h2>
              <span className="px-2.5 py-0.5 bg-[#FDF6E2] text-[#C05A11] border border-[#ECD9B4] text-xs font-black rounded-full">
                {filteredOrders.length}
              </span>
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center text-[#A07060]">
              <span className="text-4xl block mb-3">📦</span>
              <h3 className="font-black text-[#6E473B] text-lg">No orders found</h3>
              <p className="text-xs mt-1">Try clearing filters or searching for another term.</p>
            </div>
          ) : viewMode === "table" ? (
            <div className="overflow-x-auto rounded-xl border border-[#E6CCA2]/60">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#FCF8EE] text-[#A07060] uppercase text-[11px] font-black tracking-wider border-b border-[#E6CCA2]">
                  <tr>
                    <th className="p-3.5">Order ID</th>
                    <th className="p-3.5">Customer</th>
                    <th className="p-3.5">Contact &amp; Address</th>
                    <th className="p-3.5">Total Amount</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">Payment</th>
                    <th className="p-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6CCA2]/20 text-xs font-semibold text-[#6E473B]">
                  {paginatedOrders.map((order) => {
                    return (
                      <tr
                        key={order.id}
                        onClick={() => navigate(`/admin/orders/${order.id}`)}
                        className="transition-colors cursor-pointer hover:bg-[#FCF8EE]/70"
                      >
                        <td className="p-3.5 font-black text-[#6E473B]">
                          <div className="flex items-center gap-2">
                            <span>#{order.id}</span>
                            {unreadOrders[order.id] > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-[#C05A11] text-white text-[10px] font-black whitespace-nowrap">
                                {unreadOrders[order.id]} unread
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="p-3.5 text-sm font-bold text-[#6E473B]">
                          {order.user_name}
                        </td>

                        <td className="p-3.5 text-xs text-[#A07060]">
                          <div className="font-medium text-[#6E473B]">
                            {order.formatted_phone || order.phone || "—"}
                          </div>
                          <div className="text-[11px] truncate max-w-[200px]">
                            {order.full_address || `${order.street || ''} ${order.city || ''}` || "—"}
                          </div>
                        </td>

                        <td className="p-3.5 font-black text-[#6E473B] text-sm">
                          ₱{Number(order.total_amount || 0).toLocaleString()}
                        </td>

                        <td className="p-3.5">
                          <span
                            className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 text-[10px] font-black rounded-full border uppercase ${getStatusClass(order.status)}`}
                          >
                            {getOrderStatusLabel(order.status, true)}
                          </span>
                        </td>

                        <td className="p-3.5">
                          <span className="px-2.5 py-1 text-[10px] font-black rounded-full border bg-gray-50 text-gray-700 border-gray-200 uppercase">
                            {order.payment_status}
                          </span>
                        </td>

                        <td className="p-3.5 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/admin/orders/${order.id}`);
                            }}
                            className="px-3.5 py-1.5 bg-[#C05A11] hover:bg-[#A04A0E] text-white text-xs font-bold rounded-lg transition-colors"
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
            /* Grid Cards View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedOrders.map((order) => (
                <div
                  key={order.id}
                  onClick={() => navigate(`/admin/orders/${order.id}`)}
                  className="p-5 bg-[#FFFDF9] hover:bg-[#FCF8EE] border border-[#E6CCA2] rounded-2xl cursor-pointer transition-all shadow-2xs hover:shadow-md flex flex-col justify-between gap-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-black tracking-wider text-[#A07060] uppercase">
                        Order #{order.id}
                      </span>
                      <h3 className="font-bold text-[#6E473B] text-base">{order.user_name}</h3>
                    </div>

                    <span className={`px-2.5 py-0.5 text-[10px] font-black rounded-full border uppercase ${getStatusClass(order.status)}`}>
                      {getOrderStatusLabel(order.status, true)}
                    </span>
                  </div>

                  <div className="text-xs text-[#A07060] space-y-1">
                    <p>📞 {order.formatted_phone || order.phone || "—"}</p>
                    <p className="truncate">📍 {order.full_address || "—"}</p>
                  </div>

                  <div className="pt-3 border-t border-[#E6CCA2]/30 flex items-center justify-between">
                    <span className="text-base font-black text-[#6E473B]">
                      ₱{Number(order.total_amount || 0).toLocaleString()}
                    </span>

                    <button
                      type="button"
                      className="px-3 py-1 bg-[#C05A11] text-white font-bold text-xs rounded-lg hover:bg-[#A04A0E]"
                    >
                      View →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Bottom Pagination Bar ── */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[#E6CCA2]/40 text-xs font-bold text-[#6E473B]">
            {/* Per Page Selector */}
            <div className="flex items-center gap-2">
              <span className="text-[#A07060]">Showing per page:</span>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="bg-[#FDF6E2] border border-[#ECD9B4] rounded-lg px-2.5 py-1 font-bold text-xs text-[#6E473B] cursor-pointer focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Page Numbers */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#FDF6E2] hover:bg-[#F8EDD4] border border-[#ECD9B4] text-[#6E473B] transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                ‹
              </button>

              <div className="px-3.5 py-1 bg-[#C05A11] text-white rounded-lg font-black text-xs">
                Page {currentPage} of {totalPages}
              </div>

              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#FDF6E2] hover:bg-[#F8EDD4] border border-[#ECD9B4] text-[#6E473B] transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                ›
              </button>
            </div>

            {/* Jump to Page */}
            <form onSubmit={handleJumpPage} className="flex items-center gap-2">
              <span className="text-[#A07060]">Go to page:</span>
              <input
                type="number"
                min="1"
                max={totalPages}
                value={jumpPageInput}
                onChange={(e) => setJumpPageInput(e.target.value)}
                placeholder="#"
                className="w-12 px-2 py-1 bg-[#FDF6E2] border border-[#ECD9B4] rounded-lg text-xs font-bold text-[#6E473B] text-center focus:outline-none focus:border-[#C05A11]"
              />
              <button
                type="submit"
                className="px-3 py-1 bg-[#FDF6E2] hover:bg-[#F8EDD4] border border-[#ECD9B4] rounded-lg text-xs font-bold text-[#6E473B] cursor-pointer"
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