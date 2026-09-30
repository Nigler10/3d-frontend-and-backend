// src/components/Navbar.jsx | DO NOT REMOVE THIS
import React, { useState } from "react";
import { jwtDecode } from "jwt-decode";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { clearTokens, getAccessToken } from "../utils/auth";
import { useUnread } from "../context/UnreadContext";
import logoImg from "../assets/images/spc.png";
import BuilderChoiceModal from "./BuilderChoiceModal";
import UploadSampleCakeModal from "./UploadSampleCakeModal";

function Navbar() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [showBuilderModal, setShowBuilderModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const { cartItems, clearCart } = useCart();
    const navigate = useNavigate();
    const location = useLocation();
    const cartCount = cartItems.reduce((total, item) => total + item.quantity, 0);
    const { unreadMessages } = useUnread();
    const isLoggedIn = !!getAccessToken();

    let isAdmin = false;

    if (isLoggedIn) {
        try {
            const token = getAccessToken();
            const decoded = jwtDecode(token);
            isAdmin = decoded.is_staff;
        } catch (err) {
            console.error("Invalid token");
        }
    }

    const hideNavbarRoutes = [
        "/build",
    ];

    if (hideNavbarRoutes.includes(location.pathname)) {
        return null;
    }

    const handleLogout = () => {
        if (!window.confirm("Are you sure you want to log out?")) return;

        clearTokens();
        clearCart();
        setIsMenuOpen(false);
        setIsProfileMenuOpen(false);
        navigate("/login");
    };

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

    return (
        <>
            {/* 1. THE ACTUAL FIXED NAVBAR CONTAINER */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#f3e1c6] shadow-sm text-stone-700 h-20">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between relative">

                    {/* Mobile Burger Button */}
                    <button
                        className="md:hidden flex flex-col justify-center items-center w-8 h-8 space-y-1.5 z-50 relative"
                        onClick={toggleMenu}
                        aria-label="Toggle Menu"
                    >
                        <div className={`w-6 h-0.5 bg-[#844414] transition-all duration-300 ${isMenuOpen ? "transform rotate-45 translate-y-2" : ""}`}></div>
                        <div className={`w-6 h-0.5 bg-[#844414] transition-all duration-300 ${isMenuOpen ? "opacity-0" : ""}`}></div>
                        <div className={`w-6 h-0.5 bg-[#844414] transition-all duration-300 ${isMenuOpen ? "transform -rotate-45 -translate-y-2" : ""}`}></div>
                    </button>

                    {/* Left Group: Links (Responsive Drawer for Mobile) */}
                    <div className={`
                        fixed md:static top-0 left-0 bottom-0 w-64 md:w-auto bg-white md:bg-transparent p-6 md:p-0 
                        shadow-xl md:shadow-none flex flex-col md:flex-row items-start md:items-center space-y-4 md:space-y-0 md:space-x-6
                        transition-transform duration-300 z-40 transform
                        ${isMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
                    `}>
                        <div className="h-12 md:hidden"></div>

                        {!isAdmin ? (
                            <>
                                <Link to="/" className="text-sm font-semibold tracking-wide uppercase text-stone-600 hover:text-[#d67b27] transition-colors" onClick={() => setIsMenuOpen(false)}>Home</Link>
                                <Link to="/products" className="text-sm font-semibold tracking-wide uppercase text-stone-600 hover:text-[#d67b27] transition-colors" onClick={() => setIsMenuOpen(false)}>Menu</Link>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsMenuOpen(false);
                                        setShowBuilderModal(true);
                                    }}
                                    className="text-sm font-semibold tracking-wide uppercase text-stone-600 hover:text-[#d67b27] transition-colors"
                                >
                                    Builder
                                </button>
                            </>
                        ) : (
                            <>
                                <Link to="/admin" className="text-sm font-semibold tracking-wide uppercase text-stone-600 hover:text-[#d67b27] transition-colors" onClick={() => setIsMenuOpen(false)}>Dashboard</Link>
                                <Link
                                    to="/admin/orders"
                                    className="relative text-sm font-semibold tracking-wide uppercase text-stone-600 hover:text-[#d67b27] transition-colors"
                                    onClick={() => setIsMenuOpen(false)}
                                >
                                    Orders

                                    {unreadMessages > 0 && (
                                        <span className="absolute -top-2 -right-5 min-w-5 h-5 px-1 rounded-full bg-[#d67b27] text-white text-[10px] font-black flex items-center justify-center leading-none">
                                            {unreadMessages > 99 ? "99+" : unreadMessages}
                                        </span>
                                    )}
                                </Link>
                                <Link to="/admin/products" className="text-sm font-semibold tracking-wide uppercase text-stone-600 hover:text-[#d67b27] transition-colors" onClick={() => setIsMenuOpen(false)}>Products</Link>
                            </>
                        )}

                        {/* Mobile Side Drawer Actions */}
                        <div className="md:hidden pt-4 border-t border-stone-100 w-full flex flex-col space-y-4">
                            {isLoggedIn ? (
                                <>
                                    {!isAdmin ? (
                                        <>
                                            <Link
                                                to="/profile"
                                                className="text-sm font-semibold tracking-wide uppercase text-stone-600"
                                                onClick={() => setIsMenuOpen(false)}
                                            >
                                                Profile
                                            </Link>

                                            <Link
                                                to="/orders"
                                                className="relative text-sm font-semibold tracking-wide uppercase text-stone-600"
                                                onClick={() => setIsMenuOpen(false)}
                                            >
                                                My Orders

                                                {unreadMessages > 0 && (
                                                    <span className="absolute -top-2 right-0 min-w-5 h-5 px-1 rounded-full bg-[#d67b27] text-white text-[10px] font-black flex items-center justify-center leading-none">
                                                        {unreadMessages > 99 ? "99+" : unreadMessages}
                                                    </span>
                                                )}
                                            </Link>
                                        </>
                                    ) : null}

                                    <button
                                        onClick={handleLogout}
                                        className="text-left text-sm font-semibold tracking-wide uppercase text-rose-600"
                                    >
                                        Logout
                                    </button>
                                </>
                            ) : (
                                <Link to="/login" className="text-sm font-semibold tracking-wide uppercase text-stone-600" onClick={() => setIsMenuOpen(false)}>Login</Link>
                            )}
                        </div>
                    </div>

                    {/* Center Logo Branding */}
                    <div className="absolute left-1/2 transform -translate-x-1/2 flex justify-center items-center pointer-events-auto">
                        <Link to={isAdmin ? "/admin" : "/"} className="block">
                            <img src={logoImg} alt="Smiley Page Corner" className="h-14 w-14 sm:h-16 sm:w-16 object-contain drop-shadow-sm hover:scale-105 transition-transform duration-200" />
                        </Link>
                    </div>

                    {/* Right Actions Block */}
                    <div className="flex items-center space-x-4 z-50">
                        <div className="hidden md:flex items-center space-x-5">
                            {!isLoggedIn ? (
                                <Link to="/login" className="text-sm font-bold text-stone-600 hover:text-[#d67b27] transition-colors">Login</Link>
                            ) : (
                                <div className="relative">
                                    <button
                                        type="button"
                                        aria-expanded={isProfileMenuOpen}
                                        aria-haspopup="menu"
                                        onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                                        className="flex items-center gap-2 text-sm font-bold text-stone-600 hover:text-[#d67b27] transition-colors"
                                    >
                                        Profile
                                        <svg className={`w-4 h-4 transition-transform ${isProfileMenuOpen ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.51a.75.75 0 01-1.08 0l-4.25-4.51a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                        </svg>
                                    </button>

                                    {isProfileMenuOpen && (
                                        <div className="absolute right-0 top-full mt-4 w-64 overflow-hidden rounded-2xl border border-stone-100 bg-white py-2 shadow-xl" role="menu">
                                            {!isAdmin && (
                                                <>
                                                    <Link
                                                        to="/profile"
                                                        role="menuitem"
                                                        onClick={() => setIsProfileMenuOpen(false)}
                                                        className="block px-5 py-3 text-sm font-semibold text-stone-700 hover:bg-[#fff8ef] hover:text-[#d67b27] transition-colors"
                                                    >
                                                        Profile
                                                    </Link>
                                                    <Link
                                                        to="/orders"
                                                        role="menuitem"
                                                        onClick={() => setIsProfileMenuOpen(false)}
                                                        className="relative block px-5 py-3 text-sm font-semibold text-stone-700 hover:bg-[#fff8ef] hover:text-[#d67b27] transition-colors"
                                                    >
                                                        Orders &amp; reordering
                                                        {unreadMessages > 0 && (
                                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 min-w-5 h-5 px-1 rounded-full bg-[#d67b27] text-white text-[10px] font-black flex items-center justify-center leading-none">
                                                                {unreadMessages > 99 ? "99+" : unreadMessages}
                                                            </span>
                                                        )}
                                                    </Link>
                                                    <div className="my-1 border-t border-stone-100" />
                                                </>
                                            )}
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={handleLogout}
                                                className="block w-full px-5 py-3 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                                            >
                                                Logout
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Cart Icon Element */}
                        {!isAdmin && (
                            <Link to="/cart" className="relative p-2 text-[#844414] hover:text-[#d67b27] transition-colors" title="View Cart">
                                <div className="relative">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path>
                                        <line x1="3" y1="6" x2="21" y2="6"></line>
                                        <path d="M16 10a4 4 0 0 1-8 0"></path>
                                    </svg>
                                    {cartCount > 0 && (
                                        <span className="absolute -top-2 -right-2.5 bg-[#d67b27] text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full ring-2 ring-white">
                                            {cartCount}
                                        </span>
                                    )}
                                </div>
                            </Link>
                        )}
                    </div>

                </div>
            </nav>
            <div className="h-20 w-full block clear-both" />
            <BuilderChoiceModal
                isOpen={showBuilderModal}
                onClose={() => setShowBuilderModal(false)}
                onUploadClick={() => setShowUploadModal(true)}
            />

            <UploadSampleCakeModal
                isOpen={showUploadModal}
                onClose={() => setShowUploadModal(false)}
                onSuccess={(orderId) => {
                    setShowUploadModal(false);
                    navigate(`/checkout?upload_order_id=${orderId}`);
                }}
            />
        </>
    );
}

export default Navbar;