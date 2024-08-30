document.addEventListener('DOMContentLoaded', () => {
    const cartItems = document.getElementById('cart-items');

    fetch('/api/cart')
        .then(response => response.json())
        .then(cart => {
            cart.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'cart-item';
                itemDiv.innerHTML = `
            <p><strong>Book ID:</strong> ${item.bookId}</p>
            <p><strong>Quantity:</strong> ${item.quantity}</p>
            <p><strong>Price:</strong> $${item.price}</p>
          `;
                cartItems.appendChild(itemDiv);
            });
        });

    document.getElementById('checkout').addEventListener('click', () => {
        fetch('/api/order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: 1 }) // Replace with actual user ID
        })
            .then(response => response.json())
            .then(order => {
                console.log('Order placed:', order);
                window.location.href = 'index.html'; // Redirect to home page
            });
    });
});
