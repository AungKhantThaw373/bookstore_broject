document.addEventListener('DOMContentLoaded', () => {
    // Fetch and display books
    fetchBooks();

    // Handle form submission
    const form = document.getElementById('add-book-form');
    form.addEventListener('submit', (event) => {
        event.preventDefault(); // Prevent default form submission

        const formData = new FormData(form);
        const bookData = {
            isbn: formData.get('isbn'),
            title: formData.get('title'),
            author: formData.get('author'),
            genre: formData.get('genre'),
            price: parseFloat(formData.get('price')),
        };

        addBook(bookData);
    });
});

// Function to fetch and display books
function fetchBooks() {
    fetch('http://localhost:3000/api/books')
        .then(response => response.json())
        .then(data => {
            const bookList = document.getElementById('book-list');
            bookList.innerHTML = ''; // Clear existing list
            data.forEach(book => {
                const bookItem = document.createElement('div');
                bookItem.textContent = `${book.title} by ${book.author}`;
                bookList.appendChild(bookItem);
            });
        })
        .catch(error => {
            console.error('Error fetching books:', error);
        });
}

// Function to add a new book
function addBook(bookData) {
    fetch('http://localhost:3000/api/books', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(bookData),
    })
        .then(response => response.json())
        .then(data => {
            console.log('Book added:', data);
            // Fetch and display updated list of books
            fetchBooks();
            // Reset the form
            document.getElementById('add-book-form').reset();
        })
        .catch(error => {
            console.error('Error adding book:', error);
        });
}
