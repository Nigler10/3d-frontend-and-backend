// src/components/admin/AdminProductCard.jsx
import { getAccessToken } from "../../utils/auth";
import { useNavigate } from "react-router-dom";
import "./AdminProductCard.css";

function AdminProductCard({ product }) {
    const navigate = useNavigate();
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

    return (
        <div className="admin-card">
            <div className="admin-card-image-wrapper">
                <img
                    src={`${BASEURL}${product.image}`}
                    alt={product.name}
                    className="admin-card-img"
                />
            </div>

            <div className="admin-card-content">
                <div className="admin-card-info">
                    <h2 className="admin-card-title">{product.name}</h2>
                    <p className="admin-card-price">₱{Number(product.price).toLocaleString()}</p>
                </div>
                
                <p className="admin-card-desc">
                    {product.description.length > 60
                        ? product.description.slice(0, 60) + "..."
                        : product.description}
                </p>

                <div className="admin-card-actions">
                    <button
                        onClick={() => navigate(`/admin/products/${product.id}/edit`)}
                        className="btn-admin-edit"
                    >
                        Edit Item
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AdminProductCard;