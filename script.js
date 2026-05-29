
// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = '/api';

    // --- 4. Buy Page: Show Products ---
    if (window.location.pathname.endsWith('buy.html')) {
        const productList = document.getElementById('product-list');
        const errorBox = document.getElementById('product-error');
        if (productList) {
            fetch(`${API_BASE_URL}/products`)
                .then((response) => response.text().then(t => { try { return t ? JSON.parse(t) : {}; } catch(e){ return {}; } }))
                .then((data) => {
                    const products = Array.isArray(data.products) ? data.products : [];
                    if (products.length === 0) {
                        errorBox.textContent = 'No products available.';
                        errorBox.classList.remove('d-none');
                        return;
                    }
                    products.forEach(product => {
                        const col = document.createElement('div');
                        col.className = 'col-md-4';
                        col.innerHTML = `
                            <div class="card h-100 shadow-sm">
                                <img src="${product.media_url || product.image_url || 'https://via.placeholder.com/300x200?text=No+Image'}" class="card-img-top" alt="${product.product_name || 'Product'}" onerror="this.src='https://via.placeholder.com/300x200?text=No+Image'">
                                <div class="card-body">
                                    <h5 class="card-title">${product.product_name || 'Product'}</h5>
                                    <div class="fw-bold text-success mb-2">$${product.price || 0}</div>
                                    <button class="btn btn-navy w-100" disabled>Buy Now</button>
                                </div>
                            </div>
                        `;
                        productList.appendChild(col);
                    });
                })
                .catch((err) => {
                    console.error('Failed to load products', err);
                    errorBox.textContent = 'Failed to load products.';
                    errorBox.classList.remove('d-none');
                });
        }
    }

    // --- 5. Sell Page: Show Upload Form for Authorized Users ---
    if (window.location.pathname.endsWith('sell.html')) {
        const sellFormContainer = document.getElementById('sell-form-container');
        const errorBox = document.getElementById('sell-error');
        // Simple demo: Only allow if logged in as admin (simulate with sessionStorage)
        const isAuthorized = sessionStorage.getItem('isAdmin') === 'true';
        if (sellFormContainer) {
            if (isAuthorized) {
                sellFormContainer.innerHTML = `
                    <form id="sellForm" enctype="multipart/form-data" class="border p-4 rounded-3 bg-light shadow-sm">
                        <div class="mb-3">
                            <label class="form-label">Product Name</label>
                            <input type="text" class="form-control" id="productName" required>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Description</label>
                            <textarea class="form-control" id="productDesc" rows="2" required></textarea>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Price ($)</label>
                            <input type="number" class="form-control" id="productPrice" min="0" required>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Image</label>
                            <input type="file" class="form-control" id="productImage" accept="image/*" required>
                        </div>
                        <button type="submit" class="btn btn-navy w-100">Upload Product</button>
                    </form>
                `;
                const sellForm = document.getElementById('sellForm');
                sellForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const productName = document.getElementById('productName').value;
                    const productPrice = document.getElementById('productPrice').value;
                    const productImage = document.getElementById('productImage').files[0];

                    const formData = new FormData();
                    formData.append('product_name', productName);
                    formData.append('price', productPrice);
                    if (productImage) {
                        formData.append('image', productImage);
                    }

                    try {
                        const response = await fetch(`${API_BASE_URL}/products`, {
                            method: 'POST',
                            body: formData
                        });
                        const text = await response.text();
                        const result = (function(){ try { return text ? JSON.parse(text) : {}; } catch(e){ return {}; } })();
                        if (!response.ok || !result.success) {
                            throw new Error(result.message || 'Upload failed');
                        }
                        alert('Product uploaded successfully!');
                        sellForm.reset();
                    } catch (err) {
                        console.error('Product upload failed:', err);
                        alert('Product upload failed. Please try again.');
                    }
                });
            } else {
                sellFormContainer.innerHTML = '<div class="alert alert-warning">You must be an authorized user to upload products. Please <a href="login.html">login</a> as admin.</div>';
            }
        }
    }

    // 1. Handle Login Validation
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorBox = document.getElementById('loginError');

            // Hardcoded Academic Demo Credentials
            if (email === "admin@eco.edu" && password === "admin123") {
                sessionStorage.setItem('isAdmin', 'true');
                window.location.href = "dashboard.html";
            } else {
                sessionStorage.removeItem('isAdmin');
                errorBox.textContent = "Invalid User Credentials. Access Denied.";
                errorBox.classList.remove('d-none');
            }
        });
    }

    // 2. Dashboard Charts (Sample Data)
    const ctx = document.getElementById('trendChart');
    if (ctx) {
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'],
                datasets: [{
                    label: 'Temperature (°C)',
                    data: [36.8, 37.2, 37.8, 38.1, 37.5, 37.2],
                    borderColor: '#ef4444',
                    tension: 0.3,
                    fill: false
                }, {
                    label: 'Humidity (%)',
                    data: [58, 60, 62, 65, 63, 61],
                    borderColor: '#3b82f6',
                    tension: 0.3,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                },
                scales: {
                    y: { beginAtZero: false }
                }
            }
        });
    }

    // 3. Contact Form Submission Alert
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            alert("Thank you! Your inquiry has been logged for academic review.");
            contactForm.reset();
        });
    }
});
