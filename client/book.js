document.addEventListener('DOMContentLoaded', () => {
    const booksList = document.getElementById('books-list');

    fetch('/api/books')
        .then(response => response.json())
        .then(books => {
            books.forEach(book => {
                const bookDiv = document.createElement('div');
                bookDiv.className = 'book';
                bookDiv.innerHTML = `
            <h3>${book.title}</h3>
            <p><strong>Author:</strong> ${book.author}</p>
            <p><strong>Genre:</strong> ${book.genre}</p>
            <p><strong>Price:</strong> $${book.price}</p>
            <button onclick="addToCart(${book.id}, ${book.price})">Add to Cart</button>
          `;
                booksList.appendChild(bookDiv);
            });
        });
});

function addToCart(bookId, price) {
    fetch('/api/cart', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ bookId, quantity: 1 })
    })
        .then(response => response.json())
        .then(data => {
            console.log('Book added to cart:', data);
        });
}
