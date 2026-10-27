// src/pages/ProductList.jsx
import { useEffect, useState, useMemo } from "react";
import ProductCard from "../components/ProductCard";

const PRODUCTS_PER_PAGE = 9;

function ProductList() {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [sortBy, setSortBy] = useState("name_asc");
    const [currentPage, setCurrentPage] = useState(1);

    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

    useEffect(() => {
        let cancelled = false;

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
                if (cancelled) return;

                setProducts(productsData);
                setCategories(categoriesData);
                setLoading(false);
            })
            .catch((err) => {
                if (cancelled) return;

                setError(err.message);
                setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [BASEURL]);

    // Filter first, then sort. Pagination happens after both.
    const filteredAndSortedProducts = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();

        const filtered = products.filter((product) => {
            const matchesSearch = (product.name || "")
                .toLowerCase()
                .includes(query);

            const matchesCategory =
                selectedCategory === "all" ||
                String(product.category) === String(selectedCategory);

            return matchesSearch && matchesCategory;
        });

        const sorted = [...filtered];

        switch (sortBy) {
            case "name_desc":
                sorted.sort((a, b) =>
                    (b.name || "").localeCompare(a.name || "")
                );
                break;

            case "rating_desc":
                sorted.sort((a, b) =>
                    Number(b.average_rating || 0) -
                    Number(a.average_rating || 0)
                );
                break;

            case "price_asc":
                sorted.sort((a, b) =>
                    Number(a.price || 0) - Number(b.price || 0)
                );
                break;

            case "price_desc":
                sorted.sort((a, b) =>
                    Number(b.price || 0) - Number(a.price || 0)
                );
                break;

            case "reviews_desc":
                sorted.sort((a, b) =>
                    Number(b.review_count || 0) -
                    Number(a.review_count || 0)
                );
                break;

            case "name_asc":
            default:
                sorted.sort((a, b) =>
                    (a.name || "").localeCompare(b.name || "")
                );
                break;
        }

        return sorted;
    }, [products, searchQuery, selectedCategory, sortBy]);

    // Keep the selected page valid when the results change.
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, selectedCategory, sortBy]);

    const totalPages = Math.ceil(
        filteredAndSortedProducts.length / PRODUCTS_PER_PAGE
    );

    const startIndex = (currentPage - 1) * PRODUCTS_PER_PAGE;

    const paginatedProducts = filteredAndSortedProducts.slice(
        startIndex,
        startIndex + PRODUCTS_PER_PAGE
    );

    const goToPage = (page) => {
        if (page < 1 || page > totalPages) return;
        setCurrentPage(page);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const clearFilters = () => {
        setSearchQuery("");
        setSelectedCategory("all");
        setSortBy("name_asc");
        setCurrentPage(1);
    };

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
                {/* Header */}
                <header className="text-center max-w-xl mx-auto mb-14 space-y-1">
                    <h1 className="text-4xl font-black text-[#844414] tracking-tight sm:text-5xl drop-shadow-sm">
                        Our <span className="text-[#d67b27]">Collection</span>
                    </h1>

                    <p className="text-stone-500 font-medium text-base sm:text-lg">
                        Handcrafted sweets, baked fresh daily.
                    </p>

                    <div className="w-16 h-1 bg-[#d67b27] mx-auto rounded-full mt-4" />
                </header>

                {/* Search */}
                <div className="mb-8 space-y-4">
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
                            type="button"
                            aria-label="Search products"
                            onClick={() => setCurrentPage(1)}
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

                    {searchQuery.trim() && (
                        <div className="text-sm text-stone-500 px-1">
                            Search results for{" "}
                            <span className="text-[#d67b27] font-semibold italic">
                                &apos;{searchQuery.trim()}&apos;
                            </span>
                        </div>
                    )}

                    {/* Category filters */}
                    {categories.length > 0 && (
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                            <button
                                type="button"
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
                                    type="button"
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

                    {/* Sorting and result count */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3">
                        <p className="text-sm text-stone-500">
                            Showing{" "}
                            <span className="font-bold text-[#844414]">
                                {filteredAndSortedProducts.length === 0
                                    ? 0
                                    : startIndex + 1}
                                {"–"}
                                {Math.min(
                                    startIndex + PRODUCTS_PER_PAGE,
                                    filteredAndSortedProducts.length
                                )}
                            </span>{" "}
                            of{" "}
                            <span className="font-bold text-[#844414]">
                                {filteredAndSortedProducts.length}
                            </span>{" "}
                            products
                        </p>

                        <div className="flex items-center gap-3">
                            <label
                                htmlFor="product-sort"
                                className="text-sm font-semibold text-stone-600 whitespace-nowrap"
                            >
                                Sort by
                            </label>

                            <select
                                id="product-sort"
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="w-full sm:w-auto min-w-0 border border-[#e8ddd0] rounded-xl bg-white px-4 py-2.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#d67b27]"
                            >
                                <option value="name_asc">Name: A–Z</option>
                                <option value="name_desc">Name: Z–A</option>
                                <option value="rating_desc">Highest rated</option>
                                <option value="price_asc">Price: Low to high</option>
                                <option value="price_desc">Price: High to low</option>
                                <option value="reviews_desc">Most reviewed</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Products grid */}
                <div className="w-full">
                    {paginatedProducts.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 xl:gap-8">
                            {paginatedProducts.map((product) => (
                                <ProductCard
                                    key={product.id}
                                    product={product}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center bg-white border border-[#f3e1c6] rounded-3xl shadow-sm max-w-md mx-auto px-8 py-12">
                            <span className="text-6xl block mb-4">
                                🍰
                            </span>

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
                                    type="button"
                                    onClick={clearFilters}
                                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-[#d67b27] hover:text-[#b56219] transition-colors duration-200"
                                >
                                    Clear filters
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <nav
                        aria-label="Product pagination"
                        className="flex flex-wrap justify-center items-center gap-2 mt-12"
                    >
                        <button
                            type="button"
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="px-4 py-2.5 rounded-xl border border-[#e8ddd0] bg-white text-sm font-bold text-[#844414] hover:border-[#d67b27] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Previous
                        </button>

                        {Array.from(
                            { length: totalPages },
                            (_, index) => index + 1
                        ).map((page) => (
                            <button
                                key={page}
                                type="button"
                                onClick={() => goToPage(page)}
                                aria-label={`Go to page ${page}`}
                                aria-current={
                                    currentPage === page ? "page" : undefined
                                }
                                className={`min-w-10 px-3 py-2.5 rounded-xl border text-sm font-bold transition-colors ${currentPage === page
                                        ? "bg-[#d67b27] text-white border-[#d67b27]"
                                        : "bg-white text-[#844414] border-[#e8ddd0] hover:border-[#d67b27]"
                                    }`}
                            >
                                {page}
                            </button>
                        ))}

                        <button
                            type="button"
                            onClick={() => goToPage(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="px-4 py-2.5 rounded-xl border border-[#e8ddd0] bg-white text-sm font-bold text-[#844414] hover:border-[#d67b27] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Next
                        </button>
                    </nav>
                )}
            </div>
        </div>
    );
}

export default ProductList;
