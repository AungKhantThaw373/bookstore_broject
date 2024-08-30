const express = require('express');
const app = express();
const cors = require('cors');
const bodyParser = require('body-parser');
const pgp = require('pg-promise')();
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});


const db = pgp('postgres://postgres:death373@localhost:5432/bookstore');
app.use(cors());
app.use(bodyParser.json());

// Get all books
app.get('/api/books', async (req, res) => {
    try {
        const books = await db.any('SELECT * FROM books');
        res.json(books);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get book by ID
app.get('/api/books/:isbn', async (req, res) => {
    const { isbn } = req.params;
    try {
        const book = await db.one('SELECT * FROM books WHERE isbn = $1', [isbn]);
        res.json(book);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Add a new book
app.post('/api/books', async (req, res) => {
    const { isbn, title, author, genre, price } = req.body;
    try {
        const newBook = await db.one(
            'INSERT INTO books (isbn, title, author, genre, price) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [isbn, title, author, genre, price]
        );
        res.status(201).json(newBook);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Update an existing book
app.put('/api/books/:id', async (req, res) => {
    const { id } = req.params;
    const { title, author, genre, price } = req.body;
    try {
        const updatedBook = await db.one(
            'UPDATE books SET title = $1, author = $2, genre = $3, price = $4 WHERE id = $5 RETURNING *',
            [title, author, genre, price, id]
        );
        res.json(updatedBook);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a book
app.delete('/api/books/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.none('DELETE FROM books WHERE id = $1', [id]);
        res.sendStatus(204);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cart operations
let cart = [];
app.post('/api/cart', (req, res) => {
    const { bookId, quantity } = req.body;
    const book = cart.find((item) => item.bookId === bookId);
    if (book) {
        book.quantity += quantity;
    } else {
        cart.push({ bookId, quantity });
    }
    res.json(cart);
});

app.get('/api/cart', (req, res) => {
    res.json(cart);
});

app.post('/api/order', async (req, res) => {
    const { userId } = req.body; // Assuming user is logged in
    const total = cart.reduce((acc, item) => acc + item.quantity * item.price, 0);

    try {
        const order = await db.one(
            'INSERT INTO orders (user_id, total) VALUES ($1, $2) RETURNING *',
            [userId, total]
        );

        // Clear cart after placing an order
        cart = [];

        res.status(201).json(order);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Search books
app.get('/api/search', async (req, res) => {
    const { query } = req.query;
    try {
        const books = await db.any(
            'SELECT * FROM books WHERE title ILIKE $1 OR author ILIKE $1 OR genre ILIKE $1',
            [`%${query}%`]
        );
        res.json(books);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Filter books
app.get('/api/filter', async (req, res) => {
    const { minPrice, maxPrice, genre } = req.query;
    try {
        const books = await db.any(
            'SELECT * FROM books WHERE genre = $1 AND price BETWEEN $2 AND $3',
            [genre, minPrice, maxPrice]
        );
        res.json(books);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

