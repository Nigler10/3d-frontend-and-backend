// src/pages/ProductList.jsx
import { useEffect, useState, useMemo } from "react";
import ProductCard from "../components/ProductCard";

function ProductList() {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("all");

    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

    useEffect(() => {
        Promise.all([
            fetch(`${BASEURL}/api/products/`).then((res) => {
                if (!res.ok) throw new Error("Failed to fetch products!");
                return res.json();
            }),
            fetch(`${BASEURL}/api/categories/`).then((res) => {
                if (!res.ok) throw new Error("Failed to fetch categories!");
                return res.json();
            }),
        ])
            .then(([productsData, categoriesData]) => {
                setProducts(productsData);
                setCategories(categoriesData);
                setLoading(false);
            })
            .catch((error) => {
                setError(error.message);
                setLoading(false);
            });
    }, [BASEURL]);

    // Filtered products based on search query and selected category
    const filteredProducts = useMemo(() => {
        return products.filter((product) => {
            const matchesSearch = product.name
                .toLowerCase()
                .includes(searchQuery.toLowerCase().trim());
            const matchesCategory =
                selectedCategory === "all" ||
                String(product.category) === String(selectedCategory);
            return matchesSearch && matchesCategory;
        });
    }, [products, searchQuery, selectedCategory]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#fffdf9] flex flex-col items-center justify-center text-center p-6">
                <div className="text-5xl animate-spin mb-4">🎂</div>
                <div className="text-xl font-bold text-[#844414] animate-pulse">
                    Unlocking the bakery vault...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-[#fffdf9] flex flex-col items-center justify-center text-center p-6">
                <div className="text-5xl mb-4">⚠️</div>
                <div className="text-lg font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-2xl px-6 py-4 max-w-md shadow-sm">
                    Error: {error}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#fffdf9] text-stone-800 antialiased">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-12">
                {/* Header Section */}
                <header className="text-center max-w-xl mx-auto mb-14 space-y-1">
                    <h1 className="text-4xl font-black text-[#844414] tracking-tight sm:text-5xl drop-shadow-sm">
                        Our <span className="text-[#d67b27]">Collection</span>
                    </h1>
                    <p className="text-stone-500 font-medium text-base sm:text-lg">
                        Handcrafted sweets, baked fresh daily.
                    </p>
                    <div className="w-16 h-1 bg-[#d67b27] mx-auto rounded-full mt-4" />
                </header>

                {/* Search & Category Filter Bar */}
                <div className="mb-10 space-y-4">
                    {/* Search Input with Attached Button */}
                    <div className="flex items-stretch rounded-xl border-2 border-[#d67b27] bg-white overflow-hidden shadow-sm">
                        <input
                            id="product-search"
                            type="text"
                            placeholder="Search products..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="flex-1 min-w-0 px-5 py-3 text-sm text-stone-700 placeholder-stone-400 font-medium bg-transparent focus:outline-none"
                        />
                        <button
                            id="product-search-btn"
                            aria-label="Search"
                            className="flex items-center justify-center px-5 bg-[#d67b27] hover:bg-[#b56219] transition-colors duration-200"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-5 w-5 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2.5}
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
                                />
                            </svg>
                        </button>
                    </div>

                    {/* Search Result Indicator */}
                    {searchQuery.trim() && (
                        <div className="flex items-center gap-2 text-sm text-stone-500 px-1">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4 text-[#d67b27] flex-shrink-0"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                            >
                                <path d="M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9v1zm3-19C8.1 2 5 5.1 5 9c0 2.4 1.2 4.5 3 5.7V17c0 .5.4 1 1 1h6c.6 0 1-.5 1-1v-2.3c1.8-1.3 3-3.4 3-5.7 0-3.9-3.1-7-7-7z" />
                            </svg>
                            <span>
                                Search result for{" "}
                                <span className="text-[#d67b27] font-semibold italic">
                                    &apos;{searchQuery.trim()}&apos;
                                </span>
                            </span>
                        </div>
                    )}

                    {/* Category Filter Pills */}
                    {categories.length > 0 && (
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                            <button
                                id="filter-all"
                                onClick={() => setSelectedCategory("all")}
                                className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-200 border ${selectedCategory === "all"
                                    ? "bg-[#d67b27] text-white border-[#d67b27] shadow-sm"
                                    : "bg-white text-stone-500 border-[#e8ddd0] hover:border-[#d67b27] hover:text-[#844414]"
                                    }`}
                            >
                                All
                            </button>
                            {categories.map((cat) => (
                                <button
                                    key={cat.id}
                                    id={`filter-${cat.slug}`}
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-200 border ${String(selectedCategory) === String(cat.id)
                                        ? "bg-[#d67b27] text-white border-[#d67b27] shadow-sm"
                                        : "bg-white text-stone-500 border-[#e8ddd0] hover:border-[#d67b27] hover:text-[#844414]"
                                        }`}
                                >
                                    {cat.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Product Section Grid */}
                <div className="w-full">
                    {filteredProducts.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 xl:gap-8">
                            {filteredProducts.map((product) => (
                                <ProductCard key={product.id} product={product} />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center bg-white border border-[#f3e1c6] rounded-3xl shadow-sm max-w-md mx-auto px-8 py-12">
                            <span className="text-6xl block mb-4 animate-bounce">🍰</span>
                            <p className="text-[#844414] font-bold text-xl">
                                {products.length === 0
                                    ? "Our ovens are busy!"
                                    : "No matching treats found!"}
                            </p>
                            <p className="text-stone-400 text-sm mt-2">
                                {products.length === 0
                                    ? "Check back soon for new treats."
                                    : "Try adjusting your search or filter."}
                            </p>
                            {products.length > 0 && (
                                <button
                                    onClick={() => {
                                        setSearchQuery("");
                                        setSelectedCategory("all");
                                    }}
                                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-[#d67b27] hover:text-[#b56219] transition-colors duration-200"
                                >
                                    Clear filters
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ProductList;