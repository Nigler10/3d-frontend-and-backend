// src/pages/LandingPage.jsx | DO NOT REMOVE THIS
import React, { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import AOS from 'aos';
import 'aos/dist/aos.css';
import Navbar from '../components/Navbar';
import { getAccessToken } from '../utils/auth';
import { getMediaUrl } from '../utils/media';
import { useCart } from '../context/CartContext';
import { jwtDecode } from 'jwt-decode';
import { FaFacebook, FaInstagram, FaTiktok } from 'react-icons/fa';
import { Cake, MapPin, Phone, Mail } from 'lucide-react';

const LandingPage = () => {
    const navigate = useNavigate();
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const { addToCart } = useCart();
    const [cakeItems, setCakeItems] = useState([]);
    const [menuLoading, setMenuLoading] = useState(true);
    const [menuError, setMenuError] = useState('');
    const [addingProductId, setAddingProductId] = useState(null);
    const [addedProductId, setAddedProductId] = useState(null);
    const [failedProductId, setFailedProductId] = useState(null);

    const token = getAccessToken();
    let isAdmin = false;
    if (token) {
        try {
            const decoded = jwtDecode(token);
            isAdmin = !!decoded?.is_staff;
        } catch (err) {
            console.error(err);
        }
    }

    useEffect(() => {
        if (!isAdmin) {
            AOS.init({ duration: 1000, once: true, offset: 100 });
        }
    }, [isAdmin]);

    useEffect(() => {
        const controller = new AbortController();

        fetch(`${BASEURL}/api/best-selling-products/`, { signal: controller.signal })
            .then((response) => {
                if (!response.ok) throw new Error('Unable to load the menu.');
                return response.json();
            })
            .then((products) => {
                setCakeItems(products);
                setMenuError('');
                setMenuLoading(false);
                AOS.refreshHard();
            })
            .catch((error) => {
                if (error.name === 'AbortError') return;
                setMenuError(error.message);
                setMenuLoading(false);
            });

        return () => controller.abort();
    }, [BASEURL]);

    if (isAdmin) {
        return <Navigate to="/admin" replace />;
    }

    const handleAddToBag = async (productId) => {
        if (!getAccessToken()) {
            navigate('/login');
            return;
        }

        setAddingProductId(productId);
        setFailedProductId(null);
        const result = await addToCart(productId);
        setAddingProductId(null);

        if (result?.success) {
            setAddedProductId(productId);
            window.setTimeout(() => setAddedProductId(null), 1800);
        } else {
            setFailedProductId(productId);
            window.setTimeout(() => setFailedProductId(null), 2500);
        }
    };

    return (
        <div className="min-h-screen bg-[#FCF8EE] flex flex-col antialiased font-sans">
            <Navbar />
            {/* Hero Section */}
            <section className="relative w-full h-[85vh] min-h-[500px] overflow-hidden flex items-center justify-center">
                <video autoPlay loop muted playsInline className="absolute top-1/2 left-1/2 min-w-full min-h-full -translate-x-1/2 -translate-y-1/2 object-cover z-0">
                    <source src="https://res.cloudinary.com/dybbeqxrm/video/upload/q_auto/f_auto/v1776255867/hero-cake-video1_kkddin.mp4" type="video/mp4" />
                </video>
                <div className="absolute inset-0 bg-black/40 z-10"></div>

                <div className="relative max-w-7xl w-full mx-auto px-4 md:px-6 lg:px-8 z-20 text-center text-white">
                    <div data-aos="fade-up" className="max-w-2xl mx-auto flex flex-col items-center">
                        <span className="inline-block px-3.5 py-1.5 rounded-full bg-white/20 backdrop-blur text-xs font-bold tracking-wider uppercase mb-4 shadow-sm border border-white/10 flex items-center gap-1.5">
                            <Cake className="w-4 h-4 text-[#FFA45B]" /> Handmade in Cavite
                        </span>
                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-tight mb-4 filter drop-shadow">
                            Sweetest <span className="text-[#FFA45B]">Smiles</span> In Every Box
                        </h1>
                        <p className="text-base md:text-lg text-white/90 font-medium mb-8 max-w-xl leading-relaxed">
                            Artisanal bento cakes handcrafted daily with love. Experience the fun of designing your dream bento in 3D!
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-4">
                            <button
                                className="px-6 py-3 bg-[#C05A11] hover:bg-[#A84E0E] text-white text-sm font-bold rounded-xl shadow-md shadow-[#C05A11]/30 transition-all active:scale-[0.98] cursor-pointer"
                                onClick={() => navigate('/build')}
                            >
                                Customize 3D
                            </button>
                            <button
                                className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-xl shadow-sm border border-white/20 backdrop-blur transition-all active:scale-[0.98] cursor-pointer"
                                onClick={() => navigate('/products')}
                            >
                                View Menu
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Menu Section */}
            <section className="bg-white py-16 md:py-24 border-b border-[#E6CCA2]/40">
                <div className="max-w-7xl w-full mx-auto px-4 md:px-6 lg:px-8">
                    <div className="text-center mb-12" data-aos="fade-up">
                        <span className="text-xs font-semibold tracking-wider text-[#A05A2C] uppercase px-3 py-1 bg-[#FDF6E2] border border-[#ECD9B4] rounded-full">Menu</span>
                        <h2 className="text-3xl font-black text-[#6E473B] mt-3">Exclusive Cakes</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
                        {menuLoading && <p className="md:col-span-3 text-center text-[#A07060]">Loading menu...</p>}
                        {!menuLoading && menuError && <p role="alert" className="md:col-span-3 text-center text-rose-600">{menuError}</p>}
                        {!menuLoading && !menuError && cakeItems.length === 0 && <p className="md:col-span-3 text-center text-[#A07060]">No cakes are available right now.</p>}
                        {!menuLoading && !menuError && cakeItems.map((cake, i) => (
                            <div key={cake.id} className="bg-white border border-[#E6CCA2] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all group flex flex-col" data-aos="zoom-in" data-aos-delay={i * 100}>
                                <div className="aspect-square w-full overflow-hidden bg-[#FCF8EE] relative">
                                    {cake.image ? (
                                        <img src={getMediaUrl(cake.image, BASEURL)} alt={cake.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-sm text-[#A07060]">Image unavailable</div>
                                    )}
                                </div>
                                <div className="p-5 flex flex-col gap-4 flex-1 justify-between">
                                    <div className="flex items-start justify-between gap-2">
                                        <h4 className="font-bold text-lg text-[#6E473B] leading-snug">{cake.name}</h4>
                                        <span className="font-black text-[#C05A11] text-lg shrink-0">{Number(cake.price).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}</span>
                                    </div>
                                    <div className="relative w-full mt-auto">
                                        <button
                                            onClick={() => handleAddToBag(cake.id)}
                                            disabled={addingProductId === cake.id}
                                            className="w-full rounded-full border border-[#C05A11] bg-[#D9781F] px-4 py-3 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#C05A11] active:scale-[0.98] disabled:cursor-wait disabled:opacity-70 cursor-pointer"
                                        >
                                            {addingProductId === cake.id ? 'Adding...' : addedProductId === cake.id ? 'Added to Bag' : failedProductId === cake.id ? "Couldn't Add. Try Again" : 'Add to Bag'}
                                        </button>
                                        {addedProductId === cake.id && (
                                            <div
                                                role="status"
                                                aria-live="polite"
                                                className="absolute right-0 top-1/2 z-50 flex -translate-y-1/2 items-center gap-2 rounded-xl bg-[#2E7D32] px-5 py-3.5 text-sm font-semibold text-white shadow-xl">
                                                
                                                <span aria-hidden="true" className="text-2xl">✓</span>
                                                <span className="text-center">Added to<br />cart!</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Process / Steps Section */}
            <section className="bg-[#FCF8EE] py-16 md:py-24 border-b border-[#E6CCA2]/40">
                <div className="max-w-7xl w-full mx-auto px-4 md:px-6 lg:px-8">
                    <div className="text-center mb-12" data-aos="fade-up">
                        <span className="text-xs font-semibold tracking-wider text-[#A05A2C] uppercase px-3 py-1 bg-white border border-[#E6CCA2] rounded-full">Process</span>
                        <h2 className="text-3xl font-black text-[#6E473B] mt-3">Experience the Magic</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="bg-white border border-[#E6CCA2] p-6 rounded-2xl shadow-sm text-center flex flex-col items-center gap-3" data-aos="fade-up">
                            <div className="w-12 h-12 rounded-xl bg-[#C05A11]/10 flex items-center justify-center"><span className="text-[#C05A11] font-black text-sm">01</span></div>
                            <h4 className="font-bold text-[#6E473B] text-lg">Design in 3D</h4>
                            <p className="text-sm text-[#A07060] leading-relaxed">Pick your colors and flavors in our interactive builder.</p>
                        </div>
                        <div className="bg-white border border-[#E6CCA2] p-6 rounded-2xl shadow-sm text-center flex flex-col items-center gap-3" data-aos="fade-up" data-aos-delay="200">
                            <div className="w-12 h-12 rounded-xl bg-[#C05A11]/10 flex items-center justify-center"><span className="text-[#C05A11] font-black text-sm">02</span></div>
                            <h4 className="font-bold text-[#6E473B] text-lg">Handcrafted</h4>
                            <p className="text-sm text-[#A07060] leading-relaxed">Our bakers in Cavite bake your unique design fresh.</p>
                        </div>
                        <div className="bg-white border border-[#E6CCA2] p-6 rounded-2xl shadow-sm text-center flex flex-col items-center gap-3" data-aos="fade-up" data-aos-delay="400">
                            <div className="w-12 h-12 rounded-xl bg-[#C05A11]/10 flex items-center justify-center"><span className="text-[#C05A11] font-black text-sm">03</span></div>
                            <h4 className="font-bold text-[#6E473B] text-lg">Fresh Delivery</h4>
                            <p className="text-sm text-[#A07060] leading-relaxed">Delivered straight to your door, ready for smiles!</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Testimonials Section */}
            <section className="bg-white py-16 md:py-24 border-b border-[#E6CCA2]/40">
                <div className="max-w-7xl w-full mx-auto px-4 md:px-6 lg:px-8">
                    <div className="text-center mb-12" data-aos="fade-up">
                        <span className="text-xs font-semibold tracking-wider text-[#A05A2C] uppercase px-3 py-1 bg-[#FDF6E2] border border-[#ECD9B4] rounded-full">Testimonials</span>
                        <h2 className="text-3xl font-black text-[#6E473B] mt-3">What our customers say</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                        <div className="bg-[#FFFDF9] border border-[#E6CCA2] p-6 rounded-2xl shadow-sm flex flex-col gap-4" data-aos="fade-up">
                            <div className="flex items-center gap-3">
                                <img
                                    src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=150"
                                    alt="Maria"
                                    className="w-12 h-12 rounded-full object-cover border-2 border-[#E6CCA2]"
                                />
                                <div className="flex flex-col">
                                    <h4 className="font-bold text-[#6E473B] text-sm">Maria K.</h4>
                                    <span className="text-[10px] uppercase tracking-wider text-[#C05A11] font-bold">Verified Baker</span>
                                </div>
                            </div>
                            <p className="text-sm italic text-[#6E473B] leading-relaxed">"The 3D builder is so fun! I designed a cake for my daughter's birthday exactly how it looked on screen. The Ube flavor is to die for!"</p>
                        </div>

                        <div className="bg-[#FFFDF9] border border-[#E6CCA2] p-6 rounded-2xl shadow-sm flex flex-col gap-4" data-aos="fade-up" data-aos-delay="200">
                            <div className="flex items-center gap-3">
                                <img
                                    src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=150"
                                    alt="Jason"
                                    className="w-12 h-12 rounded-full object-cover border-2 border-[#E6CCA2]"
                                />
                                <div className="flex flex-col">
                                    <h4 className="font-bold text-[#6E473B] text-sm">Jason D.</h4>
                                    <span className="text-[10px] uppercase tracking-wider text-[#C05A11] font-bold">Sweet Tooth</span>
                                </div>
                            </div>
                            <p className="text-sm italic text-[#6E473B] leading-relaxed">"Best bento cakes in Cavite. I love that it's not overly sweet. The Mango Graham is my absolute favorite for weekend treats."</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="bg-[#FCF8EE] py-16 md:py-24 border-b border-[#E6CCA2]">
                <div className="max-w-4xl w-full mx-auto px-4 md:px-6">
                    <div className="text-center mb-12" data-aos="fade-up">
                        <span className="text-xs font-semibold tracking-wider text-[#A05A2C] uppercase px-3 py-1 bg-white border border-[#E6CCA2] rounded-full">FAQ</span>
                        <h2 className="text-3xl font-black text-[#6E473B] mt-3">Common Inquiries</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white border border-[#E6CCA2] p-5 rounded-xl shadow-sm flex flex-col gap-2" data-aos="fade-right">
                            <h4 className="font-bold text-[#C05A11] text-base">How long does delivery take?</h4>
                            <p className="text-sm text-[#A07060] leading-relaxed">We usually deliver within 24-48 hours within Cavite.</p>
                        </div>
                        <div className="bg-white border border-[#E6CCA2] p-5 rounded-xl shadow-sm flex flex-col gap-2" data-aos="fade-left">
                            <h4 className="font-bold text-[#C05A11] text-base">Can I customize colors?</h4>
                            <p className="text-sm text-[#A07060] leading-relaxed">Yes! Our 3D builder allows full color customization.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer Section */}
            <footer className="bg-[#6E473B] text-[#FFF4E0] pt-16 pb-8">
                <div className="max-w-7xl w-full mx-auto px-4 md:px-6 lg:px-8 flex flex-col gap-12">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                        <div className="flex flex-col gap-4">
                            <div className="font-black tracking-wider text-white text-lg flex items-center gap-1.5">
                                <Cake className="w-5 h-5 text-[#FFA45B]" /> SMILEY PAGE <span className="text-[#FFA45B]">CORNER</span>
                            </div>
                            <p className="text-xs text-[#E6CCA2] leading-relaxed">
                                Your favorite artisan bento cake shop in Cavite. We specialize in making your celebrations extra sweet with 3D-customized designs and premium local flavors.
                            </p>
                            <div className="flex items-center gap-3 text-xs font-bold text-white/80 mt-2">
                                <a href="https://www.facebook.com/profile.php?id=100076422399215" target="_blank" rel="noopener noreferrer">
                                    <FaFacebook />
                                </a>
                                <a href="https://www.instagram.com/smileypagecorner/" target="_blank" rel="noopener noreferrer">
                                    <FaInstagram />
                                </a>
                                <a href="https://www.tiktok.com/@smileypagecorner" target="_blank" rel="noopener noreferrer">
                                    <FaTiktok />
                                </a>
                            </div>
                        </div>

                        <div className="flex flex-col gap-4">
                            <h4 className="font-bold text-white text-sm tracking-wider uppercase">Shop Info</h4>
                            <ul className="flex flex-col gap-2.5 text-xs text-[#E6CCA2]">
                                <li onClick={() => navigate('/products')} className="hover:text-white cursor-pointer transition-colors">Our Menu</li>
                                <li onClick={() => navigate('/build')} className="hover:text-white cursor-pointer transition-colors">3D Cake Builder</li>

                                <li onClick={() => navigate('/orders')} className="hover:text-white cursor-pointer transition-colors">Track Order</li>
                            </ul>
                        </div>

                        <div className="flex flex-col gap-4">
                            <h4 className="font-bold text-white text-sm tracking-wider uppercase">Visit Us</h4>
                            <div className="flex flex-col gap-2 text-xs text-[#E6CCA2]">
                                <p className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-[#ffffff]" /> Bacoor, Cavite, Philippines</p>
                                <p className="flex items-center gap-1.5"><Phone className="w-4 h-4 text-[#ffffff]" /> +63 912 345 6789</p>
                                <p className="flex items-center gap-1.5"><Mail className="w-4 h-4 text-[#ffffff]" /> hello@smileypage.com</p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-4">
                            <h4 className="font-bold text-white text-sm tracking-wider uppercase">Sweet Updates</h4>
                            <p className="text-xs text-[#E6CCA2] leading-relaxed">
                                Get notified about our monthly special flavors and promos!
                            </p>
                            <form className="flex w-full overflow-hidden rounded-xl border border-[#E6CCA2]/20 bg-white/5 p-1">
                                <input
                                    type="email"
                                    placeholder="Your email..."
                                    className="flex-1 px-3 py-2 bg-transparent text-xs text-white placeholder-[#CBB294] outline-none border-none"
                                />
                                <button type="submit" className="px-4 bg-[#C05A11] hover:bg-[#A84E0E] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer">→</button>
                            </form>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#E6CCA2]">
                        <p>© 2026 Smiley Page Corner. All rights reserved.</p>
                        <div className="flex items-center gap-4">
                            <span className="hover:text-white cursor-pointer transition-colors">Privacy Policy</span>
                            <span className="hover:text-white cursor-pointer transition-colors">Terms of Service</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;